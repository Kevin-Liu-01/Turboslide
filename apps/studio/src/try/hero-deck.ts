import type { DeckDocument, Slide } from '@turboslide/schema/deck';

/**
 * The presentation in the landing's live editor (docs/SITE.md C.8): "Northwind quarterly review",
 * five slides in the Swiss theme, made for the page and owned by nobody. Northwind is a made up
 * company; the deck carries no picture, no General Translation mark and no product name but its
 * own. The tab room starts from this document on every load, so a reload of /home starts the
 * hero again (hero-deck.test.ts validates it and runs the lint over it).
 */
export const HERO_DECK_TITLE = 'Northwind quarterly review';

/** The slide ids the agents' script names (script.ts). */
export const HERO_SLIDES = {
  title: 'title',
  agenda: 'agenda',
  numbers: 'numbers',
  shipped: 'shipped',
  plan: 'plan',
} as const;

const SLIDES: readonly Slide[] = [
  {
    schemaVersion: 1,
    id: HERO_SLIDES.title,
    template: 'title',
    kind: 'title',
    mark: { w: 132, h: 84 },
    heading: HERO_DECK_TITLE,
    lead: 'Where the quarter stands and what ships next.',
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
      assets: {},
      revision: 0,
      createdAt: stamp,
      updatedAt: stamp,
    },
    slides: Object.fromEntries(SLIDES.map((slide) => [slide.id, structuredClone(slide)])),
  } as DeckDocument;
}
