// The verifier's read only look at a protected preview (docs/CLOUDFLARE.md 5.5 item 2): two anonymous
// contexts open the seeded brand deck in the editor and nobody types; for 45 s the drive reads each
// tab's sync status (tier, transport, connected, the room frame), the other person's chip and the
// socket opens and closes the page made. Nothing is written, so no deck is made or removed. The
// OIDC token rides as x-vercel-trusted-oidc-idp-token from VERCEL_OIDC_TOKEN (a wrapper sets it).
//   node docs/gslides-parity/cloudflare/verify/preview-read.mjs --base <preview> [--deck gt-brand] [--out <file>]
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const BASE = arg('base', '').replace(/\/$/, '');
const DECK = arg('deck', 'gt-brand');
const OUT = arg('out', null);
const OIDC = process.env.VERCEL_OIDC_TOKEN ?? '';
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const wsLogScript = () => {
  const Orig = window.WebSocket;
  window.__ws = { opens: 0, closes: [] };
  class Logged extends Orig {
    constructor(url, protocols) {
      super(url, protocols);
      window.__ws.opens += 1;
      this.addEventListener('close', (e) =>
        window.__ws.closes.push({
          at: Date.now(),
          code: e.code,
          reason: String(e.reason).slice(0, 80),
        }),
      );
    }
  }
  window.WebSocket = Logged;
};
const browser = await chromium.launch({ headless: true });
const mk = async () => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(OIDC ? { extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC } } : {}),
  });
  await ctx.addInitScript(wsLogScript);
  return ctx;
};
const out = { base: BASE, deck: DECK, startedAt: new Date().toISOString(), reads: [] };
const [ca, cb] = [await mk(), await mk()];
const [A, B] = [await ca.newPage(), await cb.newPage()];
try {
  const t0 = Date.now();
  await Promise.all([A.goto(`${BASE}/edit/${DECK}`), B.goto(`${BASE}/edit/${DECK}`)]);
  await Promise.all(
    [A, B].map((p) =>
      p.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 }),
    ),
  );
  out.readyMs = Date.now() - t0;
  for (let i = 0; i < 9; i += 1) {
    await sleep(5000);
    const read = async (p) =>
      p.evaluate(() => {
        const s = window.turboslide.studio.describe().state;
        const chips = document.querySelectorAll('[data-control^="presence.chip."]').length;
        return {
          tier: s.sync?.tier ?? null,
          transport: s.sync?.transport ?? null,
          connected: s.sync?.connected ?? null,
          room: s.sync?.room ?? null,
          streamDown: s.sync?.streamDown ?? null,
          chips,
          ws: { opens: window.__ws.opens, closes: window.__ws.closes.slice(-2) },
        };
      });
    out.reads.push({ s: Math.round((Date.now() - t0) / 1000), a: await read(A), b: await read(B) });
  }
} catch (error) {
  out.error = String(error?.stack ?? error).slice(0, 800);
} finally {
  out.endedAt = new Date().toISOString();
  const text = JSON.stringify(out, null, 1);
  if (OUT) writeFileSync(OUT, `${text}\n`);
  console.log(text.slice(0, 4000));
  await browser.close();
}
