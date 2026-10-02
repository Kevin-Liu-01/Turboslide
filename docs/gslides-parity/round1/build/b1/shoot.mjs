// Lane B1's pictures of the surfaces the mark push changes (docs/NEXT.md 4.1.3 items 1 to 5), at
// 1440 by 900 and 390 by 844 in the light and the dark chrome, device scale factor 1: the title
// row band on a fresh /new draft (nobody edits it, so no deck is made), the /decks bar band and
// Not found's figure (the /home navigation is lane B2's surface and its pictures), each with its mark cropped and enlarged 4 times by
// nearest neighbour so a soft row shows. The server is a scratch export of a tree (HEAD for the
// pictures before, the push's tree for the pictures after), so no other lane's working files are
// in them.
//
//   node docs/gslides-parity/round1/build/b1/shoot.mjs <base> <label>
//
// Refuses to start at a one minute load average of 24 or more; the caller holds
// .turboslide/e2e.lock.
import { createRequire } from 'node:module';
import { appendFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';

const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const [base = 'http://localhost:4503', label = 'after'] = process.argv.slice(2);
const OUT = new URL('./', import.meta.url).pathname;
const LOG = '/Users/kevinliu/repos/Turboslide-next/.turboslide/round1/b1/shoot.jsonl';
mkdirSync('/Users/kevinliu/repos/Turboslide-next/.turboslide/round1/b1', { recursive: true });
const log = (o) =>
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), load: loadavg()[0], label, ...o })}\n`);

if (loadavg()[0] >= 24) {
  console.error(`load ${loadavg()[0].toFixed(2)}: not started`);
  process.exit(2);
}
log({ start: base });

const views = [
  { w: 1440, h: 900, tag: '1440' },
  { w: 390, h: 844, tag: '390' },
];
const surfaces = [
  {
    name: 'titlerow',
    path: '/new',
    ready: '.pt-viewer:not(.ts-skeleton)[data-settled]',
    band: 64,
    mark: '.ts-title-home',
  },
  { name: 'decks', path: '/decks', ready: '.ts-brand-lockup', band: 72, mark: '.ts-brand-lockup' },
  { name: 'notfound', path: '/no-such-page', ready: '.ts-notfound', band: 0, mark: '.ts-empty-mark' },
];

const browser = await chromium.launch();
/* the warm up visit: the dependency optimizer's first load reload happens here, not in a picture */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  for (const s of surfaces) {
    await page.goto(`${base}${s.path}`, { waitUntil: 'load', timeout: 180_000 }).catch(() => undefined);
    await page.waitForTimeout(3000);
  }
  await ctx.close();
}

for (const theme of ['light', 'dark'])
  for (const v of views)
    for (const s of surfaces) {
      const ctx = await browser.newContext({
        viewport: { width: v.w, height: v.h },
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      await ctx.addInitScript((t) => {
        try {
          localStorage.setItem('gt-theme', t);
          localStorage.setItem('ts-chrome-appearance', t);
        } catch {}
      }, theme);
      const page = await ctx.newPage();
      const id = `${label}-${s.name}-${v.tag}-${theme}`;
      try {
        await page.goto(`${base}${s.path}`, { waitUntil: 'load', timeout: 120_000 });
        await page.locator(s.ready).first().waitFor({ timeout: 90_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1200);
        const png = await page.screenshot({ type: 'png' });
        const mark = await page.locator(s.mark).first().boundingBox();
        let band;
        if (s.band > 0) band = { left: 0, top: 0, width: v.w, height: s.band };
        else if (mark) {
          const fig = await page.locator('.ts-empty-fig').first().boundingBox();
          const box = fig ?? mark;
          band = {
            left: Math.max(0, Math.floor(box.x) - 8),
            top: Math.max(0, Math.floor(box.y) - 8),
            width: Math.min(v.w - Math.max(0, Math.floor(box.x) - 8), Math.ceil(box.width) + 16),
            height: Math.min(v.h - Math.max(0, Math.floor(box.y) - 8), Math.ceil(box.height) + 16),
          };
        }
        if (band) await sharp(png).extract(band).png().toFile(`${OUT}${id}.png`);
        if (mark) {
          const pad = 4;
          const crop = {
            left: Math.max(0, Math.floor(mark.x) - pad),
            top: Math.max(0, Math.floor(mark.y) - pad),
            width: Math.min(v.w, Math.ceil(mark.width) + 2 * pad),
            height: Math.min(v.h, Math.ceil(mark.height) + 2 * pad),
          };
          await sharp(png)
            .extract(crop)
            .resize(crop.width * 4, crop.height * 4, { kernel: 'nearest' })
            .png()
            .toFile(`${OUT}${id}-mark4x.png`);
        }
        const facts = await page.evaluate(() => {
          const svg = document.querySelector('svg.ts-mark');
          return svg
            ? {
                width: svg.getAttribute('width'),
                form: svg.getAttribute('data-form'),
                cap: svg.getAttribute('data-cap'),
                cells: svg.getAttribute('data-cells'),
                theme: document.documentElement.getAttribute('data-theme'),
              }
            : null;
        });
        log({ shot: id, band, mark, facts });
        console.log(id, JSON.stringify(facts));
      } catch (error) {
        log({ shot: id, error: String(error).split('\n')[0].slice(0, 300) });
        console.error(id, String(error).split('\n')[0]);
      } finally {
        await ctx.close();
      }
    }
await browser.close();
log({ end: base });
