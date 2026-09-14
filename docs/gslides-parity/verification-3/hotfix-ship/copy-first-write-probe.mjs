#!/usr/bin/env node
// A freshly copied deck's first write and the guide's context menu (VERIFICATION-3 finding 33;
// hotfix C section 4 item 5; the hotfix ship step's check step 20 rows `contextMenu:objects guide`
// and `effects:objects view.guides.delete`). Copies gt-brand through the window API of a /new
// page, opens the copy's editor, reads the room status at open, double clicks the title heading
// and types once, and times three things against the first keystroke: when the browser issued the
// first `/ops` POST (the room client's flush; a hold by the caught up gate would show here), when
// its response arrived (the server and the connection queue under the thumbnail renders), and when
// the page's revision moved. Then it adds a vertical guide at 800 through `deck.guides`, right
// clicks it and waits for the canvas menu's Delete guide row. Trashes and removes the copy.
//   node copy-first-write-probe.mjs --base http://localhost:4321
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4321').replace(/\/$/, '');
let failures = 0;
const step = (ok, name, evidence) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? `: ${evidence}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invoke = (page, action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const settled = async (page, timeout = 30_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(120);
  }
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const copyId = `ship-copy-${Date.now().toString(36)}`;
let created = false;
try {
  await page.goto(`${BASE}/edit/gt-brand`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const source = await invoke(page, 'deck.info');
  const t0 = Date.now();
  const copied = await invoke(page, 'deck.copy', {
    id: 'gt-brand',
    name: 'Ship copy',
    newId: copyId,
    baseRevision: source.revision,
  });
  created = true;
  step(true, 'deck.copy of gt-brand', `${copied?.id ?? copyId} in ${Date.now() - t0} ms`);

  const B = await context.newPage();
  const requests = [];
  B.on('request', (r) => {
    if (/\/api\/decks\/[^/]+\/ops/.test(r.url()) && r.method() === 'POST')
      requests.push({ at: Date.now(), url: r.url(), response: null });
  });
  B.on('response', (r) => {
    if (/\/api\/decks\/[^/]+\/ops/.test(r.url()) && r.request().method() === 'POST') {
      const row = requests.find((x) => x.url === r.url() && x.response === null);
      if (row) row.response = { at: Date.now(), status: r.status() };
    }
  });
  const tOpen = Date.now();
  await B.goto(`${BASE}/edit/${copyId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(B);
  const open = await state(B);
  step(
    true,
    'the copy opened',
    `${Date.now() - tOpen} ms; revision ${open.revision}, sync ${JSON.stringify(open.sync)}`,
  );
  // the room connected
  await B.waitForFunction(
    () => window.turboslide.studio.describe().state.sync?.connected === true,
    null,
    { timeout: 30_000 },
  ).catch(() => null);
  const connected = await state(B);
  step(
    connected.sync?.connected === true,
    'the room connected',
    `${Date.now() - tOpen} ms after open; sync ${JSON.stringify(connected.sync)}`,
  );

  // the content rule slide's first paragraph, the run realtime.spec.ts types in
  await invoke(B, 'view.goto', { slideId: 'content-rule' });
  const el = B.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="p1/text"]');
  await el.waitFor({ timeout: 30_000 });
  const box = await el.boundingBox();
  await B.mouse.click(box.x + 8, box.y + 8);
  await el.waitFor({ timeout: 5000 });
  await B.keyboard.press('End');
  const tKey = Date.now();
  await B.keyboard.type(' Q', { delay: 20 });
  await sleep(600);
  await B.keyboard.press('Escape');
  const until = Date.now() + 45_000;
  while (Date.now() < until && (requests.length === 0 || requests[0].response === null))
    await sleep(50);
  const first = requests[0];
  step(
    first !== undefined,
    'the first /ops POST was issued',
    first ? `${first.at - tKey} ms after the first keystroke` : 'no POST in 45 s',
  );
  step(
    first?.response !== null && first?.response !== undefined,
    'the first /ops POST answered',
    first?.response
      ? `${first.response.at - tKey} ms after the keystroke, status ${first.response.status}`
      : 'no answer in 45 s',
  );
  const after = await settled(B, 45_000);
  const tRev = Date.now();
  const revUntil = Date.now() + 45_000;
  let rev = after.revision;
  while (Date.now() < revUntil && rev <= open.revision) {
    await sleep(100);
    rev = (await state(B)).revision;
  }
  step(
    rev > open.revision,
    'the revision moved',
    `${rev} from ${open.revision}, ${tRev - tKey} ms to settle, ${Date.now() - tKey} ms to the revision`,
  );
  const paragraph = await invoke(B, 'slide.get', { slideId: 'content-rule' })
    .then((g) => {
      const block = Object.values(g.slide.slots ?? {})
        .flat()
        .find((b) => b.id === 'p1');
      const text = block?.text;
      return typeof text === 'string' ? text : JSON.stringify(text ?? '');
    })
    .catch(() => '');
  step(
    / Q"?$/.test(String(paragraph)),
    'the keystroke reached the document',
    String(paragraph).slice(-80),
  );

  // the guide's context menu (check step 20's two failing rows)
  const info0 = await invoke(B, 'deck.info');
  await invoke(B, 'deck.guides', { add: [{ axis: 'x', at: 800 }], baseRevision: info0.revision });
  await settled(B);
  const guide = B.locator('.ts-overlay [data-control="guide.x.800"]');
  await guide.waitFor({ timeout: 10_000 }).catch(() => null);
  const gbox = await guide.boundingBox().catch(() => null);
  step(gbox !== null, 'the vertical guide at 800 is drawn', gbox ? JSON.stringify(gbox) : 'absent');
  if (gbox) {
    await B.mouse.click(gbox.x + gbox.width / 2, gbox.y + Math.min(200, gbox.height / 2), {
      button: 'right',
    });
    const menu = await B.waitForSelector('[role="menu"]', { timeout: 4000 }).catch(() => null);
    step(menu !== null, "the guide's context menu opened within 4 s");
    const del = await B.waitForSelector('#ts-menu-canvas [data-menu-item="view.guides.delete"]', {
      timeout: 4000,
    }).catch(() => null);
    step(del !== null, 'the menu carries Delete guide');
    if (del) {
      const before = (await state(B)).revision;
      await del.click();
      await settled(B);
      const info = await invoke(B, 'deck.info');
      step(
        !(info.guides?.x ?? []).includes(800),
        'Delete guide removed it',
        `revision ${before} -> ${info.revision}; guides ${JSON.stringify(info.guides ?? null)}`,
      );
    }
    await B.keyboard.press('Escape');
  }
  await B.close();
} catch (error) {
  step(
    false,
    'the probe ran to completion',
    error instanceof Error ? error.message : String(error),
  );
} finally {
  if (created) {
    try {
      const C = await context.newPage();
      await C.goto(`${BASE}/edit/${copyId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(C);
      const info = await invoke(C, 'deck.info');
      await invoke(C, 'deck.trash', { id: copyId, baseRevision: info.revision });
      const t = await invoke(C, 'deck.info').catch(() => null);
      await invoke(C, 'deck.remove', {
        id: copyId,
        confirm: true,
        baseRevision: t?.revision ?? info.revision + 1,
      });
      console.log(`cleanup: ${copyId} trashed and removed`);
    } catch (error) {
      console.log(`cleanup FAIL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await browser.close();
}
console.log(
  `\ncopy-first-write-probe: ${failures === 0 ? 'all steps ok' : `${failures} step(s) failed`} against ${BASE}`,
);
process.exit(failures === 0 ? 0 : 1);
