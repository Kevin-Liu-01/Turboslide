import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { HOME_ASSETS } from './asset-records';
import { HOME_DECK } from '../../../src/components/home/deck.generated';
import { EXPORT, formatPercentFigure } from '../../../src/components/home/copy';
import { HOME_FACTS } from '../../../src/components/home/facts';
import FACTS from '../../../../../packages/theme/brand/facts.json' with { type: 'json' };
import { MARK_PATH, MARK_VIEWBOX } from '@turboslide/theme/brand';
import { SPRITE } from '@turboslide/theme/sprite';
import { extraHTTPHeaders, title } from '../lib';
import { bandReady, freshPage, openHome } from './agents';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.12, 6.7). The first pass's push 6 (the
// seam, home.export.seam) and V3's push V3#17: the figure with the PDF of nine pages
// (home.export.figure) and the loupe (home.export.loupe). The files are read through the network
// as the page serves them and compared with `assets.json` (the build's record of each file's
// bytes, sha256 and size); the loupe's count is checked against pixelmatch itself, resolved from
// the exporter's own dependency, over the same window of the two decoded files.

export const ROWS: readonly string[] = [
  'home.export.seam',
  'home.export.figure',
  'home.export.loupe',
  'home.export.pdf-appearance',
  'home.export.one-mark',
];

const ROOT = resolve(import.meta.dirname, '../../../../..');
/** The slides of the page deck: the PDF has one page each. */
const N = HOME_DECK.order.length;

type Pixelmatch = (
  a: Uint8Array,
  b: Uint8Array,
  out: null,
  w: number,
  h: number,
  options: { threshold: number; includeAA: boolean },
) => number;
async function pixelmatch(): Promise<Pixelmatch> {
  const require = createRequire(resolve(ROOT, 'packages/export/package.json'));
  return (
    (await import(pathToFileURL(require.resolve('pixelmatch')).href)) as { default: Pixelmatch }
  ).default;
}

/** A 14 by 14 window of a decoded raster, RGBA. */
async function windowOf(bytes: Buffer, x: number, y: number): Promise<Uint8Array> {
  const require = createRequire(resolve(ROOT, 'package.json'));
  const sharp = require('sharp') as (b: Buffer) => {
    extract(r: { left: number; top: number; width: number; height: number }): {
      ensureAlpha(): { raw(): { toBuffer(): Promise<Buffer> } };
    };
  };
  const raw = await sharp(bytes)
    .extract({ left: x, top: y, width: 14, height: 14 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return new Uint8Array(raw);
}

const band = (page: Page) => page.locator('[data-band="export"]');
const handle = (page: Page) => band(page).locator('[data-seam]');
const cutOf = (page: Page) =>
  handle(page).evaluate((el) => {
    let root: HTMLElement | null = el as HTMLElement;
    while (root !== null && !root.hasAttribute('data-seam-root')) root = root.parentElement;
    const host = root ?? (el.parentElement as HTMLElement);
    return parseFloat(getComputedStyle(host).getPropertyValue('--seam-cut'));
  });
const seamRoot = (page: Page) => band(page).locator('[data-seam-root]');

export function rows(): void {
  test(title('home.export.seam'), async ({ browser }) => {
    const page = await freshPage(browser);
    await openHome(page);
    await bandReady(page, 'export');
    /* the labels and the slider */
    await expect(band(page)).toContainText(EXPORT.labels.perfect);
    await expect(band(page)).toContainText(EXPORT.labels.editable);
    await expect(handle(page)).toHaveAttribute('role', 'slider');
    await expect(handle(page)).toHaveAttribute('aria-valuemin', '0');
    await expect(handle(page)).toHaveAttribute('aria-valuemax', '100');
    /* a drag follows the pointer 1:1 with no inertia */
    const box = (await seamRoot(page).boundingBox())!;
    const y = box.y + box.height * 0.25;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    for (const p of [0.35, 0.5, 0.62, 0.7]) {
      await page.mouse.move(box.x + box.width * p, y);
      expect(Math.abs((await cutOf(page)) - p * 100)).toBeLessThan(0.5);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(Math.abs((await cutOf(page)) - 70)).toBeLessThan(0.5);
    expect(await seamRoot(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(
      0,
    );
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '70');
    await expect(handle(page)).toHaveAttribute('aria-valuetext', EXPORT.slider(70));
    /* a click sets it */
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.1);
    expect(Math.abs((await cutOf(page)) - 20)).toBeLessThan(0.5);
    /* the keys: arrows 2, Shift 10, Page Up and Down 10, Home and End */
    await handle(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '22');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '32');
    await page.keyboard.press('PageDown');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '22');
    await page.keyboard.press('ArrowLeft');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '20');
    await page.keyboard.press('End');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '100');
    await page.keyboard.press('Home');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '0');
    /* the left side is the Perfect file's picture part, served as recorded */
    const perfect = HOME_ASSETS.find(
      (a) => a.role === 'export-perfect' && a.appearance === 'light',
    );
    expect(perfect).toBeDefined();
    const src = await band(page).locator('.ts-seam-perfect img.ts-only-light').getAttribute('src');
    expect(src).toBe(perfect!.path);
    const res = await page.request.get(src!, { headers: extraHTTPHeaders });
    const bytes = await res.body();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(perfect!.sha256);
    await expect(band(page)).toContainText(`${perfect!.width} by ${perfect!.height}`);
    /* the right side's text boxes are text, selectable */
    const texts = band(page).locator('[data-seam-text]');
    expect(await texts.count()).toBeGreaterThan(0);
    const selectable = await texts.first().evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return { text: selection.toString().trim(), user: getComputedStyle(el).userSelect };
    });
    expect(selectable.text.length).toBeGreaterThan(0);
    expect(selectable.user).not.toBe('none');
    await page.context().close();
  });

  test(title('home.export.figure'), async ({ browser }) => {
    const page = await freshPage(browser);
    const pdfRequests: string[] = [];
    page.on('request', (r) => {
      if (/\/home\/.*\.pdf/.test(r.url())) pdfRequests.push(r.url());
    });
    await openHome(page);
    await bandReady(page, 'export');
    await page.waitForTimeout(500);
    expect(pdfRequests).toEqual([]);
    /* the figure is facts.json's export reading, in the sentence that names its measure */
    const perfect = HOME_ASSETS.find(
      (a) => a.role === 'export-perfect' && a.appearance === 'light',
    );
    expect(perfect).toBeDefined();
    const size = { width: perfect!.width ?? 0, height: perfect!.height ?? 0 };
    await expect(band(page)).toContainText(EXPORT.rows.perfect.sentence(size, HOME_FACTS));
    expect(EXPORT.rows.perfect.sentence(size, HOME_FACTS)).toContain(
      `${formatPercentFigure(HOME_FACTS.mismatchPercent)}.`,
    );
    expect(EXPORT.rows.perfect.sentence(size, HOME_FACTS)).toContain('screenshot');
    expect(HOME_FACTS.mismatchPercent).toBe(FACTS.export.worstPageMismatchPercent);
    await expect(page.locator('main#top')).not.toContainText(/pixel for pixel/i);
    const record = band(page).locator('a[href$="docs/pptx.md"]');
    await expect(record).toHaveCount(1);
    /* Download the PDF: one page a slide, its sha256 in assets.json */
    const download = page.waitForEvent('download');
    await band(page).locator('a[data-pdf]').click();
    const file = await download;
    const path = await file.path();
    const bytes = readFileSync(path);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const pdf = HOME_ASSETS.find((a) => a.role === 'pdf' && a.sha256 === sha);
    expect(pdf, 'the downloaded PDF is a file of assets.json').toBeDefined();
    expect(pdf!.pages).toBe(N);
    expect((bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(N);
    /* the link points at the file of the shown appearance, requested by this click alone */
    expect(new URL(file.url()).pathname).toBe(
      HOME_ASSETS.find((a) => a.role === 'pdf' && a.appearance === 'light')!.path,
    );
    await page.context().close();
  });

  test(title('home.export.loupe'), async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await freshPage(browser);
    const rasterRequests: string[] = [];
    const browserPaths = HOME_ASSETS.filter((a) => a.role === 'export-browser').map((a) => a.path);
    const perfectPaths = HOME_ASSETS.filter((a) => a.role === 'export-perfect').map((a) => a.path);
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (browserPaths.includes(path) || perfectPaths.includes(path)) rasterRequests.push(path);
    });
    await openHome(page);
    await bandReady(page, 'export');
    await page.waitForTimeout(800);
    const target = band(page).locator('[data-loupe]');
    await expect(target).toHaveCount(1);
    await expect(target).toHaveAttribute('aria-label', 'Pixel comparison of slide 7');
    /* nothing of the browser raster is requested before the first use */
    expect(rasterRequests.filter((p) => browserPaths.includes(p))).toEqual([]);
    const box = (await target.boundingBox())!;
    const pm = await pixelmatch();
    const fetchRaster = async (path: string): Promise<Buffer> =>
      Buffer.from(await (await page.request.get(path)).body());
    const browserPath = browserPaths.find((p) => /light/.test(p)) ?? browserPaths[0]!;
    const perfectPath = HOME_ASSETS.find(
      (a) => a.role === 'export-perfect' && a.appearance === 'light',
    )!.path;
    const [browserBytes, perfectBytes] = await Promise.all([
      fetchRaster(browserPath),
      fetchRaster(perfectPath),
    ]);
    const rec = HOME_ASSETS.find((a) => a.path === browserPath);
    if (rec !== undefined && rec.sha256 !== '')
      expect(createHash('sha256').update(browserBytes).digest('hex')).toBe(rec.sha256);
    /* the places the build found a differing pixel, and two of the slide's own */
    const loupeJson = resolve(ROOT, 'apps/studio/home-deck/recorded-loupe/loupe.json');
    const where: [number, number][] = existsSync(loupeJson)
      ? (
          JSON.parse(readFileSync(loupeJson, 'utf8')) as {
            loupe: { light: { where: [number, number][] } };
          }
        ).loupe.light.where
      : [];
    const points: [number, number][] = [[1210, 640], [400, 1500], ...where.slice(0, 2)];
    for (const [rx, ry] of points) {
      const cx = box.x + ((rx + 7) / 3200) * box.width;
      const cy = box.y + ((ry + 7) / 1800) * box.height;
      await page.mouse.move(cx - 30, cy - 30);
      await page.mouse.move(cx, cy, { steps: 3 });
      const loupe = band(page).locator('.ts-loupe');
      await expect(loupe).toBeVisible({ timeout: 10_000 });
      await expect.poll(async () => loupe.getAttribute('data-x')).not.toBeNull();
      const x = Number(await loupe.getAttribute('data-x'));
      const y = Number(await loupe.getAttribute('data-y'));
      const differ = Number(await loupe.getAttribute('data-differ'));
      /* the window is at the pointer's place, both rasters at ten times */
      expect(Math.abs(x - rx)).toBeLessThanOrEqual(3);
      expect(Math.abs(y - ry)).toBeLessThanOrEqual(3);
      const [a, b] = await Promise.all([
        windowOf(browserBytes, x, y),
        windowOf(perfectBytes, x, y),
      ]);
      expect(differ, `the count at x ${x}, y ${y}`).toBe(
        pm(a, b, null, 14, 14, { threshold: 0.1, includeAA: true }),
      );
      await expect(loupe.locator('.ts-loupe-readout')).toHaveText(
        `${differ} of 196 pixels differ at x ${x + 7}, y ${y + 7}.`,
      );
      const sizes = await loupe
        .locator('canvas')
        .evaluateAll((els) =>
          els.map((e) => [
            e.getBoundingClientRect().width,
            e.getBoundingClientRect().height,
            getComputedStyle(e).imageRendering,
          ]),
        );
      expect(sizes).toEqual([
        [140, 140, 'pixelated'],
        [140, 140, 'pixelated'],
      ]);
      test.info().annotations.push({
        type: 'reading',
        description: `loupe at x ${x}, y ${y}: ${differ} of 196 differ`,
      });
    }
    /* the pointer leaves the slide: the loupe leaves */
    await page.mouse.move(box.x + box.width / 2, box.y - 80);
    await expect(band(page).locator('.ts-loupe')).toBeHidden();
    /* the browser raster was requested once, on the first use; the Perfect picture never twice */
    expect(rasterRequests.filter((p) => browserPaths.includes(p)).length).toBeLessThanOrEqual(2);
    expect(new Set(rasterRequests).size).toBe(rasterRequests.length);
    /* the keys: focus, an arrow moves the window 14 px, Shift 140, Escape hides it */
    await target.focus();
    await page.keyboard.press('ArrowRight');
    const loupe = band(page).locator('.ts-loupe');
    await expect(loupe).toBeVisible();
    const x0 = Number(await loupe.getAttribute('data-x'));
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await loupe.getAttribute('data-x'))).toBe(x0 + 14);
    await page.keyboard.press('Shift+ArrowDown');
    const y1 = Number(await loupe.getAttribute('data-y'));
    await page.keyboard.press('Shift+ArrowUp');
    await expect.poll(async () => Number(await loupe.getAttribute('data-y'))).toBe(y1 - 140);
    await expect(band(page).locator('[data-announce]')).toContainText('pixels differ');
    await page.keyboard.press('Escape');
    await expect(loupe).toBeHidden();
    await expect(page.locator('main#top')).not.toContainText(/pixel for pixel/i);
    await page.context().close();

    /* the dark appearance: the loupe reads the dark rasters (the dark Perfect picture is the seam's
       own dark img), and the window over the pixel the build found differing counts it */
    const dark = await freshPage(browser);
    await dark.emulateMedia({ colorScheme: 'dark' });
    await openHome(dark);
    await bandReady(dark, 'export');
    await dark.waitForTimeout(800);
    const darkTarget = band(dark).locator('[data-loupe]');
    const darkBox = (await darkTarget.boundingBox())!;
    const darkBrowserPath = browserPaths.find((p) => /dark/.test(p)) ?? browserPaths[1]!;
    const darkPerfectPath = HOME_ASSETS.find(
      (a) => a.role === 'export-perfect' && a.appearance === 'dark',
    )!.path;
    const darkFetch = async (path: string): Promise<Buffer> =>
      Buffer.from(await (await dark.request.get(path)).body());
    const [darkBrowser, darkPerfect] = await Promise.all([
      darkFetch(darkBrowserPath),
      darkFetch(darkPerfectPath),
    ]);
    const darkWhere: [number, number][] = existsSync(loupeJson)
      ? (
          JSON.parse(readFileSync(loupeJson, 'utf8')) as {
            loupe: { dark: { where: [number, number][] } };
          }
        ).loupe.dark.where
      : [];
    for (const [rx, ry] of [[1210, 640], ...darkWhere.slice(0, 1)] as [number, number][]) {
      /* the window's top left corner seven pixels up and left of the place, so the place is inside */
      const cx = darkBox.x + ((rx + 0.5) / 3200) * darkBox.width;
      const cy = darkBox.y + ((ry + 0.5) / 1800) * darkBox.height;
      await dark.mouse.move(cx - 30, cy - 30);
      await dark.mouse.move(cx, cy, { steps: 3 });
      const darkLoupe = band(dark).locator('.ts-loupe');
      await expect(darkLoupe).toBeVisible({ timeout: 10_000 });
      await expect.poll(async () => darkLoupe.getAttribute('data-x')).not.toBeNull();
      const x = Number(await darkLoupe.getAttribute('data-x'));
      const y = Number(await darkLoupe.getAttribute('data-y'));
      const differ = Number(await darkLoupe.getAttribute('data-differ'));
      const [a, b] = await Promise.all([windowOf(darkBrowser, x, y), windowOf(darkPerfect, x, y)]);
      expect(differ, `the dark count at x ${x}, y ${y}`).toBe(
        pm(a, b, null, 14, 14, { threshold: 0.1, includeAA: true }),
      );
      const inside = rx >= x && rx < x + 14 && ry >= y && ry < y + 14;
      if (darkWhere.some(([wx, wy]) => wx === rx && wy === ry) && inside)
        expect(
          differ,
          'the window over the pixel the build found differing',
        ).toBeGreaterThanOrEqual(1);
      test.info().annotations.push({
        type: 'reading',
        description: `dark loupe at x ${x}, y ${y}: ${differ} of 196 differ`,
      });
      await dark.mouse.move(darkBox.x + darkBox.width / 2, darkBox.y - 80);
      await expect(darkLoupe).toBeHidden();
    }
    await dark.context().close();
  });

  test(title('home.export.pdf-appearance'), async ({ browser }) => {
    test.setTimeout(180_000);
    const fileOf = (appearance: 'light' | 'dark'): string =>
      HOME_ASSETS.find((a) => a.role === 'pdf' && a.appearance === appearance)?.path ?? '';
    for (const width of ['desktop', 'phone'] as const)
      for (const scheme of ['light', 'dark'] as const) {
        const other = scheme === 'dark' ? 'light' : 'dark';
        const page = await freshPage(browser);
        const asked: string[] = [];
        page.on('request', (r) => {
          if (/\/home\/.*\.pdf/.test(r.url())) asked.push(new URL(r.url()).pathname);
        });
        await page.emulateMedia({ colorScheme: scheme });
        await openHome(page, width);
        await bandReady(page, 'export');
        const link = band(page).locator('a[data-pdf]');
        /* the shown appearance's file before any click, so a copied link or a new tab takes it */
        await expect(link, `${width} ${scheme} at rest`).toHaveAttribute('href', fileOf(scheme));
        /* the navigation's theme button to the other appearance, then back (docs/DESIGN.md 8.1:
           one button in place of the Light and Dark pair): the href follows each change */
        const themeButton = page.locator('header [data-control="view.theme"]');
        await themeButton.click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', other);
        await expect(link, `${width} after ${other}`).toHaveAttribute('href', fileOf(other));
        await themeButton.click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        await expect(link, `${width} after ${scheme}`).toHaveAttribute('href', fileOf(scheme));
        /* naming the file requests nothing */
        expect(asked).toEqual([]);
        await page.context().close();
      }
  });

  test(title('home.export.one-mark'), async ({ browser }) => {
    test.setTimeout(180_000);
    /* the footer logo's corner of slide 7 at the Perfect picture's 2x: 72 by 52 px from x 136,
       y 1720, which holds the frame band's logo slot (left 72, 18 px tall, its top at 864) */
    const REGION = { left: 136, top: 1720, width: 72, height: 52 };
    const require = createRequire(resolve(ROOT, 'package.json'));
    const sharp = require('sharp') as (
      b: Buffer,
      o?: { density: number },
    ) => {
      extract(r: typeof REGION): { greyscale(): { raw(): { toBuffer(): Promise<Buffer> } } };
      greyscale(): { raw(): { toBuffer(): Promise<Buffer> } };
    };
    /* ink: a pixel darker than the paper by more than a quarter */
    const maskOf = (raw: Buffer): boolean[] => [...raw].map((v) => v < 192);
    const markAt = (box: { w: number }, viewBox: string, body: string): string =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${REGION.width}" height="${REGION.height}"><rect width="100%" height="100%" fill="#ffffff"/><svg x="8" y="8" width="${box.w}" height="36" viewBox="${viewBox}" fill="#8a8f98">${body}</svg></svg>`;
    const drawn = async (svg: string): Promise<boolean[]> =>
      maskOf(await sharp(Buffer.from(svg), { density: 72 }).greyscale().raw().toBuffer());
    const iou = (a: boolean[], b: boolean[]): number => {
      let both = 0;
      let either = 0;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] && b[i]) both += 1;
        if (a[i] || b[i]) either += 1;
      }
      return either === 0 ? 0 : both / either;
    };
    /* the Turboslide mark as the kit's picture logo, 26 by 18; the GT monogram as the theme's
       wordmark, 28 by 18 (packages/render stage.ts) */
    const turboslide = await drawn(markAt({ w: 52 }, MARK_VIEWBOX, `<path d="${MARK_PATH}"/>`));
    const gt = await drawn(markAt({ w: 56 }, SPRITE['gt-mark'].viewBox, SPRITE['gt-mark'].body));
    const page = await freshPage(browser);
    await openHome(page);
    await bandReady(page, 'export');
    const perfectPath = HOME_ASSETS.find(
      (a) => a.role === 'export-perfect' && a.appearance === 'light',
    )!.path;
    const perfect = Buffer.from(await (await page.request.get(perfectPath)).body());
    const corner = maskOf(await sharp(perfect).extract(REGION).greyscale().raw().toBuffer());
    const readings = { turboslide: iou(corner, turboslide), gt: iou(corner, gt) };
    test.info().annotations.push({
      type: 'reading',
      description: `the Perfect picture's logo corner against the Turboslide mark ${readings.turboslide.toFixed(2)}, against the GT monogram ${readings.gt.toFixed(2)}`,
    });
    expect(readings.turboslide, 'the Perfect picture draws the Turboslide mark').toBeGreaterThan(
      0.6,
    );
    expect(readings.gt, 'and not the GT monogram').toBeLessThan(readings.turboslide);
    /* the Editable text side draws its logo picture over the paper plate the file puts behind it */
    await band(page).locator('[data-seam]').focus();
    await page.keyboard.press('Home');
    const logo = band(page).locator('.ts-home-ed-pic.ts-only-light[alt=""]').first();
    await expect(logo).toBeVisible();
    /* the stack at the logo's centre, top first: the logo above every paper plate */
    const stack = await logo.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return document
        .elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        .map((x) => (x === el ? 'logo' : x.classList.contains('ts-home-ed-fill') ? 'plate' : ''))
        .filter((x) => x !== '');
    });
    expect(stack[0], 'the Editable text side draws its footer logo over its plate').toBe('logo');
    await page.context().close();
  });
}
