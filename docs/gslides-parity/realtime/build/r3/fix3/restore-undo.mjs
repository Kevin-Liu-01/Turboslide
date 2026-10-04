// R3 fix round 3: Cmd+Z after restoring an early version of a deck that grew a lot after it
// (VERIFICATION.md "Realtime round, pass 3" P3-3, `versions.undo-restore`: red in the whole walk
// on the 30 slide deck at revision 566, green in the share area alone on a 4 slide deck). A
// version is saved on a one slide deck, `--slides` slides of `--chars` characters of text each
// are added, the version is restored and Cmd+Z is pressed; the trace (the same hooks as
// snack-undo.mjs) and the room client's pending count say what the undo did.
//   node restore-undo.mjs --base http://localhost:4473 [--slides 26] [--chars 9000]
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide-realtime/package.json');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const BASE = arg('base', 'http://localhost:4473');
const SLIDES = Number(arg('slides', '26'));
const CHARS = Number(arg('chars', '9000'));
const sleep = (t) => new Promise((r) => setTimeout(r, t));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const hook = (body, pattern, replacement, name) => {
  const next = body.replace(pattern, replacement);
  if (next === body) console.log(`hook NOT installed: ${name}`);
  return next;
};
await ctx.route(/\/src\/editor\/controller\.tsx/, async (route) => {
  const response = await route.fetch();
  let body = await response.text();
  body = hook(
    body,
    /shell\?\.say\(message\);/,
    'window.__T?.("say", message); shell?.say(message);',
    'say',
  );
  body = hook(
    body,
    /(const inverse = stepMutations\(entry, entry\.inverse, "inverse"\);)/,
    '$1 window.__T?.("undo.step", { id: entry.id, label: entry.label, count: inverse.length, bytes: JSON.stringify(inverse).length, ops: [...new Set(inverse.map((m) => m.op))] });',
    'undo.step',
  );
  await route.fulfill({ response, body });
});
await ctx.route(/\/realtime\/client\/room-client\.ts/, async (route) => {
  const response = await route.fetch();
  let body = await response.text();
  body = hook(
    body,
    /(response = await transport\.postOps\(body\);)/,
    '$1 window.__T?.("ops.answer", { sent: body.entries.length, bytes: JSON.stringify(body).length, ok: response.ok, status: response.status, code: response.code, message: response.message, entries: (response.entries ?? []).length, rejected: response.rejected ?? null, revision: response.revision });',
    'ops.answer',
  );
  body = hook(
    body,
    /const resync = async \(at\) => \{/,
    'const resync = async (at) => { window.__T?.("resync", { at, seq, revision, pending: pending.length });',
    'resync',
  );
  await route.fulfill({ response, body });
});
await ctx.route(/\/chrome\/src\/Snackbar\.tsx/, async (route) => {
  const response = await route.fetch();
  let body = await response.text();
  body = hook(
    body,
    /const show = useCallback\(\(text, action\) => \{/,
    'const show = useCallback((text, action) => { window.__T?.("snackbar.show", { text, action: action?.label ?? null });',
    'snackbar.show',
  );
  await route.fulfill({ response, body });
});
const page = await ctx.newPage();
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('[Server]'))
    console.log('console', m.type(), m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
await page.addInitScript(() => {
  window.__trace = [];
  window.__T = (kind, data) => {
    window.__trace.push({ t: Math.round(performance.now()), kind, data });
    if (window.__trace.length > 6000) window.__trace.splice(0, 1000);
  };
});
const invoke = (a, i) =>
  page.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const order = async () => {
  const list = await invoke('slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const pollUntil = async (read, test, timeout = 15_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const settled = (timeout = 30_000) =>
  pollUntil(state, (s) => (s.sync?.pending ?? s.pending ?? 0) === 0, timeout);
const fingerprint = async () => {
  const ids = await order();
  const slides = [];
  for (const id of ids) slides.push(await invoke('slide.get', { slideId: id }));
  return JSON.stringify({ ids, slides });
};
const words = (n) => {
  const base = 'Renewal terms for every region we serve this year, with the pricing table. ';
  return base.repeat(Math.ceil(n / base.length)).slice(0, n);
};
let deckId = null;
try {
  await page.goto('/new');
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 120_000 });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 90_000 });
  const run = await page.evaluate(() =>
    document
      .querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run]')
      ?.getAttribute('data-run'),
  );
  await page.locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`).first().dblclick();
  await sleep(150);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Restore undo probe', { delay: 40 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 60_000 });
  deckId = (await invoke('deck.info')).id;
  console.log('deck', deckId, 'slides', SLIDES, 'chars', CHARS);
  await settled();
  const early = await invoke('version.save', { note: 'Early' });
  console.log('saved', JSON.stringify(early).slice(0, 200));
  /* one fat slide, then its copies */
  let st = await settled();
  const first = (await order())[0];
  await invoke('slide.duplicate', { slideIds: [first], baseRevision: st.revision });
  await pollUntil(order, (o) => o.length === 2);
  const fat = (await order())[1];
  for (let b = 0; b < 3; b += 1) {
    st = await settled();
    await invoke('block.insert', {
      baseRevision: st.revision,
      slideId: fat,
      slot: 'main',
      block: {
        id: `fat-${b}`,
        type: 'text',
        text: words(Math.floor(CHARS / 3)),
        pos: { x: 100 + b * 480, y: 400, w: 440, h: 400 },
      },
    });
  }
  for (let i = 2; i < SLIDES; i += 1) {
    st = await settled();
    const ids = await order();
    await invoke('slide.duplicate', { slideIds: [fat], baseRevision: st.revision });
    await pollUntil(order, (o) => o.length === ids.length + 1);
  }
  st = await settled();
  const versions = await invoke('version.list', {});
  const list = Array.isArray(versions) ? versions : (versions.versions ?? []);
  const target = list.find((v) => v.note === 'Early') ?? list[0];
  console.log(
    'versions',
    list.length,
    'target',
    target?.n,
    'slides now',
    (await order()).length,
    'revision',
    st.revision,
  );
  const current = await fingerprint();
  const deckBytes = current.length;
  const mark = await page.evaluate(() => window.__trace.length);
  const restored = await invoke('version.restore', { n: target.n, baseRevision: st.revision });
  console.log('restored', JSON.stringify(restored));
  const after = await pollUntil(fingerprint, (f) => f !== current, 20_000, 500);
  const revisionAfter = (await state()).revision;
  console.log(
    'restore changed the deck',
    after !== current,
    'slides',
    (await order()).length,
    'revision',
    revisionAfter,
    'deck bytes',
    deckBytes,
  );
  await settled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+z');
  const back = await pollUntil(
    async () => (await state()).revision !== revisionAfter && (await fingerprint()) === current,
    (x) => x,
    20_000,
    500,
  );
  const s = await state();
  console.log(
    'Cmd+Z brought the current version back',
    back,
    'slides',
    (await order()).length,
    'revision',
    s.revision,
    'pending',
    s.sync?.pending ?? s.pending,
    'save words',
    await page.evaluate(
      () => document.querySelector('[data-control="deck.saveState"]')?.textContent ?? null,
    ),
  );
  /* Cmd+Shift+Z takes the restore again and a second Cmd+Z brings the current version back */
  const revisionBack = s.revision;
  await page.keyboard.press('Meta+Shift+z');
  const redone = await pollUntil(
    async () => (await state()).revision !== revisionBack && (await fingerprint()) === after,
    (x) => x,
    20_000,
    500,
  );
  const revisionRedone = (await state()).revision;
  await settled();
  await page.keyboard.press('Meta+z');
  const backAgain = await pollUntil(
    async () => (await state()).revision !== revisionRedone && (await fingerprint()) === current,
    (x) => x,
    20_000,
    500,
  );
  console.log(
    'Cmd+Shift+Z took the restore again',
    redone,
    'then Cmd+Z brought the current version back',
    backAgain,
    'revision',
    (await state()).revision,
  );
  const trace = await page.evaluate((m) => window.__trace.slice(m), mark);
  for (const t of trace) console.log('  ', JSON.stringify(t).slice(0, 500));
} catch (error) {
  console.log('error', String(error?.stack ?? error).slice(0, 1500));
} finally {
  if (deckId) {
    /* trashed and removed by id; a base the checkpoint moved meanwhile is read again (the run of
       22:35Z left its deck behind on "baseRevision 42 is stale") */
    const removeById = async (action, extra) => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const info = await invoke('deck.info');
        try {
          return await invoke(action, { id: deckId, ...extra, baseRevision: info.revision });
        } catch (error) {
          if (!/stale/.test(String(error)) || attempt === 5) throw error;
          await sleep(1000);
        }
      }
      return null;
    };
    try {
      await removeById('deck.trash', {});
      await removeById('deck.remove', { confirm: true });
      console.log(
        'teardown',
        (await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' })).status,
      );
    } catch (error) {
      console.log('teardownError', deckId, String(error).slice(0, 200));
    }
  }
  await browser.close();
}
