/**
 * Whether the slide a write asks to select afterwards (the copy of Duplicate slide, the slide of
 * New slide) may still take the selection (the focus round's cycle 3 merge, VERIFICATION C2-F21
 * `slides.duplicate.two-selected-menu`; b7's C3-R6). The controller selects that slide once the
 * server has acknowledged the write, which on the memory tier is the checkpoint's two second
 * idle, so a card the person clicked in between was overridden by the late selection: two cards
 * picked after Cmd+D collapsed to the copy and the Slide menu's Duplicate copied one slide. The
 * late selection lands only while the person has not moved on, that is while the active slide
 * is still the one that was active when the write was made or already the target itself.
 */
export function keepsPlace(
  active: string | null | undefined,
  from: string | null | undefined,
  target: string,
): boolean {
  if (active === target) return true;
  if (from === null || from === undefined) return true;
  return active === from;
}
