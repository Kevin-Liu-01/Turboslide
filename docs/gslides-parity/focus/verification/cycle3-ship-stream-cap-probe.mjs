// The ship step's read of VERIFICATION.md C3-F1 on the wire, from inside a browser page (the raw
// fetch version was refused 403 by the route's same origin rules): one page of /edit/gt-brand (one
// anonymous identity, one stream of its own) opens more streams of the same deck with same origin
// fetches, holds them, and reports each answer's status and a refusal's body; then it closes every
// held stream and asks again, timed, to read whether the closed streams' slots are released when
// the server sees the abort. Reads gt-brand alone; writes nothing; no token printed.
//
//   BASE=<origin> node stream-cap-page-probe.mjs   (VERCEL_OIDC_TOKEN in the environment for a preview)
//
// The cycle 3 stream fix round, pass 2 (the verifier): two readings beside the raw one, both off by
// default so the raw reading of pass 1 and the seam step stays comparable. TAB=1 sends every open
// with a tab token (`&tab=<32 hex>`, minted once per run, the shape of the page's own opens since
// the fix round; a fresh token, so the page's own stream is never released by count), which the
// route uses to release the slots the same tab and identity hold on the instance before the caps
// are judged. LONG_WAIT=1 keeps asking after the close at +45, +60 and +90 s (cumulative +112 to
// +202 s) when the shorter ladder was refused, to read the reader liveness rule (a raw stream
// nobody posts presence for closes 45 to 90 s after its open, room.ts createReaderLiveness).
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const { chromium } = createRequire('/Users/kevinliu/repos/Turboslide/package.json')(
  'playwright-core',
);

const base = process.env.BASE;
if (!base) throw new Error('BASE is required');
const oidc = process.env.VERCEL_OIDC_TOKEN;
const opens = Number(process.env.OPENS ?? 6);
const tabToken = process.env.TAB === '1' ? randomBytes(16).toString('hex') : null;
const longWait = process.env.LONG_WAIT === '1';
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`;

const browser = await chromium.launch();
const context = await browser.newContext({
  extraHTTPHeaders: oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {},
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();
const consoleLines = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(m.text().slice(0, 160));
});
await page.goto(`${base}/edit/gt-brand`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pt-viewer', { timeout: 60_000 }).catch(() => null);
await page.waitForTimeout(3000);
const sync = await page
  .evaluate(() => globalThis.turboslide?.studio?.describe?.()?.state?.sync ?? null)
  .catch(() => null);
console.log(`${at()} page open; sync: ${JSON.stringify(sync)?.slice(0, 160)}`);
console.log(
  `${at()} opens carry ${tabToken ? 'a tab token (TAB=1, the page shape)' : 'no tab token (raw)'}; after close ladder ${longWait ? 'long (LONG_WAIT=1)' : 'short'}`,
);

// same origin fetches of the stream route from the page, each held open
await page.evaluate((tab) => {
  globalThis.__held = [];
  globalThis.__streamUrl = '/api/decks/gt-brand/stream?since=0' + (tab ? `&tab=${tab}` : '');
  globalThis.__openStream = async (label) => {
    const controller = new AbortController();
    const started = performance.now();
    let response;
    try {
      response = await fetch(globalThis.__streamUrl, {
        headers: { accept: 'text/event-stream' },
        signal: controller.signal,
      });
    } catch (error) {
      return { label, status: 'fetch failed', detail: String(error.message) };
    }
    const ms = Math.round(performance.now() - started);
    const id = response.headers.get('x-vercel-id') ?? '-';
    if (response.status === 200) {
      const reader = response.body.getReader();
      const first = await reader.read().catch(() => ({ value: undefined }));
      const text = first.value ? new TextDecoder().decode(first.value) : '';
      globalThis.__held.push({ controller, reader });
      (async () => {
        try {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        } catch {
          /* aborted */
        }
      })();
      return { label, status: 200, ms, id, hello: /event: hello/.test(text) };
    }
    const body = await response.text().catch(() => '');
    return {
      label,
      status: response.status,
      ms,
      id,
      body: body.slice(0, 120),
      retryAfter: response.headers.get('retry-after'),
    };
  };
  globalThis.__closeAll = () => {
    const n = globalThis.__held.length;
    for (const h of globalThis.__held) h.controller.abort();
    globalThis.__held = [];
    return n;
  };
}, tabToken);

const report = (r) =>
  console.log(
    `${at()} ${r.label}: ${r.status}${r.ms !== undefined ? ` in ${r.ms} ms` : ''}${r.hello !== undefined ? ` (${r.hello ? 'hello' : 'no hello yet'})` : ''}${r.body ? ` ${r.body}` : ''}${r.retryAfter ? `; retry-after ${r.retryAfter}` : ''}${r.detail ? ` ${r.detail}` : ''}; ${r.id ?? ''}`,
  );

for (let i = 1; i <= opens; i += 1)
  report(await page.evaluate((l) => globalThis.__openStream(l), `open ${i}`));

const closed = await page.evaluate(() => globalThis.__closeAll());
console.log(`${at()} closed ${closed} held stream(s) (the page's own stream stays)`);

for (const wait of longWait
  ? [2000, 5000, 10000, 20000, 30000, 45000, 60000, 90000]
  : [2000, 5000, 10000, 20000, 30000]) {
  await page.waitForTimeout(wait);
  const r = await page.evaluate((l) => globalThis.__openStream(l), `after close, +${wait / 1000}s`);
  report(r);
  if (r.status === 200) break;
}
// The release cycles (the cycle 3 stream fix round's reading: a closed stream's slot frees within
// retry-after, so opens of one identity after closes succeed): every held stream is closed, then
// RELEASE_CYCLES times in a row one raw stream is opened, held one second and closed, and the
// next open waits the server's retry-after (the last refusal's header, 5 s by default). Every
// cycle admitted means the closed slot was freed within that wait; a refusal at cycle n means the
// slots of the earlier cycles stayed held on the instance the open landed on. The x-vercel-id of
// each answer says which instance answered.
const cycles = Number(process.env.RELEASE_CYCLES ?? 0);
if (cycles > 0) {
  const n0 = await page.evaluate(() => globalThis.__closeAll());
  console.log(`${at()} closed ${n0} held stream(s) before the release cycles`);
  let retryAfterS = 5;
  let admitted = 0;
  for (let c = 1; c <= cycles; c += 1) {
    await page.waitForTimeout(Math.max(2000, retryAfterS * 1000));
    const r = await page.evaluate((l) => globalThis.__openStream(l), `cycle ${c} open`);
    report(r);
    if (r.status === 200) {
      admitted += 1;
      await page.waitForTimeout(1000);
      const n = await page.evaluate(() => globalThis.__closeAll());
      console.log(`${at()} cycle ${c}: closed ${n} held stream(s)`);
    } else retryAfterS = Number(r.retryAfter ?? 5) || 5;
  }
  console.log(`${at()} release cycles: ${admitted} of ${cycles} opens admitted`);
}
await page.evaluate(() => globalThis.__closeAll());
const syncAfter = await page
  .evaluate(() => globalThis.turboslide?.studio?.describe?.()?.state?.sync ?? null)
  .catch(() => null);
console.log(`${at()} page sync after: ${JSON.stringify(syncAfter)?.slice(0, 160)}`);
console.log(`${at()} console (errors and warnings): ${consoleLines.length}`);
for (const l of consoleLines.slice(0, 12)) console.log(`   ${l}`);
await browser.close();
console.log(`${at()} done`);
