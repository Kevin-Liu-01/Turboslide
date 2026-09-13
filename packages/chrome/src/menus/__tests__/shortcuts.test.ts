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

  it('names fixture rows that exist from every omission and gesture, or marks the gesture as ours', () => {
    for (const entry of OMITTED_SHORTCUTS) expect(rows.has(entry.google), entry.google).toBe(true);
    for (const gesture of GESTURES) {
      if (gesture.google === undefined) expect(gesture.turboslide, gesture.id).toBe(true);
      else expect(rows.has(gesture.google), gesture.google).toBe(true);
    }
    for (const binding of table)
      for (const id of binding.google) expect(rows.has(id), `${binding.id} -> ${id}`).toBe(true);
    /* SPEC-2 0.81, section 9: the wheel zoom and the pan are Turboslide gestures with no Google row */
    expect(
      GESTURES.filter((gesture) => gesture.turboslide === true).map((gesture) => gesture.id),
    ).toEqual(['zoomWheel', 'pan']);
  });

  it('greys exactly the rows SPEC-2 section 9 lists, and binds or omits every other row', () => {
    const greyed = new Set<string>();
    for (const entry of OMITTED_SHORTCUTS) if (entry.status === 'later') greyed.add(entry.google);
    for (const binding of table)
      if (binding.status === 'later' && binding.scope !== 'present')
        for (const id of binding.google) greyed.add(id);
    expect([...greyed].sort()).toEqual(
      [
        'select-none',
        'move-paragraph-up',
        'move-paragraph-down',
        'animations-panel',
        'insert-comment',
        'enter-comment',
        'next-comment',
        'previous-comment',
        'comment-focus-next',
        'comment-focus-previous',
        'comment-focus-reply',
        'comment-focus-resolve',
        'comment-thread',
        'comment-reply-selected',
        'comment-next-selected',
        'comment-previous-selected',
        'comment-resolve-selected',
        'comment-exit-selected',
        'hide-comment',
        'verbalize-selection',
        'screen-reader-support',
        'braille-support',
        'verbalize-from-cursor',
        'announce-formatting',
        'input-tools-menu',
        'toggle-input-controls',
        'open-explore',
        'captions-while-presenting',
        'html-view',
        'cell-border-selection',
        'select-list-item',
        'select-list-items-level',
        'next-formatting-change',
        'previous-formatting-change',
      ].sort(),
    );
    /* the misspelling rows left the greyed list: the browser's marks have no key the page drives */
    for (const id of ['next-misspelling', 'previous-misspelling']) {
      expect(byGoogle.get(id)).toBeUndefined();
      expect(omitted.get(id)?.status).toBe('omit');
    }
  });

  it('binds the round two chords of SPEC-2 section 9 to Google’s rows', () => {
    const mac = buildEditorKeymap('mac');
    const ids = (chord: string) => mac.get(chord)?.bindings.map((binding) => binding.id) ?? [];
    expect(ids('Cmd+I')).toEqual(['format.text.italic']);
    expect(ids('Cmd+U')).toEqual(['format.text.underline']);
    expect(ids('Cmd+Shift+X')).toEqual(['format.text.strikethrough']);
    expect(ids('Cmd+.')).toEqual(['format.text.superscript']);
    expect(ids('Cmd+,')).toEqual(['format.text.subscript']);
    expect(ids('Cmd+Shift+J')).toEqual(['format.alignIndent.justified']);
    expect(ids('Cmd+]')).toEqual(['format.alignIndent.increaseIndent']);
    expect(ids('Cmd+[')).toEqual(['format.alignIndent.decreaseIndent']);
    expect(ids('Cmd+Option+G')).toEqual(['arrange.group']);
    expect(ids('Cmd+Option+Shift+G')).toEqual(['arrange.ungroup']);
    expect(ids('Option+Left')).toEqual(['key.rotateLeft15']);
    expect(ids('Option+Shift+Right')).toEqual(['key.rotateRight1']);
    /* SPEC-2 0.78: the Cmd+Option pair is an alias with the note on Google's row */
    expect(ids('Cmd+Option+Left')).toEqual(['key.rotateLeft15Alias']);
    expect(ids('Cmd+Option+Right')).toEqual(['key.rotateRight15Alias']);
    const alias = table.find((binding) => binding.id === 'key.rotateLeft15Alias');
    expect(alias?.alias).toBe('key.rotateLeft15');
    expect(alias?.google).toEqual([]);
    expect(TURBOSLIDE_ONLY_KEYS).toContain('key.rotateLeft15Alias');
    expect(table.find((binding) => binding.id === 'key.rotateLeft15')?.note).toBe(
      'Cmd+Option+Left and Right also rotate when your browser lets them through',
    );
    expect(table.find((binding) => binding.id === 'format.text.subscript')?.note).toBe(
      'Your browser may take this key; the Format menu has the item',
    );
    /* the canvas keys read the object predicate, so a grammar slide's block takes them (SPEC-2 1.1) */
    for (const id of ['key.nudge', 'key.nudgeMore', 'key.resizeWider', 'key.rotateLeft15']) {
      const binding = table.find((each) => each.id === id);
      expect(binding?.scope, id).toBe('canvas');
      expect(['objectSelected', 'rotatable']).toContain(binding?.enabled);
    }
    expect(ids('Cmd+Plus')).toEqual(['view.zoom.in']);
    expect(ids('Cmd+0')).toEqual(['view.zoom.100']);
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
    /* Cmd+] and Cmd+[ were reserved in round one; SPEC-2 section 9 binds them to the indents */
    expect(mac.get('Cmd+]')?.bindings.map((binding) => binding.id)).toEqual([
      'format.alignIndent.increaseIndent',
    ]);
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
