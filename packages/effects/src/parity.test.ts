// Cell identity between the TypeScript pipeline and crates/turboslide-native (SPEC 10; MILESTONES
// M5 item 6): the napi addon and the wasm module must light the same cells as pipeline.ts on the
// deck's two-tone openers and moods, from their recorded treatments, and agree on the tone image,
// the metrics, the LUTs and the tap tables that produce them. The Rust crate mirrors the
// TypeScript operation for operation and takes sin, exp and pow from libm's fdlibm ports, the
// same lineage as V8's (cbrt, used only by DSSIM, is libm's CORE-MATH port); this file is where
// that claim is measured.
//
// Inputs. The deck's fifteen two-tone assets (decks/gt-brand/deck.json, treatment.kind
// 'two-tone') are run from their recorded parameters. Their source photographs and renders are
// not in the repository (the `scratchpad/photo` copies named in Asset.source were cleared on
// 2026-09-10, slides report), so the input for each asset is its own dark twin JPEG at 1600 by
// 900, which carries the picture's real tonal structure through every stage the recorded
// treatment names (crop, channel pick, invert, blur, minimum filter, unsharp band, gamma). When
// TURBOSLIDE_TWO_TONE_SOURCES names a directory with `<assetId>.<png|jpg|jpeg>` files, those are
// used instead and the report says so. The fixtures under fixtures/pillow and fixtures/two-tone
// run as well, so the committed goldens are held by every backend.
//
// Without a native build (a checkout without Rust) the identity tests are skipped and the
// TypeScript tests still run; TURBOSLIDE_NATIVE_REQUIRED=1 turns the skip into a failure, which
// is how the M5 acceptance line runs it after `pnpm --filter @turboslide/native build`. Every
// comparison is recorded in .turboslide/parity/report.json; docs/native.md carries the numbers.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadNativeAddon, loadWasmNode } from '@turboslide/native/node';
import pixelmatch from 'pixelmatch';
import { afterAll, describe, expect, test } from 'vitest';

import { backendFromNative, typescriptBackend } from './backend.ts';
import type { EffectsBackend } from './backend.ts';
import { bitsFromGray, cellAgreement } from './diff.ts';
import type { BitImage, Box, RgbaImage } from './image.ts';
import { cropRgba, invertBits } from './image.ts';
import { decodeImage } from './io.ts';
import { PLATE_BOXES, twoToneMetrics } from './metrics.ts';
import type { TwoToneMetrics } from './metrics.ts';
import { encodePng1 } from './png1.ts';
import { coverBox } from './resample.ts';
import { toGray } from './tone.ts';
import type { TwoToneParams } from './two-tone.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const DECK_DIR = join(REPO, 'decks', 'gt-brand');
const FIXTURES = join(HERE, '..', 'fixtures');
const REPORT_DIR = join(REPO, '.turboslide', 'parity');
const SOURCES = process.env.TURBOSLIDE_TWO_TONE_SOURCES;
const required = process.env.TURBOSLIDE_NATIVE_REQUIRED === '1';

type DeckAsset = {
  twins: { dark: string; light: string };
  treatment?: TwoToneParams & { kind: string };
  metrics?: TwoToneMetrics;
};
type Deck = { revision?: number; assets: Record<string, DeckAsset> };

const deck = JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as Deck;
const twoToneAssets = Object.entries(deck.assets)
  .filter(([, a]) => a.treatment?.kind === 'two-tone')
  .map(([id, a]) => ({ id, asset: a, treatment: a.treatment as TwoToneParams }));

const addon = loadNativeAddon();
const wasm = loadWasmNode();
const ts = typescriptBackend();
const nativeBackends: EffectsBackend[] = [];
if (addon) nativeBackends.push(backendFromNative(addon));
if (wasm) nativeBackends.push(backendFromNative(wasm));
const hasNative = nativeBackends.length > 0;

type Row = Record<string, unknown>;
const report: { host: Row; backends: string[]; rows: Row[] } = {
  host: {
    date: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    deckRevision: deck.revision ?? null,
    sources: SOURCES ?? 'twins',
  },
  backends: nativeBackends.map((b) => `${b.kind} ${b.version}`),
  rows: [],
};

afterAll(() => {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
});

function sameBytes(a: ArrayBufferView, b: ArrayBufferView): boolean {
  return (
    Buffer.compare(
      Buffer.from(a.buffer, a.byteOffset, a.byteLength),
      Buffer.from(b.buffer, b.byteOffset, b.byteLength),
    ) === 0
  );
}

/** JSON with sorted keys, so serde's field order and TypeScript's insertion order compare equal. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

function countDiff(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) n += 1;
  return n;
}

/** The plate the rounds screened this asset's kind against (metrics.ts PLATE_BOXES). */
function plateFor(id: string): Box {
  return id.startsWith('mood-') ? PLATE_BOXES.mood : PLATE_BOXES.opener;
}

async function inputFor(id: string, asset: DeckAsset): Promise<{ image: RgbaImage; from: string }> {
  if (SOURCES) {
    for (const ext of ['png', 'jpg', 'jpeg']) {
      const p = join(SOURCES, `${id}.${ext}`);
      if (existsSync(p)) return { image: await decodeImage(p), from: `source ${p}` };
    }
  }
  const p = join(DECK_DIR, asset.twins.dark);
  return { image: await decodeImage(p), from: `twin ${asset.twins.dark}` };
}

describe('native builds', () => {
  test('are present when the acceptance asks for them', () => {
    report.rows.push({
      check: 'builds',
      addon: addon?.version() ?? null,
      wasm: wasm?.version() ?? null,
    });
    if (required) {
      expect(addon, 'napi addon not built (pnpm --filter @turboslide/native build)').not.toBeNull();
      expect(wasm, 'wasm module not built (pnpm --filter @turboslide/native build)').not.toBeNull();
    }
  });
});

describe.skipIf(!hasNative)('cell identity on the deck two-tone assets', () => {
  test('the deck carries the sixteen two-tone assets', () => {
    // the 15 imported pictures plus liquid-metal-diamond, captured in M5 (docs/M4-M5-STATUS.md)
    expect(twoToneAssets.length).toBe(16);
  });

  for (const { id, asset, treatment } of twoToneAssets) {
    // the sixteen assets decode and dither on every backend in one test each; alone a row takes a
    // second and under a load average above twenty it passed vitest's 5 s default only sometimes
    // (VERIFICATION-3 finding 45, the ship step's step 5 run), so each row carries its own budget
    test(
      `${id}: every backend lights the cells pipeline.ts lights`,
      { timeout: 30_000 },
      async () => {
        const { image, from } = await inputFor(id, asset);
        const reference = ts.twoToneScreen(image, treatment);
        const polarity = treatment.polarity ?? 'dark-ground';
        const darkBits =
          polarity === 'dark-ground' ? reference.positive : invertBits(reference.positive);
        const tsMetrics = twoToneMetrics(darkBits, plateFor(id), treatment.cell ?? 2);
        for (const backend of nativeBackends) {
          const got = backend.twoToneScreen(image, treatment);
          const cells = cellAgreement(got.positive, reference.positive);
          const toneMismatch = countDiff(got.toneImage.data, reference.toneImage.data);
          report.rows.push({
            check: 'screen',
            asset: id,
            input: from,
            size: [image.width, image.height],
            backend: backend.kind,
            cells: cells.cells,
            mismatchedCells: cells.mismatched,
            mismatchedTone: toneMismatch,
            treatment,
          });
          expect(cells, `${backend.kind} ${id}`).toEqual({
            cells: 360000,
            mismatched: 0,
            agreement: 1,
          });
          expect(toneMismatch, `${backend.kind} ${id} tone image`).toBe(0);
        }
        // The whole-picture entry point of the crate: twins, polarity, cell scale and the metrics
        // (lit fraction to four decimals, plate clearance through V8's Math.hypot, the warnings).
        for (const native of [addon, wasm]) {
          if (!native) continue;
          const full = native.twoTone(
            image.data,
            image.width,
            image.height,
            JSON.stringify(treatment),
            JSON.stringify(plateFor(id)),
            false,
          );
          const metrics = JSON.parse(full.metricsJson) as TwoToneMetrics;
          report.rows.push({
            check: 'metrics',
            asset: id,
            backend: native.kind,
            typescript: tsMetrics,
            native: metrics,
            equal: stableJson(metrics) === stableJson(tsMetrics),
          });
          expect(metrics, `${native.kind} ${id} metrics`).toEqual(tsMetrics);
          expect([full.width, full.height]).toEqual([1600, 900]);
          const darkSheet = bitsFromGray(
            { width: 1600, height: 900, data: full.darkBits.map((b) => (b ? 255 : 0)) },
            2,
          );
          expect(cellAgreement(darkSheet, darkBits).mismatched).toBe(0);
        }
      },
    );
  }
});

describe.skipIf(!hasNative)('the committed fixtures under every backend', () => {
  type Manifest = {
    golden: { source: string; dark: string; params: TwoToneParams; litCells: number };
  };
  const manifest = JSON.parse(
    readFileSync(join(FIXTURES, 'two-tone', 'manifest.json'), 'utf8'),
  ) as Manifest;

  test('the two-tone golden is reproduced cell for cell', async () => {
    const source = await decodeImage(join(FIXTURES, 'two-tone', manifest.golden.source));
    const golden = bitsFromGray(
      toGray(await decodeImage(join(FIXTURES, 'two-tone', manifest.golden.dark))),
      1,
    );
    for (const backend of [ts, ...nativeBackends]) {
      const { positive } = backend.twoToneScreen(source, manifest.golden.params);
      const sheet: BitImage = {
        width: 1600,
        height: 900,
        bits: new Uint8Array(1600 * 900),
      };
      for (let y = 0; y < 900; y += 1)
        for (let x = 0; x < 1600; x += 1)
          sheet.bits[y * 1600 + x] = positive.bits[(y >> 1) * 800 + (x >> 1)] ?? 0;
      const agreement = cellAgreement(sheet, golden);
      report.rows.push({ check: 'golden', backend: backend.kind, ...agreement });
      expect(agreement.mismatched, backend.kind).toBe(0);
    }
  });

  test('the 1-bit PNG encoders decode to the same cells', async () => {
    const golden = bitsFromGray(
      toGray(await decodeImage(join(FIXTURES, 'two-tone', 'opener-prototemplate-dark.png'))),
      1,
    );
    const tsPng = encodePng1(golden);
    for (const native of [addon, wasm]) {
      if (!native) continue;
      const png = native.encodePng1(golden.bits, golden.width, golden.height, undefined, 6);
      expect(png.subarray(0, 8)).toEqual(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const back = bitsFromGray(toGray(await decodeImage(png)), 1);
      expect(cellAgreement(back, golden).mismatched).toBe(0);
      const pal = native.encodePng1(
        golden.bits,
        golden.width,
        golden.height,
        JSON.stringify([
          [7, 7, 7],
          [242, 242, 240],
        ]),
        6,
      );
      const palBack = await decodeImage(pal);
      expect([palBack.data[0], palBack.data[1], palBack.data[2]]).toEqual([7, 7, 7]);
      report.rows.push({
        check: 'png1',
        backend: native.kind,
        tsBytes: tsPng.length,
        nativeBytes: png.length,
        cellsIdentical: true,
      });
    }
  });
});

describe.skipIf(!hasNative)('the arithmetic behind the cells', () => {
  test('tone LUTs agree for every gamma the deck uses and a sweep', () => {
    const gammas = new Set<number>([0.8, 0.85, 0.9, 1, 1.1, 1.2]);
    for (let g = 50; g <= 200; g += 1) gammas.add(g / 100);
    const points: [number, number][] = [
      [0, 255],
      [20, 235],
      [16, 255],
      [30, 255],
      [50, 255],
      [10, 255],
      [100, 215],
      [40, 215],
      [60, 225],
      [110, 235],
      [80, 210],
      [0, 212],
      [140, 230],
      [0, 225],
    ];
    let compared = 0;
    let mismatched = 0;
    for (const backend of nativeBackends) {
      for (const gamma of gammas) {
        for (const [black, white] of points) {
          const a = ts.toneLut(black, white, gamma);
          const b = backend.toneLut(black, white, gamma);
          compared += 1;
          if (!sameBytes(a, b)) {
            mismatched += 1;
            report.rows.push({
              check: 'toneLut',
              backend: backend.kind,
              black,
              white,
              gamma,
              ok: false,
            });
          }
        }
      }
    }
    report.rows.push({ check: 'toneLut', compared, mismatched });
    expect(mismatched).toBe(0);
  });

  test('Lanczos tap tables agree for the fit of every deck crop', () => {
    const cases: [number, number, number, number][] = [];
    for (const { treatment } of twoToneAssets) {
      const crop = treatment.crop ?? [0, 0, 1600, 900];
      const w = Math.round(crop[2]) - Math.round(crop[0]);
      const h = Math.round(crop[3]) - Math.round(crop[1]);
      const box = coverBox(w, h, 800, 450);
      cases.push([w, box[0], box[2], 800], [h, box[1], box[3], 450]);
    }
    cases.push(
      [3200, 0, 3200, 800],
      [1800, 0, 1800, 450],
      [137, 3.37, 131.2, 40],
      [137, 0, 137, 300],
    );
    let mismatched = 0;
    for (const backend of nativeBackends) {
      for (const [inSize, in0, in1, outSize] of cases) {
        const a = ts.lanczosCoeffs(inSize, in0, in1, outSize);
        const b = backend.lanczosCoeffs(inSize, in0, in1, outSize);
        const ok = a.ksize === b.ksize && sameBytes(a.bounds, b.bounds) && sameBytes(a.kk, b.kk);
        if (!ok) {
          mismatched += 1;
          report.rows.push({
            check: 'lanczos',
            backend: backend.kind,
            inSize,
            in0,
            in1,
            outSize,
            ok,
          });
        }
      }
    }
    report.rows.push({
      check: 'lanczos',
      compared: cases.length * nativeBackends.length,
      mismatched,
    });
    expect(mismatched).toBe(0);
  });

  test('Gaussian kernels agree for the deck blur radii and the unsharp radius', () => {
    const sigmas = [0.4, 0.5, 0.6, 1, 2, 8];
    let mismatched = 0;
    for (const backend of nativeBackends) {
      for (const sigma of sigmas) {
        const a = ts.gaussianKernel(sigma);
        const b = backend.gaussianKernel(sigma);
        if (!sameBytes(a, b)) {
          mismatched += 1;
          report.rows.push({ check: 'gaussian', backend: backend.kind, sigma, ok: false });
        }
      }
    }
    report.rows.push({
      check: 'gaussian',
      compared: sigmas.length * nativeBackends.length,
      mismatched,
    });
    expect(mismatched).toBe(0);
  });
});

describe.skipIf(!hasNative)('diffs', () => {
  function shifted(image: RgbaImage, dx: number): RgbaImage {
    const out = new Uint8Array(image.data.length);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const sx = Math.min(image.width - 1, Math.max(0, x - dx));
        out.set(
          image.data.subarray((y * image.width + sx) * 4, (y * image.width + sx) * 4 + 4),
          (y * image.width + x) * 4,
        );
      }
    }
    return { width: image.width, height: image.height, data: out };
  }

  function translucent(width: number, height: number, seed: number): RgbaImage {
    const data = new Uint8Array(width * height * 4);
    let s = seed;
    for (let i = 0; i < data.length; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s >> 16) & 255;
    }
    return { width, height, data };
  }

  test('the pixelmatch port counts and paints what the npm package does', async () => {
    const src = await decodeImage(join(FIXTURES, 'pillow', 'src.png'));
    const dark = await decodeImage(join(DECK_DIR, 'assets', 'opener-brand-dark.jpg'));
    const light = await decodeImage(join(DECK_DIR, 'assets', 'opener-brand-light.jpg'));
    const darkCrop = cropRgba(dark, [300, 200, 400, 225]);
    const lightCrop = cropRgba(light, [300, 200, 400, 225]);
    if (!darkCrop || !lightCrop) throw new Error('crop outside the twin');
    const pairs: [string, RgbaImage, RgbaImage][] = [
      ['src vs src', src, src],
      ['src vs shifted 1', src, shifted(src, 1)],
      ['src vs shifted 3', src, shifted(src, 3)],
      ['twin dark vs light crop', darkCrop, lightCrop],
      ['translucent noise', translucent(64, 48, 7), translucent(64, 48, 11)],
      [
        'translucent vs opaque',
        translucent(40, 40, 3),
        src.width >= 40 ? (cropRgba(src, [0, 0, 40, 40]) ?? src) : src,
      ],
    ];
    const options = [
      { threshold: 0.1, includeAA: false, checkerboard: true },
      { threshold: 0.1, includeAA: true, checkerboard: true },
      { threshold: 0, includeAA: false, checkerboard: false },
      { threshold: 0.3, includeAA: false, checkerboard: true },
    ];
    let compared = 0;
    for (const [name, a, b] of pairs) {
      if (a.width !== b.width || a.height !== b.height) continue;
      for (const opt of options) {
        const out = new Uint8Array(a.width * a.height * 4);
        const want = pixelmatch(a.data, b.data, out, a.width, a.height, opt);
        for (const backend of nativeBackends) {
          const got = backend.diffPixelmatch(a, b, { ...opt, output: true });
          compared += 1;
          const outputSame = got.output ? sameBytes(got.output.data, out) : false;
          if (got.mismatched !== want || !outputSame) {
            report.rows.push({
              check: 'pixelmatch',
              backend: backend.kind,
              pair: name,
              options: opt,
              want,
              got: got.mismatched,
              outputSame,
            });
          }
          expect(got.mismatched, `${backend.kind} ${name} ${JSON.stringify(opt)}`).toBe(want);
          expect(outputSame, `${backend.kind} ${name} diff image`).toBe(true);
        }
      }
    }
    report.rows.push({ check: 'pixelmatch', compared, mismatched: 0 });
  });

  test('exact diffs agree', async () => {
    const src = await decodeImage(join(FIXTURES, 'pillow', 'src.png'));
    const moved = shifted(src, 2);
    const want = ts.diffExact(src, moved);
    for (const backend of nativeBackends) {
      expect(backend.diffExact(src, moved)).toEqual(want);
      expect(backend.diffExact(src, src).mismatched).toBe(0);
    }
  });

  test('DSSIM agrees with the TypeScript definition', async () => {
    const dark = await decodeImage(join(DECK_DIR, 'assets', 'mood-wave-dark.jpg'));
    const light = await decodeImage(join(DECK_DIR, 'assets', 'mood-wave-light.jpg'));
    const a = cropRgba(dark, [200, 100, 320, 180]);
    const b = cropRgba(light, [200, 100, 320, 180]);
    const c = cropRgba(dark, [201, 100, 320, 180]);
    if (!a || !b || !c) throw new Error('crop outside the twin');
    const src = await decodeImage(join(FIXTURES, 'pillow', 'src.png'));
    const cases: [string, RgbaImage, RgbaImage][] = [
      ['identical', a, a],
      ['twin vs inverse twin', a, b],
      ['one pixel shift', a, c],
      ['pillow src vs shifted', src, shifted(src, 1)],
      ['tiny', cropRgba(src, [0, 0, 8, 8]) ?? src, cropRgba(src, [1, 0, 8, 8]) ?? src],
    ];
    for (const [name, x, y] of cases) {
      const want = ts.dssim(x, y);
      for (const backend of nativeBackends) {
        const got = backend.dssim(x, y);
        const delta = Math.abs(got.dssim - want.dssim);
        report.rows.push({
          check: 'dssim',
          backend: backend.kind,
          pair: name,
          size: [x.width, x.height],
          typescript: want,
          native: got,
          delta,
        });
        expect(got.scales, `${backend.kind} ${name}`).toBe(want.scales);
        expect(delta, `${backend.kind} ${name}: ${got.dssim} vs ${want.dssim}`).toBeLessThanOrEqual(
          1e-9 * Math.max(1, Math.abs(want.dssim)),
        );
      }
      if (name === 'identical') expect(want.dssim).toBe(0);
      if (name === 'twin vs inverse twin') expect(want.dssim).toBeGreaterThan(0.5);
    }
  });
});
