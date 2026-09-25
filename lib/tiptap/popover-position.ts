// Nudges an already-positioned popover back inside the editor's own
// bounding box via a transform, rather than touching left/top directly --
// callers keep control of initial placement (caret-relative, anchor-
// relative, etc.), this just corrects overflow after the fact. Needed
// because popovers (slash-command menu, inline math editor) can open
// near the right/bottom edge of a table or the editor's own edge and
// otherwise render past it, visually overlapping the sidebar.
export function clampPopoverToEditor(popupEl: HTMLElement, editorRootEl: HTMLElement | null) {
  if (!editorRootEl) return;
  const container = editorRootEl.closest(".topic-prose") as HTMLElement | null;
  if (!container) return;

  // Reset first: getBoundingClientRect includes any transform from a
  // previous clamp, and translate offsets would otherwise compound on
  // every re-run (e.g. once per keystroke while editing math).
  popupEl.style.transform = "";

  const containerRect = container.getBoundingClientRect();
  const popupRect = popupEl.getBoundingClientRect();
  const margin = 8;

  let dx = 0;
  let dy = 0;

  if (popupRect.right > containerRect.right) {
    dx = containerRect.right - popupRect.right - margin;
  }
  if (popupRect.left + dx < containerRect.left) {
    dx = containerRect.left - popupRect.left + margin;
  }
  if (popupRect.bottom > containerRect.bottom) {
    dy = containerRect.bottom - popupRect.bottom - margin;
  }
  if (popupRect.top + dy < containerRect.top) {
    dy = containerRect.top - popupRect.top + margin;
  }

  if (dx || dy) {
    popupEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
