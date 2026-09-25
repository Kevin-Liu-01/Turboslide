// B7's fix round probe (features round, ship two; VERIFICATION.md pass 1 F2): the hosted render
// paths on a deployment after Paper's package joined the function bundle. One deck from /new,
// trashed and removed at the end. OIDC from VERCEL_OIDC_TOKEN and the bearer from
// TURBOSLIDE_TOKEN, both read from the environment and never printed.
//   node probe-hosted.mjs --base <origin> --out <json>
import { writeFileSync } from 'node:fs';

import { chromium } from '/Users/kevinliu/repos/Turboslide/node_modules/playwright-core/index.mjs';

const argv = process.argv.slice(2);
const argOf = (n, f) => {
  const i = argv.indexOf(n);
  return i === -1 ? f : (argv[i + 1] ?? f);
};
const BASE = argOf('--base', 'http://localhost:4417').replace(/\/$/, '');
const OUT = argOf('--out', 'probe-hosted.json');
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const BEARER = process.env.TURBOSLIDE_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (l) => console.log(`${new Date().toISOString().slice(11, 19)} ${l}`);
const out = { base: BASE, startedAt: new Date().toISOString(), readings: {} };

const pngSize = (buf) => {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};
const firstLine = (e) =>
  String(e?.message ?? e)
    .split('\n')[0]
    .slice(0, 300);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders,
  colorScheme: 'light',
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const invoke = (id, v, ms = 90_000) =>
  page.evaluate(
    ([a, b, t]) =>
      Promise.race([
        window.turboslide.studio.invoke(a, b),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error(`${a} timed out after ${t} ms`)), t),
        ),
      ]),
    [id, v, ms],
  );
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const objectsOf = async (slideId) => {
  const got = await invoke('slide.get', { slideId });
  const s = got.slide ?? got;
  const o = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      if (typeof n.id === 'string' && typeof n.type === 'string' && n.pos)
        o.push({ id: n.id, type: n.type, pos: n.pos, block: n });
      for (const v of Object.values(n)) walk(v);
    }
  };
  walk(s);
  return { slide: s, objects: o };
};

let deckId = null;
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(window.turboslide?.studio) && Boolean(document.querySelector('.pt-slide')),
    null,
    { timeout: 90_000 },
  );
  await sleep(800);
  const s0 = await state();
  const slideId = s0.slideId;
  const d = await page.evaluate(() => window.turboslide.studio.describe());
  deckId = d.deck?.id ?? d.state?.deckId;
  log(`deck ${deckId}, slide ${slideId}`);

  // 1. shader.render through the window transport, two materials (F2's first reading)
  for (const [materialId, preset] of [
    ['paper:liquid-metal', 'diamond'],
    ['paper:gem-smoke', 'ink-paper'],
  ]) {
    const t1 = Date.now();
    const r = await invoke(
      'shader.render',
      { materialId, preset, size: [3200, 1800], timeMs: 5500 },
      90_000,
    )
      .then((x) => {
        const png = typeof x?.png === 'string' ? Buffer.from(x.png, 'base64') : null;
        return {
          ok: true,
          width: x?.width,
          height: x?.height,
          backend: x?.backend,
          renderer: x?.renderer,
          bytes: png ? png.length : null,
          decoded: png ? pngSize(png) : null,
        };
      })
      .catch((e) => ({ ok: false, error: firstLine(e) }));
    out.readings[`window shader.render ${materialId}`] = { ...r, ms: Date.now() - t1 };
    log(
      `window shader.render ${materialId}: ${JSON.stringify(out.readings[`window shader.render ${materialId}`])}`,
    );
  }

  // 2. slide.setBackgroundMaterial on a new slide, three materials (F2's Place reading)
  const s1 = await state();
  const made = await invoke('slide.new', {
    baseRevision: s1.revision,
    after: slideId,
    layout: 'split',
  }).catch((e) => ({ error: firstLine(e) }));
  const list = await invoke('slide.list', {});
  const ids = (Array.isArray(list) ? list : (list.slides ?? list.items ?? [])).map((x) =>
    typeof x === 'string' ? x : x.id,
  );
  const B = made?.id ?? made?.slideId ?? ids[ids.indexOf(slideId) + 1];
  for (const materialId of ['paper:gem-smoke', 'paper:liquid-metal', 'paper:god-rays']) {
    const s2 = await state();
    const t1 = Date.now();
    const r = await invoke(
      'slide.setBackgroundMaterial',
      { slideIds: [B], materialId, anchor: 5500, baseRevision: s2.revision },
      90_000,
    )
      .then((x) => ({ ok: true, answer: JSON.stringify(x).slice(0, 160) }))
      .catch((e) => ({ ok: false, error: firstLine(e) }));
    const ms = Date.now() - t1;
    await sleep(600);
    const after = await objectsOf(B).catch(() => null);
    const ground = after
      ? (after.objects.find((o) => o.block.role === 'background' || o.id === 'background') ??
        after.objects.find((o) => o.type === 'picture'))
      : null;
    out.readings[`place ${materialId}`] = {
      ...r,
      ms,
      ground: ground
        ? { id: ground.id, type: ground.type, asset: ground.block.asset ?? null }
        : null,
      kind: after?.slide?.kind ?? null,
    };
    log(`place ${materialId}: ${JSON.stringify(out.readings[`place ${materialId}`])}`);
  }

  // 3. shader.insert then shader.capture on the title slide (the hosted fallback)
  const s3 = await state();
  const ins = await invoke('shader.insert', {
    slideId,
    materialId: 'paper:liquid-metal',
    baseRevision: s3.revision,
  }).catch((e) => ({ error: firstLine(e) }));
  await sleep(1000);
  const block = (await objectsOf(slideId)).objects.find((o) => o.type === 'material');
  if (block === undefined)
    throw new Error(`shader.insert placed no block: ${JSON.stringify(ins).slice(0, 200)}`);
  const s4 = await state();
  const t2 = Date.now();
  const cap = await invoke(
    'shader.capture',
    { slideId, blockId: block.id, baseRevision: s4.revision },
    90_000,
  )
    .then((x) => ({ ok: true, answer: JSON.stringify(x).slice(0, 240) }))
    .catch((e) => ({ ok: false, error: firstLine(e) }));
  out.readings['shader.capture'] = { ...cap, ms: Date.now() - t2, blockId: block.id };
  log(`shader.capture: ${JSON.stringify(out.readings['shader.capture'])}`);

  // 4. shader.render on the HTTP transport with the bearer (the row's own reading)
  if (BEARER) {
    const headers = {
      ...extraHTTPHeaders,
      'content-type': 'application/json',
      authorization: `Bearer ${BEARER}`,
    };
    const t3 = Date.now();
    const res = await page.request.post(
      `${BASE}/api/actions/shader.render?deck=${encodeURIComponent(deckId)}`,
      {
        headers,
        data: {
          materialId: 'paper:liquid-metal',
          preset: 'diamond',
          size: [3200, 1800],
          timeMs: 5500,
        },
        timeout: 60_000,
        maxRedirects: 0,
      },
    );
    const ms = Date.now() - t3;
    const type = res.headers()['content-type'] ?? '';
    let png = null;
    let error = null;
    if (/image\/png/.test(type)) png = Buffer.from(await res.body());
    else {
      const body = await res.json().catch(() => null);
      if (typeof body?.png === 'string') png = Buffer.from(body.png, 'base64');
      else error = JSON.stringify(body).slice(0, 300);
    }
    out.readings['http shader.render'] = {
      status: res.status(),
      type,
      ms,
      bytes: png ? png.length : null,
      decoded: png ? pngSize(png) : null,
      error,
    };
    log(`http shader.render: ${JSON.stringify(out.readings['http shader.render'])}`);
    const alias = await page.request.post(
      `${BASE}/api/actions/material.list?deck=${encodeURIComponent(deckId)}`,
      { headers, data: {}, maxRedirects: 0 },
    );
    out.readings['http material.list'] = { status: alias.status() };
    log(`http material.list: ${alias.status()}`);
  } else {
    out.readings['http shader.render'] = { skipped: 'no TURBOSLIDE_TOKEN in the environment' };
  }
} catch (error) {
  out.error = error instanceof Error ? error.message : String(error);
  log(`probe failed: ${out.error}`);
} finally {
  if (deckId) {
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, {
        timeout: 60_000,
      });
      const info = await invoke('deck.info', {}).catch(() => null);
      await invoke('deck.trash', { id: deckId, baseRevision: info?.revision ?? 0 }).catch(
        () => undefined,
      );
      const again = await invoke('deck.info', {}).catch(() => null);
      await invoke('deck.remove', {
        id: deckId,
        baseRevision: again?.revision ?? 0,
        confirm: true,
      }).catch(() => undefined);
      const gone = await page
        .goto(`${BASE}/deck/${deckId}`, { waitUntil: 'domcontentloaded' })
        .then((r) => r?.status())
        .catch(() => 'no response');
      out.cleanup = { deckId, status: gone };
      log(`cleanup ${deckId}: /deck answers ${gone}`);
    } catch (e) {
      log(`cleanup failed ${e}`);
    }
  }
  await browser.close();
  out.finishedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(out, null, 2));
}
