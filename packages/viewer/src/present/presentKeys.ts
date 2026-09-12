import type { BlankSlide } from './presentModel';

/**
 * The keys of a running slideshow (gslides-parity SPEC 9.2; R04 A10, Google's presenting table)
 * as data and one pure resolver, in the shape of `keys.ts` for the reading surface. Every row of
 * Google's table is bound: Esc stops; Right and Left; a number then Enter; Home and End; S opens
 * Presenter view; A is inert with a snackbar; L toggles the laser pointer; Cmd+P prints;
 * Cmd+Shift+C is inert (captions are omitted); Cmd+Shift+F or F11 toggles full screen; B or .
 * shows a black slide and W or , a white one, and any key returns. Space, Enter, Page Down and
 * Page Up also advance and Backspace goes back (the PowerPoint convention SPEC 9.2 adopts). Every
 * other bare key is swallowed, so the reading surface's letters (G, D, S as the list) never act
 * while presenting. The studio's Slideshow component owns the listener; `presentKeyAction` is what
 * it and the vitest agree on.
 */

export type PresentKeyAction =
  | { type: 'exit' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'digit'; digit: string }
  | { type: 'go' }
  | { type: 'notes' }
  | { type: 'audience' }
  | { type: 'laser' }
  | { type: 'print' }
  | { type: 'captions' }
  | { type: 'fullscreen' }
  | { type: 'blank'; blank: BlankSlide }
  | { type: 'unblank' }
  /** consumed and inert: a bare key Google's table does not list */
  | { type: 'swallow' };

export type PresentKeyLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

export type PresentPlatform = 'mac' | 'win';

export type PresentKeyContext = {
  /** the blank slide up, if any: the next key returns from it */
  blank: BlankSlide | null;
  /** digits are waiting for Enter */
  digits: boolean;
  /** the event target is a button, link or field of the slideshow's own controls */
  control: boolean;
  /** the event target is a text field: nothing here acts */
  editable: boolean;
  platform: PresentPlatform;
};

/** Keys whose keydown is a modifier alone or a focus move: never consumed. */
const PASS_THROUGH = new Set([
  'Shift',
  'Meta',
  'Control',
  'Alt',
  'AltGraph',
  'CapsLock',
  'Tab',
  'Fn',
  'Dead',
  'Unidentified',
]);

/** The one modifier of the chords: Cmd on a Mac, Ctrl elsewhere (R04 B10). */
function primary(e: PresentKeyLike, platform: PresentPlatform): boolean {
  return platform === 'mac' ? Boolean(e.metaKey) : Boolean(e.ctrlKey);
}

/** What a key does in a slideshow, or null when it passes through untouched. */
export function presentKeyAction(
  e: PresentKeyLike,
  ctx: PresentKeyContext,
): PresentKeyAction | null {
  const key = e.key;
  if (PASS_THROUGH.has(key)) return null;
  if (ctx.editable) return null;
  const low = key.length === 1 ? key.toLowerCase() : key;

  /* the three chords of the table; every other Cmd, Ctrl or Alt combination is the browser's */
  if (primary(e, ctx.platform) && !e.altKey) {
    if (low === 'p' && !e.shiftKey) return { type: 'print' };
    if (low === 'c' && e.shiftKey) return { type: 'captions' };
    if (low === 'f' && e.shiftKey) return { type: 'fullscreen' };
    return null;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (key === 'F11') return { type: 'fullscreen' };

  /* a blank slide: any key returns to the show and does nothing else (R04 A10) */
  if (ctx.blank !== null) return { type: 'unblank' };

  if (key === 'Escape') return { type: 'exit' };

  /* a focused control keeps Enter and Space for itself */
  if (ctx.control && (key === 'Enter' || key === ' ')) return null;

  if (key.length === 1 && key >= '0' && key <= '9') return { type: 'digit', digit: key };
  if (key === 'Enter') return ctx.digits ? { type: 'go' } : { type: 'next' };
  if (key === 'ArrowRight' || key === ' ' || key === 'PageDown') return { type: 'next' };
  if (key === 'ArrowLeft' || key === 'PageUp' || key === 'Backspace') return { type: 'previous' };
  if (key === 'Home') return { type: 'first' };
  if (key === 'End') return { type: 'last' };
  if (low === 's') return { type: 'notes' };
  if (low === 'a') return { type: 'audience' };
  if (low === 'l') return { type: 'laser' };
  if (low === 'b' || key === '.') return { type: 'blank', blank: 'black' };
  if (low === 'w' || key === ',') return { type: 'blank', blank: 'white' };
  return { type: 'swallow' };
}

/** One row of the Keyboard shortcuts card of a show: the keys, then what they do. */
export type PresentKeyRow = { keys: string; action: string; note?: string };

/**
 * Google's presenting table in the wording the shortcuts dialog uses (the labels match the
 * `present.*` bindings of the chrome's key table), with the platform's modifier spelled out. The
 * two rows the round leaves inert say so in `note`.
 */
export function presentKeyRows(platform: PresentPlatform): readonly PresentKeyRow[] {
  const mod = platform === 'mac' ? 'Cmd' : 'Ctrl';
  return [
    { keys: 'Esc', action: 'Stop presenting' },
    { keys: 'Right arrow, Space, Enter, Page down, or a click on the slide', action: 'Next' },
    { keys: 'Left arrow, Backspace, Page up', action: 'Previous' },
    { keys: 'Home', action: 'First slide' },
    { keys: 'End', action: 'Last slide' },
    { keys: 'A number, then Enter', action: 'Go to that slide' },
    { keys: 'S', action: 'Open speaker notes' },
    {
      keys: 'A',
      action: 'Open audience tools',
      note: 'Not available in Turboslide yet',
    },
    { keys: 'L', action: 'Toggle laser pointer' },
    { keys: `${mod} P`, action: 'Print' },
    {
      keys: `${mod} Shift C`,
      action: 'Toggle captions',
      note: 'Not available in Turboslide',
    },
    { keys: platform === 'mac' ? 'Cmd Shift F or F11' : 'F11', action: 'Toggle full screen' },
    { keys: 'B or .', action: 'Show a blank black slide' },
    { keys: 'W or ,', action: 'Show a blank white slide' },
    { keys: 'Any key', action: 'Return from a blank slide' },
  ];
}
