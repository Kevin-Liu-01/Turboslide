// B1 day 1 (gslides-parity round four, the orchestrator's ruling 1): the before and after
// screenshot pair of a selected object on a dark photograph slide and on a white slide of a
// scratch copy of the GT deck, against the builder's dev server on 4341 (TURBOSLIDE_STORE=tmp).
// "Before" injects the round three sheets (git show d5d7f07:...) over the served ones, so the
// same page shows both states without touching the tree; "after" is the served CSS.
//
//   node shoot-selection.mjs <base> <outDir> <beforeCssDir>
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const [base = 'http://localhost:4341', outDir = '.', beforeDir = '.'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const BEFORE_CSS = ['before-Overlay.css', 'before-Marquee.css', 'before-Guides.css']
  .map((name) => readFileSync(join(beforeDir, name), 'utf8'))
  .join('\n');

const COPY = `b1-selection-${Date.now().toString(36)}`;
const SLIDES = [
  { id: 'opener-prototemplate', object: 'h', name: 'dark-photo' },
  { id: 'thesis', object: 'big', name: 'white' },
];

async function invoke(page, action, input) {
  return page.evaluate(
    ([id, value]) => window.turboslide.studio.invoke(id, value),
    [action, input],
  );
}

async function settled(page) {
  await page.waitForFunction(() => {
    if (typeof window.turboslide?.studio?.describe !== 'function') return false;
    const state = window.turboslide.studio.describe().state;
    return state.pending === 0 && state.revision === state.serverRevision;
  });
}

async function studioReady(page) {
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await page.waitForSelector('.pt-viewer:not(.ts-skeleton)[data-settled]');
  await settled(page);
}

async function goTo(page, slideId) {
  await invoke(page, 'view.goto', { slideId });
  await page.waitForSelector(`.ts-stagewrap.ts-editor .pt-slide[data-slide-id="${slideId}"]`);
  await page.waitForTimeout(400);
}

async function selectObject(page, objectId) {
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${objectId}"]`).first();
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${objectId}`);
  await page.mouse.click(box.x + Math.min(24, box.width / 2), box.y + Math.min(16, box.height / 2));
  await page.waitForSelector('.ts-overlay .ts-select.is-selected');
  await page.waitForTimeout(250);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem('gt-theme', 'light');
  } catch {}
});
await page.goto(`${base}/edit/gt-brand?author=agent:b1-selection`);
await studioReady(page);
const source = await invoke(page, 'deck.info');
const revision = source.revision;
const copied = await invoke(page, 'deck.copy', {
  id: 'gt-brand',
  name: 'B1 selection',
  newId: COPY,
  ...(revision === undefined ? {} : { baseRevision: revision }),
});
console.log('copied', JSON.stringify(copied));
await page.goto(`${base}/edit/${COPY}?author=agent:b1-selection`);
await studioReady(page);

for (const slide of SLIDES) {
  await goTo(page, slide.id);
  await selectObject(page, slide.object);
  /* hover a second object so the hover outline shows beside the ring */
  const other = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block]').nth(1);
  const otherBox = await other.boundingBox().catch(() => null);
  if (otherBox)
    await page.mouse.move(otherBox.x + otherBox.width / 2, otherBox.y + otherBox.height / 2);
  await page.waitForTimeout(200);
  const stage = await page.locator('.ts-stagewrap.ts-editor').boundingBox();
  const clip = stage
    ? {
        x: Math.max(0, stage.x - 8),
        y: Math.max(0, stage.y - 8),
        width: Math.min(1440 - stage.x + 8, stage.width + 16),
        height: Math.min(900 - stage.y + 8, stage.height + 16),
      }
    : undefined;
  await page.screenshot({ path: join(outDir, `after-${slide.name}.png`), clip });
  await page.screenshot({ path: join(outDir, `after-${slide.name}-full.png`) });
  const handle = await page.addStyleTag({ content: BEFORE_CSS });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(outDir, `before-${slide.name}.png`), clip });
  await page.screenshot({ path: join(outDir, `before-${slide.name}-full.png`) });
  await handle.evaluate((el) => el.remove());
  const ring = await page.evaluate(() => {
    const el = document.querySelector('.ts-overlay .ts-select.is-selected');
    return el ? getComputedStyle(el).borderTopColor : null;
  });
  console.log(slide.name, 'ring colour after', ring);
}
console.log('scratch deck', COPY);
await browser.close();
