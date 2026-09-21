// The font catalog's ids (gslides-parity SPEC-5-amendments A5; the integrator's day 0 seam of
// round five). `Typography.family` and the theme record's two roles (`text`, `display`) name a
// face by one of these ids; absent means the theme's face, Inter at `BASE`. The catalog itself
// (the names PowerPoint and Google Slides use, the categories, the weights, the licences, the
// woff2 files under `packages/fonts/assets/<id>/`) is B7's `packages/fonts/src/catalog.ts`, whose
// test asserts every row's id is in this list and every id here has a row. The schema holds the
// ids alone so `packages/schema` stays at the bottom of the one way dependency direction (SPEC
// 3.3 item 3): the fonts package depends on the schema, never the reverse. Membership is Kevin's
// list (SPEC-5 17, the row A7 adds): a face joins or leaves as one id here, one catalog row and
// one asset folder.
export const FONT_IDS = [
  'inter',
  'roboto',
  'open-sans',
  'lato',
  'montserrat',
  'poppins',
  'source-sans-3',
  'source-serif-4',
  'merriweather',
  'playfair-display',
  'lora',
  'pt-serif',
  'libre-baskerville',
  'eb-garamond',
  'nunito',
  'raleway',
  'work-sans',
  'dm-sans',
  'space-grotesk',
  'oswald',
  'bebas-neue',
  'roboto-mono',
  'jetbrains-mono',
  'ibm-plex-sans',
  'ibm-plex-mono',
  'fira-code',
] as const;
export type FontId = (typeof FONT_IDS)[number];

/** The face every theme uses when no `family` is written (A5 item 1). */
export const DEFAULT_FONT_ID: FontId = 'inter';

/** Google's four Font menu categories (A5 item 2), the picker's section order. */
export const FONT_CATEGORIES = ['sans', 'serif', 'display', 'mono'] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

/** The two licences a catalog face may carry (A5 item 2); a face under another licence is not added. */
export const FONT_LICENCES = ['OFL 1.1', 'Apache 2.0'] as const;
export type FontLicence = (typeof FONT_LICENCES)[number];

export function isFontId(value: string): value is FontId {
  return (FONT_IDS as ReadonlyArray<string>).includes(value);
}
