// One WCAG 2.2 contrast function for every browser path (docs/DESIGN.md 5.4): the relative
// luminance and the ratio of SC 1.4.3 and 1.4.11, with a translucent colour composited over its
// ground before it is measured. The build and the tests use colorjs.io (scripts/build-colors.ts);
// a page cannot afford it, so this file is the one copy the chrome, the renderer, the lint, the
// identity marks and the landing import, pinned to colorjs.io's contrastWCAG21 in
// contrast.test.ts over the generated pairs.

/** An sRGB colour: channels 0 to 255, alpha 0 to 1. */
export type Rgba = { r: number; g: number; b: number; a: number };

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;

/** Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()`; null for anything else. */
export function parseColor(css: string): Rgba | null {
  const text = css.trim();
  const hex = HEX.exec(text);
  if (hex) {
    let digits = hex[1] ?? '';
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
    const n = (i: number): number => parseInt(digits.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 };
  }
  const rgb = RGB.exec(text);
  if (!rgb) return null;
  const a = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] === '%' ? 100 : 1);
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a };
}

/** A colour over an opaque ground, as the browser composites it (sRGB, unrounded). */
export function composite(top: Rgba, ground: Rgba): Rgba {
  const mix = (t: number, g: number): number => t * top.a + g * (1 - top.a);
  return { r: mix(top.r, ground.r), g: mix(top.g, ground.g), b: mix(top.b, ground.b), a: 1 };
}

/** WCAG 2.2 relative luminance of an opaque sRGB colour. */
export function relativeLuminance(color: Rgba): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
}

function toRgba(color: string | Rgba): Rgba {
  if (typeof color !== 'string') return color;
  const parsed = parseColor(color);
  if (parsed === null) throw new RangeError(`not a colour: ${color}`);
  return parsed;
}

/**
 * The WCAG 2.2 contrast ratio, 1 to 21, of a colour on a ground. A translucent ground is first
 * composited over white, then a translucent colour over the ground.
 */
export function contrastRatio(color: string | Rgba, ground: string | Rgba): number {
  const g = toRgba(ground);
  const base = g.a < 1 ? composite(g, { r: 255, g: 255, b: 255, a: 1 }) : g;
  const c = toRgba(color);
  const top = c.a < 1 ? composite(c, base) : c;
  const la = relativeLuminance(top);
  const lb = relativeLuminance(base);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `#rrggbb` of an opaque colour, each channel rounded. */
export function toHex(color: Rgba): string {
  const two = (n: number): string =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${two(color.r)}${two(color.g)}${two(color.b)}`;
}
