// Fixer probe: a stranger's stream and first presence POST on a fresh copy while the render worker is busy with two other fresh copies.
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
const copies = [];
for (let i = 0; i < 3; i++) {
  const id = `fix-sat${i}-${Date.now().toString(36)}`;
  await inv(C, 'deck.copy', {
    id: 'gt-brand',
    name: `Saturate ${i}`,
    newId: id,
    baseRevision: (await inv(C, 'deck.info')).revision,
  });
  copies.push(id);
}
// two pages start their render jobs
const busy = [];
for (const id of copies.slice(0, 2)) {
  const p = await (await browser.newContext()).newPage();
  void p.goto(`${base}/edit/${id}`, { waitUntil: 'domcontentloaded' });
  busy.push(p);
}
await new Promise((r) => setTimeout(r, 1500));
// the stranger on the third
const P = await (await browser.newContext()).newPage();
const t0 = Date.now();
let thumbs = 0;
let firstThumbAt = null;
P.on('request', (r) => {
  if (r.url().includes('/api/render/')) {
    thumbs += 1;
    firstThumbAt ??= Date.now() - t0;
  }
});
P.on('response', (r) => {
  if (r.url().includes(`/api/decks/${copies[2]}/`))
    console.log(
      `  +${Date.now() - t0}ms ${r.status()} ${new URL(r.url()).pathname.split('/').pop()}${r.request().method() === 'POST' ? ' (POST)' : ''}`,
    );
});
await P.goto(`${base}/edit/${copies[2]}`, { waitUntil: 'domcontentloaded' });
await ready(P);
console.log(`ready at +${Date.now() - t0}ms; first thumbnail request at +${firstThumbAt}ms`);
const until = Date.now() + 45_000;
let connectedAt = null;
while (Date.now() < until) {
  const s = await inv(P, 'sync.status', {});
  if (s.connected) {
    connectedAt = Date.now() - t0;
    break;
  }
  await P.waitForTimeout(150);
}
console.log(`connected at +${connectedAt}ms; thumbnail requests ${thumbs}`);
await P.waitForTimeout(3000);
for (const p of busy) await p.context().close();
await P.context().close();
for (const id of copies)
  await inv(C, 'deck.trash', { id, baseRevision: (await inv(C, 'deck.info')).revision }).catch(
    () => undefined,
  );
await browser.close();
