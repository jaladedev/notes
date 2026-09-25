/**
 * ResourceChip — a TipTap inline atom node that stands in for the
 * `[[resource:UUID]]` markers the app already stores in markdown.
 *
 * Why an inline atom node instead of, say, a plain text token:
 * - It renders as a real chip (icon + title) in the WYSIWYG surface,
 *   which is the whole point of this migration (#6 on the to-do).
 * - "Atom" means TipTap treats it as a single indivisible unit — a
 *   teacher can't accidentally type inside the middle of a UUID and
 *   corrupt the marker, and backspace deletes the whole chip in one go.
 * - It round-trips to/from the exact same `[[resource:UUID]]` text via
 *   the markdown serializer below, so `saveTopicNote` and every existing
 *   reader (TopicContent.tsx, notifications, etc.) keeps working
 *   unmodified. No DB or backend changes needed for this piece.
 *
 * Resource metadata (title, type, icon) is NOT stored on the node --
 * only the id is. The node looks up the live resource from the
 * `resourceMap` passed in via editor storage (see NoteEditor.tsx), the
 * same way the old textarea version resolved markers against `resources`
 * for the chip strip. This means a rename/delete elsewhere is reflected
 * next render without re-serializing the doc.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clampPopoverToEditor } from "./popover-position";
import { TopicResourceItem } from "@/components/TopicContent";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { emitToast } from "@/lib/toast";
import type { TopicResource } from "@/types/database";
import { dragAwareStopEvent } from "./drag-utils";

export const RESOURCE_TYPE_ICON: Record<TopicResource["resource_type"], string> = {
  image: "🖼️",
  diagram_mermaid: "📊",
  video: "🎬",
  pdf: "📄",
  link: "🔗",
  audio: "🎧",
};

// Markers are `[[resource:UUID]]` by default, same as before. Images can
// optionally carry a `#size-align` suffix -- e.g. `[[resource:UUID#full]]`
// or `[[resource:UUID#small-right]]` -- added by the resize/alignment
// controls below. The suffix is optional and ignored for non-image
// resource types, so every marker written before this feature existed
// still parses exactly as it did.
const RESOURCE_MARKER_RE = /\[\[resource:([0-9a-fA-F-]{36})(?:#([a-z]+)(?:-([a-z]+))?)?\]\]/;

export type ImageSize = "small" | "medium" | "full";
export type ImageAlign = "left" | "center" | "right";

interface ResourceChipStorage {
  resources: TopicResource[];
  onRemove?: (id: string) => void;
  onResourceUpdated?: (resource: TopicResource) => void;
}

// tiptap-markdown's Markdown extension augments core Storage with a
// `markdown` key; ResourceChip augments it with `resourceChip`. Declaring
// this here (instead of casting at every call site) keeps
// `editor.storage.resourceChip` type-checked the same way
// `editor.storage.markdown` already is.
declare module "@tiptap/core" {
  interface Storage {
    resourceChip: ResourceChipStorage;
  }
}

// Drag-to-reorder (#6 of the to-do) used to be a custom, resourceChip-
// specific system: a bespoke `RESOURCE_CHIP_DRAG_MIME` dataTransfer type,
// with matching onDragStart/onDragOver/onDrop pairs hand-wired onto every
// chip NodeView, and `moveResourceChip` doing the delete-at-source +
// insert-at-target math by hand. It worked reliably in isolation --
// tests/resource-chip-reorder.test.ts still passes, since that math was
// never wrong -- but it only worked as a drop target when dropped
// directly onto *another* resource chip, because that pairing was the
// only place the matching onDragOver/onDrop existed. Once Section (#10)
// started occupying most of the document with its own, unrelated native
// `draggable: true` node dragging, that became a real dead zone: dragging
// a resource chip toward/into a section, or a section past a resource
// a real dead zone: dragging a resource chip toward/into a section, or a
// section past a resource chip, had no shared drop-target logic between
// the two systems, so nothing happened.
//
// Fixed by dropping the custom system entirely and using the exact same
// mechanism Section already uses -- ProseMirror's own native node
// dragging (`draggable: true` on the node spec + arming native HTML5
// drag only while the handle is held, the same `dragArmed` pattern seen
// in section-node.tsx). Native PM dragging computes valid drop positions
// anywhere in the document on its own, so it needs no per-node-type
// onDragOver/onDrop pairing at all -- and because Section, ResourceChip,
// and Callout (see callout-node.tsx) all now go through that one
// mechanism, dragging any of them near/into/past any of the others just
// works, with no cross-system gaps.

function ResourceChipView({
  node,
  editor,
  deleteNode,
  getPos,
}: {
  node: any;
  editor: any;
  deleteNode: () => void;
  getPos: () => number | undefined;
}) {
  const id: string = node.attrs.id;
  const storage: ResourceChipStorage = editor.storage.resourceChip ?? { resources: [] };
  const resource = storage.resources.find((r) => r.id === id) ?? null;

  if (resource?.resource_type === "diagram_mermaid") {
    return (
      <MermaidNodeView
        resource={resource}
        deleteNode={deleteNode}
        editor={editor}
        getPos={getPos}
      />
    );
  }

  if (resource?.resource_type === "image") {
    return (
      <ImageNodeView
        node={node}
        resource={resource}
        deleteNode={deleteNode}
        editor={editor}
        getPos={getPos}
      />
    );
  }

  return (
    <ResourceChipDefaultView
      id={id}
      resource={resource}
      deleteNode={deleteNode}
      editor={editor}
      getPos={getPos}
    />
  );
}

// Mermaid diagrams get their own inline rendering instead of hiding
// behind a click-to-preview chip -- this is the "NodeView wrapping
// MermaidDiagram directly in the doc" piece flagged as not-yet-shipped
// in #0/#18 of the to-do. The node itself is still schema-`inline`
// (see ResourceChip.group below) so no new markdown grammar or DB
// round-trip is needed -- `as="div"` just makes it lay out visually as
// a full-width block within its paragraph, the same trick most rich
// text editors use for "atom" images.
function MermaidNodeView({
  resource,
  deleteNode,
  editor,
  getPos,
}: {
  resource: TopicResource;
  deleteNode: () => void;
  editor: any;
  getPos: () => number | undefined;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(resource.title ?? "");
  const [code, setCode] = useState(resource.content ?? "");
  const [isSaving, setIsSaving] = useState(false);
  // Armed only while the drag handle is held down -- keeps native HTML5
  // drag scoped to the handle instead of the whole node (clicking a
  // button or selecting the diagram title must not start a drag). Same
  // pattern as section-node.tsx's SectionView.
  const [dragArmed, setDragArmed] = useState(false);

  function startEditing() {
    setTitle(resource.title ?? "");
    setCode(resource.content ?? "");
    setEditing(true);
  }

  async function handleSave() {
    if (!code.trim()) {
      emitToast("Write some Mermaid code before saving.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const { updateMermaidResource } = await import("@/lib/actions/resources");
      const updated = await updateMermaidResource(resource.id, title, code);
      const storage: ResourceChipStorage = editor.storage.resourceChip ?? { resources: [] };
      storage.onResourceUpdated?.(updated);
      emitToast("Diagram updated.");
      setEditing(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to update the diagram.";
      emitToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  }

  if (editing) {
    return (
      <NodeViewWrapper
        as="div"
        className="my-3 rounded-xl border border-marigold bg-white p-4"
        contentEditable={false}
        // `contentEditable={false}` alone stops PM from treating this
        // as editable text, but it does NOT stop ProseMirror's own
        // view-level mousedown/click handling from seeing the event --
        // this node is an *atom* (no contentDOM at all), so PM assumes
        // nothing inside it is genuinely interactive, and resolves any
        // click landing anywhere in its DOM to "click on this atom",
        // setting a NodeSelection over the whole node. Our `stopEvent`
        // (see dragAwareStopEvent) only governs how *this* NodeView
        // reacts after that has already happened -- it can't undo the
        // selection PM already set. The actual fix is to stop the
        // mousedown from ever bubbling up to PM's view in the first
        // place, so it never gets a chance to resolve a selection here.
        // Without this, clicking into the code textarea (or the title
        // input) painted the atom's `.ProseMirror-selectednode`
        // highlight and could knock the component back out of its
        // editing render.
        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        // The far more serious half of the same gap: `contentEditable`
        // only affects the *browser's* native rich-editing, not DOM
        // event bubbling -- a keydown fired while typing in the
        // textarea below still bubbles straight up through this div to
        // ProseMirror's own view-level key handler, same as any other
        // DOM event. If PM's selection was still resting on this atom
        // (a NodeSelection covering the whole node, from a click that
        // landed on it before -- e.g. the "Edit" button itself, which
        // sits outside this guard), PM's key handler treats a printable
        // keystroke as "replace the current selection with this
        // character," deleting the whole diagram node from the actual
        // document and replacing it with a single character of plain
        // text. That's real data loss in the saved note, not just a
        // rendering glitch -- this typed character never touches
        // ProseMirror's document at all when it's meant for our own
        // plain `code`/`title` React state.
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        <input
          type="text"
          onMouseDownCapture={(e) => e.stopPropagation()}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Diagram title (optional)"
          className="mb-2 w-full rounded-lg border border-rule bg-white p-2 text-sm text-ink outline-none focus-visible:border-marigold"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
              Mermaid code
            </p>
            <textarea
              onMouseDownCapture={(e) => e.stopPropagation()}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-rule bg-white p-3 font-mono text-sm text-ink outline-none focus-visible:border-marigold"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
              Preview
            </p>
            <div className="h-full min-h-[8rem] rounded-lg border border-rule bg-paper p-2">
              <MermaidDiagram code={code} title={title || undefined} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={isSaving}
            className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink hover:bg-paper disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="div"
      className="group relative my-3"
      contentEditable={false}
      draggable={dragArmed}
      onDragEnd={() => setDragArmed(false)}
    >
      <div
        onMouseDown={() => setDragArmed(true)}
        onMouseUp={() => setDragArmed(false)}
        title="Drag to reorder (or select it and press Alt+Left/Right)"
        aria-label="Drag to reorder this resource, or select it and press Alt+Left or Alt+Right"
        role="button"
        data-drag-handle
        className="absolute -left-6 top-2 hidden h-6 w-6 cursor-grab items-center justify-center rounded text-ink-soft hover:bg-paper active:cursor-grabbing group-hover:flex"
      >
        ⠿
      </div>
      <TopicResourceItem resource={resource} />

      <div className="absolute right-2 top-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        {confirmingRemove ? (
          <div className="flex items-center gap-2 rounded-md border border-clay/40 bg-white p-1.5 shadow">
            <span className="text-xs text-clay">Remove diagram?</span>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="text-xs text-ink-soft hover:underline"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteNode()}
              className="rounded bg-clay px-2 py-1 text-xs font-medium text-white hover:bg-clay/90"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={startEditing}
              title="Edit this diagram's code"
              aria-label="Edit this diagram's code"
              className="rounded-full border border-rule bg-white px-2 py-1 text-xs text-ink shadow hover:border-marigold"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              title="Remove diagram from note"
              aria-label="Remove diagram from note"
              className="rounded-full border border-rule bg-white px-2 py-1 text-xs text-clay shadow hover:border-clay/40"
            >
              Remove
            </button>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function setResourceChipAttrs(
  editor: any,
  pos: number | undefined,
  attrs: Partial<{ size: ImageSize; align: ImageAlign }>
) {
  if (pos === undefined) return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "resourceChip") return;
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
  editor.view.dispatch(tr);
}

const IMAGE_SIZES: { value: ImageSize; label: string }[] = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "full", label: "Full" },
];
const IMAGE_ALIGNS: { value: ImageAlign; label: string }[] = [
  { value: "left", label: "⇤" },
  { value: "center", label: "↔" },
  { value: "right", label: "⇥" },
];

// Images get their own inline rendering too (same reasoning as
// MermaidNodeView above) instead of the generic click-to-preview pill --
// that's the core of #5 on the to-do (an image dropped into a note
// should be visible immediately, not hidden behind a click). Reuses
// TopicResourceItem, the same component the published/student-facing
// view (TopicContent.tsx) renders images with, so what a teacher sees
// while editing is pixel-for-pixel what a student later sees reading it
// -- including the size/align choice made here, since both this node's
// markdown serializer and TopicContent's marker regex understand the
// same `#size-align` suffix (see resourceMarkdownPlugin below and
// components/TopicContent.tsx).
function ImageNodeView({
  node,
  resource,
  deleteNode,
  editor,
  getPos,
}: {
  node: any;
  resource: TopicResource;
  deleteNode: () => void;
  editor: any;
  getPos: () => number | undefined;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [dragArmed, setDragArmed] = useState(false);
  const size: ImageSize = node.attrs.size ?? "medium";
  const align: ImageAlign = node.attrs.align ?? "left";

  return (
    <NodeViewWrapper
      as="div"
      className="group relative my-2"
      contentEditable={false}
      draggable={dragArmed}
      onDragEnd={() => setDragArmed(false)}
    >
      <div
        contentEditable={false}
        className="pointer-events-none absolute -top-3 left-0 right-0 z-10 flex items-center justify-between gap-2 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <span
          onMouseDown={() => setDragArmed(true)}
          onMouseUp={() => setDragArmed(false)}
          title="Drag to reorder (or select it and press Alt+Left/Right)"
          aria-label="Drag to reorder this resource, or select it and press Alt+Left or Alt+Right"
          role="button"
          data-drag-handle
          className="pointer-events-auto ml-1 inline-flex cursor-grab select-none items-center rounded-full border border-rule bg-white px-1.5 py-0.5 text-xs text-ink-soft shadow active:cursor-grabbing"
        >
          ⠿
        </span>
        <span className="pointer-events-auto flex items-center gap-1 rounded-full border border-rule bg-white px-1 py-0.5 text-xs shadow">
          {IMAGE_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              title={`Size: ${s.value}`}
              onClick={() => setResourceChipAttrs(editor, getPos(), { size: s.value })}
              className={`rounded px-1.5 py-0.5 ${size === s.value ? "bg-marigold/40 font-semibold" : "hover:bg-paper"}`}
            >
              {s.label}
            </button>
          ))}
          <span className="mx-0.5 h-3 w-px bg-rule" />
          {IMAGE_ALIGNS.map((a) => (
            <button
              key={a.value}
              type="button"
              title={`Align: ${a.value}`}
              onClick={() => setResourceChipAttrs(editor, getPos(), { align: a.value })}
              className={`rounded px-1.5 py-0.5 ${align === a.value ? "bg-marigold/40 font-semibold" : "hover:bg-paper"}`}
            >
              {a.label}
            </button>
          ))}
          {confirmingRemove ? (
            <>
              <span className="mx-0.5 h-3 w-px bg-rule" />
              <button
                type="button"
                onClick={() => deleteNode()}
                className="rounded px-1.5 py-0.5 font-medium text-clay hover:bg-clay/10"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                className="rounded px-1.5 py-0.5 text-ink-soft hover:bg-paper"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <span className="mx-0.5 h-3 w-px bg-rule" />
              <button
                type="button"
                title="Remove from note"
                aria-label="Remove from note"
                onClick={() => setConfirmingRemove(true)}
                className="rounded px-1.5 py-0.5 text-clay hover:bg-clay/10"
              >
                🗑
              </button>
            </>
          )}
        </span>
      </div>
      <TopicResourceItem resource={resource} size={size} align={align} />
    </NodeViewWrapper>
  );
}

function ResourceChipDefaultView({
  id,
  resource,
  deleteNode,
  editor,
  getPos,
}: {
  id: string;
  resource: TopicResource | null;
  deleteNode: () => void;
  editor: any;
  getPos: () => number | undefined;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(resource?.title ?? "");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);
  const [dragArmed, setDragArmed] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);

  // Closes the popover on an outside click, matching the "Insert resource"
  // dropdown's behavior. Previously this only closed via the toggle button
  // or the explicit "Close" link, so a teacher clicking elsewhere in the
  // note left it open indefinitely -- easy to miss with several resource
  // chips in one note, each tracking its own open/close state.
  useEffect(() => {
    if (!previewOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as globalThis.Node)) {
        closePopover();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen]);

  // This popover floats out of the text flow (absolute-positioned, fixed
  // 28rem width) -- a chip near the editor's right edge would otherwise
  // render the popover past that edge (max-w-[90vw] alone doesn't help:
  // it measures the browser viewport, not the usually-narrower editor
  // column). Re-clamp whenever the popover's own content/size changes
  // (editing vs. viewing, remove-confirmation), same reasoning as math's
  // per-keystroke re-clamp in math-nodes.tsx.
  useLayoutEffect(() => {
    if (previewOpen && popoverRef.current) {
      clampPopoverToEditor(popoverRef.current, editor?.view?.dom ?? null);
    }
  }, [previewOpen, editing, confirmingRemove, editor]);

  function closePopover() {
    setPreviewOpen(false);
    setConfirmingRemove(false);
    setEditing(false);
    setReplaceFile(null);
  }

  function startEditing() {
    setEditTitle(resource?.title ?? "");
    setReplaceFile(null);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!resource) return;
    const formData = new FormData();
    formData.set("title", editTitle);
    if (replaceFile) formData.set("file", replaceFile);
    setIsSaving(true);
    try {
      const { updateTopicResource } = await import("@/lib/actions/resources");
      const updated = await updateTopicResource(resource.id, formData);
      const storage: ResourceChipStorage = editor.storage.resourceChip ?? { resources: [] };
      storage.onResourceUpdated?.(updated);
      emitToast(replaceFile ? "Resource replaced." : "Resource renamed.");
      setEditing(false);
      setReplaceFile(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to update the resource.";
      emitToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  }

  // Re-fetches title/description/thumbnail from the stored URL --
  // separate from handleSaveEdit/updateTopicResource since this
  // updates fields (description, og:image) that the generic edit form
  // never touches (see refreshLinkPreview's doc comment for why the
  // auto-fetched preview can go stale or fetch wrong the first time).
  async function handleRefreshPreview() {
    if (!resource) return;
    setIsRefreshingPreview(true);
    try {
      const { refreshLinkPreview } = await import("@/lib/actions/resources");
      const updated = await refreshLinkPreview(resource.id);
      const storage: ResourceChipStorage = editor.storage.resourceChip ?? { resources: [] };
      storage.onResourceUpdated?.(updated);
      setEditTitle(updated.title ?? "");
      emitToast("Preview refreshed.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to refresh the preview.";
      emitToast(message, "error");
    } finally {
      setIsRefreshingPreview(false);
    }
  }

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapperRef}
      className="relative inline-flex items-center align-middle"
      contentEditable={false}
      draggable={dragArmed}
      onDragEnd={() => setDragArmed(false)}
    >
      <span
        onMouseDown={() => setDragArmed(true)}
        onMouseUp={() => setDragArmed(false)}
        contentEditable={false}
        title="Drag to reorder (or select it and press Alt+Left/Right)"
        aria-label="Drag to reorder this resource, or select it and press Alt+Left or Alt+Right"
        role="button"
        data-drag-handle
        className="mr-0.5 inline-flex cursor-grab select-none items-center text-xs text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
      >
        ⠿
      </span>
      <button
        type="button"
        onClick={() => {
          setPreviewOpen((open) => !open);
          setConfirmingRemove(false);
          setEditing(false);
        }}
        className={`mx-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
          resource
            ? "border-rule bg-paper text-ink hover:border-marigold"
            : "border-clay/40 bg-clay/10 text-clay"
        }`}
        contentEditable={false}
        data-resource-id={id}
        title={resource ? "Click to preview, edit, or remove" : "This resource no longer exists"}
      >
        <span aria-hidden>{resource ? RESOURCE_TYPE_ICON[resource.resource_type] : "⚠️"}</span>
        <span className="max-w-[9rem] truncate">
          {resource ? (resource.title ?? "Untitled resource") : "Missing resource"}
        </span>
      </button>

      {previewOpen && (
        <span
          ref={popoverRef}
          contentEditable={false}
          className="absolute left-0 top-full z-20 mt-1 w-[28rem] max-w-[90vw] rounded-lg border border-rule bg-white p-4 shadow-xl"
          // See MermaidNodeView (same file) for the full explanation:
          // this atom has no contentDOM ProseMirror expects to be
          // interactive, so without this, clicking the title/replace-
          // file inputs below would bubble to PM's own view-level click
          // handling and set a NodeSelection over the whole node.
          // Scoped to just the popover, not the whole chip -- the
          // collapsed pill button (outside this span) has no real form
          // in it, and stopping propagation there too would also stop a
          // plain click on the chip from ever closing some *other*,
          // unrelated open popover (the a11y menu, etc) via their own
          // document-level outside-click listeners.
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          // The keydown half matters more: `contentEditable={false}`
          // doesn't stop DOM event bubbling, so a keystroke typed into
          // the title input still reaches PM's own view-level key
          // handler. If PM's selection is still resting on this atom
          // (a NodeSelection from a click that landed before this
          // guard existed, e.g. the pill button itself), it would
          // treat the keystroke as "replace the current selection,"
          // deleting this resource's chip from the real document and
          // replacing it with one character of plain text -- genuine
          // data loss, not just a rendering glitch.
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
          onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          {editing && resource ? (
            <span className="block">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Resource title"
                className="mb-2 block w-full rounded-lg border border-rule bg-white p-2 text-sm text-ink outline-none focus-visible:border-marigold"
              />
              {resource.resource_type !== "link" && (
                <label className="mb-1 block text-xs text-ink-soft">
                  Replace file (optional)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm"
                    onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-xs text-ink-soft"
                  />
                </label>
              )}
              {resource.resource_type === "link" && (
                <button
                  type="button"
                  onClick={handleRefreshPreview}
                  disabled={isRefreshingPreview}
                  className="mb-1 text-xs font-medium text-leaf hover:underline disabled:opacity-60"
                >
                  {isRefreshingPreview ? "Refreshing…" : "Refresh preview from URL"}
                </button>
              )}
              <span className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={isSaving}
                  className="rounded-lg border border-rule px-3 py-1.5 text-xs text-ink hover:bg-paper disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="rounded-lg bg-marigold px-3 py-1.5 text-xs font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
                >
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </span>
            </span>
          ) : resource ? (
            <span className="block max-h-[28rem] overflow-y-auto [&_figure]:my-0 [&_img]:max-h-96 [&_img]:w-full [&_img]:object-contain">
              <TopicResourceItem resource={resource} />
            </span>
          ) : (
            <span className="block text-sm text-clay">
              This resource was deleted elsewhere. Remove this marker or pick a replacement from
              &quot;Insert resource&quot;.
            </span>
          )}

          {!editing &&
            (confirmingRemove ? (
              <span className="mt-3 flex items-center justify-between gap-2 rounded-md border border-clay/40 bg-clay/10 p-2">
                <span className="text-xs text-clay">Remove this from the note?</span>
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    className="text-xs text-ink-soft hover:underline"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteNode()}
                    className="rounded bg-clay px-2 py-1 text-xs font-medium text-white hover:bg-clay/90"
                  >
                    Remove
                  </button>
                </span>
              </span>
            ) : (
              <span className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={closePopover}
                  className="text-xs text-ink-soft hover:underline"
                >
                  Close
                </button>
                <span className="flex items-center gap-3">
                  {resource && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={startEditing}
                      className="text-xs font-medium text-ink hover:underline"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(true)}
                    className="text-xs font-medium text-clay hover:underline"
                  >
                    Remove from note
                  </button>
                </span>
              </span>
            ))}
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const ResourceChip = Node.create({
  name: "resourceChip",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: null },
      size: { default: null },
      align: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-resource-id]",
        getAttrs: (el) => ({
          id: (el as HTMLElement).getAttribute("data-resource-id"),
          size: (el as HTMLElement).getAttribute("data-size") || null,
          align: (el as HTMLElement).getAttribute("data-align") || null,
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "span",
      mergeAttributes({
        "data-resource-id": node.attrs.id,
        ...(node.attrs.size ? { "data-size": node.attrs.size } : {}),
        ...(node.attrs.align ? { "data-align": node.attrs.align } : {}),
      }),
    ];
  },

  addNodeView() {
    // Without this, clicking the chip (an atom node) makes ProseMirror
    // establish its own NodeSelection over it before our onClick even
    // runs. That selection change, combined with BubbleMenu's live
    // position tracking, is the likely source of a
    // "Selection passed to setSelection must point at the current
    // document" crash when the popover opens/closes and re-renders the
    // wrapper. Returning true from stopEvent for anything originating
    // inside this node view tells ProseMirror to leave the DOM event
    // alone entirely and let React handle it instead.
    //
    // BUT: this can't be a blanket `() => true`. ProseMirror's native
    // node dragging (the same mechanism Section/Callout rely on, added
    // once ResourceChip got `draggable: true` -- see the big comment
    // above ResourceChipView) works by listening for drag/drop-family
    // events bubbling up through the view's DOM and reacting to them
    // itself. `stopEvent() === true` tells PM "this NodeView already
    // handled it, don't run your own logic" for whatever event just
    // fired -- which, for a blanket `true`, includes dragstart/
    // dragover/drop. That silently disabled the exact machinery that
    // performs the move: the chip visibly "dragged" (native HTML5 drag
    // affordances worked, TipTap's own onDragStart still fired via
    // React's synthetic events, which are unrelated to PM's stopEvent),
    // but the actual position never changed on drop, because PM's own
    // drag handling for this node's events was being told to stand down
    // by this override before it ever got the chance to run.
    return ReactNodeViewRenderer(ResourceChipView, {
      stopEvent: dragAwareStopEvent,
    });
  },

  addStorage() {
    return { resources: [] as TopicResource[] } as ResourceChipStorage;
  },

  // --- markdown round-trip -------------------------------------------
  // tiptap-markdown lets a node register serialize/parse hooks here.
  // Serialize: node -> "[[resource:ID]]" text, identical to what the old
  // textarea produced, so saveTopicNote's stored markdown is unchanged.
  addOptions() {
    return {};
  },
});

// tiptap-markdown parses via markdown-it. Register an inline rule that
// recognizes [[resource:UUID]] and turns it into a resourceChip token.
// This function is called once when building the editor's markdown
// extension (see NoteEditor.tsx) rather than living inside the Node
// definition, because markdown-it plugin registration needs the `md`
// instance, not the TipTap schema.
function resourceMarkdownPlugin(md: any) {
  md.inline.ruler.before("link", "resource_chip", (state: any, silent: boolean) => {
    const match = RESOURCE_MARKER_RE.exec(state.src.slice(state.pos));
    if (!match || match.index !== 0) return false;
    if (!silent) {
      const token = state.push("resource_chip", "", 0);
      token.attrs = [
        ["id", match[1]],
        ["size", match[2] ?? ""],
        ["align", match[3] ?? ""],
      ];
    }
    state.pos += match[0].length;
    return true;
  });

  md.renderer.rules.resource_chip = (tokens: any[], idx: number) => {
    const attrs = tokens[idx].attrs;
    const id = attrs.find((a: string[]) => a[0] === "id")[1];
    const size = attrs.find((a: string[]) => a[0] === "size")?.[1];
    const align = attrs.find((a: string[]) => a[0] === "align")?.[1];
    const sizeAttr = size ? ` data-size="${size}"` : "";
    const alignAttr = align ? ` data-align="${align}"` : "";
    return `<span data-resource-id="${id}"${sizeAttr}${alignAttr}></span>`;
  };
}

// Serializer + parser side: tiptap-markdown reads `storage.markdown` off
// each extension -- `serialize` when walking the doc back to a string on
// save, and `parse.setup(markdownit)` once when building the editor's
// markdown-it instance on mount. There's no separate global "markdownIt"
// option on the Markdown extension; per-node registration is the actual
// supported hook, so `resourceMarkdownPlugin` runs from here instead of
// being passed into `Markdown.configure()` in NoteEditor.tsx.
ResourceChip.config.addStorage = function () {
  return {
    resources: [] as TopicResource[],
    markdown: {
      serialize(state: any, node: any) {
        const suffix = node.attrs.size
          ? `#${node.attrs.size}${node.attrs.align ? `-${node.attrs.align}` : ""}`
          : "";
        state.write(`[[resource:${node.attrs.id}${suffix}]]`);
      },
      parse: {
        setup(md: any) {
          resourceMarkdownPlugin(md);
        },
      },
    },
  };
};
