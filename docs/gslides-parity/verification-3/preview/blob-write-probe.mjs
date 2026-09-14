#!/usr/bin/env node
// A window API write on the preview's blob tier (SPEC-3 16.7): does the room client's promise
// resolve, does the write land server side, and what does describe().state.sync report while it
// waits. One browser page on a scratch copy; the bearer reads the server's revision beside it.
import { launchBrowser } from '../../../../packages/headless/src/launch.ts';
const BASE = process.argv[2] ?? 'https://turboslide-igavfcg2x-kl01s-projects.vercel.app';
const P = { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN ?? '' };
const bearer = {
  ...P,
  'content-type': 'application/json',
  authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN ?? ''}`,
};
const post = (path, body) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: bearer, body: JSON.stringify(body) });
const info = await (await post('/api/actions/deck.info?deck=gt-brand', {})).json();
const list = await (await post('/api/actions/slide.list?deck=gt-brand', {})).json();
const firstId = Array.isArray(list) ? list[0].id : list.slides[0].id;
const scratch = `verifier-blob-${Date.now().toString(36)}`;
await post('/api/actions/deck.copy?deck=gt-brand', {
  id: 'gt-brand',
  name: 'Verifier blob write',
  newId: scratch,
  slideIds: [firstId],
  baseRevision: info.revision,
});
const launched = await launchBrowser({ probeRenderer: false });
const context = await launched.browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: P,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
});
const t0 = Date.now();
await page.goto(`${BASE}/edit/${scratch}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  },
  null,
  { timeout: 120_000 },
);
await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 90_000 });
console.log('editor settled in', Date.now() - t0, 'ms');
const st = await page.evaluate(() => window.turboslide.studio.describe().state);
console.log(
  'sync at open',
  JSON.stringify(st.sync),
  'save words',
  await page
    .$eval('[data-control="deck.saveState"]', (e) => e.textContent.trim())
    .catch(() => null),
);
const t1 = Date.now();
const write = page.evaluate(
  ([slideId, rev]) =>
    window.turboslide.studio
      .invoke('slide.update', {
        slideId,
        baseRevision: rev,
        mutations: [{ op: 'slide.set', slideId, path: '/notes', value: 'blob write probe' }],
      })
      .then(
        (r) => ({ ok: true, r }),
        (e) => ({ ok: false, error: String(e).slice(0, 200) }),
      ),
  [firstId, st.revision],
);
let serverSaw = null;
const samples = [];
for (let i = 0; i < 40 && serverSaw === null; i += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const again = await (
    await post(`/api/actions/deck.info?deck=${scratch}`, {})
  )
    .json()
    .catch(() => null);
  const sync = await page
    .evaluate(() => {
      const s = window.turboslide.studio.describe().state;
      return {
        pending: s.pending,
        revision: s.revision,
        serverRevision: s.serverRevision,
        sync: s.sync,
      };
    })
    .catch(() => null);
  const words = await page
    .$eval('[data-control="deck.saveState"]', (e) => e.textContent.trim())
    .catch(() => null);
  if (i < 5 || i % 5 === 0)
    samples.push({ s: i + 1, serverRevision: again?.revision, page: sync, words });
  if (again && again.revision > st.revision) serverSaw = Date.now() - t1;
}
const settledWrite = await Promise.race([
  write,
  new Promise((r) =>
    setTimeout(() => r({ ok: null, note: 'still pending after the poll window' }), 5000),
  ),
]);
console.log(
  'window API write promise:',
  JSON.stringify(settledWrite).slice(0, 300),
  'after',
  Date.now() - t1,
  'ms',
);
console.log('server saw the write after', serverSaw, 'ms');
for (const s of samples) console.log(JSON.stringify(s));
console.log('page errors', errors.slice(0, 6));
const st2 = await page.evaluate(() => window.turboslide.studio.describe().state);
console.log(
  'sync at end',
  JSON.stringify(st2.sync),
  'tier notice in the title row:',
  await page
    .$eval('[data-control="title.row"]', (e) =>
      e.textContent.replace(/\s+/g, ' ').trim().slice(0, 200),
    )
    .catch(() => null),
);
await launched.close();
const i2 = await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json();
await post(`/api/actions/deck.trash?deck=${scratch}`, { id: scratch, baseRevision: i2.revision });
const i3 = await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json().catch(() => i2);
const rm = await post(`/api/actions/deck.remove?deck=${scratch}`, {
  id: scratch,
  confirm: true,
  baseRevision: i3.revision ?? i2.revision,
});
console.log('cleanup', rm.status);
