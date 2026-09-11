// The sheet's colors as numbers, for the rendered rules that read pixels (contrast/both-themes,
// lines/law, layout/empty-half; SPEC 7.7). The values are the nine tokens of
// packages/theme/src/tokens.ts (TOKENS) and their composites on paper (COMPOSITE), duplicated
// here because @turboslide/lint depends on schema and render only (SPEC 3.3 item 3); a change to a
// token is made there and here together, and palette.test.ts pins the composites this file
// computes against the theme's recorded COMPOSITE values.
import type { Theme } from '@turboslide/schema/render';

export type Rgb = [number, number, number];
export type Rgba = { rgb: Rgb; alpha: number };

export const PAPER: Readonly<Record<Theme, Rgb>> = { light: [255, 255, 255], dark: [7, 7, 7] };
export const INK: Readonly<Record<Theme, Rgb>> = { light: [7, 7, 7], dark: [242, 242, 240] };
export const INK_2: Readonly<Record<Theme, Rgb>> = {
  light: [58, 61, 68],
  dark: [185, 188, 195],
};
/** The same in both themes (tokens.ts). */
export const TITANIUM: Rgb = [138, 143, 152];

export type TranslucentToken = 'hair' | 'hair-soft' | 'plate' | 'cross' | 'edge';

/** The translucent tokens, ink over paper at the theme's alpha (head:11-32). */
export const TRANSLUCENT: Readonly<Record<Theme, Readonly<Record<TranslucentToken, Rgba>>>> = {
  light: {
    hair: { rgb: [7, 7, 7], alpha: 0.18 },
    'hair-soft': { rgb: [7, 7, 7], alpha: 0.09 },
    plate: { rgb: [7, 7, 7], alpha: 0.035 },
    cross: { rgb: [7, 7, 7], alpha: 0.38 },
    edge: { rgb: [7, 7, 7], alpha: 0.62 },
  },
  dark: {
    hair: { rgb: [242, 242, 240], alpha: 0.22 },
    'hair-soft': { rgb: [242, 242, 240], alpha: 0.1 },
    plate: { rgb: [242, 242, 240], alpha: 0.05 },
    cross: { rgb: [255, 255, 255], alpha: 0.34 },
    edge: { rgb: [242, 242, 240], alpha: 0.55 },
  },
};

/** Source-over compositing of a translucent color on an opaque ground, rounded per channel (tokens.ts composite). */
export function composite(over: Rgba, ground: Rgb): Rgb {
  return [0, 1, 2].map((i) => {
    const base = ground[i] ?? 0;
    const top = over.rgb[i] ?? 0;
    return Math.round(base + (top - base) * over.alpha);
  }) as Rgb;
}

/** A token composited on the theme's paper. */
export function onPaper(theme: Theme, token: TranslucentToken): Rgb {
  return composite(TRANSLUCENT[theme][token], PAPER[theme]);
}

/** `rgb(r, g, b)`, `rgba(r, g, b, a)`, `#rrggbb` or `#rgb`; undefined for anything else. */
export function parseCssColor(value: string): Rgba | undefined {
  const v = value.trim().toLowerCase();
  const fn =
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*(?:[,/]\s*(\d*\.?\d+))?\s*\)$/.exec(
      v,
    );
  if (fn) {
    return {
      rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])].map((n) =>
        Math.max(0, Math.min(255, Math.round(n))),
      ) as Rgb,
      alpha: fn[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(fn[4]))),
    };
  }
  const hex6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(v);
  if (hex6) return { rgb: [1, 2, 3].map((i) => parseInt(hex6[i] ?? '0', 16)) as Rgb, alpha: 1 };
  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (hex3)
    return {
      rgb: [1, 2, 3].map((i) => parseInt((hex3[i] ?? '0').repeat(2), 16)) as Rgb,
      alpha: 1,
    };
  return undefined;
}

export function formatRgb(rgb: Rgb): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** The largest per-channel difference between two colors. */
export function channelDistance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** WCAG 2 relative luminance of an sRGB color. */
export function luminance(rgb: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type LineRole =
  'hair' | 'hair-soft' | 'edge' | 'ink' | 'ink-2' | 'titanium' | 'plate' | 'hair-twice';

export type LineColor = { role: LineRole; rgb: Rgb; ground: 'paper' | 'plate' };

/**
 * Every color a 1 px line drawn by the sheet's CSS can have: the three line roles (hair,
 * hair-soft, edge; SPEC 2.2 line law) composited on paper and on the plate ground, ink and ink-2
 * as states and diagram strokes, titanium as the strike-through decoration, plate as an exposed
 * ground strip, and hair over hair, which is what a seam drawn twice looks like (lint-lines.mjs).
 */
export function lineColors(theme: Theme): LineColor[] {
  const paper = PAPER[theme];
  const plate = onPaper(theme, 'plate');
  const out: LineColor[] = [];
  for (const role of ['hair', 'hair-soft', 'edge'] as const) {
    out.push({ role, rgb: composite(TRANSLUCENT[theme][role], paper), ground: 'paper' });
    out.push({ role, rgb: composite(TRANSLUCENT[theme][role], plate), ground: 'plate' });
  }
  out.push({ role: 'ink', rgb: INK[theme], ground: 'paper' });
  out.push({ role: 'ink-2', rgb: INK_2[theme], ground: 'paper' });
  out.push({ role: 'titanium', rgb: TITANIUM, ground: 'paper' });
  out.push({ role: 'plate', rgb: plate, ground: 'paper' });
  out.push({
    role: 'hair-twice',
    rgb: composite(TRANSLUCENT[theme].hair, composite(TRANSLUCENT[theme].hair, paper)),
    ground: 'paper',
  });
  return out;
}
