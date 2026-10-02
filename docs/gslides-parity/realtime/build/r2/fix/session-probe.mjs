// R2 fix round (build/r2.md R2-F2): one editor tab on a deck, idle, and an agent's
// deck_goto_slide over /mcp after the idle window. Records every server function POST the tab
// makes with its time (the studio session's poll among them), whether the room's socket is open
// (`sync.status.transport`), how long the MCP call takes and which slide the tab shows after it.
// Judges nothing. The deck is trashed and removed by its id.
//   node docs/gslides-parity/realtime/build/r2/fix/session-probe.mjs --base http://localhost:4472 \
//     --idle 90 --out <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = new URL('../../../../../../', import.meta.url);
const require = createRequire(new URL('package.json', root));
const { chromium } = require('playwright-core');
const sdk = new URL('packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/', root);
const { Client } = await import(new URL('client/index.js', sdk).href);
const { StreamableHTTPClientTransport } = await import(
  new URL('client/streamableHttp.js', sdk).href
);

const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const BASE = arg('base', 'http://localhost:4472');
const IDLE_S = Number(arg('idle', '90'));
const OUT = resolve(arg('out', 'session-probe'));
mkdirSync(OUT, { recursive: true });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const facts = { base: BASE, idleSeconds: IDLE_S, startedAt: new Date().toISOString(), calls: [] };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const t0 = Date.now();
page.on('request', (request) => {
  const url = new URL(request.url());
  if (url.origin !== new URL(BASE).origin) return;
  if (request.method() !== 'POST' && !url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules/')) return;
  facts.calls.push({
    ms: Date.now() - t0,
    method: request.method(),
    path: url.pathname.slice(0, 60),
  });
});
const invoke = (a, i) =>
  page.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
let deckId = null;
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
  await page.keyboard.type('Session probe', { delay: 40 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  deckId = (await invoke('deck.info')).id;
  facts.deckId = deckId;
  // a second slide for the agent to go to; the tab stays on the first
  const first = (await invoke('deck.info')).sections[0].slides[0].id;
  const base = (await page.evaluate(() => window.turboslide.studio.describe().state)).revision;
  await invoke('slide.new', { layout: 'title', after: first, baseRevision: base });
  await invoke('view.goto', { slideId: first });
  const info = await invoke('deck.info');
  const slides = info.sections.flatMap((section) => section.slides.map((slide) => slide.id));
  facts.slides = slides;
  const target = slides[slides.length - 1];
  facts.target = target;
  const until = Date.now() + 30_000;
  let status = null;
  while (Date.now() < until) {
    status = await invoke('sync.status').catch(() => null);
    if (status?.transport === 'ws' && status?.connected) break;
    await sleep(250);
  }
  facts.statusBefore = status;
  // the idle window: nothing touched
  const idleFrom = Date.now() - t0;
  await sleep(IDLE_S * 1000);
  const idleTo = Date.now() - t0;
  facts.idle = {
    fromMs: idleFrom,
    toMs: idleTo,
    serverFunctionPosts: facts.calls.filter(
      (c) =>
        c.ms >= idleFrom &&
        c.ms <= idleTo &&
        c.method === 'POST' &&
        c.path.startsWith('/_serverFn/'),
    ).length,
    otherRequests: facts.calls
      .filter((c) => c.ms >= idleFrom && c.ms <= idleTo && !c.path.startsWith('/_serverFn/'))
      .map((c) => `${c.method} ${c.path}`),
  };
  const activeBefore = (await page.evaluate(() => window.turboslide.studio.describe().state))
    .slideId;
  const client = new Client({ name: 'r2-session-probe', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(
    new URL(`/mcp?deck=${encodeURIComponent(deckId)}`, BASE),
  );
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((tool) => tool.name);
  facts.mcp = { tools: tools.includes('deck_goto_slide'), activeBefore };
  const callAt = Date.now();
  try {
    const result = await client.callTool({
      name: 'deck_goto_slide',
      arguments: { slideId: target },
    });
    facts.mcp.ms = Date.now() - callAt;
    facts.mcp.result = result.structuredContent ?? result.content;
    facts.mcp.isError = result.isError ?? false;
  } catch (error) {
    facts.mcp.ms = Date.now() - callAt;
    facts.mcp.error = String(error).slice(0, 300);
  }
  facts.mcp.activeAfter = (
    await page.evaluate(() => window.turboslide.studio.describe().state)
  ).slideId;
  await transport.terminateSession().catch(() => undefined);
  await client.close().catch(() => undefined);
} catch (error) {
  facts.error = String(error?.stack ?? error).slice(0, 1500);
} finally {
  if (deckId) {
    try {
      const info = await invoke('deck.info');
      await invoke('deck.trash', { id: deckId, baseRevision: info.revision });
      const t = await invoke('deck.info').catch(() => info);
      await invoke('deck.remove', { id: deckId, confirm: true, baseRevision: t.revision });
      facts.teardown = (await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' })).status;
    } catch (error) {
      facts.teardownError = String(error).slice(0, 200);
    }
  }
  facts.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  console.log(
    JSON.stringify({
      idle: facts.idle,
      mcp: facts.mcp,
      error: facts.error,
      teardown: facts.teardown,
    }),
  );
  await browser.close();
}
