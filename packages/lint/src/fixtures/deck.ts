// A small deck for the linter's tests: the three worked slides of SPEC 4.3 as they should be,
// plus one slide and one asset per family of planted defects. Each planted defect names the rule
// it should trip in a comment, so the test reads as the rule table.
import type { Asset, Deck, DeckDocument, Slide } from '../contracts.ts';

const assets: Record<string, Asset> = {
  'liquid-metal-diamond': {
    id: 'liquid-metal-diamond',
    role: 'opener',
    alt: 'A liquid metal diamond, dithered',
    twins: {
      light: 'assets/liquid-metal-diamond-light.png',
      dark: 'assets/liquid-metal-diamond-dark.png',
    },
    size: [1600, 900],
    scale: 1,
    source: {
      kind: 'material',
      materialId: 'paper:liquid-metal',
      uniforms: {},
      size: [3200, 1800],
      timeMs: 5500,
      backend: 'angle-metal',
      renderer: 'Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max',
      recipeKey: 'sha256:5b1e',
    },
    treatment: {
      kind: 'two-tone',
      crop: [-1325, 105, 2709, 2374],
      autocontrast: 0.5,
      black: 20,
      gamma: 1,
      polarity: 'dark-ground',
      cell: 2,
      bayer: 8,
      resampler: 'lanczos3',
    },
    credit: 'Material: liquid metal, Paper Shaders, rendered in Glyphfield',
    inline: 'two-color',
    metrics: {
      litFraction: 0.083,
      plateClear: { plate: [137, 500, 740, 271], nearestLitPx: 108, litUnder: 0, litInBand: 0 },
    },
  },
  'site-home': {
    id: 'site-home',
    role: 'capture',
    alt: 'The home page at 1440 by 900',
    twins: { light: 'assets/site-home-light.jpg', dark: 'assets/site-home-dark.jpg' },
    size: [2880, 1800],
    scale: 2,
    source: {
      kind: 'capture',
      url: 'https://generaltranslation.com/',
      viewport: [1440, 900],
      scale: 2,
      theme: 'both',
      recipe: 'gt-site',
    },
    inline: 'resample-1280',
  },
  // asset/license-missing: a photograph without a license; picture/plate-clear and picture/blank-twin from its metrics
  'mood-rosetta': {
    id: 'mood-rosetta',
    role: 'mood',
    alt: 'The Rosetta Stone, dithered',
    twins: { light: 'assets/mood-rosetta-light.png', dark: 'assets/mood-rosetta-dark.png' },
    size: [1600, 900],
    scale: 1,
    source: {
      kind: 'photo',
      origin: 'File:Rosetta Stone.JPG',
      artist: 'Hans Hillewaert',
      license: '',
      shareAlike: true,
    },
    treatment: {
      kind: 'two-tone',
      crop: [0, 300, 1539, 1166],
      autocontrast: 0.5,
      black: 140,
      white: 230,
      gamma: 0.9,
      blur: 0.6,
      polarity: 'dark-ground',
      cell: 2,
      bayer: 8,
      resampler: 'lanczos3',
    },
    credit: 'Photograph: Hans Hillewaert, CC BY-SA 4.0',
    inline: 'two-color',
    metrics: {
      litFraction: 0.01,
      plateClear: { plate: [851, 539, 612, 232], nearestLitPx: 0, litUnder: 12, litInBand: 4 },
    },
  },
  // asset/twin-or-border: a neutral twin
  'neutral-shot': {
    id: 'neutral-shot',
    role: 'capture',
    alt: 'A neutral screenshot',
    twins: { neutral: 'assets/neutral-shot.png' },
    size: [1600, 900],
    scale: 1,
    source: { kind: 'file' },
    inline: 'native',
  },
};

const good: Slide[] = [
  {
    schemaVersion: 1,
    id: 'opener-prototemplate',
    kind: 'opener',
    sectionId: 'prototemplate-and-glyphfield',
    picture: { asset: 'liquid-metal-diamond', fit: 'cover' },
    plate: {
      side: 'lower-left',
      maxWidth: 740,
      blocks: [
        { id: 'big', type: 'heading', level: 'big', text: 'Prototemplate and Glyphfield' },
        {
          id: 'p',
          type: 'paragraph',
          measure: 56,
          marginTop: 14,
          text: 'This section covers prototemplate.com, the design lab and knowledge base, and glyphfield.com, the tooling behind it.',
        },
        {
          id: 'credit',
          type: 'credit',
          text: 'Material: liquid metal, Paper Shaders, rendered in Glyphfield',
        },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: 'content-rule',
    kind: 'content',
    layout: { type: 'cols', ratio: '1/1' },
    slots: {
      left: [
        { id: 'h', type: 'heading', level: 'h2', text: 'The content rule' },
        {
          id: 'p1',
          type: 'paragraph',
          measure: 56,
          text: 'Every post states what was built, what it cost, and what changed. The list names what passes and what is excluded.',
        },
      ],
      right: [
        {
          id: 'list',
          type: 'plain',
          items: [
            {
              icon: { name: 'check-circle', color: 'ok' },
              text: 'A measured result with the method',
            },
            { icon: { name: 'check-circle', color: 'ok' }, text: 'How GT ships a locale' },
            {
              icon: { name: 'x-circle', color: 'no' },
              no: true,
              text: 'Announcements without a result',
            },
          ],
        },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: 'the-production-site',
    kind: 'content',
    layout: { type: 'cols', ratio: '4/8' },
    slots: {
      left: [
        { id: 'h', type: 'heading', level: 'h2', text: 'The production site' },
        {
          id: 'p1',
          type: 'paragraph',
          measure: 56,
          text: 'The site shown is the production build in September 2026.',
        },
      ],
      right: [
        {
          id: 'shot',
          type: 'shot',
          asset: 'site-home',
          fit: 'width',
          captionSize: 16,
          caption: 'The home page at 1440 by 900 shows the navigation bar closed by one hairline.',
        },
      ],
    },
  },
];

// The planted defects below include values the schema's literal types forbid (a key of 170, an
// unknown icon name); they stand in for unvalidated JSON, so this list is typed after the fact.
const badRaw: unknown[] = [
  {
    schemaVersion: 1,
    id: 'bad-copy',
    kind: 'content',
    layout: { type: 'cols', ratio: '5/7' },
    slots: {
      left: [
        // copy/no-eyebrow: a cap above the heading
        { id: 'eyebrow', type: 'paragraph', role: 'cap', text: 'PLATFORM' },
        // copy/heading-period, copy/sentence-case ("Big Ideas"), copy/token-first (gt-next first)
        { id: 'h', type: 'heading', level: 'h2', text: 'gt-next Ships Big Ideas.' },
        // copy/heading-is-name
        { id: 'h2', type: 'heading', level: 'h2', text: 'Read more at generaltranslation.com' },
        // copy/no-em-dash, copy/no-exclamation, copy/metaphor-candidate, copy/contrast-pair
        {
          id: 'p1',
          type: 'paragraph',
          text: 'Unlock your journey — one build, not two! Fast, not slow.',
        },
      ],
      right: [
        // rows/key-snap (key 170), copy/heading-period on a key, icon/known (bad icon)
        {
          id: 'rows',
          type: 'rows',
          key: 170,
          items: [{ key: 'Locales.', icon: { name: 'no-such-icon' }, value: 'Eight' }],
        },
        // copy/full-sentence-caption, asset/twin-or-border (neutral twin, border false)
        {
          id: 'shot',
          type: 'shot',
          asset: 'neutral-shot',
          border: false,
          caption: 'A caption without a period',
        },
        // dia/fit-slot (viewBox 600 in a 731.5 slot), dia/half-pixel (1 px line on integer x), dia/label-clearance (label on the line)
        {
          id: 'dia',
          type: 'dia',
          fit: { viewBox: [0, 0, 600, 300] },
          alt: 'A flow',
          data: {
            w: 600,
            h: 300,
            lines: [{ x1: 100, y1: 20, x2: 100, y2: 280, stroke: 'ink' }],
            rects: [],
            markers: [],
            texts: [{ x: 102, y: 150, text: 'Label', size: 20 }],
            icons: [],
            marks: [],
          },
        },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: 'bad-escape',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        // escape/html-block; color/tokens-only (#ff0000); color/semantic-icons-only (#12a37a on a span);
        // type/weight-cap (700); type/sizes-ladder (19px); type/svg-label-min (14px in svg); icon/placement (icon in a <p>);
        // scales/marker-equals-value (authored marker); dia raw checks through the svg string
        {
          id: 'x',
          type: 'html',
          note: 'a legacy figure grid',
          css: '.s-x .k { color: #ff0000; font-weight: 700; font-size: 19px; }',
          html: '<div class="s-x"><p>Text <svg class="ic ok" aria-hidden="true"><use href="#i-check-circle"/></svg> inline</p><span style="color:#12a37a">green</span><div class="scale"><div class="bar"><i style="left: 40%"></i></div></div><svg class="dia"><text font-size="14">tiny</text></svg></div>',
        },
        // count/hard-coded (the deck has 8 slides and 2 sections) and numbers/contradiction (2 sections vs 9 sections)
        { id: 'p', type: 'paragraph', text: 'The deck has 8 slides in 2 sections.' },
        { id: 'q', type: 'paragraph', text: 'There are 9 sections in all.' },
      ],
    },
  },
  // picture/mood-placement (mood directly before an opener), asset/credit-on-plate (share-alike without credit),
  // picture/plate-clear and picture/blank-twin from the asset metrics, asset/license-missing
  {
    schemaVersion: 1,
    id: 'mood-rosetta',
    kind: 'mood',
    picture: { asset: 'mood-rosetta', fit: 'cover' },
    plate: {
      side: 'lower-right',
      maxWidth: 560,
      blocks: [
        { id: 't', type: 'heading', level: 'title', text: 'The Rosetta Stone' },
        { id: 'p', type: 'paragraph', text: 'One decree carved in three scripts.' },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: 'opener-status',
    kind: 'opener',
    sectionId: 'status',
    picture: { asset: 'liquid-metal-diamond', fit: 'cover' },
    plate: {
      side: 'lower-left',
      maxWidth: 740,
      blocks: [
        { id: 'big', type: 'heading', level: 'big', text: 'Status and plan' },
        { id: 'p', type: 'paragraph', text: 'This section covers what has shipped.' },
        { id: 'credit', type: 'credit', text: 'Material: Singularity, a Prototemplate direction' },
      ],
    },
  },
  // opener/sentence-lists-section: the sentence above does not mention the fixed points slide
  {
    schemaVersion: 1,
    id: 'fixed-points',
    kind: 'content',
    layout: { type: 'center' },
    slots: { main: [{ id: 'h', type: 'heading', level: 'h2', text: 'Fixed points' }] },
  },
];

const bad = badRaw as Slide[];

export const deck: Deck = {
  schemaVersion: 1,
  id: 'lint-fixture',
  title: 'Lint fixture deck',
  theme: 'gt-ink-paper',
  sections: [
    {
      id: 'prototemplate-and-glyphfield',
      name: 'Prototemplate and Glyphfield',
      slideIds: [
        'opener-prototemplate',
        'content-rule',
        'the-production-site',
        'bad-copy',
        'bad-escape',
        'mood-rosetta',
      ],
    },
    { id: 'status', name: 'Status and plan', slideIds: ['opener-status', 'fixed-points'] },
  ],
  assets,
  revision: 1,
  createdAt: '2026-09-10T00:00:00Z',
  updatedAt: '2026-09-10T00:00:00Z',
};

export const document: DeckDocument = {
  deck,
  slides: Object.fromEntries([...good, ...bad].map((s) => [s.id, s])),
};

/** The slides without planted defects, for the clean-deck assertion. */
export const GOOD_SLIDE_IDS = good.map((s) => s.id);
