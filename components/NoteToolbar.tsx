import type { MutableRefObject } from "react";
import type { Editor } from "@tiptap/core";
import { EmojiPicker } from "@/components/EmojiPicker";
import { SymbolPicker } from "@/components/SymbolPicker";

const TEXT_COLORS = [
  "#1f2937",
  "#475569",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#c026d3",
  "#db2777",
];

type MobileTab = "write" | "preview" | "resources";

type NoteToolbarProps = {
  editor: Editor;
  mobileTab: MobileTab;

  searchOpen: boolean;
  onOpenSearch: () => void;
  onEnterFocusMode: () => void;

  colorPickerOpen: boolean;
  setColorPickerOpen: (updater: (open: boolean) => boolean) => void;
  colorPickerRef: MutableRefObject<HTMLDivElement | null>;

  emojiPickerOpen: boolean;
  setEmojiPickerOpen: (updater: (open: boolean) => boolean) => void;
  emojiPickerPos: { top: number; left: number } | null;
  setEmojiPickerPos: (pos: { top: number; left: number } | null) => void;
  emojiPickerRef: MutableRefObject<HTMLDivElement | null>;
  onInsertEmoji: (emoji: string) => void;

  symbolPickerOpen: boolean;
  setSymbolPickerOpen: (updater: (open: boolean) => boolean) => void;
  symbolPickerRef: MutableRefObject<HTMLDivElement | null>;
  onInsertSymbol: (symbol: string) => void;

  onOpenSlashCommands: () => void;
  onInsertMath: (displayMode: boolean) => void;
  onInsertTable: () => void;

  a11yMenuOpen: boolean;
  setA11yMenuOpen: (updater: (open: boolean) => boolean) => void;
  a11yMenuRef: MutableRefObject<HTMLDivElement | null>;
  fontScale: 0.9 | 1 | 1.15 | 1.3;
  setFontScale: (scale: 0.9 | 1 | 1.15 | 1.3) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
  dyslexiaFont: boolean;
  setDyslexiaFont: (value: boolean) => void;
  spellcheckEnabled: boolean;
  setSpellcheckEnabled: (value: boolean) => void;
};

/**
 * The main note-formatting toolbar -- undo/redo, search, focus mode,
 * inline marks, paragraph style, lists, alignment, tables, math,
 * emoji/symbol pickers, slash commands, and the reading/accessibility
 * menu. Extracted out of NoteEditor.tsx, which had grown this ~450-line
 * block inline alongside five other concerns (editor setup, autosave,
 * search, resource pickers, insert panels).
 *
 * Deliberately prop-driven rather than reaching into any shared context
 * or NoteEditor's own state: every open/close flag, the refs used by
 * NoteEditor's click-outside effects, and every insert/toggle action are
 * passed in explicitly. That keeps this component's contract obvious
 * from its props alone, and keeps the click-outside effects themselves
 * in NoteEditor (they're one generic pattern reused ~7 times there
 * across pickers this component doesn't own too, like the resource/
 * assessment/topic pickers -- duplicating that pattern here instead of
 * sharing the refs would just be two copies of the same bug surface).
 *
 * `editor` is required (not optional) because NoteEditor only ever
 * mounts this once `editor` exists -- see the `!editor ? ... : <>...`
 * branch there.
 */
export function NoteToolbar({
  editor,
  mobileTab,
  searchOpen,
  onOpenSearch,
  onEnterFocusMode,
  colorPickerOpen,
  setColorPickerOpen,
  colorPickerRef,
  emojiPickerOpen,
  setEmojiPickerOpen,
  emojiPickerPos,
  setEmojiPickerPos,
  emojiPickerRef,
  onInsertEmoji,
  symbolPickerOpen,
  setSymbolPickerOpen,
  symbolPickerRef,
  onInsertSymbol,
  onOpenSlashCommands,
  onInsertMath,
  onInsertTable,
  a11yMenuOpen,
  setA11yMenuOpen,
  a11yMenuRef,
  fontScale,
  setFontScale,
  highContrast,
  setHighContrast,
  dyslexiaFont,
  setDyslexiaFont,
  spellcheckEnabled,
  setSpellcheckEnabled,
}: NoteToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Note formatting"
      className={`mb-2 ${mobileTab !== "write" ? "hidden md:flex" : "flex"} flex-wrap items-center gap-1 rounded-lg border border-rule bg-paper p-1`}
    >
      <button
        type="button"
        title="Undo (Ctrl/Cmd+Z)"
        onClick={() => editor.chain().focus().undo().run()}
        className="min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white"
      >
        ↺
      </button>
      <button
        type="button"
        title="Redo (Ctrl/Cmd+Shift+Z)"
        onClick={() => editor.chain().focus().redo().run()}
        className="min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white"
      >
        ↻
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <button
        type="button"
        title="Search and replace (Ctrl/Cmd+F)"
        onClick={onOpenSearch}
        aria-label="Search and replace"
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${searchOpen ? "bg-white" : ""}`}
      >
        <span aria-hidden="true"> Find ⌕</span>
      </button>
      <button
        type="button"
        title="Focus mode"
        aria-label="Enter focus mode"
        onClick={onEnterFocusMode}
        className="min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white"
      >
        <span aria-hidden="true">⛶</span>
      </button>
      <button
        type="button"
        title="Bold (Ctrl/Cmd+B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm font-semibold hover:bg-white ${editor.isActive("bold") ? "bg-white" : ""}`}
      >
        B
      </button>
      <button
        type="button"
        title="Italic (Ctrl/Cmd+I)"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm italic hover:bg-white ${editor.isActive("italic") ? "bg-white" : ""}`}
      >
        I
      </button>
      <button
        type="button"
        title="Underline (Ctrl/Cmd+U)"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm underline hover:bg-white ${editor.isActive("underline") ? "bg-white" : ""}`}
      >
        U
      </button>
      <button
        type="button"
        title="Strikethrough"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm line-through hover:bg-white ${editor.isActive("strike") ? "bg-white" : ""}`}
      >
        S
      </button>
      <div className="relative" ref={colorPickerRef}>
        <button
          type="button"
          title="Text color"
          aria-label="Choose text color"
          onClick={() => setColorPickerOpen((open) => !open)}
          className={`relative min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${colorPickerOpen ? "bg-white" : ""}`}
        >
          A
          <span
            className="absolute bottom-0.5 left-2 right-2 h-0.5 rounded"
            style={{
              backgroundColor: editor.getAttributes("textStyle").color || "#1f2937",
            }}
          />
        </button>
        {colorPickerOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-rule bg-white p-2 shadow-lg">
            <div className="mb-2 flex items-center justify-between px-0.5">
              <span className="text-xs font-medium text-ink">Text color</span>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setColorPickerOpen(() => false);
                }}
                className="text-xs text-ink-soft hover:text-ink"
              >
                Reset
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TEXT_COLORS.map((color) => {
                const selected = editor.getAttributes("textStyle").color === color;
                return (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Set text color to ${color}`}
                    title={color}
                    onClick={() => {
                      editor.chain().focus().setColor(color).run();
                      setColorPickerOpen(() => false);
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${selected ? "border-ink ring-2 ring-marigold/40" : "border-white hover:border-rule"}`}
                    style={{ backgroundColor: color }}
                  >
                    {selected && <span className="text-xs font-bold text-white">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        title="Highlight"
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive("highlight") ? "bg-white" : ""}`}
      >
        ▧
      </button>
      <button
        type="button"
        title="Superscript"
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive("superscript") ? "bg-white" : ""}`}
      >
        x²
      </button>
      <button
        type="button"
        title="Subscript"
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive("subscript") ? "bg-white" : ""}`}
      >
        x₂
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <select
        title="Paragraph style"
        value={
          editor.isActive("heading", { level: 1 })
            ? "h1"
            : editor.isActive("heading", { level: 2 })
              ? "h2"
              : editor.isActive("heading", { level: 3 })
                ? "h3"
                : "p"
        }
        onChange={(e) => {
          const value = e.target.value;
          const chain = editor.chain().focus();
          if (value === "p") chain.setParagraph().run();
          else chain.toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
        }}
        className="rounded-md border-none bg-transparent px-2 py-1 text-sm hover:bg-white"
      >
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="mx-1 h-4 w-px bg-rule" />
      <button
        type="button"
        title="Bulleted list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive("bulletList") ? "bg-white" : ""}`}
      >
        •
      </button>
      <button
        type="button"
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive("orderedList") ? "bg-white" : ""}`}
      >
        1.
      </button>
      <button
        type="button"
        title="Blockquote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive("blockquote") ? "bg-white" : ""}`}
      >
        &ldquo;
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <span className="mx-1 h-4 w-px bg-rule" />
      <button
        type="button"
        title="Align left"
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive({ textAlign: "left" }) ? "bg-white" : ""}`}
      >
        ⟸
      </button>
      <button
        type="button"
        title="Align center"
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive({ textAlign: "center" }) ? "bg-white" : ""}`}
      >
        ⟺
      </button>
      <button
        type="button"
        title="Align right"
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive({ textAlign: "right" }) ? "bg-white" : ""}`}
      >
        ⟹
      </button>
      <button
        type="button"
        title="Justify"
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive({ textAlign: "justify" }) ? "bg-white" : ""}`}
      >
        ☰
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <button
        type="button"
        title="Checklist"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive("taskList") ? "bg-white" : ""}`}
      >
        ☑
      </button>
      <button
        type="button"
        title="Outdent (Shift+Tab)"
        onClick={() => {
          const itemType = editor.isActive("taskItem") ? "taskItem" : "listItem";
          editor.chain().focus().liftListItem(itemType).run();
        }}
        disabled={!editor.can().liftListItem("listItem") && !editor.can().liftListItem("taskItem")}
        className="min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white disabled:opacity-40"
      >
        ⇤
      </button>
      <button
        type="button"
        title="Indent (Tab)"
        onClick={() => {
          const itemType = editor.isActive("taskItem") ? "taskItem" : "listItem";
          editor.chain().focus().sinkListItem(itemType).run();
        }}
        disabled={!editor.can().sinkListItem("listItem") && !editor.can().sinkListItem("taskItem")}
        className="min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white disabled:opacity-40"
      >
        ⇥
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <button
        type="button"
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className="min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white"
      >
        ―
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <button
        type="button"
        title="Code block"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={`min-w-[2rem] rounded-md px-2 py-1 font-mono text-sm hover:bg-white ${editor.isActive("codeBlock") ? "bg-white" : ""}`}
      >
        {"</>"}
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <button
        type="button"
        title="Callout (Tip/Warning/etc. — type '/' for more options)"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "callout",
              attrs: { calloutType: "tip" },
              content: [{ type: "paragraph" }],
            })
            .run()
        }
        className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${editor.isActive("callout") ? "bg-white" : ""}`}
      >
        💡
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <button
        type="button"
        title="Inline math (LaTeX)"
        onClick={() => onInsertMath(false)}
        className="min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white"
      >
        ∑
      </button>
      <button
        type="button"
        title="Block math (LaTeX)"
        onClick={() => onInsertMath(true)}
        className="min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white"
      >
        ∑∑
      </button>
      <button
        type="button"
        title="Insert table"
        onClick={onInsertTable}
        className="min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white"
      >
        Table
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <div className="relative" ref={emojiPickerRef}>
        <button
          type="button"
          title="Insert emoji"
          onClick={() => {
            setEmojiPickerPos(null); // toolbar-anchored, not cursor-anchored
            setEmojiPickerOpen((open) => !open);
          }}
          className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${emojiPickerOpen ? "bg-white" : ""}`}
        >
          😀
        </button>
        {emojiPickerOpen && !emojiPickerPos && (
          <div className="absolute left-0 top-full z-20 mt-1">
            <EmojiPicker onSelectAction={onInsertEmoji} />
          </div>
        )}
      </div>
      <div className="relative" ref={symbolPickerRef}>
        <button
          type="button"
          title="Insert maths, science, or Greek symbol"
          onClick={() => setSymbolPickerOpen((open) => !open)}
          className={`min-w-[2rem] rounded-md px-2 py-1 text-sm hover:bg-white ${symbolPickerOpen ? "bg-white" : ""}`}
        >
          Ω
        </button>
        {symbolPickerOpen && (
          <div className="absolute right-0 top-full z-20 mt-1">
            <SymbolPicker onSelectAction={onInsertSymbol} />
          </div>
        )}
      </div>
      <button
        type="button"
        title="Slash commands (Ctrl/Cmd+/)"
        aria-label="Open slash commands"
        onClick={onOpenSlashCommands}
        className="min-w-[2rem] rounded-md px-2 py-1 font-mono text-sm hover:bg-white"
      >
        /
      </button>
      <span className="mx-1 h-4 w-px bg-rule" />
      <div className="relative" ref={a11yMenuRef}>
        <button
          type="button"
          title="Reading & accessibility options"
          aria-label="Reading and accessibility options"
          aria-haspopup="true"
          aria-expanded={a11yMenuOpen}
          onClick={() => setA11yMenuOpen((open) => !open)}
          className={`min-w-[2rem] rounded-md px-2 py-1 text-sm font-medium hover:bg-white ${a11yMenuOpen ? "bg-white" : ""}`}
        >
          Aa
        </button>
        {a11yMenuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-rule bg-white p-3 text-sm shadow-lg">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Text size
            </p>
            <div className="mb-3 flex items-center gap-1" role="group" aria-label="Text size">
              {([0.9, 1, 1.15, 1.3] as const).map((scale, i) => (
                <button
                  key={scale}
                  type="button"
                  aria-pressed={fontScale === scale}
                  aria-label={["Small", "Normal", "Large", "Extra large"][i] + " text"}
                  onClick={() => setFontScale(scale)}
                  style={{ fontSize: `${0.75 + i * 0.1}rem` }}
                  className={`flex-1 rounded-md border px-2 py-1 ${
                    fontScale === scale
                      ? "border-marigold bg-marigold/15 font-semibold text-ink"
                      : "border-rule text-ink-soft hover:bg-paper"
                  }`}
                >
                  A
                </button>
              ))}
            </div>

            <label className="mb-2 flex items-center justify-between gap-2">
              <span>High contrast</span>
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                aria-label="High contrast note text"
              />
            </label>
            <label className="mb-2 flex items-center justify-between gap-2">
              <span>Dyslexia-friendly font</span>
              <input
                type="checkbox"
                checked={dyslexiaFont}
                onChange={(e) => setDyslexiaFont(e.target.checked)}
                aria-label="Use dyslexia-friendly font"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Spell check</span>
              <input
                type="checkbox"
                checked={spellcheckEnabled}
                onChange={(e) => setSpellcheckEnabled(e.target.checked)}
                aria-label="Underline misspelled words as you type"
              />
            </label>
            <p className="mt-2 text-xs text-ink-soft">
              These only change how the note looks to you — nothing here is saved into the note.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
