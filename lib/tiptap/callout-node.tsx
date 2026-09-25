/**
 * Callout blocks (#17 of markdown-editor-todo.md): Tip, Important,
 * Warning, Remember, Definition, Example, Activity, Homework -- a
 * colored card with an icon header and real editable block content
 * inside (paragraphs, lists, etc. all work inside a callout, since
 * `content: "block+"` rather than plain text).
 *
 * "Activity" and "Homework" double as the corresponding items in the
 * Slash Commands menu (#8) -- rather than being a separate block type,
 * they're just this same Callout node pre-set to a different
 * `calloutType`, which is why both are listed there alongside a plain
 * "Callout" entry that defaults to "tip".
 *
 * Markdown round-trip uses a `:::type ... :::` fence, the same
 * container syntax used by Docusaurus/Obsidian-style admonitions, so a
 * teacher who already knows that convention can also just type it by
 * hand instead of going through the UI.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useState } from "react";
import { dragAwareStopEvent } from "./drag-utils";

type CalloutType =
  "tip" | "important" | "warning" | "remember" | "definition" | "example" | "activity" | "homework";

const CALLOUT_CONFIG: Record<
  CalloutType,
  { label: string; icon: string; border: string; bg: string; text: string }
> = {
  tip: {
    label: "Tip",
    icon: "💡",
    border: "border-amber-300",
    bg: "bg-amber-50",
    text: "text-amber-900",
  },
  important: {
    label: "Important",
    icon: "❗",
    border: "border-blue-300",
    bg: "bg-blue-50",
    text: "text-blue-900",
  },
  warning: {
    label: "Warning",
    icon: "⚠️",
    border: "border-clay/50",
    bg: "bg-clay/10",
    text: "text-clay",
  },
  remember: {
    label: "Remember",
    icon: "🧠",
    border: "border-purple-300",
    bg: "bg-purple-50",
    text: "text-purple-900",
  },
  definition: {
    label: "Definition",
    icon: "📖",
    border: "border-teal-300",
    bg: "bg-teal-50",
    text: "text-teal-900",
  },
  example: {
    label: "Example",
    icon: "✏️",
    border: "border-green-300",
    bg: "bg-green-50",
    text: "text-green-900",
  },
  activity: {
    label: "Activity",
    icon: "🙋",
    border: "border-marigold",
    bg: "bg-marigold/10",
    text: "text-ink",
  },
  homework: {
    label: "Homework",
    icon: "📝",
    border: "border-rose-300",
    bg: "bg-rose-50",
    text: "text-rose-900",
  },
};

const CALLOUT_TYPES = Object.keys(CALLOUT_CONFIG) as CalloutType[];

function isCalloutType(value: unknown): value is CalloutType {
  return typeof value === "string" && CALLOUT_TYPES.includes(value as CalloutType);
}

function CalloutView({
  node,
  updateAttributes,
}: {
  node: any;
  updateAttributes: (attrs: Record<string, unknown>) => void;
}) {
  const calloutType: CalloutType = isCalloutType(node.attrs.calloutType)
    ? node.attrs.calloutType
    : "tip";
  const config = CALLOUT_CONFIG[calloutType];
  // Same pattern as SectionView: armed only while the drag handle itself
  // is held down, so native HTML5 drag stays scoped to the handle
  // instead of the whole callout (clicking the type dropdown or
  // selecting text in the body must not start a drag). Reset on mouseup
  // too, not just dragend -- a plain click never fires dragend, and
  // without this the callout stayed stuck `draggable` after any click,
  // letting an unrelated later drag pick it up and reposition it.
  const [dragArmed, setDragArmed] = useState(false);

  return (
    <NodeViewWrapper
      className={`my-3 rounded-lg border-l-4 ${config.border} ${config.bg} p-3`}
      data-callout={calloutType}
      draggable={dragArmed}
      onDragEnd={() => setDragArmed(false)}
    >
      <div contentEditable={false} className="mb-1 flex items-center gap-1.5">
        <button
          type="button"
          onMouseDown={() => setDragArmed(true)}
          onMouseUp={() => setDragArmed(false)}
          title="Drag to reorder (or click inside and press Alt+Up/Down)"
          aria-label="Drag to reorder this callout, or click inside it and press Alt+Up or Alt+Down"
          data-drag-handle
          className="cursor-grab select-none rounded px-0.5 text-sm text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
        >
          ⠿
        </button>
        <span aria-hidden>{config.icon}</span>
        <select
          value={calloutType}
          onChange={(e) => updateAttributes({ calloutType: e.target.value })}
          className={`rounded border-none bg-transparent text-xs font-semibold uppercase tracking-wide outline-none ${config.text}`}
        >
          {CALLOUT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CALLOUT_CONFIG[t].label}
            </option>
          ))}
        </select>
      </div>
      <NodeViewContent className={`text-sm ${config.text}`} />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      calloutType: {
        default: "tip",
        parseHTML: (el) =>
          isCalloutType(el.getAttribute("data-callout")) ? el.getAttribute("data-callout") : "tip",
        renderHTML: (attrs) => ({ "data-callout": attrs.calloutType }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ node }) {
    return ["div", mergeAttributes({ "data-callout": node.attrs.calloutType }), 0];
  },

  addNodeView() {
    // See drag-utils.ts / section-node.tsx's same comment.
    return ReactNodeViewRenderer(CalloutView, { stopEvent: dragAwareStopEvent });
  },
});

// --- markdown round-trip: ":::type\n...content...\n:::" -------------
//
// This is a container rule, not a leaf like MathBlock -- it needs to
// hand its inner lines back to markdown-it's normal block tokenizer so
// paragraphs/lists/etc. inside a callout parse the same way they would
// outside one. Modeled on markdown-it-container (and markdown-it's own
// built-in blockquote rule, minus blockquote's per-line ">" stripping,
// which a plain fence doesn't need): find the opening ":::type" line,
// find the matching closing ":::" line, then call
// `state.md.block.tokenize` on everything between them.
function calloutMarkdownPlugin(md: any) {
  md.block.ruler.before(
    "fence",
    "callout",
    (state: any, startLine: number, endLine: number, silent: boolean) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const openMatch = /^:::(\w+)\s*$/.exec(state.src.slice(start, max).trim());
      if (!openMatch) return false;

      const calloutType = openMatch[1].toLowerCase();
      if (!isCalloutType(calloutType)) return false;

      let nextLine = startLine + 1;
      let found = false;
      for (; nextLine < endLine; nextLine++) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineEnd = state.eMarks[nextLine];
        if (state.src.slice(lineStart, lineEnd).trim() === ":::") {
          found = true;
          break;
        }
      }
      if (!found) return false;
      if (silent) return true;

      const oldParentType = state.parentType;
      const oldLineMax = state.lineMax;
      state.parentType = "callout";
      // Hard-stops paragraph continuation at the closing fence, same
      // trick markdown-it's blockquote rule uses -- otherwise a
      // paragraph on the last line inside the callout would keep
      // scanning past the ":::" looking for more of itself.
      state.lineMax = nextLine;

      const tokenOpen = state.push("callout_open", "div", 1);
      tokenOpen.attrs = [["calloutType", calloutType]];
      tokenOpen.map = [startLine, nextLine];
      tokenOpen.markup = ":::";

      state.md.block.tokenize(state, startLine + 1, nextLine);

      const tokenClose = state.push("callout_close", "div", -1);
      tokenClose.markup = ":::";

      state.parentType = oldParentType;
      state.lineMax = oldLineMax;
      state.line = nextLine + 1;
      return true;
    }
  );

  md.renderer.rules.callout_open = (tokens: any[], idx: number) => {
    const calloutType = tokens[idx].attrs.find((a: string[]) => a[0] === "calloutType")[1];
    return `<div data-callout="${calloutType}">\n`;
  };
  md.renderer.rules.callout_close = () => `</div>\n`;
}

Callout.config.addStorage = function () {
  return {
    markdown: {
      serialize(state: any, node: any) {
        const calloutType = isCalloutType(node.attrs.calloutType) ? node.attrs.calloutType : "tip";
        state.write(`:::${calloutType}`);
        state.ensureNewLine();
        state.renderContent(node);
        state.ensureNewLine();
        state.write(":::");
        state.closeBlock(node);
      },
      parse: {
        setup(md: any) {
          calloutMarkdownPlugin(md);
        },
      },
    },
  };
};
