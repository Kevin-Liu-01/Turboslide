#!/usr/bin/env node
// The fresh presentation write probe (gslides-parity SPEC-3 6.1; VERIFICATION-3 findings 45 and
// 33). Reproduces and guards the defect the orchestrator measured on 2026-09-14: on /new the first
// thing a sales user meets, a double click on the visible title placeholder must open the inline
// editor and keep it open (before the fix the second click of the double blurred the session the
// first click had just opened, because the empty placeholder collapsed to the caret once its
// prompt left), the first write must create the deck through createStoredDeck and move the address
// to /edit/<id> with the room attached, and every following write must land. It then reopens the
// deck in a second page and types once immediately, the finding 33 case (the first burst of a page
// that has just opened a deck one revision ahead must not be lost), and trashes the deck through
// File > Move to trash and Delete forever on /decks/trash so a run leaves the store as it found it.
//
// Reused by the verifier and the ship step: it takes a base URL and drives the product's own UI, so
// it runs against a dev server (memory tier) and against production (blob tier).
//   node scripts/probes/new-write-probe.mjs [--base http://localhost:4351]
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4351').replace(
  /\/$/,
  '',
);
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};

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
/** Nothing pending on this tab: the write reached the room and settled. */
const settled = async (page, timeout = 30_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    const pending = s.sync?.pending ?? s.pending ?? 0;
    if (pending === 0) return s;
    if (Date.now() > until) return s;
    await sleep(120);
  }
};
/** The revision the tab reports (SPEC-3 3.10). */
const revisionOf = async (page) => (await state(page)).revision;
/** Opens the inline session on a run through a double click, the orchestrator's own gesture. */
const dblclickRun = async (page, run) => {
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${run}"]`);
  await el.waitFor({ timeout: 30_000 });
  const box = await el.boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await el.getAttribute('contenteditable');
  return el;
};
/** Waits for the revision to reach at least `want` (the blob tier settles a write slowly). */
const waitRevision = async (page, want, timeout = 30_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const r = await revisionOf(page);
    if (r >= want) return r;
    if (Date.now() > until) return r;
    await sleep(150);
  }
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders,
});
const A = await context.newPage();
const failedRequests = [];
A.on('response', (r) => {
  if (r.status() >= 400 && /\/api\/render\/title\?/.test(r.url())) failedRequests.push(r.url());
});

let deckId = '';
try {
  // 1. /new: the draft, then the double click that opens the title
  await A.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(A);
  const before = await invoke(A, 'deck.info');
  deckId = before.id;
  step(/^untitled-\d{8}-[a-z0-9]{4}$/.test(deckId), 'the draft has an untitled id', deckId);
  step(
    (await state(A)).sync?.connected === false,
    'a draft is not connected before its first write',
  );

  const heading = await dblclickRun(A, 'heading/text');
  const editing = await heading.getAttribute('contenteditable');
  step(
    editing === 'true',
    'the double click opened and kept the inline session',
    `contenteditable=${editing}`,
  );

  // 2. six edits, each saved; the first creates the deck and moves the address
  for (let i = 0; i < 6; i += 1) {
    await A.keyboard.type(i === 0 ? 'Q4 review' : ` ${String.fromCharCode(97 + i)}`, { delay: 25 });
    await sleep(500); // past the 400 ms burst timer, so each chunk is one write
    const want = i + 1;
    const got = await waitRevision(A, want);
    await settled(A);
    step(got >= want, `edit ${want} saved`, `revision ${got}`);
    if (i === 0) {
      const url = A.url();
      step(
        /\/edit\//.test(url),
        'the first write moved the address to /edit/<id>',
        url.replace(BASE, ''),
      );
      const s = await state(A);
      step(
        (s.sync?.connected === true && s.sync?.transport === 'sse') || s.sync?.transport === 'poll',
        'the room attached after the first write',
        JSON.stringify(s.sync),
      );
    }
  }
  await A.keyboard.press('Escape');
  // the anonymous name prompt is a floating card that took no focus (finding 8); close it if shown
  const prompt = A.locator('[data-control="dialog.namePrompt"]');
  if (await prompt.isVisible().catch(() => false)) {
    await A.locator('[data-control="dialog.namePrompt.close"]')
      .click()
      .catch(() => undefined);
  }
  const afterSix = await settled(A);
  step(afterSix.revision >= 6, 'six edits landed', `revision ${afterSix.revision}`);
  step(
    failedRequests.length === 0,
    'no 404 on the draft thumbnail route',
    `${failedRequests.length} seen`,
  );

  // 3. reopen in a second page and type once immediately (finding 33: the first write of a page
  //    that has just opened a deck one revision ahead must land, not be refused as stale or lost)
  const B = await context.newPage();
  await B.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(B);
  const openRevision = await revisionOf(B);
  await dblclickRun(B, 'heading/text');
  await B.keyboard.press('End');
  await B.keyboard.type(' Z', { delay: 25 });
  await sleep(500);
  await B.keyboard.press('Escape');
  await settled(B, 45_000);
  // the write is checkpointed a couple of seconds after it is acknowledged, so wait for the
  // reported revision to move rather than only for pending to reach zero
  const bRevision = await waitRevision(B, openRevision + 1, 45_000);
  const rejects = (await state(B)).rejects?.length ?? 0;
  step(
    bRevision > openRevision && rejects === 0,
    'the first write after opening the deck saved and was not lost (finding 33)',
    `opened at ${openRevision}, now ${bRevision}, rejects ${rejects}`,
  );
  const text = await invoke(B, 'slide.get', { slideId: 'title' }).then(
    (g) => g.slide.heading ?? '',
    () => '',
  );
  step(/Z$/.test(String(text)), 'the immediate keystroke reached the document', String(text));
  await B.close();

  // 4. trash through the product: File > Move to trash, then Delete forever on /decks/trash
  await A.locator('[data-control="menubar.file"]').click();
  await A.locator('[data-control="menu.file.moveToTrash"]').click();
  await A.waitForURL(/\/decks$/, { timeout: 20_000 });
  step(
    true,
    'File > Move to trash moved the deck and returned to /decks',
    A.url().replace(BASE, ''),
  );

  await A.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  const card = A.locator(`[data-control="trash.card.${deckId}"]`);
  await card.waitFor({ timeout: 30_000 });
  await A.locator(`[data-control="trash.delete.${deckId}"]`).click();
  await A.locator('[data-control="trash.confirm.ok"]').click();
  await card.waitFor({ state: 'detached', timeout: 30_000 });
  step(true, 'Delete forever removed the deck from the trash', deckId);
  deckId = '';
} catch (error) {
  step(
    false,
    'the probe ran to completion',
    error instanceof Error ? error.message : String(error),
  );
} finally {
  // a best effort cleanup if the trash path did not reach the delete
  if (deckId) {
    try {
      const info = await invoke(A, 'deck.info').catch(() => null);
      if (info) {
        await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
          () => undefined,
        );
        const t = await invoke(A, 'deck.info').catch(() => null);
        await invoke(A, 'deck.remove', { id: deckId, baseRevision: t?.revision ?? 0 }).catch(
          () => undefined,
        );
      }
    } catch {
      // nothing more to do
    }
  }
  await browser.close();
}

console.log(
  `\nnew-write-probe: ${failures === 0 ? 'all steps ok' : `${failures} step(s) failed`} against ${BASE}`,
);
process.exit(failures === 0 ? 0 : 1);
