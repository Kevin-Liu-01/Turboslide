// The material capture (SPEC 5.4; MILESTONES M5 item 3) against a real browser: a plain gem smoke
// frame and a two-tone liquid metal frame at the deck's recorded recipe, both 3200 by 1800, with
// the recipe key reproduced from the record, exact inverse twins, and the plate clear (the M5
// acceptance shape for `material capture paper:liquid-metal ... --two-tone --plate lower-left`).
// Also the treatment path alone against the committed opener pair: the pair's screen, scaled to a
// 1600 by 900 frame, comes back through the resampler and the threshold within the floor the
// effects package recorded (88 of 360 000 cells). The browser tests are skipped when
// TURBOSLIDE_SKIP_BROWSER is set.
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { bitsFromGray, cellAgreement } from '@turboslide/effects/diff';
import type { RgbaImage } from '@turboslide/effects/image';
import { decodeImage } from '@turboslide/effects/io';
import { scaleNearest } from '@turboslide/effects/resample';
import { toGray } from '@turboslide/effects/tone';
import { twoTone } from '@turboslide/effects/two-tone';
import { launchBrowser } from '@turboslide/headless/launch';
import type { LaunchedBrowser } from '@turboslide/headless/launch';
import { readTwinBits } from '@turboslide/headless/capture/twins';
import { assetSchema } from '@turboslide/schema/assets';

import { captureDocument, captureMaterial, paperDistDir, parseRecipeFile } from './capture.ts';
import { recipeKey } from './recipe-key.ts';

const REPO = join(import.meta.dirname, '..', '..', '..');
const FIXTURE = join(REPO, 'packages/effects/fixtures/two-tone');
const skipBrowser = process.env.TURBOSLIDE_SKIP_BROWSER !== undefined;

let dir: string;
let browser: LaunchedBrowser | undefined;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'turboslide-material-'));
  await mkdir(join(dir, 'assets'), { recursive: true });
  if (!skipBrowser) browser = await launchBrowser();
});

afterAll(async () => {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('the capture page', () => {
  test('resolves the shader dist and serves a module document', () => {
    const dist = paperDistDir();
    expect(existsSync(join(dist, 'index.js'))).toBe(true);
    expect(existsSync(join(dist, 'shader-mount.js'))).toBe(true);
    const html = captureDocument();
    expect(html).toContain("import * as paper from './paper/index.js'");
    expect(html).toContain('width: 1600px; height: 900px');
  });

  test('reads a recipe sidecar and a bare uniform record', () => {
    expect(parseRecipeFile({ u_scale: 0.5, u_shape: 3 })).toEqual({
      uniforms: { u_scale: 0.5, u_shape: 3 },
    });
    const sidecar = parseRecipeFile({
      materialId: 'paper:liquid-metal',
      preset: 'diamond',
      uniforms: { u_scale: 0.5 },
      timeMs: 5500,
      twoTone: true,
      treatment: { crop: [-1325, 105, 2709, 2374], black: 20 },
      plate: 'lower-left',
    });
    expect(sidecar).toEqual({
      materialId: 'paper:liquid-metal',
      preset: 'diamond',
      uniforms: { u_scale: 0.5 },
      anchor: 5500,
      twoTone: true,
      treatment: { crop: [-1325, 105, 2709, 2374], black: 20 },
      plate: 'lower-left',
    });
  });
});

describe('the treatment path over the committed opener pair', () => {
  test('reproduces the pair within the recorded floor', async () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURE, 'manifest.json'), 'utf8')) as {
      pair: { dark: string; recorded: { mismatchedCells: number } };
    };
    const committed = bitsFromGray(toGray(await decodeImage(join(FIXTURE, manifest.pair.dark))), 1);
    // the screen as a 1600 by 900 frame, one cell per 2 by 2 block, paper on ink
    const scaled = scaleNearest(committed, 2);
    const frame: RgbaImage = {
      width: scaled.width,
      height: scaled.height,
      data: new Uint8Array(scaled.width * scaled.height * 4),
    };
    for (let i = 0; i < scaled.bits.length; i += 1) {
      const v = scaled.bits[i] === 1 ? 255 : 0;
      frame.data[i * 4] = v;
      frame.data[i * 4 + 1] = v;
      frame.data[i * 4 + 2] = v;
      frame.data[i * 4 + 3] = 255;
    }
    const result = twoTone(frame, {
      crop: [0, 0, frame.width, frame.height],
      polarity: 'dark-ground',
    });
    const agreement = cellAgreement(result.positive, committed);
    expect(agreement.cells).toBe(360000);
    expect(agreement.mismatched).toBeLessThanOrEqual(manifest.pair.recorded.mismatchedCells);
  });
});

describe.skipIf(skipBrowser)('material capture in the browser', () => {
  test('a plain gem smoke frame at the brand blue preset is a 3200 by 1800 neutral twin with its key', async () => {
    if (browser === undefined) throw new Error('no browser');
    const result = await captureMaterial(
      {
        materialId: 'paper:gem-smoke',
        preset: 'brand-blue',
        anchors: [5500],
        id: 'smoke',
        role: 'opener',
      },
      { deckDir: dir, browser },
    );
    expect(result.frames).toHaveLength(1);
    const frame = result.frames[0];
    if (frame === undefined) throw new Error('no frame');
    expect(assetSchema.safeParse(frame.asset).success).toBe(true);
    expect(frame.asset.twins).toEqual({ neutral: 'assets/smoke@2x.png' });
    expect(frame.asset.size).toEqual([3200, 1800]);
    expect(frame.asset.scale).toBe(2);
    expect(frame.asset.source.kind).toBe('material');
    if (frame.asset.source.kind !== 'material') return;
    expect(frame.asset.source.recipeKey).toBe(recipeKey(frame.asset.source));
    expect(frame.asset.source.renderer).toBe(browser.renderer);
    expect(frame.asset.source.uniforms.u_colorBack).toBe('#2f5ce0');
    expect(frame.asset.credit).toBe('Material: gem smoke, Paper Shaders, rendered in Turboslide');
    const decoded = await decodeImage(join(dir, 'assets/smoke@2x.png'));
    expect([decoded.width, decoded.height]).toEqual([3200, 1800]);
    // the ground is the brand blue somewhere in the frame
    let blue = 0;
    for (let i = 0; i < decoded.data.length; i += 4 * 997) {
      const r = decoded.data[i] ?? 0;
      const g = decoded.data[i + 1] ?? 0;
      const b = decoded.data[i + 2] ?? 0;
      if (b > 150 && b > r + 40 && b > g + 20) blue += 1;
    }
    expect(blue).toBeGreaterThan(100);
    expect(existsSync(join(dir, 'assets/smoke.recipe.json'))).toBe(true);
  });

  test('the liquid metal diamond at the recorded recipe, two-tone, clears the opener plate', async () => {
    if (browser === undefined) throw new Error('no browser');
    const request = {
      materialId: 'paper:liquid-metal',
      preset: 'diamond',
      anchors: [5500],
      id: 'liquid-metal-diamond',
      role: 'opener' as const,
      twoTone: true,
      treatment: { crop: [-1325, 105, 2709, 2374] as [number, number, number, number], black: 20 },
      plate: 'lower-left' as const,
    };
    const result = await captureMaterial(request, { deckDir: dir, browser });
    const frame = result.frames[0];
    if (frame === undefined) throw new Error('no frame');
    expect(frame.asset.twins).toEqual({
      light: 'assets/liquid-metal-diamond-light.png',
      dark: 'assets/liquid-metal-diamond-dark.png',
    });
    expect(frame.asset.size).toEqual([1600, 900]);
    expect(frame.asset.inline).toBe('two-color');
    expect(frame.asset.treatment).toMatchObject({
      kind: 'two-tone',
      crop: [-1325, 105, 2709, 2374],
      black: 20,
    });
    expect(frame.asset.metrics?.plateClear).toMatchObject({
      plate: [137, 500, 740, 271],
      litUnder: 0,
    });
    expect(frame.asset.metrics?.litFraction).toBeGreaterThan(0.005);
    if (frame.asset.source.kind !== 'material') throw new Error('not a material source');
    expect(frame.asset.source.recipeKey).toBe(recipeKey(frame.asset.source));
    expect(frame.asset.source.uniforms.u_shape).toBe(3);
    const bits = await readTwinBits(dir, frame.asset);
    expect(bits.inverseMismatch).toBe(0);
    // the same recipe at the same anchor on the same backend is the same frame
    const again = await captureMaterial(
      { ...request, id: 'liquid-metal-diamond-again' },
      { deckDir: dir, browser },
    );
    const second = again.frames[0];
    if (second === undefined) throw new Error('no second frame');
    if (second.asset.source.kind !== 'material') throw new Error('not a material source');
    expect(second.asset.source.recipeKey).toBe(frame.asset.source.recipeKey);
    const secondBits = await readTwinBits(dir, second.asset);
    expect(cellAgreement(bits.dark, secondBits.dark).mismatched).toBe(0);
  });
});
