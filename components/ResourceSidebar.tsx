"use client";

// Ported from jaladedev/school_app's components/ResourceSidebar.tsx
// (SHA 466c538). Only change: deleteTopicResource now imports from
// lib/actions/resources (this app's split-out file) instead of
// lib/actions/teacher.


import { useRef, useState, useTransition, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { deleteTopicResource } from "@/lib/actions/resources";
import { emitToast } from "@/lib/toast";
import type { TopicResource } from "@/types/database";
import type { NoteEditorHandle } from "@/components/NoteEditor";

const RESOURCE_TYPE_LABEL: Record<TopicResource["resource_type"], string> = {
  image: "Image",
  pdf: "PDF",
  audio: "Audio",
  video: "Video",
  diagram_mermaid: "Diagram",
  link: "Link",
};

const RESOURCE_TYPE_ICON: Record<TopicResource["resource_type"], string> = {
  image: "🖼️",
  pdf: "📄",
  audio: "🎵",
  video: "🎬",
  diagram_mermaid: "📊",
  link: "🔗",
};

const ACCEPTED_FILE_TYPES =
  "image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm";

/**
 * Persistent sidebar replacement for the old below-the-editor
 * TopicResourceUpload + TopicResourceList pairing (#33). Ties directly
 * into the editor via `editorRef` (NoteEditorHandle, exposed by
 * NoteEditor through forwardRef/useImperativeHandle) so:
 *  - clicking a resource inserts it at the current cursor position in one
 *    click, instead of having to open the in-toolbar "Insert resource"
 *    dropdown, and
 *  - dropping/picking a new file uploads *and* inserts it, reusing
 *    NoteEditor's own `uploadDroppedFiles` (note-creation-safe, same
 *    pipeline the editor's own drag-and-drop already uses) rather than
 *    duplicating that logic here.
 *
 * `resources` is expected to be the live, session-merged list (passed
 * down from NoteWorkspace's `onResourcesChange` callback), not just the
 * server-fetched prop -- so a resource created this session (e.g. a
 * Mermaid diagram, or a file dropped straight onto the editor) shows up
 * here immediately without a page reload.
 */
export function ResourceSidebar({
  resources,
  editorRef,
}: {
  resources: TopicResource[];
  editorRef: RefObject<NoteEditorHandle | null>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dragDepthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleInsert(resource: TopicResource) {
    editorRef.current?.insertResource(resource);
  }

  function handleDelete(resourceId: string) {
    startTransition(async () => {
      try {
        await deleteTopicResource(resourceId);
        emitToast("Resource removed.");
        router.refresh();
      } catch (err: any) {
        emitToast(err.message ?? "Could not remove the resource.", "error");
      } finally {
        setConfirmingId(null);
      }
    });
  }

  async function handleFiles(files: File[]) {
    if (!files.length || !editorRef.current) return;
    setIsUploading(true);
    try {
      await editorRef.current.uploadFiles(files);
    } finally {
      setIsUploading(false);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  }
  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  }
  function handleDrop(e: React.DragEvent) {
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    void handleFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <aside className="w-full shrink-0 rounded-xl border border-rule bg-white p-3 lg:w-72">
      <h2 className="font-display text-sm font-semibold text-ink">Resources</h2>
      <p className="mt-1 text-xs text-ink-soft">Click to insert at the cursor.</p>

      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`mt-3 flex flex-col items-center gap-1 rounded-lg border-2 border-dashed px-3 py-3 text-center text-xs ${
          isDraggingFile ? "border-leaf bg-leaf-soft" : "border-rule text-ink-soft"
        }`}
      >
        <span>Drag a file here, or</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="rounded-lg border border-leaf px-2 py-1 text-xs font-medium text-leaf hover:bg-leaf-soft disabled:opacity-60"
        >
          {isUploading ? "Uploading…" : "Choose file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void handleFiles(files);
          }}
        />
      </div>

      {resources.length === 0 ? (
        <p className="mt-3 text-xs text-ink-soft">
          No resources attached yet. Upload one above, or use &quot;Generate Mermaid diagram&quot;
          in the toolbar.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {resources.map((resource) => (
            <li
              key={resource.id}
              className="rounded-lg border border-rule px-2 py-1.5 text-xs hover:border-leaf"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleInsert(resource)}
                  title="Insert at cursor"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink"
                >
                  <span aria-hidden="true">{RESOURCE_TYPE_ICON[resource.resource_type]}</span>
                  <span className="truncate">{resource.title ?? "Untitled"}</span>
                </button>
                {confirmingId === resource.id ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={isPending}
                      className="text-ink-soft hover:underline disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(resource.id)}
                      disabled={isPending}
                      className="rounded bg-clay px-1.5 py-0.5 font-medium text-white hover:bg-clay/90 disabled:opacity-60"
                    >
                      {isPending ? "…" : "Remove"}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(resource.id)}
                    disabled={isPending}
                    title="Remove resource"
                    className="shrink-0 text-ink-soft hover:text-clay disabled:opacity-60"
                  >
                    ✕
                  </button>
                )}
              </div>
              <span className="mt-0.5 inline-block rounded-full bg-leaf-soft px-1.5 py-0.5 text-[10px] font-medium text-leaf">
                {RESOURCE_TYPE_LABEL[resource.resource_type]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
