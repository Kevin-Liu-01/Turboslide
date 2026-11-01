/**
 * The nine themes of the library as the Themes screen draws them (ThemesScreen.tsx): each one's
 * name, the appearance it opens in, the title slide's composition, its accent bar, its slide
 * counter, the rules its frame draws at the top and bottom and its rails, and its five colours in
 * that appearance. A copy of packages/theme/src/themes.ts THEME_RECORDS, whose import would carry
 * the schema's validators into the landing's script; theme-tiles.test.ts holds the copy equal to
 * the records, in the picker's order.
 */
export type TileColors = {
  paper: string;
  ink: string;
  'ink-2': string;
  hint: string;
  accent: string;
};

export type ThemeTile = {
  id: string;
  name: string;
  appearance: 'light' | 'dark';
  composition: 'left-middle' | 'top-left' | 'centre' | 'bottom-left';
  accentBar: boolean;
  counter: 'n' | 'n / N' | 'none';
  rules: { top: boolean; bottom: boolean; rails: boolean };
  colors: TileColors;
};

export const THEME_TILES: readonly ThemeTile[] = [
  {
    id: 'simple',
    name: 'Simple',
    appearance: 'light',
    composition: 'left-middle',
    accentBar: false,
    counter: 'none',
    rules: { top: false, bottom: false, rails: false },
    colors: {
      paper: '#ffffff',
      ink: '#070707',
      'ink-2': '#3a3d44',
      hint: '#8a8f98',
      accent: '#2f5ce0',
    },
  },
  {
    id: 'general-translation',
    name: 'General Translation',
    appearance: 'dark',
    composition: 'left-middle',
    accentBar: false,
    counter: 'n / N',
    rules: { top: true, bottom: true, rails: true },
    colors: {
      paper: '#070707',
      ink: '#f2f2f0',
      'ink-2': '#b9bcc3',
      hint: '#8a8f98',
      accent: '#2f5ce0',
    },
  },
  {
    id: 'swiss',
    name: 'Swiss',
    appearance: 'light',
    composition: 'top-left',
    accentBar: true,
    counter: 'n',
    rules: { top: true, bottom: false, rails: false },
    colors: {
      paper: '#ffffff',
      ink: '#111111',
      'ink-2': '#45474c',
      hint: '#767980',
      accent: '#d7261e',
    },
  },
  {
    id: 'mint',
    name: 'Mint',
    appearance: 'light',
    composition: 'centre',
    accentBar: false,
    counter: 'none',
    rules: { top: false, bottom: false, rails: false },
    colors: {
      paper: '#e8f3ee',
      ink: '#0d271d',
      'ink-2': '#2f4b40',
      hint: '#5b7468',
      accent: '#11734f',
    },
  },
  {
    id: 'coral',
    name: 'Coral',
    appearance: 'light',
    composition: 'bottom-left',
    accentBar: false,
    counter: 'none',
    rules: { top: false, bottom: false, rails: false },
    colors: {
      paper: '#fff2ec',
      ink: '#2a130e',
      'ink-2': '#5a3830',
      hint: '#93685e',
      accent: '#d2482f',
    },
  },
  {
    id: 'night',
    name: 'Night',
    appearance: 'dark',
    composition: 'left-middle',
    accentBar: false,
    counter: 'n',
    rules: { top: true, bottom: true, rails: false },
    colors: {
      paper: '#0c1424',
      ink: '#edf1f7',
      'ink-2': '#b4bfcf',
      hint: '#7f8ca3',
      accent: '#7aaeff',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    appearance: 'light',
    composition: 'left-middle',
    accentBar: false,
    counter: 'n',
    rules: { top: true, bottom: true, rails: false },
    colors: {
      paper: '#edf0f3',
      ink: '#1a1f26',
      'ink-2': '#454e59',
      hint: '#6b7480',
      accent: '#2f6690',
    },
  },
  {
    id: 'sand',
    name: 'Sand',
    appearance: 'light',
    composition: 'centre',
    accentBar: false,
    counter: 'none',
    rules: { top: false, bottom: false, rails: false },
    colors: {
      paper: '#f5efe4',
      ink: '#28231d',
      'ink-2': '#564d42',
      hint: '#857a6b',
      accent: '#9a5b14',
    },
  },
  {
    id: 'signal',
    name: 'Signal',
    appearance: 'dark',
    composition: 'bottom-left',
    accentBar: true,
    counter: 'none',
    rules: { top: false, bottom: false, rails: false },
    colors: {
      paper: '#000000',
      ink: '#ffffff',
      'ink-2': '#c8c8c8',
      hint: '#8c8c8c',
      accent: '#ffd400',
    },
  },
];
