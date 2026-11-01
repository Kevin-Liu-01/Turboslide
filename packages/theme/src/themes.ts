// The theme library as data (docs/DESIGN.md 7.2): nine themes, each with a light and a dark
// appearance. A record holds the theme's name, the sentence its picker tile shows, the twelve
// sheet tokens per appearance, its two faces and how it sets its headings, the display features,
// the frame, the band, the title slide's composition, size and colours, the parts it draws on the
// title slide and on every other slide, and the starter pictures. The structure (the default appearance, the counter, the
// logo, the frame, the pictures) is the schema's table (`THEME_FACTS` in
// @turboslide/schema/brand), so the deck readers and these records cannot disagree; the colours
// and the composition live here. The renderer reads a record under the deck's brand kit
// (packages/render/src/theme-css.ts); General Translation's record is the sheet itself
// (`TOKENS`, sheet.css), so a General Translation deck without a kit emits no override at all.
// Simple's colours are the sheet's too, so a deck from Blank keeps every colour. Browser safe.
import type { CounterFormat, ThemeFrame, ThemeId } from '@turboslide/schema/brand';
import type { FontId } from '@turboslide/schema/fonts';
import { GT_THEME_ID, THEME_FACTS, THEME_IDS, themeIdOf } from '@turboslide/schema/brand';
import type { ThemeName, TokenName } from './tokens.ts';
import { DISPLAY, DISPLAY_FEATURES_OFF, TOKENS } from './tokens.ts';

/** The five colours a theme states per appearance; the other seven tokens derive from them. */
export type ThemeColors = {
  paper: string;
  ink: string;
  'ink-2': string;
  /** the hint colour: slide numbers, prompts, captions' secondary role (the token `--titanium`) */
  hint: string;
  /** the one accent; links and charts read it as Primary too (`--blue`) */
  accent: string;
};

/** Where the title slide puts its heading and lead. */
export type TitleComposition = 'left-middle' | 'top-left' | 'centre' | 'bottom-left';

/**
 * What fills a part: the accent, the ink, the paper, a tone (a quarter of the accent over the
 * paper), or a line (a hairline of the accent round the box, nothing inside).
 */
export type PartFill = 'accent' | 'ink' | 'paper' | 'tone' | 'line';

/**
 * One solid part a theme draws under every object of a slide (Kevin, 2026-11-01: "make these more
 * visually distinct, look at google slides themes"): a box on the 1600 by 900 sheet, x, y, width
 * and height in px, filled as `fill` names, a disc when `round`. A presentation theme is a few
 * such parts at fixed places in the slide's margins, a bigger set on its title slide (a flood, a
 * card on a coloured ground, a side panel, a header band, a corner shape, a hairline frame), so a
 * title of any length and a slide moved onto the canvas keep them.
 */
export type ThemePart = {
  box: readonly [x: number, y: number, w: number, h: number];
  fill: PartFill;
  round?: boolean;
};

/** The most parts one slide draws: the slide's two pseudo elements (theme-css.ts). */
export const MAX_THEME_PARTS = 2;

export type ThemeRecord = {
  id: ThemeId;
  name: string;
  /** one sentence that says what the theme draws, for the picker's tooltip and theme.list */
  sentence: string;
  defaultAppearance: ThemeName;
  /** the five stated colours per appearance */
  colors: Readonly<Record<ThemeName, ThemeColors>>;
  /** the twelve sheet tokens per appearance (tokens.ts TOKEN_NAMES) */
  tokens: Readonly<Record<ThemeName, Readonly<Record<TokenName, string>>>>;
  /** the catalog faces of the headings and the text (schema THEME_FACTS); the kit's roles win */
  fonts: { display: FontId; text: FontId };
  /** the headings' tracking in em and whether they are set in capitals */
  heading: { tracking: number; uppercase: boolean };
  /** `--display-features`: General Translation's cv11 and ss01, Inter's defaults elsewhere */
  displayFeatures: string;
  frame: ThemeFrame;
  band: { wordmark: 'gt' | 'none'; counter: CounterFormat | 'none' };
  /**
   * the title slide: where its heading and lead sit, how far the column stops short of the content
   * box's right edge (px, to keep clear of a disc or a panel), the heading's size where it is not
   * the ladder's 88 px, the accent bar over each heading, the GT mark, the parts it draws, and its
   * own five colours per appearance where it is set on another ground than the deck (a flood)
   */
  title: {
    composition: TitleComposition;
    columnRight: number;
    size: number | null;
    accentBar: boolean;
    mark: 'gt' | 'none';
    parts: readonly ThemePart[];
    colors: Readonly<Record<ThemeName, ThemeColors>> | null;
    tokens: Readonly<Record<ThemeName, Readonly<Record<TokenName, string>>>> | null;
  };
  /** the parts every other slide draws, and the title slide where it draws none of its own */
  parts: readonly ThemePart[];
  pictures: 'gt-materials' | 'none';
};

/** Inter's base tracking on the sheet's headings (sheet.css), the value a theme that states none keeps. */
export const BASE_HEADING_TRACKING = -0.025;

/** The alphas of the ink the derived tokens take (tokens.ts TOKENS, the sheet's values). */
const DERIVED_ALPHAS: Readonly<
  Record<
    ThemeName,
    Readonly<Record<'hair' | 'hair-soft' | 'plate' | 'cross' | 'edge' | 'thumb', number>>
  >
> = {
  light: { hair: 0.18, 'hair-soft': 0.09, plate: 0.035, cross: 0.38, edge: 0.62, thumb: 0.32 },
  dark: { hair: 0.22, 'hair-soft': 0.1, plate: 0.05, cross: 0.34, edge: 0.55, thumb: 0.32 },
};

function rgbOf(hex: string): string {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)).join(', ');
}

/** The twelve tokens of an appearance from its five colours: the lines and grounds are ink alphas. */
export function deriveTokens(
  colors: ThemeColors,
  appearance: ThemeName,
): Record<TokenName, string> {
  const ink = rgbOf(colors.ink);
  const alphas = DERIVED_ALPHAS[appearance];
  return {
    paper: colors.paper,
    ink: colors.ink,
    'ink-2': colors['ink-2'],
    titanium: colors.hint,
    hair: `rgba(${ink}, ${alphas.hair})`,
    'hair-soft': `rgba(${ink}, ${alphas['hair-soft']})`,
    plate: `rgba(${ink}, ${alphas.plate})`,
    cross: `rgba(${ink}, ${alphas.cross})`,
    edge: `rgba(${ink}, ${alphas.edge})`,
    thumb: `rgba(${ink}, ${alphas.thumb})`,
    blue: colors.accent,
    accent: colors.accent,
  };
}

/** The sheet's own colours (tokens.ts), the five stated values of General Translation and Simple. */
const SHEET_COLORS: Readonly<Record<ThemeName, ThemeColors>> = {
  light: {
    paper: TOKENS.light.paper,
    ink: TOKENS.light.ink,
    'ink-2': TOKENS.light['ink-2'],
    hint: TOKENS.light.titanium,
    accent: TOKENS.light.accent,
  },
  dark: {
    paper: TOKENS.dark.paper,
    ink: TOKENS.dark.ink,
    'ink-2': TOKENS.dark['ink-2'],
    hint: TOKENS.dark.titanium,
    accent: TOKENS.dark.accent,
  },
};

function colors(
  paper: string,
  ink: string,
  ink2: string,
  hint: string,
  accent: string,
): ThemeColors {
  return { paper, ink, 'ink-2': ink2, hint, accent };
}

type Spec = {
  name: string;
  sentence: string;
  colors?: Readonly<Record<ThemeName, ThemeColors>>;
  composition: TitleComposition;
  columnRight?: number;
  size?: number;
  accentBar?: boolean;
  titleParts?: readonly ThemePart[];
  titleColors?: Readonly<Record<ThemeName, ThemeColors>>;
  parts?: readonly ThemePart[];
  tracking?: number;
  uppercase?: boolean;
};

/** The appearance whose derived alphas suit a ground: dark under a relative luminance of 0.2. */
function groundAppearance(paper: string): ThemeName {
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => {
    const c = parseInt(paper.replace('#', '').slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2 ? 'dark' : 'light';
}

function record(id: ThemeId, spec: Spec): ThemeRecord {
  const facts = THEME_FACTS[id];
  const stated = spec.colors ?? SHEET_COLORS;
  // the sheet's own tokens byte for byte where the theme states the sheet's colours, so a
  // General Translation or Simple sheet computes exactly what sheet.css declares
  const tokens =
    spec.colors === undefined
      ? TOKENS
      : { light: deriveTokens(stated.light, 'light'), dark: deriveTokens(stated.dark, 'dark') };
  return {
    id,
    name: spec.name,
    sentence: spec.sentence,
    defaultAppearance: facts.appearance,
    colors: stated,
    tokens,
    fonts: facts.fonts,
    heading: {
      tracking: spec.tracking ?? BASE_HEADING_TRACKING,
      uppercase: spec.uppercase === true,
    },
    displayFeatures: id === GT_THEME_ID ? DISPLAY.features : DISPLAY_FEATURES_OFF,
    frame: facts.frame,
    band: {
      wordmark: facts.logo ? 'gt' : 'none',
      counter: facts.counter.show ? facts.counter.format : 'none',
    },
    title: {
      composition: spec.composition,
      columnRight: spec.columnRight ?? 0,
      size: spec.size ?? null,
      accentBar: spec.accentBar === true,
      mark: facts.logo ? 'gt' : 'none',
      parts: spec.titleParts ?? [],
      colors: spec.titleColors ?? null,
      tokens:
        spec.titleColors === undefined
          ? null
          : {
              light: deriveTokens(
                spec.titleColors.light,
                groundAppearance(spec.titleColors.light.paper),
              ),
              dark: deriveTokens(
                spec.titleColors.dark,
                groundAppearance(spec.titleColors.dark.paper),
              ),
            },
    },
    parts: spec.parts ?? [],
    pictures: facts.pictures ? 'gt-materials' : 'none',
  };
}

/** The library in the picker's order (THEME_IDS). */
export const THEME_RECORDS: ReadonlyArray<ThemeRecord> = [
  record('simple', {
    name: 'Simple',
    sentence: 'Ink on paper in Inter with nothing else on the slide.',
    composition: 'left-middle',
  }),
  record('general-translation', {
    name: 'General Translation',
    sentence:
      'The brand deck: rails, rules and crosses, the GT mark on the title slide, the wordmark, the slide counter and the four dithered pictures.',
    composition: 'left-middle',
  }),
  record('swiss', {
    name: 'Swiss',
    sentence:
      'Instrument Sans set tight on white under a heavy black rule, a red square over the title at the bottom left and a red bar over each heading.',
    colors: {
      light: colors('#ffffff', '#111111', '#45474c', '#767980', '#d7261e'),
      dark: colors('#111111', '#f4f4f2', '#bcbdc1', '#8d9097', '#ff5a4f'),
    },
    composition: 'bottom-left',
    size: 104,
    accentBar: true,
    titleParts: [
      { box: [0, 53, 1600, 6], fill: 'ink' },
      { box: [137, 129, 216, 216], fill: 'accent' },
    ],
    parts: [
      { box: [0, 53, 1600, 6], fill: 'ink' },
      { box: [0, 0, 53, 53], fill: 'accent' },
    ],
    tracking: -0.04,
  }),
  record('mint', {
    name: 'Mint',
    sentence:
      'Bricolage Grotesque over DM Sans on a pale card laid on deep green, with the green open down the right of the title slide.',
    colors: {
      light: colors('#f4faf6', '#0b2419', '#2c4a3d', '#57725f', '#0f6b48'),
      dark: colors('#0a1d16', '#e4f2eb', '#a9c6b8', '#7d9a8c', '#4cc59a'),
    },
    composition: 'left-middle',
    columnRight: 520,
    titleParts: [
      { box: [0, 0, 1600, 900], fill: 'accent' },
      { box: [40, 40, 1000, 820], fill: 'paper' },
    ],
    parts: [
      { box: [0, 0, 1600, 900], fill: 'accent' },
      { box: [40, 40, 1520, 820], fill: 'paper' },
    ],
    tracking: -0.035,
  }),
  record('coral', {
    name: 'Coral',
    sentence:
      'Fraunces over DM Sans on a warm ground, a coral field across the top of the title slide and a coral band across the top of every other slide.',
    colors: {
      light: colors('#fff3ec', '#2a130e', '#5a3830', '#93685e', '#d2482f'),
      dark: colors('#1f0f0b', '#fbe9e3', '#d6b4aa', '#a58177', '#ff7a5c'),
    },
    composition: 'bottom-left',
    size: 96,
    titleParts: [{ box: [0, 0, 1600, 405], fill: 'accent' }],
    parts: [{ box: [0, 0, 1600, 88], fill: 'accent' }],
    tracking: -0.02,
  }),
  record('night', {
    name: 'Night',
    sentence:
      'Space Grotesk on a navy ground for dark rooms, a pale moon at the right of the title slide, a quarter of one in the corner of every other slide and the slide number.',
    colors: {
      light: colors('#f2f5fa', '#0c1424', '#3b475c', '#6b778c', '#2856d0'),
      dark: colors('#0b1322', '#edf1f7', '#b4bfcf', '#7f8ca3', '#8fb8ff'),
    },
    composition: 'left-middle',
    columnRight: 440,
    titleParts: [{ box: [1070, 90, 720, 720], fill: 'tone', round: true }],
    parts: [{ box: [1460, -140, 280, 280], fill: 'tone', round: true }],
    tracking: -0.035,
  }),
  record('slate', {
    name: 'Slate',
    sentence:
      'IBM Plex Sans with a steel blue panel down the left of every slide, the title slide in the other appearance and the slide number.',
    colors: {
      light: colors('#edf0f3', '#1a1f26', '#454e59', '#6b7480', '#2f6690'),
      dark: colors('#1a1f26', '#eef1f4', '#b6bec8', '#86909c', '#79b4dd'),
    },
    composition: 'left-middle',
    titleParts: [
      { box: [0, 0, 1600, 900], fill: 'paper' },
      { box: [0, 0, 96, 900], fill: 'accent' },
    ],
    titleColors: {
      light: colors('#1a1f26', '#eef1f4', '#b6bec8', '#86909c', '#79b4dd'),
      dark: colors('#edf0f3', '#1a1f26', '#454e59', '#6b7480', '#2f6690'),
    },
    parts: [{ box: [0, 0, 96, 900], fill: 'accent' }],
    tracking: -0.02,
  }),
  record('sand', {
    name: 'Sand',
    sentence:
      'Newsreader on warm paper inside an ochre hairline frame, doubled round the title slide, with the title in the centre.',
    colors: {
      light: colors('#f5efe4', '#28231d', '#564d42', '#857a6b', '#9a5b14'),
      dark: colors('#211c16', '#f3ece0', '#cbbfae', '#9a8e7d', '#e0a458'),
    },
    composition: 'centre',
    titleParts: [
      { box: [40, 40, 1520, 820], fill: 'line' },
      { box: [52, 52, 1496, 796], fill: 'line' },
    ],
    parts: [{ box: [40, 40, 1520, 820], fill: 'line' }],
    tracking: -0.015,
  }),
  record('signal', {
    name: 'Signal',
    sentence:
      'Oswald in capitals, the title slide in black on yellow, and every other slide at the highest contrast with a yellow edge across the top and a bar over each heading, for bright rooms and projectors.',
    colors: {
      light: colors('#ffffff', '#000000', '#333333', '#6e6e6e', '#8a6d00'),
      dark: colors('#000000', '#ffffff', '#c8c8c8', '#8c8c8c', '#ffd400'),
    },
    composition: 'bottom-left',
    size: 128,
    accentBar: true,
    titleParts: [{ box: [0, 0, 1600, 900], fill: 'paper' }],
    titleColors: {
      light: colors('#ffd400', '#000000', '#2b2400', '#4d4000', '#000000'),
      dark: colors('#ffd400', '#000000', '#2b2400', '#4d4000', '#000000'),
    },
    parts: [{ box: [0, 0, 1600, 20], fill: 'accent' }],
    tracking: 0.005,
    uppercase: true,
  }),
];

const BY_ID: ReadonlyMap<ThemeId, ThemeRecord> = new Map(
  THEME_RECORDS.map((theme) => [theme.id, theme]),
);

/** The record of a stored theme id; the legacy `gt-ink-paper` is General Translation. */
export function themeRecord(stored: string | undefined): ThemeRecord {
  const found = BY_ID.get(themeIdOf(stored));
  if (found === undefined) throw new RangeError(`No theme record for ${String(stored)}`);
  return found;
}

/** The theme's name the panel, the history label and the Reset button read. */
export function themeName(stored: string | undefined): string {
  return themeRecord(stored).name;
}

/** The ids in the picker's order, the schema's list. */
export const THEME_ORDER: ReadonlyArray<ThemeId> = THEME_IDS;

/**
 * The renderer's contrast floors on a theme's ground (docs/DESIGN.md 7.2; theme-css.ts
 * readableHint): text 7 to 1, the second ink 4.5 to 1, the hint and the accent 3 to 1.
 */
export const THEME_FLOORS = { ink: 7, 'ink-2': 4.5, hint: 3, accent: 3 } as const;
