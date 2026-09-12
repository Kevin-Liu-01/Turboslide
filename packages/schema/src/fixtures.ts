// Worked fixtures (SPEC 4.3): the three worked slides with their assets, plus one slide of every
// other kind, as one small valid deck. Tests in this package and in the renderer, the linter and
// the CLI start from these so the examples in the specification stay executable.
import type { Asset } from './assets.ts';
import type { Deck, DeckDocument, Slide } from './deck.ts';

export const LIQUID_METAL_DIAMOND: Asset = {
  id: 'liquid-metal-diamond',
  role: 'opener',
  alt: 'A liquid metal diamond with two contour bands, rendered in Glyphfield, dithered',
  twins: {
    light: 'assets/liquid-metal-diamond-light.png',
    dark: 'assets/liquid-metal-diamond-dark.png',
  },
  size: [1600, 900],
  scale: 1,
  source: {
    kind: 'material',
    materialId: 'paper:liquid-metal',
    uniforms: {
      u_colorBack: '#070707',
      u_colorTint: '#f2f2f0',
      u_softness: 0.2,
      u_shiftRed: 0,
      u_shiftBlue: 0,
      u_contour: 0.6,
      u_repetition: 2,
      u_distortion: 0.1,
      u_offsetX: 0,
      u_offsetY: 0,
      u_scale: 1.0,
      u_shape: 3,
    },
    size: [3200, 1800],
    timeMs: 5500,
    backend: 'angle-metal',
    renderer: 'Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max',
    recipeKey: 'sha256:5b1e0000',
  },
  treatment: {
    kind: 'two-tone',
    crop: [400, 200, 2400, 1350],
    channel: 'gray',
    autocontrast: 0.5,
    black: 24,
    gamma: 1.0,
    polarity: 'dark-ground',
    cell: 2,
    bayer: 8,
    resampler: 'lanczos3',
  },
  credit: 'Material: liquid metal, Paper Shaders, rendered in Glyphfield',
  inline: 'two-color',
  metrics: {
    litFraction: 0.207,
    plateClear: { plate: [137, 538, 740, 232], nearestLitPx: 34, litUnder: 0, litInBand: 0 },
  },
};

export const SITE_HOME: Asset = {
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
};

export const MOOD_EARTH: Asset = {
  id: 'mood-earth',
  role: 'mood',
  alt: "NASA's Blue Marble, the Earth with the Western Hemisphere in daylight, rendered as a two-tone dither",
  twins: { light: 'assets/mood-earth-light.png', dark: 'assets/mood-earth-dark.png' },
  size: [1600, 900],
  scale: 1,
  source: {
    kind: 'photo',
    origin: 'NASA, Reto Stöckli, 2007',
    license: 'public domain',
    shareAlike: false,
  },
  credit: 'Image: NASA, Reto Stöckli, 2007, public domain',
  inline: 'two-color',
};

export const OPENER_PROTOTEMPLATE: Slide = {
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
  notes: 'Two products, one grammar. Say what each is for before the detail slides.',
};

export const CONTENT_RULE: Slide = {
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
          {
            icon: { name: 'check-circle', color: 'ok' },
            text: 'A decision and the constraint behind it',
          },
          { icon: { name: 'check-circle', color: 'ok' }, text: 'A tool that a reader can run' },
          { icon: { name: 'check-circle', color: 'ok' }, text: 'How GT ships a locale' },
          {
            icon: { name: 'x-circle', color: 'no' },
            no: true,
            text: 'Announcements without a result',
          },
          {
            icon: { name: 'x-circle', color: 'no' },
            no: true,
            text: 'Opinions about the industry',
          },
        ],
      },
    ],
  },
};

export const THE_PRODUCTION_SITE: Slide = {
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
        text: 'The site shown is the production build in September 2026. generaltranslation.com was rebuilt page by page on one layout system: a single ruled column, hairline seams between sections, registration crosses at junctions, and one display face at one weight.',
      },
    ],
    right: [
      {
        id: 'shot',
        type: 'shot',
        asset: 'site-home',
        fit: 'width',
        captionSize: 16,
        caption:
          'The home page at 1440 by 900 shows the navigation bar closed by one hairline, the hero inside the rails, the product demo, and the customer logo row in ruled cells.',
      },
    ],
  },
};

export const TITLE: Slide = {
  schemaVersion: 1,
  id: 'title',
  kind: 'title',
  mark: { w: 132, h: 84 },
  heading: 'General Translation',
  lead: 'This deck covers the brand, the design system, the current state of the site, and the plans for the next quarter. It was prepared in September 2026.',
};

export const THESIS: Slide = {
  schemaVersion: 1,
  id: 'thesis',
  kind: 'statement',
  big: 'Every product in every language',
  measure: 22,
};

export const MOOD_EARTH_SLIDE: Slide = {
  schemaVersion: 1,
  id: 'mood-earth',
  kind: 'mood',
  picture: { asset: 'mood-earth', fit: 'cover' },
  plate: {
    side: 'lower-right',
    maxWidth: 560,
    blocks: [
      { id: 'title', type: 'heading', level: 'title', text: 'The Blue Marble' },
      {
        id: 'p',
        type: 'paragraph',
        marginTop: 12,
        text: "NASA's composite of the whole planet. The company sells to every part of it, so the brand section starts at that scale.",
      },
      { id: 'credit', type: 'credit', text: 'Image: NASA, Reto Stöckli, 2007, public domain' },
    ],
  },
};

export const OPENER_BRAND: Slide = {
  schemaVersion: 1,
  id: 'opener-brand',
  kind: 'opener',
  sectionId: 'brand',
  picture: { asset: 'liquid-metal-diamond', fit: 'cover' },
  plate: {
    side: 'lower-left',
    maxWidth: 740,
    blocks: [
      { id: 'big', type: 'heading', level: 'big', text: 'Brand' },
      {
        id: 'p',
        type: 'paragraph',
        measure: 56,
        marginTop: 14,
        text: 'This section covers the title, the thesis, the reputation and the content rule.',
      },
      {
        id: 'credit',
        type: 'credit',
        text: 'Material: liquid metal, Paper Shaders, rendered in Glyphfield',
      },
    ],
  },
};

/**
 * A freeform slide with one of every primitive (docs/freeform.md), outside the worked deck so the
 * counts the M2 acceptance asserts stay; `freeformDocument()` adds it to the worked deck's website
 * section for the tests of the renderer, the linter, the reducer and the CLI.
 */
export const FREEFORM_SLIDE: Slide = {
  schemaVersion: 1,
  id: 'free',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 'h',
        type: 'heading',
        level: 'h2',
        text: 'A freeform slide',
        pos: { x: 137, y: 129, w: 640, h: 56, z: 0 },
      },
      {
        id: 'p1',
        type: 'text',
        text: 'Boxes, shapes and text sit anywhere on the sheet, snapped to the grid.',
        typography: { size: 22, leading: 1.5 },
        pos: { x: 137, y: 209, w: 480, h: 72, z: 1 },
      },
      {
        id: 'box',
        type: 'box',
        fill: 'plate',
        stroke: 'hair',
        padding: 16,
        text: 'A plate box with a hairline.',
        pos: { x: 832, y: 129, w: 320, h: 160, z: 2 },
      },
      {
        id: 'arrow',
        type: 'shape',
        shape: 'arrow',
        stroke: 'ink',
        width: 1.5,
        pos: { x: 640, y: 201, w: 176, h: 16, z: 3 },
      },
      {
        id: 'rule',
        type: 'rule',
        orientation: 'horizontal',
        pos: { x: 137, y: 760, w: 1326, h: 8, z: 4 },
      },
      {
        id: 'ic',
        type: 'icon',
        name: 'check-circle',
        size: 32,
        color: 'green',
        pos: { x: 137, y: 320, w: 32, h: 32, z: 5 },
      },
    ],
  },
};

export const WORKED_DECK: Deck = {
  schemaVersion: 1,
  id: 'gt-brand',
  title: 'GT brand deck',
  theme: 'gt-ink-paper',
  sections: [
    {
      id: 'brand',
      name: 'Brand',
      slideIds: ['opener-brand', 'title', 'thesis', 'mood-earth', 'content-rule'],
    },
    { id: 'website', name: 'Website', slideIds: ['the-production-site'] },
    {
      id: 'prototemplate-and-glyphfield',
      name: 'Prototemplate and Glyphfield',
      slideIds: ['opener-prototemplate'],
    },
  ],
  assets: {
    'liquid-metal-diamond': LIQUID_METAL_DIAMOND,
    'site-home': SITE_HOME,
    'mood-earth': MOOD_EARTH,
  },
  revision: 412,
  createdAt: '2026-09-10T18:00:00Z',
  updatedAt: '2026-09-10T19:42:11Z',
};

export const WORKED_SLIDES: ReadonlyArray<Slide> = [
  OPENER_BRAND,
  TITLE,
  THESIS,
  MOOD_EARTH_SLIDE,
  CONTENT_RULE,
  THE_PRODUCTION_SITE,
  OPENER_PROTOTEMPLATE,
];

/** A fresh deep copy of the worked deck as a document, so tests can mutate it freely. */
export function workedDocument(): DeckDocument {
  const slides: Record<string, Slide> = {};
  for (const slide of WORKED_SLIDES) slides[slide.id] = JSON.parse(JSON.stringify(slide)) as Slide;
  return { deck: JSON.parse(JSON.stringify(WORKED_DECK)) as Deck, slides };
}

/** The worked deck plus the freeform slide at the end of the website section, as a fresh copy. */
export function freeformDocument(): DeckDocument {
  const document = workedDocument();
  const website = document.deck.sections.find((section) => section.id === 'website');
  website?.slideIds.push(FREEFORM_SLIDE.id);
  document.slides[FREEFORM_SLIDE.id] = JSON.parse(JSON.stringify(FREEFORM_SLIDE)) as Slide;
  return document;
}
