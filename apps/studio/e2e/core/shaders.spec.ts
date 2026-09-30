import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  agentHeaders,
  assetRecords,
  blockRect,
  captureFallback,
  clickCard,
  coverage,
  ctl,
  download,
  ensureShader,
  waitEditor,
  extraHTTPHeaders,
  fetchPageFile,
  frameAssetIdOf,
  frameAssets,
  installRafCounter,
  invoke,
  menuPath,
  newDeck,
  objectsOf,
  openEditor,
  openShaderSection,
  ownerContext,
  pdfImages,
  pngSize,
  rafCount,
  resizeByHandle,
  rgbDistance,
  sameCookiesContext,
  sampleClip,
  samplePicture,
  selectBlock,
  setSliderNumber,
  settled,
  shaderBlocks,
  sheetScale,
  sliderFacts,
  stageCanvases,
  teardownAll,
  title,
  waitFrame,
  waitFrameDrawn,
  openShaderGallery,
  headingRun,
  typeInto,
  snackbarText,
} from './lib';

// The shader library's spec rows (docs/FEATURES.md 5.5, 5.6, 5.8, 7.1 `shaders.*` with the driver
// core/shaders.spec.ts): the frame's automatic capture and its record, the frame at the box's
// aspect against the viewer's still, the storage rule (a repeated recipe reuses its asset, a
// block keeps one frame), one capturer across two browser contexts, the hidden tab and the
// reduced motion context, the measurement row (the editor's longest animation frame), the
// agent transports, and the P1 rows (the ported engines, the show playing a shader and the show
// showing the frame). One context for the file; a second person is a second context with the
// same cookies (the same seller in a second browser, lib.ts `sameCookiesContext`); the deck is
// made from /new and torn down through the product at the end.
//
// The shader block lands the seller's way when Insert > Shader is on the build (a click on
// Liquid metal), else through `shader.insert`, else through `block.insert` of a material block
// (the matrix's `setup` for these rows; lib.ts `ensureShader` records which). A control that is
// not on the build skips with its id and lane, which the gate reads as not driven with that
// reason (docs/PRODUCT.md 8.1); a control that exists is judged. Two rows read the mount at
// rest: a context with `reducedMotion: 'reduce'` (5.6's speed 0), never a paused animation guessed
// from two clips. No environment variable is read here but PLAYWRIGHT_BASE_URL, VERCEL_OIDC_TOKEN
// and, for the bearer on a deployment, TURBOSLIDE_TOKEN (never printed).
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/shaders.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';
let slideId = '';
let browserRef: Browser;
/** The shader block of the file and the way it landed (a setup, never a driven step). */
let shader: { id: string; how: string } | null = null;
const SECTION_LANE = 'not on this build: formatOptions.shader (docs/FEATURES.md 5.3, B5)';
/* Amplitude, not Strength: Strength maps to no uniform of liquid metal, the featured entry, so its
   slider is disabled by design (controls.ts controlApplies; build/integrator.md, the findings) */
const STRENGTH_LANE =
  'not on this build: formatOptions.shader.amplitude (docs/FEATURES.md 5.3, B5)';
/* the frame key as the schema spells it, `sha256:` then 64 hex (packages/schema/src/actions.ts shader.frame) */
const KEY = /^(sha256:)?[0-9a-f]{64}$/;
/** Four sample points across a picture, away from its edges. */
const POINTS: readonly (readonly [number, number])[] = [
  [0.25, 0.5],
  [0.5, 0.25],
  [0.75, 0.5],
  [0.5, 0.75],
];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  browserRef = browser;
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Shaders spec deck');
  slideId = await addSlide(page);
  shader = await ensureShader(page, slideId);
  /* the frame the rows read: the editor's own capture, else the agent's route (FEATURES.md 5.5) */
  const frame = await waitFrame(page, slideId, shader.id, { timeout: 15_000 });
  if (frame.asset === null) {
    const made = await captureFallback(page, slideId, shader.id);
    shader = {
      ...shader,
      how: `${shader.how}; no frame within 15 s, ${made.how} made ${made.asset ?? 'none'}`,
    };
  } else
    shader = {
      ...shader,
      how: `${shader.how}; the frame ${frame.asset} came after ${frame.ms} ms`,
    };
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  try {
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

const base = (): string => new URL(page.url()).origin;
const block = async (p: Page = page, id = shader?.id ?? '') =>
  (await shaderBlocks(p, slideId)).find((o) => o.id === id) ?? null;
/**
 * The frame img the sheet draws for the block, its src and the file's bytes, or null: fetched
 * through the assets route and, on a hosted instance that redirects a deck another instance wrote
 * to its twin's Blob URL, through that redirect with no header (lib.ts `fetchPageFile`).
 */
async function frameFile(
  p: Page,
  id: string,
): Promise<{ src: string; bytes: Buffer; via: string } | null> {
  const src = await p.evaluate((blockId) => {
    const root = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
    );
    const img = root?.querySelector('img');
    return img ? img.currentSrc || img.getAttribute('src') : null;
  }, id);
  if (!src) return null;
  const got = await fetchPageFile(p, src);
  return got === null ? null : { src, bytes: got.bytes, via: got.via };
}
/* the half size of the box averaged around each sample point, as a fraction of the picture (a
   3 percent patch): the viewer's 3200 px still and the editor's box at rest are compared over
   the same relative area, so a sub pixel shift at the shader's edge is not a colour change */
const PATCH = 0.015;
/* the box aspect row's patch (a 6 percent patch mean): the still at 3200 px and the box at 600 px
   are two renderings of one shape, and liquid metal's chrome edges (the diamond's tip at the top
   centre) move by a pixel between them; the runs of record read 82 and 83 on one channel at that
   point with a 3 percent patch and 0 at the other three */
const ASPECT_PATCH = 0.03;
/** The WebGL renderer string of the page's browser, for the measurement row. */
async function rendererString(p: Page): Promise<string> {
  return p.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return 'no WebGL';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  });
}
/** A recipe change through the product's number field, else through the window API (recorded). */
async function changeRecipe(
  p: Page,
  id: string,
  strength: number,
  anchor: number,
): Promise<string> {
  if (await openShaderSection(p, id)) {
    const facts = await sliderFacts(p, 'formatOptions.shader.amplitude');
    if (facts && (facts.range || facts.number)) {
      await setSliderNumber(p, 'formatOptions.shader.amplitude', strength);
      return `Amplitude ${strength} through the Shader section`;
    }
  }
  const s = await settled(p);
  await invoke(p, 'block.set', {
    slideId,
    blockId: id,
    path: '/anchor',
    value: anchor,
    baseRevision: s.revision,
  });
  await settled(p);
  return `block.set /anchor ${anchor} through the window API (no Strength field on this build)`;
}

test(title('shaders.frame.auto-capture'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  expect(shader, 'the shader block landed').not.toBeNull();
  const id = shader!.id;
  const first = await waitFrame(page, slideId, id, { timeout: 15_000 });
  /* a fresh recipe change, so the capture's own timing is read from this test and not the setup */
  const how = await changeRecipe(page, id, 1.15, 6100);
  const t0 = Date.now();
  const got = await waitFrame(page, slideId, id, { not: first.asset, timeout: 20_000 });
  const ms = Date.now() - t0;
  const b = await block();
  const asset = got.asset ? ((await assetRecords(page))[got.asset] ?? null) : null;
  const file = got.asset ? await frameFile(page, id) : null;
  const size = file ? pngSize(file.bytes) : null;
  const key = String(asset?.source?.frameKey ?? '');
  /* the filmstrip card shows the frame: the card's 16:9 frame (`.ts-card-frame`, the clone of the
     slide's HTML, Filmstrip.tsx) shot as a clip and sampled where the block sits on the slide,
     against the frame file's own centre, both over the same relative area of the block (the
     card's patch is the frame's patch scaled to the block's share of the slide), read again every
     500 ms for up to 10 s since the card is re rendered after the commit and the hosted instance
     serves the frame picture after the frame lands; the time and the reads are recorded. The clip
     is read, not the card's `<img>` source: the clone's first picture is the block's own frame
     served through the assets route, and its redirect to the store's host cannot be decoded by an
     anonymous Image in the page (the runs of the verifier's pass 2 read no sample on it) */
  const pos = (b?.pos ?? null) as { x: number; y: number; w: number; h: number } | null;
  let cardSrc: string | null = null;
  let cardDistance: number | null = null;
  let cardMs = 0;
  let cardReads = 0;
  if (pos && file) {
    const frameCentre = await samplePicture(page, file.bytes, [[0.5, 0.5]], PATCH);
    const t1 = Date.now();
    for (;;) {
      const cardRect = await page.evaluate((sid) => {
        const frame = document.querySelector(
          `[data-control="filmstrip.slide.${sid}"] .ts-card-frame`,
        );
        const r = frame?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0
          ? { x: r.x, y: r.y, width: r.width, height: r.height }
          : null;
      }, slideId);
      if (cardRect) {
        cardSrc = 'the card frame clip';
        cardReads += 1;
        const card = await sampleClip(
          page,
          cardRect,
          [[(pos.x + pos.w / 2) / 1600, (pos.y + pos.h / 2) / 900]],
          (PATCH * pos.w) / 1600,
        );
        if (card && frameCentre) cardDistance = rgbDistance(card.rgb[0]!, frameCentre.rgb[0]!);
      }
      cardMs = Date.now() - t1;
      if ((cardDistance !== null && cardDistance <= 64) || cardMs > 10_000) break;
      await page.waitForTimeout(500);
    }
  }
  test.info().annotations.push({
    type: 'capture',
    description: `${shader!.how}; setup frame ${first.asset ?? 'none'} after ${first.ms} ms; ${how}; frame ${got.asset ?? 'none'} ${ms} ms after the change; source ${JSON.stringify(asset?.source ?? null).slice(0, 300)}; file ${size ? `${size.width} by ${size.height} through the ${file?.via === 'redirect' ? "assets route's redirect" : 'assets route'}` : 'unread'}; card sample distance ${cardDistance ?? 'unread'} (${cardSrc ? `${cardReads} clip read(s) of the card frame over ${cardMs} ms, a ${Math.round(PATCH * 200)} percent patch mean of the block` : 'no card frame'})`,
  });
  expect(got.asset, 'the block has a frame asset after the recipe change').not.toBeNull();
  expect(ms, 'the frame arrives within 10 s of the change (800 ms plus the capture)').toBeLessThan(
    10_000,
  );
  expect(asset?.source?.kind, 'a material source').toBe('material');
  expect(asset?.source?.backend, "the editor's own WebGL").toBe('client');
  expect(String(asset?.source?.['renderer'] ?? ''), 'the renderer string').not.toBe('');
  expect(key, 'a frameKey').toMatch(KEY);
  expect(got.asset, 'the asset id is frame-<first 16 hex of frameKey> (5.5)').toBe(
    frameAssetIdOf(key),
  );
  expect(size, 'the PNG decodes').not.toBeNull();
  expect(Math.max(size!.width, size!.height), 'the long side 3200').toBe(3200);
  expect(cardDistance, 'the filmstrip card shows the frame').not.toBeNull();
  expect(cardDistance!, 'the card matches the frame within 64 per channel').toBeLessThanOrEqual(64);
});

test(title('shaders.frame.box-aspect'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  expect(shader).not.toBeNull();
  const id = shader!.id;
  const before = await block();
  const pos0 = before!.pos;
  const k = await sheetScale(page);
  const dragged = await resizeByHandle(page, id, 'se', (600 - pos0.w) * k, (150 - pos0.h) * k);
  let after = await block();
  let how = dragged ? 'the se handle dragged' : 'no se handle drawn';
  if (!after || Math.abs(after.pos.w - 600) > 12 || Math.abs(after.pos.h - 150) > 12) {
    /* the drag did not land the box (or no handle): the write the handle makes, recorded */
    const s = await settled(page);
    await invoke(page, 'block.set', {
      slideId,
      blockId: id,
      path: '/pos',
      value: { ...pos0, w: 600, h: 152 },
      baseRevision: s.revision,
    });
    await settled(page);
    after = await block();
    how = `${how}; block.set /pos to 600 by 152 (the drag read ${after ? `${after.pos.w} by ${after.pos.h}` : 'no block'})`;
  }
  const got = await waitFrame(page, slideId, id, {
    not: before!.block['asset'] as string | undefined,
    timeout: 20_000,
  });
  const file = got.asset ? await frameFile(page, id) : null;
  const size = file ? pngSize(file.bytes) : null;
  const want = after ? Math.round((3200 * after.pos.h) / after.pos.w) : 800;
  /* the viewer's still against the editor's canvas at rest */
  const viewer = await context.newPage();
  let still: { rgb: [number, number, number][] } | null = null;
  try {
    await viewer.goto(`/deck/${deck}#${slideId}`);
    await viewer.waitForSelector('.pt-slide [data-recipe] img, .pt-slide .material img', {
      timeout: 30_000,
    });
    await viewer.waitForTimeout(800);
    const src = await viewer.evaluate(() => {
      const img = document.querySelector('.pt-slide [data-recipe] img, .pt-slide .material img');
      return img ? (img as HTMLImageElement).currentSrc || img.getAttribute('src') : null;
    });
    /* the still's bytes come through the assets route (and its redirect to the store's host on a
       hosted instance, followed once with no header), then are sampled as a data URI: an
       anonymous Image on the redirected address cannot be decoded in the page (the verifier's
       pass 2 read the still null in one run of two) */
    const stillFile = src ? await fetchPageFile(viewer, src) : null;
    still = stillFile ? await samplePicture(viewer, stillFile.bytes, POINTS, ASPECT_PATCH) : null;
  } finally {
    await viewer.close();
  }
  let live: { rgb: [number, number, number][] } | null = null;
  /* the editor draws the new frame before its box is read: the sheet's picture for the block is
     the new asset and decoded (lib.ts waitFrameDrawn), else the clip reads the earlier frame */
  const drawn = got.asset
    ? await waitFrameDrawn(page, id, got.asset, 8_000)
    : { drawn: false, ms: 0 };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    await page.keyboard.press('Escape');
    await clickCard(page, slideId);
    await selectBlock(page, id);
    await page.waitForTimeout(900);
    const rect = await blockRect(page, id);
    if (rect)
      live = await sampleClip(
        page,
        { x: rect.x + 2, y: rect.y + 2, width: rect.width - 4, height: rect.height - 4 },
        POINTS,
        ASPECT_PATCH,
      );
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  const distances =
    still && live ? POINTS.map((_, i) => rgbDistance(still!.rgb[i]!, live!.rgb[i]!)) : null;
  test.info().annotations.push({
    type: 'aspect',
    description: `${how}; box ${after ? `${after.pos.w} by ${after.pos.h}` : 'unread'}; frame ${got.asset ?? 'none'} after ${got.ms} ms, ${size ? `${size.width} by ${size.height}` : 'unread'} (wanted 3200 by about ${want}); the editor drew it ${drawn.drawn ? `${drawn.ms} ms later` : `not within ${drawn.ms} ms`}; viewer against the editor at rest: ${distances ? `${distances.join(', ')} (a ${Math.round(ASPECT_PATCH * 200)} percent patch mean)` : 'unread'}`,
  });
  expect(after, 'the block').not.toBeNull();
  expect(
    Math.abs(after!.pos.w - 600) <= 12 && Math.abs(after!.pos.h - 150) <= 12,
    `600 by 150 sheet px (read ${after!.pos.w} by ${after!.pos.h})`,
  ).toBe(true);
  expect(got.asset, 'a frame after the resize').not.toBeNull();
  expect(size, 'the PNG decodes').not.toBeNull();
  expect(size!.width, 'the long side 3200').toBe(3200);
  expect(Math.abs(size!.height - want), `the short side about ${want}`).toBeLessThanOrEqual(24);
  expect(still, "the viewer's still").not.toBeNull();
  expect(live, "the editor's canvas at rest").not.toBeNull();
  for (const d of distances!) expect(d, 'within 48 per channel').toBeLessThanOrEqual(48);
});

test(title('shaders.frame.reuse-and-prune'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  expect(shader).not.toBeNull();
  const id = shader!.id;
  if (!(await openShaderSection(page, id))) test.skip(true, SECTION_LANE);
  const facts = await sliderFacts(page, 'formatOptions.shader.amplitude');
  if (!facts || !(facts.range || facts.number)) test.skip(true, STRENGTH_LANE);
  const v0 = facts!.value ?? 1;
  const asset0 = (await waitFrame(page, slideId, id, { timeout: 15_000 })).asset;
  const count0 = Object.keys(await assetRecords(page)).length;
  await setSliderNumber(page, 'formatOptions.shader.amplitude', 1.2);
  const up = await waitFrame(page, slideId, id, { not: asset0, timeout: 20_000 });
  await setSliderNumber(page, 'formatOptions.shader.amplitude', v0);
  const back = await waitFrame(page, slideId, id, { not: up.asset, timeout: 20_000 });
  await page.waitForTimeout(2000);
  const count1 = Object.keys(await assetRecords(page)).length;
  const blockBack = await block();
  test.info().annotations.push({
    type: 'reuse',
    description: `Amplitude ${v0} -> 1.2 -> ${v0}: frames ${asset0 ?? 'none'} -> ${up.asset ?? 'none'} (${up.ms} ms) -> ${back.asset ?? 'none'} (${back.ms} ms); assets ${count0} -> ${count1}; the block names ${String(blockBack?.block['asset'])}`,
  });
  expect(up.asset, 'the 1.2 frame').not.toBeNull();
  expect(back.asset, 'the frame back at the value').not.toBeNull();
  expect(back.asset, 'the repeated recipe reuses its asset id').toBe(asset0);
  expect(count1, 'the count of deck.assets is unchanged 2 s later').toBe(count0);
  /* three distinct commits 1 s apart leave one frame for the block */
  let last: string | null = back.asset;
  for (const value of [0.6, 0.9, 1.4]) {
    await setSliderNumber(page, 'formatOptions.shader.amplitude', value);
    await page.waitForTimeout(1000);
  }
  const third = await waitFrame(page, slideId, id, { not: last, timeout: 20_000 });
  last = third.asset;
  await page.waitForTimeout(5000);
  const frames = await frameAssets(page);
  const named = (await block())?.block['asset'] ?? null;
  test.info().annotations.push({
    type: 'prune',
    description: `after 0.6, 0.9, 1.4: frame ${last ?? 'none'}; ${frames.length} frame asset(s) 5 s later (${frames.map((a) => a.id).join(', ')}); the block names ${String(named)}`,
  });
  expect(last, 'the third frame').not.toBeNull();
  expect(frames.length, 'one frame asset for the block').toBe(1);
  expect(named, 'the block names it').toBe(frames[0]!.id);
});

test(title('shaders.frame.one-capturer'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  expect(shader).not.toBeNull();
  const id = shader!.id;
  const asset0 = (await waitFrame(page, slideId, id, { timeout: 15_000 })).asset;
  /* every request of the first page that carries the frame write, in its address or its body */
  const writes: string[] = [];
  const onRequest = (req: { url(): string; postData(): string | null }) => {
    const url = req.url();
    const body = req.postData() ?? '';
    if (/shader\.frame/.test(url) || /shader\.frame/.test(body)) writes.push(url.slice(0, 120));
  };
  page.on('request', onRequest);
  const second = await sameCookiesContext(browserRef, context);
  let how = '';
  let asset2: string | null = null;
  try {
    await openEditor(second.page, deck);
    await clickCard(second.page, slideId);
    how = await changeRecipe(second.page, id, 0.8, 6600);
    asset2 = (await waitFrame(second.page, slideId, id, { not: asset0, timeout: 20_000 })).asset;
    /* the first page receives the entry, then the frame */
    await expect
      .poll(async () => (await block())?.block['asset'] ?? null, { timeout: 20_000 })
      .toBe(asset2);
    await page.waitForTimeout(2500);
  } finally {
    page.off('request', onRequest);
    await second.context.close();
  }
  const frames = await frameAssets(page);
  test.info().annotations.push({
    type: 'capturer',
    description: `${how} in the second browser; frame ${asset0 ?? 'none'} -> ${asset2 ?? 'none'}; the first page's shader.frame requests: ${writes.length} (${writes.join(', ') || 'none'}); ${frames.length} frame asset(s): ${frames.map((a) => a.id).join(', ')}`,
  });
  expect(asset2, 'the second browser captured a frame').not.toBeNull();
  expect(writes, 'the first page ran no shader.frame write').toEqual([]);
  expect(frames.length, 'one frame asset for the block').toBe(1);
});

test(title('shaders.perf.hidden-pauses'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  expect(shader).not.toBeNull();
  const id = shader!.id;
  await installRafCounter(page);
  await selectBlock(page, id);
  await page.waitForTimeout(500);
  const c0 = await rafCount(page);
  await page.waitForTimeout(1000);
  const c1 = await rafCount(page);
  const canvases = await stageCanvases(page);
  expect(canvases.stage, 'a live mount on the stage').toBeGreaterThan(0);
  expect(c1 - c0, 'the rAF loop advances while the tab is visible').toBeGreaterThan(5);
  /* a second tab fronted */
  const other = await context.newPage();
  let mechanism = '';
  let hiddenDelta: number | null = null;
  let resumedDelta: number | null = null;
  try {
    await other.goto('about:blank');
    await other.bringToFront();
    const hidden = await page
      .waitForFunction(() => document.visibilityState === 'hidden', null, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (hidden) {
      mechanism = 'the second tab fronted (document.visibilityState read hidden)';
    } else {
      /* the headless browser did not hide the page (the cost probe's finding on
         cost.editor-hidden.calls): the document's state is set by the driver and recorded */
      mechanism =
        'the second tab fronted but the headless browser kept the page visible, so the driver set document.hidden and document.visibilityState on the document and dispatched visibilitychange';
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    await page.waitForTimeout(400);
    const h0 = await rafCount(page);
    await page.waitForTimeout(2000);
    const h1 = await rafCount(page);
    hiddenDelta = h1 - h0;
    if (hidden) await page.bringToFront();
    else
      await page.evaluate(() => {
        delete (document as unknown as { hidden?: unknown }).hidden;
        delete (document as unknown as { visibilityState?: unknown }).visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
      });
    await page.waitForTimeout(400);
    const r0 = await rafCount(page);
    await page.waitForTimeout(1500);
    const r1 = await rafCount(page);
    resumedDelta = r1 - r0;
  } finally {
    await other.close().catch(() => undefined);
  }
  /* the reduced motion context: the same seller in a browser that prefers reduced motion */
  const reduced = await browserRef.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    storageState: await context.storageState(),
  });
  let clips: { equal: boolean; distances: number[] } | null = null;
  let reducedCanvas = 0;
  try {
    const p2 = await reduced.newPage();
    await openEditor(p2, deck);
    await clickCard(p2, slideId);
    await selectBlock(p2, id);
    await p2.waitForTimeout(900);
    reducedCanvas = (await stageCanvases(p2)).stage;
    const rect = await blockRect(p2, id);
    if (rect) {
      const clip = { x: rect.x + 2, y: rect.y + 2, width: rect.width - 4, height: rect.height - 4 };
      const a = await p2.screenshot({ clip, scale: 'css' });
      await p2.waitForTimeout(900);
      const b = await p2.screenshot({ clip, scale: 'css' });
      const sa = await samplePicture(p2, a, POINTS);
      const sb = await samplePicture(p2, b, POINTS);
      clips = {
        equal: a.equals(b),
        distances: sa && sb ? POINTS.map((_, i) => rgbDistance(sa.rgb[i]!, sb.rgb[i]!)) : [],
      };
    }
  } finally {
    await reduced.close();
  }
  test.info().annotations.push({
    type: 'hidden',
    description: `visible: ${c1 - c0} frames in 1 s; ${mechanism}: ${hiddenDelta} frames in 2 s; resumed: ${resumedDelta} frames in 1.5 s; reduced motion: ${reducedCanvas} canvas, two clips 900 ms apart ${clips ? (clips.equal ? 'identical' : `differ (${clips.distances.join(', ')})`) : 'unread'}`,
  });
  expect(
    hiddenDelta,
    'the rAF loop stops while hidden (at most two stray frames)',
  ).toBeLessThanOrEqual(2);
  expect(resumedDelta!, 'fronting the tab resumes it').toBeGreaterThan(5);
  expect(clips, 'the reduced motion clips').not.toBeNull();
  expect(
    clips!.equal || clips!.distances.every((d) => d <= 2),
    'two clips 900 ms apart are identical under prefers-reduced-motion: reduce',
  ).toBe(true);
});

test(title('shaders.perf.editor-frame'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  expect(shader).not.toBeNull();
  await selectBlock(page, shader!.id);
  await page.waitForTimeout(800);
  const canvases = await stageCanvases(page);
  const renderer = await rendererString(page);
  /* the longest animation frame over 5 s: long-animation-frame entries, else the largest gap
     between two animation frames */
  const measured = await page.evaluate(
    () =>
      new Promise<{ longest: number; frames: number; source: string }>((resolve) => {
        let longest = 0;
        let frames = 0;
        let source = 'rAF gaps';
        let observer: PerformanceObserver | null = null;
        try {
          observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration);
            source = 'long-animation-frame';
          });
          observer.observe({ type: 'long-animation-frame', buffered: false });
        } catch {
          observer = null;
        }
        let last = performance.now();
        let gap = 0;
        const tick = (now: number) => {
          gap = Math.max(gap, now - last);
          last = now;
          frames += 1;
          if (now - start < 5000) requestAnimationFrame(tick);
        };
        const start = performance.now();
        requestAnimationFrame(tick);
        setTimeout(() => {
          observer?.disconnect();
          resolve({
            longest: source === 'long-animation-frame' && longest > 0 ? longest : gap,
            frames,
            source: source === 'long-animation-frame' && longest > 0 ? source : 'rAF gaps',
          });
        }, 5200);
      }),
  );
  test.info().annotations.push({
    type: 'measure',
    description: `longest animation frame ${measured.longest.toFixed(1)} ms over 5 s with one shader on the stage (${measured.frames} animation frames; ${measured.source}; ${canvases.stage} canvas; renderer ${renderer})`,
  });
  expect(canvases.stage, 'one shader mounted on the stage').toBeGreaterThan(0);
  expect(measured.longest, 'under 150 ms').toBeLessThan(150);
});

test(title('shaders.agent.list-insert-set-render'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  const maybe = agentHeaders(base());
  if (maybe === null) test.skip(true, 'not driven: no bearer for this origin');
  const headers = maybe as Record<string, string>;
  const post = async (action: string, data: Record<string, unknown>, timeout = 60_000) =>
    page.request.post(`/api/actions/${action}?deck=${encodeURIComponent(deck)}`, {
      headers,
      data,
      timeout,
      maxRedirects: 0,
    });
  const list = await post('shader.list', {});
  const listBody = await list.text();
  if (list.status() === 404 || /unknown action|no such action|not a known action/i.test(listBody))
    test.skip(
      true,
      `not on this build: shader.list on the HTTP transport (docs/FEATURES.md 5.8, B5 with B7); ${list.status()} ${listBody.slice(0, 120)}`,
    );
  test.info().annotations.push({
    type: 'list',
    description: `${list.status()} ${listBody.slice(0, 200)}`,
  });
  expect(list.status(), 'shader.list answers').toBe(200);
  const entries = JSON.parse(listBody) as unknown;
  const arr = Array.isArray(entries)
    ? entries
    : ((entries as { shaders?: unknown[]; materials?: unknown[] }).shaders ??
      (entries as { materials?: unknown[] }).materials ??
      []);
  expect(arr.length, 'the catalog').toBeGreaterThan(0);
  /* insert */
  const s0 = await settled(page);
  const before = (await shaderBlocks(page, slideId)).map((o) => o.id);
  const insert = await post('shader.insert', {
    slideId,
    materialId: 'paper:gem-smoke',
    baseRevision: s0.revision,
  });
  const insertBody = (await insert.json().catch(() => null)) as Record<string, unknown> | null;
  test.info().annotations.push({
    type: 'insert',
    description: `${insert.status()} ${JSON.stringify(insertBody).slice(0, 200)}`,
  });
  expect(insert.status(), 'shader.insert answers').toBe(200);
  let inserted: string | null = null;
  await expect
    .poll(
      async () => {
        const list2 = (await shaderBlocks(page, slideId)).filter((o) => !before.includes(o.id));
        inserted = list2[0]?.id ?? null;
        return list2.length;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  /* set */
  const s1 = await settled(page);
  const set = await post('shader.set', {
    slideId,
    blockId: inserted,
    path: '/controls/strength',
    value: 1.2,
    baseRevision: s1.revision,
  });
  const setBody = await set.text();
  test
    .info()
    .annotations.push({ type: 'set', description: `${set.status()} ${setBody.slice(0, 200)}` });
  expect(set.status(), 'shader.set answers').toBe(200);
  /* render: a PNG of 3200 by 1800 within 20 s, as bytes or as a JSON body carrying them */
  const t0 = Date.now();
  const render = await post(
    'shader.render',
    { materialId: 'paper:liquid-metal', preset: 'diamond', size: [3200, 1800], timeMs: 5500 },
    60_000,
  );
  const ms = Date.now() - t0;
  const type = render.headers()['content-type'] ?? '';
  let png: Buffer | null = null;
  if (/image\/png/.test(type)) png = Buffer.from(await render.body());
  else {
    const body = (await render.json().catch(() => null)) as Record<string, unknown> | null;
    const raw =
      (body?.['png'] as string | undefined) ??
      (body?.['bytes'] as string | undefined) ??
      (body?.['dataUrl'] as string | undefined) ??
      (body?.['data'] as string | undefined) ??
      null;
    if (typeof raw === 'string') png = Buffer.from(raw.replace(/^data:[^,]*,/, ''), 'base64');
  }
  const size = png ? pngSize(png) : null;
  test.info().annotations.push({
    type: 'render',
    description: `${render.status()} ${type} ${png ? `${png.length} bytes` : 'no bytes'} in ${ms} ms; ${size ? `${size.width} by ${size.height}` : 'not a PNG'}`,
  });
  expect(render.status(), 'shader.render answers').toBe(200);
  expect(ms, 'within 20 s').toBeLessThan(20_000);
  expect(size, 'a PNG').not.toBeNull();
  expect([size!.width, size!.height], '3200 by 1800').toEqual([3200, 1800]);
  /* the alias */
  const alias = await post('material.list', {});
  expect(alias.status(), 'material.list still answers').toBe(200);
});

test(title('shaders.library.glyph-engines-render'), async () => {
  test.setTimeout(300_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  const maybe = agentHeaders(base());
  if (maybe === null) test.skip(true, 'not driven: no bearer for this origin');
  const headers = maybe as Record<string, string>;
  const read = async (action: string) => {
    const res = await page.request.post(`/api/actions/${action}?deck=${encodeURIComponent(deck)}`, {
      headers,
      data: {},
      maxRedirects: 0,
    });
    if (res.status() !== 200) return null;
    const body = (await res.json().catch(() => null)) as unknown;
    return Array.isArray(body)
      ? (body as { id: string; available?: boolean }[])
      : ((body as { shaders?: { id: string; available?: boolean }[] })?.shaders ?? null);
  };
  const entries = (await read('shader.list')) ?? (await read('material.list')) ?? [];
  const want = ['proto:studio-field', 'glyph:mesh-gradient', 'glyph:dither-gradient'];
  const present = want.filter((id) => entries.some((e) => e.id === id && e.available !== false));
  test.info().annotations.push({
    type: 'engines',
    description: `${entries.length} entries; present and available: ${present.join(', ') || 'none'}`,
  });
  if (present.length < want.length)
    test.skip(
      true,
      `not on this build: dialog.shader.engine.glyph (docs/FEATURES.md 5.2 item 2, B5, P1); the catalog lists ${present.join(', ') || 'none'} of ${want.join(', ')}`,
    );
  const facts: string[] = [];
  for (const materialId of want) {
    const made = await ensureShader(page, slideId, { materialId });
    await selectBlock(page, made.id);
    await page.waitForTimeout(800);
    const canvases = await stageCanvases(page);
    const root = canvases.roots.find((r) => r.block === made.id);
    const frame = await waitFrame(page, slideId, made.id, { timeout: 20_000 });
    facts.push(
      `${materialId}: ${made.how}; mount ${root?.canvas ?? 0}; frame ${frame.asset ?? 'none'} after ${frame.ms} ms`,
    );
    expect(root?.canvas ?? 0, `${materialId} mounts`).toBe(1);
    expect(frame.asset, `${materialId} captures`).not.toBeNull();
  }
  /* one PDF carries the three frames */
  await page.keyboard.press('Escape');
  const pdf = await download(
    page,
    () => menuPath(page, 'file', 'file.download', 'file.download.pdf'),
    90_000,
  );
  facts.push(`PDF ${pdf.bytes.length} bytes with ${pdfImages(pdf.bytes)} image objects`);
  test.info().annotations.push({ type: 'export', description: facts.join('; ') });
  expect(pdfImages(pdf.bytes), 'the PDF carries the frames').toBeGreaterThanOrEqual(3);
});

/** The View > Play shaders rows, or null when the row is not on the build. */
async function playShaderRows(
  p: Page,
): Promise<{ id: string; label: string; checked: string | null }[] | null> {
  await ctl(p, 'menubar.view').click();
  await p.locator('#ts-menu-view').waitFor({ timeout: 8000 });
  const row = ctl(p, 'menu.view.playShaders');
  if ((await row.count()) === 0) {
    await p.keyboard.press('Escape');
    return null;
  }
  await row.hover();
  await p.waitForTimeout(400);
  const rows = await p.evaluate(() =>
    [...document.querySelectorAll('[data-control^="menu.view.playShaders."]')]
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => ({
        id: (e.getAttribute('data-control') ?? '').replace(/^menu\./, ''),
        label: (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
        checked: e.getAttribute('aria-checked'),
      })),
  );
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  return rows;
}
async function setPlayShaders(p: Page, want: RegExp): Promise<boolean> {
  const rows = await playShaderRows(p);
  const row = rows?.find((r) => want.test(r.label)) ?? null;
  if (!row) return false;
  await menuPath(p, 'view', 'view.playShaders', row.id);
  return true;
}
/**
 * The show's canvases and whether the block's frame picture is decoded, polled for up to
 * `timeout` ms until the frame is (a 3200 px picture through the assets route, on a hosted
 * instance through its redirect to the Blob store, is not decoded 1.2 s after the show opens);
 * `ms` is the time the frame took.
 */
async function showCanvases(
  p: Page,
  timeout = 10_000,
): Promise<{ canvases: number; frame: boolean; ms: number }> {
  const t0 = Date.now();
  for (;;) {
    const facts = await p.evaluate(() => {
      const show = document.querySelector('[data-control="present.show"]');
      const img = show?.querySelector('.material img, [data-recipe] img');
      return {
        canvases: show ? show.querySelectorAll('canvas').length : -1,
        frame: img
          ? (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0
          : false,
      };
    });
    const ms = Date.now() - t0;
    if (facts.frame || ms > timeout) return { ...facts, ms };
    await p.waitForTimeout(250);
  }
}
/* the P1 item the two show rows measure (docs/FEATURES.md 5.2 item 4, 5.6): the show's
   ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx) and the Shader section's Play in the
   show control land as one commit, and the section draws Play in the show only when the item is
   on the build (7.1 `shaders.panel.section-groups`), so the control's presence is the item's; a
   build without it draws the frame in the show and the rows read not driven with the reason,
   never a red row on a layer no lane built (the fix round of ship two, finding 5) */
const SHOW_LANE =
  "not on this build: formatOptions.shader.play and the show's ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx; docs/FEATURES.md 5.6, B5 with B1, P1); the show draws the frame until they land";
/** True when the Shader section draws Play in the show, the P1 item's own control. */
async function showLayerBuilt(p: Page, id: string): Promise<boolean> {
  if (!(await openShaderSection(p, id))) return false;
  return (await ctl(p, 'formatOptions.shader.play').count()) > 0;
}
async function leaveShow(p: Page): Promise<void> {
  if ((await ctl(p, 'present.show').count()) > 0) {
    await p.keyboard.press('Escape');
    await expect(ctl(p, 'present.show')).toHaveCount(0, { timeout: 8000 });
  }
}

test(title('shaders.show.plays-when-on'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  expect(shader).not.toBeNull();
  const id = shader!.id;
  const rows = await playShaderRows(page);
  if (rows === null)
    test.skip(
      true,
      'not on this build: view.playShaders (docs/FEATURES.md 5.6, B1 by request in model.ts, P1)',
    );
  if (!(await showLayerBuilt(page, id))) test.skip(true, SHOW_LANE);
  await setPlayShaders(page, /^on$/i);
  /* the block's Play in the show through the section's control */
  let playHow = 'formatOptions.shader.play';
  {
    await openShaderSection(page, id);
    const on = ctl(page, 'formatOptions.shader.play');
    const pressed =
      (await on.getAttribute('aria-pressed')) ?? (await on.getAttribute('aria-checked'));
    if (pressed === 'false') {
      await on.click();
      playHow = 'formatOptions.shader.play clicked on';
    } else {
      const b = await block();
      const motion = (b?.block['motion'] ?? null) as { play?: string } | null;
      playHow = `formatOptions.shader.play already on (motion.play ${motion?.play ?? 'unset'})`;
    }
  }
  await waitFrame(page, slideId, id, { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await clickCard(page, slideId);
  await ctl(page, 'present.open').click();
  await expect(ctl(page, 'present.show')).toBeAttached({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  const facts = await showCanvases(page, 0);
  const rect = await page.evaluate(() => {
    const c = document.querySelector('[data-control="present.show"] canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x + 2, y: r.y + 2, width: r.width - 4, height: r.height - 4 };
  });
  let distances: number[] = [];
  if (rect) {
    const a = await sampleClip(page, rect, POINTS);
    await page.waitForTimeout(900);
    const b = await sampleClip(page, rect, POINTS);
    if (a && b) distances = POINTS.map((_, i) => rgbDistance(a.rgb[i]!, b.rgb[i]!));
  }
  await leaveShow(page);
  await setPlayShaders(page, /in the show only/i).catch(() => undefined);
  test.info().annotations.push({
    type: 'show',
    description: `${playHow}; the show has ${facts.canvases} canvas; two clips 900 ms apart: ${distances.join(', ') || 'unread'}`,
  });
  expect(facts.canvases, 'one canvas in the show').toBe(1);
  expect(
    distances.some((d) => d > 8),
    'the clips differ',
  ).toBe(true);
});

test(title('shaders.show.frame-when-off'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  expect(shader).not.toBeNull();
  const id = shader!.id;
  const rows = await playShaderRows(page);
  if (rows === null)
    test.skip(
      true,
      'not on this build: view.playShaders (docs/FEATURES.md 5.6, B1 by request in model.ts, P1)',
    );
  if (!(await showLayerBuilt(page, id))) test.skip(true, SHOW_LANE);
  await waitFrame(page, slideId, id, { timeout: 15_000 });
  await setPlayShaders(page, /^off$/i);
  await page.keyboard.press('Escape');
  await clickCard(page, slideId);
  await ctl(page, 'present.open').click();
  await expect(ctl(page, 'present.show')).toBeAttached({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  const off = await showCanvases(page);
  await leaveShow(page);
  await setPlayShaders(page, /in the show only/i).catch(() => undefined);
  /* the reduced motion context with the setting at its default and the block's motion on */
  const reduced = await browserRef.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    storageState: { cookies: (await context.storageState()).cookies, origins: [] },
  });
  let motion = { canvases: -1, frame: false, ms: 0 };
  try {
    const p2 = await reduced.newPage();
    await openEditor(p2, deck);
    await clickCard(p2, slideId);
    await setPlayShaders(p2, /^on$/i).catch(() => undefined);
    await p2.keyboard.press('Escape');
    await ctl(p2, 'present.open').click();
    await expect(ctl(p2, 'present.show')).toBeAttached({ timeout: 10_000 });
    await p2.waitForTimeout(1200);
    motion = await showCanvases(p2);
    await leaveShow(p2);
  } finally {
    await reduced.close();
  }
  test.info().annotations.push({
    type: 'off',
    description: `Play shaders off: ${off.canvases} canvas, frame drawn ${off.frame} (${off.ms} ms after the show opened plus 1.2 s); reduced motion with the setting on: ${motion.canvases} canvas, frame drawn ${motion.frame} (${motion.ms} ms)`,
  });
  expect(off.canvases, 'no canvas with the setting off').toBe(0);
  expect(off.frame, 'the frame is shown').toBe(true);
  expect(motion.canvases, 'no canvas under prefers-reduced-motion: reduce').toBe(0);
  expect(motion.frame, 'the frame is shown').toBe(true);
});

// ---------------------------------------------------------------------------------------------
// the polish round (docs/POLISH.md 2.5 items 36, 47 and 48, 5.1 `shaders.*`): a large frame lands
// or a sentence says it did not, the gallery's and the section's words, and the insert on a blank
// slide.

test(title('shaders.frame.large-png-lands'), async () => {
  test.setTimeout(300_000);
  await openEditor(page, deck);
  const own = await addSlide(page);
  const made = await ensureShader(page, own, {
    materialId: 'paper:god-rays',
    pos: { x: 436, y: 244, w: 727, h: 412 },
  });
  const t0 = Date.now();
  const frame = await waitFrame(page, own, made.id, { timeout: 8000 });
  const ms = Date.now() - t0;
  const file = frame.asset ? await frameFile(page, made.id) : null;
  const size = file ? pngSize(file.bytes) : null;
  /* the card, the show and the print page draw it: a pixel read finds no plate grey */
  const plateGrey = (hex: string) =>
    /^#(e[0-9a-f]|f[0-9a-f]|d[0-9a-f]){3}$/.test(hex) || /^#([0-9a-f]{2})\1\1$/.test(hex);
  /* the visible match (B4's F5, the fix round): the show keeps a hidden 60 by 34 copy of the
     slide in the document ahead of its sheet, so the first match by document order was a copy
     whose frame img is `visibility: hidden` and the samples read the page's white; the block read
     is the largest match that is laid out and visible, its frame img included. The plate is
     compared by its own colour: the `.material` ground is `var(--plate)` over the sheet
     (rgba(7, 7, 7, 0.035) on the light kit, #f6f6f6 composited), and a god rays frame in the
     kit's black and white is greys by nature, so "any grey" read a drawn frame as the plate; a
     frame img that is complete inside the visible block reads as drawn whatever the samples */
  const toHex = (c: readonly number[]) =>
    `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const sampleAt = async (root: string, blockId: string) => {
    const read = await page.evaluate(
      ([sel, id]) => {
        const visible = (el: Element) =>
          el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const matches = [
          ...document.querySelectorAll(
            sel
              .split(',')
              .map((s) => `${s.trim()} [data-block="${id}"]`)
              .join(', '),
          ),
        ].filter((el) => {
          if (!visible(el)) return false;
          const img = el.querySelector('img');
          return img ? visible(img) : true;
        });
        const el = matches
          .map((m) => ({ m, r: m.getBoundingClientRect() }))
          .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
        if (!el) return null;
        const ground = el.m.querySelector('.material') ?? el.m;
        const sheet = el.m.closest('.pt-slide, .ts-sheet, .sheet');
        const toRgb = (s: string) => {
          const m = /rgba?\(([^)]+)\)/.exec(s);
          if (!m) return null;
          const parts = m[1]!.split(',').map((v) => parseFloat(v));
          return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts.length > 3 ? parts[3]! : 1 };
        };
        const over = toRgb(getComputedStyle(ground).backgroundColor);
        const under = sheet ? toRgb(getComputedStyle(sheet).backgroundColor) : null;
        const base = under && under.a > 0 ? under : { r: 255, g: 255, b: 255, a: 1 };
        const plate = over
          ? [
              Math.round(over.r * over.a + base.r * (1 - over.a)),
              Math.round(over.g * over.a + base.g * (1 - over.a)),
              Math.round(over.b * over.a + base.b * (1 - over.a)),
            ]
          : null;
        const img = el.m.querySelector('img') as HTMLImageElement | null;
        return {
          box: { x: el.r.x, y: el.r.y, width: el.r.width, height: el.r.height },
          matches: matches.length,
          plate,
          img:
            img && img.complete && img.naturalWidth > 0
              ? (img.currentSrc || img.getAttribute('src') || '').slice(-48)
              : null,
        };
      },
      [root, blockId] as const,
    );
    if (!read || read.box.width < 4) return null;
    const rgb = await sampleClip(
      page,
      read.box,
      [
        [0.5, 0.5],
        [0.25, 0.5],
        [0.75, 0.5],
      ],
      0.02,
    );
    if (!rgb) return null;
    const hexes = rgb.rgb.map(toHex);
    const isPlate = (c: readonly number[]) =>
      read.plate ? rgbDistance(c, read.plate) <= 6 : plateGrey(toHex(c));
    return {
      hexes,
      /* grey: nothing drawn, every sample the plate's colour and no complete frame img */
      grey: read.img === null && rgb.rgb.every((c) => isPlate(c)),
      plate: read.plate ? toHex(read.plate) : 'unread',
      img: read.img,
      matches: read.matches,
    };
  };
  await page.keyboard.press('Escape');
  const card = await sampleAt(`[data-control="filmstrip.slide.${own}"]`, made.id);
  await ctl(page, 'present.open').click();
  await ctl(page, 'present.show').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  /* the show's slide is the stage's sheet in present mode (`.ts-stagewrap.is-present`) */
  const show = await sampleAt(
    '.ts-stagewrap.is-present .pt-slide:not(.is-leaving), .pt-viewer.is-present .pt-slide:not(.is-leaving), [data-control="present.show"] .pt-slide:not(.is-leaving)',
    made.id,
  );
  await page.keyboard.press('Escape');
  await ctl(page, 'present.show')
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => undefined);
  await menuPath(page, 'file', 'file.printPreview');
  await page.waitForURL(/\/print\//, { timeout: 20_000 });
  await page.waitForSelector('[data-control="print.page"][data-hydrated]', { timeout: 20_000 });
  await page.waitForTimeout(800);
  const printed = await sampleAt('[data-control="print.page"]', made.id);
  await ctl(page, 'print.close').click();
  await page.waitForURL(/\/edit\//, { timeout: 20_000 });
  /* the editor comes back on its first slide; the shader's slide is made current again before
     the block is selected on the stage */
  await waitEditor(page);
  await clickCard(page, own);
  /* a put forced to 413: the frame's write answered 413 through page.route; one sentence and one
     retry. The editor's shader.frame travels inside the server function POST (/_serverFn/<id>,
     runDeckActionFn), not the actions or upload routes, and with the WebP fallback its bytes are
     under the cap on every tier, so every POST and PUT of the page is routed and the first one
     that is the frame's write (an upload route, or a server function POST whose body names
     shader.frame) is refused (the fix round, B4's F4) */
  const uploads =
    /\/api\/x\/upload\/|\/api\/actions\/asset\.add|\/api\/actions\/shader\.frame|\/api\/decks\/[^/?]+\/assets/;
  const isFrameWrite = (request: {
    method(): string;
    url(): string;
    postData(): string | null;
  }) => {
    const method = request.method();
    if (method !== 'POST' && method !== 'PUT') return false;
    const path = new URL(request.url()).pathname;
    if (uploads.test(path)) return true;
    return (
      method === 'POST' &&
      path.startsWith('/_serverFn/') &&
      (request.postData() ?? '').includes('shader.frame')
    );
  };
  let refused = 0;
  const puts: string[] = [];
  await page.route('**/*', async (route) => {
    const method = route.request().method();
    if (!isFrameWrite(route.request())) return route.continue();
    if (refused < 1) {
      refused += 1;
      puts.push(`${method} ${new URL(route.request().url()).pathname} -> 413`);
      return route.fulfill({
        status: 413,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'FUNCTION_PAYLOAD_TOO_LARGE' }),
      });
    }
    puts.push(`${method} ${new URL(route.request().url()).pathname} -> through`);
    return route.continue();
  });
  const how = await changeRecipe(page, made.id, 1.25, 6300);
  const second = await waitFrame(page, own, made.id, { not: frame.asset, timeout: 25_000 });
  const words = await snackbarText(page);
  await page.unroute('**/*');
  const retried = puts.filter((p) => /-> through$/.test(p)).length;
  test.info().annotations.push({
    type: 'frame',
    description: `${made.how}; the frame ${frame.asset ?? 'none'} after ${ms} ms (${size ? `${size.width} by ${size.height}` : 'unread'}); card ${card ? `${card.hexes.join(' ')} (plate ${card.plate}, img ${card.img ?? 'none'}, ${card.matches} visible) grey ${card.grey}` : 'unread'}, show ${show ? `${show.hexes.join(' ')} (plate ${show.plate}, img ${show.img ?? 'none'}, ${show.matches} visible) grey ${show.grey}` : 'unread'}, print ${printed ? `${printed.hexes.join(' ')} (plate ${printed.plate}, img ${printed.img ?? 'none'}, ${printed.matches} visible) grey ${printed.grey}` : 'unread'}; ${how}; 413 injected ${refused} (${puts.join('; ')}); the second frame ${second.asset ?? 'none'} after ${second.ms} ms; snackbar "${words}"`,
  });
  expect(frame.asset, 'the frame asset exists within 8 s').not.toBeNull();
  expect(card?.grey, 'the filmstrip card draws it').toBe(false);
  expect(show?.grey, 'the show draws it').toBe(false);
  expect(printed?.grey, "the PDF's page draws it").toBe(false);
  expect(refused, 'one put was forced to 413').toBe(1);
  expect(retried, 'one retry').toBeGreaterThanOrEqual(1);
  expect(
    second.asset !== null || /frame|still|could not|try again/i.test(words ?? ''),
    'the frame lands on the retry or one sentence says it did not',
  ).toBe(true);
});

test(title('shaders.gallery.words-and-head'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  await clickCard(page, slideId);
  const gallery = await openShaderGallery(page);
  if (!gallery.open) test.skip(true, 'not on this build: insert.shader (docs/FEATURES.md 5.10)');
  const tips = await page.evaluate(() => {
    const cards = [
      ...document.querySelectorAll(
        '[data-control^="dialog.shader.tile."], [data-control^="dialog.shader.card."]',
      ),
    ].filter(
      (e) =>
        e.getClientRects().length > 0 &&
        /* the tile itself carries the tip; its thumb and title parts (`.thumb`, `.title`) are
           sub controls without one */
        /^dialog\.shader\.(tile|card)\.[^.]+(?::[^.]+)?$/.test(
          e.getAttribute('data-control') ?? '',
        ),
    );
    return cards.map((c) => ({
      id: c.getAttribute('data-control') ?? '',
      tip:
        c.getAttribute('data-tip-doc') ??
        c.getAttribute('data-tip') ??
        c.getAttribute('title') ??
        '',
    }));
  });
  const sentence =
    (await page.evaluate(() =>
      (document.querySelector('[data-control="dialog.shader.sentence"]')?.textContent ?? '').trim(),
    )) ?? '';
  const heightBefore = await ctl(page, 'dialog.shader').evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  await ctl(page, 'dialog.shader.search').click();
  await page.keyboard.type('zzzqqq', { delay: 60 });
  await page.waitForTimeout(800);
  const heightAfter = await ctl(page, 'dialog.shader').evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  await page.keyboard.press('Escape');
  await expect(ctl(page, 'dialog.shader')).toHaveCount(0, { timeout: 5000 });
  if (gallery.switched) await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  /* the Shader section's head: the name, the still and Change, and no Text section or second Height stepper */
  await selectBlock(page, shader!.id);
  const opened = await openShaderSection(page, shader!.id);
  const section = opened
    ? await page.evaluate(() => {
        const panel = document.querySelector('[data-control="panel.formatOptions"]')!;
        const shaderSection = panel.querySelector('[data-section="shader"]');
        const head = shaderSection?.querySelector(
          '.ts-shader-head, .ts-fo-shader-head, .ts-panel-section-body > .ts-fo-row:first-child',
        );
        /* the head's name is `.ts-shader-title` in the name row (inspector/shader.tsx Head;
           `.ts-shader-name` is the gallery's one line name) and Change is the row's PanelButton
           `formatOptions.shader.change`; the ship's run of record read no name through the older
           selectors twice (the polish fix round 3, B6) */
        const name = head?.querySelector(
          '.ts-shader-title, b, strong, .ts-shader-name, .ts-fo-shader-name',
        );
        const change =
          shaderSection?.querySelector('[data-control="formatOptions.shader.change"]') ??
          shaderSection?.querySelector(
            'button:not([data-control*="preset"]):not([data-control*="color"])',
          );
        const changeBtn =
          [...(shaderSection?.querySelectorAll('button') ?? [])].find((b) =>
            /^Change$/.test((b.textContent ?? '').trim()),
          ) ?? change;
        const nr = name?.getBoundingClientRect() ?? null;
        const cr = changeBtn?.getBoundingClientRect() ?? null;
        const sections = [...panel.querySelectorAll('[data-section]')].map(
          (s) => s.getAttribute('data-section') ?? '',
        );
        const heights = [...panel.querySelectorAll('.ts-fo-field-label, label')].filter((l) =>
          /^Height$/.test((l.textContent ?? '').trim()),
        ).length;
        return {
          gap: nr && cr ? Math.round(cr.left - nr.right) : null,
          name: (name?.textContent ?? '').trim(),
          change: (changeBtn?.textContent ?? '').trim(),
          sections,
          heights,
          text: sections.includes('text'),
        };
      })
    : null;
  const bad = tips.filter(
    (t) =>
      t.tip.length === 0 ||
      t.tip.length >= 120 ||
      /Prototemplate|Glyphfield|GT\b/.test(t.tip) ||
      (t.tip.match(/[.!?](\s|$)/g) ?? []).length > 1,
  );
  test.info().annotations.push({
    type: 'gallery',
    description: `${tips.length} tiles; tips over 120 characters, naming a product or more than one sentence: ${bad.length}${
      bad.length > 0
        ? ` (${bad
            .slice(0, 3)
            .map((t) => `${t.id}: "${t.tip.slice(0, 80)}"`)
            .join(' | ')})`
        : ''
    }; the sentence "${sentence}"; height ${Math.round(heightBefore)} -> ${Math.round(heightAfter)} on no match; the section ${section ? `name "${section.name}" to Change "${section.change}" ${section.gap} px; sections ${section.sections.join(', ')}; Height labels ${section.heights}` : 'not open'}`,
  });
  expect(bad, 'every tile tooltip is one sentence under 120 characters naming no product').toEqual(
    [],
  );
  expect(sentence, 'a true sentence about the swatches (not black and white previews)').not.toMatch(
    /black and white/i,
  );
  expect(Math.round(heightAfter), "the dialog's height holds on no match").toBe(
    Math.round(heightBefore),
  );
  expect(section, 'the Shader section opened').not.toBeNull();
  expect(
    section!.gap ?? 0,
    "the section head's name and Change 8 px apart or more",
  ).toBeGreaterThanOrEqual(8);
  expect(section!.text, 'no Text section for a material').toBe(false);
  expect(section!.heights, 'one Height stepper').toBeLessThanOrEqual(1);
});

test(title('shaders.insert.free-rectangle'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  /* an empty slide: Blank applied through the layout plate, which drops the placeholders
     (docs/POLISH.md 2.3 item 13, `slides.layout.blank-empty`). A `slide.set` of `/layout` alone
     left the fresh slide's title and body prompts, which count for a material (B4's R4 in
     place-insert.ts: a shader covers a prompt), so the ship's run of record read the strip
     between them, 137,218 1326 by 237, twice on both slides (the polish fix round 3, B6) */
  const empty = await addSlide(page);
  await clickCard(page, empty);
  await page.keyboard.press('Escape');
  await ctl(page, 'toolbar.layout').click();
  await ctl(page, 'layout.apply.plate').waitFor({ timeout: 8000 });
  await ctl(page, 'layout.apply.blank').click();
  await expect(ctl(page, 'layout.apply.plate')).toHaveCount(0, { timeout: 8000 });
  await settled(page);
  const emptyObjects = (await objectsOf(page, empty)).length;
  const onEmpty = await ensureShader(page, empty);
  const under = await addSlide(page);
  const run = await headingRun(page);
  await typeInto(page, run, 'A title above');
  await settled(page);
  const underTitle = await ensureShader(page, under);
  const pos = (b: Record<string, unknown>) =>
    b['pos'] as { x: number; y: number; w: number; h: number };
  const a = pos(onEmpty.block);
  const b = pos(underTitle.block);
  /* under a title the free rectangle: the box sits under the head band, meets no other object of
     the slide (the typed title and the body prompt, converted to canvas by the insert) and holds
     the helper's 240 by 135 minimum (place-insert.ts) */
  const others = (await objectsOf(page, under)).filter((o) => o.id !== underTitle.id);
  const meets = others.filter(
    (o) =>
      o.pos.x < b.x + b.w &&
      o.pos.x + o.pos.w > b.x &&
      o.pos.y < b.y + b.h &&
      o.pos.y + o.pos.h > b.y,
  );
  test.info().annotations.push({
    type: 'placement',
    description: `empty slide (${emptyObjects} objects before; ${onEmpty.how}): ${JSON.stringify(a)}; under a title (${underTitle.how}): ${JSON.stringify(b)} beside ${others.map((o) => `${o.type} ${o.pos.x},${o.pos.y} ${o.pos.w}x${o.pos.h}`).join(', ') || 'nothing'}`,
  });
  expect(onEmpty.how, 'the insert went through the product').toMatch(/Insert > Shader/);
  expect(emptyObjects, 'the Blank slide holds nothing').toBe(0);
  expect([a.x, a.y, a.w, a.h], 'the content box on an empty slide').toEqual([137, 129, 1326, 642]);
  expect(b.y, 'under a title the free rectangle').toBeGreaterThan(129);
  expect(
    meets.map((o) => o.id),
    'the free rectangle meets no other object',
  ).toEqual([]);
  expect(b.w >= 240 && b.h >= 135, 'the free rectangle holds the 240 by 135 minimum').toBe(true);
});

coverage(import.meta.filename, [
  'shaders.frame.auto-capture',
  'shaders.frame.box-aspect',
  'shaders.frame.reuse-and-prune',
  'shaders.frame.one-capturer',
  'shaders.perf.hidden-pauses',
  'shaders.perf.editor-frame',
  'shaders.agent.list-insert-set-render',
  'shaders.library.glyph-engines-render',
  'shaders.show.plays-when-on',
  'shaders.show.frame-when-off',
  /* the polish round (docs/POLISH.md 2.5 items 36, 47 and 48) */
  'shaders.frame.large-png-lands',
  'shaders.gallery.words-and-head',
  'shaders.insert.free-rectangle',
]);
