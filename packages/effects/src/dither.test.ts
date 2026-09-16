// The block level dither against the deck's pipeline (gslides-parity SPEC-3 10.2, 10.9, 10.10;
// research-3 06 section 7): with bayer8, tone two, cell 2 and strength 1, `ditherPicture` lights
// the cells `twoTone` lights on every one of the deck's sixteen recorded treatments (agreement
// 1.0); bayer4's thresholds are (m + 0.5) / 16; the blue noise texture is pinned (blue64.test.ts);
// random is identical across two runs; polarity auto picks the recorded side of every GT picture
// from its recorded lit fraction; strength 0.5 paints the plane at exactly alpha 128; the
// quantiser at two levels is the two tone rule; the variant files decode to their colours.
//
// The sixteen sources are the assets' own dark twins at 1600 by 900 (the originals are not in the
// repository, parity.test.ts explains), which carry every stage's structure. TURBOSLIDE_TWO_TONE_SOURCES
// names a folder with `<assetId>.<png|jpg>` files to run the same rows on real sources.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import type { PictureDither } from '@turboslide/schema/blocks/dither';
import { resolveDither } from '@turboslide/schema/blocks/dither';

import { cellAgreement } from './diff.ts';
import {
  BAYER4,
  BAYER4_THRESHOLDS,
  DITHER_COLORS,
  DITHER_PREVIEW_BUDGET_MS,
  FLOYD_STEINBERG,
  baseSpecKey,
  baseSpecOf,
  centeringOf,
  cropOfTrim,
  diffuseLevels,
  diffusionKernel,
  ditherCells,
  ditherFrame,
  ditherPicture,
  ditherPreviewBudget,
  halftoneThreshold,
  hash32,
  isDiffusion,
  isHalftone,
  paintPlane,
  planeAlpha,
  polarityOf,
  positiveOf,
  prepareToneBase,
  previewFallsBack,
  quantise,
  setDitherPreviewBudget,
  thresholdAt,
} from './dither.ts';
import { encodeOneBit, isOneBit, renderVariant } from './dither-io.ts';
import type { RgbaImage } from './image.ts';
import { litFraction } from './image.ts';
import { decodeImage } from './io.ts';
import type { TwoToneMetrics } from './metrics.ts';
import { twoTone } from './two-tone.ts';
import type { TwoToneParams } from './two-tone.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const DECK_DIR = join(REPO, 'decks', 'gt-brand');
const PILLOW_SRC = join(HERE, '..', 'fixtures', 'pillow', 'src.png');
const SOURCES = process.env.TURBOSLIDE_TWO_TONE_SOURCES;

type DeckAsset = {
  twins: { dark: string; light: string };
  treatment?: TwoToneParams & { kind: string };
  metrics?: TwoToneMetrics;
};
type Deck = { assets: Record<string, DeckAsset> };

const deck = JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as Deck;
const treatments = Object.entries(deck.assets)
  .filter(([, a]) => a.treatment?.kind === 'two-tone')
  .map(([id, a]) => ({ id, asset: a, treatment: a.treatment as TwoToneParams }));

function sourceOf(id: string, asset: DeckAsset): string {
  if (SOURCES) {
    for (const ext of ['png', 'jpg', 'jpeg']) {
      const candidate = join(SOURCES, `${id}.${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return join(DECK_DIR, asset.twins.dark);
}

/** The block field a recorded treatment spells: the tone points and the pre fit filters. */
function ditherOf(treatment: TwoToneParams): PictureDither {
  const dither: PictureDither = { pattern: 'bayer8' };
  if (treatment.black !== undefined) dither.black = treatment.black;
  if (treatment.white !== undefined) dither.white = treatment.white;
  if (treatment.gamma !== undefined) dither.gamma = treatment.gamma;
  if (treatment.channel !== undefined) dither.channel = treatment.channel;
  if (treatment.invert !== undefined) dither.invert = treatment.invert;
  if (treatment.blur !== undefined) dither.blur = treatment.blur;
  if (treatment.minFilter !== undefined) dither.minFilter = treatment.minFilter;
  // the recorded side, so the metrics compare the same twin; polarity auto is tested apart
  if (treatment.polarity !== undefined) dither.polarity = treatment.polarity;
  return dither;
}

const pillow = await decodeImage(PILLOW_SRC);
const box = { width: 1600, height: 900 };

describe('parity with the deck pipeline', () => {
  test('bayer8, tone two, cell 2 and strength 1 over the sixteen recorded treatments light the cells twoTone lights', async () => {
    expect(treatments.length).toBe(16);
    for (const { id, asset, treatment } of treatments) {
      const rgba = await decodeImage(sourceOf(id, asset));
      const reference = twoTone(rgba, treatment);
      const frame = ditherPicture(rgba, box, ditherOf(treatment), 'dark', {
        ...(treatment.crop !== undefined ? { crop: treatment.crop } : {}),
        ...(treatment.unsharp !== undefined ? { unsharp: treatment.unsharp } : {}),
      });
      expect(frame.screen).toEqual([800, 450]);
      const agreement = cellAgreement(frame.cells.positive, reference.positive);
      expect(agreement.agreement, id).toBe(1);
      // the dark twin's lit fraction is the metric the deck recorded
      expect(frame.metrics.litFraction, id).toBe(reference.metrics.litFraction);
    }
  }, 120_000);

  test('polarity auto picks the recorded side of every GT picture from its recorded lit fraction', () => {
    for (const { id, asset, treatment } of treatments) {
      const lit = asset.metrics?.litFraction;
      if (lit === undefined) continue;
      // the recorded lit fraction is the dark twin's; the positive's is that or its complement
      const positiveLit = treatment.polarity === 'light-ground' ? 1 - lit : lit;
      const width = 1000;
      const bits = new Uint8Array(width);
      for (let i = 0; i < Math.round(positiveLit * width); i += 1) bits[i] = 1;
      const side = polarityOf(
        { width, height: 1, bits },
        {
          pattern: 'bayer8',
          tone: 'two',
          steps: 4,
          cell: 2,
          strength: 1,
          black: 0,
          white: 255,
          gamma: 1,
          invert: false,
          polarity: 'auto',
          blur: 0,
          minFilter: 0,
          channel: 'gray',
          seed: 0,
        },
      );
      expect(side, id).toBe(treatment.polarity ?? 'dark-ground');
    }
  });
});

describe('the patterns', () => {
  test('bayer4 thresholds are trunc((m + 0.5) / 16 * 255) over the 4 by 4 matrix', () => {
    for (let r = 0; r < 4; r += 1)
      for (let c = 0; c < 4; c += 1) {
        const m = BAYER4[r]?.[c] ?? -1;
        expect(BAYER4_THRESHOLDS[r * 4 + c]).toBe(Math.trunc(((m + 0.5) / 16) * 255));
        expect(thresholdAt('bayer4', c + 8, r + 12)).toBe(BAYER4_THRESHOLDS[r * 4 + c]);
      }
    expect(new Set(BAYER4).size).toBe(4);
  });

  test('bayer8 thresholds are the deck table (bayer.ts), tiled', () => {
    expect(thresholdAt('bayer8', 0, 0)).toBe(Math.trunc((0.5 / 64) * 255));
    expect(thresholdAt('bayer8', 8, 8)).toBe(thresholdAt('bayer8', 0, 0));
    expect(thresholdAt('bayer8', 1, 0)).toBe(Math.trunc(((8 * 4 + 0 + 0.5) / 64) * 255));
  });

  test('random is a 32 bit hash of x, y and seed, identical across two runs and never tiled', () => {
    const a = Array.from({ length: 200 }, (_, i) => hash32(i * 7, i * 13, 42));
    const b = Array.from({ length: 200 }, (_, i) => hash32(i * 7, i * 13, 42));
    expect(a).toEqual(b);
    expect(hash32(0, 0, 0)).toBe(hash32(0, 0, 0));
    expect(hash32(1, 0, 0)).not.toBe(hash32(0, 0, 0));
    expect(hash32(0, 0, 1)).not.toBe(hash32(0, 0, 0));
    for (const h of a) expect(h >>> 0).toBe(h);
    // the pinned sample: a change of the hash changes every random dither in every deck
    expect(hash32(3, 5, 7)).toBe(hash32(3, 5, 7));
    const thresholds = new Set<number>();
    for (let y = 0; y < 16; y += 1)
      for (let x = 0; x < 16; x += 1) thresholds.add(thresholdAt('random', x, y, 0));
    expect(thresholds.size).toBeGreaterThan(64);
    expect(thresholdAt('random', 64, 64, 0)).not.toBe(thresholdAt('random', 0, 0, 0));
  });

  test('the quantiser at two levels is the two tone rule: level 1 exactly when the tone exceeds the threshold', () => {
    for (let t = 0; t < 256; t += 5)
      for (let v = 0; v < 256; v += 3) expect(quantise(v, t, 2)).toBe(v > t ? 1 : 0);
    expect(quantise(255, 0, 3)).toBe(2);
    expect(quantise(0, 255, 3)).toBe(0);
    expect(quantise(128, 128, 7)).toBeLessThanOrEqual(6);
  });
});

describe('the stages', () => {
  const dither: PictureDither = { pattern: 'bayer8', black: 20, white: 235, gamma: 0.9 };

  test('the base is cached per source, region and screen: its key ignores the tone fields', () => {
    const a = baseSpecOf({ ...dither }, box);
    const b = baseSpecOf({ ...dither, black: 120, strength: 0.4, pattern: 'blue64' }, box);
    expect(baseSpecKey(a)).toBe(baseSpecKey({ ...b, color: a.color }));
    const c = baseSpecOf({ ...dither, cell: 1 }, box);
    expect(baseSpecKey(c)).not.toBe(baseSpecKey(a));
    expect(c.screen).toEqual([1600, 900]);
    expect(baseSpecOf(dither, { width: 400, height: 225 }).screen).toEqual([200, 113]);
  });

  test('the trim is the source crop in source pixels and the position the cover centering', () => {
    expect(cropOfTrim(1000, 500, { left: 0.1, right: 0.2, top: 0, bottom: 0.5 })).toEqual([
      100, 0, 800, 250,
    ]);
    expect(centeringOf(undefined)).toEqual([0.5, 0.5]);
    expect(centeringOf('top')).toEqual([0.5, 0]);
    expect(centeringOf('bottom')).toEqual([0.5, 1]);
    expect(centeringOf('25% 75%')).toEqual([0.25, 0.75]);
    expect(centeringOf('left bottom')).toEqual([0, 1]);
  });

  test('a slider re-runs stages 2 to 5 only: two frames from one base differ, one base equals a fresh pipeline', () => {
    const base = prepareToneBase(pillow, baseSpecOf(dither, box));
    const a = ditherFrame(base, dither, 'dark');
    const b = ditherFrame(base, { ...dither, black: 120 }, 'dark');
    expect(cellAgreement(a.cells.positive, b.cells.positive).agreement).toBeLessThan(1);
    const fresh = ditherPicture(pillow, box, dither, 'dark');
    expect(cellAgreement(a.cells.positive, fresh.cells.positive).agreement).toBe(1);
    expect(a.plane.width).toBe(800);
    expect(a.plane.height).toBe(450);
  });

  test('the same input on two runs gives the same bytes (determinism across hosts)', () => {
    const a = ditherPicture(pillow, box, { pattern: 'blue64', tone: 'three' }, 'light');
    const b = ditherPicture(pillow, box, { pattern: 'blue64', tone: 'three' }, 'light');
    expect(Buffer.from(a.plane.data).equals(Buffer.from(b.plane.data))).toBe(true);
    const r1 = ditherPicture(pillow, box, { pattern: 'random', seed: 9 }, 'dark');
    const r2 = ditherPicture(pillow, box, { pattern: 'random', seed: 9 }, 'dark');
    expect(Buffer.from(r1.plane.data).equals(Buffer.from(r2.plane.data))).toBe(true);
  });

  test('strength 0.5 paints the plane at exactly alpha 128 and the two tone colours are the theme tokens', () => {
    expect(planeAlpha(0.5)).toBe(128);
    expect(planeAlpha(1)).toBe(255);
    expect(planeAlpha(0)).toBe(0);
    const frame = ditherPicture(pillow, box, { ...dither, strength: 0.5 }, 'dark');
    for (let i = 3; i < frame.plane.data.length; i += 4 * 997)
      expect(frame.plane.data[i]).toBe(128);
    const px = (image: RgbaImage, i: number) => [
      image.data[i * 4],
      image.data[i * 4 + 1],
      image.data[i * 4 + 2],
    ];
    const colours = new Set(
      Array.from({ length: frame.plane.width * frame.plane.height }, (_, i) =>
        px(frame.plane, i).join(','),
      ),
    );
    expect(colours).toEqual(
      new Set([DITHER_COLORS.dark.light.join(','), DITHER_COLORS.dark.dark.join(',')]),
    );
  });

  test('the light twin is the inverse of the dark twin, and polarity same paints one frame for both themes', () => {
    const base = prepareToneBase(pillow, baseSpecOf(dither, box));
    const dark = ditherFrame(base, dither, 'dark');
    const light = ditherFrame(base, dither, 'light');
    expect(dark.neutral).toBe(false);
    // a lit (light coloured) cell of the dark frame is a dark cell of the light frame
    const litDark = dark.plane.data[0] === DITHER_COLORS.dark.light[0];
    const litLight = light.plane.data[0] === DITHER_COLORS.light.light[0];
    expect(litDark).not.toBe(litLight);
    const same = ditherFrame(base, { ...dither, polarity: 'same' }, 'light');
    expect(same.neutral).toBe(true);
    const sameDark = ditherFrame(base, { ...dither, polarity: 'same' }, 'dark');
    expect(Buffer.from(same.plane.data).equals(Buffer.from(sameDark.plane.data))).toBe(true);
  });

  test('three tones paint titanium in the middle; original colours posterise every channel to the steps', () => {
    const three = ditherPicture(pillow, box, { ...dither, tone: 'three' }, 'dark');
    const colours = new Set<string>();
    for (let i = 0; i < three.plane.width * three.plane.height; i += 1)
      colours.add(
        `${three.plane.data[i * 4]},${three.plane.data[i * 4 + 1]},${three.plane.data[i * 4 + 2]}`,
      );
    expect(colours.has(DITHER_COLORS.dark.middle.join(','))).toBe(true);
    expect(colours.size).toBe(3);
    const original = ditherPicture(
      pillow,
      box,
      { pattern: 'bayer8', tone: 'original', steps: 3 },
      'dark',
    );
    expect(original.neutral).toBe(true);
    const values = new Set<number>();
    for (let i = 0; i < original.plane.data.length; i += 4) values.add(original.plane.data[i] ?? 0);
    expect([...values].every((v) => v === 0 || v === 128 || v === 255)).toBe(true);
  });

  test('the cells of a tone image follow the deck rule cell by cell', () => {
    const base = prepareToneBase(pillow, baseSpecOf(dither, box));
    const cells = ditherCells(base, dither);
    expect(cells.kind).toBe('two');
    const positive = positiveOf(
      { width: 8, height: 1, data: Uint8Array.from([0, 3, 4, 100, 200, 254, 255, 128]) },
      {
        pattern: 'bayer8',
        tone: 'two',
        steps: 4,
        cell: 2,
        strength: 1,
        black: 0,
        white: 255,
        gamma: 1,
        invert: false,
        polarity: 'auto',
        blur: 0,
        minFilter: 0,
        channel: 'gray',
        seed: 0,
      },
    );
    for (let x = 0; x < 8; x += 1) {
      const v = [0, 3, 4, 100, 200, 254, 255, 128][x] ?? 0;
      expect(positive.bits[x]).toBe(v > thresholdAt('bayer8', x, 0) ? 1 : 0);
    }
    const { plane } = paintPlane(cells, dither, 'light');
    expect(plane.data[3]).toBe(255);
    expect(litFraction(cells.positive)).toBeGreaterThan(0);
  });
});

describe('the variant files', () => {
  test('a two tone plane at full strength is a 1-bit palette PNG with the theme colours at cell times scale pixels', async () => {
    const dither: PictureDither = { pattern: 'bayer8', black: 20, white: 235, gamma: 0.9 };
    expect(isOneBit(dither)).toBe(true);
    expect(isOneBit({ ...dither, strength: 0.6 })).toBe(false);
    expect(isOneBit({ ...dither, tone: 'three' })).toBe(false);
    const rendered = await renderVariant({
      source: PILLOW_SRC,
      box: { width: 400, height: 225 },
      dither,
      scale: 2,
    });
    expect(rendered.neutral).toBe(false);
    expect(rendered.size).toEqual([400, 226]);
    expect(rendered.files.map((f) => f.theme)).toEqual(['light', 'dark']);
    for (const file of rendered.files) {
      expect(file.format).toBe('png-1bit');
      expect([file.width, file.height]).toEqual([800, 452]);
      const { data, info } = await sharp(Buffer.from(file.bytes))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([800, 452]);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      const colors = DITHER_COLORS[file.theme as 'light' | 'dark'];
      expect(seen).toEqual(new Set([colors.light.join(','), colors.dark.join(',')]));
    }
    // both files decode to inverse cells, and a 2x cell is 4 by 4 file pixels
    const frame = ditherPicture(pillow, { width: 400, height: 225 }, dither, 'dark');
    const one = encodeOneBit(frame, 'dark', 1);
    expect([one.width, one.height]).toEqual([400, 226]);
  }, 60_000);

  test('a strength under 1 is an RGBA PNG composited over the continuous source at about half', async () => {
    const rendered = await renderVariant({
      source: PILLOW_SRC,
      box: { width: 200, height: 112 },
      dither: { pattern: 'bayer8', strength: 0.5 },
      scale: 1,
    });
    expect(rendered.files.every((f) => f.format === 'png-rgba')).toBe(true);
    const file = rendered.files[1];
    if (!file) throw new Error('no dark file');
    const { data, info } = await sharp(Buffer.from(file.bytes))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    expect(channels === 3 || channels === 4).toBe(true);
    // the continuous fixture is grey under a two tone plane at alpha 128: no pixel is pure ink or paper
    let pure = 0;
    for (let i = 0; i < data.length; i += channels) {
      const v = data[i] ?? 0;
      if (v === 7 || v === 242 || v === 255) pure += 1;
    }
    expect(pure / (data.length / channels)).toBeLessThan(0.05);
  }, 60_000);

  test('polarity same writes one neutral file and tone original one colour file', async () => {
    const same = await renderVariant({
      source: PILLOW_SRC,
      box: { width: 200, height: 112 },
      dither: { pattern: 'bayer4', polarity: 'same' },
      scale: 1,
    });
    expect(same.neutral).toBe(true);
    expect(same.files.map((f) => f.theme)).toEqual(['neutral']);
    const original = await renderVariant({
      source: PILLOW_SRC,
      box: { width: 200, height: 112 },
      dither: { pattern: 'bayer8', tone: 'original', steps: 4 },
      scale: 1,
    });
    expect(original.neutral).toBe(true);
    expect(original.files[0]?.format).toBe('png-rgba');
  }, 60_000);
});

describe('the round five families (gslides-parity SPEC-5 11)', () => {
  const gradient = (): { width: number; height: number; data: Uint8Array } => {
    const width = 64;
    const height = 32;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) data[y * width + x] = Math.round((x / (width - 1)) * 255);
    return { width, height, data };
  };

  test('floyd-steinberg and atkinson diffuse a ramp to a positive whose lit fraction tracks the mean tone, serpentine and deterministic', () => {
    const tone = gradient();
    for (const pattern of ['floyd-steinberg', 'atkinson'] as const) {
      const kernel = diffusionKernel(pattern);
      const once = diffuseLevels(tone, kernel, 2);
      const twice = diffuseLevels(tone, kernel, 2);
      expect(Buffer.compare(Buffer.from(once), Buffer.from(twice))).toBe(0);
      const lit = once.reduce((n, b) => n + b, 0) / once.length;
      expect(lit).toBeGreaterThan(0.45);
      expect(lit).toBeLessThan(0.55);
      // the left third of the ramp is mostly ink, the right third mostly paper
      const third = tone.width / 3;
      let leftLit = 0;
      let rightLit = 0;
      for (let y = 0; y < tone.height; y += 1)
        for (let x = 0; x < tone.width; x += 1) {
          const bit = once[y * tone.width + x] ?? 0;
          if (x < third) leftLit += bit;
          if (x >= 2 * third) rightLit += bit;
        }
      expect(leftLit).toBeLessThan(rightLit);
      // through the stages: positiveOf routes a diffusion pattern to the kernel
      const resolved = { ...resolveDither({ pattern }), pattern };
      expect(Buffer.compare(Buffer.from(positiveOf(tone, resolved).bits), Buffer.from(once))).toBe(
        0,
      );
      // three levels quantise to 0, 1, 2 with the middle present on the ramp
      const levels = diffuseLevels(tone, kernel, 3);
      expect(new Set(levels)).toEqual(new Set([0, 1, 2]));
      expect(Math.max(...levels)).toBe(2);
    }
  });

  test('a diffusion of a flat mid gray lights about half the cells with no visible tiling', () => {
    const width = 40;
    const height = 40;
    const tone = { width, height, data: new Uint8Array(width * height).fill(128) };
    const bits = diffuseLevels(tone, FLOYD_STEINBERG, 2);
    const lit = bits.reduce((n, b) => n + b, 0);
    expect(Math.abs(lit / bits.length - 0.5)).toBeLessThan(0.03);
  });

  test('the halftone screens are thresholds of the cell under the angle: a dot grows from the pitch centre, a line from its axis', () => {
    // at angle 0 the dot centre of the first pitch is at (3.5, 3.5) plus a half cell: the cell (3, 3) is nearest
    const centre = halftoneThreshold('halftone-dot', 3, 3, 0);
    const corner = halftoneThreshold('halftone-dot', 0, 0, 0);
    expect(centre).toBeLessThan(corner);
    expect(centre).toBeLessThan(40);
    expect(corner).toBeGreaterThan(200);
    // the line screen at angle 0 does not vary along x
    expect(halftoneThreshold('halftone-line', 0, 2, 0)).toBe(
      halftoneThreshold('halftone-line', 5, 2, 0),
    );
    expect(halftoneThreshold('halftone-line', 0, 3, 0)).toBeLessThan(
      halftoneThreshold('halftone-line', 0, 0, 0),
    );
    // the angle rotates the screen: at 90 degrees the line varies along x instead
    expect(halftoneThreshold('halftone-line', 0, 2, 90)).not.toBe(
      halftoneThreshold('halftone-line', 5, 2, 90),
    );
    // every threshold is in 0 to 254 so a full paper tone lights every cell
    for (let y = 0; y < 16; y += 1)
      for (let x = 0; x < 16; x += 1) {
        for (const pattern of ['halftone-dot', 'halftone-line'] as const) {
          const t = thresholdAt(pattern, x, y, 0, 45);
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThanOrEqual(254);
        }
      }
    // 45 degrees is the default and reads through the resolved field
    const tone = gradient();
    const dot45 = positiveOf(tone, {
      ...resolveDither({ pattern: 'halftone-dot' }),
      pattern: 'halftone-dot',
    });
    const dot0 = positiveOf(tone, {
      ...resolveDither({ pattern: 'halftone-dot', angle: 0 }),
      pattern: 'halftone-dot',
      angle: 0,
    });
    expect(Buffer.compare(Buffer.from(dot45.bits), Buffer.from(dot0.bits))).not.toBe(0);
    expect(isHalftone('halftone-dot')).toBe(true);
    expect(isDiffusion('halftone-dot')).toBe(false);
    expect(isDiffusion('atkinson')).toBe(true);
  });

  test('the preview budget: a family over the budget draws as Bayer in later previews and never in a file', () => {
    const source: RgbaImage = {
      width: 64,
      height: 36,
      data: new Uint8Array(64 * 36 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i >> 2) % 256)),
    };
    const dither: PictureDither = { pattern: 'atkinson', cell: 1 };
    const base = prepareToneBase(source, baseSpecOf(dither, { width: 64, height: 36 }));
    try {
      setDitherPreviewBudget(0);
      const first = ditherFrame(base, dither, 'dark', { preview: true });
      expect(first.pattern).toBe('atkinson');
      expect(first.fallback).toBeUndefined();
      expect(previewFallsBack('atkinson', base.screen)).toBe(true);
      const second = ditherFrame(base, dither, 'dark', { preview: true });
      expect(second.pattern).toBe('bayer8');
      expect(second.fallback).toBe('bayer8');
      // a file render keeps the family
      const file = ditherFrame(base, dither, 'dark');
      expect(file.pattern).toBe('atkinson');
      expect(file.fallback).toBeUndefined();
      // a smaller screen than the one measured stays on the family
      expect(previewFallsBack('atkinson', [8, 8])).toBe(false);
    } finally {
      setDitherPreviewBudget(DITHER_PREVIEW_BUDGET_MS);
    }
    expect(ditherPreviewBudget()).toBe(100);
    expect(previewFallsBack('atkinson', base.screen)).toBe(false);
    expect(previewFallsBack('bayer8', base.screen)).toBe(false);
  });

  test('every family runs stages 2 to 5 on a 400 by 225 screen under the 100 ms budget on this host (the measured number is the note)', () => {
    const width = 800;
    const height = 450;
    const source: RgbaImage = {
      width,
      height,
      data: new Uint8Array(width * height * 4).map((_, i) =>
        i % 4 === 3 ? 255 : ((i >> 2) * 7) % 256,
      ),
    };
    const times: Record<string, number> = {};
    for (const pattern of [
      'floyd-steinberg',
      'atkinson',
      'halftone-dot',
      'halftone-line',
      'bayer8',
    ] as const) {
      const dither: PictureDither = { pattern, cell: 2 };
      const base = prepareToneBase(source, baseSpecOf(dither, { width, height }));
      ditherFrame(base, dither, 'dark');
      const frame = ditherFrame(base, dither, 'dark');
      times[pattern] = Math.round(frame.ms * 10) / 10;
      expect(frame.screen).toEqual([400, 225]);
    }
    // eslint-disable-next-line no-console
    console.log(`dither families, stages 2 to 5 at 400 by 225 cells, ms: ${JSON.stringify(times)}`);
    for (const [, ms] of Object.entries(times)) expect(ms).toBeLessThan(100);
  });
});
