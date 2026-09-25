import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Color } from "@tiptap/extension-color";
import { TextAlign } from "@tiptap/extension-text-align";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { CharacterCount } from "@tiptap/extension-character-count";
import { Markdown } from "tiptap-markdown";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";

import { CodeBlock } from "@/lib/tiptap/code-block";
import { Callout } from "@/lib/tiptap/callout-node";
import { Section } from "@/lib/tiptap/section-node";
import { BlockReorderShortcuts } from "@/lib/tiptap/block-reorder";
import { SlashCommand } from "@/lib/tiptap/slash-command";
import {
  HighlightMarkdown,
  SubscriptMarkdown,
  SuperscriptMarkdown,
  TextStyleMarkdown,
} from "@/lib/tiptap/format-marks";
import { ResourceChip } from "@/lib/tiptap/resource-node";
import { TopicLinkChip } from "@/lib/tiptap/topic-link-node";
import { MathInline, MathBlock } from "@/lib/tiptap/math-nodes";

// Tab key inside the editor should move focus out (accessibility), not
// insert a literal tab character -- StarterKit doesn't cover this.
const TabTrap = Extension.create({
  name: "tabTrap",
  addKeyboardShortcuts() {
    return {
      Tab: () => true,
      "Shift-Tab": () => true,
    };
  },
});

/**
 * Builds the full TipTap extension list for NoteEditor.
 *
 * Deliberately pure / stateless: every extension here is either static or
 * configured only from `placeholder`. Anything that needs closures over
 * component state or handlers (e.g. `handlePaste` calling
 * `uploadDroppedFiles`) stays in NoteEditor's own `editorProps`, not here.
 */
export function buildNoteEditorExtensions(placeholder?: string) {
  return [
    TabTrap,
    BlockReorderShortcuts,
    StarterKit.configure({
      link: { openOnClick: false, autolink: true },
      codeBlock: false,
    }),
    CodeBlock,
    Callout,
    Section,
    SlashCommand,
    CharacterCount,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder,
    }),
    TextStyleMarkdown,
    Color,
    HighlightMarkdown.configure({ multicolor: true }),
    SubscriptMarkdown,
    SuperscriptMarkdown,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    ResourceChip,
    TopicLinkChip,
    MathInline,
    MathBlock,
    Markdown.configure({
      html: false,
      transformPastedText: true,
    }),
  ];
}
