import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The next move's pictures (the slide motion round): the stage decodes the pictures of the slides
// beside the one shown, the way the last move went first, once that slide has settled, so a move
// onto a slide with a large picture no longer waits for its fetch and its decode on its first frame.

type AheadModule = typeof import('../slide-ahead');

const decoded: string[] = [];

class FakeImage {
  decoding = 'auto';
  src = '';
  decode(): Promise<void> {
    decoded.push(this.src);
    return Promise.resolve();
  }
}

async function load(): Promise<AheadModule> {
  vi.resetModules();
  return import('../slide-ahead');
}

beforeEach(() => {
  decoded.length = 0;
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('slidePictures', () => {
  it("reads each image's twin for the theme and every url() that is not inline data", async () => {
    const { slidePictures } = await load();
    const html = [
      '<img class="opener-img" src="/a-dark.jpg" data-light="/a-light.jpg" alt="x">',
      '<img src="/b.png" alt="">',
      '<img src="data:image/png;base64,AAAA" alt="">',
      '<div style="background-image: url(&quot;/c.webp&quot;)"></div>',
      '<div style="background: url(data:image/svg+xml,%3Csvg%3E)"></div>',
      '<svg><rect fill="url(#g)"/></svg>',
    ].join('');
    expect(slidePictures(html, 'light')).toEqual(['/a-light.jpg', '/b.png', '/c.webp']);
    expect(slidePictures(html, 'dark')).toEqual(['/a-dark.jpg', '/b.png', '/c.webp']);
  });
});

describe('slidesAhead', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('puts the slide the way the last move went first', async () => {
    const { slidesAhead } = await load();
    expect(slidesAhead(list, 'b', 'next').map((s) => s.id)).toEqual(['c', 'a']);
    expect(slidesAhead(list, 'b', 'prev').map((s) => s.id)).toEqual(['a', 'c']);
    expect(slidesAhead(list, 'c', 'next').map((s) => s.id)).toEqual(['b']);
    expect(slidesAhead(list, 'zzz', 'next')).toEqual([]);
  });
});

describe('decodeAhead', () => {
  it('decodes each address once and keeps the last 24', async () => {
    const { decodeAhead, keptPictures } = await load();
    decodeAhead(['/1.jpg', '/2.jpg']);
    decodeAhead(['/1.jpg']);
    expect(decoded).toEqual(['/1.jpg', '/2.jpg']);
    /* a picture wanted again moves to the young end */
    expect(keptPictures()).toEqual(['/2.jpg', '/1.jpg']);
    decodeAhead(Array.from({ length: 30 }, (_, i) => `/n${i}.jpg`));
    expect(keptPictures()).toHaveLength(24);
    expect(keptPictures()[23]).toBe('/n29.jpg');
  });
});
