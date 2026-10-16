// The site's pictures (docs/SITE.md A.6): the hero's poster and the viewer's capture of /home,
// cut from a running studio and written as WebP (the hero's lossless, so the dithered Earth on
// its first slide keeps every cell; the rest lossy) next to the components that import them
// (apps/studio/src/components/site/pictures/, imported with `?url` so the build names them by
// content), and the docs' figures (docs/SITE.md section 6), written to
// apps/studio/public/docs/figures/ with their sizes in apps/studio/src/docs/figures.ts. Not a
// check step: run it against a dev server, look at every picture, commit them.
//
//   node scripts/site/capture.mjs --base http://localhost:4870 [--only hero|viewer|figures]
//        [--hero /edit/<deck>] [--out <dir>]
//
// The hero: the editor at the hero box's size, 1280 by 640 (the box at 1440) and 358 by 560 (the
// phone's box), device scale 2, in both appearances, after its first frame. `--hero` names the
// page: the hero step's `/try?frame=1&still=1` by default, or a stored deck's share link
// (`/s/<token>`, which signs the browser in to the deck and opens `/edit/<id>`). A tmp store's
// notice ("Edits on this copy of Turboslide are lost when it restarts.") is a dev server's alone
// and is hidden before the picture. The viewer: `/deck/gt-brand` on slide 2 (slide 1 draws a defect, V1 of the brief) after
// the first visit's 5 s hint, at 1440 by 900 cut from x 260 (past the list) and at 390 by 844 cut
// to the top 560 px. One headless browser, closed when its pictures are taken; Playwright from
// the workspace's playwright-core and sharp from the root package.
import { execFileSync } from 'node:child_process';
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
const FIGURES_OUT = join(ROOT, 'apps/studio/public/docs/figures');
const FIGURES_MANIFEST = join(ROOT, 'apps/studio/src/docs/figures.ts');
/** the byte line of one picture: the page's pictures line is 200,000 B for what one visit loads */
const MAX_BYTES = 120_000;
const APPEARANCES = ['light', 'dark'];

mkdirSync(OUT, { recursive: true });

/**
 * Lossy WebP at the highest quality, from 86 down, that keeps the file under MAX_BYTES; with
 * `lossless`, lossless WebP when it fits under the line (a flat capture of the product's UI is
 * smaller lossless, and lossy smears a dithered picture's cells).
 */
async function writeWebp(png, file, crop, lossless = false) {
  let image = sharp(png);
  if (crop !== undefined) image = image.extract(crop);
  const raw = await image.png().toBuffer();
  const exact = lossless ? await sharp(raw).webp({ lossless: true, effort: 6 }).toBuffer() : null;
  if (exact !== null && exact.length <= MAX_BYTES) {
    writeFileSync(file, exact);
    console.log(
      `${file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file}: ${exact.length} B lossless`,
    );
    return;
  }
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

async function page(browser, { width, height, appearance, mobile, state }) {
  const context = await browser.newContext({
    ...(state === undefined ? {} : { storageState: state }),
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
    { name: '1280', width: 1280, height: 640, mobile: false },
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
      await writeWebp(png, join(OUT, `hero-${size.name}-${appearance}.webp`), undefined, true);
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

/**
 * The docs' figures (docs/SITE.md section 6): crops of the editor and the viewer at 1440 by 900,
 * device scale 2, in both appearances, each at its native size. The deck is made for them in the
 * capturing browser (`figuresDeck`): /new, then the page API writes "Northwind quarterly review"
 * (the hero's stand-in client, the Swiss theme, five slides), so the browser owns a stored deck
 * and the title row, the Share dialog and the download menu answer as they do for its owner. A
 * figure with a `phone` crop gets a narrower cut of the same capture for 720 px and under. `open`
 * puts the window in the state the figure shows; `clip` is the crop in CSS pixels, or a selector
 * whose box is the crop; `leader` names one control whose centre the figure's leader points at,
 * measured as a share of each crop's width and written to the manifest with the sizes.
 */
const FIGURE_SLIDES = [
  {
    schemaVersion: 1,
    id: 'agenda',
    kind: 'content',
    template: 'rows',
    layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
    slots: {
      left: [{ id: 'h', type: 'heading', level: 'h2', text: 'Agenda' }],
      right: [
        {
          id: 'rows',
          type: 'rows',
          key: 120,
          tight: true,
          items: [
            { key: '01', value: 'Where the quarter stands' },
            { key: '02', value: 'The numbers by quarter' },
            { key: '03', value: 'What shipped' },
            { key: '04', value: 'The plan for the next quarter' },
          ],
        },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: 'numbers',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        {
          id: 'h',
          type: 'heading',
          level: 'h2',
          text: 'Orders by quarter',
          pos: { x: 137, y: 110, w: 1100, h: 72, z: 0 },
        },
        {
          id: 'chart',
          type: 'chart',
          kind: 'bar',
          title: 'Orders in thousands',
          legend: 'none',
          categories: ['Q1', 'Q2', 'Q3', 'Q4'],
          series: [{ name: 'Orders', values: [42, 51, 58, 66] }],
          pos: { x: 137, y: 220, w: 1326, h: 560, z: 1 },
        },
      ],
    },
  },
  {
    schemaVersion: 1,
    id: 'plan',
    kind: 'statement',
    big: 'Next quarter: one checkout for every region',
    measure: 22,
  },
];

/** Makes the figures' deck in a browser of its own and answers its address and the browser's state. */
async function figuresDeck(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tab = await context.newPage();
  await tab.goto(`${BASE}/new`, { waitUntil: 'load', timeout: 180_000 });
  await tab.locator('.ts-sheet').first().waitFor({ timeout: 180_000 });
  await tab.waitForFunction(() => window.turboslide?.studio !== undefined, null, {
    timeout: 120_000,
  });
  const failed = await tab.evaluate(async (slides) => {
    const studio = window.turboslide.studio;
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    /* each write names the revision the page holds; a refused one is read again and retried */
    const run = async (id, input) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const state = studio.describe().state;
        try {
          await studio.invoke(id, {
            ...input,
            baseRevision: state.serverRevision ?? state.revision,
          });
          await wait(400);
          return null;
        } catch (error) {
          await wait(1_000);
          if (attempt === 3) return `${id}: ${String(error).slice(0, 200)}`;
        }
      }
      return null;
    };
    const faults = [];
    const push = (fault) => {
      if (fault !== null) faults.push(fault);
    };
    push(await run('deck.set', { path: '/title', value: 'Northwind quarterly review' }));
    push(await run('deck.set', { path: '/theme', value: 'swiss' }));
    push(
      await run('slide.replace', {
        slideId: 'title',
        slide: {
          schemaVersion: 1,
          id: 'title',
          template: 'title',
          kind: 'title',
          mark: { w: 132, h: 84 },
          heading: 'Northwind quarterly review',
          lead: 'Where the quarter stands and what ships next.',
        },
      }),
    );
    const info = await studio.invoke('deck.info', {});
    const sectionId = info.sections?.[0]?.id ?? 'deck';
    let after = 'title';
    for (const slide of slides) {
      push(await run('slide.insert', { slide, after, sectionId }));
      after = slide.id;
    }
    /* anyone with the link may view it: the Share dialog shows both choices of general access
       and names no address of the server it was captured on */
    const deckId = studio.describe().state.deckId;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const access = await studio.invoke('share.get', { id: deckId });
        const baseRevision = access.record?.revision ?? access.revision ?? 0;
        await studio.invoke('share.setGeneralAccess', {
          id: deckId,
          mode: 'link',
          role: 'viewer',
          baseRevision,
        });
        break;
      } catch (error) {
        await wait(1_000);
        if (attempt === 3) faults.push(`share.setGeneralAccess: ${String(error).slice(0, 200)}`);
      }
    }
    return faults;
  }, FIGURE_SLIDES);
  if (failed.length > 0) throw new Error(`the figures deck: ${failed.join('; ')}`);
  await tab.waitForURL(/\/edit\//, { timeout: 60_000 });
  /* the writes reach the store before the browser's state is read */
  await tab.waitForTimeout(3_000);
  const edit = new URL(tab.url()).pathname;
  const state = await context.storageState();
  await context.close();
  return { edit, deckId: edit.replace(/^\/edit\//, ''), state };
}

const FIGURES = [
  {
    name: 'editor-top',
    page: 'edit',
    clip: { x: 0, y: 0, width: 755, height: 112 },
    phone: { x: 0, y: 0, width: 340, height: 112 },
  },
  {
    name: 'title-row-share',
    page: 'edit',
    /* a leader under the figure points at Share; its place is measured, never typed */
    leader: { label: 'Share', control: 'share.open' },
    clip: { x: 986, y: 0, width: 454, height: 44 },
    phone: { x: 1136, y: 0, width: 304, height: 44 },
  },
  {
    name: 'share-dialog',
    page: 'edit',
    open: async (tab) => {
      await tab.locator('[data-control="share.open"]').click();
      await tab.locator('[role="dialog"]').first().waitFor({ timeout: 30_000 });
      await tab.waitForTimeout(1_500);
    },
    clip: '[role="dialog"]',
  },
  {
    name: 'file-download',
    page: 'edit',
    open: async (tab) => {
      await tab.locator('[data-control="menubar.file"]').click();
      await tab.locator('[data-control="menu.file.download"]').hover();
      await tab.locator('[data-control="menu.file.download.pptx"]').waitFor({ timeout: 30_000 });
      await tab.waitForTimeout(600);
    },
    clip: { x: 0, y: 65, width: 488, height: 389 },
  },
  {
    name: 'themes-panel',
    page: 'edit',
    open: async (tab) => {
      await tab.locator('[data-control="toolbar.theme"]').click();
      await tab.locator('[data-control="panel.brand"]').waitFor({ timeout: 30_000 });
      await tab.waitForTimeout(1_000);
    },
    clip: { x: 1120, y: 112, width: 320, height: 416 },
  },
  {
    name: 'viewer-bar',
    page: 'viewer',
    clip: { x: 806, y: 0, width: 634, height: 52 },
  },
];

async function figures(browser) {
  mkdirSync(FIGURES_OUT, { recursive: true });
  const deck = await figuresDeck(browser);
  console.log(`the figures deck: ${deck.edit}`);
  const manifest = {};
  for (const appearance of APPEARANCES) {
    const { context, page: tab } = await page(browser, {
      width: 1440,
      height: 900,
      appearance,
      mobile: false,
      state: deck.state,
    });
    for (const figure of FIGURES) {
      const address = `${BASE}${figure.page === 'viewer' ? `/deck/${deck.deckId}` : deck.edit}`;
      await tab.goto(address, { waitUntil: 'load', timeout: 180_000 });
      await tab.locator('.ts-sheet').first().waitFor({ timeout: 180_000 });
      await settle(tab);
      /* first visit hints and the viewer's key hint leave after a few seconds */
      await tab.waitForTimeout(6_500);
      await hideDevNotice(tab);
      await tab.mouse.move(1439, 899);
      if (figure.open !== undefined) await figure.open(tab);
      const clip =
        typeof figure.clip === 'string'
          ? await tab.locator(figure.clip).first().boundingBox()
          : figure.clip;
      const box = {
        x: Math.round(clip.x),
        y: Math.round(clip.y),
        width: Math.round(clip.width),
        height: Math.round(clip.height),
      };
      const png = await tab.screenshot({ type: 'png' });
      const crop = (rect) => ({
        left: rect.x * 2,
        top: rect.y * 2,
        width: rect.width * 2,
        height: rect.height * 2,
      });
      await writeWebp(png, join(FIGURES_OUT, `${figure.name}-${appearance}.webp`), crop(box));
      manifest[figure.name] = { width: box.width, height: box.height };
      if (figure.leader !== undefined) {
        const target = await tab
          .locator(`[data-control="${figure.leader.control}"]`)
          .first()
          .boundingBox();
        const centre = target.x + target.width / 2;
        const share = (rect) => Math.round(((centre - rect.x) / rect.width) * 1000) / 10;
        manifest[figure.name].leader = {
          label: figure.leader.label,
          at: share(box),
          ...(figure.phone === undefined ? {} : { phoneAt: share(figure.phone) }),
        };
      }
      if (figure.phone !== undefined) {
        await writeWebp(
          png,
          join(FIGURES_OUT, `${figure.name}-390-${appearance}.webp`),
          crop(figure.phone),
        );
        manifest[figure.name].phone = { width: figure.phone.width, height: figure.phone.height };
      }
      await tab.keyboard.press('Escape');
      await tab.keyboard.press('Escape');
    }
    await context.close();
  }
  writeManifest(manifest);
}

/** The figures' sizes as a module the docs' Figure component reads, formatted by the repository's prettier. */
function writeManifest(manifest) {
  writeFileSync(
    FIGURES_MANIFEST,
    `// Written by scripts/site/capture.mjs --only figures with the pictures in
// apps/studio/public/docs/figures (docs/SITE.md section 6); do not edit by hand. Each docs figure's
// crop in CSS pixels, the phone's narrower crop where it has one, and the leader's place under it
// as a share of each crop's width.

export type FigureSize = {
  width: number;
  height: number;
  phone?: { width: number; height: number };
  leader?: { label: string; at: number; phoneAt?: number };
};

export const FIGURE_SIZES: Record<string, FigureSize> = ${JSON.stringify(manifest, null, 2)};
`,
  );
  execFileSync(join(ROOT, 'node_modules/.bin/prettier'), ['--write', FIGURES_MANIFEST]);
  console.log(
    `${FIGURES_MANIFEST.slice(ROOT.length + 1)}: ${Object.keys(manifest).length} figures`,
  );
}

const browser = await chromium.launch({ headless: true });
try {
  if (ONLY === 'all' || ONLY === 'hero') await hero(browser);
  if (ONLY === 'all' || ONLY === 'viewer') await viewer(browser);
  if (ONLY === 'figures') await figures(browser);
} finally {
  await browser.close();
}
