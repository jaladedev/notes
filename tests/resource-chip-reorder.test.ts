// @vitest-environment jsdom
//
//
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ResourceChip } from "@/lib/tiptap/resource-node";

function chipPositions(editor: Editor) {
  const positions: { pos: number; id: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "resourceChip") positions.push({ pos, id: node.attrs.id });
    return true;
  });
  return positions;
}

function move(editor: Editor, sourcePos: number, targetPos: number) {
  const { state } = editor;
  const node = state.doc.nodeAt(sourcePos);
  if (!node || node.type.name !== "resourceChip")
    throw new Error("not a resourceChip at sourcePos");
  let tr = state.tr.delete(sourcePos, sourcePos + node.nodeSize);
  const insertPos = sourcePos < targetPos ? targetPos - node.nodeSize : targetPos;
  tr = tr.insert(insertPos, node.type.create(node.attrs));
  editor.view.dispatch(tr);
}

describe("resource/image chip drag-reorder (#34 -- transaction invariant behind the #6 fix)", () => {
  it("moving a chip forward preserves the other chips' relative order", () => {
    const editor = new Editor({
      extensions: [StarterKit, ResourceChip],
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

    const before = chipPositions(editor).map((c) => c.id);
    expect(before).toEqual([1, 2, 3]);

    // Drag chip 1 to after chip 3.
    const [chip1] = chipPositions(editor);
    const chip3 = chipPositions(editor).find((c) => c.id === 3)!;
    move(editor, chip1.pos, chip3.pos + 1);

    const after = chipPositions(editor).map((c) => c.id);
    expect(after).toEqual([2, 3, 1]);
  });

  it("moving a chip backward preserves the other chips' relative order", () => {
    const editor = new Editor({
      extensions: [StarterKit, ResourceChip],
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

    // Drag chip 3 to before chip 1.
    const chip1 = chipPositions(editor)[0];
    const chip3 = chipPositions(editor).find((c) => c.id === 3)!;
    move(editor, chip3.pos, chip1.pos);

    const after = chipPositions(editor).map((c) => c.id);
    expect(after).toEqual([3, 1, 2]);
  });
});
