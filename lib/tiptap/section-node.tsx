/**
 * Block-Based Editing.
 *
 * A `section` node wraps one heading plus every block that follows it,
 * up to (but not including) the next heading. That grouping is what
 * makes drag-to-reorder, duplicate, delete, and collapse/expand
 * possible as single operations instead of manual multi-node selection.
 *
 * Key design choice: section boundaries are fully recoverable from
 * heading positions alone, so the node needs no markdown fence syntax
 * (compare to Callout's ":::type ... :::"). `serialize()` below just
 * flattens a section back to its plain child content -- the resulting
 * markdown is indistinguishable from a doc that was never sectioned.
 * That means `saveTopicNote`, version history, the published view, and
 * presentation mode all keep working completely unchanged: sections are
 * a pure editing-time affordance, invisible in the persisted markdown.
 *
 * Because of that, sections are also not parsed *from* markdown -- there
 * is no markdown-it block rule here. Instead, `groupIntoSections()` is
 * run once after the Markdown extension parses a doc (see NoteEditor's
 * onCreate), walking the flat top-level node list and wrapping each
 * heading-to-next-heading run into a `section` node via a single
 * `addToHistory: false` transaction so it doesn't show up as an undo step.
 *
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { useState } from "react";
import { dragAwareStopEvent } from "./drag-utils";

function SectionView({
  node,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: {
  node: PMNode;
  editor: Editor;
  getPos: () => number | undefined;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
}) {
  const collapsed = Boolean(node.attrs.collapsed);
  // Armed only while the mouse is down on the handle -- keeps native
  // HTML5 drag scoped to the handle instead of the whole section
  // (clicking/selecting text inside the body must not start a drag).
  // Reset on mouseup as well as dragend: a plain click (mousedown then
  // mouseup with no movement in between) never fires dragstart/dragend
  // at all, so without the mouseup reset the node stayed `draggable`
  // indefinitely after any click on the handle -- letting a later,
  // unrelated drag gesture elsewhere (selecting text, dragging another
  // node past this one) pick this section up and silently reposition
  // it too.
  const [dragArmed, setDragArmed] = useState(false);

  function duplicate() {
    const pos = getPos();
    if (pos === undefined) return;
    editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize, node.toJSON())
      .run();
  }

  return (
    <NodeViewWrapper
      className="section-node my-3 rounded-lg border border-rule"
      data-section
      draggable={dragArmed}
      onDragEnd={() => setDragArmed(false)}
    >
      <div
        contentEditable={false}
        className="flex items-center gap-1 rounded-t-lg border-b border-rule bg-paper px-2 py-1"
      >
        <button
          type="button"
          title="Drag to reorder section (or click inside and press Alt+Up/Down)"
          aria-label="Drag to reorder section, or click inside this section and press Alt+Up or Alt+Down"
          data-drag-handle
          onMouseDown={() => setDragArmed(true)}
          onMouseUp={() => setDragArmed(false)}
          className="min-w-[1.5rem] cursor-grab rounded px-1 py-0.5 text-sm text-ink-soft hover:bg-white active:cursor-grabbing"
        >
          ⠿
        </button>
        <button
          type="button"
          title={collapsed ? "Expand section" : "Collapse section"}
          onClick={() => updateAttributes({ collapsed: !collapsed })}
          className="min-w-[1.5rem] rounded px-1 py-0.5 text-sm text-ink-soft hover:bg-white"
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
          Section
        </span>
        <button
          type="button"
          title="Duplicate section"
          aria-label="Duplicate section"
          onClick={duplicate}
          className="min-w-[1.5rem] rounded px-1 py-0.5 text-sm text-ink-soft hover:bg-white"
        >
          ⧉
        </button>
        <button
          type="button"
          title="Delete section"
          aria-label="Delete section"
          onClick={deleteNode}
          className="min-w-[1.5rem] rounded px-1 py-0.5 text-sm text-ink-soft hover:bg-white"
        >
          🗑
        </button>
      </div>
      {/* Hidden via CSS, not unmounted -- ProseMirror needs contentDOM
          to stay in the document at all times for position mapping to
          keep working while collapsed. */}
      <div className={collapsed ? "hidden" : "px-3 py-2"}>
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}

export const Section = Node.create({
  name: "section",
  group: "block",
  content: "heading block*",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-collapsed") === "true",
        renderHTML: (attrs) => ({ "data-collapsed": attrs.collapsed ? "true" : "false" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-section]" }];
  },

  renderHTML({ node }) {
    return [
      "div",
      mergeAttributes({ "data-section": "" }, { "data-collapsed": String(node.attrs.collapsed) }),
      0,
    ];
  },

  addNodeView() {
    // See drag-utils.ts: without this, Section's drag handle looked
    // functional (cursor changed, showed the grab affordance) but
    // dropping never actually repositioned it -- TipTap's default
    // stopEvent handling and our own `dragArmed` state were both
    // reacting to the same mousedown without one of them completing
    // the move.
    return ReactNodeViewRenderer(SectionView, { stopEvent: dragAwareStopEvent });
  },
});

// Sections never appear in the markdown itself -- see file header.
// `renderContent` walks the section's children through the normal
// serializer for each child type, so a section's own markdown output
// is byte-identical to the same heading + blocks un-wrapped.
Section.config.addStorage = function () {
  return {
    markdown: {
      serialize(state: any, node: any) {
        state.renderContent(node);
      },
    },
  };
};

/**
 * Groups a flat array of top-level nodes into `section` nodes, nested
 * by heading level -- an h3 run nests inside its parent h2's section,
 * an h4 inside that h3's, and so on. Content before the first heading
 * (if any) is passed through ungrouped. Call once, right after the
 * Markdown extension parses initial content into the schema.
 */
export function groupIntoSections(schema: Schema, doc: PMNode): PMNode {
  const sectionType = schema.nodes.section;
  const topLevel: PMNode[] = [];
  doc.forEach((child) => topLevel.push(child));

  type Frame = { level: number; content: PMNode[] };
  // Stack of currently-open sections, outermost first. `content`
  // accumulates each frame's children (its heading, plus every
  // following node until something closes it) until the frame closes,
  // at which point it becomes one `section` node pushed onto whichever
  // frame is now on top (or onto `result` if the stack is empty).
  const stack: Frame[] = [];
  const result: PMNode[] = [];

  function pushNode(node: PMNode) {
    if (stack.length) stack[stack.length - 1].content.push(node);
    else result.push(node);
  }

  function closeTopFrame() {
    const frame = stack.pop();
    if (!frame) return;
    pushNode(sectionType.create(null, frame.content));
  }

  for (const node of topLevel) {
    if (node.type.name === "heading") {
      const level: number = node.attrs.level;
      // A heading at the same level or shallower than what's currently
      // open ends those sections first (e.g. a second h2 closes the
      // first h2's section -- and any h3/h4 nested inside it -- before
      // starting its own; an h1 closes everything). A heading strictly
      // deeper than what's open (h3 while an h2 section is open)
      // starts a new frame *nested inside* the current one instead.
      while (stack.length && stack[stack.length - 1].level >= level) {
        closeTopFrame();
      }
      stack.push({ level, content: [node] });
    } else if (stack.length) {
      stack[stack.length - 1].content.push(node);
    } else {
      // Content before any heading -- leave it at the top level.
      result.push(node);
    }
  }
  while (stack.length) closeTopFrame();
  return schema.nodes.doc.create(doc.attrs, result);
}

/**
 * Wraps the document's top-level content into `Section` nodes -- the boxes
 * with the drag handle/duplicate/delete controls in the editor. This has
 * to run any time the doc is replaced wholesale (initial load, restoring
 * an autosave draft), or the content renders flat with no section chrome.
 * Lives here (not in NoteEditor.tsx, where it originated) so both
 * NoteEditor and useNoteAutosave's restoreDraft can call it without
 * either importing the other.
 */
export function applySectionGrouping(editor: Editor) {
  const grouped = groupIntoSections(editor.schema, editor.state.doc);
  const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, grouped.content);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}
