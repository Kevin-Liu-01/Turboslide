/**
 * The chord grammar of the shortcuts (SPEC 10, R04 Part B; the grammar is written out at the top
 * of ./keys.ts): parsing, the Windows form, the labels the menus, the tooltips and the shortcuts
 * dialog print, the `aria-keyshortcuts` value, and the matcher the key handlers run. It reads no
 * menu table, so a page that draws a menu and no editor (Recent presentations) does not load the
 * menu model through it (hardening HR-PC#2, PERF-9); ./keys.ts re-exports every name here, and its
 * key tables, which read the model, stay there. Relative imports here carry the `.ts` extension
 * so the parity audit script can load the module under Node.
 */
import { bracketOf } from '@turboslide/viewer/keys';

import type { Platform, Shortcut } from './model.ts';

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
  /* after EVENT_KEYS, so the German + on BracketRight stays Plus: the bracket keys by their place
     where a layout types another character there (bracketOf, @turboslide/viewer/keys) */
  const bracket = bracketOf(event);
  if (bracket !== null) return bracket;
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
