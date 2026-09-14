#!/usr/bin/env node
// The S2 typing row of the two browser walk, read in more detail (SPEC-3 section 1 S2, 3.5): two
// contexts on one Title and body slide of a scratch copy, A types into the heading and B into the
// body within the same second, and the probe reads both documents' slide JSON, the two blocks'
// texts on both pages, the mutation kinds of the records the writes produced, and each page's
// pending and revision numbers, at 1 s, 3 s and 8 s after the last keystroke; then the same with
// both contexts typing in one block. One scratch copy, trashed and removed at the end.
//   node s2-typing-probe.mjs [--base http://localhost:4336] [--out <json>]
import { writeFileSync } from 'node:fs';

import { launchBrowser } from '../../../../packages/headless/src/launch.ts';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = value('base', 'http://localhost:4336').replace(/\/$/, '');
const OUT = value('out', null);
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const headers = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
const rows = [];
const step = (name, ok, evidence) => {
  rows.push({ name, ok, evidence });
  console.log(
    `${ok ? 'ok  ' : ok === null ? 'note' : 'FAIL'} ${name}: ${String(evidence).slice(0, 700).replace(/\s+/g, ' ')}`,
  );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invoke = (page, action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const settled = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const textOf = async (page, slideId, blockId) => {
  const got = await invoke(page, 'slide.get', { slideId });
  const block = Object.values(got.slide.slots ?? {})
    .flat()
    .find((b) => b.id === blockId);
  return block?.text ?? null;
};
// the walk's caret placement: a click 12 px inside the block opens the inline editor, the
// selection collapses to its end
const caretAtEnd = async (page, blockId) => {
  const el = await page.$(`.ts-stagewrap .pt-slide [data-block="${blockId}"]`);
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + 12, box.y + 12);
  await sleep(200);
  const editing = await page.$('.ts-stagewrap [contenteditable="true"]');
  if (!editing) return false;
  await page.evaluate(() => {
    const node = document.querySelector('.ts-stagewrap [contenteditable="true"]');
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  return true;
};

const launched = await launchBrowser({ probeRenderer: false });
const open = async () => {
  const context = await launched.browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: headers,
  });
  const page = await context.newPage();
  return page;
};
const A = await open();
await A.goto(`${BASE}/edit/gt-brand`, { waitUntil: 'domcontentloaded' });
await settled(A);
const info = await invoke(A, 'deck.info');
const list = await invoke(A, 'slide.list');
const first = (Array.isArray(list) ? list : list.slides)[0];
const scratch = `verifier-s2-${Date.now().toString(36)}`;
await invoke(A, 'deck.copy', {
  id: 'gt-brand',
  name: 'Verifier S2 probe',
  newId: scratch,
  slideIds: [first.id],
  baseRevision: info.revision,
});
await A.goto(`${BASE}/edit/${scratch}`, { waitUntil: 'domcontentloaded' });
await settled(A);
const st0 = await state(A);
await invoke(A, 'slide.new', { layout: 'split', after: st0.slideId, baseRevision: st0.revision });
await sleep(600);
const slides = await invoke(A, 'slide.list');
const rows2 = Array.isArray(slides) ? slides : slides.slides;
const target =
  rows2.find((r) => r.template === 'split' || r.layout === 'split') ??
  rows2.find((r) => r.id !== rows2[0].id);
const B = await open();
await B.goto(`${BASE}/edit/${scratch}`, { waitUntil: 'domcontentloaded' });
await settled(B);
await invoke(A, 'view.goto', { slideId: target.id });
await invoke(B, 'view.goto', { slideId: target.id });
await sleep(800);
const got = await invoke(A, 'slide.get', { slideId: target.id });
const texts = Object.values(got.slide.slots ?? {})
  .flat()
  .filter(
    (b) => typeof b.text === 'string' && ['heading', 'paragraph', 'text', 'box'].includes(b.type),
  );
const h = texts[0];
const p = texts[1] ?? texts[0];
step(
  'the slide',
  true,
  `${target.id}: blocks ${texts.map((b) => `${b.id} (${b.type}) "${b.text}"`).join(', ')}`,
);

async function readBoth(label) {
  const out = {};
  for (const [tag, page] of [
    ['A', A],
    ['B', B],
  ]) {
    const st = await state(page);
    out[tag] = {
      revision: st.revision,
      pending: st.sync?.pending,
      h: await textOf(page, target.id, h.id),
      p: await textOf(page, target.id, p.id),
    };
  }
  const versions = await invoke(A, 'version.list', {}).catch(() => null);
  const recent = Array.isArray(versions?.versions ?? versions)
    ? (versions.versions ?? versions)
        .slice(-4)
        .map(
          (v) =>
            `${v.revision ?? v.n}:${(v.mutations ?? []).map((m) => `${m.op}@${m.blockId ?? ''}`).join('+')}`,
        )
    : [];
  console.log(`   ${label}: ${JSON.stringify(out)}; recent records ${recent.join(' | ')}`);
  return out;
}

// round 1: two blocks, both within a second
{
  const okA = await caretAtEnd(A, h.id);
  const okB = await caretAtEnd(B, p.id);
  const t0 = Date.now();
  await Promise.all([
    okA ? A.keyboard.type(' alpha', { delay: 40 }) : Promise.resolve(),
    okB ? B.keyboard.type(' bravo', { delay: 40 }) : Promise.resolve(),
  ]);
  const typedMs = Date.now() - t0;
  await A.keyboard.press('Escape');
  await B.keyboard.press('Escape');
  await sleep(1000);
  const at1 = await readBoth('round 1 at 1 s');
  await sleep(2000);
  const at3 = await readBoth('round 1 at 3 s');
  await sleep(5000);
  const at8 = await readBoth('round 1 at 8 s');
  const ok =
    at8.A.h === at8.B.h &&
    at8.A.p === at8.B.p &&
    (at8.A.h ?? '').endsWith(' alpha') &&
    (at8.A.p ?? '').endsWith(' bravo');
  step(
    'S2 round 1: A types in the heading and B in the body within a second; both land on both pages',
    ok,
    `carets ${okA}/${okB}; typed in ${typedMs} ms; at 8 s ${JSON.stringify(at8)}`,
  );
}
// round 2: one block, both within a second
{
  const okA = await caretAtEnd(A, p.id);
  const okB = await caretAtEnd(B, p.id);
  const before = await textOf(A, target.id, p.id);
  const t0 = Date.now();
  await Promise.all([
    okA ? A.keyboard.type(' charlie', { delay: 40 }) : Promise.resolve(),
    okB ? B.keyboard.type(' delta', { delay: 40 }) : Promise.resolve(),
  ]);
  const typedMs = Date.now() - t0;
  await A.keyboard.press('Escape');
  await B.keyboard.press('Escape');
  await sleep(1000);
  await readBoth('round 2 at 1 s');
  await sleep(2000);
  const at3 = await readBoth('round 2 at 3 s');
  await sleep(5000);
  const at8 = await readBoth('round 2 at 8 s');
  const text = at8.A.p ?? '';
  const ok = at8.A.p === at8.B.p && text.includes('charlie') && text.includes('delta');
  step(
    'S2 round 2: A and B type in the same body within a second; every letter of both lands on both pages (3.5)',
    ok,
    `carets ${okA}/${okB}; typed in ${typedMs} ms; before "${before}"; at 3 s ${JSON.stringify(at3)}; at 8 s ${JSON.stringify(at8)}`,
  );
}
// cleanup
const info2 = await invoke(A, 'deck.info');
await invoke(A, 'deck.trash', { id: scratch, baseRevision: info2.revision }).catch(() => null);
const info3 = await invoke(A, 'deck.info').catch(() => info2);
await invoke(A, 'deck.remove', { id: scratch, confirm: true, baseRevision: info3.revision }).catch(
  (e) => step('cleanup', false, String(e).slice(0, 160)),
);
step('cleanup', true, `${scratch} trashed and removed`);
await launched.browser.close();
const fails = rows.filter((r) => r.ok === false).length;
console.log(`S2 typing probe: ${rows.filter((r) => r.ok === true).length} ok, ${fails} fail`);
if (OUT)
  writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), rows }, null, 2));
process.exit(fails > 0 ? 1 : 0);
