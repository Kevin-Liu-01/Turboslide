import type { MenuItem, MenuPredicate, Platform, Shortcut } from './model.ts';
import { MENUS, TITLE_ROW_ITEMS, TOOLBAR_HEAD, TOOLBAR_TAIL_DEFAULT, walkItems } from './model.ts';

/**
 * Keyboard shortcuts of the Google Slides parity round (SPEC 10, R04 Part B). One chord grammar
 * for the model, the menus, the tooltips, the shortcuts dialog and the key handlers:
 *
 *   chord    := modifier ('+' modifier)* '+' key | key
 *   modifier := 'Cmd' | 'Ctrl' | 'Option' | 'Alt' | 'Shift'      (canonical order as listed)
 *   key      := a single character ('Z', '0', '/', '\', ']', '>') | a named key
 *   named    := Plus | Minus | Enter | Esc | Tab | Space | Delete | Backspace | Home | End |
 *               PageUp | PageDown | Up | Down | Left | Right | F1 .. F12
 *   binding  := chord (' or ' chord)*          alternates, any one of them fires
 *   sequence := chord ' then ' key             Google's two step chords (Select none)
 *
 * Mac chords say Cmd and Option, Windows chords say Ctrl and Alt; a Mac chord may also carry Ctrl
 * (Ctrl+M, Ctrl+Shift+F, the access keys, the resize chords). `winChordOf` derives the Windows
 * form the way Google's shortcut page does: Cmd becomes Ctrl, Option becomes Alt, and Cmd+Ctrl
 * becomes Ctrl+Alt. Letters are written in capitals; matching is case insensitive.
 *
 * The editor map (`buildEditorKeymap`) is derived from the menu model plus the bindings below
 * that have no menu item (the filmstrip keys, Find, Save, the navigation chords, the nudge,
 * rotate and resize keys, the context menu key). `shortcuts.test.ts` checks it against the R04
 * fixture: every Google row is bound, bound as disabled, or listed in `OMITTED_SHORTCUTS` with a
 * reason; no two enabled chords in one scope collide unless `SHARED_CHORDS` says they dispatch by
 * focus; and no chord in the editor scopes is a bare letter (SPEC 0.28, 10.2).
 *
 * Round two (SPEC-2 section 9) binds the text marks, Justify, the indents, Group and Ungroup,
 * Google's rotate keys, and the canvas keys on every slide kind (the nudge, the resize chords, Tab
 * in z order); a binding's `note` is the sentence the shortcuts dialog prints under its row (the
 * browser keys of Subscript and Superscript, the Cmd+Option rotate alias of SPEC-2 0.78), an
 * `alias` binding is a Turboslide alternate chord for a Google row (listed in
 * `TURBOSLIDE_ONLY_KEYS`, folded into its row's note), and a `Gesture` without a Google row is a
 * Turboslide addition (`turboslide: true`).
 *
 * Round three (SPEC-3 section 14) binds the comment chords: Insert comment, Enter current
 * comment, the discussion thread, Hide comments, the two step Next and Previous comment, and the
 * letters j, k, r, e and u inside a card or on a marker. The letters live in the `comment` scope,
 * which the card owns the way present mode owns its letters: they are listed in the dialog under
 * Comments and never enter the editor map, so SPEC 0.28 (no bare letter in the editor) still holds
 * on the map the handlers read. Shift+Tab from an open menu focuses the roster (01 G5). Relative
 * imports here carry the `.ts` extension so the parity audit script can load the module under Node.
 */

export type Chord = {
  cmd: boolean;
  ctrl: boolean;
  /** Option on a Mac, Alt elsewhere */
  alt: boolean;
  shift: boolean;
  /** the canonical key name: 'Z', '/', 'Plus', 'Enter', 'F10' */
  key: string;
  /** the second step of a two step chord ('A' in 'Ctrl+Cmd+U then A'), none for a plain chord */
  then?: string;
};

const MODIFIERS = new Set(['cmd', 'ctrl', 'option', 'alt', 'shift']);

const NAMED_KEYS: Readonly<Record<string, string>> = {
  plus: 'Plus',
  minus: 'Minus',
  enter: 'Enter',
  return: 'Enter',
  esc: 'Esc',
  escape: 'Esc',
  tab: 'Tab',
  space: 'Space',
  delete: 'Delete',
  del: 'Delete',
  backspace: 'Backspace',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
};

/** The key names a chord may end in besides a single character. */
export function isNamedKey(key: string): boolean {
  return Object.values(NAMED_KEYS).includes(key) || /^F([1-9]|1[0-2])$/.test(key);
}

function canonicalKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') throw new Error('a chord needs a key');
  const named = NAMED_KEYS[trimmed.toLowerCase()];
  if (named !== undefined) return named;
  if (/^f([1-9]|1[0-2])$/i.test(trimmed)) return trimmed.toUpperCase();
  if (trimmed === '+') return 'Plus';
  if (trimmed === '-') return 'Minus';
  if (trimmed.length === 1) return trimmed.toUpperCase();
  throw new Error(`unknown key "${trimmed}"`);
}

/** Parses one chord ('Cmd+Shift+H', 'Ctrl+Cmd+U then A', 'Delete'). */
export function parseChord(text: string): Chord {
  const [main, then] = text.split(/\s+then\s+/i);
  if (main === undefined || main.trim() === '') throw new Error(`empty chord in "${text}"`);
  /* a trailing '+' or '-' is the key, not a separator: 'Cmd++' and 'Cmd+-' */
  const parts = main.trim().match(/^(.*?)\+?([+-])$/);
  const tokens =
    parts &&
    parts[1] !== undefined &&
    parts[1] !== '' &&
    MODIFIERS.has(parts[1].split('+').at(-1)?.toLowerCase() ?? '')
      ? [...parts[1].split('+'), parts[2] ?? '']
      : main.trim().split('+');
  const chord: Chord = { cmd: false, ctrl: false, alt: false, shift: false, key: '' };
  tokens.forEach((token, index) => {
    const word = token.trim().toLowerCase();
    const last = index === tokens.length - 1;
    if (!last && MODIFIERS.has(word)) {
      if (word === 'cmd') chord.cmd = true;
      else if (word === 'ctrl') chord.ctrl = true;
      else if (word === 'shift') chord.shift = true;
      else chord.alt = true;
    } else if (last) {
      chord.key = canonicalKey(token);
    } else {
      throw new Error(`unknown modifier "${token}" in "${text}"`);
    }
  });
  if (then !== undefined) chord.then = canonicalKey(then);
  return chord;
}

/** The chords of a binding string: 'Cmd+Y or Cmd+Shift+Z' gives two, '' gives none. */
export function chordsOf(binding: string | undefined): Chord[] {
  if (binding === undefined || binding.trim() === '') return [];
  return binding.split(/\s+or\s+/i).map((part) => parseChord(part));
}

/** The canonical text of a chord, in the modifier order of the grammar. */
export function chordText(chord: Chord, platform: Platform = 'mac'): string {
  const parts: string[] = [];
  if (chord.cmd) parts.push('Cmd');
  if (chord.ctrl) parts.push('Ctrl');
  if (chord.alt) parts.push(platform === 'mac' ? 'Option' : 'Alt');
  if (chord.shift) parts.push('Shift');
  parts.push(chord.key);
  const text = parts.join('+');
  return chord.then === undefined ? text : `${text} then ${chord.then}`;
}

/** The canonical form of a binding string: every chord reparsed and rejoined with ' or '. */
export function normalizeBinding(binding: string, platform: Platform = 'mac'): string {
  return chordsOf(binding)
    .map((chord) => chordText(chord, platform))
    .join(' or ');
}

/**
 * The Windows form of a Mac binding, the way Google's shortcut page derives it: Cmd becomes Ctrl,
 * Option becomes Alt, Cmd+Ctrl becomes Ctrl+Alt (the resize chords). Rows where Google prints
 * something else (Find and replace, Strikethrough, Slideshow) pass their Windows form explicitly.
 */
export function winChordOf(mac: string): string {
  return chordsOf(mac)
    .map((chord) => {
      const win: Chord = {
        cmd: false,
        ctrl: chord.cmd || chord.ctrl,
        alt: chord.alt || (chord.cmd && chord.ctrl),
        shift: chord.shift,
        key: chord.key,
      };
      if (chord.then !== undefined) win.then = chord.then;
      return chordText(win, 'win');
    })
    .join(' or ');
}

const MAC_SYMBOLS: Readonly<Record<string, string>> = {
  Cmd: '⌘',
  Ctrl: '⌃',
  Option: '⌥',
  Shift: '⇧',
  Enter: '↩',
  Esc: 'Esc',
  Tab: '⇥',
  Delete: '⌫',
  Backspace: '⌫',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Plus: '+',
  Minus: '-',
  Space: 'Space',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
};

const WORD_KEYS: Readonly<Record<string, string>> = {
  Plus: '+',
  Minus: '-',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
};

export type ChordStyle = 'symbols' | 'words';

/**
 * A chord for display. The menus print Google's forms: symbols on a Mac ('⌘⇧H', '⌃M'), words
 * joined with '+' on Windows ('Ctrl+H'). The tooltips use words on both platforms, because the
 * Tooltip primitive's key chip is read as words ('Cmd Shift H').
 */
export function formatChord(chord: Chord, platform: Platform, style: ChordStyle): string {
  if (platform === 'mac' && style === 'symbols') {
    const parts: string[] = [];
    if (chord.ctrl) parts.push(MAC_SYMBOLS.Ctrl ?? '');
    if (chord.alt) parts.push(MAC_SYMBOLS.Option ?? '');
    if (chord.shift) parts.push(MAC_SYMBOLS.Shift ?? '');
    if (chord.cmd) parts.push(MAC_SYMBOLS.Cmd ?? '');
    parts.push(MAC_SYMBOLS[chord.key] ?? chord.key);
    const text = parts.join('');
    return chord.then === undefined ? text : `${text} then ${chord.then}`;
  }
  const parts: string[] = [];
  /* a Mac chord shown on Windows reads Cmd as Ctrl, the way Google's page derives the Windows form */
  if (chord.ctrl || (platform === 'win' && chord.cmd)) parts.push('Ctrl');
  if (chord.cmd && platform === 'mac') parts.push('Cmd');
  if (chord.alt) parts.push(platform === 'mac' ? 'Option' : 'Alt');
  if (chord.shift) parts.push('Shift');
  parts.push(WORD_KEYS[chord.key] ?? chord.key);
  const text = parts.join(style === 'words' && platform === 'mac' ? ' ' : '+');
  return chord.then === undefined ? text : `${text} then ${chord.then}`;
}

/** The first chord of a shortcut on a platform, formatted; empty when the platform has none. */
export function shortcutLabel(key: Shortcut, platform: Platform, style: ChordStyle): string {
  const [first] = chordsOf(platform === 'mac' ? key.mac : key.win);
  return first === undefined ? '' : formatChord(first, platform, style);
}

/** Every chord of a shortcut on a platform, formatted, for the shortcuts dialog. */
export function shortcutLabels(key: Shortcut, platform: Platform, style: ChordStyle): string[] {
  return chordsOf(platform === 'mac' ? key.mac : key.win).map((chord) =>
    formatChord(chord, platform, style),
  );
}

/** The key as the Tooltip primitive's chip reads it: words separated by spaces ('Cmd Shift H'). */
export function tooltipKey(key: Shortcut | undefined, platform: Platform): string | undefined {
  if (key === undefined) return undefined;
  const [first] = chordsOf(platform === 'mac' ? key.mac : key.win);
  if (first === undefined) return undefined;
  return formatChord(first, platform, 'words').replace(/\+/g, ' ');
}

const ARIA_KEYS: Readonly<Record<string, string>> = {
  Plus: 'Plus',
  Minus: 'Minus',
  Esc: 'Escape',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Space: 'Space',
};

/** The `aria-keyshortcuts` value of a shortcut on a platform (WAI-ARIA 1.2 key names). */
export function ariaKeyShortcuts(
  key: Shortcut | undefined,
  platform: Platform,
): string | undefined {
  if (key === undefined) return undefined;
  const chords = chordsOf(platform === 'mac' ? key.mac : key.win);
  if (chords.length === 0) return undefined;
  return chords
    .map((chord) => {
      const parts: string[] = [];
      if (chord.ctrl) parts.push('Control');
      if (chord.alt) parts.push('Alt');
      if (chord.shift) parts.push('Shift');
      if (chord.cmd) parts.push('Meta');
      parts.push(ARIA_KEYS[chord.key] ?? chord.key);
      return parts.join('+');
    })
    .join(' ');
}

// ---------------------------------------------------------------------------------------------
// Matching keyboard events

/** The fields of a KeyboardEvent the matcher reads, so tests can pass plain objects. */
export type KeyLike = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

const EVENT_KEYS: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
  '+': 'Plus',
  '=': 'Plus',
  '-': 'Minus',
  _: 'Minus',
};

/** The canonical key name of an event: letters from `code` when Option or Alt is down (the key would be a dead or composed character). */
export function eventKeyName(event: KeyLike): string {
  const mapped = EVENT_KEYS[event.key];
  if (mapped !== undefined) return mapped;
  if (event.code !== undefined) {
    const letter = /^Key([A-Z])$/.exec(event.code);
    if (
      letter?.[1] !== undefined &&
      (event.altKey || event.key.length !== 1 || !/[a-z]/i.test(event.key))
    )
      return letter[1];
    const digit = /^Digit(\d)$/.exec(event.code);
    if (digit?.[1] !== undefined && event.altKey) return digit[1];
    if (event.code === 'Equal' && event.altKey) return 'Plus';
    if (event.code === 'Minus' && event.altKey) return 'Minus';
  }
  if (event.key.length === 1) {
    if (event.shiftKey && event.key === '.') return '>';
    if (event.shiftKey && event.key === ',') return '<';
    return event.key.toUpperCase();
  }
  return event.key;
}

/**
 * True when the event is the chord on the platform. On a Mac, Cmd is `metaKey` and Ctrl is
 * `ctrlKey`; on Windows a chord's Ctrl is `ctrlKey` and Cmd never appears. Shift is compared only
 * when the chord's key is a letter, digit or named key, because '>' and '<' need Shift on most
 * keyboards and '/' does not, so a chord written without Shift for a punctuation key matches
 * either way. A two step chord matches on its first step only; the caller holds the second step.
 */
export function matchesChord(chord: Chord, event: KeyLike, platform: Platform): boolean {
  const name = eventKeyName(event);
  if (name !== chord.key) {
    /* Delete and Backspace are one key on Google's Windows list; a chord written Delete accepts both */
    if (!(chord.key === 'Delete' && name === 'Backspace')) return false;
  }
  const cmd = platform === 'mac' ? event.metaKey : false;
  const ctrl = platform === 'mac' ? event.ctrlKey : event.ctrlKey || event.metaKey;
  if (cmd !== chord.cmd || ctrl !== chord.ctrl || event.altKey !== chord.alt) return false;
  const shiftMatters = /^[A-Z0-9]$/.test(chord.key) || isNamedKey(chord.key) || chord.shift;
  return shiftMatters ? event.shiftKey === chord.shift : true;
}

/** True when any chord of the binding matches the event. */
export function matchesBinding(binding: string, event: KeyLike, platform: Platform): boolean {
  return chordsOf(binding).some((chord) => matchesChord(chord, event, platform));
}

/** True when the shortcut fires on the event for the platform. */
export function matchesShortcut(key: Shortcut, event: KeyLike, platform: Platform): boolean {
  return matchesBinding(platform === 'mac' ? key.mac : key.win, event, platform);
}

/** Apple platforms read Cmd, the others Ctrl; the studio's `apple` flag maps to this. */
export function detectPlatform(
  nav: { platform?: string; userAgent?: string } | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator,
): Platform {
  const text = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/i.test(text) ? 'mac' : 'win';
}

// ---------------------------------------------------------------------------------------------
// Google's own spelling

/**
 * Normalizes one chord as Google's shortcut page prints it (R04 Part B) into the grammar above:
 * 'Cmd + Shift + h' becomes 'Cmd+Shift+H'; 'hold Ctrl + Cmd, press u then a' becomes
 * 'Ctrl+Cmd+U then A'; 'Fn + Left arrow' is the Home key and 'Fn + Right arrow' the End key on a
 * Mac keyboard; 'Cmd + \ (back slash)' drops its gloss; 'Page Up' and 'Right arrow' become the
 * named keys. Alternates joined by 'or' are kept as alternates.
 */
export function normalizeGoogleChord(text: string): string {
  return text
    .split(/\s+or\s+/i)
    .map((part) => {
      let chord = part.trim().replace(/\s*\([^)]*\)\s*$/, '');
      const held = /^hold\s+(.+?),\s*press\s+(\S+)\s+then\s+(\S+)$/i.exec(chord);
      if (held) chord = `${held[1]} + ${held[2]} then ${held[3]}`;
      /* "hold Ctrl + Enter" (Enter current comment, SPEC-3 14): the held word alone is a plain chord */
      chord = chord.replace(/^hold\s+/i, '');
      chord = chord
        .replace(/\bFn \+ Left arrow\b/i, 'Home')
        .replace(/\bFn \+ Right arrow\b/i, 'End')
        .replace(/\b(Up|Down|Left|Right) arrow(s)?\b/gi, '$1')
        .replace(/\bArrow keys\b/i, 'Arrows')
        .replace(/\bPage Up\b/i, 'PageUp')
        .replace(/\bPage Down\b/i, 'PageDown')
        .replace(/\s*\+\s*/g, '+')
        .replace(/\s+then\s+/i, ' then ');
      /* "Arrow keys" is the four arrows; the nudge rows bind them as alternates */
      if (chord === 'Arrows') return 'Up or Down or Left or Right';
      if (chord === 'Shift+Arrows') return 'Shift+Up or Shift+Down or Shift+Left or Shift+Right';
      return normalizeBinding(chord, /\bCmd\b|\bOption\b/.test(chord) ? 'mac' : 'win');
    })
    .join(' or ');
}

// ---------------------------------------------------------------------------------------------
// The editor map

/**
 * Where a binding applies. The editor map is every scope but `present` (section 9.2) and
 * `comment` (SPEC-3 14: the letters inside a comment card or on a focused marker, which the card
 * dispatches itself, as the slideshow dispatches its own).
 */
export type KeyScope = 'editor' | 'filmstrip' | 'canvas' | 'text' | 'menu' | 'present' | 'comment';

/** The scopes the card and the slideshow own: their letters never enter the editor map. */
export const OWN_MAP_SCOPES: ReadonlySet<KeyScope> = new Set<KeyScope>(['present', 'comment']);

/** Google's group names on the shortcuts page (R04 Part B), the headings of the shortcuts dialog. */
export type ShortcutGroup =
  | 'Common actions'
  | 'Film strip actions'
  | 'Navigation'
  | 'Menus'
  | 'Comments'
  | 'Text'
  | 'Move and arrange objects'
  | 'Presenting'
  | 'Video player'
  | 'Screen reader support';

export type KeyBinding = {
  /** a stable id: the menu item id, or `key.<name>` for a binding with no menu item */
  id: string;
  label: string;
  key: Shortcut;
  scope: KeyScope;
  group: ShortcutGroup;
  /** `now` fires, `later` is listed grey with `reason` and never fires */
  status: 'now' | 'later';
  reason?: string;
  /** the R04 fixture row ids this binding answers (`google-shortcuts.json`) */
  google: ReadonlyArray<string>;
  /** the menu items that print this chord */
  items: ReadonlyArray<string>;
  /** when the handler runs: the predicate name, else always */
  enabled?: MenuPredicate;
  /** one sentence the shortcuts dialog prints under the row (SPEC-2 section 9) */
  note?: string;
  /** the binding this chord is a Turboslide alternate for; the dialog folds it into that row's note */
  alias?: string;
};

type Extra = Omit<KeyBinding, 'id' | 'items' | 'status'> & { id: string; status?: 'now' | 'later' };

function extra(binding: Extra): KeyBinding {
  return { ...binding, id: `key.${binding.id}`, items: [], status: binding.status ?? 'now' };
}

const K = (mac: string, win: string = winChordOf(mac)): Shortcut => ({ mac, win });

/* the notes the shortcuts dialog prints under a row (SPEC-2 section 9, 0.78) */
const ROTATE_ALIAS_NOTE =
  'Cmd+Option+Left and Right also rotate when your browser lets them through';
const BROWSER_KEY_NOTE = 'Your browser may take this key; the Format menu has the item';

/**
 * Bindings with no menu item of their own (SPEC 10.1). The filmstrip and canvas scopes fire only
 * while that region has focus; `text` while the caret is in a run or a cell.
 */
export const EXTRA_BINDINGS: ReadonlyArray<KeyBinding> = [
  extra({
    id: 'find',
    label: 'Find',
    key: K('Cmd+F'),
    scope: 'editor',
    group: 'Common actions',
    google: ['find'],
  }),
  extra({
    id: 'findAgain',
    label: 'Find again',
    key: K('Cmd+G'),
    scope: 'editor',
    group: 'Common actions',
    google: ['find-again'],
  }),
  extra({
    id: 'findPrevious',
    label: 'Find previous',
    key: K('Cmd+Shift+G'),
    scope: 'editor',
    group: 'Common actions',
    google: ['find-previous'],
  }),
  extra({
    id: 'save',
    label: 'Save (every change is saved automatically)',
    key: K('Cmd+S'),
    scope: 'editor',
    group: 'Common actions',
    google: ['save'],
  }),
  extra({
    id: 'openLink',
    label: 'Open link',
    key: K('Option+Enter'),
    scope: 'editor',
    group: 'Common actions',
    google: ['open-link'],
    enabled: 'linkSelected',
  }),
  extra({
    id: 'copyFormatting',
    label: 'Copy formatting of the selected text or shape',
    key: K('Cmd+Option+C'),
    scope: 'editor',
    group: 'Common actions',
    google: ['copy-formatting'],
    enabled: 'blockSelected',
  }),
  extra({
    id: 'pasteFormatting',
    label: 'Paste formatting of the selected text or shape',
    key: K('Cmd+Option+V'),
    scope: 'editor',
    group: 'Common actions',
    google: ['paste-formatting'],
    enabled: 'blockSelected',
  }),
  extra({
    id: 'previousSlide',
    label: 'Move to previous slide',
    key: K('Up', 'PageUp or Up'),
    scope: 'filmstrip',
    group: 'Film strip actions',
    google: ['previous-slide'],
  }),
  extra({
    id: 'nextSlide',
    label: 'Move to next slide',
    key: K('Down', 'PageDown or Down'),
    scope: 'filmstrip',
    group: 'Film strip actions',
    google: ['next-slide'],
  }),
  extra({
    id: 'firstSlide',
    label: 'Move focus to first slide',
    key: K('Home', 'Home'),
    scope: 'filmstrip',
    group: 'Film strip actions',
    google: ['first-slide'],
  }),
  extra({
    id: 'lastSlide',
    label: 'Move focus to last slide',
    key: K('End', 'End'),
    scope: 'filmstrip',
    group: 'Film strip actions',
    google: ['last-slide'],
  }),
  extra({
    id: 'selectPreviousSlide',
    label: 'Select previous slide',
    key: K('Shift+Up'),
    scope: 'filmstrip',
    group: 'Film strip actions',
    google: ['select-previous-slide'],
  }),
  extra({
    id: 'selectNextSlide',
    label: 'Select next slide',
    key: K('Shift+Down'),
    scope: 'filmstrip',
    group: 'Film strip actions',
    google: ['select-next-slide'],
  }),
  extra({
    id: 'selectFirstSlide',
    label: 'Select first slide',
    key: K('Shift+Home'),
    scope: 'filmstrip',
    group: 'Film strip actions',
    google: ['select-first-slide'],
  }),
  extra({
    id: 'selectLastSlide',
    label: 'Select last slide',
    key: K('Shift+End'),
    scope: 'filmstrip',
    group: 'Film strip actions',
    google: ['select-last-slide'],
  }),
  extra({
    id: 'focusFilmstrip',
    label: 'Move to filmstrip',
    key: K('Cmd+Option+Shift+F'),
    scope: 'editor',
    group: 'Navigation',
    google: ['move-to-filmstrip'],
  }),
  extra({
    id: 'focusCanvas',
    label: 'Move to canvas',
    key: K('Cmd+Option+Shift+C'),
    scope: 'editor',
    group: 'Navigation',
    google: ['move-to-canvas'],
  }),
  extra({
    id: 'focusNotes',
    label: 'Open speaker notes panel',
    key: K('Cmd+Option+Shift+S'),
    scope: 'editor',
    group: 'Navigation',
    google: ['open-speaker-notes'],
  }),
  extra({
    id: 'escape',
    label: 'Exit the current mode',
    key: K('Esc', 'Esc'),
    scope: 'editor',
    group: 'Navigation',
    google: ['exit-current-mode'],
  }),
  extra({
    id: 'contextMenu',
    label: 'Context menu',
    key: K('Cmd+Shift+\\ or Shift+F10', 'Ctrl+Shift+\\ or Ctrl+Shift+X or Shift+F10'),
    scope: 'editor',
    group: 'Menus',
    google: ['context-menu'],
  }),
  extra({
    id: 'nextShape',
    label: 'Select next shape',
    key: K('Tab', 'Tab'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['select-next-shape'],
  }),
  extra({
    id: 'previousShape',
    label: 'Select previous shape',
    key: K('Shift+Tab'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['select-previous-shape'],
  }),
  extra({
    id: 'nudge',
    label: 'Nudge one pixel at a time',
    key: K('Up or Down or Left or Right', 'Up or Down or Left or Right'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['nudge'],
    enabled: 'objectSelected',
  }),
  extra({
    id: 'nudgeMore',
    label: 'Nudge by a larger increment',
    key: K('Shift+Up or Shift+Down or Shift+Left or Shift+Right'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['nudge-larger'],
    enabled: 'objectSelected',
  }),
  extra({
    id: 'resizeWider',
    label: 'Resize larger horizontally',
    key: K('Cmd+Ctrl+B'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['resize-larger-horizontally'],
    enabled: 'objectSelected',
  }),
  extra({
    id: 'resizeTaller',
    label: 'Resize larger vertically',
    key: K('Cmd+Ctrl+I'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['resize-larger-vertically'],
    enabled: 'objectSelected',
  }),
  extra({
    id: 'resizeSmaller',
    label: 'Resize smaller',
    key: K('Cmd+Ctrl+J'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['resize-smaller'],
    enabled: 'objectSelected',
  }),
  extra({
    id: 'resizeLarger',
    label: 'Resize larger',
    key: K('Cmd+Ctrl+K'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['resize-larger'],
    enabled: 'objectSelected',
  }),
  extra({
    id: 'resizeShorter',
    label: 'Resize smaller vertically',
    key: K('', 'Ctrl+Alt+9'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['resize-smaller-vertically'],
    enabled: 'objectSelected',
  }),
  extra({
    id: 'resizeNarrower',
    label: 'Resize smaller horizontally',
    key: K('Cmd+Ctrl+W'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['resize-smaller-horizontally'],
    enabled: 'objectSelected',
  }),
  extra({
    id: 'commit',
    label: 'Exit crop mode',
    key: K('Enter', 'Enter'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['exit-crop-mode'],
  }),
  /* rotation (SPEC-2 section 9, 0.78, R04 B7): with an object selected and no caret, on every slide
     kind; Option+Left and Option+Right move the caret by a word inside a run, so the canvas scope.
     Cmd+Option+Left and Right are honoured as 15 degree aliases when the browser lets the event
     through (Chrome on macOS switches tabs with the pair); the dialog prints Google's keys and the note */
  extra({
    id: 'rotateLeft15',
    label: 'Rotate counterclockwise by 15 degrees',
    key: K('Option+Left'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['rotate-ccw-15'],
    enabled: 'rotatable',
    note: ROTATE_ALIAS_NOTE,
  }),
  extra({
    id: 'rotateRight15',
    label: 'Rotate clockwise by 15 degrees',
    key: K('Option+Right'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['rotate-cw-15'],
    enabled: 'rotatable',
    note: ROTATE_ALIAS_NOTE,
  }),
  extra({
    id: 'rotateLeft15Alias',
    label: 'Rotate counterclockwise by 15 degrees',
    key: K('Cmd+Option+Left'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: [],
    enabled: 'rotatable',
    alias: 'key.rotateLeft15',
  }),
  extra({
    id: 'rotateRight15Alias',
    label: 'Rotate clockwise by 15 degrees',
    key: K('Cmd+Option+Right'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: [],
    enabled: 'rotatable',
    alias: 'key.rotateRight15',
  }),
  extra({
    id: 'rotateLeft1',
    label: 'Rotate counterclockwise by 1 degree',
    key: K('Option+Shift+Left'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['rotate-ccw-1'],
    enabled: 'rotatable',
  }),
  extra({
    id: 'rotateRight1',
    label: 'Rotate clockwise by 1 degree',
    key: K('Option+Shift+Right'),
    scope: 'canvas',
    group: 'Move and arrange objects',
    google: ['rotate-cw-1'],
    enabled: 'rotatable',
  }),
  /* list levels (SPEC-2 section 9): Tab at the start of a list item; Google's shortcut page has
     no row for it, so the pair is listed as ours (TURBOSLIDE_ONLY_KEYS) */
  extra({
    id: 'listLevelUp',
    label: 'Move a list item down a level',
    key: K('Tab', 'Tab'),
    scope: 'text',
    group: 'Text',
    google: [],
    enabled: 'listLevelUp',
  }),
  extra({
    id: 'listLevelDown',
    label: 'Move a list item up a level',
    key: K('Shift+Tab'),
    scope: 'text',
    group: 'Text',
    google: [],
    enabled: 'listLevelDown',
  }),
  /* the comment chords (SPEC-3 section 14; 01 G5, G13): the modifier chords fire in the editor
     scope over the comment under focus; the letters fire inside a card or on a focused marker
     and belong to the `comment` scope, outside the editor map (SPEC 0.28) */
  extra({
    id: 'comment.enter',
    label: 'Enter current comment',
    key: K('Ctrl+Enter', 'Ctrl+Enter'),
    scope: 'editor',
    group: 'Comments',
    google: ['enter-comment'],
    enabled: 'readComments',
  }),
  extra({
    id: 'comment.thread',
    label: 'Open comment discussion thread',
    key: K('Cmd+Option+Shift+A'),
    scope: 'editor',
    group: 'Comments',
    google: ['comment-thread'],
    enabled: 'readComments',
  }),
  extra({
    id: 'comment.next',
    label: 'Move to next comment in the presentation',
    key: K('Cmd+Ctrl+N then C'),
    scope: 'editor',
    group: 'Comments',
    google: ['next-comment'],
    enabled: 'readComments',
    note: 'Hold the modifiers, press N, then C',
  }),
  extra({
    id: 'comment.previous',
    label: 'Move to previous comment in the presentation',
    key: K('Cmd+Ctrl+P then C'),
    scope: 'editor',
    group: 'Comments',
    google: ['previous-comment'],
    enabled: 'readComments',
    note: 'Hold the modifiers, press P, then C',
  }),
  extra({
    id: 'comment.focusNext',
    label: 'When focus is on a comment, move to the next comment',
    key: K('J', 'J'),
    scope: 'comment',
    group: 'Comments',
    google: ['comment-focus-next', 'comment-next-selected'],
  }),
  extra({
    id: 'comment.focusPrevious',
    label: 'When focus is on a comment, move to the previous comment',
    key: K('K', 'K'),
    scope: 'comment',
    group: 'Comments',
    google: ['comment-focus-previous', 'comment-previous-selected'],
  }),
  extra({
    id: 'comment.reply',
    label: 'When focus is on a comment, reply to it',
    key: K('R', 'R'),
    scope: 'comment',
    group: 'Comments',
    google: ['comment-focus-reply', 'comment-reply-selected'],
  }),
  extra({
    id: 'comment.resolve',
    label: 'When focus is on a comment, resolve it',
    key: K('E', 'E'),
    scope: 'comment',
    group: 'Comments',
    google: ['comment-focus-resolve', 'comment-resolve-selected'],
  }),
  extra({
    id: 'comment.exit',
    label: 'When focus is on a comment, leave it',
    key: K('U', 'U'),
    scope: 'comment',
    group: 'Comments',
    google: ['comment-exit-selected'],
    note: 'Esc leaves the comment too',
  }),
  extra({
    id: 'comment.exitEsc',
    label: 'When focus is on a comment, leave it',
    key: K('Esc', 'Esc'),
    scope: 'comment',
    group: 'Comments',
    google: [],
    alias: 'key.comment.exit',
  }),
  /* the Collaborators list (SPEC-3 0.42, 4.5; 01 G5): Shift+Tab from any open menu focuses the
     roster; Google's help page documents it and its shortcut page has no row for it */
  extra({
    id: 'roster',
    label: 'Collaborators list, from an open menu',
    key: K('Shift+Tab'),
    scope: 'menu',
    group: 'Menus',
    google: [],
  }),
  /* presenting (SPEC 9.2, R04 A10): B6 binds them; the dialog lists them from here */
  extra({
    id: 'present.stop',
    label: 'Stop presenting',
    key: K('Esc', 'Esc'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-stop'],
  }),
  extra({
    id: 'present.next',
    label: 'Next',
    key: K('Right', 'Right'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-next'],
  }),
  extra({
    id: 'present.previous',
    label: 'Previous',
    key: K('Left', 'Left'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-previous'],
  }),
  extra({
    id: 'present.first',
    label: 'First slide',
    key: K('Home', 'Home'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-first'],
  }),
  extra({
    id: 'present.last',
    label: 'Last slide',
    key: K('End', 'End'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-last'],
  }),
  extra({
    id: 'present.notes',
    label: 'Open speaker notes',
    key: K('S', 'S'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-notes'],
  }),
  extra({
    id: 'present.audience',
    label: 'Open audience tools',
    key: K('A', 'A'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-audience'],
    status: 'later',
    reason: 'Audience tools need a question service',
  }),
  extra({
    id: 'present.laser',
    label: 'Toggle laser pointer',
    key: K('L', 'L'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-laser'],
  }),
  extra({
    id: 'present.print',
    label: 'Print',
    key: K('Cmd+P'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-print'],
  }),
  extra({
    id: 'present.fullScreen',
    label: 'Toggle full screen',
    key: K('Cmd+Shift+F', 'F11'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-full-screen'],
  }),
  extra({
    id: 'present.black',
    label: 'Show a blank black slide',
    key: K('B or .', 'B or .'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-black'],
  }),
  extra({
    id: 'present.white',
    label: 'Show a blank white slide',
    key: K('W or ,', 'W or ,'),
    scope: 'present',
    group: 'Presenting',
    google: ['present-white'],
  }),
];

/**
 * Google rows the round does not bind, each with the reason the shortcuts dialog prints in grey
 * (SPEC 10.1; SPEC-2 section 9 fixed the greyed list: Select none, Move paragraph, Open animations
 * panel, the screen reader chords, the input tools keys, Open Explore, Turn on captions, the HTML
 * view, the cell border chord, Select list item and Select list items at current level, Move to
 * next and previous text formatting change; SPEC-3 section 14 takes Insert comment and the comment
 * chords off it) or leaves out. `status: 'later'` rows show in the dialog greyed with the stub
 * formula, so their reasons are default view sentences; `omit` rows are absent from it.
 */
export type OmittedShortcut = {
  google: string;
  status: 'later' | 'omit';
  reason: string;
};

const SCREEN_READER_GREY = 'Your screen reader reads the page as it is';
const INPUT_TOOLS_GREY = 'The operating system input methods work in every field';
const LIST_CHORD_GREY = 'A screen reader chord; lists are edited as text';

export const OMITTED_SHORTCUTS: ReadonlyArray<OmittedShortcut> = [
  /* SPEC-2 0.61: Select none is a menu item; its two key sequence stays unbound */
  {
    google: 'select-none',
    status: 'later',
    reason: 'Esc clears the selection; Edit > Select none does the same',
  },
  {
    google: 'captions-while-presenting',
    status: 'later',
    reason: 'Captions are a browser speech service in English only',
  },
  {
    google: 'html-view',
    status: 'later',
    reason: 'The web page download is the HTML form of the presentation',
  },
  { google: 'animations-panel', status: 'later', reason: 'The GT theme presents still slides' },
  { google: 'animation-preview', status: 'omit', reason: 'No animations' },
  { google: 'open-explore', status: 'later', reason: 'Google retired Explore in 2024' },
  {
    google: 'open-dictionary',
    status: 'omit',
    reason: 'The operating system dictionary works on selected text',
  },
  { google: 'side-panel', status: 'omit', reason: 'Tab reaches the right panel' },
  {
    google: 'cell-border-selection',
    status: 'later',
    reason: 'Border colour applies to the selected cells',
  },
  { google: 'play-video', status: 'omit', reason: 'No video' },
  { google: 'accessibility-menu', status: 'omit', reason: SCREEN_READER_GREY },
  { google: 'input-tools-menu', status: 'later', reason: INPUT_TOOLS_GREY },
  { google: 'toggle-input-controls', status: 'later', reason: INPUT_TOOLS_GREY },
  {
    google: 'move-paragraph-down',
    status: 'later',
    reason: 'Paragraphs are moved by cut and paste',
  },
  { google: 'move-paragraph-up', status: 'later', reason: 'Paragraphs are moved by cut and paste' },
  { google: 'select-list-item', status: 'later', reason: LIST_CHORD_GREY },
  { google: 'select-list-items-level', status: 'later', reason: LIST_CHORD_GREY },
  { google: 'next-formatting-change', status: 'later', reason: 'A screen reader chord' },
  { google: 'previous-formatting-change', status: 'later', reason: 'A screen reader chord' },
  /* SPEC-2 section 9 leaves the misspelling rows out of the greyed list: the browser's spelling
     marks have no key the page can drive */
  {
    google: 'next-misspelling',
    status: 'omit',
    reason: 'Your browser marks misspellings and steps through them from its own menu',
  },
  {
    google: 'previous-misspelling',
    status: 'omit',
    reason: 'Your browser marks misspellings and steps through them from its own menu',
  },
  {
    google: 'add-to-selection',
    status: 'omit',
    reason: 'A Chrome OS row; Shift+click and Cmd+click extend the selection',
  },
  {
    google: 'present-captions',
    status: 'omit',
    reason: 'Captions are a browser speech service in English only',
  },
  {
    google: 'present-goto',
    status: 'omit',
    reason: 'A number then Enter is a sequence, not a chord; B6 binds it in present mode',
  },
  { google: 'video-play-pause', status: 'omit', reason: 'No video' },
  { google: 'video-rewind', status: 'omit', reason: 'No video' },
  { google: 'video-forward', status: 'omit', reason: 'No video' },
  { google: 'video-previous-frame', status: 'omit', reason: 'No video' },
  { google: 'video-next-frame', status: 'omit', reason: 'No video' },
  { google: 'video-slower', status: 'omit', reason: 'No video' },
  { google: 'video-faster', status: 'omit', reason: 'No video' },
  { google: 'video-seek', status: 'omit', reason: 'No video' },
  { google: 'video-captions', status: 'omit', reason: 'No video' },
  { google: 'video-full-screen', status: 'omit', reason: 'No video' },
  { google: 'video-mute', status: 'omit', reason: 'No video' },
  { google: 'verbalize-selection', status: 'later', reason: SCREEN_READER_GREY },
  { google: 'screen-reader-support', status: 'later', reason: SCREEN_READER_GREY },
  { google: 'braille-support', status: 'later', reason: SCREEN_READER_GREY },
  { google: 'verbalize-from-cursor', status: 'later', reason: SCREEN_READER_GREY },
  { google: 'announce-formatting', status: 'later', reason: SCREEN_READER_GREY },
];

/**
 * Mouse gestures with a modifier (SPEC 10.1, R04 B7; SPEC-2 section 9): not chords, listed in the
 * dialog under Move and arrange objects and Navigation. `mac` and `win` name the modifier the way
 * Google prints it; a gesture with no Google row is a Turboslide addition (`turboslide: true`).
 */
export type Gesture = {
  id: string;
  label: string;
  mac: string;
  win: string;
  group: ShortcutGroup;
  /** the R04 fixture row; absent on a Turboslide gesture */
  google?: string;
  turboslide?: true;
};

export const GESTURES: ReadonlyArray<Gesture> = [
  {
    id: 'constrainRotation',
    label: 'Constrain to 15 degree rotation increments',
    mac: 'Shift+rotate',
    win: 'Shift+rotate',
    group: 'Move and arrange objects',
    google: 'constrain-rotation',
  },
  {
    id: 'suppressGuides',
    label: 'Suppress guides',
    mac: 'Cmd+drag',
    win: 'Alt+drag',
    group: 'Move and arrange objects',
    google: 'suppress-guides',
  },
  {
    id: 'duplicateDrag',
    label: 'Duplicate',
    mac: 'Option+drag',
    win: 'Ctrl+drag',
    group: 'Move and arrange objects',
    google: 'duplicate-drag',
  },
  {
    id: 'resizeFromCenter',
    label: 'Resize from center',
    mac: 'Option+resize',
    win: 'Ctrl+resize',
    group: 'Move and arrange objects',
    google: 'resize-from-center',
  },
  {
    id: 'constrainAxis',
    label: 'Constrain to vertical or horizontal movements',
    mac: 'Shift+drag',
    win: 'Shift+drag',
    group: 'Move and arrange objects',
    google: 'constrain-axis',
  },
  {
    id: 'constrainAspect',
    label: "Constrain to object's aspect ratio",
    mac: 'Shift+resize',
    win: 'Shift+resize',
    group: 'Move and arrange objects',
    google: 'constrain-aspect',
  },
  /* SPEC-2 0.81, section 9: zoom about the pointer and pan while zoomed; Google prints no row for
     either (the wheel zoom is unverified for Google, the pan is a Turboslide addition) */
  {
    id: 'zoomWheel',
    label: 'Zoom about the pointer',
    mac: 'Cmd+scroll or pinch',
    win: 'Ctrl+scroll or pinch',
    group: 'Navigation',
    turboslide: true,
  },
  {
    id: 'pan',
    label: 'Pan while zoomed',
    mac: 'Space+drag',
    win: 'Space+drag',
    group: 'Navigation',
    turboslide: true,
  },
];

/**
 * Chords two menu items print on purpose. `focus` pairs dispatch by focus (the filmstrip moves
 * the slide, the canvas orders the block; SPEC 10.2); `same` pairs run one effect from two menus
 * (Insert > New slide and Slide > New slide). Any other collision fails `shortcuts.test.ts`.
 */
export const SHARED_CHORDS: ReadonlyArray<{ items: ReadonlyArray<string>; why: 'focus' | 'same' }> =
  [
    { items: ['edit.duplicate', 'slide.duplicateSlide'], why: 'focus' },
    { items: ['slide.moveSlide.up', 'arrange.order.bringForward'], why: 'focus' },
    { items: ['slide.moveSlide.down', 'arrange.order.sendBackward'], why: 'focus' },
    { items: ['slide.moveSlide.toBeginning', 'arrange.order.bringToFront'], why: 'focus' },
    { items: ['slide.moveSlide.toEnd', 'arrange.order.sendToBack'], why: 'focus' },
    { items: ['insert.newSlide', 'slide.newSlide', 'toolbar.newSlide'], why: 'same' },
    { items: ['view.slideshow', 'title.slideshow'], why: 'same' },
    { items: ['insert.comment', 'toolbar.insertComment'], why: 'same' },
    { items: ['help.searchMenus', 'toolbar.search'], why: 'same' },
    { items: ['edit.undo', 'toolbar.undo'], why: 'same' },
    { items: ['edit.redo', 'toolbar.redo'], why: 'same' },
    { items: ['file.print', 'toolbar.print'], why: 'same' },
    { items: ['file.versionHistory.see', 'title.lastEdit'], why: 'same' },
    { items: ['view.fullScreen', 'toolbar.hideMenus'], why: 'same' },
    { items: ['toolbar.paintFormat', 'key.copyFormatting', 'key.pasteFormatting'], why: 'same' },
  ];

/** The chords a menu item, toolbar control or extra binding prints, with the menu group it lists under. */
function groupOfMenu(menuId: string): ShortcutGroup {
  switch (menuId) {
    case 'edit':
    case 'file':
    case 'help':
    case 'title':
      return 'Common actions';
    case 'view':
      return 'Navigation';
    case 'format':
      return 'Text';
    case 'slide':
      return 'Film strip actions';
    case 'arrange':
      return 'Move and arrange objects';
    default:
      return 'Common actions';
  }
}

function scopeOfMenu(menuId: string): KeyScope {
  if (menuId === 'arrange') return 'canvas';
  return 'editor';
}

function bindingOfItem(
  item: MenuItem,
  menuId: string,
  google: ReadonlyArray<string>,
): KeyBinding | null {
  if (item.key === undefined || item.status === 'omit') return null;
  const binding: KeyBinding = {
    id: item.id,
    label: item.label,
    key: item.key,
    scope: item.id.startsWith('slide.moveSlide') ? 'filmstrip' : scopeOfMenu(menuId),
    group: groupOfMenu(menuId),
    status: item.status,
    google,
    items: [item.id],
  };
  if (item.stubReason !== undefined) binding.reason = item.stubReason;
  if (item.enabled !== undefined) binding.enabled = item.enabled;
  const note = ITEM_NOTES[item.id];
  if (note !== undefined) binding.note = note;
  const group = ITEM_GROUPS[item.id];
  if (group !== undefined) binding.group = group;
  return binding;
}

/** The rows Google's shortcut page lists under a group other than their menu's (SPEC-3 14: the comment rows). */
export const ITEM_GROUPS: Readonly<Record<string, ShortcutGroup>> = {
  'insert.comment': 'Comments',
  'view.comments.hide': 'Comments',
};

/**
 * The sentence the shortcuts dialog prints under a menu item's row (SPEC-2 section 9): Cmd+, opens
 * Chrome's settings on macOS before the page sees it, and Cmd+. is unverified on Safari.
 */
export const ITEM_NOTES: Readonly<Record<string, string>> = {
  'format.text.subscript': BROWSER_KEY_NOTE,
  'format.text.superscript': BROWSER_KEY_NOTE,
};

/**
 * The R04 fixture rows each menu item with a key answers (the fixture ids of
 * `google-shortcuts.json`). An item with a key that is not here is a Turboslide key with no Google
 * row, which `shortcuts.test.ts` refuses in the editor map.
 */
export const ITEM_GOOGLE_ROWS: Readonly<Record<string, ReadonlyArray<string>>> = {
  'title.lastEdit': ['revision-history'],
  'title.slideshow': ['present'],
  'title.slideshow.startFromBeginning': ['present-from-beginning'],
  'file.open': ['open'],
  'file.versionHistory.see': ['revision-history'],
  'file.print': ['print'],
  'edit.undo': ['undo'],
  'edit.redo': ['redo'],
  'edit.cut': ['cut'],
  'edit.copy': ['copy'],
  'edit.paste': ['paste'],
  'edit.pasteWithoutFormatting': [],
  'edit.delete': ['delete'],
  'edit.duplicate': ['duplicate-slide', 'duplicate'],
  'edit.selectAll': ['select-all'],
  'edit.findReplace': ['find-and-replace'],
  'view.slideshow': ['present'],
  'view.zoom.in': ['zoom-in'],
  'view.zoom.out': ['zoom-out'],
  'view.zoom.100': ['zoom-100'],
  'view.fullScreen': ['compact-mode'],
  'view.comments.hide': ['hide-comment'],
  'insert.link': ['insert-link'],
  'insert.comment': ['insert-comment'],
  'insert.newSlide': ['new-slide'],
  'format.text.bold': ['bold'],
  'format.text.italic': ['italic'],
  'format.text.underline': ['underline'],
  'format.text.strikethrough': ['strikethrough'],
  'format.text.superscript': ['superscript'],
  'format.text.subscript': ['subscript'],
  'format.text.size.increase': ['increase-font-size'],
  'format.text.size.decrease': ['decrease-font-size'],
  'format.alignIndent.left': ['left-align'],
  'format.alignIndent.center': ['center-align'],
  'format.alignIndent.right': ['right-align'],
  'format.alignIndent.justified': ['justify'],
  'format.alignIndent.increaseIndent': ['increase-indent'],
  'format.alignIndent.decreaseIndent': ['decrease-indent'],
  'format.bulletsNumbering.bulleted': ['bulleted-list'],
  'format.bulletsNumbering.numbered': ['numbered-list'],
  'format.clearFormatting': ['clear-formatting'],
  'format.altText': ['alt-text'],
  'slide.newSlide': ['new-slide'],
  'slide.duplicateSlide': ['duplicate-slide'],
  'slide.moveSlide.up': ['move-slide-up'],
  'slide.moveSlide.down': ['move-slide-down'],
  'slide.moveSlide.toBeginning': ['move-slide-to-beginning'],
  'slide.moveSlide.toEnd': ['move-slide-to-end'],
  'arrange.order.bringToFront': ['bring-to-front'],
  'arrange.order.bringForward': ['bring-forward'],
  'arrange.order.sendBackward': ['send-backward'],
  'arrange.order.sendToBack': ['send-to-back'],
  'arrange.group': ['group'],
  'arrange.ungroup': ['ungroup'],
  'help.searchMenus': ['tool-finder'],
  'help.keyboardShortcuts': ['show-shortcuts'],
  'toolbar.search': ['tool-finder'],
  'toolbar.newSlide': ['new-slide'],
  'toolbar.undo': ['undo'],
  'toolbar.redo': ['redo'],
  'toolbar.print': ['print'],
  'toolbar.paintFormat': ['copy-formatting', 'paste-formatting'],
  'toolbar.insertComment': ['insert-comment'],
  'toolbar.hideMenus': ['compact-mode'],
};

/**
 * Keys with no row on Google's shortcut page: Paste without formatting is Google's item with a key
 * the Slides page does not print (R01 Edit), Extensions takes Ctrl+Option+X because Google
 * publishes no access key for it (SPEC 2.11), Tab and Shift+Tab move a list item between levels
 * as Google's editor does without a row for it (SPEC-2 section 9), Cmd+Option+Left and Right are
 * the 15 degree rotate aliases of SPEC-2 0.78, Esc leaves a comment card beside Google's u
 * (SPEC-3 14), and Shift+Tab from an open menu focuses the Collaborators list, which Google's help
 * page documents (01 G5) and its shortcut page does not print.
 */
export const TURBOSLIDE_ONLY_KEYS: ReadonlyArray<string> = [
  'edit.pasteWithoutFormatting',
  'menu.extensions',
  'key.listLevelUp',
  'key.listLevelDown',
  'key.rotateLeft15Alias',
  'key.rotateRight15Alias',
  'key.comment.exitEsc',
  'key.roster',
];

/**
 * The full key table: every menu item and toolbar control with a key, the menu access keys, and
 * the extra bindings. One entry per item; `collisions` of the same chord are checked by the test.
 */
export function buildKeyTable(): KeyBinding[] {
  const table: KeyBinding[] = [];
  for (const item of TITLE_ROW_ITEMS) {
    for (const each of walkItems([item])) {
      const binding = bindingOfItem(each, 'title', ITEM_GOOGLE_ROWS[each.id] ?? []);
      if (binding) table.push(binding);
    }
  }
  for (const menu of MENUS) {
    for (const item of walkItems(menu.items)) {
      const binding = bindingOfItem(item, menu.id, ITEM_GOOGLE_ROWS[item.id] ?? []);
      if (binding) table.push(binding);
    }
    table.push({
      id: `menu.${menu.id}`,
      label: `${menu.label} menu`,
      key: menu.key,
      scope: 'menu',
      group: 'Menus',
      status: 'now',
      /* Google publishes no access key for Extensions (SPEC 2.11) */
      google: menu.id === 'extensions' ? [] : [`menu-${menu.id}`],
      items: [],
    });
  }
  for (const control of [...TOOLBAR_HEAD, ...TOOLBAR_TAIL_DEFAULT]) {
    if (control.key === undefined || control.status === 'omit') continue;
    const binding: KeyBinding = {
      id: control.control,
      label: control.label,
      key: control.key,
      scope: 'editor',
      group: 'Common actions',
      status: control.status,
      google: ITEM_GOOGLE_ROWS[control.control] ?? [],
      items: [control.control],
    };
    if (control.stubReason !== undefined) binding.reason = control.stubReason;
    table.push(binding);
  }
  table.push(...EXTRA_BINDINGS);
  return table;
}

/** A chord on one platform with the bindings that print it. */
export type KeymapEntry = { chord: string; bindings: KeyBinding[] };

/**
 * The editor map for a platform: every enabled chord outside present mode and the comment card,
 * keyed by its canonical text, with the bindings that own it. A chord with two bindings is a
 * collision unless the pair is in `SHARED_CHORDS`; the handlers dispatch a shared chord by focus.
 */
export function buildEditorKeymap(
  platform: Platform,
  table: ReadonlyArray<KeyBinding> = buildKeyTable(),
): Map<string, KeymapEntry> {
  const map = new Map<string, KeymapEntry>();
  for (const binding of table) {
    if (OWN_MAP_SCOPES.has(binding.scope) || binding.status !== 'now') continue;
    for (const chord of chordsOf(platform === 'mac' ? binding.key.mac : binding.key.win)) {
      const text = chordText(chord, platform);
      const entry = map.get(text) ?? { chord: text, bindings: [] };
      entry.bindings.push(binding);
      map.set(text, entry);
    }
  }
  return map;
}

/** The bindings that fire for a keyboard event on a platform, in table order. */
export function bindingsFor(
  event: KeyLike,
  platform: Platform,
  table: ReadonlyArray<KeyBinding> = buildKeyTable(),
  scopes: ReadonlyArray<KeyScope> = ['editor', 'filmstrip', 'canvas', 'text', 'menu'],
): KeyBinding[] {
  return table.filter(
    (binding) =>
      binding.status === 'now' &&
      scopes.includes(binding.scope) &&
      matchesShortcut(binding.key, event, platform),
  );
}

/**
 * True when the chord is a bare key: a letter, digit or printable character with no Cmd, Ctrl or
 * Alt, Shift alone included (SPEC 0.28: the editor binds no bare letter; `S`, `?`, `[` and
 * `Shift+D` all retire). Named keys (Delete, Esc, the arrows, Home, End, Tab, Enter, F10) and the
 * Space bar are not letters.
 */
export function isBareKey(chord: Chord): boolean {
  if (chord.cmd || chord.ctrl || chord.alt) return false;
  return !isNamedKey(chord.key);
}

/**
 * The access keys of a menu's items (SPEC 2.11: the underlined letter runs the item): each drawn
 * item takes the first letter of its label not yet taken among its siblings, else the next letter
 * of the label. Items with fewer distinct letters choose first (Print before Print settings and
 * preview), so a short label is not left without a letter by its longer neighbours; the output
 * keeps the menu order. Omitted items take no letter; submenus are assigned recursively. Returns
 * a copy.
 */
export function assignAccessKeys<T extends MenuItem>(items: ReadonlyArray<T>): T[] {
  const taken = new Set<string>();
  /* letters, then the digits of a label with none (50%, 1.15) */
  const letters = items.map((item) => [
    ...new Set(item.label.toLowerCase().replace(/[^a-z0-9]/g, '')),
  ]);
  const chosen = new Map<number, string>();
  const order = Array.from(items.keys())
    .filter((index) => items[index]?.status !== 'omit')
    .sort((a, b) => (letters[a]?.length ?? 0) - (letters[b]?.length ?? 0) || a - b);
  for (const index of order) {
    const letter = letters[index]?.find((each) => !taken.has(each));
    if (letter === undefined) continue;
    taken.add(letter);
    chosen.set(index, letter);
  }
  return items.map((item, index) => {
    const copy: T = { ...item };
    const letter = chosen.get(index);
    if (letter !== undefined) copy.accessKey = letter;
    if (item.items !== undefined) copy.items = assignAccessKeys(item.items);
    return copy;
  });
}
