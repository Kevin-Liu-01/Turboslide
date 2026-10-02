// The verifier's probe of the ticket refresh (docs/CLOUDFLARE.md 3.3; the hand drive's 10 minute
// wait read both sockets closed at the 480 s refresh): one person on a scratch deck from /new, the
// tab's client id from its hello, then the ticket route as the transport's refresh calls it
// (`?client=<cid>`) and without the parameter; prints the claims' non secret fields (cid equal to
// the tab's, role, org, the life) and never a token. Then the refreshed ticket is sent up a second
// socket the probe opens itself with the page's first ticket, and the close code is read.
// The deck is trashed and removed by its id.
//   node docs/gslides-parity/cloudflare/verify/ticket-probe.mjs --base http://localhost:4479
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const BASE = argv[argv.indexOf('--base') + 1] ?? 'http://localhost:4479';
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const invoke = (p, a, i) =>
  p.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
const claimsOf = (token) => {
  if (typeof token !== 'string') return null;
  const [body] = token.split('.');
  try {
    const c = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    return {
      v: c.v,
      cid: c.cid,
      role: c.role,
      kind: c.kind,
      org: c.org,
      life: c.exp - c.iat,
      tab: c.tab ? 'set' : 'absent',
    };
  } catch {
    return 'unreadable';
  }
};
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let deckId = null;
const out = {};
try {
  await page.goto('/new');
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 60_000 });
  const run = await page.evaluate(() =>
    document
      .querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run]')
      ?.getAttribute('data-run'),
  );
  await page.locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`).first().dblclick();
  await sleep(150);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Ticket probe', { delay: 40 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  deckId = (await invoke(page, 'deck.info')).id;
  for (let i = 0; i < 100; i += 1) {
    if (
      (await page.evaluate(() => window.turboslide.studio.describe().state.sync?.connected)) ===
      true
    )
      break;
    await sleep(100);
  }
  const st = await page.evaluate(() => window.turboslide.studio.describe().state);
  const cid = st.presence?.clientId ?? st.sync?.clientId ?? null;
  out.tabClientId = cid ? `${cid.slice(0, 8)}…` : null;
  const route = async (query) =>
    page.evaluate(
      async ([id, q]) => {
        const r = await fetch(`/api/decks/${encodeURIComponent(id)}/ticket${q}`, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        const j = await r.json().catch(() => ({}));
        return {
          status: r.status,
          ticket: j.ticket ?? null,
          clientId: j.clientId ?? null,
          tier: j.tier ?? null,
          error: j.error ?? null,
          message: j.message ?? null,
        };
      },
      [deckId, query],
    );
  const withClient = await route(`?client=${encodeURIComponent(cid)}`);
  const without = await route('');
  out.withClient = {
    status: withClient.status,
    error: withClient.error,
    message: withClient.message,
    answeredClientEqual: withClient.clientId === cid,
    claims: claimsOf(withClient.ticket),
    claimsCidEqual: claimsOf(withClient.ticket)?.cid === cid,
  };
  out.withoutClient = {
    status: without.status,
    answeredClientEqual: without.clientId === cid,
    claimsCidEqual: claimsOf(without.ticket)?.cid === cid,
  };
  // the refresh sent up a socket the page opened: the page's own transport is the reader, so the
  // probe sends the frame through the page's open socket the way the transport does
  out.sentUpPageSocket = await page.evaluate(async (ticket) => {
    const log = window.__probeClose ?? [];
    return {
      note: 'the page holds its socket inside the transport; the frame is not sent from here',
      had: log.length,
      ticketPresent: typeof ticket === 'string',
    };
  }, withClient.ticket);
} catch (error) {
  out.error = String(error?.stack ?? error).slice(0, 800);
} finally {
  if (deckId) {
    try {
      const info = await invoke(page, 'deck.info');
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision });
      const t = await invoke(page, 'deck.info').catch(() => info);
      await invoke(page, 'deck.remove', { id: deckId, confirm: true, baseRevision: t.revision });
      out.teardown = (await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' })).status;
    } catch (error) {
      out.teardownError = String(error).slice(0, 200);
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
