// Import theme (gslides-parity SPEC-5 0.28, 5.3): the records of a fixture's theme parts carry the
// eleven validator keys, the faces and the source; a deck's edited theme and imported records
// come over sourced to it; the sixth record is refused with the sentence.
import { themeRecordSchema } from '@turboslide/schema/deck';
import type { DeckDocument, ThemeRecord } from '@turboslide/schema/deck';
import { THEME_COLOR_SLOTS } from '@turboslide/schema/validate/theme';
import { describe, expect, it } from 'vitest';

import {
  FIVE_THEMES_SENTENCE,
  appendImportedTheme,
  pickThemeRecord,
  templateSlideRows,
} from './lane.ts';
import { fixtureEntries } from './pptx/__tests__/unzip.ts';
import { themeRecordsFromDeck, themeRecordsOf } from './theme-import.ts';

describe('themeRecordsOf', () => {
  it('reads one record per theme part with the eleven keys, the faces and the source', () => {
    const records = themeRecordsOf(fixtureEntries('01-text.pptx'), '01-text.pptx');
    expect(records.length).toBeGreaterThanOrEqual(1);
    for (const record of records) {
      expect(themeRecordSchema.safeParse(record).success).toBe(true);
      expect(Object.keys(record.colors)).toEqual(THEME_COLOR_SLOTS.map((slot) => slot.key));
    }
    expect(records[0]!.source).toEqual({ file: '01-text.pptx', themeIndex: 0 });
    expect(records[0]!.name.length).toBeGreaterThan(0);
    expect(records[0]!.fonts.text).toBeDefined();
  });

  it('picks by index and refuses one past the end', () => {
    const records = themeRecordsOf(fixtureEntries('01-text.pptx'), '01-text.pptx');
    expect(pickThemeRecord(records, undefined, '01-text.pptx')).toBe(records[0]);
    expect(() => pickThemeRecord(records, 9, '01-text.pptx')).toThrow(RangeError);
    expect(() => pickThemeRecord([], undefined, 'x.pptx')).toThrow(/holds no theme/);
  });
});

describe('appendImportedTheme (SPEC-5 0.28)', () => {
  const record: ThemeRecord = {
    name: 'Acme',
    colors: { ink: '#101010' },
    fonts: {},
    source: { file: 'a.pptx', themeIndex: 0 },
  };

  it('appends up to five and refuses the sixth with the sentence', () => {
    let list: ThemeRecord[] = [];
    for (let i = 0; i < 5; i += 1) {
      const next = appendImportedTheme(list, { ...record, name: `T${i}` });
      expect(next.index).toBe(i);
      list = next.importedThemes;
    }
    expect(list).toHaveLength(5);
    expect(() => appendImportedTheme(list, record)).toThrow(FIVE_THEMES_SENTENCE);
  });
});

describe('themeRecordsFromDeck', () => {
  const base: DeckDocument = {
    deck: {
      schemaVersion: 1,
      id: 'acme',
      title: 'Acme review',
      theme: 'gt-ink-paper',
      sections: [{ id: 'deck', name: 'Deck', slideIds: ['title'] }],
      assets: {},
      revision: 3,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    },
    slides: {
      title: {
        schemaVersion: 1,
        id: 'title',
        kind: 'title',
        mark: { w: 132, h: 84 },
        heading: 'Acme',
        lead: '',
      },
    },
  };

  it('offers the edited theme under its name, then the imported records, sourced to the deck', () => {
    const document: DeckDocument = {
      ...base,
      deck: {
        ...base.deck,
        themeEdits: {
          name: 'Acme blue',
          colors: { light: { ink: '#0b1f44', link: '#2f5ce0' } },
          fonts: { display: 'inter' },
        },
        importedThemes: [
          {
            name: 'Old',
            colors: { paper: '#ffffff' },
            fonts: {},
            source: { file: 'old.pptx', themeIndex: 1 },
          },
        ],
      },
    };
    const records = themeRecordsFromDeck(document, 'acme');
    expect(records.map((r) => r.name)).toEqual(['Acme blue', 'Old']);
    expect(records[0]!.colors).toEqual({ ink: '#0b1f44', link: '#2f5ce0' });
    expect(records[0]!.fonts).toEqual({ display: 'inter' });
    expect(records.every((r) => 'deckId' in r.source && r.source.deckId === 'acme')).toBe(true);
    for (const record of records) expect(themeRecordSchema.safeParse(record).success).toBe(true);
  });

  it('refuses a deck with nothing to copy', () => {
    expect(() => themeRecordsFromDeck(base, 'acme')).toThrow(RangeError);
  });

  it('lists a template document as slide rows', () => {
    expect(templateSlideRows(base)).toEqual([
      { index: 1, slideId: 'title', title: 'Acme', kind: 'title' },
    ]);
  });
});
