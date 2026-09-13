import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * The key walk every picker grid shares (gslides-parity SPEC-2 section 10): the arrows move the
 * highlight through a grid of `count` tiles laid out `columns` wide, Home and End jump to the
 * first and last tile, Enter and Space pick, and ArrowLeft on the first column is left to the menu
 * that opened the plate (it closes the plate back to its row). Pure: the picker keeps the index.
 */
export type GridKeyResult = { index: number } | { pick: true } | null;

export function gridKey(
  event: ReactKeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  columns: number,
): GridKeyResult {
  const last = Math.max(0, count - 1);
  switch (event.key) {
    case 'ArrowRight':
      return { index: Math.min(last, index + 1) };
    case 'ArrowLeft':
      if (index % columns === 0) return null;
      return { index: Math.max(0, index - 1) };
    case 'ArrowDown':
      return { index: Math.min(last, index + columns) };
    case 'ArrowUp':
      return { index: Math.max(0, index - columns) };
    case 'Home':
      return { index: 0 };
    case 'End':
      return { index: last };
    case 'Enter':
    case ' ':
      return { pick: true };
    default:
      return null;
  }
}
