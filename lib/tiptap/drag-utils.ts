/**
 * Shared `stopEvent` for every node using native ProseMirror
 * drag-to-reorder (Section, Callout, ResourceChip's three views,
 * MathBlock, CodeBlock).
 *
 * Background: TipTap's *default* stopEvent (used when a node view
 * passes no override at all) already has its own built-in handling for
 * a `[data-drag-handle]` mousedown -- it sets `this.isDragging = true`
 * and attaches its own document-level mouseup/mousemove listeners to
 * manage the drag start. Section and Callout were relying on exactly
 * that default (they set no stopEvent of their own), while ResourceChip
 * and MathBlock supply this custom override instead. Empirically only
 * the custom-override side actually repositions a node on drop --
 * Section/Callout showed a working-looking drag handle and cursor, but
 * dropping did nothing. The two mousedown-handling paths (TipTap's
 * built-in one, and our own `dragArmed` React state toggling the DOM
 * `draggable` attribute) were competing for the same mousedown, and the
 * built-in one was winning without completing an actual move.
 *
 * Fix: give every draggable node the same override, so there's only
 * ever one mousedown handler in play (our own `dragArmed` state) and
 * native drag/drop events always reach ProseMirror's own dragstart/drop
 * handling unfiltered.
 *
 * The one thing this can't be is a blanket `() => true` for anything
 * that isn't a drag/drop event -- Section and Callout have real
 * editable content inside them (via `NodeViewContent`, marked with the
 * `data-node-view-content` attribute), so blanket-stopping every
 * non-drag event would also stop ordinary clicks/typing/selection
 * *inside that editable content*, breaking editing entirely. Atom nodes
 * (ResourceChip, MathBlock) have no such region -- the
 * `data-node-view-content` check below is simply never true for them,
 * so they keep behaving exactly as before.
 */
export function dragAwareStopEvent({ event }: { event: Event }) {
  const isDragEvent = event.type.startsWith("drag") || event.type === "drop";
  if (isDragEvent) return false;

  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-node-view-content]")) return false;

  return true;
}
