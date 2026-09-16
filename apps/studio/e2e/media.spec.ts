import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The media lane's browser spec (gslides-parity SPEC-5 3.9; R11 8.4; MILESTONES-5 B2 day 7). The
// rows: the checkout's asset route answers a `Range` request with 206 and Content-Range, a range
// past the end with 416, `HEAD` with the same headers and no body; the `tmp` tier refuses media
// uploads with its sentence through the grant route; a draft made on `/new` takes a YouTube media
// block through `block.insert` and the editor renders it as a poster root with the eight playback
// attributes and never as an element; `media.list` and `media.info` answer over the window API;
// the show mounts the block's iframe on youtube-nocookie.com under `page.route`; a stored file
// (the motion fixture's webm) travels in through `media.insert { file }` as a data URL and plays
// in the show with Start at and End at held. A row this build cannot drive because its wiring is
// another lane's request fails with the request's sentence and is recorded in b2.md section 5.4,
// never marked passed. The tmp store serves no workspace folder added after it started, so the
// deck is the draft `/new` makes and nothing is written under decks/.
//
// Runs against a dev server with TURBOSLIDE_STORE=tmp (AGENTS.md dev server rules):
// PLAYWRIGHT_BASE_URL=http://localhost:4352 node_modules/.bin/playwright test apps/studio/e2e/media.spec.ts

const ROOT = join(import.meta.dirname, '..', '..', '..');
const FIXTURE_WEBM = join(ROOT, 'fixtures', 'media', 'bars-1s.webm');
const YOUTUBE_ID = 'dQw4w9WgXcQ';
const GT_TWIN = '/decks/gt-brand/assets/opener-brand-light.jpg';

type Block = {
  id: string;
  type: string;
  kind?: string;
  source?: unknown;
  playback?: unknown;
  alt?: string;
  pos?: unknown;
};

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

async function editorReady(page: Page): Promise<void> {
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
}

/** A draft on /new with one YouTube media block on its first slide; answers the deck, the slide and the block ids. */
async function draftWithYoutube(
  page: Page,
): Promise<{ deckId: string; slideId: string; blockId: string }> {
  await page.goto('/new');
  await editorReady(page);
  const info = await invoke<{ id: string; revision: number }>(page, 'deck.info');
  const slides = await invoke<{ id: string }[]>(page, 'slide.list', {});
  const slideId = slides[0]!.id;
  const block: Block = {
    id: 'yt',
    type: 'media',
    kind: 'video',
    source: { youtube: YOUTUBE_ID },
    playback: { start: 'auto', mute: true },
    alt: 'A video',
    pos: { x: 320, y: 180, w: 960, h: 540, z: 3 },
  };
  const placed = await insertBlock(page, slideId, block, info.revision);
  expect(placed.revision).toBeGreaterThan(info.revision);
  return { deckId: info.id, slideId, blockId: block.id };
}

/** `block.insert` into the slide's first slot: `main` on a content slide, `plate` otherwise (the Image by URL dialog's rule). */
async function insertBlock(
  page: Page,
  slideId: string,
  block: Block,
  baseRevision: number,
): Promise<{ revision: number }> {
  try {
    return await invoke<{ revision: number }>(page, 'block.insert', {
      slideId,
      slot: 'main',
      block,
      baseRevision,
    });
  } catch (error) {
    if (!String(error).includes('/slot')) throw error;
    return invoke<{ revision: number }>(page, 'block.insert', {
      slideId,
      slot: 'plate',
      block,
      baseRevision,
    });
  }
}

test.describe('the asset route (SPEC-5 3.3; R11 2 rule 2)', () => {
  test('answers Range with 206 and Content-Range, a range past the end with 416, and HEAD without a body', async ({
    request,
  }) => {
    const whole = await request.get(GT_TWIN);
    expect(whole.status()).toBe(200);
    const bytes = (await whole.body()).byteLength;
    expect(whole.headers()['content-type']).toBe('image/jpeg');
    expect(whole.headers()['accept-ranges']).toBe('bytes');
    const partial = await request.get(GT_TWIN, { headers: { range: 'bytes=0-99' } });
    expect(partial.status()).toBe(206);
    expect(partial.headers()['content-range']).toBe(`bytes 0-99/${bytes}`);
    expect(partial.headers()['content-length']).toBe('100');
    expect((await partial.body()).byteLength).toBe(100);
    const tail = await request.get(GT_TWIN, { headers: { range: 'bytes=-50' } });
    expect(tail.status()).toBe(206);
    expect(tail.headers()['content-range']).toBe(`bytes ${bytes - 50}-${bytes - 1}/${bytes}`);
    const past = await request.get(GT_TWIN, { headers: { range: `bytes=${bytes + 10}-` } });
    expect(past.status()).toBe(416);
    expect(past.headers()['content-range']).toBe(`bytes */${bytes}`);
    const head = await request.head(GT_TWIN);
    expect(head.status()).toBe(200);
    expect(head.headers()['accept-ranges']).toBe('bytes');
    expect(head.headers()['content-length']).toBe(String(bytes));
    expect(head.headers()['x-content-type-options']).toBe('nosniff');
    expect((await head.body()).byteLength).toBe(0);
    // a committed twin keeps the short cache (its name carries no digest); the intake's digest named
    // files take the year (server/headers.test.ts pins the rule)
    expect(head.headers()['cache-control']).toBe('public, max-age=60');
  });

  test('the tmp tier refuses media uploads with its sentence through the grant route (SPEC-5 3.3)', async ({
    request,
  }) => {
    const answer = await request.get('/api/x/upload/media', {
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(answer.status()).toBe(200);
    const body = (await answer.json()) as {
      backend: string;
      refusal?: string;
      contentTypes: string[];
    };
    expect(body.backend).toBe('refused');
    expect(body.refusal).toBe('Audio and video need the Blob store on this instance');
    expect(body.contentTypes).toEqual([
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
    ]);
    const grant = await request.post('/api/x/upload/media', {
      headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      data: { deckId: 'gt-brand', contentType: 'video/webm', bytes: 4_000_000 },
    });
    expect([503, 403, 401]).toContain(grant.status());
  });
});

test.describe('the editor (SPEC-5 0.17, 3.5)', () => {
  test('renders a media block as a poster root with the playback attributes and no element; media.list and media.info answer', async ({
    page,
  }) => {
    const { blockId } = await draftWithYoutube(page);
    const root = page.locator(`.ts-media[data-media="${blockId}"]`);
    await expect(
      root,
      'the poster root of render/blocks/media.ts (render-block.ts case bodies, b2.md request R2)',
    ).toHaveCount(1, { timeout: 15_000 });
    await expect(root).toHaveAttribute('data-kind', 'video');
    await expect(root).toHaveAttribute('data-youtube', YOUTUBE_ID);
    await expect(root).toHaveAttribute('data-play', 'auto');
    await expect(root).toHaveAttribute('data-mute', '1');
    await expect(root).toHaveAttribute('role', 'button');
    for (const name of [
      'data-start',
      'data-end',
      'data-loop',
      'data-volume',
      'data-stop-on-change',
      'data-hide-icon',
    ])
      await expect(root).toHaveAttribute(name, /.*/);
    expect(await page.locator('.ts-sheet video, .ts-sheet audio, .ts-sheet iframe').count()).toBe(
      0,
    );
    const list = await invoke<{ assets: unknown[] }>(page, 'media.list', {});
    expect(list.assets).toEqual([]);
  });
});

test.describe('the show (SPEC-5 3.5; R11 4.2, 5)', () => {
  test('mounts the YouTube block on youtube-nocookie.com and nothing drawn over it', async ({
    page,
  }) => {
    await page.route('https://www.youtube-nocookie.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>stub</title>',
      }),
    );
    await page.route('https://www.youtube.com/iframe_api', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: 'window.YT = { Player: function () { return { destroy() {} }; } }; window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();',
      }),
    );
    const { deckId, slideId, blockId } = await draftWithYoutube(page);
    await page.goto(`/deck/${deckId}?present=1#s/${slideId}`);
    const viewer = page.locator('.pt-viewer:not(.ts-skeleton)');
    await expect(viewer).toHaveAttribute('data-settled', '');
    await expect(viewer).toHaveClass(/is-present/);
    const root = page.locator(`.ts-slideshow .ts-media[data-media="${blockId}"]`);
    await expect(
      root,
      'the poster root in the show (render-block.ts case bodies, b2.md request R2)',
    ).toHaveCount(1, { timeout: 15_000 });
    await expect(root).toHaveClass(/is-mounted/, { timeout: 15_000 });
    const iframe = root.locator('iframe');
    await expect(iframe).toHaveCount(1);
    const src = (await iframe.getAttribute('src')) ?? '';
    expect(src).toContain(`https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}`);
    expect(src).toContain('enablejsapi=1');
    expect(src).toContain('rel=0');
    expect(src).toContain('controls=1');
  });

  test('a stored webm inserted through media.insert plays in the show with Start at and End at held', async ({
    page,
  }) => {
    await page.goto('/new');
    await editorReady(page);
    const info = await invoke<{ id: string; revision: number }>(page, 'deck.info');
    const slides = await invoke<{ id: string }[]>(page, 'slide.list', {});
    const slideId = slides[0]!.id;
    const dataUrl = `data:video/webm;base64,${readFileSync(FIXTURE_WEBM).toString('base64')}`;
    // the window row of media.insert and the server side intake are the integrator's request (b2.md R3, R4)
    const out = await invoke<{ blockId: string; assetId: string }>(page, 'media.insert', {
      slideId,
      file: dataUrl,
      alt: 'Colour bars',
      playback: { start: 'auto', mute: true, startMs: 500, endMs: 800 },
      baseRevision: info.revision,
    });
    expect(out.assetId).toBeTruthy();
    await page.goto(`/deck/${info.id}?present=1#s/${slideId}`);
    const root = page.locator(`.ts-slideshow .ts-media[data-media="${out.blockId}"]`);
    await expect(root).toHaveClass(/is-mounted/, { timeout: 15_000 });
    const video = root.locator('video');
    await expect(video).toHaveCount(1);
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.paused), { timeout: 5000 })
      .toBe(false);
    // End at 0.8 s: the element stops within 250 ms of it and rests at Start at
    await expect
      .poll(
        () =>
          video.evaluate((el: HTMLVideoElement) => ({ paused: el.paused, time: el.currentTime })),
        { timeout: 5000 },
      )
      .toMatchObject({ paused: true });
    const time = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    expect(Math.abs(time - 0.5)).toBeLessThan(0.25);
  });
});
