// @vitest-environment jsdom
// The live dither overlay's DOM half (gslides-parity SPEC-3 10.2, 10.3): the root's attributes read
// back, the base request keyed by the source and region and not by the tone fields, a frame drawn
// on the overlay canvas through a fake host with the canvas unhidden and the frame event fired, a
// stale answer dropped, the newest of two overlapping requests winning, the preview path making a
// canvas over a materialized picture, and Play hiding the overlay.
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DitherFramePayload, DitherHost } from '../dither-runtime.ts';
import {
  DITHER_FRAME_EVENT,
  baseRequestOf,
  parseAdjust,
  parsePosition,
  parseTrim,
  previewDither,
  readOverlay,
  setMaterialPlay,
  syncDitherOverlays,
} from '../dither-runtime.ts';

const KEY = 'a'.repeat(64);

function pictureHtml(state: 'live' | 'variant', extra = ''): string {
  return `<div class="wrap" style="width:800px;height:450px"><div class="picture" data-block="bg" data-dither='{"pattern":"bayer8","black":120}' data-dither-key="${KEY}" data-dither-state="${state}" data-dither-source="assets/x.source.jpg" data-trim="0.1,0.2,0,0"${extra}><img class="picture-img" src="assets/x-light.png" data-light="assets/x-light.png" data-dark="assets/x-dark.png" width="1600" height="900" style="object-position:top;filter:brightness(1.2) contrast(0.9)">${
    state === 'live'
      ? '<canvas class="picture-dither" width="400" height="225" hidden aria-hidden="true"></canvas>'
      : ''
  }</div></div>`;
}

function fakeHost(overrides: Partial<DitherHost> = {}): DitherHost & { calls: string[] } {
  const calls: string[] = [];
  const payload = (w: number, h: number): DitherFramePayload => ({
    image: new ImageData(w, h),
    width: w,
    height: h,
    litFraction: 0.25,
    ms: 1,
  });
  return {
    calls,
    prepare: async (request) => {
      calls.push(`prepare ${request.screen.join('x')}`);
    },
    frame: async (request) => {
      calls.push(`frame ${request.id} ${request.theme} ${JSON.stringify(request.dither)}`);
      const [w, h] = [400, 225];
      return payload(w, h);
    },
    release: (key) => {
      calls.push(`release ${key.length}`);
    },
    ...overrides,
  };
}

/* jsdom has neither ImageData nor a 2d context: a minimal ImageData and a stub context record the draw */
class FakeImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}
(globalThis as unknown as { ImageData: unknown }).ImageData = FakeImageData;

const draws: string[] = [];
const contextStub = {
  clearRect: () => undefined,
  putImageData: (image: ImageData) => {
    draws.push(`put ${image.width}x${image.height}`);
  },
  drawImage: () => {
    draws.push('drawImage');
  },
};
HTMLCanvasElement.prototype.getContext = (() =>
  contextStub as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext;

afterEach(() => {
  document.body.innerHTML = '';
  draws.length = 0;
});

describe('readOverlay', () => {
  it('reads the field, the key, the state, the source, the trim, the position, the adjustments and the box', () => {
    document.body.innerHTML = pictureHtml('live');
    const overlay = readOverlay(document.querySelector('.picture') as Element);
    if (overlay === null) throw new Error('no overlay');
    expect(overlay.blockId).toBe('bg');
    expect(overlay.dither).toEqual({ pattern: 'bayer8', black: 120 });
    expect(overlay.key).toBe(KEY);
    expect(overlay.state).toBe('live');
    expect(overlay.source).toBe('assets/x.source.jpg');
    expect(overlay.trim).toEqual({ left: 0.1, right: 0.2, top: 0, bottom: 0 });
    expect(overlay.position).toBe('top');
    expect(overlay.adjust).toEqual({ brightness: 0.2, contrast: -0.1 });
    expect(overlay.box).toEqual([800, 450]);
    expect(overlay.canvas).not.toBeNull();
    expect(parseTrim('bad')).toBeUndefined();
    expect(parsePosition('opacity:0.5')).toBeUndefined();
    expect(parseAdjust('opacity:0.5')).toBeUndefined();
  });

  it('keys the base by the source, the screen, the region and the pre fit filters, never the tone fields', () => {
    document.body.innerHTML = pictureHtml('live');
    const overlay = readOverlay(document.querySelector('.picture') as Element);
    if (overlay === null) throw new Error('no overlay');
    const a = baseRequestOf(overlay, { pattern: 'bayer8', black: 120 });
    const b = baseRequestOf(overlay, { pattern: 'blue64', black: 10, white: 200, gamma: 1.4 });
    expect(a.key).toBe(b.key);
    expect(a.screen).toEqual([400, 225]);
    const c = baseRequestOf(overlay, { pattern: 'bayer8', cell: 1 });
    expect(c.key).not.toBe(a.key);
    expect(c.screen).toEqual([800, 450]);
    const d = baseRequestOf(overlay, { pattern: 'bayer8', blur: 0.6 });
    expect(d.key).not.toBe(a.key);
    const e = baseRequestOf(overlay, { pattern: 'bayer8', strength: 0.5 });
    expect(e.color).toBe(true);
    expect(e.key).not.toBe(a.key);
  });
});

describe('the live editor render', () => {
  it('finds the block through its freeform wrapper when the render carries no block attributes', async () => {
    document.body.innerHTML = `<div class="free" data-free="bg" style="width:800px;height:450px"><div class="picture" data-dither='{"pattern":"bayer8"}' data-dither-key="${KEY}" data-dither-state="variant" data-dither-source="assets/x.source.jpg"><img class="picture-img" src="assets/x-light.png" width="1600" height="900"></div></div>`;
    const overlay = readOverlay(document.querySelector('.picture') as Element);
    expect(overlay?.blockId).toBe('bg');
    expect(overlay?.box).toEqual([800, 450]);
    const host = fakeHost();
    expect(previewDither(document.body, 'bg', { pattern: 'bayer8', black: 40 }, host, 'dark')).toBe(
      true,
    );
    await vi.waitFor(() => expect(draws.length).toBe(1));
  });
});

describe('syncDitherOverlays', () => {
  it('prepares once, draws the frame on the canvas, unhides it and fires the frame event', async () => {
    document.body.innerHTML = pictureHtml('live');
    const host = fakeHost();
    const events: CustomEvent[] = [];
    document.addEventListener(DITHER_FRAME_EVENT, (event) => events.push(event as CustomEvent));
    await syncDitherOverlays(document.body, host, 'dark');
    const canvas = document.querySelector('canvas.picture-dither') as HTMLCanvasElement;
    expect(canvas.hidden).toBe(false);
    expect(draws).toEqual(['put 400x225']);
    expect(host.calls.filter((c) => c.startsWith('prepare'))).toEqual(['prepare 400x225']);
    expect(host.calls.filter((c) => c.startsWith('frame')).length).toBe(1);
    expect(events.length).toBe(1);
    expect(events[0]?.detail.blockId).toBe('bg');
    expect(events[0]?.detail.litFraction).toBe(0.25);
    // a second sync with the same base prepares nothing more
    await syncDitherOverlays(document.body, host, 'light');
    expect(host.calls.filter((c) => c.startsWith('prepare')).length).toBe(1);
    expect(host.calls.filter((c) => c.startsWith('frame')).length).toBe(2);
  });

  it('leaves a materialized picture alone until a preview asks for a canvas', async () => {
    document.body.innerHTML = pictureHtml('variant');
    const host = fakeHost();
    await syncDitherOverlays(document.body, host, 'dark');
    expect(document.querySelector('canvas.picture-dither')).toBeNull();
    expect(host.calls).toEqual([]);
    const ok = previewDither(document.body, 'bg', { pattern: 'bayer8', black: 40 }, host, 'dark');
    expect(ok).toBe(true);
    await vi.waitFor(() => expect(draws.length).toBe(1));
    const canvas = document.querySelector('canvas.picture-dither') as HTMLCanvasElement;
    expect(canvas.hidden).toBe(false);
    expect(host.calls.some((c) => c.includes('"black":40'))).toBe(true);
    // clearing the preview hides the canvas again on a variant picture
    previewDither(document.body, 'bg', null, host, 'dark');
    await vi.waitFor(() => expect(canvas.hidden).toBe(true));
    expect(previewDither(document.body, 'missing', { pattern: 'bayer8' }, host, 'dark')).toBe(
      false,
    );
  });

  it('drops a stale answer and lets the newest overlapping request win', async () => {
    document.body.innerHTML = pictureHtml('live');
    let release: (() => void) | null = null;
    const host = fakeHost({
      frame: async (request) => {
        host.calls.push(`frame ${request.id} ${request.theme} ${JSON.stringify(request.dither)}`);
        if (request.id === 1) await new Promise<void>((resolve) => (release = resolve));
        return {
          image: new ImageData(400, 225),
          width: 400,
          height: 225,
          litFraction: request.id / 10,
          ms: 1,
        };
      },
    });
    const first = syncDitherOverlays(document.body, host, 'dark');
    await vi.waitFor(() => expect(release).not.toBeNull());
    // two more requests while the first is in flight: only the last is sent after it settles
    void previewDither(document.body, 'bg', { pattern: 'bayer8', black: 10 }, host, 'dark');
    void previewDither(document.body, 'bg', { pattern: 'bayer8', black: 20 }, host, 'dark');
    (release as unknown as () => void)();
    await first;
    await vi.waitFor(() => expect(draws.length).toBe(2));
    expect(host.calls.filter((c) => c.startsWith('frame')).length).toBe(2);
    expect(host.calls.some((c) => c.includes('"black":20'))).toBe(true);
    expect(host.calls.some((c) => c.includes('"black":10'))).toBe(false);
  });

  it('a null answer (the host dropped a stale request) draws nothing', async () => {
    document.body.innerHTML = pictureHtml('live');
    const host = fakeHost({ frame: async () => null });
    await syncDitherOverlays(document.body, host, 'dark');
    expect(draws).toEqual([]);
    expect((document.querySelector('canvas.picture-dither') as HTMLCanvasElement).hidden).toBe(
      true,
    );
  });

  it('Play hides the overlay of the named block and stopping draws it again', async () => {
    document.body.innerHTML = pictureHtml('live');
    const host = fakeHost();
    await syncDitherOverlays(document.body, host, 'dark');
    const canvas = document.querySelector('canvas.picture-dither') as HTMLCanvasElement;
    expect(canvas.hidden).toBe(false);
    setMaterialPlay(document.body, 'bg', host, 'dark');
    await vi.waitFor(() => expect(canvas.hidden).toBe(true));
    setMaterialPlay(document.body, null, host, 'dark');
    await vi.waitFor(() => expect(canvas.hidden).toBe(false));
  });
});
