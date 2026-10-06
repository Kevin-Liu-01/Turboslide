// The chrome's colour (docs/DESIGN.md 5.2 to 5.4): the generated block of tokens.css agrees with
// colors.generated.ts, every pair of PAIRS holds its WCAG 2.2 floor in both appearances (a solved
// value with 0.05 to spare), the values the design round keeps are today's byte for byte, the
// ramps keep the seeds at step 9, and the General Translation theme's sheet keeps the deck's
// values. colorjs.io measures here; the APCA Lc of every pair is written to the test's output and
// gates nothing.
import { readFileSync } from 'node:fs';

import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';

import { RAMPS, PAIR_READINGS, TOKEN_VALUES } from './colors.generated.ts';
import { customProperties, parseCss } from './css.ts';
import {
  APPEARANCES,
  CHROME_TOKENS,
  GENERATED_END,
  GENERATED_START,
  HUES,
  PAIRS,
  SEEDS,
  SPARE,
} from './palette.ts';
import { TOKENS } from './tokens.ts';

const tokensCss = readFileSync(new URL('../../chrome/src/tokens.css', import.meta.url), 'utf8');
const block = tokensCss.slice(
  tokensCss.indexOf(GENERATED_START),
  tokensCss.indexOf(GENERATED_END) + GENERATED_END.length,
);
const rules = parseCss(block);
const declared = {
  light: customProperties(rules, ':root'),
  dark: customProperties(rules, ":root[data-theme='dark']"),
};
const overlay = {
  light: customProperties(rules, ".ts-overlay[data-theme='light']"),
  dark: customProperties(rules, ".ts-overlay[data-theme='dark']"),
};

/** The value an appearance resolves a token to: its own declaration, else :root's. */
function valueOf(appearance: 'light' | 'dark', token: string): string {
  const name = token.slice(2);
  return declared[appearance][name] ?? declared.light[name] ?? '';
}

function rgba(css: string): [number, number, number, number] {
  const color = new Color(css).to('srgb');
  const [r, g, b] = color.coords.map((v) => v ?? 0);
  return [(r ?? 0) * 255, (g ?? 0) * 255, (b ?? 0) * 255, Number(color.alpha)];
}

/** A colour over an opaque ground, composited in sRGB as the browser draws it. */
function over(top: string, ground: string): string {
  const [r, g, b, a] = rgba(top);
  const [gr, gg, gb] = rgba(ground);
  const mix = (t: number, u: number): number => Math.round(t * a + u * (1 - a));
  return new Color('srgb', [mix(r, gr) / 255, mix(g, gg) / 255, mix(b, gb) / 255]).toString({
    format: 'hex',
    collapse: false,
  });
}

describe('the generated block of tokens.css', () => {
  it('sits between the markers once, and declares every token for both appearances and the overlay', () => {
    expect(tokensCss.split(GENERATED_START)).toHaveLength(2);
    expect(tokensCss.split(GENERATED_END)).toHaveLength(2);
    for (const token of CHROME_TOKENS) {
      const name = token.name.slice(2);
      expect(declared.light[name], token.name).toBeDefined();
      expect(overlay.light[name], token.name).toBe(declared.light[name]);
      if (token.dark) {
        expect(declared.dark[name], token.name).toBeDefined();
        expect(overlay.dark[name], token.name).toBe(declared.dark[name]);
      } else expect(declared.dark[name], token.name).toBeUndefined();
    }
  });

  it('agrees with colors.generated.ts', () => {
    for (const appearance of APPEARANCES)
      for (const token of CHROME_TOKENS)
        expect(TOKEN_VALUES[appearance][token.name], `${appearance} ${token.name}`).toBe(
          valueOf(appearance, token.name),
        );
  });
});

describe('every pair at its WCAG 2.2 floor (DESIGN.md 5.3)', () => {
  const lines: string[] = [];
  for (const appearance of APPEARANCES)
    for (const pair of PAIRS) {
      it(`${appearance}: ${pair.name}`, () => {
        const top = valueOf(appearance, pair.ground.token);
        const ground = pair.ground.over
          ? over(top, valueOf(appearance, pair.ground.over))
          : over(top, '#ffffff');
        const drawn = over(valueOf(appearance, pair.text), ground);
        const ratio = Color.contrast(drawn, ground, 'WCAG21');
        const lc = Color.contrast(ground, drawn, 'APCA');
        lines.push(
          `${appearance} ${pair.name}: ${drawn} on ${ground}, ${ratio.toFixed(2)}:1 (floor ${pair.floor}), APCA Lc ${lc.toFixed(1)}`,
        );
        expect(ratio, `${drawn} on ${ground}`).toBeGreaterThanOrEqual(pair.floor);
        const reading = PAIR_READINGS.find(
          (r) => r.appearance === appearance && r.name === pair.name,
        );
        expect(reading?.drawn).toEqual([drawn, ground]);
        expect(reading?.wcag).toBeCloseTo(ratio, 1);
      });
    }
  it('writes the readings with their APCA Lc to the output', () => {
    console.log(`colour pairs (WCAG 2.2 gates, APCA reported):\n${lines.join('\n')}`);
    expect(lines.length).toBe(PAIRS.length * 2);
  });

  it('holds every solved value with 0.05 to spare after rounding to hex', () => {
    for (const appearance of APPEARANCES)
      for (const token of CHROME_TOKENS) {
        const source = appearance === 'dark' ? token.dark : token.light;
        if (source?.kind !== 'solve') continue;
        const value = valueOf(appearance, token.name);
        const paper = SEEDS[appearance].paper;
        const plate = valueOf(appearance, '--pt-plate');
        for (const ground of source.on) {
          const hex = ground === 'paper' ? paper : over(plate, paper);
          expect(
            Color.contrast(value, hex, 'WCAG21'),
            `${appearance} ${token.name} on ${ground}`,
          ).toBeGreaterThanOrEqual(source.floor + SPARE);
        }
        if (source.apca !== undefined)
          expect(Math.abs(Color.contrast(paper, value, 'APCA'))).toBeGreaterThanOrEqual(
            source.apca,
          );
      }
  });
});

describe('the values the round keeps (DESIGN.md 5.2 "unchanged")', () => {
  it('keeps the paper, the inks, the lines, the selection and the panel byte for byte', () => {
    expect(declared.light).toMatchObject({
      'pt-paper': '#ffffff',
      'pt-ink': '#070707',
      'pt-ink-2': '#3a3d44',
      'pt-disabled': '#8a8f98',
      'pt-field': 'rgba(7, 7, 7, 0.44)',
      'pt-hair': 'rgba(7, 7, 7, 0.18)',
      'pt-hair-soft': 'rgba(7, 7, 7, 0.09)',
      'pt-hair-on-ink': 'rgba(255, 255, 255, 0.26)',
      'pt-plate-on-ink': 'rgba(255, 255, 255, 0.16)',
      'pt-plate-on-ink-open': 'rgba(255, 255, 255, 0.24)',
      'pt-plate': 'rgba(7, 7, 7, 0.06)',
      'pt-cross': 'rgba(7, 7, 7, 0.38)',
      'pt-edge': 'rgba(7, 7, 7, 0.62)',
      'pt-scrim': 'rgba(7, 7, 7, 0.28)',
      'pt-panel-ink': '#101010',
      'pt-panel-text': 'rgba(255, 255, 255, 0.87)',
      'pt-status-done': '#12a37a',
      'pt-status-refused': '#e5484d',
      'pt-select': '#2f5ce0',
      'pt-select-text': '#ffffff',
      'pt-guide': '#d6336c',
    });
    expect(declared.dark).toMatchObject({
      'pt-paper': '#070707',
      'pt-ink': '#f2f2f0',
      'pt-ink-2': '#b9bcc3',
      'pt-disabled': '#6b6e73',
      'pt-field': 'rgba(242, 242, 240, 0.44)',
      'pt-hair': 'rgba(242, 242, 240, 0.22)',
      'pt-hair-soft': 'rgba(242, 242, 240, 0.1)',
      'pt-hair-on-ink': 'rgba(7, 7, 7, 0.26)',
      'pt-plate-on-ink': 'rgba(7, 7, 7, 0.16)',
      'pt-plate-on-ink-open': 'rgba(7, 7, 7, 0.24)',
      'pt-plate': 'rgba(242, 242, 240, 0.08)',
      'pt-cross': 'rgba(255, 255, 255, 0.34)',
      'pt-edge': 'rgba(242, 242, 240, 0.55)',
      'pt-status-done': '#1fbf92',
      'pt-status-open': '#f0a020',
      'pt-status-refused': '#e5484d',
      'pt-select': '#2f5ce0',
      'pt-guide': '#f0397a',
    });
  });

  it('changes only the values the table names: titanium, the light amber, the thumb, the dark scrim and the two panel texts', () => {
    expect(declared.light['pt-titanium']).toBe('#686d76');
    expect(declared.dark['pt-titanium']).toBe('#91969f');
    expect(declared.light['pt-status-open']).not.toBe('#c47d00');
    expect(declared.light['pt-thumb']).toBe('rgba(7, 7, 7, 0.44)');
    expect(declared.dark['pt-thumb']).toBe('rgba(242, 242, 240, 0.44)');
    expect(declared.dark['pt-scrim']).toBe('rgba(0, 0, 0, 0.56)');
    expect(declared.light['pt-panel-text-2']).toBe('rgba(255, 255, 255, 0.6)');
    expect(declared.light['pt-panel-dim']).toBe('rgba(255, 255, 255, 0.6)');
  });

  it("leaves the General Translation theme's sheet with the deck's values", () => {
    expect(TOKENS.light.titanium).toBe('#8a8f98');
    expect(TOKENS.dark.titanium).toBe('#8a8f98');
    expect(TOKENS.light.paper).toBe(SEEDS.light.paper);
    expect(TOKENS.dark.ink).toBe(SEEDS.dark.ink);
  });
});

describe('the ramps', () => {
  it('builds twelve steps per hue and appearance with the seed at step 9 byte for byte', () => {
    for (const appearance of APPEARANCES) {
      for (const hue of HUES) {
        const ramp = RAMPS[appearance][hue] ?? [];
        expect(ramp, `${appearance} ${hue}`).toHaveLength(12);
        expect(ramp[8]).toBe(SEEDS[appearance][hue]);
        for (const step of ramp) expect(step).toMatch(/^#[0-9a-f]{6}$/);
        /* the text steps hold their floors on the subtle ground (step 2) */
        expect(Color.contrast(ramp[10] ?? '', ramp[1] ?? '', 'WCAG21')).toBeGreaterThanOrEqual(4.5);
        expect(Color.contrast(ramp[11] ?? '', ramp[1] ?? '', 'WCAG21')).toBeGreaterThanOrEqual(11);
      }
      const neutral = RAMPS[appearance].neutral ?? [];
      expect(neutral).toHaveLength(12);
      expect(neutral[0]).toBe(SEEDS[appearance].paper);
      expect(neutral[8]).toBe(SEEDS[appearance].titanium);
      expect(neutral[9]).toBe(declared[appearance]['pt-titanium']);
      expect(neutral[10]).toBe(SEEDS[appearance].ink2);
      expect(neutral[11]).toBe(SEEDS[appearance].ink);
    }
  });
});
