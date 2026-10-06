// The colour build of the design round (docs/DESIGN.md 5.4, decision C10): colorjs.io 0.7.1 runs
// over packages/theme/src/palette.ts and writes the chrome's colour tokens, the block of
// packages/chrome/src/tokens.css between `/* colors:generated:start */` and
// `/* colors:generated:end */` (sRGB hex or rgba(), each with its OKLCH value in a comment, for
// `:root`, `.ts-overlay[data-theme='light']` and the two dark selectors), and
// packages/theme/src/colors.generated.ts (the twelve step ramps of every hue per appearance, the
// token values and every pair's WCAG 2.2 ratio and APCA Lc, as data for the lint, the export and
// the identity marks). colorjs.io is a devDependency: 0 B of it reaches a page. Run from the
// repository root with Node 24 (type stripping):
//
//   node scripts/build-colors.ts           writes both files
//   node scripts/build-colors.ts --check   exits 1 when either differs from a fresh run (the
//                                          generated files step of scripts/check.mjs)
//
// A solved value is the first OKLCH lightness from its seed, walking toward the far end at the
// seed's chroma and hue in steps of SOLVE_STEP, whose sRGB hex (gamut mapped by the CSS Color 4
// method) holds its floor plus SPARE on every ground it names (DESIGN.md 5.3).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Color from 'colorjs.io';
import { format, resolveConfig } from 'prettier';

import {
  APPEARANCES,
  APPEARANCE_SELECTORS,
  CHROMA_TAPER,
  CHROME_TOKENS,
  GENERATED_END,
  GENERATED_START,
  HUES,
  HUE_LIGHTNESS,
  NEUTRAL_LIGHTNESS,
  PAIRS,
  SEEDS,
  SOLID_HOVER_STEP,
  SOLVE_STEP,
  SPARE,
} from '../packages/theme/src/palette.ts';
import type {
  Appearance,
  Base,
  ChromeToken,
  PairGround,
  SolveGround,
  TokenSource,
} from '../packages/theme/src/palette.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_CSS = join(ROOT, 'packages/chrome/src/tokens.css');
const GENERATED_TS = join(ROOT, 'packages/theme/src/colors.generated.ts');
const COLORJS_VERSION = (
  JSON.parse(readFileSync(join(ROOT, 'node_modules/colorjs.io/package.json'), 'utf8')) as {
    version: string;
  }
).version;

type Rgb = [number, number, number];

/** The sRGB hex of an OKLCH colour, gamut mapped by the CSS Color 4 method. */
function hexOfOklch(l: number, c: number, h: number): string {
  return new Color('oklch', [l, c, h])
    .toGamut({ space: 'srgb', method: 'css' })
    .to('srgb')
    .toString({ format: 'hex', collapse: false });
}

function oklchOf(hex: string): [number, number, number] {
  /* an achromatic colour has no hue (null or NaN in colorjs.io): read as 0 */
  const [l, c, h] = new Color(hex).to('oklch').coords;
  const n = (v: number | null): number => (v === null || Number.isNaN(v) ? 0 : v);
  return [n(l), n(c), n(h)];
}

function rgbOf(hex: string): Rgb {
  const n = (i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return [n(0), n(1), n(2)];
}

function hexOfRgb(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** A colour at an alpha over an opaque ground, as the browser composites it. */
function over(top: Rgb, alpha: number, ground: Rgb): string {
  return hexOfRgb(top.map((t, i) => t * alpha + (ground[i] ?? 0) * (1 - alpha)));
}

const wcag = (a: string, b: string): number => Color.contrast(a, b, 'WCAG21');
/** APCA Lc of text on a ground (colorjs.io takes the ground first). */
const apca = (text: string, ground: string): number => Color.contrast(ground, text, 'APCA');

/** The resolved value of a token: its CSS text and the opaque colour it draws on its paper. */
type Resolved = { css: string; rgb: Rgb; alpha: number; oklch: string };

function oklchText(hex: string, alpha = 1): string {
  const [l, c, h] = oklchOf(hex);
  const hue = c < 0.0005 ? 0 : h;
  const tail = alpha < 1 ? ` / ${alpha}` : '';
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${hue.toFixed(1)}${tail})`;
}

function baseRgb(base: Base, appearance: Appearance): Rgb {
  if (base === 'white') return [255, 255, 255];
  if (base === 'black') return [0, 0, 0];
  return rgbOf(SEEDS[appearance][base]);
}

/** The opaque hex a ground draws in an appearance: the paper, or the plate over the paper. */
function groundHex(
  ground: SolveGround,
  appearance: Appearance,
  values: Map<string, Resolved>,
): string {
  const paper = SEEDS[appearance].paper;
  if (ground === 'paper') return paper;
  const plate = values.get('--pt-plate');
  if (!plate) throw new Error('the hover ground needs --pt-plate before the solved tokens');
  return over(plate.rgb, plate.alpha, rgbOf(paper));
}

function solve(
  source: Extract<TokenSource, { kind: 'solve' }>,
  appearance: Appearance,
  values: Map<string, Resolved>,
): string {
  const [l0, c, h] = oklchOf(SEEDS[appearance][source.seed]);
  const grounds = source.on.map((g) => groundHex(g, appearance, values));
  const paper = SEEDS[appearance].paper;
  const step = source.direction === 'darker' ? -SOLVE_STEP : SOLVE_STEP;
  for (let l = l0; l >= 0 && l <= 1; l += step) {
    const hex = hexOfOklch(l, c, h);
    const holds = grounds.every((g) => wcag(hex, g) >= source.floor + SPARE);
    const lc = source.apca === undefined || Math.abs(apca(hex, paper)) >= source.apca;
    if (holds && lc) return hex;
  }
  throw new Error(`no ${source.direction} value of ${source.seed} holds ${source.floor}:1`);
}

function resolve(
  token: ChromeToken,
  source: TokenSource,
  appearance: Appearance,
  values: Map<string, Resolved>,
): Resolved {
  if (source.kind === 'alpha') {
    const rgb = baseRgb(source.base, appearance);
    return {
      css: `rgba(${rgb.join(', ')}, ${source.alpha})`,
      rgb,
      alpha: source.alpha,
      oklch: oklchText(hexOfRgb(rgb), source.alpha),
    };
  }
  const hex =
    source.kind === 'seed'
      ? SEEDS[appearance][source.seed]
      : source.kind === 'hex'
        ? source.value
        : solve(source, appearance, values);
  if (!/^#[0-9a-f]{6}$/.test(hex)) throw new Error(`${token.name}: ${hex} is not #rrggbb`);
  return { css: hex, rgb: rgbOf(hex), alpha: 1, oklch: oklchText(hex) };
}

/** Every token's value in an appearance; a token with no dark source keeps its light value. */
function resolveAll(appearance: Appearance): Map<string, Resolved> {
  const values = new Map<string, Resolved>();
  /* the plate first: the hover ground the solved tokens are measured on */
  const order = [...CHROME_TOKENS].sort(
    (a, b) => Number(b.name === '--pt-plate') - Number(a.name === '--pt-plate'),
  );
  for (const token of order) {
    const own = appearance === 'light' || token.dark !== undefined;
    const source = appearance === 'dark' && token.dark !== undefined ? token.dark : token.light;
    values.set(token.name, resolve(token, source, own ? appearance : 'light', values));
  }
  return values;
}

/** The opaque hex of a pair's ground in an appearance. */
function pairGroundHex(ground: PairGround, values: Map<string, Resolved>): string {
  const top = values.get(ground.token);
  if (!top) throw new Error(`unknown ground ${ground.token}`);
  if (!ground.over) return top.alpha < 1 ? over(top.rgb, top.alpha, [255, 255, 255]) : top.css;
  const under = values.get(ground.over);
  if (!under || under.alpha < 1) throw new Error(`${ground.over} is not an opaque ground`);
  return over(top.rgb, top.alpha, under.rgb);
}

export type PairReading = {
  name: string;
  appearance: Appearance;
  text: string;
  ground: string;
  /** the opaque colours measured, the text composited over the ground */
  drawn: [string, string];
  floor: number;
  wcag: number;
  apca: number;
};

function readPairs(appearance: Appearance, values: Map<string, Resolved>): PairReading[] {
  return PAIRS.filter((pair) => !pair.appearances || pair.appearances.includes(appearance)).map(
    (pair) => {
      const ground = pairGroundHex(pair.ground, values);
      const text = values.get(pair.text);
      if (!text) throw new Error(`unknown text ${pair.text}`);
      const drawn = text.alpha < 1 ? over(text.rgb, text.alpha, rgbOf(ground)) : text.css;
      return {
        name: pair.name,
        appearance,
        text: pair.text,
        ground: pair.ground.over
          ? `${pair.ground.token} over ${pair.ground.over}`
          : pair.ground.token,
        drawn: [drawn, ground],
        floor: pair.floor,
        wcag: Math.round(wcag(drawn, ground) * 100) / 100,
        apca: Math.round(apca(drawn, ground) * 10) / 10,
      };
    },
  );
}

/** The twelve steps of a hue in an appearance (DESIGN.md 5.2; Radix Colors' roles). */
function hueRamp(hue: (typeof HUES)[number], appearance: Appearance): string[] {
  const seed = SEEDS[appearance][hue];
  const [l, c, h] = oklchOf(seed);
  const light = appearance === 'light';
  const steps = HUE_LIGHTNESS[appearance].map((target, i) =>
    hexOfOklch(target, c * (CHROMA_TAPER[i] ?? 1), h),
  );
  steps.push(seed);
  steps.push(hexOfOklch(l + (light ? -SOLID_HOVER_STEP : SOLID_HOVER_STEP), c, h));
  const subtle = steps[1] ?? seed;
  steps.push(solveOn(seed, subtle, 4.5, light, 0.9));
  steps.push(solveOn(seed, subtle, 11, light, 0.6));
  return steps;
}

function solveOn(
  seed: string,
  ground: string,
  floor: number,
  darker: boolean,
  chroma: number,
): string {
  const [l0, c, h] = oklchOf(seed);
  const step = darker ? -SOLVE_STEP : SOLVE_STEP;
  for (let l = l0; l >= 0 && l <= 1; l += step) {
    const hex = hexOfOklch(l, c * chroma, h);
    if (wcag(hex, ground) >= floor + SPARE) return hex;
  }
  throw new Error(`no step of ${seed} holds ${floor}:1 on ${ground}`);
}

/** The neutral ramp: paper, titanium's hue, titanium, the secondary text, the second ink, the ink. */
function neutralRamp(appearance: Appearance, values: Map<string, Resolved>): string[] {
  const seeds = SEEDS[appearance];
  const [, c, h] = oklchOf(seeds.titanium);
  const steps = [seeds.paper];
  NEUTRAL_LIGHTNESS[appearance].forEach((target, i) =>
    steps.push(hexOfOklch(target, c * (i < 2 ? 0.4 : 1), h)),
  );
  steps.push(seeds.titanium);
  steps.push(values.get('--pt-titanium')?.css ?? seeds.titanium);
  steps.push(seeds.ink2);
  steps.push(seeds.ink);
  return steps;
}

/** Wraps a note into comment lines of at most 100 columns at an indent. */
function comment(text: string, indent: string): string[] {
  const lines: string[] = [];
  let line = `${indent}/*`;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = `${line} ${word}`;
    if (next.length > 97 && line.trim() !== '/*') {
      lines.push(line);
      line = `${indent}   ${word}`;
    } else line = next;
  }
  lines.push(`${line} */`);
  return lines;
}

function cssBlock(resolved: Record<Appearance, Map<string, Resolved>>): string {
  const out: string[] = [
    GENERATED_START,
    ...comment(
      `The chrome's colours (docs/DESIGN.md 5.2 to 5.4), generated by scripts/build-colors.ts from packages/theme/src/palette.ts with colorjs.io ${COLORJS_VERSION}: edit the palette and run the script, never this block. Each value carries its OKLCH coordinates; every pair of PAIRS holds its WCAG 2.2 floor in both appearances (packages/theme/src/colors.test.ts). The overlay layer carries the sheet's own appearance as its data-theme (docs/archive/rounds/POLISH.md 2.5 item 49), so the chrome drawn over a sheet reads the sheet's appearance.`,
      '',
    ),
  ];
  for (const appearance of APPEARANCES) {
    out.push(`${APPEARANCE_SELECTORS[appearance].join(',\n')} {`);
    for (const token of CHROME_TOKENS) {
      if (appearance === 'dark' && !token.dark) continue;
      const value = resolved[appearance].get(token.name);
      if (!value) throw new Error(`no value for ${token.name}`);
      if (token.note && appearance === 'light') out.push(...comment(token.note, '  '));
      out.push(`  ${token.name}: ${value.css}; /* ${value.oklch} */`);
    }
    out.push('}', '');
  }
  out.pop();
  out.push(GENERATED_END);
  return out.join('\n');
}

function generatedTs(
  resolved: Record<Appearance, Map<string, Resolved>>,
  ramps: Record<Appearance, Record<string, string[]>>,
  readings: PairReading[],
): string {
  const tokens = Object.fromEntries(
    APPEARANCES.map((a) => [
      a,
      Object.fromEntries(CHROME_TOKENS.map((t) => [t.name, resolved[a].get(t.name)?.css ?? ''])),
    ]),
  );
  return [
    `// Generated by scripts/build-colors.ts from palette.ts with colorjs.io ${COLORJS_VERSION} (docs/DESIGN.md 5.4).`,
    '// Do not edit: change palette.ts and run `node scripts/build-colors.ts`; `--check` compares.',
    '',
    "import type { Appearance } from './palette.ts';",
    '',
    '/** The twelve steps of the neutral ramp and of each hue, per appearance (Radix roles). */',
    `export const RAMPS: Readonly<Record<Appearance, Readonly<Record<string, readonly string[]>>>> = ${JSON.stringify(ramps)};`,
    '',
    '/** Every chrome colour token as tokens.css declares it, per appearance. */',
    `export const TOKEN_VALUES: Readonly<Record<Appearance, Readonly<Record<string, string>>>> = ${JSON.stringify(tokens)};`,
    '',
    '/** Every pair of PAIRS as drawn: the opaque colours, the floor, the WCAG 2.2 ratio, the APCA Lc. */',
    'export type PairReading = { name: string; appearance: Appearance; text: string; ground: string; drawn: readonly [string, string]; floor: number; wcag: number; apca: number };',
    '',
    `export const PAIR_READINGS: readonly PairReading[] = ${JSON.stringify(readings)};`,
    '',
  ].join('\n');
}

async function build(): Promise<{ css: string; ts: string; readings: PairReading[] }> {
  const resolved = { light: resolveAll('light'), dark: resolveAll('dark') };
  const rampsOf = (a: Appearance): Record<string, string[]> => ({
    neutral: neutralRamp(a, resolved[a]),
    ...Object.fromEntries(HUES.map((hue) => [hue, hueRamp(hue, a)])),
  });
  const ramps: Record<Appearance, Record<string, string[]>> = {
    light: rampsOf('light'),
    dark: rampsOf('dark'),
  };
  const readings = APPEARANCES.flatMap((a) => readPairs(a, resolved[a]));
  const current = readFileSync(TOKENS_CSS, 'utf8');
  const start = current.indexOf(GENERATED_START);
  const end = current.indexOf(GENERATED_END);
  if (start < 0 || end < start) throw new Error(`tokens.css has no ${GENERATED_START} block`);
  const replaced =
    current.slice(0, start) + cssBlock(resolved) + current.slice(end + GENERATED_END.length);
  const cssConfig = (await resolveConfig(TOKENS_CSS)) ?? {};
  const tsConfig = (await resolveConfig(GENERATED_TS)) ?? {};
  const css = await format(replaced, { ...cssConfig, filepath: TOKENS_CSS });
  const ts = await format(generatedTs(resolved, ramps, readings), {
    ...tsConfig,
    filepath: GENERATED_TS,
  });
  return { css, ts, readings };
}

async function main(argv: readonly string[]): Promise<number> {
  const { css, ts, readings } = await build();
  if (argv.includes('--check')) {
    const stale: string[] = [];
    if (readFileSync(TOKENS_CSS, 'utf8') !== css) stale.push('packages/chrome/src/tokens.css');
    let committed = '';
    try {
      committed = readFileSync(GENERATED_TS, 'utf8');
    } catch {
      committed = '';
    }
    if (committed !== ts) stale.push('packages/theme/src/colors.generated.ts');
    if (stale.length > 0) {
      console.error(`build-colors: stale ${stale.join(', ')}; run node scripts/build-colors.ts`);
      return 1;
    }
    console.log('build-colors: tokens.css and colors.generated.ts are current');
    return 0;
  }
  writeFileSync(TOKENS_CSS, css);
  writeFileSync(GENERATED_TS, ts);
  for (const r of readings)
    console.log(
      `${r.appearance.padEnd(5)} ${r.name.padEnd(44)} ${r.drawn[0]} on ${r.drawn[1]}  ${r.wcag.toFixed(2)}:1 (floor ${r.floor})  Lc ${r.apca}`,
    );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`build-colors: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  },
);
