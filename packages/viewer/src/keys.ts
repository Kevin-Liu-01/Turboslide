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
 * What the editor's stage reads before it resolves a key: whether an object is selected, whether
 * the slide is a canvas already (informational since gslides-parity SPEC-2 0.87: the arrows nudge
 * on every slide kind and the first nudge converts), whether a text run is being edited
 * (InlineText owns every key then) and whether the event target is a field or a chrome control
 * (that control's keys win).
 */
export type EditorKeyContext = {
  selected: boolean;
  freeform: boolean;
  editing: boolean;
  editable: boolean;
  /** Apple platforms read Cmd; the others Ctrl */
  apple: boolean;
  /** two or more objects are selected: Cmd+Option+G groups them */
  several?: boolean;
  /** the selection is a group: Cmd+Option+Shift+G ungroups it */
  grouped?: boolean;
  /**
   * Tools > Advanced tools (docs/FOCUS.md section 3): false while the switch is off. In the focus
   * round the chords of the parked rows the stage also binds (Group and Ungroup, Paint format's
   * copy and paste) matched nothing while it was off; the return round put those rows back in the
   * default view (docs/RETURN.md 2.11, 2.12: `toolbar.paintFormat`, `arrange.group`,
   * `arrange.ungroup` lost their flag), so no stage chord reads the switch today
   * (`formatting.paint-format.chords`, `arrange.group.chords`; return/build/b4.md request 4). The
   * field stays for the next parked chord; the chrome's key table still drops every parked row
   * (useEditorKeys isPresent; the matrix row surface.parked-shortcut-unbound).
   */
  advanced?: boolean;
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
  | { type: 'paintPaste' }
  /* round two (gslides-parity SPEC-2 section 9) */
  | { type: 'rotate'; by: number }
  | { type: 'group' }
  | { type: 'ungroup' }
  | { type: 'mark'; mark: 'i' | 'u' | 's' | 'sup' | 'sub' }
  | { type: 'indent'; by: 1 | -1 };

/**
 * Arrow nudges on every slide kind: one pixel, ten with Shift (gslides-parity SPEC-2 0.87,
 * Google's "larger increment" read as 10; the round one 8 px grid step retires).
 */
export const NUDGE_PX = 1;
export const NUDGE_SHIFT_PX = 10;
/** Option+Left and Option+Right rotate 15 degrees, one with Shift (R04 B7, SPEC-2 0.78). */
export const ROTATE_KEY_DEG = 15;
export const ROTATE_KEY_FINE_DEG = 1;

/**
 * The stage's key table (SPEC 10.1 "Move and arrange objects", 10.2; gslides-parity SPEC-2
 * section 9): Esc leaves the mode, Enter starts editing, Delete and Backspace remove, Tab and
 * Shift Tab walk the objects, the arrows nudge 1 px and 10 px with Shift on every slide kind, Cmd
 * D duplicates, Cmd A selects every object, Cmd X, C and V are the clipboard (Shift V pastes
 * plain), Cmd Up and Down order (Shift for front and back), Cmd K is the link, Cmd B the weight,
 * Cmd I, U, Shift X, period and comma the marks over a selected object's text, Cmd ] and [ the
 * indents, Option Left and Right rotate 15 degrees (1 with Shift; Cmd Option Left and Right as
 * aliases), Cmd Option G and Cmd Option Shift G group and ungroup, Cmd Option C and V the paint
 * format. No bare letter, digit, Space or Shift letter does anything (SPEC 0.28): the table
 * returns null for every one of them, in every state, and editor-keys.test.ts asserts it. Inside
 * a field, a chrome control or an editing session the stage yields (null).
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
    /* Paint format's copy and paste (toolbar.paintFormat) and Group and Ungroup are default view
       rows since the return round (docs/RETURN.md 2.11, 2.12), so their chords stand whatever the
       switch says; the rotate aliases below belong to no menu row */
    if (low === 'c') return ctx.selected ? { type: 'paintCopy' } : null;
    if (low === 'v') return ctx.selected ? { type: 'paintPaste' } : null;
    /* Group Cmd+Option+G, Ungroup Cmd+Option+Shift+G (R04 B7, SPEC-2 section 9) */
    if (low === 'g' && ctx.selected) return shift ? { type: 'ungroup' } : { type: 'group' };
    if (low === 'g') return null;
    /* Cmd+Option+Left and Right: the 15 degree aliases when the browser lets them through (0.78) */
    if (key === 'ArrowLeft' && ctx.selected) return { type: 'rotate', by: -ROTATE_KEY_DEG };
    if (key === 'ArrowRight' && ctx.selected) return { type: 'rotate', by: ROTATE_KEY_DEG };
    return null;
  }
  if (alt && !meta && !otherMod && ctx.selected) {
    /* Google's rotate keys: Option+Left and Right 15 degrees, with Shift 1 degree (R04 B7, G1) */
    const step = shift ? ROTATE_KEY_FINE_DEG : ROTATE_KEY_DEG;
    if (key === 'ArrowLeft') return { type: 'rotate', by: -step };
    if (key === 'ArrowRight') return { type: 'rotate', by: step };
    return null;
  }
  if (alt || otherMod) return null;
  if (meta) {
    const low = key.toLowerCase();
    /* the marks with an object selected and no caret apply to the whole text (SPEC-2 section 9) */
    if (ctx.selected) {
      if (low === 'i' && !shift) return { type: 'mark', mark: 'i' };
      if (low === 'u' && !shift) return { type: 'mark', mark: 'u' };
      if (low === 'x' && shift) return { type: 'mark', mark: 's' };
      if (key === '.' && !shift) return { type: 'mark', mark: 'sup' };
      if (key === ',' && !shift) return { type: 'mark', mark: 'sub' };
      /* Increase and Decrease indent, Chrome's Forward and Back on macOS (0.55) */
      if (key === ']') return { type: 'indent', by: 1 };
      if (key === '[') return { type: 'indent', by: -1 };
    }
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
      /* every slide kind nudges (SPEC-2 0.87); the first nudge on a grammar slide converts it */
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

/** What the stage reads before a printable key starts a text session (AMENDMENTS.md A1 rule 4). */
export type TypingEntryContext = {
  /** exactly one object is selected and it carries a text run */
  textObject: boolean;
  /** two or more objects are selected: typing does nothing */
  several: boolean;
  /** a text session is open: the run owns every key */
  editing: boolean;
  /** the event target is a field or a chrome control: that control's key */
  editable: boolean;
  /** an IME composition is under way: the browser's */
  composing?: boolean;
};

/**
 * The character a printable key types into a selected text object, or null when the key starts
 * nothing (docs/gslides-parity/focus/AMENDMENTS.md A1 rule 4: "typing a printable character while
 * a text object is selected and no session is open starts the session with the whole text
 * selected, so the first character replaces the text", Google's behaviour). The table above still
 * binds no bare letter (SPEC 0.28): the letter is not a command, it is the first keystroke of the
 * session, and the Editor opens the session with the caret over everything and inserts it. A key
 * with Cmd, Ctrl or Alt, a named key (Enter, Escape, the arrows, Backspace), a selection of
 * several objects, an object without a run, an open session, a field or a composition all answer
 * null. Space and a Shift letter are printable and count.
 */
export function typingEntry(e: EditorKeyLike, ctx: TypingEntryContext): string | null {
  if (ctx.editing || ctx.editable || ctx.composing === true) return null;
  if (!ctx.textObject || ctx.several) return null;
  if (!isBareCharacterKey(e)) return null;
  return e.key;
}
