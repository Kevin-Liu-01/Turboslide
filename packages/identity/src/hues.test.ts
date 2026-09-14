import { describe, expect, test } from 'vitest';

import {
  HUES,
  HUE_GROUNDS,
  HUE_SLOTS,
  assignHueSlot,
  contrastRatio,
  hueFor,
  parseHex,
  preferredHueSlot,
  relativeLuminance,
} from './hues.ts';

// The acceptance arithmetic of research 11 section 9: every hue at 3:1 or better against the
// three solids, and every pair at 20 delta E (CIE76) or more under normal vision and under the
// Machado, Oliveira and Fernandes protanopia and deuteranopia simulations at severity 1.0
// (the matrices of their 2009 paper, applied in linear RGB).

const PROTAN = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];
const DEUTAN = [
  [0.36732, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];

function toLinear(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex);
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [lin(r), lin(g), lin(b)];
}

function simulate(rgb: [number, number, number], m: number[][]): [number, number, number] {
  const row = (i: number): number =>
    Math.min(
      1,
      Math.max(
        0,
        (m[i]?.[0] ?? 0) * rgb[0] + (m[i]?.[1] ?? 0) * rgb[1] + (m[i]?.[2] ?? 0) * rgb[2],
      ),
    );
  return [row(0), row(1), row(2)];
}

function toLab(rgb: [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('the six hues', () => {
  test('are the pinned values in the luminance band 0.1064 to 0.2622', () => {
    expect(Object.values(HUES)).toEqual([
      '#2f5ce0',
      '#789000',
      '#0f6a6a',
      '#1d8fc8',
      '#148d51',
      '#5533ff',
    ]);
    for (const slot of HUE_SLOTS) {
      const l = relativeLuminance(hueFor(slot));
      expect(l).toBeGreaterThanOrEqual(0.1064);
      expect(l).toBeLessThanOrEqual(0.2622);
    }
  });

  test('pass 3:1 against the three solids', () => {
    for (const slot of HUE_SLOTS) {
      for (const ground of HUE_GROUNDS) {
        expect(
          contrastRatio(hueFor(slot), ground),
          `${hueFor(slot)} on ${ground}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
    // The tightest pair the research names: brand blue against #070707 at 3.58.
    expect(contrastRatio('#2f5ce0', '#070707')).toBeCloseTo(3.58, 1);
    expect(contrastRatio('#070707', '#ffffff')).toBeCloseTo(20.14, 1);
  });

  test('keep 20 delta E pairwise under normal, protan and deutan vision', () => {
    const sims: Array<[string, number[][] | null]> = [
      ['normal', null],
      ['protan', PROTAN],
      ['deutan', DEUTAN],
    ];
    for (const [name, matrix] of sims) {
      let minimum = Number.POSITIVE_INFINITY;
      for (let i = 0; i < HUE_SLOTS.length; i += 1) {
        for (let j = i + 1; j < HUE_SLOTS.length; j += 1) {
          const a = toLinear(hueFor(HUE_SLOTS[i] ?? 1));
          const b = toLinear(hueFor(HUE_SLOTS[j] ?? 1));
          const sa = matrix ? simulate(a, matrix) : a;
          const sb = matrix ? simulate(b, matrix) : b;
          minimum = Math.min(minimum, deltaE(toLab(sa), toLab(sb)));
        }
      }
      expect(minimum, name).toBeGreaterThanOrEqual(20);
    }
  });

  test('hueFor refuses other slots', () => {
    expect(() => hueFor(0)).toThrow(RangeError);
    expect(() => hueFor(7)).toThrow(RangeError);
    expect(() => hueFor(1.5)).toThrow(RangeError);
  });
});

describe('assignment', () => {
  test('preferredHueSlot is deterministic and covers every slot', () => {
    const slots = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const id = `anon_${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
      const slot = preferredHueSlot(id);
      expect(slot).toBe(preferredHueSlot(id));
      slots.add(slot);
    }
    expect([...slots].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('assignHueSlot grants the preferred slot when free, else the least used lowest index', () => {
    expect(assignHueSlot(3, [])).toBe(3);
    expect(assignHueSlot(3, [1, 2])).toBe(3);
    expect(assignHueSlot(3, [3])).toBe(1);
    expect(assignHueSlot(3, [3, 1])).toBe(2);
    expect(assignHueSlot(1, [1, 2, 3, 4, 5, 6])).toBe(1);
    expect(assignHueSlot(2, [1, 1, 2, 3, 4, 5, 6])).toBe(2);
    expect(assignHueSlot(1, [1, 1, 2, 2, 3, 4, 5, 6])).toBe(3);
  });
});
