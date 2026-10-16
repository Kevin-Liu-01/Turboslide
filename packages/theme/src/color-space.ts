// The colour spaces of the free colour field (pickers/ColorField.tsx in the chrome; the Glyphfield
// port, wave 2 item 6, from Glyphfield's src/lib/color.ts): HSV for the saturation and value area
// and the hue range, OKLCH for the typed field. Every value in and out is an sRGB `#rrggbb`, the
// form a custom colour takes in a deck (schema/color.ts), lower case. A page cannot afford
// colorjs.io, so this file is the one copy the browser paths import; color-space.test.ts pins it
// to colorjs.io.
import { parseColor, toHex } from './contrast.ts';

/** Hue 0 to 360, saturation and value 0 to 1. */
export type Hsv = { h: number; s: number; v: number };

/** Lightness 0 to 1, chroma 0 and up, hue 0 to 360 (0 for a grey). */
export type Oklch = { l: number; c: number; h: number };

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const wrapHue = (h: number): number =>
  !Number.isFinite(h) ? 0 : h >= 0 && h < 360 ? h : ((h % 360) + 360) % 360;

/** The opaque sRGB channels 0 to 1 of a `#rgb` or `#rrggbb` value; null for anything else. */
function channels(hex: string): [number, number, number] | null {
  const text = hex.trim();
  if (!/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return null;
  const color = parseColor(text.startsWith('#') ? text : `#${text}`);
  return color === null ? null : [color.r / 255, color.g / 255, color.b / 255];
}

const hexOf = (r: number, g: number, b: number): string =>
  toHex({ r: clamp01(r) * 255, g: clamp01(g) * 255, b: clamp01(b) * 255, a: 1 });

/** `#abc` and `ABCDEF` as `#aabbcc` and `#abcdef`; null for anything that is not a hex colour. */
export function normalizeHex(hex: string): string | null {
  const rgb = channels(hex);
  return rgb === null ? null : hexOf(...rgb);
}

/** HSV of a hex colour; a grey reads hue 0 and saturation 0. */
export function hexToHsv(hex: string): Hsv | null {
  const rgb = channels(hex);
  if (rgb === null) return null;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: wrapHue(h), s: max === 0 ? 0 : delta / max, v: max };
}

/** The hex colour of an HSV triple; out of range values are clamped and the hue wraps. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = wrapHue(h);
  const value = clamp01(v);
  const chroma = value * clamp01(s);
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const m = value - chroma;
  return hexOf(r + m, g + m, b + m);
}

const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** OKLCH of a hex colour (Björn Ottosson's OKLab, D65 sRGB). */
export function hexToOklch(hex: string): Oklch | null {
  const rgb = channels(hex);
  if (rgb === null) return null;
  const [r, g, b] = rgb.map(linear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  return { l: L, c, h: c < 1e-4 ? 0 : wrapHue((Math.atan2(B, A) * 180) / Math.PI) };
}

/** Linear sRGB of an OKLCH colour, unclamped so the gamut can be tested. */
function oklchLinear({ l, c, h }: Oklch): [number, number, number] {
  const radians = (wrapHue(h) * Math.PI) / 180;
  const A = Math.max(0, Number.isFinite(c) ? c : 0) * Math.cos(radians);
  const B = Math.max(0, Number.isFinite(c) ? c : 0) * Math.sin(radians);
  const L = clamp01(l);
  const lc = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const mc = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const sc = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
}

const inGamut = (rgb: readonly number[]): boolean => rgb.every((n) => n >= -5e-4 && n <= 1 + 5e-4);

/**
 * The hex colour of an OKLCH colour. A colour outside sRGB keeps its lightness and hue and loses
 * chroma until it fits, so a typed value never shifts hue as clipping would.
 */
export function oklchToHex(color: Oklch): string {
  let rgb = oklchLinear(color);
  if (!inGamut(rgb)) {
    let low = 0;
    let high = Math.max(0, color.c);
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      if (inGamut(oklchLinear({ ...color, c: mid }))) low = mid;
      else high = mid;
    }
    rgb = oklchLinear({ ...color, c: low });
  }
  const [r, g, b] = rgb.map((n) => gamma(clamp01(n))) as [number, number, number];
  return hexOf(r, g, b);
}

const trim = (n: number, digits: number): string => String(Number(n.toFixed(digits)));

/**
 * `oklch(63% 0.258 29)`: lightness in whole percent, chroma to three decimals, hue in whole
 * degrees, so the widest value (`oklch(100% 0.322 359)`) fits the colour field's narrow input.
 */
export function formatOklch(hex: string): string | null {
  const color = hexToOklch(hex);
  if (color === null) return null;
  return `oklch(${Math.round(color.l * 100)}% ${trim(color.c, 3)} ${Math.round(color.h) % 360})`;
}

const OKLCH = /^(?:oklch\(\s*)?(-?[\d.]+)(%?)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)(?:deg)?\s*\)?$/i;

/**
 * Reads `oklch(62.8% 0.258 29.2)`, the same three numbers without the function, and a lightness
 * 0 to 1 without the percent sign; null for anything else.
 */
export function parseOklch(text: string): Oklch | null {
  const match = OKLCH.exec(text.trim());
  if (match === null) return null;
  const raw = Number(match[1]);
  const c = Number(match[3]);
  const h = Number(match[4]);
  if (![raw, c, h].every(Number.isFinite)) return null;
  return { l: clamp01(match[2] === '%' ? raw / 100 : raw), c: Math.max(0, c), h: wrapHue(h) };
}
