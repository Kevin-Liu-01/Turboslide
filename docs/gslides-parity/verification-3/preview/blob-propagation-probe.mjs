#!/usr/bin/env node
// The blob channel's propagation on the preview (SPEC-3 16.7: op to screen between two browsers,
// presence latency, write to saved), measured as the degraded tier allows: two browser contexts on
// a one slide scratch copy made through the bearer; A writes through the window API and the probe
// times how long B's document (`slide.get` on B) takes to show each write; a bearer write from
// outside both is timed on both pages; B's presence chip on A is polled for 30 s; the sync facts
// and the save words of both pages are read at the end. The copy is trashed and removed.
//   VERCEL_OIDC_TOKEN=<pulled> TURBOSLIDE_TOKEN=<bearer> node blob-propagation-probe.mjs <origin> [writes]
import { launchBrowser } from '../../../../packages/headless/src/launch.ts';

const BASE = (process.argv[2] ?? '').replace(/\/$/, '');
const WRITES = Number(process.argv[3] ?? 5);
const WINDOW_MS = 60_000;
if (!BASE) {
  console.error('pass the origin');
  process.exit(2);
}
const P = { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN ?? '' };
const bearer = {
  ...P,
  'content-type': 'application/json',
  authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN ?? ''}`,
};
const post = (path, body) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: bearer, body: JSON.stringify(body) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const info = await (await post('/api/actions/deck.info?deck=gt-brand', {})).json();
const list = await (await post('/api/actions/slide.list?deck=gt-brand', {})).json();
const firstId = Array.isArray(list) ? list[0].id : list.slides[0].id;
const scratch = `verifier-prop-${Date.now().toString(36)}`;
const copy = await post('/api/actions/deck.copy?deck=gt-brand', {
  id: 'gt-brand',
  name: 'Verifier propagation probe',
  newId: scratch,
  slideIds: [firstId],
  baseRevision: info.revision,
});
say('deck.copy', copy.status, scratch);
const launched = await launchBrowser({ probeRenderer: false });
const open = async (tag) => {
  const context = await launched.browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: P,
  });
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}/edit/${scratch}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 120_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 90_000 });
  const st = await page.evaluate(() => window.turboslide.studio.describe().state);
  say(
    `${tag} settled in ${Date.now() - t0} ms; sync ${JSON.stringify(st.sync)}; label ${st.account?.label ?? '-'}; role ${st.access?.role}`,
  );
  return page;
};
const A = await open('A');
const B = await open('B');
// presence: B's chip on A
const tp = Date.now();
let chipMs = null;
while (Date.now() - tp < 30_000 && chipMs === null) {
  const others = await A.evaluate(() => {
    const p = window.turboslide.studio.describe().state.presence;
    return Array.isArray(p?.others)
      ? p.others.length
      : typeof p?.others === 'number'
        ? p.others
        : 0;
  });
  if (others > 0) chipMs = Date.now() - tp;
  else await sleep(250);
}
say(`presence: B in A's roster ${chipMs === null ? 'never within 30 s' : `after ${chipMs} ms`}`);
const revisionOf = (page) =>
  page.evaluate(() => window.turboslide.studio.describe().state.revision);
const notesOf = (page, slideId) =>
  page.evaluate(
    ([id]) =>
      window.turboslide.studio.invoke('slide.get', { slideId: id }).then(
        (r) => r?.slide?.notes ?? null,
        () => null,
      ),
    [slideId],
  );
// op to screen: A writes, B shows
const opMs = [];
for (let i = 0; i < WRITES; i += 1) {
  const rev = await revisionOf(A);
  const value = `prop ${i + 1} ${Date.now().toString(36)}`;
  const t0 = Date.now();
  const ack = A.evaluate(
    ([slideId, r, v]) =>
      window.turboslide.studio
        .invoke('slide.update', {
          slideId,
          baseRevision: r,
          mutations: [{ op: 'slide.set', slideId, path: '/notes', value: v }],
        })
        .then(
          () => Date.now(),
          (e) => `error ${String(e).slice(0, 120)}`,
        ),
    [firstId, rev, value],
  );
  let seen = null;
  while (Date.now() - t0 < WINDOW_MS && seen === null) {
    if ((await notesOf(B, firstId)) === value) seen = Date.now() - t0;
    else await sleep(100);
  }
  const acked = await ack;
  opMs.push(seen);
  say(
    `A write ${i + 1}: acknowledged on A ${typeof acked === 'number' ? `after ${acked - t0} ms` : acked}; seen on B ${seen === null ? `never within ${WINDOW_MS / 1000} s` : `after ${seen} ms`}`,
  );
  await sleep(500);
}
const landed = opMs.filter((v) => v !== null).sort((a, b) => a - b);
const pct = (q) => landed[Math.min(landed.length - 1, Math.floor(landed.length * q))] ?? null;
say(
  `op to screen A to B: ${landed.length} of ${WRITES} landed; p50 ${pct(0.5)} ms; p95 ${pct(0.95)} ms; max ${landed.at(-1) ?? null} ms`,
);
// a bearer write from outside both pages
{
  const before = await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json();
  const value = `bearer ${Date.now().toString(36)}`;
  const t0 = Date.now();
  const w = await post(`/api/actions/slide.update?deck=${scratch}`, {
    slideId: firstId,
    baseRevision: before.revision,
    mutations: [{ op: 'slide.set', slideId: firstId, path: '/notes', value }],
  });
  const wroteMs = Date.now() - t0;
  let seenA = null;
  let seenB = null;
  while (Date.now() - t0 < WINDOW_MS && (seenA === null || seenB === null)) {
    if (seenA === null && (await notesOf(A, firstId)) === value) seenA = Date.now() - t0;
    if (seenB === null && (await notesOf(B, firstId)) === value) seenB = Date.now() - t0;
    await sleep(100);
  }
  say(
    `bearer write: ${w.status} in ${wroteMs} ms; seen on A ${seenA === null ? 'never within 60 s' : `after ${seenA} ms`}; seen on B ${seenB === null ? 'never within 60 s' : `after ${seenB} ms`}`,
  );
}
for (const [tag, page] of [
  ['A', A],
  ['B', B],
]) {
  const st = await page.evaluate(() => window.turboslide.studio.describe().state);
  const words = await page
    .$eval('[data-control="deck.saveState"]', (e) => e.textContent.trim())
    .catch(() => null);
  say(
    `${tag} at the end: revision ${st.revision}; sync ${JSON.stringify(st.sync)}; save words "${words}"; others ${Array.isArray(st.presence?.others) ? st.presence.others.length : st.presence?.others}`,
  );
}
await launched.browser.close();
const info4 = await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json();
const trash = await post(`/api/actions/deck.trash?deck=${scratch}`, {
  id: scratch,
  baseRevision: info4.revision,
});
const info5 = await (
  await post(`/api/actions/deck.info?deck=${scratch}`, {})
)
  .json()
  .catch(() => info4);
const rm = await post(`/api/actions/deck.remove?deck=${scratch}`, {
  id: scratch,
  confirm: true,
  baseRevision: info5?.revision ?? info4.revision,
});
say(`cleanup: trash ${trash.status} remove ${rm.status}`);
