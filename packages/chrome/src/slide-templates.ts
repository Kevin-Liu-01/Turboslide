// The slide templates (Kevin's directive for the GT template: one insertable per archetype kind
// and layout), the documents behind the palette's Insert group and the sidebar row menu. Each
// template is a valid slide of the grammar cut from a GT deck archetype (the `source` names the
// slide; decks/templates/gt-brand/template.json lists the same ids) with placeholder copy in the
// "X, not Y" shape the copy linter reads as a contrast pair (SPEC 7.7 copy/contrast-pair,
// DECK-GRAMMAR.md:23), so every new slide carries findings until its copy is replaced and the
// lint count on the toolbar says what is still placeholder. Pure: no React, no DOM.
import type { Asset, AssetRole } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import type { Deck, LayoutType, Slide, SlideKind } from '@turboslide/schema/deck';
import type { SlideId } from '@turboslide/schema/ids';

import type { IconName } from './icons';

export type SlideTemplateId =
  | 'opener'
  | 'mood'
  | 'closing'
  | 'title'
  | 'statement'
  | 'cols'
  | 'split'
  | 'rows'
  | 'plain'
  | 'tiles'
  | 'details'
  | 'board'
  | 'matrix'
  | 'pair'
  | 'figure';

export type SlideTemplate = {
  id: SlideTemplateId;
  label: string;
  kind: SlideKind;
  /** the layout of a content template */
  layout?: LayoutType;
  /** one sentence: what the archetype is for, in the grammar's terms */
  doc: string;
  /** the GT deck slide the template is cut from */
  source: string;
  icon: IconName;
  /**
   * The slide, or null when the deck has no asset the template needs (the picture kinds and the
   * figure templates take one from the deck by role; a deck with no assets gets none of them).
   */
  make: (id: SlideId, deck: Deck, sectionId: string) => Slide | null;
};

/**
 * The placeholder copy. Every line is a contrast pair ("X, not Y"), which copy/contrast-pair
 * flags at severity 1 with no fix, so the finding stays until the words are replaced. Captions
 * end with a period, so copy/full-sentence-caption stays quiet and the one finding per text is
 * the placeholder itself.
 */
export const PLACEHOLDER = {
  heading: 'Placeholder heading, not final copy',
  big: 'Placeholder statement, not final copy',
  title: 'Placeholder title, not final copy',
  section: 'Placeholder section, not final copy',
  lead: 'Placeholder lead, not the final sentence.',
  body: 'Placeholder body copy, not the final text. State the fact or the number this slide carries.',
  cap: 'Placeholder note, not the final caption.',
  caption: 'Placeholder caption, not final copy.',
  key: 'Placeholder key, not final',
  value: 'Placeholder value, not final copy.',
  statement: 'Placeholder statement, not final copy',
  label: 'Placeholder label, not final',
  sub: 'Placeholder note, not final copy.',
  name: 'Placeholder surface, not final',
  note: 'Placeholder note, not final copy.',
  credit: 'Image: placeholder credit, not the final source line',
} as const;

/** True for a text that is still one of the placeholder lines. */
export function isPlaceholderText(text: string): boolean {
  return (Object.values(PLACEHOLDER) as readonly string[]).includes(text);
}

/** The first asset with one of the roles, in order of preference, else any asset. */
export function pickAsset(deck: Deck, roles: ReadonlyArray<AssetRole>): Asset | undefined {
  const assets = Object.values(deck.assets);
  for (const role of roles) {
    const found = assets.find((asset) => asset.role === role);
    if (found) return found;
  }
  return assets[0];
}

function heading(text: string, level: 'h2' | 'big' | 'title' = 'h2'): Block {
  return { id: 'h', type: 'heading', level, text };
}

function paragraph(
  id: string,
  text: string,
  extra: { role?: 'cap'; marginTop?: number } = {},
): Block {
  return {
    id,
    type: 'paragraph',
    text,
    ...(extra.role !== undefined ? { role: extra.role } : {}),
    ...(extra.marginTop !== undefined ? { marginTop: extra.marginTop } : {}),
    measure: 56,
  };
}

function base(id: SlideId) {
  return { schemaVersion: 1 as const, id };
}

function content(
  id: SlideId,
  layout: Extract<Slide, { kind: 'content' }>['layout'],
  slots: Extract<Slide, { kind: 'content' }>['slots'],
): Slide {
  return { ...base(id), kind: 'content', layout, slots };
}

/** The head of a split archetype: the heading left, the paragraph right (slides 38, 49, 80). */
function splitHead(): Extract<Slide, { kind: 'content' }>['slots'] {
  return {
    headLeft: [heading(PLACEHOLDER.heading)],
    headRight: [paragraph('p1', PLACEHOLDER.body)],
  };
}

const SPLIT_4_8 = {
  type: 'split' as const,
  gap: 56 as const,
  head: { cols: '4/8' as const },
  body: { align: 'center' as const },
};

export const SLIDE_TEMPLATES: ReadonlyArray<SlideTemplate> = [
  {
    id: 'opener',
    label: 'Section opener',
    kind: 'opener',
    doc: 'A full-bleed two-tone picture with the plate lower left at 740 px: the section title, one sentence, the credit.',
    source: 'opener-brand',
    icon: 'deck',
    make: (id, deck, sectionId) => {
      const asset = pickAsset(deck, ['opener', 'mood']);
      if (!asset) return null;
      return {
        ...base(id),
        kind: 'opener',
        sectionId,
        picture: { asset: asset.id, fit: 'cover' },
        plate: {
          side: 'lower-left',
          maxWidth: 740,
          blocks: [
            heading(PLACEHOLDER.section, 'big'),
            paragraph('p1', PLACEHOLDER.body, { marginTop: 14 }),
            { id: 'credit', type: 'credit', text: PLACEHOLDER.credit },
          ],
        },
      };
    },
  },
  {
    id: 'mood',
    label: 'Mood',
    kind: 'mood',
    doc: 'A full-bleed dithered photograph with the plate lower right at 560 px: the title at 44 px, one or two sentences, the credit.',
    source: 'mood-earth',
    icon: 'photo',
    make: (id, deck) => {
      const asset = pickAsset(deck, ['mood', 'opener']);
      if (!asset) return null;
      return {
        ...base(id),
        kind: 'mood',
        picture: { asset: asset.id, fit: 'cover' },
        plate: {
          side: 'lower-right',
          maxWidth: 560,
          blocks: [
            heading(PLACEHOLDER.title, 'title'),
            { id: 'p1', type: 'paragraph', text: PLACEHOLDER.body, marginTop: 12 },
            { id: 'credit', type: 'credit', text: PLACEHOLDER.credit },
          ],
        },
      };
    },
  },
  {
    id: 'closing',
    label: 'Closing',
    kind: 'closing',
    doc: 'A two-tone render behind a plate upper left at 720 px carrying the mark, the thesis and the addresses.',
    source: 'closing',
    icon: 'check-badge',
    make: (id, deck) => {
      const asset = pickAsset(deck, ['opener', 'mood']);
      if (!asset) return null;
      return {
        ...base(id),
        kind: 'closing',
        picture: { asset: asset.id, fit: 'cover' },
        plate: {
          side: 'upper-left',
          maxWidth: 720,
          blocks: [
            heading(PLACEHOLDER.big, 'big'),
            paragraph('p1', PLACEHOLDER.lead, { marginTop: 14 }),
            { id: 'credit', type: 'credit', text: PLACEHOLDER.credit },
          ],
        },
        mark: { w: 138, h: 88 },
      };
    },
  },
  {
    id: 'title',
    label: 'Title',
    kind: 'title',
    doc: 'The mark at 132 by 84, the h1 and a muted lead, left and vertically centered.',
    source: 'title',
    icon: 'sparkles',
    make: (id) => ({
      ...base(id),
      kind: 'title',
      mark: { w: 132, h: 84 },
      heading: PLACEHOLDER.title,
      lead: PLACEHOLDER.lead,
    }),
  },
  {
    id: 'statement',
    label: 'Statement',
    kind: 'statement',
    doc: 'One centered big line at 72 px with a 22ch measure.',
    source: 'thesis',
    icon: 'document',
    make: (id) => ({ ...base(id), kind: 'statement', big: PLACEHOLDER.statement, measure: 22 }),
  },
  {
    id: 'cols',
    label: 'Two columns',
    kind: 'content',
    layout: 'cols',
    doc: 'Two columns at 5/7: the heading and the body on the left, a lead paragraph and a note on the right.',
    source: 'character',
    icon: 'slide',
    make: (id) =>
      content(
        id,
        { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
        {
          left: [heading(PLACEHOLDER.heading), paragraph('p1', PLACEHOLDER.body)],
          right: [
            { id: 'p2', type: 'paragraph', text: PLACEHOLDER.body, role: 'lead' },
            paragraph('p3', PLACEHOLDER.cap, { role: 'cap' }),
          ],
        },
      ),
  },
  {
    id: 'split',
    label: 'Head over body',
    kind: 'content',
    layout: 'split',
    doc: 'A two-column head (the heading at 4, the paragraph at 8) over a body of ruled statements.',
    source: 'engines',
    icon: 'book',
    make: (id) =>
      content(id, SPLIT_4_8, {
        ...splitHead(),
        body: [
          {
            id: 'list',
            type: 'plain',
            items: [
              { text: PLACEHOLDER.statement },
              { text: PLACEHOLDER.statement },
              { text: PLACEHOLDER.statement },
            ],
          },
        ],
      }),
  },
  {
    id: 'rows',
    label: 'Ruled rows',
    kind: 'content',
    layout: 'cols',
    doc: 'The heading and the body on the left, a ruled key and value table at 20 px on the right (key column 220).',
    source: 'surfaces',
    icon: 'queue-list',
    make: (id) =>
      content(
        id,
        { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
        {
          left: [heading(PLACEHOLDER.heading), paragraph('p1', PLACEHOLDER.body)],
          right: [
            {
              id: 'rows',
              type: 'rows',
              key: 220,
              tight: true,
              items: [
                { key: PLACEHOLDER.key, value: PLACEHOLDER.value },
                { key: PLACEHOLDER.key, value: PLACEHOLDER.value },
                { key: PLACEHOLDER.key, value: PLACEHOLDER.value },
              ],
            },
          ],
        },
      ),
  },
  {
    id: 'plain',
    label: 'Ruled statement list',
    kind: 'content',
    layout: 'cols',
    doc: 'The heading and the body on the left, statements as ruled rows at 24 px display weight on the right, never bullets.',
    source: 'avoid',
    icon: 'queue-list',
    make: (id) =>
      content(
        id,
        { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
        {
          left: [heading(PLACEHOLDER.heading), paragraph('p1', PLACEHOLDER.body)],
          right: [
            {
              id: 'list',
              type: 'plain',
              items: [
                { text: PLACEHOLDER.statement },
                { text: PLACEHOLDER.statement },
                { text: PLACEHOLDER.statement },
                { text: PLACEHOLDER.statement },
              ],
            },
          ],
        },
      ),
  },
  {
    id: 'tiles',
    label: 'Tile grid',
    kind: 'content',
    layout: 'split',
    doc: 'A two-column head over a grid of four captured tiles at 16/9 with 20 px labels.',
    source: 'engines',
    icon: 'grid',
    make: (id, deck) => {
      const asset = pickAsset(deck, ['thumb', 'capture', 'detail']);
      if (!asset) return null;
      const tile = { asset: asset.id, label: PLACEHOLDER.label, sub: PLACEHOLDER.sub };
      return content(
        id,
        { ...SPLIT_4_8, gap: 40 },
        {
          ...splitHead(),
          body: [
            {
              id: 'tiles',
              type: 'tiles',
              columns: 4,
              aspect: '16/9',
              labelSize: 20,
              items: [tile, tile, tile, tile],
            },
          ],
        },
      );
    },
  },
  {
    id: 'details',
    label: 'Detail grid',
    kind: 'content',
    layout: 'split',
    doc: 'A two-column head over three 425 px columns of 2x crops with 15 px captions.',
    source: 'details',
    icon: 'grid',
    make: (id, deck) => {
      const asset = pickAsset(deck, ['detail', 'capture', 'thumb']);
      if (!asset) return null;
      const item = { asset: asset.id, caption: PLACEHOLDER.caption };
      return content(id, SPLIT_4_8, {
        ...splitHead(),
        body: [
          { id: 'grid', type: 'details', columns: 3, rowHeights: [236], items: [item, item, item] },
        ],
      });
    },
  },
  {
    id: 'board',
    label: 'Status board',
    kind: 'content',
    layout: 'split',
    doc: 'A two-column head over one ruled row per surface: a 128 by 72 capture, the name and address, the state with its icon, a note.',
    source: 'state',
    icon: 'index',
    make: (id, deck) => {
      const asset = pickAsset(deck, ['capture', 'thumb']);
      const row = {
        ...(asset ? { asset: asset.id } : {}),
        name: PLACEHOLDER.name,
        address: 'example.com',
        state: { name: 'check-circle' as const, color: 'ok' as const },
        note: PLACEHOLDER.note,
      };
      return content(
        id,
        { ...SPLIT_4_8, gap: 32, body: { align: 'start' } },
        {
          ...splitHead(),
          body: [
            { id: 'board', type: 'board', columns: [128, 250, 200, 'fr'], rows: [row, row, row] },
          ],
        },
      );
    },
  },
  {
    id: 'matrix',
    label: 'Matrix',
    kind: 'content',
    layout: 'cols',
    doc: 'The heading and the body on the left, a ruled table of numerals at 22 px tabular with a caption on the right.',
    source: 'dither',
    icon: 'grid',
    make: (id) =>
      content(
        id,
        { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
        {
          left: [heading(PLACEHOLDER.heading), paragraph('p1', PLACEHOLDER.body)],
          right: [
            {
              id: 'matrix',
              type: 'matrix',
              cells: [
                [0, 8, 2, 10],
                [12, 4, 14, 6],
                [3, 11, 1, 9],
                [15, 7, 13, 5],
              ],
              caption: PLACEHOLDER.caption,
            },
          ],
        },
      ),
  },
  {
    id: 'pair',
    label: 'Pair of figures',
    kind: 'content',
    layout: 'split',
    doc: 'A single head over two figures side by side with captions.',
    source: 'pages-a',
    icon: 'photo',
    make: (id, deck) => {
      const asset = pickAsset(deck, ['capture', 'detail', 'thumb']);
      if (!asset) return null;
      const figure = { assets: [asset.id], caption: PLACEHOLDER.caption };
      return content(
        id,
        { type: 'split', gap: 56, head: 'single', body: { align: 'center' } },
        {
          head: [heading(PLACEHOLDER.heading)],
          body: [{ id: 'pair', type: 'pair', figures: [figure, figure] }],
        },
      );
    },
  },
  {
    id: 'figure',
    label: 'Figure',
    kind: 'content',
    layout: 'cols',
    doc: 'The heading and the body at 4, one bordered capture with a caption at 8.',
    source: 'blog-covers',
    icon: 'photo',
    make: (id, deck) => {
      const asset = pickAsset(deck, ['capture', 'detail', 'thumb']);
      if (!asset) return null;
      return content(
        id,
        { type: 'cols', ratio: '4/8', gap: 72, align: 'center' },
        {
          left: [heading(PLACEHOLDER.heading), paragraph('p1', PLACEHOLDER.body)],
          right: [
            {
              id: 'fig',
              type: 'shot',
              asset: asset.id,
              fit: 'width',
              caption: PLACEHOLDER.caption,
              captionSize: 16,
            },
          ],
        },
      );
    },
  },
];

export function slideTemplate(id: string): SlideTemplate | undefined {
  return SLIDE_TEMPLATES.find((template) => template.id === id);
}

/** `Ruled rows slide`, the words a palette row and a menu item show for a template. */
export function templateTitle(template: SlideTemplate): string {
  return `${template.label} slide`;
}
