// The verifier's probe of a tab whose deck object cannot reach the app (VERIFICATION.md realtime
// pass 1 finding 7; the realtime round's pass 2): run after the local Worker was restarted with
// TURBOSLIDE_APP_ORIGIN an origin nobody answers. A scratch deck is copied from gt-brand through
// the agent route of `--a` (a store write, so the deck's object has no meta row and must seed),
// opened by the link as an editor, then two anonymous browsers open it, A on `--a` and B on `--b`.
// For `--wait` seconds each tab's sync status (tier, transport, connected) and its room socket
// opens and closes are read every second with the Worker's /health; once a tab names a tier other
// than do it writes one block through the window API and the block is read back through the other
// origin's agent route. Nothing is judged. The deck is trashed and removed by its id.
//   node docs/gslides-parity/cloudflare/verify/fallback-probe.mjs --a http://localhost:4479 \
//     --b http://localhost:4489 --worker http://127.0.0.1:8799 --out <dir> [--wait 180]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadavg } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const BASE_A = arg('a', 'http://localhost:4479');
const BASE_B = arg('b', 'http://localhost:4489');
const WORKER = arg('worker', 'http://127.0.0.1:8799');
const WAIT_S = Number(arg('wait', '180'));
const OUT = resolve(arg('out', 'fallback-probe'));
mkdirSync(OUT, { recursive: true });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const facts = {
  startedAt: new Date().toISOString(),
  loadAtStart: loadavg(),
  baseA: BASE_A,
  baseB: BASE_B,
  reads: [],
};
const save = () => writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
const t0 = Date.now();
const at = () => Date.now() - t0;

async function post(base, action, deckId, body) {
  const r = await fetch(`${base}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-turboslide-author': 'agent:verifier-fallback',
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  try {
    return { status: r.status, json: JSON.parse(text) };
  } catch {
    return { status: r.status, json: { text: text.slice(0, 200) } };
  }
}
const health = () =>
  fetch(`${WORKER}/health`)
    .then((r) => r.json())
    .catch((e) => ({ error: String(e).slice(0, 80) }));

const wsLogScript = () => {
  const Orig = window.WebSocket;
  window.__ws = { opens: [], closes: [] };
  class Logged extends Orig {
    constructor(url, protocols) {
      super(url, protocols);
      const u = String(url).replace(/\?.*$/, '');
      window.__ws.opens.push({ at: Date.now(), url: u });
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
let deckId = null;
try {
  facts.health0 = await health();
  const src = await post(BASE_A, 'deck.info', 'gt-brand', {});
  deckId = `verify2-fallback-${Date.now().toString(36)}`;
  const copy = await post(BASE_A, 'deck.copy', 'gt-brand', {
    id: 'gt-brand',
    name: 'Verifier fallback',
    newId: deckId,
    baseRevision: src.json?.revision ?? 0,
  });
  const shareGet = await post(BASE_A, 'share.get', deckId, { id: deckId });
  const opened = await post(BASE_A, 'share.setGeneralAccess', deckId, {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: shareGet.json?.record?.revision ?? 0,
  });
  facts.deck = {
    deckId,
    copy: copy.status,
    link: opened.status,
    hasUrl: typeof opened.json?.url === 'string',
  };
  save();
  const linkPath = new URL(opened.json.url, BASE_A).pathname;
  const tabs = {};
  for (const [name, base] of [
    ['A', BASE_A],
    ['B', BASE_B],
  ]) {
    const ctx = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(wsLogScript);
    const page = await ctx.newPage();
    const openedAt = at();
    await page.goto(linkPath);
    await page.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
    tabs[name] = { page, base, openedAt, firstOther: null, wrote: null };
  }
  const until = Date.now() + WAIT_S * 1000;
  while (Date.now() < until) {
    const h = await health();
    const row = { at: at(), callbacks: h.callbacks ?? null, realtime: h.realtime ?? null };
    for (const [name, tab] of Object.entries(tabs)) {
      const s = await tab.page
        .evaluate(() => window.turboslide.studio.invoke('sync.status', {}))
        .catch((e) => ({ error: String(e).slice(0, 80) }));
      const log = await tab.page.evaluate(() => window.__ws).catch(() => null);
      row[name] = {
        tier: s.tier ?? null,
        transport: s.transport ?? null,
        connected: s.connected ?? null,
        revision: s.revision ?? null,
        opens: log?.opens.length ?? null,
        closes: (log?.closes ?? []).map((c) => `${c.code}`).join(','),
      };
      if (tab.firstOther === null && s.tier && s.tier !== 'do' && s.connected === true) {
        tab.firstOther = {
          at: at(),
          msAfterOpen: at() - tab.openedAt,
          tier: s.tier,
          transport: s.transport,
        };
        // one write on the tier it switched to, read back through the other origin
        const st = await tab.page.evaluate(() => window.turboslide.studio.describe().state);
        const slides = await tab.page.evaluate(() =>
          window.turboslide.studio.invoke('slide.list', {}),
        );
        const arr = Array.isArray(slides) ? slides : (slides.slides ?? slides.items ?? []);
        const slideId = typeof arr[0] === 'string' ? arr[0] : arr[0]?.id;
        const blockId = `fallback-${name.toLowerCase()}`;
        const wrote = await tab.page
          .evaluate(
            ([rev, slide, id]) =>
              window.turboslide.studio.invoke('block.insert', {
                baseRevision: rev,
                slideId: slide,
                slot: 'main',
                block: {
                  id,
                  type: 'text',
                  text: `Written on the fallback by ${id}`,
                  pos: { x: 160, y: 700, w: 1000, h: 120 },
                },
              }),
            [st.revision, slideId, blockId],
          )
          .then(() => 'ok')
          .catch((e) => String(e).slice(0, 160));
        await sleep(3000);
        const other = name === 'A' ? BASE_B : BASE_A;
        const read = await post(other, 'slide.get', deckId, { slideId });
        const found = JSON.stringify(read.json ?? {}).includes(blockId);
        tab.wrote = { answer: wrote, readOn: other, found, at: at() };
      }
    }
    facts.reads.push(row);
    console.log(JSON.stringify(row));
    save();
    if (Object.values(tabs).every((t) => t.wrote !== null)) break;
    await sleep(1000);
  }
  facts.tabs = Object.fromEntries(
    Object.entries(tabs).map(([n, t]) => [
      n,
      { base: t.base, firstOther: t.firstOther, wrote: t.wrote },
    ]),
  );
  for (const [name, tab] of Object.entries(tabs))
    facts[`ws${name}`] = await tab.page.evaluate(() => window.__ws).catch(() => null);
  await tabs.A.page.screenshot({ path: join(OUT, 'a-after.png') }).catch(() => {});
  facts.healthEnd = await health();
} catch (error) {
  facts.error = String(error?.stack ?? error).slice(0, 800);
  console.log(facts.error);
} finally {
  if (deckId) {
    const info = await post(BASE_A, 'deck.info', deckId, {});
    const trash = await post(BASE_A, 'deck.trash', deckId, {
      id: deckId,
      baseRevision: info.json?.revision ?? 0,
    });
    const info2 = await post(BASE_A, 'deck.info', deckId, {});
    const rm = await post(BASE_A, 'deck.remove', deckId, {
      id: deckId,
      confirm: true,
      baseRevision: info2.json?.revision ?? info.json?.revision ?? 0,
    });
    const gone = await post(BASE_A, 'deck.info', deckId, {});
    facts.teardown = { trash: trash.status, remove: rm.status, after: gone.status };
  }
  facts.endedAt = new Date().toISOString();
  facts.loadAtEnd = loadavg();
  save();
  console.log(JSON.stringify({ teardown: facts.teardown }));
  await browser.close();
}
