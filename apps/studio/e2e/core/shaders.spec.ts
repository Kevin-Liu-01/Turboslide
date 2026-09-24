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
  extraHTTPHeaders,
  frameAssets,
  installRafCounter,
  invoke,
  menuPath,
  newDeck,
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
/** The frame img the sheet draws for the block, its src and the file's size, or null. */
async function frameFile(p: Page, id: string): Promise<{ src: string; bytes: Buffer } | null> {
  const src = await p.evaluate((blockId) => {
    const root = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
    );
    const img = root?.querySelector('img');
    return img ? img.currentSrc || img.getAttribute('src') : null;
  }, id);
  if (!src) return null;
  const res = await p.request.get(src, { headers: extraHTTPHeaders, maxRedirects: 0 });
  if (res.status() !== 200) return null;
  return { src, bytes: Buffer.from(await res.body()) };
}
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
  /* the filmstrip card shows the frame: the card's picture sampled where the block sits on the
     slide against the frame's own centre */
  const pos = (b?.pos ?? null) as { x: number; y: number; w: number; h: number } | null;
  const cardSrc = await page.evaluate((sid) => {
    const card = document.querySelector(`[data-control="filmstrip.slide.${sid}"] img`);
    return card ? (card as HTMLImageElement).currentSrc || card.getAttribute('src') : null;
  }, slideId);
  let card: { rgb: [number, number, number][] } | null = null;
  let frameCentre: { rgb: [number, number, number][] } | null = null;
  if (cardSrc && pos && file) {
    await page.waitForTimeout(1500);
    card = await samplePicture(page, cardSrc, [
      [(pos.x + pos.w / 2) / 1600, (pos.y + pos.h / 2) / 900],
    ]);
    frameCentre = await samplePicture(page, file.bytes, [[0.5, 0.5]]);
  }
  const cardDistance = card && frameCentre ? rgbDistance(card.rgb[0]!, frameCentre.rgb[0]!) : null;
  test.info().annotations.push({
    type: 'capture',
    description: `${shader!.how}; setup frame ${first.asset ?? 'none'} after ${first.ms} ms; ${how}; frame ${got.asset ?? 'none'} ${ms} ms after the change; source ${JSON.stringify(asset?.source ?? null).slice(0, 300)}; file ${size ? `${size.width} by ${size.height}` : 'unread'}; card sample distance ${cardDistance ?? 'unread'}`,
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
    `frame-${key.slice(0, 16)}`,
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
    still = src ? await samplePicture(viewer, src, POINTS) : null;
  } finally {
    await viewer.close();
  }
  let live: { rgb: [number, number, number][] } | null = null;
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
      );
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  const distances =
    still && live ? POINTS.map((_, i) => rgbDistance(still!.rgb[i]!, live!.rgb[i]!)) : null;
  test.info().annotations.push({
    type: 'aspect',
    description: `${how}; box ${after ? `${after.pos.w} by ${after.pos.h}` : 'unread'}; frame ${got.asset ?? 'none'} after ${got.ms} ms, ${size ? `${size.width} by ${size.height}` : 'unread'} (wanted 3200 by about ${want}); viewer against the editor at rest: ${distances ? distances.join(', ') : 'unread'}`,
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
const showCanvases = (p: Page) =>
  p.evaluate(() => {
    const show = document.querySelector('[data-control="present.show"]');
    const img = show?.querySelector('.material img, [data-recipe] img');
    return {
      canvases: show ? show.querySelectorAll('canvas').length : -1,
      frame: img
        ? (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0
        : false,
    };
  });
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
  await setPlayShaders(page, /^on$/i);
  /* the block's Play in the show: the section's control when drawn, else the field (a setup) */
  let playHow = 'formatOptions.shader.play';
  if (
    (await openShaderSection(page, id)) &&
    (await ctl(page, 'formatOptions.shader.play').count()) > 0
  ) {
    const on = ctl(page, 'formatOptions.shader.play');
    const pressed =
      (await on.getAttribute('aria-pressed')) ?? (await on.getAttribute('aria-checked'));
    if (pressed === 'false') await on.click();
  } else {
    const b = await block();
    const motion = (b?.block['motion'] ?? null) as { play?: string } | null;
    if (motion?.play !== 'show') {
      const s = await settled(page);
      await invoke(page, 'block.set', {
        slideId,
        blockId: id,
        path: '/motion',
        value: { play: 'show' },
        baseRevision: s.revision,
      });
      await settled(page);
      playHow =
        "block.set /motion { play: 'show' } through the window API (no Play in the show control)";
    } else playHow = "motion.play already 'show' (the insert's default)";
  }
  await waitFrame(page, slideId, id, { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await clickCard(page, slideId);
  await ctl(page, 'present.open').click();
  await expect(ctl(page, 'present.show')).toBeAttached({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  const facts = await showCanvases(page);
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
  let motion = { canvases: -1, frame: false };
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
    description: `Play shaders off: ${off.canvases} canvas, frame drawn ${off.frame}; reduced motion with the setting on: ${motion.canvases} canvas, frame drawn ${motion.frame}`,
  });
  expect(off.canvases, 'no canvas with the setting off').toBe(0);
  expect(off.frame, 'the frame is shown').toBe(true);
  expect(motion.canvases, 'no canvas under prefers-reduced-motion: reduce').toBe(0);
  expect(motion.frame, 'the frame is shown').toBe(true);
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
]);
