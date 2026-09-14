// The block level dither in the worker (gslides-parity SPEC-3 10.2, 10.10 `dither.worker.test.ts`):
// the worker's stages equal `ditherPicture` cell for cell on the fixture, a stale request is
// dropped, the tone base is reused across slider requests (the fit runs once per source and
// region), and a release forgets it. The pure functions run in Node; the OffscreenCanvas half is
// the browser's and is covered by dither.spec.ts.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { baseSpecOf, ditherPicture } from '@turboslide/effects/pipeline';
import { decodeImage } from '@turboslide/effects/io';
import { selectBackend } from '@turboslide/effects/select';
import type { EffectsBackend } from '@turboslide/effects/backend';
import type { PictureDither } from '@turboslide/schema/blocks/dither';

import {
  blockFrame,
  newBlockDitherState,
  prepareBlockBase,
  previewScreen,
  previewTwoTone,
} from './dither.worker';
import type { DitherTreatment, ScreenFn } from './dither.worker';

const REPO = resolve(import.meta.dirname, '../../../..');
const SOURCE = join(REPO, 'packages/effects/fixtures/pillow/src.png');
const source = await decodeImage(readFileSync(SOURCE));
const box = { width: 800, height: 450 };
const dither: PictureDither = { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 };

/* the wasm module as Node loads it (packages/native/wasm, the committed output of gslides-parity
   SPEC-4 0.38), null when it is not built; TURBOSLIDE_NATIVE_REQUIRED=1 makes that a failure */
const required = process.env.TURBOSLIDE_NATIVE_REQUIRED === '1';
let wasm: EffectsBackend | null = null;
try {
  wasm = selectBackend('wasm');
} catch {
  wasm = null;
}
if (required && wasm === null)
  throw new Error('TURBOSLIDE_NATIVE_REQUIRED=1 and the wasm module is not built');

describe('the dither worker (block level)', () => {
  it('answers the same plane as ditherPicture in Node, bit for bit, for both themes', () => {
    const state = newBlockDitherState();
    prepareBlockBase(state, 'k', source, baseSpecOf(dither, box));
    for (const theme of ['light', 'dark'] as const) {
      const frame = blockFrame(state, {
        kind: 'frame',
        id: theme === 'light' ? 1 : 2,
        key: 'k',
        dither,
        theme,
      });
      if (frame === null) throw new Error('no frame');
      const reference = ditherPicture(source, box, dither, theme);
      expect(frame.plane.width).toBe(reference.plane.width);
      expect(Buffer.from(frame.plane.data).equals(Buffer.from(reference.plane.data))).toBe(true);
      expect(frame.litFraction).toBe(reference.metrics.litFraction);
    }
  });

  it('drops a request older than the newest served for its key, and answers null for an unknown key', () => {
    const state = newBlockDitherState();
    prepareBlockBase(state, 'k', source, baseSpecOf(dither, box));
    expect(
      blockFrame(state, { kind: 'frame', id: 5, key: 'k', dither, theme: 'dark' }),
    ).not.toBeNull();
    expect(blockFrame(state, { kind: 'frame', id: 3, key: 'k', dither, theme: 'dark' })).toBeNull();
    expect(
      blockFrame(state, { kind: 'frame', id: 6, key: 'k', dither, theme: 'dark' }),
    ).not.toBeNull();
    expect(
      blockFrame(state, { kind: 'frame', id: 7, key: 'other', dither, theme: 'dark' }),
    ).toBeNull();
  });

  it('reuses the base across slider requests: one prepare, many frames, until the key is released', () => {
    const state = newBlockDitherState();
    const base = prepareBlockBase(state, 'k', source, baseSpecOf(dither, box));
    const frames = [10, 40, 80, 120].map((black, i) =>
      blockFrame(state, {
        kind: 'frame',
        id: i + 1,
        key: 'k',
        dither: { ...dither, black },
        theme: 'dark',
      }),
    );
    expect(frames.every((f) => f !== null)).toBe(true);
    expect(state.bases.size).toBe(1);
    expect(state.bases.get('k')).toBe(base);
    // the frames differ (the ink point moved) while the base stayed
    const a = frames[0]?.plane.data ?? new Uint8Array();
    const b = frames[3]?.plane.data ?? new Uint8Array();
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    state.bases.delete('k');
    expect(blockFrame(state, { kind: 'frame', id: 9, key: 'k', dither, theme: 'dark' })).toBeNull();
  });
});

// The asset level preview on the wasm module (gslides-parity SPEC-4 0.38, 3.9; MILESTONES-4 B4
// item 6): the worker cuts its screen with the module's `twoToneScreen` once mounted and with the
// TypeScript stages otherwise; the two light the same cells on the two tone fixture, so the mount
// changes the time and never the picture (docs/native.md "Parity results" is the wider claim).
describe.skipIf(wasm === null)('the dither worker (asset level) on the wasm module', () => {
  const twoTone = JSON.parse(
    readFileSync(join(REPO, 'packages/effects/fixtures/two-tone/manifest.json'), 'utf8'),
  ) as { golden: { source: string; params: DitherTreatment } };

  it('cuts the same screen as the TypeScript stages on the two tone fixture, cell for cell, both twins', async () => {
    const rgba = await decodeImage(
      readFileSync(join(REPO, 'packages/effects/fixtures/two-tone', twoTone.golden.source)),
    );
    const screen: ScreenFn = (image, params) => wasm!.twoToneScreen(image, params);
    const plate: [number, number, number, number] = [137, 500, 740, 271];
    const onWasm = previewTwoTone(rgba, twoTone.golden.params, plate, screen);
    const inTypeScript = previewTwoTone(rgba, twoTone.golden.params, plate, previewScreen);
    expect(onWasm.darkBits.width).toBe(800);
    expect(onWasm.darkBits.height).toBe(450);
    expect(Buffer.from(onWasm.darkBits.bits).equals(Buffer.from(inTypeScript.darkBits.bits))).toBe(
      true,
    );
    expect(
      Buffer.from(onWasm.lightBits.bits).equals(Buffer.from(inTypeScript.lightBits.bits)),
    ).toBe(true);
    expect(onWasm.metrics).toEqual(inTypeScript.metrics);
    // the treatment's defaults agree too: a minimal treatment goes through both the same way
    const minimal: DitherTreatment = { black: 20, gamma: 1 };
    const a = previewTwoTone(rgba, minimal, undefined, screen);
    const b = previewTwoTone(rgba, minimal, undefined, previewScreen);
    expect(Buffer.from(a.darkBits.bits).equals(Buffer.from(b.darkBits.bits))).toBe(true);
  });
});
