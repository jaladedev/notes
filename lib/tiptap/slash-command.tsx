/**
 * Slash Commands (#8 of markdown-editor-todo.md): typing "/" opens a
 * filterable menu of block types, built on the official
 * `@tiptap/suggestion` utility (no tippy.js dependency -- positioning is
 * done manually off the `clientRect()` the utility already gives us,
 * since that's the only thing tippy would otherwise be doing here).
 *
 * Item list mirrors the todo's list minus "Learning Objective" (#15 is
 * suspended, see its section for why). "Activity" and "Homework" aren't
 * separate block types -- they're the Callout node (#17,
 * lib/tiptap/callout-node.tsx) pre-set to those two calloutTypes, same
 * node a plain "Callout" item inserts with the default "tip" type.
 * "Image"/"Video" reuse the existing resource picker rather than
 * duplicating it, same as "Diagram" reuses the existing Mermaid panel --
 * both of those are React state in NoteEditor, not ProseMirror commands,
 * so `slashCommandBridge` is how a command run from inside this
 * extension reaches back out to them (see the bridge comment below).
 */
import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Editor, Range } from "@tiptap/core";
import { clampPopoverToEditor } from "./popover-position";

type SlashCommandItem = {
  title: string;
  description?: string;
  icon: string;
  run: (params: { editor: Editor; range: Range }) => void;
};

type SlashCommandBridge = {
  openResourcePicker?: () => void;
  openDiagramPanel?: () => void;
  openEmojiPicker?: () => void;
  openLinkPreviewPanel?: () => void;
};

// NoteEditor's "open the resource picker" / "open the diagram panel"
// actions are React `setState` calls, not ProseMirror commands -- and
// their identity changes on every NoteEditor render, while this
// extension's item list is built once. Rather than threading fresh
// callbacks through `editor.extensionManager` on every render, NoteEditor
// just writes its latest callbacks into this shared object each render
// (see the `slashCommandBridge.openResourcePicker = ...` lines there),
// and items here call through it at click/Enter time, so they always
// reach the current callback rather than a stale one captured at mount.
export const slashCommandBridge: SlashCommandBridge = {};

function insertCallout(editor: Editor, range: Range, calloutType: string) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({
      type: "callout",
      attrs: { calloutType },
      content: [{ type: "paragraph" }],
    })
    .run();
}

const ALL_ITEMS: SlashCommandItem[] = [
  {
    title: "Heading",
    icon: "H",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    title: "Section",
    description: "A draggable, collapsible group starting with a heading",
    icon: "⠿",
    // Typing a heading inside an existing section's body doesn't
    // auto-split it (see section-node.tsx's known limitations) --
    // this is the explicit way to start a new, separate section.
    run: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "section",
          content: [{ type: "heading", attrs: { level: 2 } }, { type: "paragraph" }],
        })
        .run(),
  },
  {
    title: "Table",
    icon: "▦",
    run: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
        .run(),
  },
  {
    title: "Image",
    description: "Insert an existing resource",
    icon: "🖼️",
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      slashCommandBridge.openResourcePicker?.();
    },
  },
  {
    title: "Video",
    description: "Insert an existing resource",
    icon: "🎬",
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      slashCommandBridge.openResourcePicker?.();
    },
  },
  {
    title: "Diagram",
    description: "Generate a Mermaid diagram",
    icon: "📊",
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      slashCommandBridge.openDiagramPanel?.();
    },
  },
  {
    title: "Link",
    description: "Preview card with title, thumbnail, and description",
    icon: "🔗",
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      slashCommandBridge.openLinkPreviewPanel?.();
    },
  },
  {
    title: "Emoji",
    icon: "😀",
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      slashCommandBridge.openEmojiPicker?.();
    },
  },
  {
    title: "Callout",
    icon: "💡",
    run: ({ editor, range }) => insertCallout(editor, range, "tip"),
  },
  {
    title: "Activity",
    icon: "🙋",
    run: ({ editor, range }) => insertCallout(editor, range, "activity"),
  },
  {
    title: "Homework",
    icon: "📝",
    run: ({ editor, range }) => insertCallout(editor, range, "homework"),
  },
  {
    title: "Note",
    description: "Plain paragraph",
    icon: "¶",
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Divider",
    icon: "—",
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

function getItems({ query }: { query: string }): SlashCommandItem[] {
  if (!query) return ALL_ITEMS;
  const q = query.toLowerCase();
  return ALL_ITEMS.filter(
    (item) => item.title.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
  );
}

const SlashMenuList = forwardRef<
  { onKeyDown: (params: { event: KeyboardEvent }) => boolean },
  { items: SlashCommandItem[]; onPick: (item: SlashCommandItem) => void }
>(function SlashMenuList({ items, onPick }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown({ event }) {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "Enter") {
          const item = items[selectedIndex];
          if (item) onPick(item);
          return true;
        }
        return false;
      },
    }),
    [items, selectedIndex, onPick]
  );

  if (items.length === 0) {
    return (
      <div
        role="status"
        className="w-64 rounded-lg border border-rule bg-white p-3 text-sm text-ink-soft shadow-lg"
      >
        No matching blocks
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Block type"
      className="max-h-72 w-64 overflow-y-auto rounded-lg border border-rule bg-white py-1 shadow-lg"
    >
      {items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(item)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
            i === selectedIndex ? "bg-paper" : "hover:bg-paper"
          }`}
        >
          <span className="w-5 shrink-0 text-center" aria-hidden>
            {item.icon}
          </span>
          <span className="flex flex-col overflow-hidden">
            <span className="truncate text-ink">{item.title}</span>
            {item.description && (
              <span className="truncate text-xs text-ink-soft">{item.description}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
});

const suggestionRender: SuggestionOptions<SlashCommandItem>["render"] = () => {
  let component: ReactRenderer<{ onKeyDown: (p: { event: KeyboardEvent }) => boolean }> | null =
    null;
  let popupEl: HTMLDivElement | null = null;

  function positionPopup(
    clientRect: (() => DOMRect | null) | null | undefined,
    editorEl: HTMLElement | null
  ) {
    const rect = clientRect?.();
    if (!rect || !popupEl) return;
    // Fixed positioning off the caret's own rect (not a parent container)
    // so the menu tracks the cursor correctly regardless of where in the
    // note the "/" was typed, including inside a table cell or callout.
    popupEl.style.left = `${rect.left}px`;
    popupEl.style.top = `${rect.bottom + 6}px`;
    // Then pull it back inside the editor's own bounds -- typing "/" near
    // a table's right edge would otherwise open the menu overlapping the
    // sidebar instead of staying within the note.
    clampPopoverToEditor(popupEl, editorEl);
  }

  return {
    onStart: (props) => {
      component = new ReactRenderer(SlashMenuList, {
        props: {
          items: props.items,
          onPick: (item: SlashCommandItem) => props.command(item),
        },
        editor: props.editor,
      });

      popupEl = document.createElement("div");
      popupEl.style.position = "fixed";
      popupEl.style.zIndex = "50";
      popupEl.appendChild(component.element);
      document.body.appendChild(popupEl);
      positionPopup(props.clientRect, props.editor.view.dom as HTMLElement);
    },
    onUpdate(props) {
      component?.updateProps({
        items: props.items,
        onPick: (item: SlashCommandItem) => props.command(item),
      });
      positionPopup(props.clientRect, props.editor.view.dom as HTMLElement);
    },
    onKeyDown(props) {
      if (props.event.key === "Escape") {
        popupEl?.remove();
        return true;
      }
      return component?.ref?.onKeyDown({ event: props.event }) ?? false;
    },
    onExit() {
      popupEl?.remove();
      popupEl = null;
      component?.destroy();
      component = null;
    },
  };
};

export const SlashCommand = Extension.create<{
  suggestion: Partial<SuggestionOptions<SlashCommandItem>>;
}>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        allowedPrefixes: null,
        items: getItems,
        command: ({ editor, range, props }) => {
          props.run({ editor, range });
        },
        render: suggestionRender,
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
