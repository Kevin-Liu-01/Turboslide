// The chrome's colour as data (docs/DESIGN.md 5.2, decision C10): the brand's seeds per
// appearance, the twelve step roles of a ramp, and every chrome colour token with the rule that
// makes it, its role and its floor. Framework free and free of any colour library:
// `scripts/build-colors.ts` runs colorjs.io over this module and writes the colour block of
// packages/chrome/src/tokens.css and `colors.generated.ts`; `colors.test.ts` holds every pair at
// its WCAG 2.2 floor in both appearances. The General Translation theme's sheet
// (`gt-ink-paper/sheet.css`, parity with Prototemplate's head.html) keeps its own values.

export type Appearance = 'light' | 'dark';
export const APPEARANCES: readonly Appearance[] = ['light', 'dark'];

/** The brand's seeds (DESIGN.md 5.2): paper, ink, the second ink, titanium and five hues. */
export type SeedName =
  'paper' | 'ink' | 'ink2' | 'titanium' | 'blue' | 'green' | 'amber' | 'red' | 'guide';

export const SEEDS: Readonly<Record<Appearance, Readonly<Record<SeedName, string>>>> = {
  light: {
    paper: '#ffffff',
    ink: '#070707',
    ink2: '#3a3d44',
    titanium: '#8a8f98',
    blue: '#2f5ce0',
    green: '#12a37a',
    amber: '#f0a020',
    red: '#e5484d',
    guide: '#d6336c',
  },
  dark: {
    paper: '#070707',
    ink: '#f2f2f0',
    ink2: '#b9bcc3',
    titanium: '#8a8f98',
    blue: '#2f5ce0',
    green: '#12a37a',
    amber: '#f0a020',
    red: '#e5484d',
    guide: '#d6336c',
  },
};

/** The hues that get a twelve step ramp beside the neutral one. */
export type HueName = 'blue' | 'green' | 'amber' | 'red' | 'guide';
export const HUES: readonly HueName[] = ['blue', 'green', 'amber', 'red', 'guide'];

/**
 * The twelve step roles of a ramp, Radix Colors 3.0.0's model (its values are not used: the
 * brand's ink is 6.30 CIEDE2000 from Radix gray12, research-type 3.2).
 */
export const STEP_ROLES: readonly string[] = [
  'app ground',
  'subtle ground',
  'component ground',
  'component ground, hovered',
  'component ground, pressed',
  'subtle line',
  'line and boundary',
  'strong line',
  'solid (the seed)',
  'solid, hovered',
  'secondary text',
  'text',
];

/** Steps 1 to 8 of a hue ramp sit at these OKLCH lightness targets. */
export const HUE_LIGHTNESS: Readonly<Record<Appearance, readonly number[]>> = {
  light: [0.994, 0.983, 0.958, 0.93, 0.9, 0.862, 0.81, 0.735],
  dark: [0.17, 0.205, 0.255, 0.295, 0.335, 0.385, 0.45, 0.54],
};

/** Steps 1 to 8 take this share of the seed's chroma, tapering toward the ends. */
export const CHROMA_TAPER: readonly number[] = [0.06, 0.12, 0.22, 0.32, 0.42, 0.52, 0.64, 0.8];

/** Step 10 moves the seed's lightness by this much: darker on light, lighter on dark. */
export const SOLID_HOVER_STEP = 0.045;

/**
 * Steps 2 to 8 of the neutral ramp (titanium's hue, its chroma at 40 % on steps 2 and 3); step 1 is
 * the paper, 9 titanium, 10 the solved secondary text, 11 the second ink, 12 the ink.
 */
export const NEUTRAL_LIGHTNESS: Readonly<Record<Appearance, readonly number[]>> = {
  light: [0.975, 0.95, 0.925, 0.9, 0.87, 0.82, 0.74],
  dark: [0.2, 0.245, 0.28, 0.315, 0.355, 0.42, 0.5],
};

/** The WCAG 2.2 floors (DESIGN.md 5.3): text SC 1.4.3, boundaries, glyphs and lines SC 1.4.11. */
export const FLOORS = { text: 4.5, boundary: 3, glyph: 3 } as const;

/** A solved value holds its floor with this much to spare after rounding to sRGB hex. */
export const SPARE = 0.05;

/** The lightness step of the solver's walk in OKLCH. */
export const SOLVE_STEP = 0.0025;

/** A colour a token is drawn from: a seed, or white or black for the tints over ink. */
export type Base = SeedName | 'white' | 'black';

/** A ground a solved value is measured on: the paper, the hover ground (the plate over the paper). */
export type SolveGround = 'paper' | 'hover';

/** How a token's value is made in one appearance. */
export type TokenSource =
  /** a seed byte for byte */
  | { kind: 'seed'; seed: SeedName }
  /** a recorded value the round keeps as it is (DESIGN.md 5.2 "unchanged") */
  | { kind: 'hex'; value: string }
  /** a base colour at an alpha, written rgba() */
  | { kind: 'alpha'; base: Base; alpha: number }
  /**
   * the first OKLCH lightness from the seed, walking toward the far end at the seed's chroma and
   * hue, whose sRGB hex holds `floor + SPARE` on every ground (and, with `apca`, an APCA |Lc| of
   * at least that on the paper)
   */
  | {
      kind: 'solve';
      seed: SeedName;
      floor: number;
      on: readonly SolveGround[];
      direction: 'darker' | 'lighter';
      apca?: number;
    };

/** What a token is for, which decides whether a floor gates it (DESIGN.md 5.3). */
export type TokenRole =
  'ground' | 'text' | 'boundary' | 'glyph' | 'selection' | 'disabled' | 'decorative' | 'scrim';

/** One colour token of the chrome. `dark` absent: declared on :root alone, one value for both. */
export type ChromeToken = {
  name: `--pt-${string}`;
  role: TokenRole;
  /** one or two sentences written above the declaration in tokens.css */
  note?: string;
  light: TokenSource;
  dark?: TokenSource;
};

const seed = (name: SeedName): TokenSource => ({ kind: 'seed', seed: name });
const hex = (value: string): TokenSource => ({ kind: 'hex', value });
const alpha = (base: Base, a: number): TokenSource => ({ kind: 'alpha', base, alpha: a });

/** The chrome's colour tokens in the order tokens.css declares them (DESIGN.md 5.2). */
export const CHROME_TOKENS: readonly ChromeToken[] = [
  { name: '--pt-paper', role: 'ground', light: seed('paper'), dark: seed('paper') },
  { name: '--pt-ink', role: 'text', light: seed('ink'), dark: seed('ink') },
  { name: '--pt-ink-2', role: 'text', light: seed('ink2'), dark: seed('ink2') },
  {
    name: '--pt-titanium',
    role: 'text',
    note: 'The secondary text (the save words, the menu keys, the filmstrip numbers, the field labels): titanium solved to 4.5:1 on the paper and on the hover ground; #6f747d read 4.12:1 on a hovered menu row (research-type 3.1). Dark is lifted to APCA Lc 45 on the paper (DESIGN.md question 11).',
    light: {
      kind: 'solve',
      seed: 'titanium',
      floor: FLOORS.text,
      on: ['paper', 'hover'],
      direction: 'darker',
    },
    dark: {
      kind: 'solve',
      seed: 'titanium',
      floor: FLOORS.text,
      on: ['paper', 'hover'],
      direction: 'lighter',
      apca: 45,
    },
  },
  {
    name: '--pt-disabled',
    role: 'disabled',
    note: "A disabled control's text and glyph, apart from the second ink; disabled text is exempt from SC 1.4.3 and reported.",
    light: hex('#8a8f98'),
    dark: hex('#6b6e73'),
  },
  {
    name: '--pt-field',
    role: 'boundary',
    note: 'The boundary of every input, select and textarea: ink at 0.44, the 3:1 of SC 1.4.11.',
    light: alpha('ink', 0.44),
    dark: alpha('ink', 0.44),
  },
  { name: '--pt-hair', role: 'decorative', light: alpha('ink', 0.18), dark: alpha('ink', 0.22) },
  {
    name: '--pt-hair-soft',
    role: 'decorative',
    light: alpha('ink', 0.09),
    dark: alpha('ink', 0.1),
  },
  {
    name: '--pt-hair-on-ink',
    role: 'decorative',
    note: 'The line and the grounds drawn over the solid ink of the Slideshow split button: a paper tint over ink (docs/archive/rounds/RETURN.md 4.1).',
    light: alpha('white', 0.26),
    dark: alpha('paper', 0.26),
  },
  {
    name: '--pt-plate-on-ink',
    role: 'decorative',
    light: alpha('white', 0.16),
    dark: alpha('paper', 0.16),
  },
  {
    name: '--pt-plate-on-ink-open',
    role: 'decorative',
    light: alpha('white', 0.24),
    dark: alpha('paper', 0.24),
  },
  {
    name: '--pt-plate',
    role: 'decorative',
    note: 'The hover ground of every shell button, menu title and menu row, and the stage ground: #f0f0f0 on light paper, #1a1a1a on dark.',
    light: alpha('ink', 0.06),
    dark: alpha('ink', 0.08),
  },
  {
    name: '--pt-cross',
    role: 'decorative',
    light: alpha('ink', 0.38),
    dark: alpha('white', 0.34),
  },
  {
    name: '--pt-edge',
    role: 'decorative',
    note: "A floating plate's frame (DESIGN.md 3.4).",
    light: alpha('ink', 0.62),
    dark: alpha('ink', 0.55),
  },
  {
    name: '--pt-thumb',
    role: 'boundary',
    note: 'The scrollbar thumb (DESIGN.md 6.2): ink at 0.44, 3:1 on the paper; 0.32 read 2.17:1 and 2.58:1.',
    light: alpha('ink', 0.44),
    dark: alpha('ink', 0.44),
  },
  {
    name: '--pt-scrim',
    role: 'scrim',
    note: 'Under a dialog: ink at 0.28 on light; black at 0.56 on dark, where ink at 0.28 changed almost nothing.',
    light: alpha('ink', 0.28),
    dark: alpha('black', 0.56),
  },
  { name: '--pt-panel-ink', role: 'ground', light: hex('#101010') },
  {
    name: '--pt-panel-text',
    role: 'text',
    note: 'The text of the #101010 panels (the code panels, the slideshow toolbar), the same in both appearances; the second text and the dim text were read and never declared until the design round.',
    light: alpha('white', 0.87),
  },
  { name: '--pt-panel-text-2', role: 'text', light: alpha('white', 0.6) },
  { name: '--pt-panel-dim', role: 'text', light: alpha('white', 0.6) },
  {
    name: '--pt-status-done',
    role: 'glyph',
    note: 'The status hues: colour on a status glyph alone, never on text or lines (DECK-GRAMMAR 30), each at 3:1 on its paper. Done, open, refused.',
    light: seed('green'),
    dark: hex('#1fbf92'),
  },
  {
    name: '--pt-status-open',
    role: 'glyph',
    light: {
      kind: 'solve',
      seed: 'amber',
      floor: FLOORS.glyph,
      on: ['paper'],
      direction: 'darker',
    },
    dark: seed('amber'),
  },
  { name: '--pt-status-refused', role: 'glyph', light: seed('red'), dark: seed('red') },
  {
    name: '--pt-select',
    role: 'selection',
    note: 'The selection ring, handles, marquee and chip: GT blue in both appearances, at 3:1 on the paper and on the ink of each.',
    light: seed('blue'),
    dark: seed('blue'),
  },
  { name: '--pt-select-text', role: 'text', light: seed('paper') },
  { name: '--pt-guide', role: 'selection', light: seed('guide'), dark: hex('#f0397a') },
];

/** A ground in a pair: a token, or a translucent token composited over another (the hover ground). */
export type PairGround = { token: string; over?: string };

/** One pair the chrome draws, with its floor; a floor of 0 is reported and never gated. */
export type ContrastPair = {
  name: string;
  text: string;
  ground: PairGround;
  floor: number;
  /** the appearances the pair is drawn in; both when absent */
  appearances?: readonly Appearance[];
};

const PAPER: PairGround = { token: '--pt-paper' };
const HOVER: PairGround = { token: '--pt-plate', over: '--pt-paper' };
const INK: PairGround = { token: '--pt-ink' };
const PANEL: PairGround = { token: '--pt-panel-ink' };

/**
 * Every pair of the chrome the gate reads (DESIGN.md 5.3, the row chrome.colors.pairs-at-floor):
 * text at 4.5:1, boundaries, glyphs and the selection lines at 3:1, the disabled text and the
 * decorative lines reported with a floor of 0.
 */
export const PAIRS: readonly ContrastPair[] = [
  { name: 'text on the paper', text: '--pt-ink', ground: PAPER, floor: FLOORS.text },
  { name: 'text on the hover ground', text: '--pt-ink', ground: HOVER, floor: FLOORS.text },
  { name: 'second text on the paper', text: '--pt-ink-2', ground: PAPER, floor: FLOORS.text },
  {
    name: 'second text on the hover ground',
    text: '--pt-ink-2',
    ground: HOVER,
    floor: FLOORS.text,
  },
  { name: 'secondary text on the paper', text: '--pt-titanium', ground: PAPER, floor: FLOORS.text },
  {
    name: 'a menu key on a hovered row',
    text: '--pt-titanium',
    ground: HOVER,
    floor: FLOORS.text,
  },
  {
    name: 'paper text on the solid ink button',
    text: '--pt-paper',
    ground: INK,
    floor: FLOORS.text,
  },
  {
    name: 'chip text on the selection colour',
    text: '--pt-select-text',
    ground: { token: '--pt-select' },
    floor: FLOORS.text,
  },
  { name: 'panel text on the panel', text: '--pt-panel-text', ground: PANEL, floor: FLOORS.text },
  {
    name: 'panel second text on the panel',
    text: '--pt-panel-text-2',
    ground: PANEL,
    floor: FLOORS.text,
  },
  {
    name: 'panel dim text on the panel',
    text: '--pt-panel-dim',
    ground: PANEL,
    floor: FLOORS.text,
  },
  {
    name: 'the field boundary on the paper',
    text: '--pt-field',
    ground: PAPER,
    floor: FLOORS.boundary,
  },
  {
    name: 'the scrollbar thumb on the paper',
    text: '--pt-thumb',
    ground: PAPER,
    floor: FLOORS.boundary,
  },
  {
    name: 'the done glyph on the paper',
    text: '--pt-status-done',
    ground: PAPER,
    floor: FLOORS.glyph,
  },
  {
    name: 'the open glyph on the paper',
    text: '--pt-status-open',
    ground: PAPER,
    floor: FLOORS.glyph,
  },
  {
    name: 'the refused glyph on the paper',
    text: '--pt-status-refused',
    ground: PAPER,
    floor: FLOORS.glyph,
  },
  {
    name: 'the selection on the paper',
    text: '--pt-select',
    ground: PAPER,
    floor: FLOORS.boundary,
  },
  { name: 'the selection on the ink', text: '--pt-select', ground: INK, floor: FLOORS.boundary },
  { name: 'a guide on the paper', text: '--pt-guide', ground: PAPER, floor: FLOORS.boundary },
  { name: 'a guide on the ink', text: '--pt-guide', ground: INK, floor: FLOORS.boundary },
  { name: 'disabled text on the paper (exempt)', text: '--pt-disabled', ground: PAPER, floor: 0 },
  { name: 'the plate frame on the paper (decorative)', text: '--pt-edge', ground: PAPER, floor: 0 },
  { name: 'the hairline on the paper (decorative)', text: '--pt-hair', ground: PAPER, floor: 0 },
];

/** The selectors tokens.css declares each appearance's values under. */
export const APPEARANCE_SELECTORS: Readonly<Record<Appearance, readonly string[]>> = {
  light: [':root', ".ts-overlay[data-theme='light']"],
  dark: [":root[data-theme='dark']", ".ts-overlay[data-theme='dark']"],
};

/** The markers of the generated block in tokens.css. */
export const GENERATED_START = '/* colors:generated:start */';
export const GENERATED_END = '/* colors:generated:end */';
