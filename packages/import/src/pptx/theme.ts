// The theme layer of the PPTX reader (gslides-parity SPEC-5 0.26, 5.1, 5.3; R04 sections 3 and 6;
// R03 4.2, 4.7): the colour scheme and the font scheme of a `ppt/theme/themeN.xml`, the master's
// `p:clrMap` (and a slide's or layout's `p:clrMapOvr`), and the one colour resolver every fill,
// line and run passes through: a scheme colour walks `tx1` to `dk1` to the theme's `sysClr`
// `lastClr`, then the modifiers apply in document order (`lumMod`, `lumOff`, `tint`, `shade`,
// `satMod`, `hueMod`, `alpha` and their kin), and the result is an sRGB hex with an alpha. `tint`
// and `shade` are applied on HSL luminance the way LibreOffice's DrawingML import does (the
// container oracle of SPEC-5 16.4): a tint of t keeps t of the luminance and adds 1 minus t of
// white, a shade of t keeps t of the luminance. `adopt` mode then snaps a colour to a palette token
// when every channel is within 12 of 255 of the token (R04 6: black to `ink`, white to `paper`,
// the two greys, the four hues); `keep` mode keeps every hex. The twelve scheme slots map onto
// Turboslide's tokens through the table of R03 4.2 for Import theme's record.
import type { Color, ColorToken, HexColor } from '@turboslide/schema/color';
import type { Document, Element } from '@xmldom/xmldom';
import { percentOf, clamp01 } from './units.ts';
import { attr, child, children, elementChildren, is, path, qualifiedName } from './xml.ts';

/** The twelve `a:clrScheme` slots in the order the theme part writes them. */
export const SCHEME_SLOTS = [
  'dk1',
  'lt1',
  'dk2',
  'lt2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hlink',
  'folHlink',
] as const;
export type SchemeSlot = (typeof SCHEME_SLOTS)[number];

/** The `p:clrMap` keys: the names a shape's `a:schemeClr val` may use beside the slots. */
export const CLR_MAP_KEYS = [
  'bg1',
  'tx1',
  'bg2',
  'tx2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hlink',
  'folHlink',
] as const;
export type ClrMapKey = (typeof CLR_MAP_KEYS)[number];

export type ClrMap = Record<ClrMapKey, SchemeSlot>;

/** PowerPoint's default mapping, what every master writes unless a designer swapped the pairs. */
export const DEFAULT_CLR_MAP: Readonly<ClrMap> = {
  bg1: 'lt1',
  tx1: 'dk1',
  bg2: 'lt2',
  tx2: 'dk2',
  accent1: 'accent1',
  accent2: 'accent2',
  accent3: 'accent3',
  accent4: 'accent4',
  accent5: 'accent5',
  accent6: 'accent6',
  hlink: 'hlink',
  folHlink: 'folHlink',
};

export type SchemeColors = Record<SchemeSlot, HexColor>;

export type Scheme = {
  /** the `a:theme name` */
  name: string;
  /** the `a:clrScheme name` */
  schemeName: string;
  colors: SchemeColors;
  /** the latin typefaces of `a:majorFont` and `a:minorFont` (`+mj-lt`, `+mn-lt`) */
  fonts: { major?: string; minor?: string };
};

/** The Office theme's values, the fallback when a slot is missing from a producer's part. */
const OFFICE_SCHEME: SchemeColors = {
  dk1: '#000000',
  lt1: '#ffffff',
  dk2: '#1f497d',
  lt2: '#eeece1',
  accent1: '#4f81bd',
  accent2: '#c0504d',
  accent3: '#9bbb59',
  accent4: '#8064a2',
  accent5: '#4bacc6',
  accent6: '#f79646',
  hlink: '#0000ff',
  folHlink: '#800080',
};

export type Rgb = [number, number, number];

export type ResolvedColor = { hex: HexColor; alpha: number };

function isSchemeSlot(value: string): value is SchemeSlot {
  return (SCHEME_SLOTS as readonly string[]).includes(value);
}

function isClrMapKey(value: string): value is ClrMapKey {
  return (CLR_MAP_KEYS as readonly string[]).includes(value);
}

/** `RRGGBB` or `#RRGGBB` in any case as `#rrggbb`; undefined when malformed. */
export function normalizeHex(value: string | undefined): HexColor | undefined {
  if (value === undefined) return undefined;
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  return match === null ? undefined : (`#${(match[1] ?? '').toLowerCase()}` as HexColor);
}

export function hexToRgb(hex: HexColor): Rgb {
  const h = hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(rgb: Rgb): HexColor {
  return `#${rgb
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}` as HexColor;
}

type Hsl = [number, number, number];

function rgbToHsl([r8, g8, b8]: Rgb): Hsl {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

/** scRGB (linear) channel to sRGB 0 to 255. */
function linearToSrgb(linear: number): number {
  const v = clamp01(linear);
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return s * 255;
}

/** The `ST_PresetColorVal` names the reader knows (the CSS names DrawingML borrowed). */
const PRESET_COLORS: Readonly<Record<string, HexColor>> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  navy: '#000080',
  olive: '#808000',
  purple: '#800080',
  teal: '#008080',
  orange: '#ffa500',
  lime: '#00ff00',
  aqua: '#00ffff',
  fuchsia: '#ff00ff',
  darkGray: '#a9a9a9',
  darkGrey: '#a9a9a9',
  lightGray: '#d3d3d3',
  lightGrey: '#d3d3d3',
  dimGray: '#696969',
  dimGrey: '#696969',
  darkBlue: '#00008b',
  darkGreen: '#006400',
  darkRed: '#8b0000',
  gold: '#ffd700',
  brown: '#a52a2a',
  pink: '#ffc0cb',
  violet: '#ee82ee',
  indigo: '#4b0082',
  crimson: '#dc143c',
  coral: '#ff7f50',
  salmon: '#fa8072',
  tomato: '#ff6347',
  khaki: '#f0e68c',
  ivory: '#fffff0',
  beige: '#f5f5dc',
  tan: '#d2b48c',
  turquoise: '#40e0d0',
  royalBlue: '#4169e1',
  steelBlue: '#4682b4',
  skyBlue: '#87ceeb',
  slateGray: '#708090',
  slateGrey: '#708090',
  forestGreen: '#228b22',
  seaGreen: '#2e8b57',
  chocolate: '#d2691e',
  firebrick: '#b22222',
  lavender: '#e6e6fa',
  plum: '#dda0dd',
  orchid: '#da70d6',
  wheat: '#f5deb3',
};

/** Reads `a:clrScheme` and `a:fontScheme` of a theme part (R04 3). Missing slots take the Office theme's values. */
export function readScheme(theme: Document): Scheme {
  const root = theme.documentElement;
  const colors: SchemeColors = { ...OFFICE_SCHEME };
  const fonts: Scheme['fonts'] = {};
  let name = '';
  let schemeName = '';
  if (root !== null) {
    name = attr(root, 'name') ?? '';
    const elements = child(root, 'a', 'themeElements');
    const clrScheme = elements && child(elements, 'a', 'clrScheme');
    if (clrScheme !== undefined) {
      schemeName = attr(clrScheme, 'name') ?? '';
      for (const slot of elementChildren(clrScheme)) {
        const local = slot.localName ?? '';
        if (!isSchemeSlot(local)) continue;
        const value = elementChildren(slot)[0];
        const hex = value === undefined ? undefined : literalColor(value);
        if (hex !== undefined) colors[local] = hex;
      }
    }
    const fontScheme = elements && child(elements, 'a', 'fontScheme');
    if (fontScheme !== undefined) {
      const major = path(fontScheme, ['a', 'majorFont'], ['a', 'latin']);
      const minor = path(fontScheme, ['a', 'minorFont'], ['a', 'latin']);
      const majorFace = major && attr(major, 'typeface');
      const minorFace = minor && attr(minor, 'typeface');
      if (majorFace !== undefined && majorFace !== '') fonts.major = majorFace;
      if (minorFace !== undefined && minorFace !== '') fonts.minor = minorFace;
    }
  }
  return { name, schemeName, colors, fonts };
}

/** The literal hex of an `a:srgbClr`, `a:sysClr` (its `lastClr`), `a:prstClr`, `a:scrgbClr` or `a:hslClr`; undefined for a scheme reference. */
function literalColor(el: Element): HexColor | undefined {
  if (is(el, 'a', 'srgbClr')) return normalizeHex(attr(el, 'val'));
  if (is(el, 'a', 'sysClr')) return normalizeHex(attr(el, 'lastClr')) ?? '#000000';
  if (is(el, 'a', 'prstClr')) return PRESET_COLORS[attr(el, 'val') ?? ''];
  if (is(el, 'a', 'scrgbClr')) {
    const r = percentOf(attr(el, 'r')) ?? 0;
    const g = percentOf(attr(el, 'g')) ?? 0;
    const b = percentOf(attr(el, 'b')) ?? 0;
    return rgbToHex([linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)]);
  }
  if (is(el, 'a', 'hslClr')) {
    const hue = (Number(attr(el, 'hue') ?? 0) / 60_000) % 360;
    const sat = percentOf(attr(el, 'sat')) ?? 0;
    const lum = percentOf(attr(el, 'lum')) ?? 0;
    return rgbToHex(hslToRgb([hue, clamp01(sat), clamp01(lum)]));
  }
  return undefined;
}

/** The master's `p:clrMap` (R04 3); the default mapping for a missing attribute. */
export function readClrMap(master: Document | Element): ClrMap {
  const root = 'documentElement' in master ? master.documentElement : master;
  const map: ClrMap = { ...DEFAULT_CLR_MAP };
  const clrMap = root === null ? undefined : child(root, 'p', 'clrMap');
  if (clrMap === undefined) return map;
  for (const key of CLR_MAP_KEYS) {
    const value = attr(clrMap, key);
    if (value !== undefined && isSchemeSlot(value)) map[key] = value;
  }
  return map;
}

/**
 * A slide's or layout's `p:clrMapOvr`: `a:masterClrMapping` keeps the inherited map,
 * `a:overrideClrMapping` replaces the attributes it names.
 */
export function clrMapOverride(part: Document | Element, inherited: ClrMap): ClrMap {
  const root = 'documentElement' in part ? part.documentElement : part;
  const ovr = root === null ? undefined : child(root, 'p', 'clrMapOvr');
  const override = ovr && child(ovr, 'a', 'overrideClrMapping');
  if (override === undefined) return inherited;
  const map: ClrMap = { ...inherited };
  for (const key of CLR_MAP_KEYS) {
    const value = attr(override, key);
    if (value !== undefined && isSchemeSlot(value)) map[key] = value;
  }
  return map;
}

export type ColorContext = {
  scheme: Scheme;
  clrMap: ClrMap;
  /** the style matrix's placeholder colour (`a:schemeClr val="phClr"`), when a caller has one */
  phClr?: HexColor;
};

/** The base colour of a colour element before its modifiers: a scheme reference through the map, else its literal. */
export function baseColor(el: Element, ctx: ColorContext): HexColor | undefined {
  if (is(el, 'a', 'schemeClr')) {
    const val = attr(el, 'val') ?? '';
    if (val === 'phClr') return ctx.phClr;
    if (isSchemeSlot(val)) return ctx.scheme.colors[val];
    if (isClrMapKey(val)) return ctx.scheme.colors[ctx.clrMap[val]];
    return undefined;
  }
  return literalColor(el);
}

const COLOR_ELEMENTS = new Set(['srgbClr', 'sysClr', 'schemeClr', 'prstClr', 'scrgbClr', 'hslClr']);

/** True for one of the six DrawingML colour elements. */
export function isColorElement(el: Element): boolean {
  return (
    el.namespaceURI === 'http://schemas.openxmlformats.org/drawingml/2006/main' &&
    COLOR_ELEMENTS.has(el.localName ?? '')
  );
}

/**
 * Resolves a colour element with its modifier children in document order (R04 6). Undefined when
 * the base cannot be read (an unknown preset name, a `phClr` without a context).
 */
export function resolveColor(el: Element, ctx: ColorContext): ResolvedColor | undefined {
  const base = baseColor(el, ctx);
  if (base === undefined) return undefined;
  let rgb = hexToRgb(base);
  let alpha = 1;
  for (const mod of elementChildren(el)) {
    if (mod.namespaceURI !== 'http://schemas.openxmlformats.org/drawingml/2006/main') continue;
    const val = percentOf(attr(mod, 'val'));
    switch (mod.localName) {
      case 'alpha':
        if (val !== undefined) alpha = clamp01(val);
        break;
      case 'alphaMod':
        if (val !== undefined) alpha = clamp01(alpha * val);
        break;
      case 'alphaOff':
        if (val !== undefined) alpha = clamp01(alpha + val);
        break;
      case 'tint': {
        if (val === undefined) break;
        const [h, s, l] = rgbToHsl(rgb);
        rgb = hslToRgb([h, s, clamp01(l * val + (1 - val))]);
        break;
      }
      case 'shade': {
        if (val === undefined) break;
        const [h, s, l] = rgbToHsl(rgb);
        rgb = hslToRgb([h, s, clamp01(l * val)]);
        break;
      }
      case 'lumMod': {
        if (val === undefined) break;
        const [h, s, l] = rgbToHsl(rgb);
        rgb = hslToRgb([h, s, clamp01(l * val)]);
        break;
      }
      case 'lumOff': {
        if (val === undefined) break;
        const [h, s, l] = rgbToHsl(rgb);
        rgb = hslToRgb([h, s, clamp01(l + val)]);
        break;
      }
      case 'satMod': {
        if (val === undefined) break;
        const [h, s, l] = rgbToHsl(rgb);
        rgb = hslToRgb([h, clamp01(s * val), l]);
        break;
      }
      case 'satOff': {
        if (val === undefined) break;
        const [h, s, l] = rgbToHsl(rgb);
        rgb = hslToRgb([h, clamp01(s + val), l]);
        break;
      }
      case 'hueMod': {
        if (val === undefined) break;
        const [h, s, l] = rgbToHsl(rgb);
        rgb = hslToRgb([h * val, s, l]);
        break;
      }
      case 'hueOff': {
        const off = Number(attr(mod, 'val') ?? 0) / 60_000;
        const [h, s, l] = rgbToHsl(rgb);
        rgb = hslToRgb([h + off, s, l]);
        break;
      }
      case 'gray': {
        const y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
        rgb = [y, y, y];
        break;
      }
      case 'inv':
        rgb = [255 - rgb[0], 255 - rgb[1], 255 - rgb[2]];
        break;
      case 'comp': {
        const [h, s, l] = rgbToHsl(rgb);
        rgb = hslToRgb([h + 180, s, l]);
        break;
      }
      default:
        // gamma, invGamma and the per channel modifiers are rare in decks and left as written
        break;
    }
  }
  return { hex: rgbToHex(rgb), alpha };
}

export type FillReading =
  | { kind: 'solid'; color: ResolvedColor }
  | { kind: 'none' }
  /** the first stop of a gradient, reported as substituted by the caller */
  | { kind: 'gradient'; color: ResolvedColor | undefined; stops: number }
  /** the foreground colour of a pattern fill */
  | { kind: 'pattern'; color: ResolvedColor | undefined; preset: string }
  | { kind: 'picture' }
  /** `a:grpFill`: the group's fill */
  | { kind: 'group' }
  | { kind: 'unknown'; element: string };

/**
 * The fill child of a properties element (`p:spPr`, `a:rPr`, `a:tcPr`, `p:bgPr`) read as a
 * colour (R04 5.3, 5.10): a solid fill resolves, a gradient gives its first stop, a pattern its
 * foreground, a picture and a group fill name themselves; undefined when the element has no fill
 * child (the fill is inherited or the default).
 */
export function readFill(parent: Element, ctx: ColorContext): FillReading | undefined {
  for (const node of elementChildren(parent)) {
    if (is(node, 'a', 'noFill')) return { kind: 'none' };
    if (is(node, 'a', 'solidFill')) {
      const colorEl = elementChildren(node).find(isColorElement);
      const color = colorEl && resolveColor(colorEl, ctx);
      return color === undefined
        ? { kind: 'unknown', element: 'a:solidFill' }
        : { kind: 'solid', color };
    }
    if (is(node, 'a', 'gradFill')) {
      const list = child(node, 'a', 'gsLst');
      const stops = list === undefined ? [] : children(list, 'a', 'gs');
      const first = stops
        .map((gs) => ({ pos: percentOf(attr(gs, 'pos')) ?? 0, el: gs }))
        .sort((a, b) => a.pos - b.pos)[0];
      const colorEl = first && elementChildren(first.el).find(isColorElement);
      return {
        kind: 'gradient',
        color: colorEl && resolveColor(colorEl, ctx),
        stops: stops.length,
      };
    }
    if (is(node, 'a', 'pattFill')) {
      const fg = child(node, 'a', 'fgClr');
      const colorEl = fg && elementChildren(fg).find(isColorElement);
      return {
        kind: 'pattern',
        color: colorEl && resolveColor(colorEl, ctx),
        preset: attr(node, 'prst') ?? '',
      };
    }
    if (is(node, 'a', 'blipFill')) return { kind: 'picture' };
    if (is(node, 'a', 'grpFill')) return { kind: 'group' };
    if (node.localName?.endsWith('Fill') === true)
      return { kind: 'unknown', element: qualifiedName(node) };
  }
  return undefined;
}

/** The tokens `adopt` mode snaps to, with the light theme's values (R04 6). */
export const SNAP_TOKENS: readonly { token: ColorToken; hex: HexColor }[] = [
  { token: 'ink', hex: '#070707' },
  { token: 'paper', hex: '#ffffff' },
  { token: 'ink-2', hex: '#3a3d44' },
  { token: 'titanium', hex: '#8a8f98' },
  { token: 'green', hex: '#12a37a' },
  { token: 'amber', hex: '#f0a020' },
  { token: 'red', hex: '#e5484d' },
  { token: 'blue', hex: '#2f5ce0' },
];

/** The largest channel difference under which `adopt` snaps (R04 6). */
export const SNAP_THRESHOLD = 12;

/** The greatest channel difference between two colours, 0 to 255. */
export function channelDistance(a: HexColor, b: HexColor): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return Math.max(Math.abs(ra[0] - rb[0]), Math.abs(ra[1] - rb[1]), Math.abs(ra[2] - rb[2]));
}

export type ThemeMode = 'adopt' | 'keep';

/**
 * The document colour for a resolved hex (R04 6): under `adopt` the nearest token within the
 * threshold, else the hex; under `keep` always the hex.
 */
export function snapColor(hex: HexColor, mode: ThemeMode): Color {
  if (mode === 'keep') return hex;
  let best: { token: ColorToken; distance: number } | undefined;
  for (const entry of SNAP_TOKENS) {
    const distance = channelDistance(hex, entry.hex);
    if (distance <= SNAP_THRESHOLD && (best === undefined || distance < best.distance)) {
      best = { token: entry.token, distance };
    }
  }
  return best === undefined ? hex : best.token;
}

/** Source over composite of a translucent colour on an opaque ground (the export's `compositeHex`). */
export function compositeOn(over: ResolvedColor, groundHex: HexColor): HexColor {
  const top = hexToRgb(over.hex);
  const base = hexToRgb(groundHex);
  return rgbToHex([
    base[0] + (top[0] - base[0]) * over.alpha,
    base[1] + (top[1] - base[1]) * over.alpha,
    base[2] + (top[2] - base[2]) * over.alpha,
  ]);
}

/**
 * The scheme slots onto the theme record's colour keys (R03 4.2 in reverse; SPEC-5 5.3): the
 * eleven keys of `THEME_COLOR_SLOTS` (`@turboslide/schema/validate/theme`): the four text and
 * background slots, the six accents (`ok`, `warn`, `no`, `info`, `titanium`, `raised`) and the
 * link. `folHlink` has no key on the record and is left out (the day 1 `link-followed` key was a
 * slot the theme validator does not know; corrected on day 5).
 */
export const SCHEME_RECORD_KEYS: Readonly<Partial<Record<SchemeSlot, string>>> = {
  dk1: 'ink',
  lt1: 'paper',
  dk2: 'ink-2',
  lt2: 'plate',
  accent1: 'ok',
  accent2: 'warn',
  accent3: 'no',
  accent4: 'info',
  accent5: 'titanium',
  accent6: 'raised',
  hlink: 'link',
};

/** A scheme as the `colors` of a `ThemeRecord` (SPEC-5 5.3), the eleven keys the theme validator admits. */
export function themeRecordColors(scheme: Scheme): Record<string, HexColor> {
  const out: Record<string, HexColor> = {};
  for (const slot of SCHEME_SLOTS) {
    const key = SCHEME_RECORD_KEYS[slot];
    if (key !== undefined) out[key] = scheme.colors[slot];
  }
  return out;
}

/** The typeface behind a `+mj-lt` or `+mn-lt` reference, else the name as written. */
export function resolveTypeface(typeface: string, scheme: Scheme): string {
  if (typeface === '+mj-lt' || typeface === '+mj-ea' || typeface === '+mj-cs')
    return scheme.fonts.major ?? typeface;
  if (typeface === '+mn-lt' || typeface === '+mn-ea' || typeface === '+mn-cs')
    return scheme.fonts.minor ?? typeface;
  return typeface;
}
