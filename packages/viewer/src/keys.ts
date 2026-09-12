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

// ---------------------------------------------------------------------------------------------
// The editor's stage keys (gslides-parity SPEC 10.1, 10.2)

/**
 * What the editor's stage reads before it resolves a key: whether a block is selected, whether
 * the slide is on the freeform layout (the arrows nudge there and are inert on a grammar slide),
 * whether a text run is being edited (InlineText owns every key then) and whether the event
 * target is a field or a chrome control (that control's keys win).
 */
export type EditorKeyContext = {
  selected: boolean;
  freeform: boolean;
  editing: boolean;
  editable: boolean;
  /** Apple platforms read Cmd; the others Ctrl */
  apple: boolean;
};

export type EditorKeyLike = KeyLike & { shiftKey?: boolean };

/** One resolved stage key. `inert` is a key the stage consumes and does nothing with (the arrows on a grammar slide). */
export type EditorKeyAction =
  | { type: 'escape' }
  | { type: 'enter' }
  | { type: 'delete' }
  | { type: 'tab'; delta: 1 | -1 }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'inert' }
  | { type: 'order'; move: 'forward' | 'backward' | 'front' | 'back' }
  | { type: 'duplicate' }
  | { type: 'selectAll' }
  | { type: 'cut' }
  | { type: 'copy' }
  | { type: 'paste'; plain: boolean }
  | { type: 'link' }
  | { type: 'bold' }
  | { type: 'paintCopy' }
  | { type: 'paintPaste' };

/** Arrow nudges on a freeform slide: one pixel, eight with Shift (SPEC 10.1). */
export const NUDGE_PX = 1;
export const NUDGE_SHIFT_PX = 8;

/**
 * The stage's key table (SPEC 10.1 "Move and arrange objects", 10.2): Esc leaves the mode,
 * Enter starts editing, Delete and Backspace remove, Tab and Shift Tab walk the blocks, the
 * arrows nudge on a freeform slide and are inert on a grammar slide, Cmd D duplicates, Cmd A
 * selects every block, Cmd X, C and V are the clipboard (Shift V pastes plain), Cmd Up and Down
 * order (Shift for front and back), Cmd K is the link, Cmd B the weight, Cmd Option C and V the
 * paint format. No bare letter, digit, Space or Shift letter does anything (SPEC 0.28): the
 * table returns null for every one of them, in every state, and editor-keys.test.ts asserts it.
 * Inside a field, a chrome control or an editing session the stage yields (null).
 */
export function editorKeyAction(e: EditorKeyLike, ctx: EditorKeyContext): EditorKeyAction | null {
  if (ctx.editable || ctx.editing) return null;
  const meta = ctx.apple ? e.metaKey === true : e.ctrlKey === true;
  const otherMod = ctx.apple ? e.ctrlKey === true : e.metaKey === true;
  const alt = e.altKey === true;
  const shift = e.shiftKey === true;
  const key = e.key;
  if (meta && alt && !otherMod) {
    const low = key.toLowerCase();
    if (low === 'c') return ctx.selected ? { type: 'paintCopy' } : null;
    if (low === 'v') return ctx.selected ? { type: 'paintPaste' } : null;
    return null;
  }
  if (alt || otherMod) return null;
  if (meta) {
    const low = key.toLowerCase();
    switch (low) {
      case 'd':
        return ctx.selected && !shift ? { type: 'duplicate' } : null;
      case 'a':
        return shift ? null : { type: 'selectAll' };
      case 'x':
        return ctx.selected && !shift ? { type: 'cut' } : null;
      case 'c':
        return ctx.selected && !shift ? { type: 'copy' } : null;
      case 'v':
        return { type: 'paste', plain: shift };
      case 'k':
        return ctx.selected && !shift ? { type: 'link' } : null;
      case 'b':
        return ctx.selected && !shift ? { type: 'bold' } : null;
      case 'arrowup':
        return ctx.selected ? { type: 'order', move: shift ? 'front' : 'forward' } : null;
      case 'arrowdown':
        return ctx.selected ? { type: 'order', move: shift ? 'back' : 'backward' } : null;
      default:
        return null;
    }
  }
  if (key === 'Tab') return { type: 'tab', delta: shift ? -1 : 1 };
  if (!ctx.selected) return null;
  switch (key) {
    case 'Escape':
      return { type: 'escape' };
    case 'Enter':
      return { type: 'enter' };
    case 'Delete':
    case 'Backspace':
      return { type: 'delete' };
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (!ctx.freeform) return { type: 'inert' };
      const step = shift ? NUDGE_SHIFT_PX : NUDGE_PX;
      const dx = key === 'ArrowRight' ? step : key === 'ArrowLeft' ? -step : 0;
      const dy = key === 'ArrowDown' ? step : key === 'ArrowUp' ? -step : 0;
      return { type: 'nudge', dx, dy };
    }
    default:
      return null;
  }
}

/** True for a key with no Cmd, Ctrl or Alt that prints a character: the keys the editor never binds (SPEC 0.28). */
export function isBareCharacterKey(e: EditorKeyLike): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return e.key.length === 1;
}
