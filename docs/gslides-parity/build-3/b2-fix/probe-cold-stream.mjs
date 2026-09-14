// Fixer probe: time to first byte of the stream on a freshly copied deck (cold room) and again (warm), from the creator's page.
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
const ttfb = (deckId) =>
  C.evaluate(async (id) => {
    const t0 = performance.now();
    const controller = new AbortController();
    const r = await fetch(`/api/decks/${id}/stream?since=0`, {
      headers: { accept: 'text/event-stream' },
      signal: controller.signal,
    });
    const headersAt = Math.round(performance.now() - t0);
    const reader = r.body.getReader();
    const { value } = await reader.read();
    const firstByteAt = Math.round(performance.now() - t0);
    controller.abort();
    return {
      status: r.status,
      headersAt,
      firstByteAt,
      first: new TextDecoder().decode(value).slice(0, 60).replace(/\n/g, ' '),
    };
  }, deckId);
console.log('gt-brand (warm room):', JSON.stringify(await ttfb('gt-brand')));
const info = await inv(C, 'deck.info');
const copy = `fix-cold-${Date.now().toString(36)}`;
await inv(C, 'deck.copy', {
  id: 'gt-brand',
  name: 'Cold probe',
  newId: copy,
  baseRevision: info.revision,
});
console.log('copy, first stream (cold room):', JSON.stringify(await ttfb(copy)));
console.log('copy, second stream (warm):', JSON.stringify(await ttfb(copy)));
// the same on a copy whose room was opened by a loader first
const copy2 = `fix-cold2-${Date.now().toString(36)}`;
await inv(C, 'deck.copy', {
  id: 'gt-brand',
  name: 'Cold probe 2',
  newId: copy2,
  baseRevision: (await inv(C, 'deck.info')).revision,
});
const t0 = Date.now();
await C.goto(`${base}/edit/${copy2}`, { waitUntil: 'domcontentloaded' });
await ready(C);
console.log(`copy2 opened by the creator: ready at +${Date.now() - t0}ms`);
let connectedAt = null;
const until = Date.now() + 30_000;
while (Date.now() < until) {
  const s = await inv(C, 'sync.status', {});
  if (s.connected) {
    connectedAt = Date.now() - t0;
    break;
  }
  await C.waitForTimeout(200);
}
console.log(`copy2 creator connected at +${connectedAt}ms`);
for (const id of [copy, copy2]) {
  const i = await inv(C, 'deck.info').catch(() => null);
  await inv(C, 'deck.trash', { id, baseRevision: i?.revision ?? 0 }).catch(() => undefined);
}
await browser.close();
