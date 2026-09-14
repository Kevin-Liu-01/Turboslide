import { describe, expect, it } from 'vitest';

import { bayer8 } from '../dither';

// The deck's 8 by 8 Bayer screen is a permutation of 0..63 (SPEC 5.4, tail:100-103).
describe('bayer8', () => {
  it('is a permutation of 0 to 63', () => {
    const seen = new Set<number>();
    for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) seen.add(bayer8(r, c));
    expect(seen.size).toBe(64);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(63);
  });

  it('matches the deck at the corners', () => {
    expect(bayer8(0, 0)).toBe(0);
    expect(bayer8(0, 4)).toBe(2);
    expect(bayer8(4, 0)).toBe(3);
    expect(bayer8(4, 4)).toBe(1);
    expect(bayer8(1, 1)).toBe(16);
  });

  it('wraps', () => {
    expect(bayer8(9, 10)).toBe(bayer8(1, 2));
  });
});

// Round three (gslides-parity SPEC-3 10.2, 10.3): the hosts of the live overlay.
import type { DitherWorkerLike, DitherWorkerReply, DitherWorkerRequest } from '../dither';
import { baseKeyOf, imageDataOf, specOfRequest, workerDitherHost } from '../dither';

class FakeImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

describe('the dither hosts', () => {
  it('turns a base request into the effects spec and a key that ignores the tone fields', () => {
    const request = {
      key: 'k',
      source: 'assets/x.source.jpg',
      screen: [400, 225] as [number, number],
      trim: { left: 0.1, right: 0, top: 0, bottom: 0 },
      channel: 'gray' as const,
      invert: false,
      minFilter: 0,
      blur: 0.6,
      color: false,
    };
    expect(specOfRequest(request)).toEqual({
      screen: [400, 225],
      trim: { left: 0.1, right: 0, top: 0, bottom: 0 },
      channel: 'gray',
      invert: false,
      minFilter: 0,
      blur: 0.6,
      color: false,
    });
    expect(baseKeyOf(request).startsWith('assets/x.source.jpg|')).toBe(true);
    expect(baseKeyOf({ ...request, blur: 0 })).not.toBe(baseKeyOf(request));
  });

  it('wraps a plane as ImageData', () => {
    const globals = globalThis as unknown as { ImageData?: unknown };
    const before = globals.ImageData;
    globals.ImageData = FakeImageData;
    try {
      const image = imageDataOf({
        width: 2,
        height: 1,
        data: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
      });
      expect(image.width).toBe(2);
      expect(image.height).toBe(1);
      expect([...image.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    } finally {
      globals.ImageData = before;
    }
  });

  it('drives the worker protocol: a prepared base, frames by id, a stale answer as null, a release message', async () => {
    const sent: DitherWorkerRequest[] = [];
    let listener: ((event: MessageEvent<unknown>) => void) | null = null;
    const worker: DitherWorkerLike = {
      postMessage: (message) => {
        const request = message as DitherWorkerRequest;
        sent.push(request);
        const reply = ((): DitherWorkerReply | null => {
          if (request.kind === 'prepare')
            return { kind: 'prepared', id: request.id, key: request.key, ok: true, ms: 1 };
          if (request.kind === 'frame')
            return request.dither.black === 999
              ? { kind: 'stale', id: request.id, key: request.key, ok: false }
              : {
                  kind: 'frame',
                  id: request.id,
                  key: request.key,
                  ok: true,
                  image: {} as ImageBitmap,
                  width: 4,
                  height: 2,
                  litFraction: 0.5,
                  ms: 2,
                };
          return null;
        })();
        if (reply !== null)
          queueMicrotask(() => listener?.({ data: reply } as MessageEvent<unknown>));
      },
      addEventListener: (_type, fn) => {
        listener = fn;
      },
      terminate: () => undefined,
    };
    const host = workerDitherHost(worker);
    const globals = globalThis as unknown as { createImageBitmap?: unknown; Image?: unknown };
    const fakeImage = {
      complete: true,
      naturalWidth: 10,
      currentSrc: 'x',
      src: 'x',
      decode: async () => undefined,
    };
    globals.createImageBitmap = async () => ({}) as ImageBitmap;
    try {
      await host.prepare({
        key: 'k',
        source: fakeImage as unknown as HTMLImageElement,
        screen: [4, 2],
        channel: 'gray',
        invert: false,
        minFilter: 0,
        blur: 0,
        color: false,
      });
      expect(sent[0]?.kind).toBe('prepare');
      const frame = await host.frame({
        key: 'k',
        id: 1,
        dither: { pattern: 'bayer8' },
        theme: 'dark',
      });
      expect(frame?.width).toBe(4);
      expect(frame?.litFraction).toBe(0.5);
      const stale = await host.frame({
        key: 'k',
        id: 2,
        dither: { pattern: 'bayer8', black: 999 },
        theme: 'dark',
      });
      expect(stale).toBeNull();
      host.release('k');
      expect(sent.at(-1)).toEqual({ kind: 'release', key: 'k' });
      // a second prepare of the same key sends nothing more
      await host.prepare({
        key: 'k2',
        source: fakeImage as unknown as HTMLImageElement,
        screen: [4, 2],
        channel: 'gray',
        invert: false,
        minFilter: 0,
        blur: 0,
        color: false,
      });
      const prepares = sent.filter((m) => m.kind === 'prepare').length;
      await host.prepare({
        key: 'k2',
        source: fakeImage as unknown as HTMLImageElement,
        screen: [4, 2],
        channel: 'gray',
        invert: false,
        minFilter: 0,
        blur: 0,
        color: false,
      });
      expect(sent.filter((m) => m.kind === 'prepare').length).toBe(prepares);
    } finally {
      delete globals.createImageBitmap;
    }
  });
});
