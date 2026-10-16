/**
 * Scrolls a column of the docs that scrolls on its own (the navigation, the on this page column)
 * so its current entry is in view, without moving the window: `center` puts an entry that is out
 * of view in the middle (a new page's entry in the navigation), `nearest` moves the column the
 * least (the section the reader scrolls into). A column that does not scroll is left alone.
 */
export function revealIn(
  column: HTMLElement,
  entry: Element | null,
  align: 'center' | 'nearest',
): void {
  if (entry === null || column.scrollHeight <= column.clientHeight) return;
  const box = column.getBoundingClientRect();
  const at = entry.getBoundingClientRect();
  if (at.top >= box.top && at.bottom <= box.bottom) return;
  const offset =
    align === 'center'
      ? at.top - box.top - (box.height - at.height) / 2
      : at.top < box.top
        ? at.top - box.top
        : at.bottom - box.bottom;
  column.scrollTop += offset;
}
