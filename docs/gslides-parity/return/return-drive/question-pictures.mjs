#!/usr/bin/env node
// Picture pairs for two open questions of docs/RETURN.md section 9, taken on production
// (https://turboslide.vercel.app, 1d3ba31) on /new before any write (so no deck is created and
// nothing needs trashing), in both appearances, with rules injected through page.addStyleTag (no
// source edit), the way audit-chrome/after-pictures.mjs took the after pictures:
//   question 4: the light hairline --pt-hair at .18 (today) against .22 (the dark value) on the
//     title row, the toolbar and their boundaries;
//   question 1: Share at 8 px corners against --pt-radius 6 px, beside the split button drawn as
//     one control (the 5a rules of audit-chrome.md), on the right cluster.
// Headless Chromium, 1440 by 900, 1x. Writes the pictures and a JSON of the composites beside itself.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = 'https://turboslide.vercel.app';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SPLIT_RULES = `
.ts-title-slideshow { box-sizing: border-box; display: inline-flex; align-items: stretch; height: 32px; border: 1px solid var(--pt-ink); border-radius: 8px; background: var(--pt-ink); color: var(--pt-paper); overflow: hidden; }
.ts-title-slideshow > .pt-ib.is-solid { box-sizing: border-box; height: 30px; border: 0; border-radius: 0; background: transparent; color: inherit; flex-direction: row; gap: 6px; }
.ts-title-slideshow > .pt-ib.is-solid.ts-title-present { padding: 0 10px 0 12px; }
.ts-title-slideshow > .pt-ib.is-solid.ts-title-present-arrow { width: 28px; padding: 0; justify-content: center; border-left: 1px solid color-mix(in srgb, var(--pt-paper) 26%, transparent); }
.ts-title-slideshow > .pt-ib.is-solid svg { width: 12px; height: 12px; }
.ts-title-slideshow > .pt-ib.is-solid.ts-title-present-arrow svg { width: 14px; height: 14px; }
.ts-presence-more.is-empty { opacity: 0; pointer-events: none; }
.ts-title-inbox-slot.is-empty { display: none; }
`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const notes = {};
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await sleep(800);
  await page.mouse.move(720, 600);
  const cluster = async () => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('.ts-title-r');
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return {
      x: Math.max(0, Math.floor(r.x - 8)),
      y: 0,
      width: Math.min(1440 - Math.floor(r.x - 8), Math.ceil(r.w + 24)),
      height: 44,
    };
  };
  for (const appearance of ['dark', 'light']) {
    await page.evaluate((a) => document.documentElement.setAttribute('data-theme', a), appearance);
    await sleep(400);
    /* question 4: the row boundaries at .18 (today) and at .22 */
    for (const alpha of ['0.18', '0.22']) {
      const tag = await page.addStyleTag({
        content:
          alpha === '0.18'
            ? '/* today: no rule injected */ .ts-title-row { }'
            : `:root:not([data-theme='dark']) { --pt-hair: rgba(7, 7, 7, ${alpha}); }`,
      });
      await sleep(250);
      const name = `q4-${appearance}-hair-${alpha.replace('0.', '')}.png`;
      await page.screenshot({
        path: path.join(OUT, name),
        clip: { x: 0, y: 0, width: 720, height: 140 },
      });
      notes[name] = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--pt-hair').trim(),
      );
      await tag.evaluate((el) => el.remove());
    }
    /* question 1: the split button as one control, Share at 8 px and at 6 px */
    for (const radius of ['8px', '6px']) {
      const tag = await page.addStyleTag({
        content: `${SPLIT_RULES}\n.ts-title-share { border-radius: ${radius}; }`,
      });
      await sleep(300);
      const clip = await cluster();
      const name = `q1-${appearance}-share-${radius}.png`;
      await page.screenshot({ path: path.join(OUT, name), clip });
      notes[name] = await page.evaluate(() => ({
        share: getComputedStyle(document.querySelector('.ts-title-share')).borderRadius,
        split: getComputedStyle(document.querySelector('.ts-title-slideshow')).borderRadius,
        inboxSlot:
          document.querySelector('.ts-title-inbox-slot')?.getBoundingClientRect().width ?? null,
        more: getComputedStyle(document.querySelector('.ts-presence-more') ?? document.body)
          .opacity,
      }));
      await tag.evaluate((el) => el.remove());
    }
  }
  writeFileSync(path.join(OUT, 'question-pictures.json'), JSON.stringify(notes, null, 2));
  console.log(JSON.stringify(notes, null, 2));
} finally {
  await browser.close();
}
