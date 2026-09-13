// The layout list (gslides-parity SPEC 5.1, 5.2): the one ordered table the New slide arrow, the
// Layout button, Slide > Apply layout, the filmstrip's Apply layout submenu, template.json,
// `turboslide slide new --layout`, the MCP tool and the store all read. Google's eleven layouts
// come first under Google's names and in Google's order (R03 b.2, the PredefinedLayout
// reference); a labelled rule reading "GT layouts" follows; the GT layouts Google lacks come after
// it. Every `make` produces a slide with empty Texts: a placeholder is prompt text the editor
// draws and nothing else renders (SPEC 5.4), so no placeholder copy is ever written into a deck
// (SPEC 0.17). Framework free: no React, no DOM; chrome, store, CLI and MCP import this module and
// nothing here imports chrome (SPEC 3.3 rule 3). This file replaces
// packages/chrome/src/slide-templates.ts, whose fifteen templates are the entries below with
// their placeholder copy removed.
import type { Asset, AssetRole } from './assets.ts';
import type { Block, TableBlock } from './blocks.ts';
import { EMPTY_ASSET_REF } from './blocks.ts';
import type {
  ContentSlide,
  Deck,
  Layout,
  LayoutId,
  LayoutType,
  Slide,
  SlideKind,
  SlotName,
} from './deck.ts';
import { LAYOUT_IDS, slotsForLayout } from './deck.ts';
import type { IconName } from './icons.ts';
import type { SlideId } from './ids.ts';

export type { LayoutId } from './deck.ts';
export { LAYOUT_IDS } from './deck.ts';

export type LayoutEntry = {
  id: LayoutId;
  /** Google's name for the first eleven, the GT name after the rule */
  label: string;
  /** true for the first eleven */
  google: boolean;
  kind: SlideKind;
  layout?: LayoutType;
  /** one sentence: what the layout is for, in the grammar's terms */
  doc: string;
  /** a sprite id from the theme sprite (icons.ts), not a chrome IconName */
  icon: IconName;
  /** the layout takes a background picture from the deck's starter set (opener, mood, closing) */
  needsPicture: boolean;
  /** The slide with empty Texts, or null when the deck has no asset the layout needs. */
  make: (id: SlideId, deck: Deck, sectionId: string) => Slide | null;
};

/** How many entries carry Google's names; the rule sits after them (SPEC 5.2). */
export const GOOGLE_LAYOUT_COUNT = 11;
/** The label of the rule between Google's eleven and the GT layouts. */
export const LAYOUT_RULE_LABEL = 'GT layouts';

// ---------------------------------------------------------------------------------------------
// Prompt text (SPEC 5.4): what the editor draws in an empty placeholder; never content.

export const PROMPTS = {
  title: 'Click to add title',
  subtitle: 'Click to add subtitle',
  number: 'Click to add a number',
  caption: 'Add a caption',
  text: 'Click to add text',
  picture: 'Click to add a picture',
  pictureFirst: 'Add a picture first',
} as const;

export type PromptContext = {
  slide: Pick<Slide, 'kind'> & { template?: LayoutId | undefined };
  /** the block the Text sits in; absent for a slide field (the title slide's heading and lead, the statement's big) */
  block?: Block;
  /** the JSON pointer of the Text inside the block or the slide */
  path: string;
};

/**
 * The prompt for an empty Text (SPEC 5.4): "Click to add title" for a heading at level h1, h2 or
 * title and for the opener, mood and closing headings; "Click to add subtitle" for the title
 * slide's lead; "Click to add a number" for the Big number heading; "Add a caption" for an empty
 * caption; "Click to add text" for everything else.
 */
export function promptFor(context: PromptContext): string {
  const { slide, block, path } = context;
  if (block === undefined) {
    if (slide.kind === 'title') return path === '/lead' ? PROMPTS.subtitle : PROMPTS.title;
    if (slide.kind === 'statement') return PROMPTS.text;
    return PROMPTS.text;
  }
  if (block.type === 'heading') {
    if (block.level === 'big' && slide.template === 'big-number') return PROMPTS.number;
    if (block.level === 'big' && (slide.kind === 'opener' || slide.kind === 'closing'))
      return PROMPTS.title;
    if (block.level === 'big') return slide.kind === 'content' ? PROMPTS.number : PROMPTS.title;
    return PROMPTS.title;
  }
  if (/caption$/.test(path) || (block.type === 'matrix' && path === '/caption'))
    return PROMPTS.caption;
  return PROMPTS.text;
}

// ---------------------------------------------------------------------------------------------
// Assets

/** The picture roles a layout takes its background from, in order of preference. */
export const PICTURE_ROLES: Readonly<
  Record<'opener' | 'mood' | 'closing', ReadonlyArray<AssetRole>>
> = {
  opener: ['opener', 'mood'],
  mood: ['mood', 'opener'],
  closing: ['opener', 'mood'],
};

/** True for the closing picture of the starter set (its id names it; the roles have no `closing`). */
function isClosingPicture(asset: Asset): boolean {
  return /(^|-)closing($|-)/.test(asset.id);
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

/**
 * The background picture a picture layout takes (SPEC 5.2): the section header and the caption
 * take an opener or a mood picture that is not the closing one; the closing takes the closing
 * picture first. A deck with none of the starter roles gets none, and the grid says
 * "Add a picture first".
 */
export function pickPicture(deck: Deck, kind: 'opener' | 'mood' | 'closing'): Asset | undefined {
  const assets = Object.values(deck.assets);
  const pictures = assets.filter((asset) => asset.role === 'opener' || asset.role === 'mood');
  if (pictures.length === 0) return undefined;
  if (kind === 'closing') {
    return pictures.find(isClosingPicture) ?? pickAsset(deck, PICTURE_ROLES.closing);
  }
  const others = pictures.filter((asset) => !isClosingPicture(asset));
  const pool = others.length > 0 ? others : pictures;
  for (const role of PICTURE_ROLES[kind]) {
    const found = pool.find((asset) => asset.role === role);
    if (found) return found;
  }
  return pool[0];
}

/** True when the deck has a picture for the three picture layouts. */
export function hasStarterPicture(deck: Deck): boolean {
  return Object.values(deck.assets).some(
    (asset) => asset.role === 'opener' || asset.role === 'mood',
  );
}

// ---------------------------------------------------------------------------------------------
// Block builders (empty Texts)

function heading(text = '', level: 'h1' | 'h2' | 'big' | 'title' = 'h2', id = 'h'): Block {
  return { id, type: 'heading', level, text };
}

function paragraph(
  id: string,
  extra: { role?: 'lead' | 'cap'; marginTop?: number; measure?: number } = {},
): Block {
  return {
    id,
    type: 'paragraph',
    text: '',
    ...(extra.role !== undefined ? { role: extra.role } : {}),
    ...(extra.marginTop !== undefined ? { marginTop: extra.marginTop } : {}),
    ...(extra.measure !== undefined ? { measure: extra.measure } : {}),
  };
}

function credit(asset: Asset): Block {
  return { id: 'credit', type: 'credit', text: asset.credit ?? '' };
}

function base(id: SlideId) {
  return { schemaVersion: 1 as const, id };
}

/**
 * A content layout's placeholders carry `autofit: 'shrink'` (gslides-parity SPEC-2 0.41; Google's
 * theme placeholders default to Shrink text on overflow, R09 A5): the heading, paragraph, text and
 * box blocks a `make` creates. The picture kinds' plate blocks and the fixed kinds' fields keep
 * the grammar's sizes until the slide converts to the canvas (SPEC-2 1.2).
 */
function withShrink(blocks: Block[]): Block[] {
  return blocks.map((block) =>
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'text' ||
    block.type === 'box'
      ? ({ ...block, autofit: 'shrink' } as Block)
      : block,
  );
}

function content(id: SlideId, layout: Layout, slots: ContentSlide['slots']): ContentSlide {
  const fitted: ContentSlide['slots'] = {};
  for (const [slot, blocks] of Object.entries(slots) as [SlotName, Block[]][])
    fitted[slot] = withShrink(blocks);
  return { ...base(id), kind: 'content', layout, slots: fitted };
}

const COLS_5_7: Layout = { type: 'cols', ratio: '5/7', gap: 72, align: 'center' };
const COLS_4_8: Layout = { type: 'cols', ratio: '4/8', gap: 72, align: 'center' };
const COLS_1_1: Layout = { type: 'cols', ratio: '1/1', gap: 72, align: 'center' };
const SPLIT_4_8: Layout = {
  type: 'split',
  gap: 56,
  head: { cols: '4/8' },
  body: { align: 'center' },
};
const SPLIT_SINGLE: Layout = { type: 'split', gap: 56, head: 'single', body: { align: 'center' } };
const STACK: Layout = { type: 'stack', gap: 22 };

/** The head of a split archetype: the heading left, the paragraph right (slides 38, 49, 80). */
function splitHead(): ContentSlide['slots'] {
  return { headLeft: [heading()], headRight: [paragraph('p1')] };
}

/** The 3 by 4 empty table with a header row of the Title and table layout. */
export function emptyLayoutTable(id = 'table'): TableBlock {
  return {
    id,
    type: 'table',
    columns: [{}, {}, {}],
    rows: [
      { cells: ['', '', ''], header: true },
      { cells: ['', '', ''] },
      { cells: ['', '', ''] },
      { cells: ['', '', ''] },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The table

export const LAYOUTS: ReadonlyArray<LayoutEntry> = [
  {
    id: 'title',
    label: 'Title slide',
    google: true,
    kind: 'title',
    doc: 'The mark at 132 by 84, the h1 and a muted lead, left and vertically centered.',
    icon: 'sparkles',
    needsPicture: false,
    make: (id) => ({ ...base(id), kind: 'title', mark: { w: 132, h: 84 }, heading: '', lead: '' }),
  },
  {
    id: 'opener',
    label: 'Section header',
    google: true,
    kind: 'opener',
    doc: 'A full-bleed two-tone picture with the plate lower left at 740 px: the section title, one sentence, the credit.',
    icon: 'rectangle-stack',
    needsPicture: true,
    make: (id, deck, sectionId) => {
      const asset = pickPicture(deck, 'opener');
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
            heading('', 'big'),
            paragraph('p1', { marginTop: 14, measure: 56 }),
            credit(asset),
          ],
        },
      };
    },
  },
  {
    id: 'split',
    label: 'Title and body',
    google: true,
    kind: 'content',
    layout: 'split',
    doc: 'A two-column head (the heading at 4, the paragraph at 8) over a body.',
    icon: 'document-text',
    needsPicture: false,
    make: (id) =>
      content(id, SPLIT_4_8, { ...splitHead(), body: [paragraph('p2', { measure: 56 })] }),
  },
  {
    id: 'cols',
    label: 'Title and two columns',
    google: true,
    kind: 'content',
    layout: 'cols',
    doc: 'Two equal columns: the heading and a paragraph on the left, a paragraph on the right.',
    icon: 'view-columns',
    needsPicture: false,
    make: (id) =>
      content(id, COLS_1_1, {
        left: [heading(), paragraph('p1', { measure: 56 })],
        right: [paragraph('p2', { measure: 56 })],
      }),
  },
  {
    id: 'title-only',
    label: 'Title only',
    google: true,
    kind: 'content',
    layout: 'stack',
    doc: 'One heading in a stack and nothing else, so the sheet stays open below it.',
    icon: 'bars-3-bottom-left',
    needsPicture: false,
    make: (id) => content(id, STACK, { main: [heading()] }),
  },
  {
    id: 'one-column',
    label: 'One column text',
    google: true,
    kind: 'content',
    layout: 'stack',
    doc: 'A heading over one paragraph at measure 56 in a stack.',
    icon: 'bars-3',
    needsPicture: false,
    make: (id) => content(id, STACK, { main: [heading(), paragraph('p1', { measure: 56 })] }),
  },
  {
    id: 'statement',
    label: 'Main point',
    google: true,
    kind: 'statement',
    doc: 'One centered big line at 72 px with a 22ch measure.',
    icon: 'bolt',
    needsPicture: false,
    make: (id) => ({ ...base(id), kind: 'statement', big: '', measure: 22 }),
  },
  {
    id: 'section-description',
    label: 'Section title and description',
    google: true,
    kind: 'content',
    layout: 'cols',
    doc: 'Two columns at 5/7: the heading and a short note on the left, a lead paragraph on the right.',
    icon: 'bars-3-center-left',
    needsPicture: false,
    make: (id) =>
      content(id, COLS_5_7, {
        left: [heading(), paragraph('p1', { role: 'cap' })],
        right: [paragraph('p2', { role: 'lead' })],
      }),
  },
  {
    id: 'mood',
    label: 'Caption',
    google: true,
    kind: 'mood',
    doc: 'A full-bleed dithered photograph with the plate lower right at 560 px: the title at 44 px, one or two sentences, the credit.',
    icon: 'photo',
    needsPicture: true,
    make: (id, deck) => {
      const asset = pickPicture(deck, 'mood');
      if (!asset) return null;
      return {
        ...base(id),
        kind: 'mood',
        picture: { asset: asset.id, fit: 'cover' },
        plate: {
          side: 'lower-right',
          maxWidth: 560,
          blocks: [heading('', 'title'), paragraph('p1', { marginTop: 12 }), credit(asset)],
        },
      };
    },
  },
  {
    id: 'big-number',
    label: 'Big number',
    google: true,
    kind: 'content',
    layout: 'center',
    doc: 'One number as a big heading over a short note, centered.',
    icon: 'presentation-chart-bar',
    needsPicture: false,
    make: (id) =>
      content(
        id,
        { type: 'center' },
        { main: [heading('', 'big'), paragraph('p1', { role: 'cap', marginTop: 14 })] },
      ),
  },
  {
    id: 'blank',
    label: 'Blank',
    google: true,
    kind: 'content',
    layout: 'freeform',
    doc: 'The freeform layout with no blocks; everything placed on it carries a position box.',
    icon: 'squares-2x2',
    needsPicture: false,
    make: (id) => content(id, { type: 'freeform' }, {}),
  },
  {
    id: 'rows',
    label: 'Ruled rows',
    google: false,
    kind: 'content',
    layout: 'cols',
    doc: 'The heading and the body on the left, a ruled key and value table at 20 px on the right (key column 220).',
    icon: 'list-bullet',
    needsPicture: false,
    make: (id) =>
      content(id, COLS_5_7, {
        left: [heading(), paragraph('p1', { measure: 56 })],
        right: [
          {
            id: 'rows',
            type: 'rows',
            key: 220,
            tight: true,
            items: [
              { key: '', value: '' },
              { key: '', value: '' },
              { key: '', value: '' },
            ],
          },
        ],
      }),
  },
  {
    id: 'plain',
    label: 'Ruled statement list',
    google: false,
    kind: 'content',
    layout: 'cols',
    doc: 'The heading and the body on the left, statements as ruled rows at 24 px display weight on the right, never bullets.',
    icon: 'list-bullet',
    needsPicture: false,
    make: (id) =>
      content(id, COLS_5_7, {
        left: [heading(), paragraph('p1', { measure: 56 })],
        right: [
          {
            id: 'list',
            type: 'plain',
            items: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
          },
        ],
      }),
  },
  {
    id: 'table',
    label: 'Title and table',
    google: false,
    kind: 'content',
    layout: 'split',
    doc: 'A heading over a 3 by 4 table with a header row.',
    icon: 'table-cells',
    needsPicture: false,
    make: (id) => content(id, SPLIT_4_8, { headLeft: [heading()], body: [emptyLayoutTable()] }),
  },
  {
    id: 'figure',
    label: 'Figure',
    google: false,
    kind: 'content',
    layout: 'cols',
    doc: 'The heading and the body at 4, one bordered capture with a caption at 8.',
    icon: 'photo',
    needsPicture: false,
    make: (id) =>
      content(id, COLS_4_8, {
        left: [heading(), paragraph('p1', { measure: 56 })],
        right: [
          {
            id: 'fig',
            type: 'shot',
            asset: EMPTY_ASSET_REF,
            fit: 'width',
            caption: '',
            captionSize: 16,
          },
        ],
      }),
  },
  {
    id: 'pair',
    label: 'Pair of figures',
    google: false,
    kind: 'content',
    layout: 'split',
    doc: 'A single head over two figures side by side with captions.',
    icon: 'photo',
    needsPicture: false,
    make: (id) =>
      content(id, SPLIT_SINGLE, {
        head: [heading()],
        body: [
          {
            id: 'pair',
            type: 'pair',
            figures: [
              { assets: [EMPTY_ASSET_REF], caption: '' },
              { assets: [EMPTY_ASSET_REF], caption: '' },
            ],
          },
        ],
      }),
  },
  {
    id: 'tiles',
    label: 'Tile grid',
    google: false,
    kind: 'content',
    layout: 'split',
    doc: 'A two-column head over a grid of four captured tiles at 16/9 with 20 px labels.',
    icon: 'squares-2x2',
    needsPicture: false,
    make: (id) =>
      content(
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
              items: [
                { label: '', sub: '' },
                { label: '', sub: '' },
                { label: '', sub: '' },
                { label: '', sub: '' },
              ],
            },
          ],
        },
      ),
  },
  {
    id: 'details',
    label: 'Detail grid',
    google: false,
    kind: 'content',
    layout: 'split',
    doc: 'A two-column head over three 425 px columns of 2x crops with 15 px captions.',
    icon: 'squares-2x2',
    needsPicture: false,
    make: (id) =>
      content(id, SPLIT_4_8, {
        ...splitHead(),
        body: [
          {
            id: 'grid',
            type: 'details',
            columns: 3,
            rowHeights: [236],
            items: [
              { asset: EMPTY_ASSET_REF, caption: '' },
              { asset: EMPTY_ASSET_REF, caption: '' },
              { asset: EMPTY_ASSET_REF, caption: '' },
            ],
          },
        ],
      }),
  },
  {
    id: 'board',
    label: 'Status board',
    google: false,
    kind: 'content',
    layout: 'split',
    doc: 'A two-column head over one ruled row per surface: a 128 by 72 capture, the name and address, the state with its icon, a note.',
    icon: 'clipboard-document-check',
    needsPicture: false,
    make: (id) =>
      content(
        id,
        { ...SPLIT_4_8, gap: 32, body: { align: 'start' } },
        {
          ...splitHead(),
          body: [
            {
              id: 'board',
              type: 'board',
              columns: [128, 250, 200, 'fr'],
              rows: [
                { name: '', state: { name: 'check-circle', color: 'ok' }, note: '' },
                { name: '', state: { name: 'check-circle', color: 'ok' }, note: '' },
                { name: '', state: { name: 'check-circle', color: 'ok' }, note: '' },
              ],
            },
          ],
        },
      ),
  },
  {
    id: 'matrix',
    label: 'Matrix',
    google: false,
    kind: 'content',
    layout: 'cols',
    doc: 'The heading and the body on the left, a ruled table of numerals at 22 px tabular with a caption on the right.',
    icon: 'table-cells',
    needsPicture: false,
    make: (id) =>
      content(id, COLS_5_7, {
        left: [heading(), paragraph('p1', { measure: 56 })],
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
            caption: '',
          },
        ],
      }),
  },
  {
    id: 'closing',
    label: 'Closing',
    google: false,
    kind: 'closing',
    doc: 'A two-tone render behind a plate upper left at 720 px carrying the mark, the thesis and the addresses.',
    icon: 'check-badge',
    needsPicture: true,
    make: (id, deck) => {
      const asset = pickPicture(deck, 'closing');
      if (!asset) return null;
      return {
        ...base(id),
        kind: 'closing',
        picture: { asset: asset.id, fit: 'cover' },
        plate: {
          side: 'upper-left',
          maxWidth: 720,
          blocks: [
            heading('', 'big'),
            paragraph('p1', { marginTop: 14, measure: 56 }),
            credit(asset),
          ],
        },
        mark: { w: 138, h: 88 },
      };
    },
  },
];

/** The entry for an id; a RangeError for an id outside the list. */
export function layoutEntry(id: string): LayoutEntry {
  const entry = LAYOUTS.find((candidate) => candidate.id === id);
  if (entry === undefined)
    throw new RangeError(`No layout "${id}"; the layouts are ${LAYOUT_IDS.join(', ')}`);
  return entry;
}

export function isLayoutId(value: string): value is LayoutId {
  return (LAYOUT_IDS as ReadonlyArray<string>).includes(value);
}

/** Google's eleven, then the GT layouts, as the grid shows them with the rule between. */
export function layoutGroups(): { google: LayoutEntry[]; gt: LayoutEntry[] } {
  return {
    google: LAYOUTS.filter((entry) => entry.google),
    gt: LAYOUTS.filter((entry) => !entry.google),
  };
}

/**
 * The first free slide id of the form `<layout>-<n>` (SPEC 5.3): `big-number-1`, `big-number-2`.
 * `taken` is every slide id of the deck.
 */
export function freeLayoutSlideId(layout: LayoutId, taken: ReadonlySet<string>): SlideId {
  for (let n = 1; n < 100_000; n += 1) {
    const candidate = `${layout}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new RangeError(`No free slide id for ${layout}`);
}

// ---------------------------------------------------------------------------------------------
// The derived layout of an existing slide (SPEC 5.6)

/** A block's structural name: its type, plus the level of a heading and the role of a paragraph. */
function blockSignature(block: Block): string {
  if (block.type === 'heading') return `heading:${block.level}`;
  if (block.type === 'paragraph') return `paragraph:${block.role ?? 'body'}`;
  return block.type;
}

/**
 * The kind, the layout type and the block signatures per slot in order: what a layout's `make`
 * produces, compared structurally (SPEC 5.6). The ratio and the gaps are left out on purpose: a
 * cols slide with a heading, a paragraph and a ruled list is a Ruled statement list slide at
 * any ratio.
 */
function signature(slide: Slide): string {
  if (slide.kind !== 'content') return slide.kind;
  const slots = slotsForLayout(slide.layout)
    .map((slot: SlotName) => {
      const blocks = slide.slots[slot] ?? [];
      return blocks.length === 0 ? '' : `${slot}:${blocks.map(blockSignature).join(',')}`;
    })
    .filter((part) => part !== '');
  return `${slide.layout.type}|${slots.join('|')}`;
}

/** A stand-in deck with a picture for every role, so every `make` answers during the comparison. */
const PROBE_DECK: Deck = {
  schemaVersion: 1,
  id: 'probe',
  title: 'Probe',
  theme: 'gt-ink-paper',
  sections: [{ id: 'probe', name: 'Probe', slideIds: [] }],
  assets: {
    probe: {
      id: 'probe',
      role: 'opener',
      alt: 'A probe',
      twins: { neutral: 'assets/probe.png' },
      size: [1600, 900],
      scale: 1,
      source: { kind: 'file' },
      inline: 'native',
    },
  },
  revision: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let signatures: Map<string, LayoutId> | undefined;

function layoutSignatures(): Map<string, LayoutId> {
  if (signatures === undefined) {
    signatures = new Map();
    for (const entry of LAYOUTS) {
      const made = entry.make('probe', PROBE_DECK, 'probe');
      if (made === null) continue;
      const key = signature(made);
      if (!signatures.has(key)) signatures.set(key, entry.id);
    }
  }
  return signatures;
}

/** The kind's own entry for the non-content kinds. */
const KIND_LAYOUT: Readonly<Record<Exclude<SlideKind, 'content'>, LayoutId>> = {
  title: 'title',
  opener: 'opener',
  mood: 'mood',
  closing: 'closing',
  statement: 'statement',
};

/**
 * The layout an existing slide is on (SPEC 5.6): its `template` when written; else the entry
 * whose `make` has the same kind, layout type and slot signature; else Title and body for a
 * content slide and the kind's own entry for the others. Nothing is written until New slide or
 * Apply layout runs.
 */
export function derivedLayout(slide: Slide): LayoutId {
  if (slide.template !== undefined) return slide.template;
  if (slide.kind !== 'content') return KIND_LAYOUT[slide.kind];
  if (slide.layout.type === 'freeform') return 'blank';
  return layoutSignatures().get(signature(slide)) ?? 'split';
}
