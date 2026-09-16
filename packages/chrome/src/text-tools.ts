// The text tools' contract with the editor shell (gslides-parity SPEC-5 7, 10; MILESTONES-5 B5):
// what the Preferences, Personal dictionary, Edit guides, Indentation options and List options
// dialogs, the Spell check, Chat and Dictionary panels, the notes pane's dictation box and the
// Accessibility rows read from `EditorShellInput` beyond the round four fields. Every member is
// optional and the readers fall back (the localStorage mirror, the defaults, a dispatch through
// the window transport), so a shell that has not wired a member draws the surface disabled with
// its sentence instead of failing. The integrator adds `TextToolsInput` to `EditorShellInput`
// (b5.md request 4); until then `textTools(input)` reads the members through one cast here.
import type { Preferences } from '@turboslide/schema/preferences';
import {
  defaultPreferences,
  normalizePreferences,
  preferencesMirror,
} from '@turboslide/schema/preferences';

import type { EditorShellInput } from './editor-shell';

/** One misspelling as the card walks it (the `spelling.check` output row). */
export type SpellingFinding = {
  slideId: string;
  blockId?: string;
  path: string;
  range: [number, number];
  word: string;
  suggestions: string[];
};

/** One chat message as the panel lists it (the `chat.list` output row). */
export type ChatRow = { id: string; principalId: string; label: string; text: string; at: string };

export type TextToolsInput = {
  /** the caller's preferences record (the shell's state, reconciled with `prefs.get`) */
  preferences?: Preferences;
  /** the deck's language tag; `document.deck.language` else `en-US` */
  language?: string;
  /** the room's chat when the shell wires it: the messages read so far and the capability to send */
  chat?: { canSend: boolean; participants: number };
  /** true when the studio proxies definitions (`TURBOSLIDE_DICTIONARY` not `link`) */
  dictionaryPanel?: boolean;
};

/** The shell input with the text tools' members, read through one cast until the field lands. */
export function textTools(input: EditorShellInput): EditorShellInput & TextToolsInput {
  return input as EditorShellInput & TextToolsInput;
}

/** The record a dialog paints first: the shell's state, else the browser mirror, else the defaults. */
export function preferencesOf(input: EditorShellInput): Preferences {
  const shell = textTools(input).preferences;
  if (shell !== undefined) return shell;
  if (typeof window === 'undefined') return defaultPreferences();
  return preferencesMirror(window.localStorage).read() ?? defaultPreferences();
}

/** The deck's language tag (SPEC-5 7.1): the manifest's, `en-US` when absent. */
export function deckLanguageOf(input: EditorShellInput): string {
  return textTools(input).language ?? input.document.deck.language ?? 'en-US';
}

/**
 * The write every preference surface makes: `prefs.set` through the dispatcher (the server side
 * window handler writes the record and the mirror), the answered record handed back so the
 * surface re-renders on the stored value (R10 3.4).
 */
export async function writePreference(
  input: EditorShellInput,
  path: string,
  value?: unknown,
): Promise<Preferences> {
  const answer = (await input.dispatch(
    'prefs.set',
    value === undefined ? { path } : { path, value },
  )) as {
    preferences?: unknown;
  };
  const stored = normalizePreferences(answer?.preferences);
  return stored ?? preferencesOf(input);
}

/** The offered languages of File > Language and the dictation dropdown (SPEC-5 7.1; R10 5.2). */
export const OFFERED_LANGUAGES: ReadonlyArray<{ tag: string; label: string }> = [
  { tag: 'en-US', label: 'English (United States)' },
  { tag: 'en-GB', label: 'English (United Kingdom)' },
  { tag: 'es', label: 'Español' },
  { tag: 'fr', label: 'Français' },
  { tag: 'nl', label: 'Nederlands' },
  { tag: 'pt-BR', label: 'Português (Brasil)' },
  { tag: 'pt-PT', label: 'Português (Portugal)' },
];

/** The label of a tag, the tag itself when it is not offered. */
export function languageLabel(tag: string): string {
  return OFFERED_LANGUAGES.find((entry) => entry.tag === tag)?.label ?? tag;
}

/** The unit words of the Preferences dialog and the readouts (Google's labels; SPEC-5 7.1). */
export const UNIT_OPTIONS: ReadonlyArray<{ value: Preferences['units']; label: string }> = [
  { value: 'in', label: 'Inches' },
  { value: 'cm', label: 'Centimeters' },
  { value: 'px', label: 'Pixels' },
];

/** A sheet pixel value in the preference's unit, for the guide and indent fields (120 px per inch). */
export function formatUnit(px: number, unit: Preferences['units']): string {
  if (unit === 'px') return `${Math.round(px)}`;
  const inches = px / 120;
  if (unit === 'in') return `${Math.round(inches * 100) / 100}`;
  return `${Math.round(inches * 2.54 * 100) / 100}`;
}

/** A field value in the preference's unit back to sheet pixels; null for a value that is not a number. */
export function parseUnit(text: string, unit: Preferences['units']): number | null {
  const value = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  if (unit === 'px') return Math.round(value);
  if (unit === 'in') return Math.round(value * 120);
  return Math.round((value / 2.54) * 120);
}

/** The unit's suffix beside a field. */
export function unitSuffix(unit: Preferences['units']): string {
  return unit === 'in' ? 'in' : unit === 'cm' ? 'cm' : 'px';
}
