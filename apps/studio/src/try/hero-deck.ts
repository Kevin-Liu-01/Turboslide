import type { Asset } from '@turboslide/schema/assets';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';

/**
 * The presentation in the landing's live editor (docs/SITE.md C.8): "Northwind quarterly review",
 * five slides in the Swiss theme, made for the page and owned by nobody. Northwind is a made up
 * company; the deck carries no General Translation mark and no product name but its own. Its one
 * picture is NASA's Blue Marble on the title slide, drawn by the editor's own picture dither. The
 * tab room starts from this document on every load, so a reload of /home starts the hero again
 * (hero-deck.test.ts validates it and runs the lint over it).
 */
export const HERO_DECK_TITLE = 'Northwind quarterly review';

/**
 * Where the hero deck's asset paths resolve: no store holds a tab's deck, so its picture is a
 * static file of the site (apps/studio/public/hero/), and the tab backend serves every asset path
 * from here (session.ts).
 */
export const HERO_ASSET_BASE = '/hero/';

/**
 * The title slide's picture: the disc of the Blue Marble (Western Hemisphere, Reto Stöckli,
 * 2007) cut square from Kevin's pinned copy, its red channel as one 520 px gray JPEG, so the
 * oceans tone down to ink and land, cloud and ice keep their texture. The record is what
 * `turboslide asset add` wrote for it, with the file at the site's hero folder.
 */
const EARTH: Asset = {
  id: 'earth',
  role: 'opener',
  alt: "NASA's Blue Marble, the Earth with the Western Hemisphere in daylight",
  twins: { neutral: 'earth.jpg' },
  size: [520, 520],
  scale: 1,
  source: {
    kind: 'photo',
    origin: 'https://commons.wikimedia.org/wiki/File:Blue_Marble_Western_Hemisphere.jpg',
    title: 'Blue Marble Western Hemisphere',
    artist: 'NASA Earth Observatory, Reto Stöckli',
    license: 'public domain',
    shareAlike: false,
  },
  treatment: { kind: 'continuous', quality: 92 },
  credit: 'Image: NASA, Reto Stöckli, 2007, public domain',
  inline: 'native',
};

/** The slide ids the agents' script names (script.ts). */
export const HERO_SLIDES = {
  title: 'title',
  agenda: 'agenda',
  numbers: 'numbers',
  shipped: 'shipped',
  plan: 'plan',
} as const;

/** The title's sentence; the agents' first pose puts Claude Code's caret at its end (session.ts). */
const TITLE_LEAD = 'Where the quarter stands and what ships next.';

const SLIDES: readonly Slide[] = [
  /* the title as `turboslide slide to-canvas title` arranges it (the grammar record keeps the
     title it came from, so Apply layout restores it), then the Earth: a picture object at the
     right of the sheet, masked to an ellipse and dithered with the deck's 8 by 8 screen at its
     2 px cell and the deck's Earth tone (ink at 80, paper at 210). Polarity `same` paints the
     positive in both appearances, oceans in ink. The credit sits on the baseline of the disc. */
  {
    schemaVersion: 1,
    id: HERO_SLIDES.title,
    template: 'title',
    grammar: {
      kind: 'title',
      slots: { main: ['mark', 'heading', 'lead'] },
      boxes: {
        mark: { x: 137, y: 129, w: 1326, h: 64, z: 0 },
        heading: { x: 137, y: 173, w: 1326, h: 89.75, z: 1 },
        lead: { x: 137, y: 288.75, w: 901.453125, h: 37.6875, z: 2 },
      },
      fields: { mark: { w: 132, h: 84 }, template: 'title', autofit: ['heading', 'lead'] },
    },
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        { id: 'mark', pos: { x: 137, y: 129, w: 1326, h: 64, z: 0 }, type: 'mark', w: 132, h: 84 },
        {
          id: 'heading',
          pos: { x: 137, y: 173, w: 1326, h: 89.75, z: 1 },
          type: 'heading',
          level: 'h1',
          text: HERO_DECK_TITLE,
          autofit: 'shrink',
        },
        {
          id: 'lead',
          pos: { x: 137, y: 288.75, w: 901.453125, h: 37.6875, z: 2 },
          type: 'paragraph',
          text: TITLE_LEAD,
          role: 'lead',
          tone: 'muted',
          measure: 56,
          autofit: 'shrink',
        },
        {
          id: 'earth',
          pos: { x: 943, y: 320, w: 520, h: 520, z: 3 },
          type: 'picture',
          asset: EARTH.id,
          mask: 'ellipse',
          dither: { pattern: 'bayer8', black: 80, white: 210, polarity: 'same' },
        },
        {
          id: 'credit',
          pos: { x: 137, y: 816, w: 640, h: 24, z: 4 },
          type: 'credit',
          text: EARTH.credit,
        },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: HERO_SLIDES.agenda,
    kind: 'content',
    template: 'rows',
    layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
    slots: {
      left: [{ id: 'h', type: 'heading', level: 'h2', text: 'Agenda' }],
      right: [
        {
          id: 'rows',
          type: 'rows',
          key: 120,
          tight: true,
          items: [
            { key: '01', value: 'Where the quarter stands' },
            { key: '02', value: 'The numbers by quarter' },
            { key: '03', value: 'What shipped' },
            { key: '04', value: 'The plan for the next quarter' },
          ],
        },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: HERO_SLIDES.numbers,
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        {
          id: 'h',
          type: 'heading',
          level: 'h2',
          text: 'Orders by quarter',
          pos: { x: 137, y: 110, w: 1100, h: 72, z: 0 },
        },
        {
          id: 'chart',
          type: 'chart',
          kind: 'bar',
          title: 'Orders in thousands',
          legend: 'none',
          categories: ['Q1', 'Q2', 'Q3', 'Q4'],
          series: [{ name: 'Orders', values: [42, 51, 58, 66] }],
          pos: { x: 137, y: 220, w: 1326, h: 560, z: 1 },
        },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: HERO_SLIDES.shipped,
    kind: 'content',
    template: 'rows',
    layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
    slots: {
      left: [
        { id: 'h', type: 'heading', level: 'h2', text: 'What shipped' },
        { id: 'p1', type: 'paragraph', text: 'Three releases this quarter.', measure: 56 },
      ],
      right: [
        {
          id: 'rows',
          type: 'rows',
          key: 180,
          tight: true,
          items: [
            { key: 'July', value: 'Orders sync with the warehouse every hour' },
            { key: 'August', value: 'Returns start from the order page' },
            { key: 'September', value: 'Sellers see stock by region' },
          ],
        },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: HERO_SLIDES.plan,
    kind: 'statement',
    big: 'Next quarter: one checkout for every region',
    measure: 22,
  },
] as unknown as readonly Slide[];

/** The document under `deckId`, at revision 0, stamped now. */
export function heroDocument(deckId: string, now: Date = new Date()): DeckDocument {
  const stamp = now.toISOString();
  return {
    deck: {
      schemaVersion: 1,
      id: deckId,
      title: HERO_DECK_TITLE,
      theme: 'swiss',
      defaults: { appearance: 'light' },
      sections: [{ id: 'deck', name: 'Deck', slideIds: SLIDES.map((slide) => slide.id) }],
      assets: { [EARTH.id]: structuredClone(EARTH) },
      revision: 0,
      createdAt: stamp,
      updatedAt: stamp,
    },
    slides: Object.fromEntries(SLIDES.map((slide) => [slide.id, structuredClone(slide)])),
  } as DeckDocument;
}
