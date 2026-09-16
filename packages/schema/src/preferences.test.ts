import { describe, expect, test } from 'vitest';

import { errorStatus } from './errors.ts';
import {
  DEFAULT_SUBSTITUTIONS,
  LEGACY_SETTINGS_STORAGE,
  PREFERENCES_DEFAULTS,
  PREFERENCES_MIGRATED_STORAGE,
  PREFERENCES_STORAGE,
  PreferenceError,
  applyPreferenceWrite,
  defaultPreferences,
  getPreference,
  isDefaultPreferences,
  legacyPreferenceWrites,
  memoryPreferencesStore,
  migrateLegacySettings,
  normalizePreferences,
  preferencesMirror,
  preferencesSchema,
  readLegacySettings,
  readPreferencesMirror,
  setPreference,
  setPreferences,
  writePreferencesMirror,
} from './preferences.ts';
import type { Preferences, StorageLike } from './preferences.ts';

// The Preferences record of gslides-parity SPEC-5 7.1 (R10 2.2, 3.3, 3.4): the defaults, the
// pointer reads and writes behind prefs.get and prefs.set, the read time migration of an older
// record, the browser mirror and the one time migration of the two legacy toggles.

/** A `localStorage` stand in that records writes; `broken` throws on every access. */
function fakeStorage(
  seed: Record<string, string> = {},
  broken = false,
): StorageLike & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(seed));
  const guard = (): void => {
    if (broken) throw new Error('SecurityError: storage is disabled');
  };
  return {
    getItem: (key) => {
      guard();
      return map.get(key) ?? null;
    },
    setItem: (key, value) => {
      guard();
      map.set(key, value);
    },
    removeItem: (key) => {
      guard();
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

function refusal(run: () => unknown): PreferenceError {
  try {
    run();
  } catch (error) {
    if (error instanceof PreferenceError) return error;
    throw error;
  }
  throw new Error('expected a PreferenceError');
}

describe('the defaults', () => {
  test('every rule on, the twelve rows without an em dash, shrink and grow, inches, underline on', () => {
    const prefs = defaultPreferences();
    expect(prefs.autocorrect).toEqual({
      capitalize: true,
      spelling: true,
      links: true,
      lists: true,
      quotes: true,
    });
    expect(prefs.substitutions.on).toBe(true);
    expect(prefs.substitutions.rows).toHaveLength(12);
    expect(prefs.substitutions.rows.map((row) => row.from)).toEqual([
      '(c)',
      '(r)',
      '(tm)',
      '1/2',
      '1/4',
      '3/4',
      '->',
      '<-',
      '<->',
      '=>',
      '--',
      '...',
    ]);
    expect(prefs.substitutions.rows.every((row) => row.on)).toBe(true);
    expect(prefs.substitutions.rows.some((row) => row.to.includes('—'))).toBe(false);
    expect(prefs.substitutions.rows.find((row) => row.from === '--')?.to).toBe('–');
    expect(prefs.substitutions.removedDefaults).toEqual([]);
    expect(prefs.autofit).toEqual({ placeholder: 'shrink', textBox: 'grow' });
    expect(prefs.units).toBe('in');
    expect(prefs.spelling).toEqual({ underline: true, dictionary: [] });
    expect(prefs.accessibility).toEqual({
      screenReader: false,
      braille: false,
      announce: false,
      speakAloud: false,
    });
    expect(prefs.dictation).toEqual({});
    expect(prefs.svgText).toBe('embed');
    expect(prefs.starred).toEqual([]);
    expect(isDefaultPreferences(prefs)).toBe(true);
    expect(isDefaultPreferences({ ...prefs, units: 'cm' })).toBe(false);
  });

  test('defaultPreferences answers a fresh copy each time and the schema accepts it strictly', () => {
    const a = defaultPreferences();
    const b = defaultPreferences();
    a.substitutions.rows[0]!.on = false;
    expect(b.substitutions.rows[0]?.on).toBe(true);
    expect(PREFERENCES_DEFAULTS.substitutions.rows[0]?.on).toBe(true);
    expect(DEFAULT_SUBSTITUTIONS[0]?.on).toBe(true);
    expect(preferencesSchema.safeParse(PREFERENCES_DEFAULTS).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...PREFERENCES_DEFAULTS, extra: 1 }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...PREFERENCES_DEFAULTS, units: 'pt' }).success).toBe(
      false,
    );
  });
});

describe('getPreference', () => {
  test('the whole record, a member, a nested member, an array element, a missing member', () => {
    const prefs = defaultPreferences();
    expect(getPreference(prefs)).toEqual(prefs);
    expect(getPreference(prefs, '')).toEqual(prefs);
    expect(getPreference(prefs, '/units')).toBe('in');
    expect(getPreference(prefs, '/autofit/textBox')).toBe('grow');
    expect(getPreference(prefs, '/substitutions/rows/0')).toEqual({
      from: '(c)',
      to: '©',
      on: true,
    });
    expect(getPreference(prefs, '/substitutions/rows/0/to')).toBe('©');
    expect(getPreference(prefs, '/dictation/lang')).toBeUndefined();
    expect(getPreference(prefs, '/nothing')).toBeUndefined();
    expect(getPreference(prefs, '/substitutions/rows/99')).toBeUndefined();
  });

  test('a pointer that does not start with a slash is refused as invalid_pointer', () => {
    const error = refusal(() => getPreference(defaultPreferences(), 'units'));
    expect(error.code).toBe('invalid_pointer');
    expect(error.pointer).toBe('units');
    expect(errorStatus(error)).toBe(400);
  });
});

describe('setPreference', () => {
  test('writes a member on a copy and leaves the input alone', () => {
    const prefs = defaultPreferences();
    const next = setPreference(prefs, '/units', 'cm');
    expect(next.units).toBe('cm');
    expect(prefs.units).toBe('in');
    expect(setPreference(prefs, '/autocorrect/capitalize', false).autocorrect.capitalize).toBe(
      false,
    );
    expect(setPreference(prefs, '/dictation/lang', 'pt-PT').dictation).toEqual({ lang: 'pt-PT' });
    expect(setPreference(prefs, '/svgText', 'outline').svgText).toBe('outline');
  });

  test('appends with /- and keeps the two word lists as sets, the dictionary sorted', () => {
    let prefs = defaultPreferences();
    prefs = setPreference(prefs, '/starred/-', 'q4-review');
    prefs = setPreference(prefs, '/starred/-', 'gt-brand');
    prefs = setPreference(prefs, '/starred/-', 'q4-review');
    expect(prefs.starred).toEqual(['q4-review', 'gt-brand']);
    prefs = setPreference(prefs, '/starred/0');
    expect(prefs.starred).toEqual(['gt-brand']);
    prefs = setPreference(prefs, '/spelling/dictionary/-', 'Turboslide');
    prefs = setPreference(prefs, '/spelling/dictionary/-', 'Locadex');
    prefs = setPreference(prefs, '/spelling/dictionary/-', 'Turboslide');
    expect(prefs.spelling.dictionary).toEqual(['Locadex', 'Turboslide']);
    prefs = setPreference(prefs, '/spelling/dictionary', ['zeta', 'alpha', 'alpha']);
    expect(prefs.spelling.dictionary).toEqual(['alpha', 'zeta']);
  });

  test('an absent value deletes the member and a missing member is left alone', () => {
    let prefs = setPreference(defaultPreferences(), '/dictation/lang', 'fr');
    prefs = setPreference(prefs, '/dictation/lang');
    expect(prefs.dictation).toEqual({});
    expect(setPreference(prefs, '/dictation/lang')).toEqual(prefs);
  });

  test('a removed default row is remembered and a re added one is forgotten (R10 2.3)', () => {
    let prefs = defaultPreferences();
    prefs = setPreference(prefs, '/substitutions/rows/11');
    expect(prefs.substitutions.rows.map((row) => row.from)).not.toContain('...');
    expect(prefs.substitutions.removedDefaults).toEqual(['...']);
    prefs = setPreference(prefs, '/substitutions/rows/0');
    // in the order they were removed
    expect(prefs.substitutions.removedDefaults).toEqual(['...', '(c)']);
    // toggling a row or adding a custom row changes nothing there
    prefs = setPreference(prefs, '/substitutions/rows/0/on', false);
    prefs = setPreference(prefs, '/substitutions/rows/-', {
      from: ':shrug:',
      to: '¯\\_(ツ)_/¯',
      on: true,
    });
    expect(prefs.substitutions.removedDefaults).toEqual(['...', '(c)']);
    // the default put back leaves the list
    prefs = setPreference(prefs, '/substitutions/rows/-', { from: '...', to: '…', on: true });
    expect(prefs.substitutions.removedDefaults).toEqual(['(c)']);
    // clearing the table remembers every default that was there
    prefs = setPreference(prefs, '/substitutions/rows', []);
    expect(prefs.substitutions.removedDefaults).toHaveLength(12);
    // a write to removedDefaults itself is taken as given
    prefs = setPreference(prefs, '/substitutions/removedDefaults', ['--']);
    expect(prefs.substitutions.removedDefaults).toEqual(['--']);
    // and normalizePreferences puts the other eleven back
    const normalized = normalizePreferences(prefs);
    expect(normalized?.substitutions.rows.map((row) => row.from)).toEqual(
      DEFAULT_SUBSTITUTIONS.map((row) => row.from).filter((from) => from !== '--'),
    );
  });

  test('a bad value, an unknown member and a bad index are refused with their pointer and nothing changes', () => {
    const prefs = defaultPreferences();
    const enumError = refusal(() => setPreference(prefs, '/units', 'pt'));
    expect(enumError.code).toBe('invalid_field');
    expect(enumError.pointer).toBe('/units');
    expect(enumError.message).toContain('/units');
    expect(errorStatus(enumError)).toBe(400);

    const unknown = refusal(() => setPreference(prefs, '/theme', 'dark'));
    expect(unknown.code).toBe('unknown_field');
    expect(unknown.pointer).toBe('/theme');
    expect(unknown.message).toContain('autocorrect, substitutions');

    const nestedUnknown = refusal(() => setPreference(prefs, '/spelling/grammar', true));
    expect(nestedUnknown.code).toBe('unknown_field');
    expect(nestedUnknown.pointer).toBe('/spelling/grammar');

    const badRow = refusal(() =>
      setPreference(prefs, '/substitutions/rows/-', { from: '', to: 'x', on: true }),
    );
    expect(badRow.code).toBe('invalid_field');
    expect(badRow.pointer).toBe('/substitutions/rows/12/from');

    const badIndex = refusal(() => setPreference(prefs, '/starred/5', 'q4'));
    expect(badIndex.code).toBe('invalid_pointer');
    const notAnIndex = refusal(() => setPreference(prefs, '/starred/first', 'q4'));
    expect(notAnIndex.code).toBe('invalid_pointer');
    const whole = refusal(() => setPreference(prefs, '', defaultPreferences()));
    expect(whole.code).toBe('invalid_pointer');
    expect(whole.message).toContain('/starred/-');
    const badTag = refusal(() => setPreference(prefs, '/dictation/lang', 'english'));
    expect(badTag.pointer).toBe('/dictation/lang');
    expect(prefs).toEqual(defaultPreferences());
  });

  test('setPreferences applies a batch in order and stops at the first refusal', () => {
    const next = setPreferences(defaultPreferences(), [
      { path: '/units', value: 'px' },
      { path: '/starred/-', value: 'a' },
      { path: '/accessibility/announce', value: true },
    ]);
    expect(next.units).toBe('px');
    expect(next.starred).toEqual(['a']);
    expect(next.accessibility.announce).toBe(true);
    expect(() =>
      setPreferences(defaultPreferences(), [
        { path: '/units', value: 'px' },
        { path: '/units', value: 'em' },
      ]),
    ).toThrow(PreferenceError);
  });
});

describe('normalizePreferences', () => {
  test('a partial or older record fills its absent members with the defaults', () => {
    const partial = normalizePreferences({ units: 'cm', spelling: { underline: false } });
    expect(partial).not.toBeNull();
    expect(partial?.units).toBe('cm');
    expect(partial?.spelling).toEqual({ underline: false, dictionary: [] });
    expect(partial?.autocorrect).toEqual(PREFERENCES_DEFAULTS.autocorrect);
    expect(partial?.substitutions.rows).toHaveLength(12);
    expect(partial?.svgText).toBe('embed');
    expect(normalizePreferences({})).toEqual(defaultPreferences());
    expect(normalizePreferences(defaultPreferences())).toEqual(defaultPreferences());
  });

  test('a new default row joins the table unless it was removed; the lists are sets', () => {
    const stored: Preferences = {
      ...defaultPreferences(),
      substitutions: {
        on: true,
        rows: [{ from: '(c)', to: '©', on: false }],
        removedDefaults: ['...', '...'],
      },
      starred: ['a', 'a', 'b'],
      spelling: { underline: true, dictionary: ['b', 'a', 'b'] },
    };
    const next = normalizePreferences(stored);
    expect(next?.substitutions.rows[0]).toEqual({ from: '(c)', to: '©', on: false });
    expect(next?.substitutions.rows.map((row) => row.from)).toEqual(
      DEFAULT_SUBSTITUTIONS.map((row) => row.from).filter((from) => from !== '...'),
    );
    expect(next?.substitutions.removedDefaults).toEqual(['...']);
    expect(next?.starred).toEqual(['a', 'b']);
    expect(next?.spelling.dictionary).toEqual(['a', 'b']);
  });

  test('a wrong type, an unknown member or a non object refuses the whole value', () => {
    expect(normalizePreferences(null)).toBeNull();
    expect(normalizePreferences([])).toBeNull();
    expect(normalizePreferences('in')).toBeNull();
    expect(normalizePreferences({ units: 'pt' })).toBeNull();
    expect(normalizePreferences({ theme: 'dark' })).toBeNull();
    expect(normalizePreferences({ autocorrect: true })).toBeNull();
    expect(normalizePreferences({ spelling: { grammar: true } })).toBeNull();
    expect(normalizePreferences({ starred: 'q4' })).toBeNull();
  });
});

describe('the mirror', () => {
  test('the bytes round trip and bad bytes read as no mirror', () => {
    const prefs = setPreference(defaultPreferences(), '/units', 'cm');
    expect(readPreferencesMirror(writePreferencesMirror(prefs))).toEqual(prefs);
    expect(readPreferencesMirror(null)).toBeNull();
    expect(readPreferencesMirror('{not json')).toBeNull();
    expect(readPreferencesMirror('"in"')).toBeNull();
    expect(readPreferencesMirror('{"units":"pt"}')).toBeNull();
    expect(readPreferencesMirror('{"units":"px"}')?.units).toBe('px');
  });

  test('preferencesMirror reads, writes and clears under the key and never throws', () => {
    const storage = fakeStorage();
    const mirror = preferencesMirror(storage);
    expect(mirror.read()).toBeNull();
    const prefs = setPreference(defaultPreferences(), '/starred/-', 'gt-brand');
    mirror.write(prefs);
    expect(Object.keys(storage.dump())).toEqual([PREFERENCES_STORAGE]);
    expect(mirror.read()).toEqual(prefs);
    mirror.clear();
    expect(mirror.read()).toBeNull();

    const broken = preferencesMirror(fakeStorage({}, true));
    expect(broken.read()).toBeNull();
    expect(() => broken.write(prefs)).not.toThrow();
    expect(() => broken.clear()).not.toThrow();
    const none = preferencesMirror(null);
    expect(none.read()).toBeNull();
    expect(() => none.write(prefs)).not.toThrow();
  });
});

describe('the one time migration of spellcheck and announce', () => {
  test('readLegacySettings keeps the two toggles and ignores the rest', () => {
    expect(readLegacySettings(null)).toEqual({});
    expect(readLegacySettings('{bad')).toEqual({});
    expect(readLegacySettings('[]')).toEqual({});
    expect(
      readLegacySettings(
        JSON.stringify({ snapGrid: true, spellcheck: false, announce: true, showIds: false }),
      ),
    ).toEqual({ spellcheck: false, announce: true });
    expect(readLegacySettings(JSON.stringify({ spellcheck: 'yes' }))).toEqual({});
    expect(LEGACY_SETTINGS_STORAGE).toBe('ts-editor-settings');
  });

  test('only a value away from the default travels', () => {
    expect(legacyPreferenceWrites({})).toEqual([]);
    expect(legacyPreferenceWrites({ spellcheck: true, announce: false })).toEqual([]);
    expect(legacyPreferenceWrites({ spellcheck: false, announce: true })).toEqual([
      { path: '/spelling/underline', value: false },
      { path: '/accessibility/announce', value: true },
    ]);
  });

  test('a browser with changed toggles gets two writes, a mirror carrying them, and marks done on commit', () => {
    const storage = fakeStorage({
      [LEGACY_SETTINGS_STORAGE]: JSON.stringify({
        spellcheck: false,
        announce: true,
        snapGrid: true,
      }),
    });
    const migration = migrateLegacySettings(storage);
    expect(migration).not.toBeNull();
    expect(migration?.writes).toEqual([
      { path: '/spelling/underline', value: false },
      { path: '/accessibility/announce', value: true },
    ]);
    expect(migration?.preferences.spelling.underline).toBe(false);
    expect(migration?.preferences.accessibility.announce).toBe(true);
    expect(preferencesMirror(storage).read()?.spelling.underline).toBe(false);
    // not marked until the record acknowledged the writes; a second load repeats them
    expect(storage.dump()[PREFERENCES_MIGRATED_STORAGE]).toBeUndefined();
    expect(migrateLegacySettings(storage)?.writes).toHaveLength(2);
    migration?.commit();
    expect(storage.dump()[PREFERENCES_MIGRATED_STORAGE]).toBe('1');
    expect(migrateLegacySettings(storage)).toBeNull();
    // the legacy record itself is untouched: the other toggles stay per browser
    expect(JSON.parse(storage.dump()[LEGACY_SETTINGS_STORAGE] ?? '{}')).toEqual({
      spellcheck: false,
      announce: true,
      snapGrid: true,
    });
  });

  test('a browser on the defaults, or without a legacy record, marks itself done with no writes', () => {
    const storage = fakeStorage({
      [LEGACY_SETTINGS_STORAGE]: JSON.stringify({ spellcheck: true }),
    });
    const migration = migrateLegacySettings(storage);
    expect(migration?.writes).toEqual([]);
    expect(migration?.preferences).toEqual(defaultPreferences());
    expect(storage.dump()[PREFERENCES_MIGRATED_STORAGE]).toBe('1');
    expect(storage.dump()[PREFERENCES_STORAGE]).toBeUndefined();
    expect(migrateLegacySettings(storage)).toBeNull();

    const empty = fakeStorage();
    expect(migrateLegacySettings(empty)?.writes).toEqual([]);
    expect(empty.dump()[PREFERENCES_MIGRATED_STORAGE]).toBe('1');
    expect(migrateLegacySettings(null)).toBeNull();
    expect(migrateLegacySettings(fakeStorage({}, true))).toBeNull();
  });

  test('the writes land over an existing mirror, not over the defaults', () => {
    const mirrored = setPreference(defaultPreferences(), '/units', 'cm');
    const storage = fakeStorage({
      [PREFERENCES_STORAGE]: writePreferencesMirror(mirrored),
      [LEGACY_SETTINGS_STORAGE]: JSON.stringify({ announce: true }),
    });
    const migration = migrateLegacySettings(storage);
    expect(migration?.preferences.units).toBe('cm');
    expect(migration?.preferences.accessibility.announce).toBe(true);
  });
});

describe('the store contract', () => {
  test('the memory store hands out copies and applyPreferenceWrite is load, set, save', async () => {
    const store = memoryPreferencesStore();
    const loaded = await store.load();
    loaded.units = 'px';
    expect((await store.load()).units).toBe('in');
    const saved = await applyPreferenceWrite(store, { path: '/units', value: 'cm' });
    expect(saved.units).toBe('cm');
    expect(store.current().units).toBe('cm');
    await applyPreferenceWrite(store, { path: '/starred/-', value: 'gt-brand' });
    expect(store.current().starred).toEqual(['gt-brand']);
    await expect(applyPreferenceWrite(store, { path: '/units', value: 'pt' })).rejects.toThrow(
      PreferenceError,
    );
    expect(store.current().units).toBe('cm');
  });
});
