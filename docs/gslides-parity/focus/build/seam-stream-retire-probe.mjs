// The seam step's companion to verification/cycle3-ship-stream-cap-probe.mjs (the cycle 3 stream
// fix round, VERIFICATION.md C3-F1): the product's release of a tab's own stream slots. From one
// page of /edit/gt-brand (one anonymous identity, one stream of its own) three raw same origin
// streams are opened and held and their server issued ids read from `x-turboslide-client`; a
// fourth raw open meets the identity cap (503 too_many_streams); then one open carries the three
// held ids as `?retire=`, the way the room client's every reopen carries the tab's earlier ids
// (room-client.ts openStream), and the route releases their slots on this instance before it
// judges the cap. Reads gt-brand alone; writes nothing; no token printed.
//
//   BASE=<origin> node docs/gslides-parity/focus/build/seam-stream-retire-probe.mjs   (VERCEL_OIDC_TOKEN in the environment for a preview)
import { createRequire } from 'node:module';
const { chromium } = createRequire('/Users/kevinliu/repos/Turboslide/package.json')(
  'playwright-core',
);

const base = process.env.BASE;
if (!base) throw new Error('BASE is required');
const oidc = process.env.VERCEL_OIDC_TOKEN;
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`;

const browser = await chromium.launch();
const context = await browser.newContext({
  extraHTTPHeaders: oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {},
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();
await page.goto(`${base}/edit/gt-brand`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pt-viewer', { timeout: 60_000 }).catch(() => null);
await page.waitForFunction(
  () => globalThis.turboslide?.studio?.describe?.()?.state?.sync?.connected === true,
  null,
  { timeout: 60_000 },
);
const sync = await page.evaluate(() => globalThis.turboslide.studio.describe().state.sync);
console.log(`${at()} page open; sync: ${JSON.stringify(sync).slice(0, 200)}`);

await page.evaluate(() => {
  globalThis.__held = [];
  globalThis.__openStream = async (label, retire) => {
    const controller = new AbortController();
    const started = performance.now();
    const query =
      retire && retire.length ? `&retire=${retire.map(encodeURIComponent).join(',')}` : '';
    let response;
    try {
      response = await fetch(`/api/decks/gt-brand/stream?since=0${query}`, {
        headers: { accept: 'text/event-stream' },
        signal: controller.signal,
      });
    } catch (error) {
      return { label, status: 'fetch failed', detail: String(error.message) };
    }
    const ms = Math.round(performance.now() - started);
    const id = response.headers.get('x-turboslide-client') ?? null;
    if (response.status === 200) {
      const reader = response.body.getReader();
      const first = await reader.read().catch(() => ({ value: undefined }));
      const text = first.value ? new TextDecoder().decode(first.value) : '';
      globalThis.__held.push({ controller, reader, id });
      (async () => {
        try {
          for (;;) {
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
      body: body.slice(0, 100),
      retryAfter: response.headers.get('retry-after'),
    };
  };
  globalThis.__heldIds = () => globalThis.__held.map((h) => h.id);
  globalThis.__closeAll = () => {
    const n = globalThis.__held.length;
    for (const h of globalThis.__held) h.controller.abort();
    globalThis.__held = [];
    return n;
  };
});

const report = (r) =>
  console.log(
    `${at()} ${r.label}: ${r.status}${r.ms !== undefined ? ` in ${r.ms} ms` : ''}${r.hello !== undefined ? ` (${r.hello ? 'hello' : 'no hello yet'})` : ''}${r.id ? ` id ${r.id.slice(0, 8)}…` : ''}${r.body ? ` ${r.body}` : ''}${r.retryAfter ? `; retry-after ${r.retryAfter}` : ''}${r.detail ? ` ${r.detail}` : ''}`,
  );

// raw opens until the instance's identity cap refuses one (a fluid compute preview spreads the
// opens over instances, so the cap is met after four on one instance and later when they spread)
const verdict = { refused: false, retireAdmitted: false, opens: 0 };
let refusal = null;
for (let i = 1; i <= 12 && refusal === null; i += 1) {
  const r = await page.evaluate((l) => globalThis.__openStream(l), `raw open ${i}`);
  report(r);
  verdict.opens = i;
  if (r.status === 503) refusal = r;
}
verdict.refused = refusal !== null;
const held = await page.evaluate(() => globalThis.__heldIds());
console.log(
  `${at()} held ids: ${held.length} (${held.map((id) => (id ?? '-').slice(0, 8)).join(', ')})`,
);
if (refusal === null) {
  console.log(
    `${at()} no refusal in ${verdict.opens} raw opens: the opens spread over instances; the retire release is not read on this run`,
  );
} else {
  // the room client sends at most RETIRE_MAX = 8 ids (the newest); the route reads no more
  const retire = held.slice(-8);
  const withRetire = await page.evaluate(
    ([l, ids]) => globalThis.__openStream(l, ids),
    [`open with retire of ${retire.length} held ids`, retire],
  );
  report(withRetire);
  verdict.retireAdmitted = withRetire.status === 200;
  report(
    await page.evaluate((l) => globalThis.__openStream(l), 'raw open after the retire (no retire)'),
  );
}
const closed = await page.evaluate(() => globalThis.__closeAll());
console.log(`${at()} closed ${closed} held stream(s) (the page's own stream stays)`);
const syncAfter = await page.evaluate(() => globalThis.turboslide.studio.describe().state.sync);
console.log(`${at()} page sync after: ${JSON.stringify(syncAfter).slice(0, 200)}`);
console.log(
  `${at()} verdict: a raw open refused ${verdict.refused} (after ${verdict.opens} opens); the open carrying the held ids as retire admitted ${verdict.retireAdmitted}`,
);
await browser.close();
console.log(`${at()} done`);
process.exit(!verdict.refused ? 3 : verdict.retireAdmitted ? 0 : 1);
