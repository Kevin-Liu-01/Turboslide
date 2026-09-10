// Writes the two-tone fixtures next to this file (SPEC 5.4). Run from the repo root with
// `node packages/effects/fixtures/two-tone/make.mts`; the approved pair needs the Prototemplate
// deck checkout (TURBOSLIDE_PROTOTEMPLATE_DECK or /Users/kevinliu/repos/Prototemplate/deck), the
// golden needs nothing beyond fixtures/pillow/src.png.
//
// 1. The approved Prototemplate and Glyphfield opener pair (OPENERS.md, "Prototemplate and
//    Glyphfield"): the deck's JPEG twins read back to 800 by 450 one-bit screens by 2 by 2 block
//    means and written as 1-bit PNGs (about 4 KB each). Both twins round-trip with no cell changed,
//    so these files are the cells the round approved.
// 2. A golden of the whole pipeline on fixtures/pillow/src.png with the crop and tone parameters of
//    the Pillow fixtures. Written by this implementation, so it guards the stage order and the
//    defaults; the stages themselves are checked against Pillow in pillow.test.ts.
//
// The source render of the pair (hi/lm-gem-c5-s2.png, 3200 by 1800) is not on disk any more; the
// agreement the pipeline reached against it on 2026-09-10 is copied into the manifest as recorded.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bitsFromGray, cellAgreement } from '../../src/diff.ts';
import { invertBits, litFraction } from '../../src/image.ts';
import type { BitImage } from '../../src/image.ts';
import { decodeImage } from '../../src/io.ts';
import { PLATE_BOXES, plateClear } from '../../src/metrics.ts';
import { encodePng1 } from '../../src/png1.ts';
import { toGray } from '../../src/tone.ts';
import { twoTone } from '../../src/two-tone.ts';
import type { TwoToneParams } from '../../src/two-tone.ts';

const DIR = dirname(fileURLToPath(import.meta.url));
const DECK =
  process.env.TURBOSLIDE_PROTOTEMPLATE_DECK ?? '/Users/kevinliu/repos/Prototemplate/deck';

/** The plate of slide 60 as rendered (OPENERS.md: 137, 463 to 877, 771; the title wraps to two lines). */
const OBSERVED_PLATE: [number, number, number, number] = [137, 463, 740, 308];

const GOLDEN_PARAMS: TwoToneParams = {
  crop: [-20, 10, 150, 100],
  black: 20,
  white: 235,
  gamma: 0.9,
  polarity: 'dark-ground',
};

function count(bits: BitImage): number {
  let lit = 0;
  for (const b of bits.bits) lit += b;
  return lit;
}

const darkGray = toGray(await decodeImage(join(DECK, 'shots/opener-prototemplate.jpg')));
const lightGray = toGray(await decodeImage(join(DECK, 'shots/opener-prototemplate-light.jpg')));
const dark = bitsFromGray(darkGray, 2);
const light = bitsFromGray(lightGray, 2);
const inverse = cellAgreement(light, invertBits(dark));
if (inverse.mismatched !== 0)
  throw new Error(`twins are not inverses: ${inverse.mismatched} cells`);
writeFileSync(join(DIR, 'opener-prototemplate-dark.png'), encodePng1(dark));
writeFileSync(join(DIR, 'opener-prototemplate-light.png'), encodePng1(light));

const src = await decodeImage(join(DIR, '..', 'pillow', 'src.png'));
const golden = twoTone(src, GOLDEN_PARAMS, { plate: PLATE_BOXES.opener });
writeFileSync(join(DIR, 'pillow-src-dark.png'), golden.dark.png);
const goldenScreen = golden.positive;

const manifest = {
  writtenBy: 'make.mts',
  pair: {
    name: 'opener-prototemplate',
    dark: 'opener-prototemplate-dark.png',
    light: 'opener-prototemplate-light.png',
    width: dark.width,
    height: dark.height,
    cell: 2,
    deckFiles: ['shots/opener-prototemplate.jpg', 'shots/opener-prototemplate-light.jpg'],
    litCells: count(dark),
    litFraction: Number(litFraction(dark).toFixed(4)),
    screeningBox: plateClear(dark, PLATE_BOXES.opener, 2),
    observedPlate: plateClear(dark, OBSERVED_PLATE, 2),
    treatment: {
      kind: 'two-tone',
      crop: [-1325, 105, 2709, 2374],
      black: 20,
      gamma: 1,
      polarity: 'dark-ground',
    },
    source: {
      file: 'openers-60-79/glyphfield/hi/lm-gem-c5-s2.png',
      width: 3200,
      height: 1800,
      status:
        'not on disk since 2026-09-10 (the session scratchpad was cleared); render again per OPENERS.md, "Prototemplate and Glyphfield", and point TURBOSLIDE_TWO_TONE_SOURCE at the file',
    },
    recorded: {
      date: '2026-09-10',
      pipeline: 'packages/effects/src/two-tone.ts, gray before the fit (make.py order)',
      darkAgreement: 0.9997555555555555,
      lightAgreement: 0.9997555555555555,
      mismatchedCells: 88,
      cells: 360000,
    },
  },
  golden: {
    source: '../pillow/src.png',
    dark: 'pillow-src-dark.png',
    params: GOLDEN_PARAMS,
    screen: { width: goldenScreen.width, height: goldenScreen.height },
    litCells: count(goldenScreen),
    metrics: golden.metrics,
  },
};
writeFileSync(join(DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ pair: manifest.pair.litFraction, golden: manifest.golden.metrics }));
