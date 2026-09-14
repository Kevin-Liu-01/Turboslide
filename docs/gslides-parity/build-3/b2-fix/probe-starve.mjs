// Fixer probe: the stranger's stream on a cold copy with the thumbnail requests aborted (the connection starvation theory).
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://localhost:4331';
const browser = await chromium.launch();
const ready = async (p) => {
  await p.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 90_000 },
  );
  await p.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const inv = (p, id, input) =>
  p.evaluate(([i, v]) => window.turboslide.studio.invoke(i, v), [id, input]);
const C = await (await browser.newContext()).newPage();
await C.goto(`${base}/edit/gt-brand`, { waitUntil: 'domcontentloaded' });
await ready(C);
for (const variant of ['thumbnails aborted', 'thumbnails allowed']) {
  const info = await inv(C, 'deck.info');
  const copy = `fix-starve-${Date.now().toString(36)}`;
  await inv(C, 'deck.copy', {
    id: 'gt-brand',
    name: 'Starve probe',
    newId: copy,
    baseRevision: info.revision,
  });
  const P = await (await browser.newContext()).newPage();
  let thumbs = 0;
  if (variant === 'thumbnails aborted')
    await P.route('**/api/render/**', (route) => {
      thumbs += 1;
      void route.abort();
    });
  else
    P.on('request', (r) => {
      if (r.url().includes('/api/render/')) thumbs += 1;
    });
  const t0 = Date.now();
  P.on('response', (r) => {
    if (r.url().includes(`/api/decks/${copy}/stream`))
      console.log(`  [${variant}] stream 200 at +${Date.now() - t0}ms`);
  });
  await P.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
  await ready(P);
  const until = Date.now() + 40_000;
  let connectedAt = null;
  while (Date.now() < until) {
    const s = await inv(P, 'sync.status', {});
    if (s.connected) {
      connectedAt = Date.now() - t0;
      break;
    }
    await P.waitForTimeout(150);
  }
  console.log(`[${variant}] connected at +${connectedAt}ms; thumbnail requests seen ${thumbs}`);
  await P.context().close();
  await inv(C, 'deck.trash', {
    id: copy,
    baseRevision: (await inv(C, 'deck.info')).revision,
  }).catch(() => undefined);
}
await browser.close();
