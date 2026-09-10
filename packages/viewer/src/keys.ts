/**
 * The deck viewer's key table as data and one pure resolver (SPEC 6.9;
 * tail.html keydown). The React shell's owner is useShellKeys in
 * @turboslide/chrome, which keeps Prototemplate's handler; the standalone
 * runtime carries the same switch inline because it ships as one classic
 * script. This module is the reference both are tested against: the table
 * is what the help card documents, and keyAction() is what a vitest and the
 * runtime check agree with.
 */

export type ViewerMode = 'slide' | 'grid' | 'book';

export type KeyAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'digit'; digit: string }
  | { type: 'go' }
  | { type: 'grid' }
  | { type: 'book' }
  | { type: 'sidebar' }
  | { type: 'theme' }
  | { type: 'present' }
  | { type: 'fullscreen' }
  | { type: 'help' }
  | { type: 'escape' };

export type KeyLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
};

export type KeyContext = {
  mode: ViewerMode;
  /** digits are waiting for Enter */
  digits: boolean;
  /** the event target is an input or textarea: only Escape acts */
  editable: boolean;
};

/** The help card rows the deck shows (tail.html, the help table), in its wording. */
export const KEY_ROWS: readonly { keys: string; action: string }[] = [
  { keys: 'Right, Space, J, L', action: 'Next slide' },
  { keys: 'Left, K, H', action: 'Previous slide' },
  { keys: 'Home, End', action: 'First and last slide' },
  { keys: '1 to 9, then Enter', action: 'Go to a slide number' },
  { keys: 'G', action: 'Grid of every slide' },
  { keys: 'B', action: 'Book view, the deck read top to bottom' },
  { keys: '[ or S', action: 'Show or hide the slide list' },
  { keys: 'D', action: 'Dark or light' },
  { keys: 'P', action: 'Presentation mode, chrome hidden' },
  { keys: 'F', action: 'Fullscreen' },
  { keys: '?', action: 'Keyboard shortcuts' },
  { keys: 'Esc', action: 'Back to the slide view, or close a panel' },
];

/** What a key does in the deck viewer, or null when it does nothing. */
export function keyAction(e: KeyLike, ctx: KeyContext): KeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = e.key;
  if (ctx.editable) return k === 'Escape' ? { type: 'escape' } : null;
  if (k.length === 1 && k >= '0' && k <= '9') return { type: 'digit', digit: k };
  if (k === 'Enter' && ctx.digits) return { type: 'go' };
  const inBook = ctx.mode === 'book';
  if (
    k === 'ArrowRight' ||
    k === ' ' ||
    k === 'PageDown' ||
    k === 'j' ||
    k === 'l' ||
    (inBook && k === 'ArrowDown')
  )
    return { type: 'next' };
  if (
    k === 'ArrowLeft' ||
    k === 'PageUp' ||
    k === 'k' ||
    k === 'h' ||
    k === 'Backspace' ||
    (inBook && k === 'ArrowUp')
  )
    return { type: 'prev' };
  if (k === 'Home') return { type: 'first' };
  if (k === 'End') return { type: 'last' };
  if (k === 'g') return { type: 'grid' };
  if (k === 'b') return { type: 'book' };
  if (k === '[' || k === 's') return { type: 'sidebar' };
  if (k === 'd') return { type: 'theme' };
  if (k === 'p') return { type: 'present' };
  if (k === 'f') return { type: 'fullscreen' };
  if (k === '?') return { type: 'help' };
  if (k === 'Escape') return { type: 'escape' };
  return null;
}
