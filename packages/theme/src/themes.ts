// The theme library as data (docs/DESIGN.md 7.2): nine themes in Inter, each with a light and a
// dark appearance. A record holds the theme's name, the sentence its picker tile shows, the twelve
// sheet tokens per appearance, the display features, the frame, the band, the title slide's
// composition and the starter pictures. The structure (the default appearance, the counter, the
// logo, the frame, the pictures) is the schema's table (`THEME_FACTS` in
// @turboslide/schema/brand), so the deck readers and these records cannot disagree; the colours
// and the composition live here. The renderer reads a record under the deck's brand kit
// (packages/render/src/theme-css.ts); General Translation's record is the sheet itself
// (`TOKENS`, sheet.css), so a General Translation deck without a kit emits no override at all.
// Simple's colours are the sheet's too, so a deck from Blank keeps every colour. Browser safe.
import type { CounterFormat, ThemeFrame, ThemeId } from '@turboslide/schema/brand';
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
  /** `--display-features`: General Translation's cv11 and ss01, Inter's defaults elsewhere */
  displayFeatures: string;
  frame: ThemeFrame;
  band: { wordmark: 'gt' | 'none'; counter: CounterFormat | 'none' };
  title: { composition: TitleComposition; accentBar: boolean; mark: 'gt' | 'none' };
  pictures: 'gt-materials' | 'none';
};

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
  accentBar?: boolean;
};

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
    displayFeatures: id === GT_THEME_ID ? DISPLAY.features : DISPLAY_FEATURES_OFF,
    frame: facts.frame,
    band: {
      wordmark: facts.logo ? 'gt' : 'none',
      counter: facts.counter.show ? facts.counter.format : 'none',
    },
    title: {
      composition: spec.composition,
      accentBar: spec.accentBar === true,
      mark: facts.logo ? 'gt' : 'none',
    },
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
      'A red bar over each heading, the title at the top left, one rule across the top and the slide number.',
    colors: {
      light: colors('#ffffff', '#111111', '#45474c', '#767980', '#d7261e'),
      dark: colors('#111111', '#f4f4f2', '#bcbdc1', '#8d9097', '#ff5a4f'),
    },
    composition: 'top-left',
    accentBar: true,
  }),
  record('mint', {
    name: 'Mint',
    sentence: 'A mint ground with deep green ink and the title in the centre.',
    colors: {
      light: colors('#e8f3ee', '#0d271d', '#2f4b40', '#5b7468', '#11734f'),
      dark: colors('#0b1f18', '#e4f2eb', '#a9c6b8', '#7d9a8c', '#4cc59a'),
    },
    composition: 'centre',
  }),
  record('coral', {
    name: 'Coral',
    sentence: 'A warm ground with coral as the accent and the title at the bottom left.',
    colors: {
      light: colors('#fff2ec', '#2a130e', '#5a3830', '#93685e', '#d2482f'),
      dark: colors('#1f0f0b', '#fbe9e3', '#d6b4aa', '#a58177', '#ff7a5c'),
    },
    composition: 'bottom-left',
  }),
  record('night', {
    name: 'Night',
    sentence:
      'A navy ground for dark rooms, with rules at the top and bottom and the slide number.',
    colors: {
      light: colors('#f2f5fa', '#0c1424', '#3b475c', '#6b778c', '#2856d0'),
      dark: colors('#0c1424', '#edf1f7', '#b4bfcf', '#7f8ca3', '#7aaeff'),
    },
    composition: 'left-middle',
  }),
  record('slate', {
    name: 'Slate',
    sentence:
      'A cool grey ground with a steel blue accent, rules at the top and bottom and the slide number.',
    colors: {
      light: colors('#edf0f3', '#1a1f26', '#454e59', '#6b7480', '#2f6690'),
      dark: colors('#1a1f26', '#eef1f4', '#b6bec8', '#86909c', '#79b4dd'),
    },
    composition: 'left-middle',
  }),
  record('sand', {
    name: 'Sand',
    sentence: 'A warm paper ground with ochre as the accent and the title in the centre.',
    colors: {
      light: colors('#f5efe4', '#28231d', '#564d42', '#857a6b', '#9a5b14'),
      dark: colors('#211c16', '#f3ece0', '#cbbfae', '#9a8e7d', '#e0a458'),
    },
    composition: 'centre',
  }),
  record('signal', {
    name: 'Signal',
    sentence:
      'Black and white at the highest contrast with a yellow bar over each heading, for bright rooms and projectors.',
    colors: {
      light: colors('#ffffff', '#000000', '#333333', '#6e6e6e', '#8a6d00'),
      dark: colors('#000000', '#ffffff', '#c8c8c8', '#8c8c8c', '#ffd400'),
    },
    composition: 'bottom-left',
    accentBar: true,
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
