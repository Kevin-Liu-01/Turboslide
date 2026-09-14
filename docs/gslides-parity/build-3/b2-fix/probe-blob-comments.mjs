// Fixer probe for VERIFICATION-3 finding 6: a comment written on the blob tier by the window API and by /api/comments.
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://localhost:4331';
const browser = await chromium.launch();
const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const A = await c.newPage();
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
const st = (p) => p.evaluate(() => window.turboslide.studio.describe().state);
await A.goto(base + '/edit/gt-brand', { waitUntil: 'domcontentloaded' });
await ready(A);
const info = await inv(A, 'deck.info');
const copy = `fix-blob-${Date.now().toString(36)}`;
await inv(A, 'deck.copy', {
  id: 'gt-brand',
  name: 'Blob comments probe',
  newId: copy,
  baseRevision: info.revision,
});
await A.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
await ready(A);
let s = await st(A);
console.log('tier', s.sync.tier, 'transport', s.sync.transport, 'connected', s.sync.connected);
const viaWindow = await inv(A, 'comment.add', {
  anchor: { kind: 'slide', slideId: s.slideId },
  body: { text: 'first, through the window API', mentions: [] },
}).then(
  (v) => ({ ok: true, id: v.thread?.id }),
  (e) => ({ ok: false, e: String(e).slice(0, 200) }),
);
console.log('window comment.add:', JSON.stringify(viaWindow));
const viaRoute = await A.evaluate(
  async ([deckId, slideId]) => {
    const r = await fetch(`/api/comments/${deckId}/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        anchor: { kind: 'slide', slideId },
        body: { text: 'second, through /api/comments', mentions: [] },
      }),
    });
    return { status: r.status, body: (await r.text()).slice(0, 200) };
  },
  [copy, s.slideId],
);
console.log('/api/comments add:', viaRoute.status, viaRoute.body);
await A.waitForTimeout(1500);
const list = await inv(A, 'comment.list', { state: 'all' });
s = await st(A);
console.log(
  'comment.list threads',
  list.threads.length,
  'commentsRevision',
  list.commentsRevision,
  '| state.comments.threads',
  s.comments.threads.length,
  'markers',
  await A.$$eval('[data-control="comment.marker"]', (els) => els.length),
  'chip',
  await A.$eval(`[data-control="filmstrip.comments.${s.slideId}"]`, (el) => el.textContent).catch(
    () => 'none',
  ),
);
const B = await (await browser.newContext()).newPage();
await B.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
await ready(B);
await B.waitForTimeout(1200);
const sb = await st(B);
console.log(
  'a second context reads',
  sb.comments.threads.length,
  'threads with markers',
  await B.$$eval('[data-control="comment.marker"]', (els) => els.length),
);
const fin = await inv(A, 'deck.info');
await inv(A, 'deck.trash', { id: copy, baseRevision: fin.revision }).catch((e) =>
  console.log('trash failed', String(e).slice(0, 120)),
);
await browser.close();
