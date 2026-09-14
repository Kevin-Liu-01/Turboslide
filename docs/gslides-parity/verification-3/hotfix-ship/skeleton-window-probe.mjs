#!/usr/bin/env node
// The skeleton window after the first write on /new (VERIFICATION-3 finding 51): opens /new,
// installs a MutationObserver that records every change of the count of `[data-skeleton="editor"]`
// elements and of `window.turboslide?.studio` presence (sampled on every mutation and every 16 ms
// for 3 s), types into the title through a double click, then reads the log: the longest window
// with a skeleton beside the live editor and the longest window without `window.turboslide`.
//   node skeleton-window-probe.mjs --base http://localhost:4321
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4321').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let deckId = '';
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  deckId = await page.evaluate(() => window.turboslide.studio.describe().state.deckId);
  await page.evaluate(() => {
    const log = [];
    const sample = (why) => {
      const skeletons = document.querySelectorAll('[data-skeleton="editor"]').length;
      const editors = document.querySelectorAll('.pt-viewer.is-editor:not(.ts-skeleton)').length;
      const api = Boolean(window.turboslide?.studio);
      const last = log[log.length - 1];
      if (!last || last.skeletons !== skeletons || last.editors !== editors || last.api !== api) {
        log.push({ t: performance.now(), skeletons, editors, api, why });
      }
    };
    sample('start');
    new MutationObserver(() => sample('mutation')).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    const timer = setInterval(() => sample('tick'), 16);
    window.__skeletonLog = log;
    window.__skeletonStop = () => clearInterval(timer);
  });
  const el = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]');
  await el.waitFor({ timeout: 30_000 });
  const box = await el.boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const typedAt = await page.evaluate(() => performance.now());
  await page.keyboard.type('Skeleton probe', { delay: 25 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // the gesture fixer C's measurement named: a view change after the first write makes the
  // editor navigate on the /new route (onSearch: the search and the hash follow), which is the
  // navigation the router offers the pending presentation for
  await page.locator('[data-control="view.gridView"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-control="view.filmstripView"]').click();
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => {
    window.__skeletonStop();
    return window.__skeletonLog;
  });
  // windows: a skeleton beside the live editor, and the api absent
  let overlap = 0;
  let apiGap = 0;
  let overlapStart = null;
  let apiGapStart = null;
  for (let i = 0; i < log.length; i += 1) {
    const row = log[i];
    const next = log[i + 1];
    const end = next ? next.t : row.t;
    if (row.skeletons > 0 && row.editors > 0) overlap += end - row.t;
    if (!row.api) apiGap += end - row.t;
    if (row.skeletons > 0 && row.editors > 0 && overlapStart === null) overlapStart = row.t;
    if (!row.api && apiGapStart === null) apiGapStart = row.t;
  }
  const url = page.url().replace(BASE, '');
  const state = await page.evaluate(() => window.turboslide.studio.describe().state);
  console.log(
    JSON.stringify(
      {
        deckId,
        address: url,
        revision: state.revision,
        transitions: log.length,
        overlapMs: Math.round(overlap),
        overlapStartAfterTypingMs:
          overlapStart === null ? null : Math.round(overlapStart - typedAt),
        apiGapMs: Math.round(apiGap),
        apiGapStartAfterTypingMs: apiGapStart === null ? null : Math.round(apiGapStart - typedAt),
        log: log.map((r) => ({ ...r, t: Math.round(r.t - typedAt) })),
      },
      null,
      1,
    ),
  );
  // trash through the product: File > Move to trash, then Delete forever
  await page.locator('[data-control="menubar.file"]').click();
  await page.locator('[data-control="menu.file.moveToTrash"]').click();
  await page.waitForURL(/\/decks$/, { timeout: 20_000 });
  await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  const card = page.locator(`[data-control="trash.card.${deckId}"]`);
  await card.waitFor({ timeout: 30_000 });
  await page.locator(`[data-control="trash.delete.${deckId}"]`).click();
  await page.locator('[data-control="trash.confirm.ok"]').click();
  await card.waitFor({ state: 'detached', timeout: 30_000 });
  console.log(`cleanup: ${deckId} trashed and removed`);
  deckId = '';
} catch (error) {
  console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
