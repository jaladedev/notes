// @vitest-environment jsdom
//
//
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection } from "@tiptap/pm/state";
import { ResourceChip } from "@/lib/tiptap/resource-node";
import { Callout } from "@/lib/tiptap/callout-node";
import { BlockReorderShortcuts } from "@/lib/tiptap/block-reorder";

function chipIds(editor: Editor) {
  const ids: number[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "resourceChip") ids.push(node.attrs.id);
    return true;
  });
  return ids;
}

function chipPos(editor: Editor, id: number) {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "resourceChip" && node.attrs.id === id) found = pos;
    return true;
  });
  if (found === null) throw new Error(`chip ${id} not found`);
  return found;
}

describe("BlockReorderShortcuts -- block swap (Alt+Up/Down)", () => {
  it("moves a callout down past its next sibling", () => {
    const editor = new Editor({
      extensions: [StarterKit, Callout, BlockReorderShortcuts],
      content: {
        type: "doc",
        content: [
          {
            type: "callout",
            attrs: { calloutType: "tip" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }],
          },
          { type: "paragraph", content: [{ type: "text", text: "second" }] },
        ],
      },
    });

    // Put the cursor inside the callout's paragraph.
    editor.commands.setTextSelection(3);

    // Exercise the actual keyboard shortcut path rather than reaching into
    // internals, so this covers what a real Alt+ArrowDown keypress does.
    const handled = editor.view.someProp("handleKeyDown", (f) =>
      f(editor.view, new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true }))
    );
    expect(handled).toBe(true);

    const text = editor.state.doc.textContent;
    expect(text.indexOf("second")).toBeLessThan(text.indexOf("first"));
  });
});

describe("BlockReorderShortcuts -- ResourceChip inline move (Alt+Left/Right)", () => {
  function makeEditor() {
    return new Editor({
      extensions: [StarterKit, ResourceChip, BlockReorderShortcuts],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "resourceChip", attrs: { id: 1 } },
              { type: "text", text: " " },
              { type: "resourceChip", attrs: { id: 2 } },
              { type: "text", text: " " },
              { type: "resourceChip", attrs: { id: 3 } },
            ],
          },
        ],
      },
    });
  }

  it("moving right skips over the separator and lands past the next chip", () => {
    const editor = makeEditor();
    expect(chipIds(editor)).toEqual([1, 2, 3]);

    const pos = chipPos(editor, 1);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    const handled = editor.view.someProp("handleKeyDown", (f) =>
      f(editor.view, new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }))
    );
    expect(handled).toBe(true);
    expect(chipIds(editor)).toEqual([2, 1, 3]);
  });

  it("moving left skips over the separator and lands before the previous chip", () => {
    const editor = makeEditor();
    const pos = chipPos(editor, 3);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    const handled = editor.view.someProp("handleKeyDown", (f) =>
      f(editor.view, new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true }))
    );
    expect(handled).toBe(true);
    expect(chipIds(editor)).toEqual([1, 3, 2]);
  });

  it("does nothing at the boundary (first chip moving left)", () => {
    const editor = makeEditor();
    const pos = chipPos(editor, 1);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    const handled = editor.view.someProp("handleKeyDown", (f) =>
      f(editor.view, new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true }))
    );
    expect(handled).toBeFalsy();
    expect(chipIds(editor)).toEqual([1, 2, 3]);
  });

  it("does not fire when the selection isn't a resourceChip NodeSelection", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(1);

    const handled = editor.view.someProp("handleKeyDown", (f) =>
      f(editor.view, new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }))
    );
    expect(handled).toBeFalsy();
    expect(chipIds(editor)).toEqual([1, 2, 3]);
  });
});
