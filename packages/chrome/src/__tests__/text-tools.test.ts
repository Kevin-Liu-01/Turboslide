import { describe, expect, it } from 'vitest';

import {
  defaultPreferences,
  preferencesMirror,
  writePreferencesMirror,
} from '@turboslide/schema/preferences';

import type { EditorShellInput } from '../editor-shell';
import {
  OFFERED_LANGUAGES,
  UNIT_OPTIONS,
  deckLanguageOf,
  formatUnit,
  languageLabel,
  parseUnit,
  preferencesOf,
  textTools,
  unitSuffix,
  writePreference,
} from '../text-tools';

// The text tools' shell contract (gslides-parity SPEC-5 7.1; b5.md request 4): the record a
// dialog paints first, the unit fields of Edit guides and Indentation options, the offered
// languages of File > Language and the dictation dropdown, and the `prefs.set` write.

function inputWith(extra: Record<string, unknown> = {}): EditorShellInput {
  return {
    deckId: 'd',
    document: {
      deck: { id: 'd', title: 'D', theme: 'gt', sections: [], assets: {}, revision: 1 },
      slides: {},
    },
    slideId: 's',
    revision: 1,
    dispatch: async () => ({}),
    ...extra,
  } as unknown as EditorShellInput;
}

describe('the record a surface paints first', () => {
  it('takes the shell state, else the mirror, else the defaults', () => {
    const shell = { ...defaultPreferences(), units: 'cm' as const };
    expect(preferencesOf(inputWith({ preferences: shell })).units).toBe('cm');
    expect(preferencesOf(inputWith()).units).toBe('in');
    const storage = new Map<string, string>();
    const mirror = preferencesMirror({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
    });
    mirror.write({ ...defaultPreferences(), units: 'px' });
    expect(mirror.read()?.units).toBe('px');
    expect(writePreferencesMirror(defaultPreferences())).toContain('"units":"in"');
  });
  it('reads the deck language from the shell, the manifest or the default', () => {
    expect(deckLanguageOf(inputWith())).toBe('en-US');
    const input = inputWith();
    (input.document.deck as { language?: string }).language = 'fr';
    expect(deckLanguageOf(input)).toBe('fr');
    expect(deckLanguageOf(inputWith({ language: 'nl' }))).toBe('nl');
    expect(textTools(inputWith({ chat: { canSend: true, participants: 2 } })).chat).toEqual({
      canSend: true,
      participants: 2,
    });
  });
  it('writes through prefs.set and answers the stored record', async () => {
    const calls: unknown[] = [];
    const input = inputWith({
      dispatch: async (action: string, value: unknown) => {
        calls.push([action, value]);
        return { preferences: { ...defaultPreferences(), units: 'cm' } };
      },
    });
    expect((await writePreference(input, '/units', 'cm')).units).toBe('cm');
    expect(calls).toEqual([['prefs.set', { path: '/units', value: 'cm' }]]);
    await writePreference(input, '/substitutions/rows/2');
    expect(calls[1]).toEqual(['prefs.set', { path: '/substitutions/rows/2' }]);
    // a malformed answer falls back to the record the surface had
    const odd = inputWith({ dispatch: async () => ({ preferences: 'x' }) });
    expect((await writePreference(odd, '/units', 'cm')).units).toBe('in');
  });
});

describe('the units and the languages', () => {
  it('formats and parses sheet pixels in the three units', () => {
    expect(formatUnit(800, 'in')).toBe('6.67');
    expect(formatUnit(120, 'cm')).toBe('2.54');
    expect(formatUnit(799.6, 'px')).toBe('800');
    expect(parseUnit('6.67', 'in')).toBe(800);
    expect(parseUnit('2,54', 'cm')).toBe(120);
    expect(parseUnit('800', 'px')).toBe(800);
    expect(parseUnit('abc', 'px')).toBeNull();
    expect(unitSuffix('in')).toBe('in');
    expect(UNIT_OPTIONS.map((option) => option.label)).toEqual(['Inches', 'Centimeters', 'Pixels']);
  });
  it('offers the seven languages with a dictionary and labels a tag', () => {
    expect(OFFERED_LANGUAGES.map((entry) => entry.tag)).toEqual([
      'en-US',
      'en-GB',
      'es',
      'fr',
      'nl',
      'pt-BR',
      'pt-PT',
    ]);
    expect(languageLabel('pt-BR')).toBe('Português (Brasil)');
    expect(languageLabel('de')).toBe('de');
  });
});
