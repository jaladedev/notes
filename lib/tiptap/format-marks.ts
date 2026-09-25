/**
 * Markdown round-trip wiring for the marks added in the #2/#3 toolbar pass
 * (Highlight, Subscript, Superscript, Color/TextStyle).
 *
 * Why this file exists: tiptap-markdown only ships built-in markdown
 * serialize/parse rules for a fixed list of nodes/marks (bold, italic,
 * strike, code, link, lists, headings, tables, task list/item, etc. --
 * see its `src/extensions/index.js`). Anything outside that list has no
 * rule registered, so `editor.storage.markdown.getMarkdown()` silently
 * drops the mark's formatting from the saved text -- the mark still works
 * live in the editor, but a save + reload loses it. That's what happened
 * here until this file was added.
 *
 * Same mechanism as ResourceChip / MathInline / MathBlock in
 * resource-node.tsx / math-nodes.tsx: each extension gets a
 * `storage.markdown` key (tiptap-markdown reads that directly, there's no
 * global "markdownIt" hook to register with instead) with a `serialize`
 * side (write markdown text out) and a `parse.setup(md)` side (register a
 * markdown-it rule that renders the same syntax back into real HTML tags
 * -- `<mark>`, `<sub>`, `<sup>`, `<span style="color:...">` -- which is
 * what these marks' own default `parseHTML()` already knows how to read
 * back into a ProseMirror mark). The `html: false` option on the Markdown
 * extension only disables markdown-it's *own* generic "raw HTML in
 * source text" rules; it doesn't stop a purpose-built rule like the ones
 * below from rendering real HTML for its own specific syntax, same as
 * math_inline/math_block/resource_chip already do.
 */
import { Highlight } from "@tiptap/extension-highlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TextStyle } from "@tiptap/extension-text-style";
// @ts-expect-error -- no published types for this package
import markdownItMark from "markdown-it-mark";
// @ts-expect-error -- no published types for this package
import markdownItSub from "markdown-it-sub";
// @ts-expect-error -- no published types for this package
import markdownItSup from "markdown-it-sup";

// ---- Highlight: ==text== (markdown-it-mark renders <mark>text</mark>,
// which matches Highlight's default parseHTML). Only the toolbar's
// single-color toggle is wired up in NoteEditor today (no color picker
// exposed for highlights), so a plain <mark> round-trip covers everything
// the UI can currently produce -- if a color picker for highlights gets
// added later, this will need the same {attr=...} treatment Color gets
// below.
export const HighlightMarkdown = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: "==", close: "==", expelEnclosingWhitespace: true },
        parse: {
          setup(md: any) {
            md.use(markdownItMark);
          },
        },
      },
    };
  },
});

// ---- Subscript: H~2~O (markdown-it-sub renders <sub>2</sub>)
export const SubscriptMarkdown = Subscript.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: "~", close: "~", expelEnclosingWhitespace: true },
        parse: {
          setup(md: any) {
            md.use(markdownItSub);
          },
        },
      },
    };
  },
});

// ---- Superscript: 2^10^ (markdown-it-sup renders <sup>10</sup>)
export const SuperscriptMarkdown = Superscript.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: "^", close: "^", expelEnclosingWhitespace: true },
        parse: {
          setup(md: any) {
            md.use(markdownItSup);
          },
        },
      },
    };
  },
});

// ---- Color: {color=#hex}text{/color}
// No off-the-shelf markdown-it plugin for this (there's no agreed-upon
// markdown convention for inline color the way ==mark== or ~sub~ are), so
// this is a small hand-rolled inline rule instead of a library, following
// the same pattern math-nodes.tsx uses for $...$/$$...$$. Deliberately
// non-nesting (the inner text is taken as a single literal run rather than
// recursively tokenized) -- e.g. you can't bold part of a colored run and
// have that survive a reload. Good enough for "pick a color on some text",
// which is all the toolbar's color swatch actually does; nested formatting
// inside a colored span can be revisited if that combination turns out to
// matter in practice.
function colorMarkdownPlugin(md: any) {
  const OPEN_RE = /^\{color=(#[0-9a-fA-F]{3,8})\}/;
  const CLOSE = "{/color}";

  md.inline.ruler.before("emphasis", "text_color", (state: any, silent: boolean) => {
    const rest = state.src.slice(state.pos);
    const match = OPEN_RE.exec(rest);
    if (!match) return false;

    const openLen = match[0].length;
    const closeIdx = state.src.indexOf(CLOSE, state.pos + openLen);
    if (closeIdx === -1) return false;

    if (silent) return true;

    const color = match[1];
    const inner = state.src.slice(state.pos + openLen, closeIdx);

    const openToken = state.push("text_color_open", "span", 1);
    openToken.attrs = [["style", `color:${color}`]];
    openToken.markup = match[0];

    const textToken = state.push("text", "", 0);
    textToken.content = inner;

    const closeToken = state.push("text_color_close", "span", -1);
    closeToken.markup = CLOSE;

    state.pos = closeIdx + CLOSE.length;
    return true;
  });
}

export const TextStyleMarkdown = TextStyle.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open(_state: any, mark: any) {
            return mark.attrs.color ? `{color=${mark.attrs.color}}` : "";
          },
          close(_state: any, mark: any) {
            return mark.attrs.color ? "{/color}" : "";
          },
        },
        parse: {
          setup(md: any) {
            colorMarkdownPlugin(md);
          },
        },
      },
    };
  },
});
