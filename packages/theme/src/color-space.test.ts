// color-space.ts, the free colour field's HSV and OKLCH (the Glyphfield port, wave 2 item 6),
// pinned to colorjs.io's spaces over a spread of colours, and its round trips on hex values.
import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';

import { contrastRatio } from './contrast.ts';
import {
  adjustForContrast,
  formatOklch,
  hexToHsv,
  hexToOklch,
  hsvToHex,
  normalizeHex,
  oklchToHex,
  parseOklch,
} from './color-space.ts';

/** Every 51st step of each channel, 216 colours, plus the kit colours the themes ship. */
const SPREAD: string[] = [];
for (const r of [0, 51, 102, 153, 204, 255])
  for (const g of [0, 51, 102, 153, 204, 255])
    for (const b of [0, 51, 102, 153, 204, 255])
      SPREAD.push(`#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`);
SPREAD.push('#2f5ce0', '#11734f', '#0b3d91', '#e5484d', '#f0a020', '#12a37a', '#6f747d');

describe('hexToOklch', () => {
  it('equals colorjs.io oklch within 0.0005 in lightness and chroma and 0.1 degree in hue', () => {
    for (const hex of SPREAD) {
      const ours = hexToOklch(hex);
      const [l, c, h] = new Color(hex).to('oklch').coords as [number, number, number];
      expect(ours, hex).not.toBeNull();
      expect(Math.abs((ours?.l ?? -1) - l), `${hex} lightness`).toBeLessThan(5e-4);
      expect(Math.abs((ours?.c ?? -1) - c), `${hex} chroma`).toBeLessThan(5e-4);
      if (c > 0.002) {
        const delta = Math.abs((ours?.h ?? -1) - h) % 360;
        expect(Math.min(delta, 360 - delta), `${hex} hue`).toBeLessThan(0.1);
      }
    }
  });

  it('reads a grey as hue 0 and refuses what is not a hex colour', () => {
    expect(hexToOklch('#808080')?.h).toBe(0);
    expect(hexToOklch('#808080')?.c).toBeLessThan(1e-4);
    expect(hexToOklch('red')).toBeNull();
    expect(hexToOklch('#12345')).toBeNull();
  });
});

describe('oklchToHex', () => {
  it('gives back every hex of the spread from its OKLCH', () => {
    for (const hex of SPREAD) {
      const color = hexToOklch(hex);
      if (color === null) throw new Error(hex);
      expect(oklchToHex(color), hex).toBe(hex);
    }
  });

  it('keeps lightness and hue and drops chroma for a colour outside sRGB', () => {
    /* oklch(70% 0.4 150) is far outside sRGB; colorjs.io's css4 gamut map keeps the hue too */
    const out = { l: 0.7, c: 0.4, h: 150 };
    const hex = oklchToHex(out);
    const back = hexToOklch(hex);
    expect(back?.l ?? 0).toBeCloseTo(0.7, 2);
    expect(Math.abs((back?.h ?? 0) - 150)).toBeLessThan(1.5);
    expect(back?.c ?? 1).toBeLessThan(0.4);
    const mapped = new Color('oklch', [0.7, 0.4, 150]).toGamut({ space: 'srgb' }).to('srgb');
    const theirs = mapped.toString({ format: 'hex' });
    const [ours, ref] = [new Color(hex), new Color(theirs)];
    expect(ours.deltaE(ref, '2000')).toBeLessThan(3);
  });
});

describe('hexToHsv and hsvToHex', () => {
  it('equal colorjs.io hsv on the spread and round trip every hex', () => {
    for (const hex of SPREAD) {
      const ours = hexToHsv(hex);
      const [h, s, v] = new Color(hex).to('hsv').coords as [number, number, number];
      expect(ours, hex).not.toBeNull();
      expect(ours?.s ?? -1, `${hex} saturation`).toBeCloseTo(s / 100, 6);
      expect(ours?.v ?? -1, `${hex} value`).toBeCloseTo(v / 100, 6);
      if ((ours?.s ?? 0) > 0) expect(ours?.h ?? -1, `${hex} hue`).toBeCloseTo(h, 4);
      if (ours !== null) expect(hsvToHex(ours), hex).toBe(hex);
    }
  });

  it('clamps saturation and value and wraps the hue', () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe('#0000ff');
    expect(hsvToHex({ h: 120, s: 2, v: -1 })).toBe('#000000');
    expect(hsvToHex({ h: Number.NaN, s: 0, v: 1 })).toBe('#ffffff');
  });
});

describe('the typed forms', () => {
  it('normalizes the short and upper case hex forms and refuses the rest', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('2F5CE0')).toBe('#2f5ce0');
    expect(normalizeHex(' #2f5ce0 ')).toBe('#2f5ce0');
    expect(normalizeHex('#2f5ce')).toBeNull();
    expect(normalizeHex('blue')).toBeNull();
  });

  it('formats OKLCH with whole lightness and hue, and reads that form, the bare numbers and decimals', () => {
    expect(formatOklch('#ff0000')).toBe('oklch(63% 0.258 29)');
    expect(formatOklch('#ffffff')).toBe('oklch(100% 0 0)');
    expect(formatOklch('#0b3d91')).toMatch(/^oklch\(\d{1,3}% [\d.]+ \d{1,3}\)$/);
    expect(formatOklch('nope')).toBeNull();
    expect(parseOklch('oklch(62.8% 0.258 29.2)')).toEqual({ l: 0.628, c: 0.258, h: 29.2 });
    expect(parseOklch('62.8% 0.258 29.2')).toEqual({ l: 0.628, c: 0.258, h: 29.2 });
    expect(parseOklch('oklch(0.5 0.1 400deg)')).toEqual({ l: 0.5, c: 0.1, h: 40 });
    expect(parseOklch('oklch(62.8% 0.258)')).toBeNull();
    expect(parseOklch('#ff0000')).toBeNull();
    const red = parseOklch('oklch(62.8% 0.258 29.2)');
    expect(red === null ? null : oklchToHex(red)).toBe('#ff0000');
  });
});

describe('adjustForContrast', () => {
  it('keeps a colour that already reaches the ratio, as an opaque hex', () => {
    expect(adjustForContrast('#2f5ce0', '#ffffff', 3)).toBe('#2f5ce0');
    /* a translucent ink is composited on the ground first */
    expect(adjustForContrast('rgba(0, 0, 0, 0.5)', '#ffffff', 3)).toBe('#808080');
  });

  it('darkens on a light ground and lightens on a dark one, keeping the hue, to the ratio', () => {
    for (const [color, ground, ratio] of [
      ['#a0b4ff', '#ffffff', 4.5],
      ['#a9b6c4', '#fafaf7', 3],
      ['#2f5ce0', '#0b0b0c', 4.5],
      ['#4b3a2a', '#151515', 3],
    ] as const) {
      const fixed = adjustForContrast(color, ground, ratio);
      if (fixed === null) throw new Error(color);
      const ours = contrastRatio(fixed, ground);
      expect(ours, `${color} on ${ground}`).toBeGreaterThanOrEqual(ratio);
      /* the nearest: 0.1 under the ratio more would not reach it */
      expect(ours, `${color} on ${ground}`).toBeLessThan(ratio + 0.15);
      const [before, after] = [hexToOklch(color), hexToOklch(fixed)];
      const dark = (hexToOklch(ground)?.l ?? 0) < 0.6;
      expect((after?.l ?? 0) > (before?.l ?? 0), `${color} lighter`).toBe(dark);
      if ((after?.c ?? 0) > 0.02) {
        const delta = Math.abs((after?.h ?? 0) - (before?.h ?? 0));
        expect(Math.min(delta, 360 - delta), `${color} hue`).toBeLessThan(6);
      }
    }
  });

  it('ends at black or white when no lightness reaches the ratio, and refuses a non colour', () => {
    expect(adjustForContrast('#999999', '#a0a0a0', 21)).toBe('#000000');
    expect(adjustForContrast('#777777', '#101010', 21)).toBe('#ffffff');
    expect(adjustForContrast('ink', '#ffffff', 3)).toBeNull();
  });
});
