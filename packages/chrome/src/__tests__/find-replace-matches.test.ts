import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import { slideOrder } from '@turboslide/schema/deck';

import { deckMatches } from '../dialogs/FindReplace';
import { openingCollapsed, readCollapsedSections, writeCollapsedSections } from '../FormatOptions';

// Find and replace's match list (docs/PRODUCT.md section 5; audit-gaps 21) and the Format options
// panel's remembered sections (PRODUCT.md 3.2; audit-interface 15). Pure over the document.

describe('deckMatches', () => {
  const base = workedDocument();
  const order = slideOrder(base.deck);
  const first = order[0] ?? '';
  const doc: DeckDocument = {
    deck: base.deck,
    slides: {
      ...base.slides,
      [first]: {
        ...base.slides[first]!,
        notes: 'Acme asked twice about Acme pricing',
      },
    } as DeckDocument['slides'],
  };

  it('lists one row per occurrence in reading order, the notes as a row with no block', () => {
    const rows = deckMatches(doc, order, 'Acme', false);
    const notes = rows.filter((row) => row.blockId === null);
    expect(notes.length).toBe(2);
    expect(notes.map((row) => row.index)).toEqual([0, 1]);
    expect(rows.every((row) => order.includes(row.slideId))).toBe(true);
  });

  it('answers none for an empty query and follows Match case', () => {
    expect(deckMatches(doc, order, '', false)).toEqual([]);
    expect(deckMatches(doc, order, 'acme', true).filter((row) => row.blockId === null)).toEqual([]);
    expect(
      deckMatches(doc, order, 'acme', false).filter((row) => row.blockId === null).length,
    ).toBe(2);
  });
});

describe('the remembered sections of Format options', () => {
  it('round trips the collapsed set and drops unknown ids and bad JSON', () => {
    const stored = writeCollapsedSections(new Set(['textFitting', 'text']));
    expect([...readCollapsedSections(stored)]).toEqual(['textFitting', 'text']);
    expect([...readCollapsedSections('["textFitting","nope"]')]).toEqual(['textFitting']);
    expect([...readCollapsedSections('{')]).toEqual([]);
    expect([...readCollapsedSections(null)]).toEqual([]);
  });

  it('opens one section alone from a menu row and the remembered set otherwise', () => {
    const shown = ['size', 'position', 'textFitting', 'text'] as const;
    expect([...openingCollapsed(shown, new Set(['textFitting']), null)]).toEqual(['textFitting']);
    expect([...openingCollapsed(shown, new Set(['textFitting']), 'textFitting')]).toEqual([
      'size',
      'position',
      'text',
    ]);
    expect([...openingCollapsed(shown, new Set(['altText']), null)]).toEqual([]);
  });
});
