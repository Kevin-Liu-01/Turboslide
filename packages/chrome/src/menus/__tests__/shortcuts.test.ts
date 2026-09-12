import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { KeyBinding } from '../keys.ts';
import {
  GESTURES,
  OMITTED_SHORTCUTS,
  SHARED_CHORDS,
  TURBOSLIDE_ONLY_KEYS,
  ariaKeyShortcuts,
  bindingsFor,
  buildEditorKeymap,
  buildKeyTable,
  chordText,
  chordsOf,
  formatChord,
  isBareKey,
  matchesShortcut,
  normalizeBinding,
  normalizeGoogleChord,
  parseChord,
  tooltipKey,
  winChordOf,
} from '../keys.ts';
import type { Platform } from '../model.ts';
import { MENUS } from '../model.ts';

// The keys (SPEC 10, 14.2): every row of Google's shortcut page (the R04 fixture) is bound, bound
// as disabled, or listed as omitted with a reason; every bound chord equals Google's; no two
// enabled chords collide in one scope unless they dispatch by focus; no bare letter is bound in
// the editor map.

type FixtureRow = { id: string; action: string; mac: string[]; win: string[]; gesture?: boolean };
type Fixture = { groups: Array<{ group: string; rows: FixtureRow[] }> };
const fixture = JSON.parse(
  readFileSync(new URL('../__fixtures__/google-shortcuts.json', import.meta.url), 'utf8'),
) as Fixture;
const groups = fixture.groups;
const rows = new Map<string, FixtureRow>();
for (const group of groups) for (const row of group.rows) rows.set(row.id, row);

const table = buildKeyTable();
const byGoogle = new Map<string, KeyBinding[]>();
for (const binding of table) {
  for (const id of binding.google) byGoogle.set(id, [...(byGoogle.get(id) ?? []), binding]);
}
const omitted = new Map(OMITTED_SHORTCUTS.map((entry) => [entry.google, entry]));
const gestures = new Map(GESTURES.map((gesture) => [gesture.google, gesture]));

const PLATFORMS: Platform[] = ['mac', 'win'];

function normalizedSet(binding: string, platform: Platform): Set<string> {
  return new Set(chordsOf(binding).map((chord) => chordText(chord, platform)));
}

describe('the chord grammar', () => {
  it('parses and reprints chords in canonical form', () => {
    expect(chordText(parseChord('cmd+shift+h'))).toBe('Cmd+Shift+H');
    expect(chordText(parseChord('Ctrl+M'))).toBe('Ctrl+M');
    expect(chordText(parseChord('Cmd++'))).toBe('Cmd+Plus');
    expect(chordText(parseChord('Cmd+-'))).toBe('Cmd+Minus');
    expect(chordText(parseChord('Cmd+\\'))).toBe('Cmd+\\');
    expect(chordText(parseChord('Shift+F10'))).toBe('Shift+F10');
    expect(chordText(parseChord('Ctrl+Cmd+U then A'))).toBe('Cmd+Ctrl+U then A');
    expect(normalizeBinding('Cmd+Y or Cmd+Shift+Z')).toBe('Cmd+Y or Cmd+Shift+Z');
    expect(chordText(parseChord('Option+/'), 'win')).toBe('Alt+/');
  });

  it('derives the Windows form the way Google does', () => {
    expect(winChordOf('Cmd+Z')).toBe('Ctrl+Z');
    expect(winChordOf('Cmd+Option+Shift+H')).toBe('Ctrl+Alt+Shift+H');
    expect(winChordOf('Cmd+Ctrl+B')).toBe('Ctrl+Alt+B');
    expect(winChordOf('Ctrl+M')).toBe('Ctrl+M');
    expect(winChordOf('Cmd+Y or Cmd+Shift+Z')).toBe('Ctrl+Y or Ctrl+Shift+Z');
  });

  it('reads Google’s spelling', () => {
    expect(normalizeGoogleChord('Cmd + Shift + h')).toBe('Cmd+Shift+H');
    expect(normalizeGoogleChord('hold Ctrl + Cmd, press u then a')).toBe('Cmd+Ctrl+U then A');
    expect(normalizeGoogleChord('Fn + Left arrow')).toBe('Home');
    expect(normalizeGoogleChord('Shift + Fn + Right arrow')).toBe('Shift+End');
    expect(normalizeGoogleChord('Cmd + \\ (back slash)')).toBe('Cmd+\\');
    expect(normalizeGoogleChord('Cmd + +')).toBe('Cmd+Plus');
    expect(normalizeGoogleChord('Ctrl + -')).toBe('Ctrl+Minus');
    expect(normalizeGoogleChord('Page Up or Up arrow')).toBe('PageUp or Up');
    expect(normalizeGoogleChord('Ctrl + Alt + Shift + f')).toBe('Ctrl+Alt+Shift+F');
    expect(normalizeGoogleChord('Alt + /')).toBe('Alt+/');
  });

  it('formats for the menus, the tooltips and aria-keyshortcuts', () => {
    const chord = parseChord('Cmd+Shift+H');
    expect(formatChord(chord, 'mac', 'symbols')).toBe('⇧⌘H');
    expect(formatChord(chord, 'mac', 'words')).toBe('Cmd Shift H');
    expect(formatChord(parseChord('Ctrl+Shift+H'), 'win', 'words')).toBe('Ctrl+Shift+H');
    expect(formatChord(chord, 'win', 'words')).toBe('Ctrl+Shift+H');
    expect(formatChord(parseChord('Ctrl+M'), 'mac', 'symbols')).toBe('⌃M');
    expect(formatChord(parseChord('Cmd+Plus'), 'mac', 'symbols')).toBe('⌘+');
    expect(tooltipKey({ mac: 'Cmd+Shift+H', win: 'Ctrl+H' }, 'mac')).toBe('Cmd Shift H');
    expect(tooltipKey({ mac: 'Cmd+Shift+H', win: 'Ctrl+H' }, 'win')).toBe('Ctrl H');
    expect(ariaKeyShortcuts({ mac: 'Cmd+Shift+H', win: 'Ctrl+H' }, 'mac')).toBe('Shift+Meta+H');
    expect(
      ariaKeyShortcuts({ mac: 'Cmd+Y or Cmd+Shift+Z', win: 'Ctrl+Y or Ctrl+Shift+Z' }, 'win'),
    ).toBe('Control+Y Control+Shift+Z');
    expect(ariaKeyShortcuts({ mac: 'Cmd+Plus', win: 'Ctrl+Plus' }, 'win')).toBe('Control+Plus');
  });

  it('matches keyboard events per platform', () => {
    const key = { mac: 'Cmd+Shift+H', win: 'Ctrl+H' };
    expect(
      matchesShortcut(
        key,
        { key: 'h', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
        'mac',
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        key,
        { key: 'h', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false },
        'win',
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        key,
        { key: 'h', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        'mac',
      ),
    ).toBe(false);
    /* Option turns the key into a composed character; the code names the letter */
    expect(
      matchesShortcut(
        { mac: 'Cmd+Option+C', win: 'Ctrl+Alt+C' },
        { key: 'ç', code: 'KeyC', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false },
        'mac',
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { mac: 'Cmd+Plus', win: 'Ctrl+Plus' },
        { key: '=', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        'mac',
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { mac: 'Cmd+Shift+>', win: 'Ctrl+Shift+>' },
        { key: '>', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
        'mac',
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { mac: 'Delete', win: 'Delete' },
        { key: 'Backspace', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false },
        'mac',
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { mac: 'Ctrl+M', win: 'Ctrl+M' },
        { key: 'm', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false },
        'mac',
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { mac: 'Ctrl+M', win: 'Ctrl+M' },
        { key: 'm', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        'mac',
      ),
    ).toBe(false);
    const hits = bindingsFor(
      { key: 'z', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
      'mac',
    );
    expect(hits.map((binding) => binding.id)).toEqual(['edit.undo', 'toolbar.undo']);
  });
});

describe('every row of Google’s shortcut page', () => {
  it('is bound, bound as disabled, a gesture, or omitted with a reason', () => {
    for (const row of rows.values()) {
      const bound = byGoogle.get(row.id) ?? [];
      const gesture = gestures.get(row.id);
      const left = omitted.get(row.id);
      const answered = bound.length > 0 || gesture !== undefined || left !== undefined;
      expect(answered, `${row.id} (${row.action}) is neither bound nor omitted`).toBe(true);
      if (left !== undefined) {
        expect(left.reason.length, row.id).toBeGreaterThan(0);
        expect(bound.length, `${row.id} is both bound and omitted`).toBe(0);
      }
    }
  });

  it('is bound to exactly Google’s chords where it is bound', () => {
    /* a binding that answers two rows (Paint format: copy and paste formatting) is held to their union */
    const googleChords = (ids: ReadonlyArray<string>, platform: Platform): Set<string> => {
      const out = new Set<string>();
      for (const id of ids) {
        const row = rows.get(id);
        expect(row, `${id} is not a fixture row`).toBeDefined();
        for (const text of row?.[platform] ?? []) {
          for (const chord of normalizedSet(normalizeGoogleChord(text), platform)) out.add(chord);
        }
      }
      return out;
    };
    for (const binding of table) {
      if (binding.google.length === 0) continue;
      for (const platform of PLATFORMS) {
        const google = googleChords(binding.google, platform);
        const ours = normalizedSet(
          platform === 'mac' ? binding.key.mac : binding.key.win,
          platform,
        );
        if (google.size === 0 || ours.size === 0) continue;
        for (const chord of ours) {
          expect(
            google.has(chord),
            `${binding.id} binds ${chord} on ${platform}; Google prints ${[...google].join(', ')}`,
          ).toBe(true);
        }
      }
    }
  });

  it('gives every Turboslide binding a Google row, or lists it as ours', () => {
    for (const binding of table) {
      if (binding.google.length > 0) continue;
      expect(TURBOSLIDE_ONLY_KEYS, `${binding.id} has a key with no Google row`).toContain(
        binding.id,
      );
    }
    for (const id of TURBOSLIDE_ONLY_KEYS)
      expect(
        table.some((binding) => binding.id === id),
        id,
      ).toBe(true);
  });

  it('names fixture rows that exist from every omission and gesture', () => {
    for (const entry of OMITTED_SHORTCUTS) expect(rows.has(entry.google), entry.google).toBe(true);
    for (const gesture of GESTURES) expect(rows.has(gesture.google), gesture.google).toBe(true);
    for (const binding of table)
      for (const id of binding.google) expect(rows.has(id), `${binding.id} -> ${id}`).toBe(true);
  });
});

describe('the editor map', () => {
  const collides = (a: KeyBinding, b: KeyBinding): boolean =>
    a.scope === b.scope || a.scope === 'editor' || b.scope === 'editor';
  const shared = (a: KeyBinding, b: KeyBinding): boolean =>
    SHARED_CHORDS.some((group) => group.items.includes(a.id) && group.items.includes(b.id));

  it('has no two enabled chords that both fire, unless they dispatch by focus or run one effect', () => {
    for (const platform of PLATFORMS) {
      for (const entry of buildEditorKeymap(platform).values()) {
        for (let i = 0; i < entry.bindings.length; i += 1) {
          for (let j = i + 1; j < entry.bindings.length; j += 1) {
            const a = entry.bindings[i]!;
            const b = entry.bindings[j]!;
            if (!collides(a, b)) continue;
            expect(shared(a, b), `${entry.chord} on ${platform}: ${a.id} and ${b.id}`).toBe(true);
          }
        }
      }
    }
  });

  it('names existing bindings in every shared chord group', () => {
    const ids = new Set(table.map((binding) => binding.id));
    for (const group of SHARED_CHORDS)
      for (const id of group.items) expect(ids.has(id), id).toBe(true);
  });

  it('binds no bare letter outside present mode', () => {
    for (const binding of table) {
      if (binding.scope === 'present') continue;
      for (const platform of PLATFORMS) {
        for (const chord of chordsOf(platform === 'mac' ? binding.key.mac : binding.key.win)) {
          expect(
            isBareKey(chord),
            `${binding.id} binds the bare key ${chordText(chord, platform)} on ${platform}`,
          ).toBe(false);
        }
      }
    }
    expect(isBareKey(parseChord('S'))).toBe(true);
    expect(isBareKey(parseChord('Shift+D'))).toBe(true);
    expect(isBareKey(parseChord('?'))).toBe(true);
    expect(isBareKey(parseChord('Delete'))).toBe(false);
    expect(isBareKey(parseChord('Cmd+K'))).toBe(false);
  });

  it('retires the letters of the old shell and the old Cmd+K, Cmd+/ and Cmd+S meanings (SPEC 10.2)', () => {
    const mac = buildEditorKeymap('mac');
    for (const letter of [
      'S',
      'D',
      'E',
      'P',
      'F',
      'G',
      'B',
      'J',
      'K',
      'L',
      'H',
      'R',
      '?',
      '[',
      'Space',
      'Backspace',
    ]) {
      expect(mac.has(letter), letter).toBe(false);
    }
    expect(mac.get('Cmd+K')?.bindings.map((binding) => binding.id)).toEqual(['insert.link']);
    expect(mac.get('Cmd+/')?.bindings.map((binding) => binding.id)).toEqual([
      'help.keyboardShortcuts',
    ]);
    expect(mac.get('Cmd+S')?.bindings.map((binding) => binding.id)).toEqual(['key.save']);
    expect(mac.get('Cmd+]')).toBeUndefined();
    expect(
      mac
        .get('Cmd+Up')
        ?.bindings.map((binding) => binding.scope)
        .sort(),
    ).toEqual(['canvas', 'filmstrip']);
    expect(mac.get('Ctrl+M')?.bindings.map((binding) => binding.id)).toEqual([
      'insert.newSlide',
      'slide.newSlide',
      'toolbar.newSlide',
    ]);
  });

  it('gives every menu its access key on both platforms', () => {
    for (const menu of MENUS) {
      expect(menu.key.mac).toBe(`Ctrl+Option+${menu.accessKey.toUpperCase()}`);
      expect(menu.key.win).toBe(`Alt+${menu.accessKey.toUpperCase()}`);
    }
  });
});
