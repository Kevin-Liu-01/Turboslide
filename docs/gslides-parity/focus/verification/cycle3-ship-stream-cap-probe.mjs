// The ship step's read of VERIFICATION.md C3-F1 on the wire, from inside a browser page (the raw
// fetch version was refused 403 by the route's same origin rules): one page of /edit/gt-brand (one
// anonymous identity, one stream of its own) opens more streams of the same deck with same origin
// fetches, holds them, and reports each answer's status and a refusal's body; then it closes every
// held stream and asks again, timed, to read whether the closed streams' slots are released when
// the server sees the abort. Reads gt-brand alone; writes nothing; no token printed.
//
//   BASE=<origin> node stream-cap-page-probe.mjs   (VERCEL_OIDC_TOKEN in the environment for a preview)
import { createRequire } from 'node:module';
const { chromium } = createRequire('/Users/kevinliu/repos/Turboslide/package.json')('playwright-core');

const base = process.env.BASE;
if (!base) throw new Error('BASE is required');
const oidc = process.env.VERCEL_OIDC_TOKEN;
const opens = Number(process.env.OPENS ?? 6);
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
  .evaluate(() => globalThis.turboslide?.describe?.()?.state?.sync ?? null)
  .catch(() => null);
console.log(`${at()} page open; sync: ${JSON.stringify(sync)?.slice(0, 160)}`);

// same origin fetches of the stream route from the page, each held open
await page.evaluate(() => {
  globalThis.__held = [];
  globalThis.__openStream = async (label) => {
    const controller = new AbortController();
    const started = performance.now();
    let response;
    try {
      response = await fetch('/api/decks/gt-brand/stream?since=0', {
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
});

const report = (r) =>
  console.log(
    `${at()} ${r.label}: ${r.status}${r.ms !== undefined ? ` in ${r.ms} ms` : ''}${r.hello !== undefined ? ` (${r.hello ? 'hello' : 'no hello yet'})` : ''}${r.body ? ` ${r.body}` : ''}${r.retryAfter ? `; retry-after ${r.retryAfter}` : ''}${r.detail ? ` ${r.detail}` : ''}; ${r.id ?? ''}`,
  );

for (let i = 1; i <= opens; i += 1) report(await page.evaluate((l) => globalThis.__openStream(l), `open ${i}`));

const closed = await page.evaluate(() => globalThis.__closeAll());
console.log(`${at()} closed ${closed} held stream(s) (the page's own stream stays)`);

for (const wait of [2000, 5000, 10000, 20000, 30000]) {
  await page.waitForTimeout(wait);
  const r = await page.evaluate((l) => globalThis.__openStream(l), `after close, +${wait / 1000}s`);
  report(r);
  if (r.status === 200) break;
}
await page.evaluate(() => globalThis.__closeAll());
const syncAfter = await page
  .evaluate(() => globalThis.turboslide?.describe?.()?.state?.sync ?? null)
  .catch(() => null);
console.log(`${at()} page sync after: ${JSON.stringify(syncAfter)?.slice(0, 160)}`);
console.log(`${at()} console (errors and warnings): ${consoleLines.length}`);
for (const l of consoleLines.slice(0, 12)) console.log(`   ${l}`);
await browser.close();
console.log(`${at()} done`);
