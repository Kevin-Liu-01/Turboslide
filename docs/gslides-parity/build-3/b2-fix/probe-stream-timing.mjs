// Fixer probe: how long a shadow admitted stranger's stream takes to bind on a restricted copy, request by request.
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
const info = await inv(C, 'deck.info');
const copy = `fix-timing-${Date.now().toString(36)}`;
await inv(C, 'deck.copy', {
  id: 'gt-brand',
  name: 'Timing probe',
  newId: copy,
  baseRevision: info.revision,
});
for (const who of ['stranger', 'owner']) {
  const P = who === 'owner' ? C : await (await browser.newContext()).newPage();
  const t0 = Date.now();
  P.on('response', (r) => {
    const u = r.url();
    if (u.includes(`/api/decks/${copy}/`))
      console.log(
        `  [${who}] +${Date.now() - t0}ms ${r.status()} ${new URL(u).pathname.split('/').slice(-1)[0]}${r.request().method() === 'POST' ? ' (POST)' : ''}`,
      );
  });
  P.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes(`/api/decks/${copy}/`))
      console.log(
        `  [${who}] +${Date.now() - t0}ms FAILED ${new URL(u).pathname.split('/').slice(-1)[0]} ${r.failure()?.errorText}`,
      );
  });
  await P.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
  await ready(P);
  console.log(`[${who}] ready at +${Date.now() - t0}ms`);
  const until = Date.now() + 30_000;
  let connectedAt = null;
  while (Date.now() < until) {
    const s = await inv(P, 'sync.status', {});
    if (s.connected) {
      connectedAt = Date.now() - t0;
      break;
    }
    await P.waitForTimeout(200);
  }
  console.log(`[${who}] connected at +${connectedAt}ms`);
  await P.waitForTimeout(1500);
}
const fin = await inv(C, 'deck.info');
await inv(C, 'deck.trash', { id: copy, baseRevision: fin.revision }).catch(() => undefined);
await browser.close();
