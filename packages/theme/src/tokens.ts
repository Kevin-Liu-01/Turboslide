// The gt-ink-paper theme as data (SPEC 5.1): the tokens per theme, the four semantic hues, the
// composite hairline colors on paper computed once, the grid constants, the type ladder and the
// caps. gt-ink-paper/sheet.css is the same theme as CSS; tokens.test.ts parses the CSS and asserts
// the two agree so CSS and constants cannot drift (from design C). Sources: head:11-32 and
// 178-179 for the tokens, head:39-49 for the frame, head:58-68 for type, head:257 for the slide
// box, DECK-GRAMMAR.md:15 and 20-21 for the derived grid and the caps.
import type { ColsRatio } from '@turboslide/schema/deck';

export type ThemeName = 'light' | 'dark';

/**
 * The nine sheet tokens of DECK-GRAMMAR.md:28 plus --thumb, which the viewer's scrollbars use,
 * plus the brand kit's two key colours (docs/PRODUCT.md 4.1): --blue, GT blue, the kit's Primary
 * role (links, the key colour of charts and highlights; the schema's `blue` colour reads it), and
 * --accent, the kit's second colour, the same value until a kit sets it apart.
 */
export const TOKEN_NAMES = [
  'paper',
  'ink',
  'ink-2',
  'titanium',
  'hair',
  'hair-soft',
  'plate',
  'cross',
  'edge',
  'thumb',
  'blue',
  'accent',
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

export const TOKENS: Readonly<Record<ThemeName, Readonly<Record<TokenName, string>>>> = {
  light: {
    paper: '#ffffff',
    ink: '#070707',
    'ink-2': '#3a3d44',
    titanium: '#8a8f98',
    hair: 'rgba(7, 7, 7, 0.18)',
    'hair-soft': 'rgba(7, 7, 7, 0.09)',
    plate: 'rgba(7, 7, 7, 0.035)',
    cross: 'rgba(7, 7, 7, 0.38)',
    edge: 'rgba(7, 7, 7, 0.62)',
    thumb: 'rgba(7, 7, 7, 0.32)',
    blue: '#2f5ce0',
    accent: '#2f5ce0',
  },
  dark: {
    paper: '#070707',
    ink: '#f2f2f0',
    'ink-2': '#b9bcc3',
    titanium: '#8a8f98',
    hair: 'rgba(242, 242, 240, 0.22)',
    'hair-soft': 'rgba(242, 242, 240, 0.1)',
    plate: 'rgba(242, 242, 240, 0.05)',
    cross: 'rgba(255, 255, 255, 0.34)',
    edge: 'rgba(242, 242, 240, 0.55)',
    thumb: 'rgba(242, 242, 240, 0.32)',
    blue: '#2f5ce0',
    accent: '#2f5ce0',
  },
};

/** The four semantic icon hues, the same in both themes (DECK-GRAMMAR.md:30; head:113-116). */
export const SEMANTIC = { ok: '#12a37a', warn: '#f0a020', no: '#e5484d', info: '#2f5ce0' } as const;

/** The code panel (head:171): fixed in both themes; dark adds a hairline border. */
export const PANEL = { background: '#101010', text: 'rgba(255, 255, 255, 0.87)' } as const;

/** The swatch plates of slide 18 (head:151-154), a sanctioned fixed-color exception. */
export const SWATCH_PLATES = {
  ink: '#070707',
  raised: '#101010',
  ti: '#8a8f98',
  paper: '#ffffff',
} as const;

/** The fixed-white logo plate of slide 14 (report 03 section 11 item 13). */
export const LOGO_PLATE = { background: '#ffffff', ink: '#070707' } as const;

/**
 * The translucent tokens composited on paper, computed once (SPEC 5.1). The exporters write
 * these where a format cannot carry alpha.
 */
export const COMPOSITE: Readonly<
  Record<ThemeName, Readonly<Record<'hair' | 'hair-soft' | 'plate' | 'cross', string>>>
> = {
  light: { hair: '#d2d2d2', 'hair-soft': '#e9e9e9', plate: '#f6f6f6', cross: '#a1a1a1' },
  dark: { hair: '#3b3b3a', 'hair-soft': '#1f1f1e', plate: '#131313', cross: '#5b5b5b' },
};

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new TypeError(`Expected #rrggbb, got ${hex}`);
  return [
    parseInt(match[1] ?? '0', 16),
    parseInt(match[2] ?? '0', 16),
    parseInt(match[3] ?? '0', 16),
  ];
}

export function parseRgba(value: string): { rgb: Rgb; alpha: number } {
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (match !== null) {
    return {
      rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
      alpha: match[4] === undefined ? 1 : Number(match[4]),
    };
  }
  return { rgb: parseHex(value), alpha: 1 };
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** Source-over compositing of a translucent color on an opaque ground, rounded per channel. */
export function composite(over: string, ground: string): string {
  const top = parseRgba(over);
  const base = parseHex(ground);
  const mixed = base.map(
    (channel, i) => channel + ((top.rgb[i] ?? 0) - channel) * top.alpha,
  ) as Rgb;
  return toHex(mixed);
}

/** The composite of a translucent token on the theme's paper; equals COMPOSITE by construction. */
export function compositeOnPaper(
  theme: ThemeName,
  token: 'hair' | 'hair-soft' | 'plate' | 'cross',
): string {
  return composite(TOKENS[theme][token], TOKENS[theme].paper);
}

// ---------------------------------------------------------------------------------------------
// The grid (SPEC 2.1; report 03 section 1)

export const SHEET = { width: 1600, height: 900 } as const;
/** Rails and rules at 56 px from the sheet edges (head:39-43). */
export const RAIL = 56;
/** The slide box is inset 57 px (head:257). */
export const INSET = 57;
/** Padding of the slide box: 72 px top and bottom, 80 px left and right (head:257). */
export const PAD = [72, 80] as const;
/** The content box, 1326 by 642 at (137, 129) (DECK-GRAMMAR.md:15). */
export const CONTENT = [1326, 642] as const;
export const CONTENT_ORIGIN = [137, 129] as const;
/** The 11 by 11 registration cross centered on each junction, at 51 px offsets (head:44-49). */
export const CROSS = { size: 11, offset: 51 } as const;
/** The wordmark at left 72, bottom 18, 18 px tall; the counter at right 72, bottom 22, 13 px (head:51-52). */
export const WORDMARK = { left: 72, bottom: 18, height: 18 } as const;
export const COUNTER = { right: 72, bottom: 22, fontSize: 13 } as const;
/**
 * The brand kit's slots (docs/PRODUCT.md 4.1, 4.4): the title slide's logo box and the footer's
 * logo box the kit fits a picture into, and the inset of a slot moved to a corner (the frame's
 * cross offset plus the rail's inner margin, so a corner logo sits inside the rules).
 */
export const KIT_SLOTS = {
  mark: { w: 132, h: 84 },
  footer: { h: 18, maxW: 120 },
  cornerInset: 72,
  cornerTop: 22,
} as const;
/** The two paper chips under the wordmark and the counter on full-picture slides (SPEC 5.2). */
export const CHIPS = [
  { x: 66, y: 858, w: 40, h: 30 },
  { x: 1474, y: 856, w: 60, h: 28 },
] as const;
/** The picture on a full-picture slide sits at inset -57 under the rails (DECK-GRAMMAR.md:6). */
export const PICTURE_INSET = -57;

/** The column gap of .cols and the pixel widths of the three named ratios (report 03 section 1). */
export const COLUMN_GAP = 72;
export const COLUMNS: Readonly<Record<'5/7' | '4/8' | '1/1', readonly [number, number]>> = {
  '5/7': [522.5, 731.5],
  '4/8': [418, 836],
  '1/1': [627, 627],
};

/** The two pixel widths of a cols layout on the 1326 px content box (SPEC 5.2 slot geometry). */
export function columnWidths(ratio: ColsRatio, gap: number = COLUMN_GAP): [number, number] {
  const total = CONTENT[0] - gap;
  if (typeof ratio === 'string') {
    const [a, b] = ratio.split('/').map(Number);
    if (a === undefined || b === undefined) throw new TypeError(`Bad ratio ${ratio}`);
    const left = (total * a) / (a + b);
    return [left, total - left];
  }
  if ('left' in ratio) return [ratio.left, total - ratio.left];
  return [total - ratio.right, ratio.right];
}

// ---------------------------------------------------------------------------------------------
// Type (head:58-68, 96-107, 123-172; report 03 section 3)

export type Step = {
  size: number;
  lineHeight?: number;
  tracking?: string;
  weight?: number;
  color?: TokenName;
};

export const LADDER = {
  h1: { size: 88, lineHeight: 1.02, tracking: '-0.025em', weight: 500 },
  h2: { size: 44, lineHeight: 1.1, tracking: '-0.025em', weight: 500 },
  big: { size: 72, lineHeight: 1.06, tracking: '-0.025em', weight: 500 },
  /** the mood plate title (slide 06) */
  title: { size: 44, lineHeight: 1.08, tracking: '-0.025em', weight: 500 },
  p: { size: 22, lineHeight: 1.5, color: 'ink' },
  lead: { size: 26, lineHeight: 1.45 },
  cap: { size: 15, lineHeight: 1.45, color: 'titanium' },
  credit: { size: 15, lineHeight: 1.45, tracking: '0.01em', color: 'titanium' },
  rows: { size: 20, lineHeight: 1.45 },
  plain: { size: 24, lineHeight: 1.4, tracking: '-0.01em', weight: 500 },
  refs: { size: 20, lineHeight: 1.4 },
  scale: { size: 18, color: 'ink-2' },
  spec: { size: 58, lineHeight: 1.12, tracking: '-0.02em' },
  lang: { size: 34, lineHeight: 1.3, tracking: '-0.01em' },
  say: { size: 34, lineHeight: 1.2, tracking: '-0.015em', weight: 500 },
  swatchName: { size: 20, weight: 500 },
  swatchValue: { size: 15, color: 'titanium' },
  pairCaption: { size: 16, lineHeight: 1.45, color: 'ink-2' },
  dia: { size: 20, color: 'ink-2' },
  diaLab: { size: 26, tracking: '-0.01em', weight: 500, color: 'ink' },
  diaSm: { size: 18 },
  panel: { size: 17, lineHeight: 1.7 },
  counter: { size: 13, tracking: '0.02em', color: 'titanium' },
} as const satisfies Record<string, Step>;

export type LadderStep = keyof typeof LADDER;

/**
 * Display faces: weight 500, tracking -0.025em, balance and the cv11 and ss01 alternates
 * (head:58). The sheet reads the features through `--display-features` on its root
 * (`DISPLAY_FEATURES_TOKEN`), which holds `features` for Inter and `normal` when a brand kit sets
 * another display face (docs/FEATURES.md 3.1 item 5; packages/render theme-css.ts writes it).
 */
export const DISPLAY = { weight: 500, tracking: '-0.025em', features: "'cv11', 'ss01'" } as const;

/** The custom property the display rules read their features from. */
export const DISPLAY_FEATURES_TOKEN = 'display-features';

/** The value of `--display-features` when the display face is not Inter: no stylistic set of another family. */
export const DISPLAY_FEATURES_OFF = 'normal';

/** Display weight is capped at 500 (DECK-GRAMMAR.md:20). */
export const WEIGHT_CAP = 500;
/** Text under 15 px on the sheet is a defect (DECK-GRAMMAR.md:21). */
export const FLOOR = 15;
/** SVG labels never below 18 px (DECK-GRAMMAR.md:21). */
export const SVG_LABEL_MIN = 18;

/** The rows key column: 240 default, 180 narrow (head:97, 100); the snap set is in the schema. */
export const KEY_WIDTHS = { default: 240, narrow: 180 } as const;
/** Icon sizes: 20 in a key cell, 24 at a plain row start, 16 for the external glyph (head:111-121). */
export const ICON_SIZES = { rows: 20, plain: 24, ext: 16 } as const;
/** The dither ramp canvas height (head:162). */
export const DITHER_HEIGHT = 220;

/** Plates over full-bleed pictures (SPEC 2.1; slides 06, 60, 85). */
export const PLATES = {
  opener: { side: 'lower-left', maxWidth: 740 },
  mood: { side: 'lower-right', maxWidth: 560, titleSize: 44 },
  closing: { side: 'upper-left', maxWidth: 720 },
  padding: '22px 26px 20px',
} as const;

/** The slide cut, 140 ms behind prefers-reduced-motion (head:174-175). */
export const MOTION = { cut: 140 } as const;

/**
 * Font stacks (head:21-26), with the metric matched fallback face second in the two Inter stacks
 * (docs/FEATURES.md 3.1 item 3; inter.css declares 'Inter Fallback' as local Arial with
 * size-adjust and the overrides, so the first paint holds Inter's line boxes).
 */
export const FONTS = {
  display: "'Inter', 'Inter Fallback', 'Helvetica Neue', Arial, sans-serif",
  text: "'Inter', 'Inter Fallback', 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  cjk: "'Hiragino Sans', 'Noto Sans CJK JP', 'Noto Sans JP', 'PingFang SC', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
  arabic: "'Noto Naskh Arabic', 'Geeza Pro', 'Noto Sans Arabic', sans-serif",
  indic: "'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Devanagari Sangam MN', sans-serif",
} as const;

/** The mark symbol's viewBox and aspect (head:463; report 03 section 4.5). */
export const MARK = {
  viewBox: '-8 214 1213 771',
  aspect: 1213 / 771,
  textHeight: '0.74em',
  textWidth: '1.164em',
} as const;
