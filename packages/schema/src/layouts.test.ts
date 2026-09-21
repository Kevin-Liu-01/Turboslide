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

import type { Deck, LayoutId, Slide } from './deck.ts';
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
  subtitleParagraphId,
} from './layouts.ts';
import { validateDeck } from './validate.ts';

const DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');
const BLANK_TEMPLATE = join(DECKS, 'templates', 'blank');
const GT_TEMPLATE_JSON = join(DECKS, 'templates', 'gt-brand', 'template.json');

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** The product round's Title, subtitle and body id; typed as a LayoutId until it lands in LAYOUT_IDS (build/b3.md R1). */
const SUBTITLE_ID = 'subtitle-body' as LayoutId;
/** Whether that id has landed in LAYOUT_IDS. */
const SUBTITLE_BODY = isLayoutId(SUBTITLE_ID);

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
  it('lists the ids of SPEC 5.2 in order, Google’s eleven first with google: true, the GT layouts after', () => {
    expect(LAYOUTS.map((entry) => entry.id)).toEqual([...LAYOUT_IDS]);
    expect(LAYOUTS).toHaveLength(LAYOUT_IDS.length);
    expect(GOOGLE_LAYOUT_COUNT).toBe(11);
    expect(LAYOUTS.slice(0, 11).map((entry) => [entry.id, entry.label])).toEqual(GOOGLE_ELEVEN);
    expect(LAYOUTS.slice(0, 11).every((entry) => entry.google)).toBe(true);
    expect(LAYOUTS.slice(11).every((entry) => !entry.google)).toBe(true);
    // the product round's Title, subtitle and body is the first GT layout once its id is in
    // LAYOUT_IDS (docs/PRODUCT.md section 2 rank 2; build/b3.md R1)
    const gtLabels = LAYOUTS.slice(11).map((entry) => entry.label);
    expect(gtLabels).toEqual([
      ...(SUBTITLE_BODY ? ['Title, subtitle and body'] : []),
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
    expect(layoutGroups().gt).toHaveLength(LAYOUT_IDS.length - 11);
  });

  it('names a sprite icon, a kind, a one sentence doc, the seller sentence and the picture need per entry', () => {
    for (const entry of LAYOUTS) {
      expect(ICON_NAMES, `${entry.id} icon`).toContain(entry.icon);
      expect(entry.doc.endsWith('.'), `${entry.id} doc`).toBe(true);
      // the seller sentence (docs/PRODUCT.md rank 24): the name, a colon, the contents; "your
      // logo" and never "your mark"; no trailing period, as the spec's shapes are written
      expect(entry.sentence.startsWith(`${entry.label}: `), `${entry.id} sentence`).toBe(true);
      expect(entry.sentence.endsWith('.'), `${entry.id} sentence period`).toBe(false);
      expect(/\bmark\b/i.test(entry.sentence), `${entry.id} sentence says mark`).toBe(false);
      expect(entry.sentence.length).toBeLessThan(120);
      expect(entry.needsPicture).toBe(
        entry.kind === 'opener' || entry.kind === 'mood' || entry.kind === 'closing',
      );
      if (entry.kind === 'content') expect(entry.layout, entry.id).toBeDefined();
      else expect(entry.layout, entry.id).toBeUndefined();
    }
    expect(layoutEntry('title').sentence).toBe('Title slide: your logo, a title and a subtitle');
    expect(layoutEntry('split').sentence).toBe('Title and body: a title over one body');
    expect(layoutEntry('cols').sentence).toBe(
      'Title and two columns: a title over two columns of text',
    );
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

  it('makes Title and body one title over one body, and keeps the 4/8 head as Title, subtitle and body (docs/PRODUCT.md rank 2)', () => {
    const split = layoutEntry('split').make('x', blankDeck, 'deck');
    expect(split?.kind === 'content' && split.layout).toMatchObject({
      type: 'split',
      head: 'single',
    });
    expect(split?.kind === 'content' && Object.keys(split.slots)).toEqual(['head', 'body']);
    expect(split?.kind === 'content' && split.slots.head?.map((b) => b.type)).toEqual(['heading']);
    expect(split?.kind === 'content' && split.slots.body?.map((b) => b.type)).toEqual([
      'paragraph',
    ]);
    // the two prompts on the slide never read the same
    if (split?.kind === 'content') {
      const [head] = split.slots.head ?? [];
      const [body] = split.slots.body ?? [];
      expect(promptFor({ slide: split, block: head, path: '/text' })).toBe(PROMPTS.title);
      expect(promptFor({ slide: split, block: body, path: '/text' })).toBe(PROMPTS.text);
    }
    if (SUBTITLE_BODY) {
      const withSubtitle = layoutEntry(SUBTITLE_ID).make('x', blankDeck, 'deck');
      expect(withSubtitle?.kind === 'content' && withSubtitle.layout).toMatchObject({
        type: 'split',
        head: { cols: '4/8' },
      });
      expect(withSubtitle?.kind === 'content' && Object.keys(withSubtitle.slots)).toEqual([
        'headLeft',
        'headRight',
        'body',
      ]);
      expect(subtitleParagraphId(SUBTITLE_ID)).toBe('p1');
      expect(LAYOUTS[11]?.id).toBe(SUBTITLE_ID);
    }
    expect(subtitleParagraphId('split')).toBeUndefined();
    expect(subtitleParagraphId('tiles')).toBe('p1');
    expect(subtitleParagraphId('details')).toBe('p1');
    expect(subtitleParagraphId('board')).toBe('p1');
    expect(subtitleParagraphId('table')).toBeUndefined();
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

  it('prompts the head paragraph of a two column head with the subtitle word (docs/PRODUCT.md rank 2)', () => {
    const p1 = { id: 'p1', type: 'paragraph' as const, text: '' };
    // the renderer passes the kind and the template alone
    expect(
      promptFor({ slide: { kind: 'content', template: 'tiles' }, block: p1, path: '/text' }),
    ).toBe(PROMPTS.subtitle);
    expect(
      promptFor({ slide: { kind: 'content', template: 'board' }, block: p1, path: '/text' }),
    ).toBe(PROMPTS.subtitle);
    if (SUBTITLE_BODY) {
      expect(
        promptFor({ slide: { kind: 'content', template: SUBTITLE_ID }, block: p1, path: '/text' }),
      ).toBe(PROMPTS.subtitle);
      // the body paragraph of the same layout keeps the text word
      const p2 = { ...p1, id: 'p2' };
      expect(
        promptFor({ slide: { kind: 'content', template: SUBTITLE_ID }, block: p2, path: '/text' }),
      ).toBe(PROMPTS.text);
    }
    // a single head layout has no subtitle, whatever the paragraph's id
    expect(
      promptFor({ slide: { kind: 'content', template: 'one-column' }, block: p1, path: '/text' }),
    ).toBe(PROMPTS.text);
    expect(
      promptFor({ slide: { kind: 'content', template: 'split' }, block: p1, path: '/text' }),
    ).toBe(PROMPTS.text);
    // a caller with the whole slide: the slot decides, template or not
    const made = layoutEntry('tiles').make('x', blankDeck, 'deck');
    if (made?.kind === 'content') {
      const right = made.slots.headRight?.[0];
      const { template: _t, ...bare } = made;
      expect(promptFor({ slide: bare, block: right, path: '/text' })).toBe(PROMPTS.subtitle);
    }
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

  it('reads a slide on the old 4/8 Title and body as Title, subtitle and body once that id exists, else as Title and body', () => {
    const legacy: Slide = {
      schemaVersion: 1,
      id: 'legacy',
      kind: 'content',
      layout: { type: 'split', gap: 56, head: { cols: '4/8' }, body: { align: 'center' } },
      slots: {
        headLeft: [{ id: 'h', type: 'heading', level: 'h2', text: 'Agenda' }],
        headRight: [{ id: 'p1', type: 'paragraph', text: '' }],
        body: [{ id: 'p2', type: 'paragraph', text: '', measure: 56 }],
      },
    };
    expect(derivedLayout(legacy)).toBe(SUBTITLE_BODY ? SUBTITLE_ID : 'split');
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
