import { afterEach, describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';

import {
  FONTS_RECENT_MAX,
  FONTS_RECENT_STORAGE,
  FONT_PICKER,
  INTER_RELEASE_TAG,
  filterRows,
  fixedFieldDoc,
  fixedFieldFamily,
  fixedFieldRole,
  groupRows,
  licenceUrlOf,
  pushRecentFont,
  readRecentFonts,
  takesFamily,
  writeRecentFonts,
} from '../font-picker-model';
import type { FontRow } from '../font-picker-model';

// The Font dropdown's pure rules of the features round (docs/FEATURES.md 3.1 item 2 and 3.5;
// audit-fonts 5, 10, 11): the Inter licence link names the v4.1 tag; the search matches the name,
// the category label and the id; the Recent group lists at most five faces after Used, newest
// first, per browser, and Clear recent empties the store.

const ROWS: FontRow[] = [
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans',
    weights: [400],
    italic: true,
    licence: 'OFL 1.1',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    category: 'sans',
    weights: [400],
    italic: true,
    licence: 'Apache 2.0',
  },
  { id: 'lora', name: 'Lora', category: 'serif', weights: [400], italic: true, licence: 'OFL 1.1' },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    category: 'sans',
    weights: [400],
    italic: true,
    licence: 'OFL 1.1',
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    category: 'mono',
    weights: [400],
    italic: true,
    licence: 'OFL 1.1',
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    category: 'mono',
    weights: [400],
    italic: false,
    licence: 'OFL 1.1',
  },
  {
    id: 'bebas-neue',
    name: 'Bebas Neue',
    category: 'display',
    weights: [400],
    italic: false,
    licence: 'OFL 1.1',
  },
];

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const storage = new MemoryStorage();

afterEach(() => storage.clear());

describe('licenceUrlOf', () => {
  it('names the v4.1 release tag for Inter and the pinned commit for the rest', () => {
    expect(INTER_RELEASE_TAG).toBe('v4.1');
    expect(licenceUrlOf('inter')).toBe('https://github.com/rsms/inter/blob/v4.1/LICENSE.txt');
    expect(licenceUrlOf('inter')).not.toContain('v4.001');
    expect(licenceUrlOf('geist')).toMatch(/\/ofl\/geist\/OFL\.txt$/);
    expect(licenceUrlOf('fraunces')).toMatch(/\/ofl\/fraunces\/OFL\.txt$/);
  });
});

describe('filterRows', () => {
  it('matches the name, the category label and the id', () => {
    expect(filterRows(ROWS, 'mono').map((row) => row.id)).toEqual(['jetbrains-mono', 'fira-code']);
    expect(filterRows(ROWS, 'serif').map((row) => row.id)).toEqual([
      'inter',
      'roboto',
      'lora',
      'dm-sans',
    ]);
    expect(filterRows(ROWS, 'Serif').map((row) => row.id)).toContain('lora');
    expect(filterRows(ROWS, 'dm-sans').map((row) => row.id)).toEqual(['dm-sans']);
    expect(filterRows(ROWS, 'display').map((row) => row.id)).toEqual(['bebas-neue']);
    expect(filterRows(ROWS, 'zzqx')).toEqual([]);
    expect(filterRows(ROWS, '')).toHaveLength(ROWS.length);
  });
});

describe('the Recent group', () => {
  it('lists the recent faces after Used and before the catalog, in the order picked', () => {
    const groups = groupRows(ROWS, ['lora'], '', ['inter'], ['fira-code', 'roboto']);
    expect(groups.map((group) => group.id)).toEqual([
      'brand',
      'used',
      'recent',
      'sans',
      'serif',
      'display',
      'mono',
    ]);
    const recent = groups.find((group) => group.id === 'recent');
    expect(recent?.title).toBe(FONT_PICKER.recent);
    expect(recent?.rows.map((row) => row.id)).toEqual(['fira-code', 'roboto']);
    /* the group follows the query and is dropped when nothing matches */
    expect(
      groupRows(ROWS, [], 'fira', [], ['fira-code', 'roboto']).find((g) => g.id === 'recent')?.rows,
    ).toHaveLength(1);
    expect(groupRows(ROWS, [], 'lora', [], ['fira-code']).some((g) => g.id === 'recent')).toBe(
      false,
    );
    expect(groupRows(ROWS, [], '', []).some((g) => g.id === 'recent')).toBe(false);
  });

  it('keeps five per browser, newest first, never the theme face, and Clear recent empties the store', () => {
    expect(readRecentFonts(storage)).toEqual([]);
    expect(readRecentFonts(null)).toEqual([]);
    let recent = pushRecentFont([], 'roboto', storage);
    recent = pushRecentFont(recent, 'lora', storage);
    recent = pushRecentFont(recent, 'roboto', storage);
    expect(recent).toEqual(['roboto', 'lora']);
    expect(readRecentFonts(storage)).toEqual(['roboto', 'lora']);
    /* the theme's face and no pick change nothing */
    expect(pushRecentFont(recent, 'inter', storage)).toEqual(recent);
    expect(pushRecentFont(recent, null, storage)).toEqual(recent);
    for (const id of ['dm-sans', 'jetbrains-mono', 'fira-code', 'bebas-neue'] as const)
      recent = pushRecentFont(recent, id, storage);
    expect(recent).toHaveLength(FONTS_RECENT_MAX);
    expect(recent[0]).toBe('bebas-neue');
    expect(recent).not.toContain('lora');
    /* an unknown id and a broken store read as nothing of theirs */
    storage.setItem(FONTS_RECENT_STORAGE, JSON.stringify(['roboto', 'comic-sans', 'roboto']));
    expect(readRecentFonts(storage)).toEqual(['roboto']);
    storage.setItem(FONTS_RECENT_STORAGE, '{not json');
    expect(readRecentFonts(storage)).toEqual([]);
    writeRecentFonts([], storage);
    expect(storage.getItem(FONTS_RECENT_STORAGE)).toBeNull();
  });
});

describe('the fixed fields', () => {
  // The features round's fix round (docs/gslides-parity/focus/VERIFICATION.md F.5 F8): a fixed
  // kind's field carries no typography, so the Font control reads the kit's face for the field's
  // role and its sentence names the kit path; the fields still take no family (Kevin's call,
  // F.10 item 5).
  const heading: Block = { id: 'heading', type: 'heading', level: 'h1', text: 'Renewals' };
  const lead: Block = { id: 'lead', type: 'paragraph', role: 'lead', tone: 'muted', text: '' };
  const plate: Block = { id: 'plate', type: 'box', fill: 'paper', strokeWidth: 0 };

  it('reads the Display role on a heading and the Text role on the rest', () => {
    expect(fixedFieldRole(heading)).toBe('display');
    expect(fixedFieldRole({ ...heading, level: 'big' })).toBe('display');
    expect(fixedFieldRole(lead)).toBe('text');
    expect(fixedFieldRole(plate)).toBe('text');
    /* nothing to write a family into: the fields stay off */
    expect(takesFamily(undefined)).toBe(false);
  });

  it("reads the kit's face for the role and the theme's face when the kit is silent", () => {
    expect(fixedFieldFamily(undefined, 'display')).toBeNull();
    expect(fixedFieldFamily({ fonts: { display: 'inter' } }, 'display')).toBeNull();
    expect(fixedFieldFamily({ fonts: { display: 'fraunces' } }, 'display')).toBe('fraunces');
    expect(fixedFieldFamily({ fonts: { display: 'fraunces' } }, 'text')).toBeNull();
    expect(fixedFieldFamily({ fonts: { display: 'fraunces', text: 'geist' } }, 'text')).toBe(
      'geist',
    );
  });

  it('names the kit face and the menu path in the disabled sentence', () => {
    expect(fixedFieldDoc('display')).toBe(FONT_PICKER.fixedDisplayDoc);
    expect(fixedFieldDoc('text')).toBe(FONT_PICKER.fixedTextDoc);
    expect(fixedFieldDoc('display')).toContain('Display face');
    expect(fixedFieldDoc('text')).toContain('Text face');
    for (const role of ['display', 'text'] as const) {
      expect(fixedFieldDoc(role)).toContain('Slide > Edit theme');
      expect(fixedFieldDoc(role)).not.toMatch(/[.—]$/);
    }
  });
});
