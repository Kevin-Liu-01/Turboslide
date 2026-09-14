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
import type { PictureDither } from '@turboslide/schema/blocks/dither';

import { blockFrame, newBlockDitherState, prepareBlockBase } from './dither.worker';

const REPO = resolve(import.meta.dirname, '../../../..');
const SOURCE = join(REPO, 'packages/effects/fixtures/pillow/src.png');
const source = await decodeImage(readFileSync(SOURCE));
const box = { width: 800, height: 450 };
const dither: PictureDither = { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 };

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
