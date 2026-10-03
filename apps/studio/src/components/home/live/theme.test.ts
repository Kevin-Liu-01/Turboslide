import { describe, expect, it } from 'vitest';

import { TOKENS } from '@turboslide/theme/tokens';

import { DERIVED_ALPHAS, KITS, kitProperties } from './theme';

/* The example kits (docs/LANDING.md 2.5; integrator.md 3, Kevin's answer 4): the derived alphas are
   the theme's, and every kit holds its text, captions and hints at 4.5:1 on its ground and the
   selection ring at 3:1 (SC 1.4.11), the WCAG formula of packages/render/src/theme-css.ts. */

const rgb = (hex: string): number[] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (hex: string): number =>
  rgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
const ratio = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
};
const alpha = (rgba: string): number => Number(rgba.match(/,\s*([\d.]+)\)$/)?.[1] ?? 'NaN');

describe('the example kits', () => {
  it('derives the alpha tokens with the theme alphas of each appearance', () => {
    for (const appearance of ['light', 'dark'] as const)
      for (const [name, a] of Object.entries(DERIVED_ALPHAS[appearance]))
        expect(
          alpha(TOKENS[appearance][name as keyof (typeof TOKENS)['light']]),
          `${appearance} ${name}`,
        ).toBe(a);
  });

  it('holds text, captions and hints at 4.5:1 and the selection ring at 3:1', () => {
    for (const kit of Object.values(KITS)) {
      expect(ratio(kit.ink, kit.paper)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(kit.ink2, kit.paper)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(kit.titanium, kit.paper)).toBeGreaterThanOrEqual(4.5);
      expect(ratio('#2f5ce0', kit.paper)).toBeGreaterThanOrEqual(3);
    }
  });

  it('sets the six roles with Primary and Accent in the text colour, so no third hue enters', () => {
    const k = kitProperties('fenwick');
    expect(k['--paper']).toBe('#0a1b38');
    expect(k['--ink']).toBe('#f4f1ea');
    expect(k['--ink-2']).toBe('#c9cbd3');
    expect(k['--titanium']).toBe('#8d97ab');
    expect(k['--blue']).toBe('#f4f1ea');
    expect(k['--accent']).toBe('#f4f1ea');
    expect(k['--hair']).toBe('rgba(244, 241, 234, 0.22)');
    expect(kitProperties('kestrel')['--hair']).toBe('rgba(31, 27, 22, 0.18)');
  });
});
