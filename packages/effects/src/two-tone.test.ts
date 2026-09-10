// The two-tone pipeline against committed fixtures (fixtures/two-tone, written by make.mts there):
//
// 1. The approved Prototemplate and Glyphfield opener pair (OPENERS.md, "Prototemplate and
//    Glyphfield"), stored as the 800 by 450 one-bit screens read back from the deck's JPEG twins by
//    2 by 2 block means (both round-trip with no cell changed). The tests fix what the round
//    measured by hand: the twins are exact inverses, 8.3 percent of cells are paper, no cell lies
//    under the plate or in its 30 px band, and the nearest lit cell is 108 px from the screening
//    box (82 px from the plate as rendered; OPENERS.md gives 110 and 83 from the render).
// 2. A golden of the whole pipeline on fixtures/pillow/src.png with the crop and tone parameters of
//    the Pillow fixtures. This implementation wrote it, and pillow.test.ts holds every stage to
//    Pillow byte for byte, so the golden guards the stage order and the defaults between stages.
// 3. The pipeline against the pair from its source render (hi/lm-gem-c5-s2.png, 3200 by 1800,
//    crop -1325, 105, 2709, 2374, black 20, gamma 1.0), which measured 0.99976 agreement (88 of
//    360,000 cells) on 2026-09-10 (manifest.json, `recorded`). The render lived in a session
//    scratchpad that was cleared that day, so this test takes the file from
//    TURBOSLIDE_TWO_TONE_SOURCE and fails, rather than skips, when the variable names a file that
//    is not there; OPENERS.md holds the recipe to render it again. Every other test here needs
//    nothing outside the repository, and a missing fixture fails it.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { bitsFromGray, cellAgreement } from './diff.ts';
import type { BitImage, Box } from './image.ts';
import { invertBits, litFraction } from './image.ts';
import { decodeImage } from './io.ts';
import { PLATE_BOXES, plateClear, twoToneMetrics } from './metrics.ts';
import type { TwoToneMetrics } from './metrics.ts';
import { encodePng1 } from './png1.ts';
import { scaleNearest } from './resample.ts';
import { toGray } from './tone.ts';
import { twoTone } from './two-tone.ts';
import type { TwoToneParams } from './two-tone.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'two-tone');
const DECK =
  process.env.TURBOSLIDE_PROTOTEMPLATE_DECK ?? '/Users/kevinliu/repos/Prototemplate/deck';
const hasDeck = existsSync(join(DECK, 'shots/opener-prototemplate.jpg'));
const SOURCE = process.env.TURBOSLIDE_TWO_TONE_SOURCE;

type Clear = { plate: Box; nearestLitPx: number; litUnder: number; litInBand: number };
type Manifest = {
  pair: {
    dark: string;
    light: string;
    width: number;
    height: number;
    deckFiles: [string, string];
    litCells: number;
    litFraction: number;
    screeningBox: Clear;
    observedPlate: Clear;
    treatment: TwoToneParams;
    recorded: { darkAgreement: number; mismatchedCells: number };
  };
  golden: {
    source: string;
    dark: string;
    params: TwoToneParams;
    litCells: number;
    metrics: TwoToneMetrics;
  };
};

const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as Manifest;

/** A committed 1-bit PNG back to cells: sharp decodes it to 0 and 255, one pixel per cell. */
async function readBits(path: string): Promise<BitImage> {
  return bitsFromGray(toGray(await decodeImage(path)), 1);
}

function litCells(bits: BitImage): number {
  let lit = 0;
  for (const b of bits.bits) lit += b;
  return lit;
}

const pairDark = await readBits(join(DIR, manifest.pair.dark));
const pairLight = await readBits(join(DIR, manifest.pair.light));

describe('the approved opener pair (fixtures/two-tone)', () => {
  test('is stored at the screen size with exact inverse twins', () => {
    expect([pairDark.width, pairDark.height]).toEqual([800, 450]);
    expect([pairLight.width, pairLight.height]).toEqual([
      manifest.pair.width,
      manifest.pair.height,
    ]);
    expect(cellAgreement(pairLight, invertBits(pairDark))).toEqual({
      cells: 360000,
      mismatched: 0,
      agreement: 1,
    });
  });

  test('measures what the round measured by hand', () => {
    // OPENERS.md: 8.3 percent of cells are paper; no cell inside the plate or in the 30 px band.
    expect(litCells(pairDark)).toBe(manifest.pair.litCells);
    expect(Number(litFraction(pairDark).toFixed(4))).toBe(0.083);
    expect(plateClear(pairDark, PLATE_BOXES.opener, 2)).toEqual(manifest.pair.screeningBox);
    expect(manifest.pair.screeningBox).toMatchObject({
      nearestLitPx: 108,
      litUnder: 0,
      litInBand: 0,
    });
    expect(plateClear(pairDark, manifest.pair.observedPlate.plate, 2)).toEqual(
      manifest.pair.observedPlate,
    );
    expect(manifest.pair.observedPlate).toMatchObject({
      nearestLitPx: 82,
      litUnder: 0,
      litInBand: 0,
    });
    expect(twoToneMetrics(pairDark, PLATE_BOXES.opener, 2).warnings).toEqual([]);
  });

  test('round-trips through the one-bit encoder in both polarities', async () => {
    for (const bits of [pairDark, pairLight]) {
      const png = encodePng1(bits);
      expect(png.subarray(0, 4)).toEqual(Uint8Array.from([137, 80, 78, 71]));
      const back = bitsFromGray(toGray(await decodeImage(png)), 1);
      expect(cellAgreement(back, bits).mismatched).toBe(0);
    }
  });

  test('scales to the sheet and reads back cell for cell', () => {
    const sheet = scaleNearest(pairDark, 2);
    expect([sheet.width, sheet.height]).toEqual([1600, 900]);
    const gray = {
      width: sheet.width,
      height: sheet.height,
      data: sheet.bits.map((b) => (b ? 255 : 0)),
    };
    expect(cellAgreement(bitsFromGray(gray, 2), pairDark).mismatched).toBe(0);
  });

  // The deck's JPEG twins are what the fixture was read from; with the checkout present this
  // proves the committed cells are the deck's.
  test.skipIf(!hasDeck)(
    'matches the deck JPEG twins cell for cell (Prototemplate checkout)',
    async () => {
      const [darkFile, lightFile] = manifest.pair.deckFiles;
      const dark = bitsFromGray(toGray(await decodeImage(join(DECK, darkFile))), 2);
      const light = bitsFromGray(toGray(await decodeImage(join(DECK, lightFile))), 2);
      expect(cellAgreement(dark, pairDark).mismatched).toBe(0);
      expect(cellAgreement(light, pairLight).mismatched).toBe(0);
    },
  );
});

describe('twoTone on the Pillow source (golden)', async () => {
  const source = await decodeImage(join(DIR, manifest.golden.source));
  const golden = await readBits(join(DIR, manifest.golden.dark));

  test('reproduces the committed golden cell for cell', () => {
    const result = twoTone(source, manifest.golden.params, { plate: PLATE_BOXES.opener });
    expect([result.positive.width, result.positive.height]).toEqual([800, 450]);
    expect([golden.width, golden.height]).toEqual([1600, 900]);
    expect(cellAgreement(result.dark.bits, golden).mismatched).toBe(0);
    expect(cellAgreement(result.light.bits, invertBits(golden)).mismatched).toBe(0);
    expect(litCells(result.positive)).toBe(manifest.golden.litCells);
    expect(result.metrics).toEqual(manifest.golden.metrics);
    expect(result.params).toMatchObject({
      polarity: 'dark-ground',
      cell: 2,
      bayer: 8,
      resampler: 'lanczos3',
      black: 20,
      white: 235,
      gamma: 0.9,
    });
  });
});

describe('twoTone against the approved pair from its source render', () => {
  test.skipIf(SOURCE === undefined)(
    'reproduces the pair within the floor (TURBOSLIDE_TWO_TONE_SOURCE)',
    async () => {
      if (SOURCE === undefined) throw new Error('unreachable');
      expect(existsSync(SOURCE), `TURBOSLIDE_TWO_TONE_SOURCE names a missing file: ${SOURCE}`).toBe(
        true,
      );
      const rgba = await decodeImage(SOURCE);
      expect([rgba.width, rgba.height]).toEqual([3200, 1800]);
      const result = twoTone(rgba, manifest.pair.treatment, { plate: PLATE_BOXES.opener });
      const dark = cellAgreement(result.positive, pairDark);
      const light = cellAgreement(invertBits(result.positive), pairLight);
      const report = {
        darkAgreement: dark.agreement,
        darkMismatched: dark.mismatched,
        lightAgreement: light.agreement,
        litFraction: result.metrics.litFraction,
        plateClear: result.metrics.plateClear,
        recorded: manifest.pair.recorded,
      };
      console.log('two-tone opener-prototemplate:', JSON.stringify(report));
      // The floor is the M1 acceptance; the recorded run reached 0.99976 (88 cells).
      expect(dark.agreement, JSON.stringify(report)).toBeGreaterThanOrEqual(0.995);
      expect(light.agreement).toBeGreaterThanOrEqual(0.995);
      expect(result.metrics.litFraction).toBeGreaterThan(0.07);
      expect(result.metrics.litFraction).toBeLessThan(0.1);
      expect(result.metrics.plateClear?.litUnder).toBe(0);
      expect(result.metrics.plateClear?.litInBand).toBe(0);
    },
  );
});

describe('twoTone on a synthetic gradient', () => {
  test('dithers to a ramp with both twins inverted', () => {
    const width = 1000;
    const height = 562;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const v = Math.round((x / (width - 1)) * 255);
        const i = (y * width + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const result = twoTone({ width, height, data }, { polarity: 'light-ground' });
    expect([result.positive.width, result.positive.height]).toEqual([800, 450]);
    expect([result.dark.bits.width, result.dark.bits.height]).toEqual([1600, 900]);
    expect(result.metrics.litFraction).toBeGreaterThan(0.4);
    expect(result.metrics.litFraction).toBeLessThan(0.6);
    for (let i = 0; i < 2000; i += 1)
      expect(result.dark.bits.bits[i]).toBe(1 - (result.light.bits.bits[i] ?? 0));
    expect(result.dark.png.subarray(0, 4)).toEqual(Uint8Array.from([137, 80, 78, 71]));
  });
});
