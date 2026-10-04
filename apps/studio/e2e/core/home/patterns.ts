import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { HOME_ASSETS } from '../../../src/components/home/assets';
import { MOTION_KEY } from '../../../src/components/home/boot';
import { extraHTTPHeaders, title } from '../lib';
import { rowsForDriver } from '../matrix';
import { bandReady } from './objects';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.13, 3.4 P-T, 6.7; the second pass). V4's,
// V4#19: the patterns band. The right slide's picture is read through the network and its bytes
// hashed against `assets.json` (the build's record of the exporter's captured frame, whose pixels'
// hash `build-home-assets.ts --check` reads); the left slide's shader is read from its canvas in
// the frame it draws, every WebGL draw is counted by an init script, and the shader chunk is the
// script whose source carries the dithering fragment, read off the page's requests.

export const ROWS: readonly string[] = ['home.patterns.pair'];

const entered = (id: string): boolean =>
  rowsForDriver('core/home.spec.ts').some((row) => row.id === id);

/** Counts the page's WebGL draws, before any page script runs. */
const DRAWS = String(() => {
  (window as unknown as { __draws: number }).__draws = 0;
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const draw = proto.drawArrays;
    proto.drawArrays = function (this: WebGLRenderingContext, ...args: Parameters<typeof draw>) {
      (window as unknown as { __draws: number }).__draws += 1;
      return draw.apply(this, args);
    } as typeof draw;
  }
});

type Opened = {
  context: BrowserContext;
  page: Page;
  scripts: { url: string; at: number; gzip: number }[];
};

async function open(
  browser: Browser,
  options: { reduce?: boolean; paused?: boolean; width?: number } = {},
): Promise<Opened> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: options.width ?? 1440, height: 900 },
    reducedMotion: options.reduce === true ? 'reduce' : 'no-preference',
  });
  await context.addInitScript(
    ([paused, key]) => {
      try {
        localStorage.setItem('gt-theme', 'light');
        if (paused === true) localStorage.setItem(key as string, 'paused');
      } catch {
        /* a context without storage */
      }
    },
    [options.paused === true, MOTION_KEY] as const,
  );
  await context.addInitScript(`(${DRAWS})()`);
  const page = await context.newPage();
  const scripts: { url: string; at: number; gzip: number }[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!/\.(m?js|tsx?)(\?|$)/.test(url)) return;
    void response
      .body()
      .then((body) => {
        /* the dithering fragment's own matrix: the one script that carries the shader */
        if (/bayer8x8\[64\]/.test(body.toString('utf8')))
          scripts.push({ url, at: Date.now(), gzip: gzipSync(body).length });
      })
      .catch(() => undefined);
  });
  const response = await page.goto('/home');
  expect(response?.status()).toBe(200);
  await page.waitForSelector('main#top[data-live="ready"]', { timeout: 60_000 });
  return { context, page, scripts };
}

const band = (page: Page) => page.locator('[data-band="patterns"]');

/** The left canvas's colours in the frame the shader draws, as `#rrggbb` with their counts. */
function shaderColours(page: Page): Promise<Record<string, number>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve) => {
        requestAnimationFrame(() => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            '[data-pattern="moving"] [data-field="pattern"] > canvas',
          );
          if (canvas === null || canvas.width === 0) return resolve({});
          const copy = document.createElement('canvas');
          copy.width = 320;
          copy.height = 180;
          const ctx = copy.getContext('2d', { willReadFrequently: true })!;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
          const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
          const out: Record<string, number> = {};
          for (let i = 0; i < data.length; i += 4) {
            const hex = `#${[data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
            out[hex] = (out[hex] ?? 0) + 1;
          }
          resolve(out);
        });
      }),
  );
}

/** The slide's paper and ink on the left, as the page computes them, in `#rrggbb`. */
function slideColours(page: Page): Promise<{ paper: string; ink: string }> {
  return page.evaluate(() => {
    const box = document.querySelector('[data-pattern="moving"] [data-field="pattern"]')!;
    const style = getComputedStyle(box);
    const hex = (value: string): string => {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      const x = c.getContext('2d')!;
      x.fillStyle = value;
      x.fillRect(0, 0, 1, 1);
      const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
      return `#${[r!, g!, b!].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    };
    return {
      paper: hex(
        style.getPropertyValue('--paper').trim() || style.getPropertyValue('--pt-paper').trim(),
      ),
      ink: hex(style.getPropertyValue('--ink').trim() || style.getPropertyValue('--pt-ink').trim()),
    };
  });
}

const draws = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __draws: number }).__draws);

/** The two colours a frame holds, each within a step of rounding. */
function onlyColours(found: Record<string, number>, want: string[]): boolean {
  const near = (a: string, b: string): boolean =>
    [1, 3, 5].every(
      (i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 2,
    );
  return Object.keys(found).every((hex) => want.some((w) => near(hex, w)));
}

export function rows(): void {
  if (!entered('home.patterns.pair')) return;
  test(title('home.patterns.pair'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page, scripts } = await open(browser);
    try {
      /* nothing of the band before it nears: no still frame, no shader chunk */
      const before = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((name) => /pattern-still/.test(name)),
      );
      expect(before, 'no still frame requested in the first screen').toEqual([]);
      expect(scripts, 'no shader chunk in the first screen').toEqual([]);
      await band(page).scrollIntoViewIfNeeded();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-pattern="moving"] [data-field="pattern"]')
            ?.hasAttribute('data-pattern-live') === true,
        undefined,
        { timeout: 60_000 },
      );
      expect(scripts.length, 'one shader chunk').toBe(1);
      /* its size reads on a build (a dev server serves modules one by one) */
      if (/\/assets\//.test(scripts[0]!.url)) {
        test.info().annotations.push({
          type: 'reading',
          description: `the shader chunk: ${scripts[0]!.gzip} B gzip`,
        });
        expect(scripts[0]!.gzip).toBeLessThanOrEqual(8 * 1024);
      }
      /* the right slide's picture is the exporter's captured frame of the shown appearance */
      const url = await page.evaluate(() => {
        const layer = document.querySelector(
          '[data-pattern="still"] [data-field="pattern"] > .ts-field-still',
        )!;
        return /url\("?(.*?)"?\)/.exec(getComputedStyle(layer).backgroundImage)?.[1] ?? '';
      });
      const record = HOME_ASSETS.find(
        (asset) => asset.role === 'pattern-still' && asset.appearance === 'light',
      );
      expect(record, 'assets.json records the light still frame').toBeDefined();
      expect(new URL(url).pathname).toBe(record!.path);
      const bytes = await (await page.request.get(url)).body();
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(record!.sha256);
      expect(record!.width).toBe(3200);
      expect(record!.height).toBe(1800);
      /* the left draws the shader in the slide's ink and paper only, and moves */
      const colours = await slideColours(page);
      const frame = await shaderColours(page);
      expect(Object.keys(frame).length, 'the shader drew').toBeGreaterThan(0);
      expect(onlyColours(frame, [colours.paper, colours.ink]), JSON.stringify(frame)).toBe(true);
      const d0 = await draws(page);
      await page.waitForTimeout(1_000);
      expect((await draws(page)) - d0, 'frames in view').toBeGreaterThan(5);
      /* off screen no frame is drawn */
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      const d1 = await draws(page);
      await page.waitForTimeout(2_000);
      expect((await draws(page)) - d1, 'no frame off screen').toBe(0);
      /* a kit recolours the left side (2.8; the kits band's Globex) */
      const globex = page.locator('[data-kit="globex"]');
      if ((await globex.count()) > 0) {
        /* the swatch acts once the kits band's chunk has filled its box: on a deployment the
           chunk arrives after the scroll that brings the band near, later than the press would */
        await bandReady(page, 'kits');
        await globex.first().click();
        await band(page).scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        const kit = await slideColours(page);
        expect(kit.paper).toBe('#0a1b38');
        const recoloured = await shaderColours(page);
        expect(onlyColours(recoloured, [kit.paper, kit.ink]), JSON.stringify(recoloured)).toBe(
          true,
        );
        await page.locator('[data-kit="gt"]').first().click();
      }
    } finally {
      await context.close();
    }
    /* never under reduced motion or with Pause Motion stored: both sides the still frame */
    for (const options of [{ reduce: true }, { paused: true }] as const) {
      const other = await open(browser, options);
      try {
        await band(other.page).scrollIntoViewIfNeeded();
        await other.page.waitForTimeout(3_000);
        expect(other.scripts, `no shader chunk ${JSON.stringify(options)}`).toEqual([]);
        expect(await draws(other.page)).toBe(0);
        const both = await other.page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-band="patterns"] [data-field="pattern"] > .ts-field-still',
            ),
          ].map((layer) => getComputedStyle(layer).backgroundImage),
        );
        expect(both.length).toBe(2);
        expect(both[0]).toBe(both[1]);
        expect(both[0]).toMatch(/pattern-still/);
      } finally {
        await other.context.close();
      }
    }
  });
}
