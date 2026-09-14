// Fixer probe: the controller swap after Mode toggles (VERIFICATION-3 finding 2), on /new then /edit.
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
const modeOf = (p) =>
  p.$eval('.pt-viewer', (v) => v.getAttribute('data-edit-mode')).catch(() => 'none');
const toggle = async (p, mode) => {
  await p.click('[data-control="menubar.view"]');
  await p.waitForSelector('[role="menu"][data-level="0"]');
  await p.hover('[data-menu-item="view.mode"]');
  await p.waitForTimeout(400);
  await p.click(`[role="menu"][data-level="1"] [data-menu-item="view.mode.${mode}"]`);
  await p.waitForTimeout(700);
  const s = await st(p).catch((e) => ({ error: String(e).slice(0, 100) }));
  const checked = await p
    .$eval(`[data-menu-item="view.mode.${mode}"]`, (el) => el.getAttribute('aria-checked'))
    .catch(() => 'closed');
  console.log(
    `  Mode > ${mode}: url ${new URL(p.url()).pathname}${new URL(p.url()).search} edit-mode=${await modeOf(p)} state.deckId=${s.deckId} rev=${s.revision} owner=${await p.evaluate(() => window.turboslide.studio.describe().owner)}`,
  );
  await p.keyboard.press('Escape');
};
console.log('--- /new then save ---');
await A.goto(base + '/new', { waitUntil: 'domcontentloaded' });
await ready(A);
const s0 = await st(A);
await inv(A, 'slide.update', {
  slideId: s0.slideId,
  baseRevision: s0.revision,
  mutations: [{ op: 'slide.set', slideId: s0.slideId, path: '/heading', value: 'Probe swap' }],
});
await A.waitForURL((u) => u.pathname.startsWith('/edit/'), { timeout: 30_000 });
await A.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
const urlDeck = new URL(A.url()).pathname.split('/')[2];
let s = await st(A);
console.log('after save: url deck', urlDeck, 'state.deckId', s.deckId, 'rev', s.revision);
for (const mode of ['commenting', 'viewing', 'editing']) await toggle(A, mode);
console.log('--- /edit directly ---');
await A.goto(`${base}/edit/${urlDeck}`, { waitUntil: 'domcontentloaded' });
await ready(A);
s = await st(A);
console.log('open: state.deckId', s.deckId, 'rev', s.revision);
for (const mode of ['commenting', 'viewing', 'editing']) await toggle(A, mode);
const info = await inv(A, 'deck.info').catch((e) => ({ error: String(e).slice(0, 120) }));
console.log('deck.info', JSON.stringify(info).slice(0, 120));
await inv(A, 'deck.trash', { id: urlDeck, baseRevision: info.revision }).catch((e) =>
  console.log('trash failed', String(e).slice(0, 160)),
);
await browser.close();
