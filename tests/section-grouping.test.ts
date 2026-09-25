// @vitest-environment jsdom
//
// Regression test for a real bug found while restoring #10 (block-based
// editing): dispatching the section-grouping transaction *synchronously*
// inside the editor's `onCreate` callback was silently discarded --
// `tr.docChanged` reported true, but the editor's state reverted to the
// flat, ungrouped doc right after, with no error surfaced anywhere. This
// only showed up on preexisting notes (new/empty notes have nothing to
// group, so the bug was invisible there). Deferring the same dispatch by
// one microtask fixes it reliably -- see the onCreate comment in
// NoteEditor.tsx for why.
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { Section, groupIntoSections } from "@/lib/tiptap/section-node";

const SAMPLE_NOTE = `# Photosynthesis

## Introduction

Plants convert sunlight into energy through photosynthesis.

## The process

1. Light absorption
2. Water splitting
3. Carbon fixation

## Summary

This is how plants make food.
`;

function sectionCount(editor: Editor) {
  return editor.state.doc.content.content.filter((n) => n.type.name === "section").length;
}

// Counts sections recursively (top-level + nested), for asserting on the
// nesting behavior itself rather than just the top-level count.
function totalSectionCount(node: PMNode): number {
  let count = 0;
  node.descendants((n) => {
    if (n.type.name === "section") count++;
    return true;
  });
  return count;
}

describe("section grouping (#10)", () => {
  it("groupIntoSections nests h2s under their parent h1 rather than flattening them", () => {
    const editor = new Editor({
      extensions: [StarterKit, Section, Markdown.configure({ html: false })],
      content: SAMPLE_NOTE,
      // @ts-expect-error provided by the Markdown extension
      contentType: "markdown",
    });
    const grouped = groupIntoSections(editor.schema, editor.state.doc);
    // Top level: just the h1's section -- the three h2s are strictly
    // deeper than it, so they nest inside rather than sitting as
    // siblings (see the nesting doc comment in section-node.tsx).
    const topLevelCount = grouped.content.content.filter((n) => n.type.name === "section").length;
    expect(topLevelCount).toBe(1);
    // All four headings (1 h1 + 3 h2) still produce a section somewhere
    // in the tree, just nested instead of flattened.
    expect(totalSectionCount(grouped)).toBe(4);
  });

  it("regression: dispatching synchronously inside onCreate must NOT be used", () => {
    let editor!: Editor;
    editor = new Editor({
      extensions: [StarterKit, Section, Markdown.configure({ html: false })],
      content: SAMPLE_NOTE,
      // @ts-expect-error provided by the Markdown extension
      contentType: "markdown",
      onCreate({ editor: created }) {
        const grouped = groupIntoSections(created.schema, created.state.doc);
        const tr = created.state.tr.replaceWith(0, created.state.doc.content.size, grouped.content);
        created.view.dispatch(tr);
      },
    });
    // Documents the bug: this is 0, not 1 (the h1's top-level section),
    // when dispatched synchronously.
    expect(sectionCount(editor)).toBe(0);
  });

  it("fix: deferring the dispatch to the next animation frame groups the doc correctly", async () => {
    let editor!: Editor;
    editor = new Editor({
      extensions: [StarterKit, Section, Markdown.configure({ html: false })],
      content: SAMPLE_NOTE,
      // @ts-expect-error provided by the Markdown extension
      contentType: "markdown",
      onCreate({ editor: created }) {
        requestAnimationFrame(() => {
          const grouped = groupIntoSections(created.schema, created.state.doc);
          const tr = created.state.tr.replaceWith(
            0,
            created.state.doc.content.size,
            grouped.content
          );
          tr.setMeta("addToHistory", false);
          created.view.dispatch(tr);
        });
      },
    });
    // A timing sweep (0/5/16/30ms via setTimeout) found the real cutover
    // sits at a single frame, not any particular microtask count -- this
    // points to the view's own render/measure cycle, which is why the
    // fix uses requestAnimationFrame instead of a guessed setTimeout
    // delay. Two rAF hops here to be safely past that boundary.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Top level: 1 (the h1's section) -- see the nesting test above for
    // why this isn't 4 anymore.
    expect(sectionCount(editor)).toBe(1);
    expect(totalSectionCount(editor.state.doc)).toBe(4);
  });
});
