// The site's pictures (docs/SITE.md A.6): the hero's poster and the viewer's capture of /home,
// cut from a running studio and written as lossy WebP next to the components that import them
// (apps/studio/src/components/site/pictures/, imported with `?url` so the build names them by
// content). Not a check step: run it against a dev server, look at every picture, commit them.
//
//   node scripts/site/capture.mjs --base http://localhost:4870 [--only hero|viewer]
//        [--hero /edit/<deck>] [--out <dir>]
//
// The hero: the editor at the hero box's size, 1280 by 800 (the box at 1440) and 358 by 560 (the
// phone's box), device scale 2, in both appearances, after its first frame. `--hero` names the
// page: the hero step's `/try?frame=1&still=1` by default, or a stored deck's share link
// (`/s/<token>`, which signs the browser in to the deck and opens `/edit/<id>`). A tmp store's
// notice ("Edits on this copy of Turboslide are lost when it restarts.") is a dev server's alone
// and is hidden before the picture. The viewer: `/deck/gt-brand` on slide 2 (slide 1 draws a defect, V1 of the brief) after
// the first visit's 5 s hint, at 1440 by 900 cut from x 260 (past the list) and at 390 by 844 cut
// to the top 560 px. One headless browser, closed when its pictures are taken; Playwright from
// the workspace's playwright-core and sharp from the root package.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'package.json'));
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4870');
const ONLY = arg('only', 'all');
const HERO = arg('hero', '/try?frame=1&still=1');
const OUT = resolve(arg('out', join(ROOT, 'apps/studio/src/components/site/pictures')));
/** the byte line of one picture: the page's pictures line is 200,000 B for what one visit loads */
const MAX_BYTES = 120_000;
const APPEARANCES = ['light', 'dark'];

mkdirSync(OUT, { recursive: true });

/** Lossy WebP at the highest quality, from 86 down, that keeps the file under MAX_BYTES. */
async function writeWebp(png, file, crop) {
  let image = sharp(png);
  if (crop !== undefined) image = image.extract(crop);
  const raw = await image.png().toBuffer();
  for (let quality = 86; quality >= 50; quality -= 4) {
    const webp = await sharp(raw).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
    if (webp.length <= MAX_BYTES || quality <= 50) {
      writeFileSync(file, webp);
      console.log(
        `${file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file}: ${webp.length} B at quality ${quality}`,
      );
      return;
    }
  }
}

async function page(browser, { width, height, appearance, mobile }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: appearance,
    reducedMotion: 'reduce',
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  await context.addInitScript((theme) => {
    try {
      localStorage.setItem('gt-theme', theme);
    } catch {
      /* a refused storage draws the system's appearance, which the context names too */
    }
  }, appearance);
  return { context, page: await context.newPage() };
}

async function settle(tab) {
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
}

/** Hides the tmp store's notice, which a deployment never draws. */
async function hideDevNotice(tab) {
  await tab.evaluate(() => {
    for (const el of document.querySelectorAll('body *'))
      if (el.childElementCount === 0 && /lost when it restarts/.test(el.textContent ?? ''))
        (el.parentElement ?? el).style.visibility = 'hidden';
  });
}

async function hero(browser) {
  const sizes = [
    { name: '1280', width: 1280, height: 800, mobile: false },
    { name: '358', width: 358, height: 560, mobile: true },
  ];
  for (const size of sizes)
    for (const appearance of APPEARANCES) {
      const { context, page: tab } = await page(browser, { ...size, appearance });
      await tab.goto(`${BASE}${HERO}`, { waitUntil: 'load', timeout: 120_000 });
      await tab.locator('.ts-sheet').first().waitFor({ timeout: 120_000 });
      await settle(tab);
      /* the editor's first visit hints and the name prompt leave after a few seconds */
      await tab.waitForTimeout(6_000);
      await hideDevNotice(tab);
      await tab.mouse.move(size.width - 2, size.height - 2);
      const png = await tab.screenshot({ type: 'png' });
      await writeWebp(png, join(OUT, `hero-${size.name}-${appearance}.webp`));
      await context.close();
    }
}

async function viewer(browser) {
  const sizes = [
    {
      name: '1440',
      width: 1440,
      height: 900,
      mobile: false,
      crop: { left: 520, top: 0, width: 2360, height: 1784 },
    },
    {
      name: '390',
      width: 390,
      height: 844,
      mobile: true,
      crop: { left: 0, top: 0, width: 780, height: 1120 },
    },
  ];
  for (const size of sizes)
    for (const appearance of APPEARANCES) {
      const { context, page: tab } = await page(browser, { ...size, appearance });
      await tab.goto(`${BASE}/deck/gt-brand#02`, { waitUntil: 'load', timeout: 120_000 });
      await tab.locator('.ts-sheet').first().waitFor({ timeout: 120_000 });
      await settle(tab);
      /* the first visit's hint ("Arrow keys move. Press ? for every shortcut.") shows for 5 s */
      await tab.waitForTimeout(6_500);
      await tab.mouse.move(size.width - 2, size.height - 2);
      const png = await tab.screenshot({ type: 'png' });
      await writeWebp(png, join(OUT, `viewer-${size.name}-${appearance}.webp`), size.crop);
      await context.close();
    }
}

const browser = await chromium.launch({ headless: true });
try {
  if (ONLY === 'all' || ONLY === 'hero') await hero(browser);
  if (ONLY === 'all' || ONLY === 'viewer') await viewer(browser);
} finally {
  await browser.close();
}
