// Fixture slides for the rendered rules of M3 item 5: a stretched asset, an empty half, two
// misaligned columns, a figure grid, a low-contrast caption, a scaled diagram, a raw svg with a
// label on a stroke, and a ruled list for the line law. Each slide names the rule it serves; the
// records and bitmaps are built by the tests, since a rendered rule reads measurements, not JSON.
import type { Asset, Deck, DeckDocument, RenderRecord, Slide } from '../contracts.ts';
import type { Theme } from '@turboslide/schema/render';

function fileAsset(id: string, size: [number, number]): Asset {
  return {
    id,
    role: 'capture',
    alt: `${id} alt`,
    twins: { light: `assets/${id}-light.png`, dark: `assets/${id}-dark.png` },
    size,
    scale: 1,
    source: { kind: 'file' },
    inline: 'native',
  };
}

export const assets: Record<string, Asset> = {
  'wide-shot': fileAsset('wide-shot', [1440, 900]),
  'fig-a': fileAsset('fig-a', [800, 450]),
  'fig-b': fileAsset('fig-b', [800, 450]),
};

/** A raw svg for dia/label-clearance: a line at x 100, a label on it, one far away, one inside a stroked rect. */
export const RAW_SVG = [
  '<svg class="dia" viewBox="0 0 600 300" aria-label="A raw diagram">',
  '<line class="ink" stroke-width="1" x1="100.5" y1="20" x2="100.5" y2="280"/>',
  '<text x="102" y="150">Near</text>',
  '<g transform="translate(300 0)"><text x="10" y="150">Far</text></g>',
  '<g class="hair" fill="none" stroke-width="1"><rect x="400.5" y="20.5" width="150" height="100"/></g>',
  '<text x="410" y="70" class="sm">Inside</text>',
  '</svg>',
].join('');

const slides: Slide[] = [
  // asset/stretched: a shot without a declared aspect, drawn stretched by the record
  {
    schemaVersion: 1,
    id: 'stretched',
    kind: 'content',
    layout: { type: 'cols', ratio: '5/7' },
    slots: {
      left: [
        { id: 'h', type: 'heading', level: 'h2', text: 'A stretched capture' },
        { id: 'p', type: 'paragraph', text: 'The capture on the right is drawn wide.' },
      ],
      right: [{ id: 'shot', type: 'shot', asset: 'wide-shot', fit: 'width' }],
    },
  },
  // asset/stretched: the same capture under a declared crop, which the rule leaves alone
  {
    schemaVersion: 1,
    id: 'cropped',
    kind: 'content',
    layout: { type: 'cols', ratio: '5/7' },
    slots: {
      left: [{ id: 'h', type: 'heading', level: 'h2', text: 'A cropped capture' }],
      right: [
        {
          id: 'shot',
          type: 'shot',
          asset: 'wide-shot',
          fit: 'width',
          aspect: '1440/864',
          crop: 'top',
        },
      ],
    },
  },
  // layout/empty-half: a figure on the left, a short line on the right
  {
    schemaVersion: 1,
    id: 'half',
    kind: 'content',
    layout: { type: 'cols', ratio: '1/1' },
    slots: {
      left: [{ id: 'fig', type: 'shot', asset: 'fig-a' }],
      right: [{ id: 'p', type: 'paragraph', text: 'One line.' }],
    },
  },
  // layout/columns-aligned: rows blocks in both columns
  {
    schemaVersion: 1,
    id: 'misaligned',
    kind: 'content',
    layout: { type: 'cols', ratio: '1/1' },
    slots: {
      left: [
        { id: 'h', type: 'heading', level: 'h2', text: 'Two lists' },
        { id: 'a', type: 'rows', key: 240, items: [{ key: 'Left', value: 'One' }] },
      ],
      right: [{ id: 'b', type: 'rows', key: 240, items: [{ key: 'Right', value: 'Two' }] }],
    },
  },
  // layout/pair-gaps: a pair and a details grid
  {
    schemaVersion: 1,
    id: 'pairs',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        {
          id: 'pair',
          type: 'pair',
          figures: [
            { assets: ['fig-a'], caption: 'The first figure.' },
            { assets: ['fig-b'], caption: 'The second figure.' },
          ],
        },
        {
          id: 'grid',
          type: 'details',
          columns: 3,
          items: [{ asset: 'fig-a' }, { asset: 'fig-b' }, { asset: 'fig-a' }],
        },
      ],
    },
  },
  // contrast/both-themes: a titanium caption, an ink heading, a code panel
  {
    schemaVersion: 1,
    id: 'contrast',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        { id: 'h', type: 'heading', level: 'h2', text: 'Contrast' },
        { id: 'cap', type: 'paragraph', role: 'cap', text: 'A caption in titanium.' },
        { id: 'code', type: 'panel', code: 'npx gt' },
      ],
    },
  },
  // sheet/thumb-legible: a declared diagram whose viewBox is twice its slot
  {
    schemaVersion: 1,
    id: 'thumb',
    kind: 'content',
    layout: { type: 'cols', ratio: '5/7' },
    slots: {
      left: [{ id: 'h', type: 'heading', level: 'h2', text: 'A scaled diagram' }],
      right: [
        {
          id: 'big',
          type: 'dia',
          fit: { viewBox: [0, 0, 1200, 600] },
          alt: 'A diagram drawn at half size',
          data: {
            w: 1200,
            h: 600,
            lines: [{ x1: 100.5, y1: 20, x2: 100.5, y2: 580, stroke: 'ink' }],
            rects: [],
            markers: [],
            texts: [{ x: 200, y: 300, text: 'Label', size: 18 }],
            icons: [],
            marks: [],
          },
        },
      ],
    },
  },
  // dia/label-clearance (rendered): a raw svg
  {
    schemaVersion: 1,
    id: 'raw',
    kind: 'content',
    layout: { type: 'cols', ratio: '5/7' },
    slots: {
      left: [{ id: 'h', type: 'heading', level: 'h2', text: 'A raw diagram' }],
      right: [
        {
          id: 'raw',
          type: 'dia',
          fit: { viewBox: [0, 0, 600, 300] },
          alt: 'A raw diagram',
          svg: RAW_SVG,
        },
      ],
    },
  },
  // lines/law: a ruled list
  {
    schemaVersion: 1,
    id: 'lines',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        {
          id: 'rows',
          type: 'rows',
          key: 240,
          items: [
            { key: 'One', value: 'The first row' },
            { key: 'Two', value: 'The second row' },
          ],
        },
        { id: 'shot', type: 'shot', asset: 'fig-a' },
      ],
    },
  },
];

export const deck: Deck = {
  schemaVersion: 1,
  id: 'rendered-fixture',
  title: 'Rendered rules fixture',
  theme: 'gt-ink-paper',
  sections: [{ id: 'all', name: 'All', slideIds: slides.map((s) => s.id) }],
  assets,
  revision: 1,
  createdAt: '2026-09-10T00:00:00Z',
  updatedAt: '2026-09-10T00:00:00Z',
};

export const document: DeckDocument = {
  deck,
  slides: Object.fromEntries(slides.map((s) => [s.id, s])),
};

type RecordOverrides = Partial<Pick<RenderRecord, 'blocks' | 'rasters' | 'overflow' | 'fonts'>>;

/** A record with the fixture's constants: revision 1, no errors, fonts loaded, an image that does not exist. */
export function record(
  slideId: string,
  theme: Theme,
  overrides: RecordOverrides = {},
): RenderRecord {
  return {
    deckId: deck.id,
    slideId,
    revision: 1,
    theme,
    scale: 1,
    image: `${slideId}-${theme}.png`,
    renderer: 'Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max',
    pageErrors: [],
    consoleErrors: [],
    overflow: overrides.overflow ?? [],
    blocks: overrides.blocks ?? {},
    fonts: overrides.fonts ?? { status: 'loaded', faces: [] },
    anchors: [],
    rasters: overrides.rasters ?? [],
    timing: { readyMs: 10, screenshotMs: 40 },
  };
}
