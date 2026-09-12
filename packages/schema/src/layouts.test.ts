// The layout list (gslides-parity SPEC 5.2, 14.2 layouts.test.ts): every entry's make produces a
// slide that validates with no severity 3 issue on the blank deck (the picture entries with the
// starter set); the first eleven ids and labels match R03 b.2 in order; every template.json
// archetype names a layout id; every Text a layout writes is empty; the picture entries answer
// null on a deck without a starter picture; derivedLayout reads the layout back structurally.
// This file also carries the intent of packages/chrome/src/__tests__/slide-templates.test.ts,
// which B3 deletes once the chrome reads this list.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Deck, Slide } from './deck.ts';
import { LAYOUT_IDS, slideBlocks } from './deck.ts';
import { WORKED_DECK, workedDocument } from './fixtures.ts';
import { ICON_NAMES } from './icons.ts';
import {
  GOOGLE_LAYOUT_COUNT,
  LAYOUTS,
  PROMPTS,
  derivedLayout,
  freeLayoutSlideId,
  hasStarterPicture,
  isLayoutId,
  layoutEntry,
  layoutGroups,
  pickAsset,
  pickPicture,
  promptFor,
} from './layouts.ts';
import { validateDeck } from './validate.ts';

const DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');
const BLANK_TEMPLATE = join(DECKS, 'templates', 'blank');
const GT_TEMPLATE_JSON = join(DECKS, 'templates', 'gt-brand', 'template.json');

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** The blank template's manifest: the four starter pictures and one title slide. */
const blankDeck = readJson<Deck>(join(BLANK_TEMPLATE, 'deck.json'));
const blankTitle = readJson<Slide>(join(BLANK_TEMPLATE, 'slides', 'title.json'));

/** Google's eleven in Google's order (R03 b.2, the PredefinedLayout reference). */
const GOOGLE_ELEVEN: [string, string][] = [
  ['title', 'Title slide'],
  ['opener', 'Section header'],
  ['split', 'Title and body'],
  ['cols', 'Title and two columns'],
  ['title-only', 'Title only'],
  ['one-column', 'One column text'],
  ['statement', 'Main point'],
  ['section-description', 'Section title and description'],
  ['mood', 'Caption'],
  ['big-number', 'Big number'],
  ['blank', 'Blank'],
];

/** Every Text of a slide: the slide fields, then every text field of every block. */
function texts(slide: Slide): string[] {
  const out: string[] = [];
  if (slide.kind === 'title') out.push(slide.heading, slide.lead);
  if (slide.kind === 'statement') out.push(slide.big);
  const KEYS = ['text', 'value', 'key', 'caption', 'label', 'sub', 'name', 'note', 'quote'];
  for (const { block } of slideBlocks(slide)) {
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          if (key === 'icon' || key === 'state' || key === 'id' || key === 'type') continue;
          if (key === 'cells' && Array.isArray(item) && item.every((c) => typeof c === 'string')) {
            out.push(...(item as string[]));
            continue;
          }
          if (typeof item === 'string' && KEYS.includes(key)) out.push(item);
          else walk(item);
        }
      }
    };
    walk(block);
  }
  return out;
}

describe('LAYOUTS', () => {
  it('lists the 21 ids of SPEC 5.2 in order, Google’s eleven first with google: true', () => {
    expect(LAYOUTS.map((entry) => entry.id)).toEqual([...LAYOUT_IDS]);
    expect(LAYOUTS).toHaveLength(21);
    expect(GOOGLE_LAYOUT_COUNT).toBe(11);
    expect(LAYOUTS.slice(0, 11).map((entry) => [entry.id, entry.label])).toEqual(GOOGLE_ELEVEN);
    expect(LAYOUTS.slice(0, 11).every((entry) => entry.google)).toBe(true);
    expect(LAYOUTS.slice(11).every((entry) => !entry.google)).toBe(true);
    expect(LAYOUTS.slice(11).map((entry) => entry.label)).toEqual([
      'Ruled rows',
      'Ruled statement list',
      'Title and table',
      'Figure',
      'Pair of figures',
      'Tile grid',
      'Detail grid',
      'Status board',
      'Matrix',
      'Closing',
    ]);
    expect(layoutGroups().google).toHaveLength(11);
    expect(layoutGroups().gt).toHaveLength(10);
  });

  it('names a sprite icon, a kind, a one sentence doc and the picture need per entry', () => {
    for (const entry of LAYOUTS) {
      expect(ICON_NAMES, `${entry.id} icon`).toContain(entry.icon);
      expect(entry.doc.endsWith('.'), `${entry.id} doc`).toBe(true);
      expect(entry.needsPicture).toBe(
        entry.kind === 'opener' || entry.kind === 'mood' || entry.kind === 'closing',
      );
      if (entry.kind === 'content') expect(entry.layout, entry.id).toBeDefined();
      else expect(entry.layout, entry.id).toBeUndefined();
    }
    expect(layoutEntry('big-number').label).toBe('Big number');
    expect(() => layoutEntry('nope')).toThrow(RangeError);
    expect(isLayoutId('table')).toBe(true);
    expect(isLayoutId('slide')).toBe(false);
  });

  it('makes a slide per entry that validates on the blank deck with no severity 3 issue and only empty Texts', () => {
    for (const entry of LAYOUTS) {
      const slide = entry.make(`new-${entry.id}`, blankDeck, 'deck');
      expect(slide, entry.id).not.toBeNull();
      if (!slide) continue;
      expect(slide.kind).toBe(entry.kind);
      if (slide.kind === 'content') expect(slide.layout.type).toBe(entry.layout);
      const result = validateDeck({
        deck: {
          ...blankDeck,
          sections: [{ id: 'deck', name: 'Deck', slideIds: [slide.id, 'title'] }],
        },
        slides: { title: blankTitle, [slide.id]: slide },
      });
      const blocking = result.issues.filter((issue) => issue.severity === 3);
      expect(blocking, `${entry.id}: ${blocking.map((i) => i.message).join('; ')}`).toEqual([]);
      const lines = texts(slide).filter((_text, index, all) => {
        // the credit is the asset's real credit line, not a placeholder
        void index;
        void all;
        return true;
      });
      const credit = slideBlocks(slide).find(({ block }) => block.type === 'credit');
      const expectedNonEmpty = credit === undefined ? 0 : 1;
      const nonEmpty = lines.filter((text) => text !== '');
      expect(nonEmpty.length, `${entry.id}: ${nonEmpty.join(' | ')}`).toBe(expectedNonEmpty);
      if (entry.id !== 'blank') expect(lines.length, entry.id).toBeGreaterThan(0);
    }
  });

  it('follows the block table of SPEC 5.2 for the new entries', () => {
    const titleOnly = layoutEntry('title-only').make('x', blankDeck, 'deck');
    expect(titleOnly?.kind === 'content' && titleOnly.layout.type).toBe('stack');
    expect(titleOnly?.kind === 'content' && titleOnly.slots.main?.map((b) => b.type)).toEqual([
      'heading',
    ]);
    const oneColumn = layoutEntry('one-column').make('x', blankDeck, 'deck');
    expect(oneColumn?.kind === 'content' && oneColumn.slots.main?.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
    ]);
    const description = layoutEntry('section-description').make('x', blankDeck, 'deck');
    expect(description?.kind === 'content' && description.layout).toMatchObject({
      type: 'cols',
      ratio: '5/7',
    });
    expect(description?.kind === 'content' && description.slots.left?.[1]).toMatchObject({
      type: 'paragraph',
      role: 'cap',
    });
    expect(description?.kind === 'content' && description.slots.right?.[0]).toMatchObject({
      type: 'paragraph',
      role: 'lead',
    });
    const bigNumber = layoutEntry('big-number').make('x', blankDeck, 'deck');
    expect(bigNumber?.kind === 'content' && bigNumber.layout.type).toBe('center');
    expect(bigNumber?.kind === 'content' && bigNumber.slots.main?.[0]).toMatchObject({
      type: 'heading',
      level: 'big',
      text: '',
    });
    const blank = layoutEntry('blank').make('x', blankDeck, 'deck');
    expect(blank?.kind === 'content' && blank.layout.type).toBe('freeform');
    expect(blank?.kind === 'content' && Object.keys(blank.slots)).toEqual([]);
    const table = layoutEntry('table').make('x', blankDeck, 'deck');
    const tableBlock = table?.kind === 'content' ? table.slots.body?.[0] : undefined;
    expect(tableBlock?.type).toBe('table');
    if (tableBlock?.type === 'table') {
      expect(tableBlock.columns).toHaveLength(3);
      expect(tableBlock.rows).toHaveLength(4);
      expect(tableBlock.rows[0]?.header).toBe(true);
    }
    const figure = layoutEntry('figure').make('x', blankDeck, 'deck');
    expect(figure?.kind === 'content' && figure.slots.right?.[0]).toMatchObject({
      type: 'shot',
      asset: '',
      caption: '',
    });
  });

  it('withholds the three picture layouts from a deck without a starter picture and takes the closing picture last', () => {
    const bare: Deck = { ...blankDeck, assets: {} };
    expect(hasStarterPicture(bare)).toBe(false);
    expect(hasStarterPicture(blankDeck)).toBe(true);
    const withheld = LAYOUTS.filter((entry) => entry.make('x', bare, 'deck') === null).map(
      (entry) => entry.id,
    );
    expect(withheld).toEqual(['opener', 'mood', 'closing']);
    // the figure layouts need no starter: they insert the empty picture reference
    expect(layoutEntry('figure').make('x', bare, 'deck')).not.toBeNull();
    expect(layoutEntry('pair').make('x', bare, 'deck')).not.toBeNull();
    expect(pickPicture(blankDeck, 'opener')?.id).toBe('opener-brand');
    expect(pickPicture(blankDeck, 'mood')?.id).toBe('mood-earth');
    expect(pickPicture(blankDeck, 'closing')?.id).toBe('opener-closing');
    const opener = layoutEntry('opener').make('x', blankDeck, 'brand');
    expect(opener?.kind === 'opener' && opener.sectionId).toBe('brand');
    expect(opener?.kind === 'opener' && opener.plate.blocks[2]).toMatchObject({
      type: 'credit',
      text: 'Material: Event Horizon, a Prototemplate direction',
    });
  });

  it('picks assets by role in order of preference (the chrome test’s intent)', () => {
    expect(pickAsset(WORKED_DECK, ['mood', 'opener'])?.id).toBe('mood-earth');
    expect(pickAsset(WORKED_DECK, ['opener'])?.id).toBe('liquid-metal-diamond');
    expect(pickAsset(WORKED_DECK, ['detail', 'capture'])?.id).toBe('site-home');
    expect(pickAsset({ ...WORKED_DECK, assets: {} }, ['capture'])).toBeUndefined();
  });

  it('agrees with the committed GT template record: every archetype names a layout id with its kind and layout', () => {
    const record = readJson<{ archetypes: { id: string; kind: string; layout?: string }[] }>(
      GT_TEMPLATE_JSON,
    );
    expect(record.archetypes.length).toBeGreaterThan(0);
    for (const entry of record.archetypes) {
      expect(isLayoutId(entry.id), entry.id).toBe(true);
      const layout = layoutEntry(entry.id);
      expect(layout.kind, entry.id).toBe(entry.kind);
      expect(layout.layout, entry.id).toBe(entry.layout);
    }
  });

  it('numbers new slide ids <layout>-<n> from the first free n', () => {
    expect(freeLayoutSlideId('big-number', new Set())).toBe('big-number-1');
    expect(freeLayoutSlideId('big-number', new Set(['big-number-1', 'big-number-2']))).toBe(
      'big-number-3',
    );
  });
});

describe('promptFor', () => {
  it('names the prompt of SPEC 5.4 per placeholder', () => {
    expect(promptFor({ slide: { kind: 'title' }, path: '/heading' })).toBe(PROMPTS.title);
    expect(promptFor({ slide: { kind: 'title' }, path: '/lead' })).toBe(PROMPTS.subtitle);
    expect(promptFor({ slide: { kind: 'statement' }, path: '/big' })).toBe(PROMPTS.text);
    const h2 = { id: 'h', type: 'heading' as const, level: 'h2' as const, text: '' };
    expect(promptFor({ slide: { kind: 'content' }, block: h2, path: '/text' })).toBe(PROMPTS.title);
    const big = { ...h2, level: 'big' as const };
    expect(
      promptFor({ slide: { kind: 'content', template: 'big-number' }, block: big, path: '/text' }),
    ).toBe(PROMPTS.number);
    expect(promptFor({ slide: { kind: 'opener' }, block: big, path: '/text' })).toBe(PROMPTS.title);
    const shot = { id: 'f', type: 'shot' as const, asset: '', caption: '' };
    expect(promptFor({ slide: { kind: 'content' }, block: shot, path: '/caption' })).toBe(
      PROMPTS.caption,
    );
    const p = { id: 'p', type: 'paragraph' as const, text: '' };
    expect(promptFor({ slide: { kind: 'content' }, block: p, path: '/text' })).toBe(PROMPTS.text);
  });
});

describe('derivedLayout', () => {
  it('reads template when written, else the entry whose make matches the slide structurally', () => {
    for (const entry of LAYOUTS) {
      const slide = entry.make('x', blankDeck, 'deck');
      if (!slide) continue;
      const { template: _template, ...bare } = slide;
      expect(derivedLayout(bare as Slide), entry.id).toBe(entry.id);
      expect(derivedLayout({ ...slide, template: 'matrix' }), entry.id).toBe('matrix');
    }
  });

  it('falls back to Title and body for a content slide and to the kind for the others', () => {
    const document = workedDocument();
    const contentRule = document.slides['content-rule'];
    const title = document.slides.title;
    const thesis = document.slides.thesis;
    expect(contentRule?.kind).toBe('content');
    // cols 1/1 with a heading and a paragraph on the left and a plain list on the right is the
    // Ruled statement list at another ratio; the ratio is not part of the signature
    expect(derivedLayout(contentRule as Slide)).toBe('plain');
    const twoColumns: Slide = {
      schemaVersion: 1,
      id: 'two',
      kind: 'content',
      layout: { type: 'cols', ratio: '4/8' },
      slots: {
        left: [{ id: 'h', type: 'heading', level: 'h2', text: 'Two' }],
        right: [{ id: 'say', type: 'say', items: [{ quote: 'Say this' }] }],
      },
    };
    expect(derivedLayout(twoColumns)).toBe('split');
    expect(derivedLayout(title as Slide)).toBe('title');
    expect(derivedLayout(thesis as Slide)).toBe('statement');
    expect(derivedLayout(blankTitle)).toBe('title');
  });
});
