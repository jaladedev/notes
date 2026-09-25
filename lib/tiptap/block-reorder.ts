import { Extension } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

// Keyboard equivalent of the drag-handle reordering built for Section,
// Callout, CodeBlock, and MathBlock (see drag-utils.ts). Those are all
// mouse-only -- a keyboard/screen-reader user has no way to reorder a
// block at all today. Alt+Up/Down swaps the block containing the cursor
// with its previous/next sibling, mirroring what a drag-handle drop
// would do one position at a time.
//
// ResourceChip gets its own command below (moveResourceChip) rather than
// folding into this one: it's an *inline* node (lives inside a
// paragraph's content, not as a block sibling), selected via
// NodeSelection rather than a text cursor living "inside" it (it's an
// atom with no content), and "move" means swapping with an adjacent
// inline sibling within the same paragraph, not a block-level swap.
const DRAGGABLE_BLOCK_TYPES = new Set(["section", "callout", "codeBlock", "mathBlock"]);

// Walks up from the cursor to the shallowest ancestor whose type is one
// of the draggable block types (not the innermost block -- e.g. cursor
// in a paragraph inside a callout inside a section should move the
// callout, not the paragraph, and shallowest-first picks the section
// over the callout if both wrap the cursor).
function findDraggableAncestorDepth(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let depth = 1; depth <= $from.depth; depth++) {
    if (DRAGGABLE_BLOCK_TYPES.has($from.node(depth).type.name)) return depth;
  }
  return null;
}

function moveBlock(direction: "up" | "down") {
  return ({ state, dispatch, tr }: CommandProps): boolean => {
    const depth = findDraggableAncestorDepth(state);
    if (depth === null) return false;

    const { $from } = state.selection;
    const parent = $from.node(depth - 1);
    const index = $from.index(depth - 1);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= parent.childCount) return false;

    const currentNode = $from.node(depth);
    const siblingNode = parent.child(targetIndex);
    const posBeforeCurrent = $from.before(depth);
    const posAfterCurrent = $from.after(depth);

    let from: number;
    let to: number;
    let content: PMNode[];
    let newCurrentStart: number;

    if (direction === "up") {
      from = posBeforeCurrent - siblingNode.nodeSize;
      to = posAfterCurrent;
      content = [currentNode, siblingNode];
      newCurrentStart = from;
    } else {
      from = posBeforeCurrent;
      to = posAfterCurrent + siblingNode.nodeSize;
      content = [siblingNode, currentNode];
      newCurrentStart = posBeforeCurrent + siblingNode.nodeSize;
    }

    if (dispatch) {
      tr.replaceWith(from, to, content);
      // Keep the cursor with the block that moved, rather than letting
      // ProseMirror's default position-mapping leave it wherever the
      // old coordinates happen to land after the swap.
      const resolved = tr.doc.resolve(Math.min(newCurrentStart + 1, tr.doc.content.size));
      tr.setSelection(Selection.near(resolved));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// Moves a selected ResourceChip past its previous/next *chip* sibling
// within the same parent (a paragraph, typically) -- skipping over
// whatever plain content (usually just a space) separates chips in the
// paragraph, rather than swapping with that separator itself. A naive
// "swap with whatever the adjacent parent child is" would, for the
// common "chip, space, chip" layout, swap the chip with the space and
// need two presses to actually pass the next chip -- this scans past
// non-chip siblings to find the real target. Only fires when the
// current selection is actually a NodeSelection on a resourceChip --
// clicking a chip (or its drag handle) already produces exactly that
// selection, so no extra plumbing is needed to make it reachable, just
// a command that acts on it.
function moveResourceChip(direction: "left" | "right") {
  return ({ state, dispatch, tr }: CommandProps): boolean => {
    const { selection } = state;
    if (!(selection instanceof NodeSelection)) return false;
    const node = selection.node;
    if (node.type.name !== "resourceChip") return false;

    const $from = selection.$from;
    const parent = $from.parent;
    const parentStart = $from.start();
    const currentIndex = $from.index();

    let targetIndex = -1;
    if (direction === "left") {
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (parent.child(i).type.name === "resourceChip") {
          targetIndex = i;
          break;
        }
      }
    } else {
      for (let i = currentIndex + 1; i < parent.childCount; i++) {
        if (parent.child(i).type.name === "resourceChip") {
          targetIndex = i;
          break;
        }
      }
    }
    if (targetIndex === -1) return false; // no other chip in that direction

    // Absolute position of the target chip, computed from the
    // pre-transaction snapshot (summing sibling sizes up to its index).
    let targetPos = parentStart;
    for (let i = 0; i < targetIndex; i++) targetPos += parent.child(i).nodeSize;
    const targetNode = parent.child(targetIndex);

    const sourcePos = selection.from;
    const sourceSize = node.nodeSize;

    if (dispatch) {
      tr.delete(sourcePos, sourcePos + sourceSize);
      // Deleting the source shifts everything after it left by its size
      // -- only matters if the target was after the source.
      const adjustedTargetPos = sourcePos < targetPos ? targetPos - sourceSize : targetPos;
      const insertPos =
        direction === "left" ? adjustedTargetPos : adjustedTargetPos + targetNode.nodeSize;
      tr.insert(insertPos, node.type.create(node.attrs));
      // Re-select the chip as a NodeSelection (not just a nearby text
      // cursor) so repeated Alt+Left/Right presses keep moving the same
      // chip instead of losing the selection after the first move.
      tr.setSelection(NodeSelection.create(tr.doc, insertPos));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export const BlockReorderShortcuts = Extension.create({
  name: "blockReorderShortcuts",

  addKeyboardShortcuts() {
    return {
      "Alt-ArrowUp": () => this.editor.commands.command(moveBlock("up")),
      "Alt-ArrowDown": () => this.editor.commands.command(moveBlock("down")),
      // Mod-Alt variants too -- plain Alt+Arrow is taken by some window
      // managers/browsers for tab or history navigation.
      "Mod-Alt-ArrowUp": () => this.editor.commands.command(moveBlock("up")),
      "Mod-Alt-ArrowDown": () => this.editor.commands.command(moveBlock("down")),
      // ResourceChip is inline, so its reorder axis is left/right, not
      // up/down -- these are no-ops (return false, let the shortcut fall
      // through to normal caret movement) unless a chip is actually
      // NodeSelection'd.
      "Alt-ArrowLeft": () => this.editor.commands.command(moveResourceChip("left")),
      "Alt-ArrowRight": () => this.editor.commands.command(moveResourceChip("right")),
      "Mod-Alt-ArrowLeft": () => this.editor.commands.command(moveResourceChip("left")),
      "Mod-Alt-ArrowRight": () => this.editor.commands.command(moveResourceChip("right")),
    };
  },
});
