import { spawnSync } from 'node:child_process';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { FACTS_DATA } from '../../../src/components/home/facts-data';
import { extraHTTPHeaders, title } from '../lib';

// A lane module of core/home.spec.ts (docs/LANDING.md 6.1, 6.7; build/integrator.md "Landing,
// day 0" 4.9 and 5.1). L1's, push 1: the still page. The bands in order, the markup as the end
// state, the h1's type and the h2s, the parts table, the byte budgets, the shared costs and the LCP
// (the two measure rows), the skip link and the contrast. Every observation is through the page and
// the network; nothing is read from disk but the facts module the page itself is built from.
//
// The byte budgets are a build's (LANDING.md 4.4: "Bytes and counts are read on the preview (as
// served, brotli)"): on a Vite dev server the route chunk, the page's CSS files and brotli do not
// exist as shipped, so those lines read "not read: a dev server" and the row fails there; it is
// read on the node-server output of scripts/check.mjs or on the preview. Times are read at a one
// minute load under 20 (measure rows); above it the reading is recorded "not read: load".

export const ROWS: readonly string[] = [
  'home.page.order',
  'home.page.markup-final',
  'home.hero.type',
  'home.parts.table',
  'home.budget.bytes-first',
  'home.budget.bytes-page',
  'home.budget.shared',
  'home.budget.lcp',
  'home.a11y.skip-and-contrast',
];

const DESKTOP = { width: 1440, height: 900 } as const;
const MIDDLE = { width: 1280, height: 800 } as const;
const PHONE = { width: 390, height: 844 } as const;
const BAND_ORDER = [
  'nav',
  'hero',
  'field',
  'agents',
  'tailor',
  'canvas',
  'present',
  'export',
  'parts',
  'close',
  'footer',
] as const;
const H2S = [
  'Agents run the same actions',
  'One customer on every slide',
  'Everything on a slide moves',
  'Present from the browser',
  'Export to PDF and PowerPoint',
  'Turboslide today',
  'A new presentation needs no account',
];
const MEASURE_LOAD_LINE = 20;

type Theme = 'light' | 'dark';

/** A fresh context at a size in an appearance (the product's `gt-theme` key), script on or off. */
async function homeContext(
  browser: Browser,
  size: { width: number; height: number },
  theme: Theme,
  options: { js?: boolean; scale?: number } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: size,
    deviceScaleFactor: options.scale ?? 1,
    javaScriptEnabled: options.js ?? true,
    colorScheme: theme,
  });
  await context.addInitScript((value) => {
    try {
      localStorage.setItem('gt-theme', value);
    } catch {
      /* private mode */
    }
    /* a dev server loads hundreds of modules; the buffer keeps every resource for the budgets */
    performance.setResourceTimingBufferSize(5000);
    const w = window as unknown as { __lcp: { ms: number; element: string } | null };
    w.__lcp = null;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          element?: Element;
          renderTime?: number;
          loadTime?: number;
        })[]) {
          const el = entry.element;
          w.__lcp = {
            ms: Math.round(entry.renderTime || entry.loadTime || entry.startTime),
            element: el
              ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-field') ? `[data-field=${el.getAttribute('data-field')}]` : ''}`
              : '',
          };
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      /* no LCP entries in this browser */
    }
  }, theme);
  const page = await context.newPage();
  return { context, page };
}

async function openHome(page: Page, js = true): Promise<void> {
  const response = await page.goto('/home');
  expect(response?.status(), '/home answers 200').toBe(200);
  if (js) await page.locator('main#top[data-hydrated]').waitFor({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** A native scroll of the whole page by the wheel, slow enough for every band's media to arrive. */
async function scrollThrough(page: Page, step = 500, pause = 250): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  for (let y = 0; y < height - vh + step; y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(pause);
  }
}

/** Waits until every shown picture has decoded and every field's still has arrived. */
async function settledMedia(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>('main img')].filter(
        (img) => img.getBoundingClientRect().width > 0,
      );
      if (imgs.some((img) => !img.complete || img.naturalWidth === 0)) return false;
      const urls = [...document.querySelectorAll<HTMLElement>('main [data-field]')]
        .map(
          (el) =>
            /url\("?([^")]+)"?\)/.exec(getComputedStyle(el).getPropertyValue('--ts-still'))?.[1] ??
            '',
        )
        .filter((u) => u.startsWith('/'));
      const loaded = new Set(
        performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname),
      );
      return urls.every((u) => loaded.has(u));
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(300);
}

/* A cold load of /home in a node process of its own, through playwright-core, which the runner
   does not instrument: the paths of the pictures the page requested by 1.5 s after hydration. */
const COLD_LOAD = `
const { chromium } = await import('playwright-core');
const [width, height, scale] = JSON.parse(process.argv[1]);
const oidc = process.env.VERCEL_OIDC_TOKEN;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale,
  colorScheme: 'light', extraHTTPHeaders: oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {} });
await context.addInitScript(() => { try { localStorage.setItem('gt-theme', 'light'); } catch {} });
const page = await context.newPage();
await page.goto(new URL('/home', process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321').href);
await page.locator('main#top[data-hydrated]').waitFor({ timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);
const pictures = await page.evaluate(() => performance.getEntriesByType('resource')
  .filter((r) => r.initiatorType === 'img' || /\\.(png|jpe?g|webp|avif|gif)(\\?|$)/.test(r.name))
  .map((r) => new URL(r.name).pathname));
await browser.close();
process.stdout.write(JSON.stringify(pictures));
`;

function coldPictures(size: { width: number; height: number }, scale: number): string[] {
  const run = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', COLD_LOAD, JSON.stringify([size.width, size.height, scale])],
    {
      cwd: resolve(import.meta.dirname, '..', '..', '..', '..', '..'),
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  if (run.status !== 0) throw new Error(`the cold load exited ${run.status}: ${run.stderr}`);
  return JSON.parse(run.stdout) as string[];
}

const isDevServer = (page: Page): Promise<boolean> =>
  page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .some((r) => /\/@vite\/client|\/@id\/|\/node_modules\/\.vite\//.test(r.name)),
  );

const brotli = (bytes: Buffer): number =>
  brotliCompressSync(bytes, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

function measureLoad(): { load: number; read: boolean } {
  const load = Math.round((loadavg()[0] ?? 0) * 10) / 10;
  return { load, read: load < MEASURE_LOAD_LINE };
}

export function rows(): void {
  test(title('home.page.order'), async ({ browser }) => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const notes: string[] = [];
    for (const size of [DESKTOP, PHONE])
      for (const theme of ['light', 'dark'] as const) {
        const { context, page } = await homeContext(browser, size, theme);
        try {
          await openHome(page);
          const facts = await page.evaluate(() => {
            const main = document.querySelector('main#top') as HTMLElement;
            const parts = [...main.children]
              .filter(
                (el) =>
                  el.tagName === 'HEADER' ||
                  el.tagName === 'FOOTER' ||
                  el.hasAttribute('data-band'),
              )
              .map((el) => ({
                band:
                  el.tagName === 'HEADER'
                    ? 'nav'
                    : el.tagName === 'FOOTER'
                      ? 'footer'
                      : (el.getAttribute('data-band') ?? ''),
                top: Math.round(el.getBoundingClientRect().top + scrollY),
                h2: [...el.querySelectorAll('h2')].map((h) => (h.textContent ?? '').trim()),
                tag: el.tagName.toLowerCase(),
                label: el.getAttribute('aria-labelledby'),
              }));
            const h1 = [...document.querySelectorAll('h1')].map((h) =>
              (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
            );
            const heroSheet = document.querySelector('[data-band="hero"] [data-sheet="hero"]');
            return { parts, h1, heroSheet: heroSheet !== null };
          });
          const label = `${size.width} ${theme}`;
          const order = facts.parts.map((p) => p.band);
          notes.push(`${label}: ${order.join(' > ')}; h1 ${facts.h1.length}`);
          if (JSON.stringify(order) !== JSON.stringify(BAND_ORDER))
            failures.push(`${label}: the page reads ${order.join(', ')}`);
          for (let i = 1; i < facts.parts.length; i += 1)
            if ((facts.parts[i]?.top ?? 0) < (facts.parts[i - 1]?.top ?? 0))
              failures.push(
                `${label}: ${facts.parts[i]?.band} draws above ${facts.parts[i - 1]?.band}`,
              );
          if (facts.h1.length !== 1) failures.push(`${label}: ${facts.h1.length} h1 elements`);
          if (!facts.heroSheet) failures.push(`${label}: no hero sheet`);
          const sections = facts.parts.filter(
            (p) => !['nav', 'hero', 'field', 'footer'].includes(p.band),
          );
          sections.forEach((s, i) => {
            if (s.tag !== 'section') failures.push(`${label}: ${s.band} is a ${s.tag}`);
            if (s.h2.length !== 1) failures.push(`${label}: ${s.band} holds ${s.h2.length} h2`);
            if (s.h2[0] !== H2S[i]) failures.push(`${label}: ${s.band} reads "${s.h2[0]}"`);
            if (s.label !== `ts-h-${s.band}`)
              failures.push(`${label}: ${s.band} is labelled by ${s.label}`);
          });
        } finally {
          await context.close();
        }
      }
    test.info().annotations.push({ type: 'order', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.page.markup-final'), async ({ browser }) => {
    test.setTimeout(400_000);
    /* each band shot alone, scrolled into view and settled, in a page without script and in the
       hydrated page, then compared pixel by pixel in a page of their own; push 1 has no one shot
       motion, so the hydrated page's resting state is its paint */
    const failures: string[] = [];
    const notes: string[] = [];
    const bands = ['nav', ...BAND_ORDER.filter((b) => b !== 'nav' && b !== 'footer'), 'footer'];
    const selectorOf = (band: string): string =>
      band === 'nav'
        ? 'main > header'
        : band === 'footer'
          ? 'main > footer'
          : `main > [data-band="${band}"]`;
    for (const size of [DESKTOP, PHONE]) {
      const shots: Record<string, Buffer[]> = {};
      for (const js of [false, true]) {
        const { context, page } = await homeContext(browser, size, 'light', { js });
        try {
          await openHome(page, js);
          await scrollThrough(page);
          for (const band of bands) {
            const el = page.locator(selectorOf(band)).first();
            await el.scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
            await settledMedia(page);
            /* no band shows an empty frame: every field box has its still, every picture its pixels */
            const empty = await el.evaluate((root) => {
              const out: string[] = [];
              for (const f of root.querySelectorAll<HTMLElement>('[data-field]')) {
                const still = f.querySelector<HTMLElement>('.ts-field-still');
                const cs = still ? getComputedStyle(still) : null;
                const mask = cs ? cs.maskImage || cs.webkitMaskImage : 'none';
                if (!/url\(/.test(mask)) out.push(`${f.getAttribute('data-field')} has no still`);
              }
              for (const img of root.querySelectorAll<HTMLImageElement>('img'))
                if (img.getBoundingClientRect().width > 0 && img.naturalWidth === 0)
                  out.push(`${img.getAttribute('src')} is empty`);
              for (const sheet of root.querySelectorAll('[data-sheet]'))
                if (sheet.querySelector('[data-home-slides]') === null)
                  out.push(`${sheet.getAttribute('data-sheet')} holds no slide`);
              return out;
            });
            for (const e of empty) failures.push(`${size.width} ${band} script ${js}: ${e}`);
            (shots[band] ??= []).push(await el.screenshot({ animations: 'disabled' }));
          }
        } finally {
          await context.close();
        }
      }
      const { context, page } = await homeContext(browser, { width: 400, height: 300 }, 'light');
      try {
        await page.goto('about:blank');
        let differ = 0;
        let total = 0;
        const per: string[] = [];
        for (const band of bands) {
          const pair = shots[band] ?? [];
          const diff = await page.evaluate(
            async ([a, b]) => {
              const load = async (b64: string) =>
                createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
              const [x, y] = await Promise.all([load(a as string), load(b as string)]);
              const w = Math.max(x.width, y.width);
              const h = Math.max(x.height, y.height);
              const read = (bmp: ImageBitmap) => {
                const c = new OffscreenCanvas(w, h);
                const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
                ctx.fillStyle = '#ff00ff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(bmp, 0, 0);
                return ctx.getImageData(0, 0, w, h).data;
              };
              const p = read(x);
              const q = read(y);
              let n = 0;
              for (let i = 0; i < p.length; i += 4)
                if (
                  Math.abs((p[i] ?? 0) - (q[i] ?? 0)) +
                    Math.abs((p[i + 1] ?? 0) - (q[i + 1] ?? 0)) +
                    Math.abs((p[i + 2] ?? 0) - (q[i + 2] ?? 0)) >
                  24
                )
                  n += 1;
              return { n, total: w * h };
            },
            [pair[0]!.toString('base64'), pair[1]!.toString('base64')],
          );
          differ += diff.n;
          total += diff.total;
          if (diff.n > 0) per.push(`${band} ${diff.n}`);
        }
        const share = (differ / total) * 100;
        notes.push(
          `${size.width}: ${differ} of ${total} pixels differ (${share.toFixed(3)} percent)${per.length > 0 ? `: ${per.join(', ')}` : ''}`,
        );
        if (share > 0.5)
          failures.push(
            `${size.width}: ${share.toFixed(3)} percent of pixels differ (${per.join(', ')})`,
          );
      } finally {
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'markup', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.hero.type'), async ({ browser }) => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const notes: string[] = [];
    for (const size of [DESKTOP, MIDDLE, PHONE])
      for (const theme of ['light', 'dark'] as const) {
        const { context, page } = await homeContext(browser, size, theme);
        try {
          await openHome(page);
          const narrow = size.width < 720;
          const facts = await page.evaluate(() => {
            const h1 = document.querySelector<HTMLElement>('h1#ts-product-h1')!;
            const sheetBox = document.querySelector<HTMLElement>('[data-sheet="hero"]')!;
            const sheetRect = sheetBox.getBoundingClientRect();
            const k = sheetRect.width / 1600;
            const cs = getComputedStyle(h1);
            const lines = [...h1.querySelectorAll('.ts-home-line')].map((l) => ({
              text: (l.textContent ?? '').trim(),
              top: Math.round(l.getBoundingClientRect().top),
            }));
            const h1Rect = h1.getBoundingClientRect();
            const h2 = [...document.querySelectorAll<HTMLElement>('main h2')].map((h) =>
              parseFloat(getComputedStyle(h).fontSize),
            );
            /* the visible text's weights */
            const weights = new Set<string>();
            for (const el of document.querySelectorAll<HTMLElement>('main *')) {
              const own = [...el.childNodes].some(
                (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
              );
              if (!own) continue;
              const r = el.getBoundingClientRect();
              if (r.width === 0 || getComputedStyle(el).visibility === 'hidden') continue;
              weights.add(getComputedStyle(el).fontWeight);
            }
            /* every full width sheet: the page rail and the sheet's own rail on each side, no frame */
            const rails = document.querySelector<HTMLElement>('.ts-rails')!.getBoundingClientRect();
            const sides = [...document.querySelectorAll<HTMLElement>('main [data-sheet]')]
              .filter((el) => !el.classList.contains('is-thumb'))
              .map((el) => {
                const r = el.getBoundingClientRect();
                const sheet = el.querySelector<HTMLElement>('.ts-sheet')!;
                const frame = el.querySelector<HTMLElement>('.frame');
                const before = frame ? getComputedStyle(frame, '::before') : null;
                const after = frame ? getComputedStyle(frame, '::after') : null;
                const scale = r.width / 1600;
                return {
                  sheet: el.getAttribute('data-sheet') ?? '',
                  full: r.width >= 1000,
                  border: parseFloat(getComputedStyle(sheet).borderTopWidth),
                  shadow: getComputedStyle(sheet).boxShadow,
                  leftRail: before ? Math.round(r.left + parseFloat(before.left) * scale) : null,
                  rightRail: after ? Math.round(r.right - parseFloat(after.right) * scale) : null,
                  railColor: before?.backgroundColor ?? '',
                };
              });
            return {
              fontPx: parseFloat(cs.fontSize) * (h1.closest('[data-home-slides]') ? k : 1),
              weight: cs.fontWeight,
              tracking: parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize),
              lines,
              h1Bottom: h1Rect.bottom,
              sheetTop: sheetRect.top,
              sheetWidth: sheetRect.width,
              h2,
              weights: [...weights],
              railLeft: Math.round(rails.left),
              railRight: Math.round(rails.right),
              sides,
            };
          });
          const label = `${size.width} ${theme}`;
          notes.push(
            `${label}: h1 ${facts.fontPx.toFixed(2)} px at weight ${facts.weight}, tracking ${facts.tracking.toFixed(4)} em, lines ${facts.lines.map((l) => l.text).join(' / ')}, h2 ${[...new Set(facts.h2)].join(', ')} px, weights ${facts.weights.join(', ')}, sheets ${facts.sides.map((s) => `${s.sheet} ${s.leftRail}/${s.rightRail} frame ${s.border}`).join(', ')}`,
          );
          const wantPx = narrow ? 40 : 96 * (facts.sheetWidth / 1024);
          if (Math.abs(facts.fontPx - wantPx) > 1)
            failures.push(
              `${label}: the h1 draws at ${facts.fontPx.toFixed(2)} px, not ${wantPx.toFixed(1)}`,
            );
          if (!narrow && Math.abs(facts.sheetWidth - 1024) > 1)
            failures.push(`${label}: the hero sheet is ${facts.sheetWidth} px`);
          if (facts.weight !== '500') failures.push(`${label}: the h1 weighs ${facts.weight}`);
          const wantTrack = narrow ? -0.032 : -0.042;
          if (Math.abs(facts.tracking - wantTrack) > 0.0015)
            failures.push(`${label}: the h1 tracks ${facts.tracking.toFixed(4)} em`);
          if (
            JSON.stringify(facts.lines.map((l) => l.text)) !==
            JSON.stringify(['Build the pitch,', 'present it and', 'send the link'])
          )
            failures.push(
              `${label}: the h1's lines read ${facts.lines.map((l) => l.text).join(' / ')}`,
            );
          if (new Set(facts.lines.map((l) => l.top)).size !== 3)
            failures.push(`${label}: the h1 does not draw three lines`);
          if (narrow && facts.h1Bottom > facts.sheetTop + 0.5)
            failures.push(
              `${label}: the h1 ends at ${facts.h1Bottom}, below the sheet's top ${facts.sheetTop}`,
            );
          /* clamp(30px, 3.9vw, 54px): 54 px at 1440, 30 at 390 */
          const h2Want = Math.min(54, Math.max(30, 0.039 * size.width));
          for (const px of facts.h2)
            if (Math.abs(px - h2Want) > 0.5)
              failures.push(`${label}: an h2 at ${px} px, not ${h2Want}`);
          for (const w of facts.weights)
            if (w !== '400' && w !== '500') failures.push(`${label}: visible text at weight ${w}`);
          for (const s of facts.sides) {
            if (s.border !== 0 || (s.shadow !== 'none' && s.shadow !== ''))
              failures.push(`${label}: the ${s.sheet} sheet draws a frame`);
            if (s.railColor === '' || s.railColor === 'rgba(0, 0, 0, 0)')
              failures.push(`${label}: the ${s.sheet} sheet draws no rail of its own`);
            if (s.full && !narrow) {
              /* two lines each side: the page rail and the sheet's rail, apart */
              if (s.leftRail === null || s.leftRail - facts.railLeft < 20)
                failures.push(
                  `${label}: the ${s.sheet} sheet's left rail ${s.leftRail} beside the page rail ${facts.railLeft}`,
                );
              if (s.rightRail === null || facts.railRight - s.rightRail < 20)
                failures.push(
                  `${label}: the ${s.sheet} sheet's right rail ${s.rightRail} beside the page rail ${facts.railRight}`,
                );
            }
          }
        } finally {
          await context.close();
        }
      }
    test.info().annotations.push({ type: 'type', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.parts.table'), async ({ browser }) => {
    const { context, page } = await homeContext(browser, DESKTOP, 'light');
    try {
      await openHome(page);
      const table = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-band="parts"] [data-part]')].map(
          (row) => {
            const cs = getComputedStyle(row);
            /* the Heroicon is a mask of icons.generated.css over the text's colour (SectionIcon) */
            const icon = row.querySelector<HTMLElement>('.ts-part-key .ts-icon');
            const ics = icon ? getComputedStyle(icon) : null;
            const masked = ics !== null && /url\(/.test(ics.maskImage || ics.webkitMaskImage);
            return {
              id: row.getAttribute('data-part') ?? '',
              icon: icon?.getAttribute('data-icon') ?? '',
              fill:
                ics !== null && masked && ics.backgroundColor === ics.color ? 'currentColor' : '',
              key: (row.querySelector('.ts-part-key')?.textContent ?? '').trim(),
              where: (row.querySelector('.ts-part-where')?.textContent ?? '').trim(),
              figure: (row.querySelector('.ts-part-figure')?.textContent ?? '').trim(),
              rule: `${cs.borderBottomWidth} ${cs.borderBottomStyle}`,
              box: `${cs.borderTopWidth} ${cs.borderLeftWidth} ${cs.borderRightWidth}`,
            };
          },
        ),
      );
      test.info().annotations.push({
        type: 'parts',
        description: table.map((r) => `${r.icon} ${r.key} | ${r.where} | ${r.figure}`).join('; '),
      });
      expect(table.map((r) => r.key)).toEqual([
        'Menus',
        'Layouts',
        'PowerPoint shapes',
        'Animated patterns',
        'CLI commands',
        'MCP tools',
        'HTTP paths',
        'License',
      ]);
      expect(table.map((r) => r.icon)).toEqual([
        'bars-3',
        'squares-2x2',
        'cube',
        'paint-brush',
        'command-line',
        'server',
        'globe-alt',
        'scale',
      ]);
      for (const r of table) expect(r.fill, r.key).toBe('currentColor');
      expect(table.map((r) => r.where)).toEqual([
        'File to Help',
        'Slide > Apply layout',
        'Insert > Shape',
        'Insert > Animated pattern',
        'The CLI',
        'The MCP server',
        'The HTTP API',
        'GitHub',
      ]);
      expect(table.map((r) => r.figure)).toEqual([
        String(FACTS_DATA.menus),
        String(FACTS_DATA.layouts),
        String(FACTS_DATA.shapes),
        String(FACTS_DATA.materials),
        String(FACTS_DATA.cliCommands),
        String(FACTS_DATA.mcpTools),
        String(FACTS_DATA.httpPaths),
        FACTS_DATA.licence,
      ]);
      /* ruled rows, never boxed cards */
      for (const r of table) {
        expect(r.rule, r.key).toBe('1px solid');
        expect(r.box, r.key).toBe('0px 0px 0px');
      }
      const github = page.locator('[data-band="parts"] a', { hasText: 'GitHub' });
      await expect(github).toHaveAttribute('href', 'https://github.com/Kevin-Liu-01/Turboslide');
      await expect(github).toHaveAttribute('target', '_blank');
    } finally {
      await context.close();
    }
  });

  test(title('home.budget.bytes-first'), async ({ browser, request }) => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const notes: string[] = [];
    for (const [size, scale] of [
      [DESKTOP, 1],
      [DESKTOP, 2],
      [PHONE, 1],
    ] as const) {
      const { context, page } = await homeContext(browser, size, 'light', { scale });
      try {
        await openHome(page);
        await page.waitForTimeout(1500);
        const facts = await page.evaluate(() => {
          const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          return {
            pictures: resources
              .filter(
                (r) =>
                  r.initiatorType === 'img' ||
                  /\.(png|jpe?g|webp|avif|gif)(\?|$)/.test(r.name) ||
                  /\/home\/[^/]+\.(webp|jpg|png)/.test(r.name),
              )
              .map((r) => new URL(r.name).pathname),
            scripts: resources
              .filter((r) => r.initiatorType === 'script' || /\.m?js(\?|$)/.test(r.name))
              .map((r) => ({
                url: r.name,
                decoded: r.decodedBodySize,
                transfer: r.transferSize,
              })),
            styles: resources
              .filter((r) => /\.css(\?|$)/.test(r.name))
              .map((r) => ({
                url: r.name,
                decoded: r.decodedBodySize,
                transfer: r.transferSize,
              })),
          };
        });
        const label = `${size.width} x${scale}`;
        /* the pictures before the first scroll, read in a browser the runner does not trace: its
           trace (trace: 'retain-on-failure') snapshots the page by reading every element's
           computed style, which resolves the canvas band's mask under content-visibility: auto
           and requests its still (read on the preview 2026-10-03: with the trace, the still at
           395 to 459 ms from the CSS; in a process of its own, none) */
        const cold = coldPictures(size, scale);
        if (cold.length > 0)
          failures.push(
            `${label}: ${cold.length} pictures before the first scroll (${cold.join(', ')})`,
          );
        if (facts.pictures.length > cold.length)
          notes.push(`${label}: under the runner's trace ${facts.pictures.join(', ')}`);
        /* the document: decoded and brotli */
        const doc = await request.get('/home', {
          headers: { ...extraHTTPHeaders, 'accept-encoding': 'identity' },
        });
        const docBytes = await doc.body();
        const docBr = brotli(docBytes);
        notes.push(
          `${label}: document ${docBytes.length} B decoded, ${docBr} B brotli; pictures before the first scroll ${cold.length}`,
        );
        if (docBytes.length > 80_000)
          failures.push(`${label}: the document is ${docBytes.length} B decoded (line 80000)`);
        if (docBr > 20_000)
          failures.push(`${label}: the document is ${docBr} B brotli (line 20000)`);
        if (await isDevServer(page)) {
          test.info().annotations.push({
            type: 'not read: a dev server',
            description: `${label}: the route chunk, the page's CSS files and the first screen's own bytes exist as shipped on a build only`,
          });
          failures.push(
            `${label}: the route chunk and the page's CSS are read on a build (the node-server output or the preview)`,
          );
          continue;
        }
        /* the route chunk: home-*.js, without the slides' sentinel */
        const route = facts.scripts.filter((s) => /\/home-[\w-]+\.js(\?|$)/.test(s.url));
        let routeBr = 0;
        for (const s of route) {
          const body = await (await request.get(s.url, { headers: extraHTTPHeaders })).body();
          const br = brotli(body);
          routeBr += br;
          notes.push(
            `${label}: route chunk ${new URL(s.url).pathname} ${body.length} B decoded, ${br} B brotli`,
          );
          if (body.length > 70_000)
            failures.push(`${label}: the route chunk is ${body.length} B decoded`);
          if (br > 22_000) failures.push(`${label}: the route chunk is ${br} B brotli`);
          if (body.toString('utf8').includes('data-home-slides'))
            failures.push(`${label}: the route chunk carries data-home-slides`);
        }
        if (route.length === 0) failures.push(`${label}: no route chunk found`);
        /* the page's own CSS (home.css, grammar.css, selection.css, print.css as built) */
        let cssBr = 0;
        for (const s of facts.styles) {
          const body = await (await request.get(s.url, { headers: extraHTTPHeaders })).body();
          const text = body.toString('utf8');
          if (!/\.ts-home-sheet|\.ts-band|\.ts-home-sel/.test(text)) continue;
          cssBr += brotli(body);
        }
        notes.push(
          `${label}: the page's CSS ${cssBr} B brotli; own bytes ${docBr + cssBr + routeBr} B`,
        );
        if (cssBr > 14_000) failures.push(`${label}: the page's CSS is ${cssBr} B brotli`);
        if (docBr + cssBr + routeBr > 70_000)
          failures.push(`${label}: the first screen's own bytes are ${docBr + cssBr + routeBr} B`);
      } finally {
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'bytes', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.budget.bytes-page'), async ({ browser, request }) => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const notes: string[] = [];
    for (const scale of [1, 2]) {
      const { context, page } = await homeContext(browser, DESKTOP, 'light', { scale });
      try {
        await openHome(page);
        await page.waitForTimeout(1000);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < height; y += 640) {
          await page.mouse.wheel(0, 640);
          await page.waitForTimeout(200);
        }
        await page.waitForTimeout(1500);
        const facts = await page.evaluate(() => {
          const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          const nav = performance.getEntriesByType('navigation')[0] as
            PerformanceNavigationTiming | undefined;
          const loadEnd = nav?.loadEventEnd ?? 0;
          const home = resources.filter((r) => new URL(r.name).pathname.startsWith('/home/'));
          return {
            home: home.map((r) => ({
              path: new URL(r.name).pathname,
              bytes: r.encodedBodySize || r.transferSize || r.decodedBodySize,
            })),
            scripts: resources
              .filter((r) => r.initiatorType === 'script' || /\.m?js(\?|$)/.test(r.name))
              .map((r) => ({
                url: r.name,
                decoded: r.decodedBodySize,
                /* requested after the load event: the live module's chunk is among these */
                late: loadEnd > 0 && r.startTime >= loadEnd,
              })),
          };
        });
        const label = `1440 x${scale}`;
        const pictures = facts.home.filter((r) => /\.(webp|jpg|png)$/.test(r.path));
        const total = pictures.reduce((n, r) => n + r.bytes, 0);
        notes.push(
          `${label}: ${pictures.length} pictures, ${total} B (${pictures.map((p) => `${p.path} ${p.bytes}`).join(', ')})`,
        );
        if (total > 160_000) failures.push(`${label}: the pictures weigh ${total} B (line 160000)`);
        const paths = facts.home.map((r) => r.path);
        const twice = paths.filter((p, i) => paths.indexOf(p) !== i);
        if (twice.length > 0) failures.push(`${label}: requested twice: ${twice.join(', ')}`);
        for (const p of paths) {
          if (p.endsWith('.pdf')) failures.push(`${label}: a PDF was requested (${p})`);
          if (/\/home\/field-still-/.test(p))
            failures.push(`${label}: slide 7's still was requested (${p})`);
        }
        if (await isDevServer(page)) {
          test.info().annotations.push({
            type: 'not read: a dev server',
            description: `${label}: the page's own script and its bytes over the wire are read on a build only`,
          });
          failures.push(
            `${label}: the page's own script is read on a build (the node-server output or the preview)`,
          );
          continue;
        }
        /* the page's own script: the route chunk and the live module's chunk, which the build
           names after live/index.ts and which is known by its overlay's class */
        const own: { url: string; decoded: number }[] = [];
        let ownBr = 0;
        for (const s of facts.scripts) {
          const route = /\/home(-live)?-[\w-]+\.js(\?|$)/.test(s.url);
          if (!route && !s.late) continue;
          const body = await (await request.get(s.url, { headers: extraHTTPHeaders })).body();
          if (!route && !body.includes('ts-home-sel-layer')) continue;
          own.push(s);
          ownBr += brotli(body);
        }
        const ownDecoded = own.reduce((n, s) => n + s.decoded, 0);
        const doc = await (await request.get('/home', { headers: extraHTTPHeaders })).body();
        const wire = brotli(doc) + ownBr + total;
        notes.push(
          `${label}: own script ${ownDecoded} B decoded; own bytes over the wire about ${wire} B`,
        );
        /* 150 KB decoded: the route chunk's 70 KB and the live module's 112 KB lines are gated on
           their own (the integrator's ruling of 2026-10-03, build/integrator.md "Landing, merge") */
        if (ownDecoded > 150_000)
          failures.push(`${label}: the page's own script is ${ownDecoded} B decoded (line 150000)`);
        if (wire > 240_000)
          failures.push(`${label}: the page's own bytes are ${wire} B over the wire`);
      } finally {
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'bytes', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.budget.shared'), async ({ browser }) => {
    /* a measure row: the shared entry chunk against 600 KB decoded and the font against 120 KB,
       with exactly one font request (Kevin's answer 7: the landing ships before Round 2's split) */
    const { context, page } = await homeContext(browser, DESKTOP, 'light');
    try {
      await openHome(page);
      await page.waitForTimeout(2000);
      const facts = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const scripts = resources
          .filter((r) => r.initiatorType === 'script' || /\.m?js(\?|$)/.test(r.name))
          .filter((r) => !/\/home(-live)?-[\w-]+\.js/.test(r.name))
          .map((r) => ({ url: new URL(r.name).pathname, decoded: r.decodedBodySize }))
          .sort((a, b) => b.decoded - a.decoded);
        const fonts = resources
          .filter((r) => /\.(woff2?|ttf|otf)(\?|$)/.test(r.name))
          .map((r) => ({
            url: new URL(r.name).pathname,
            bytes: r.encodedBodySize || r.transferSize,
          }));
        return {
          entry: scripts[0] ?? null,
          scriptsDecoded: scripts.reduce((n, s) => n + s.decoded, 0),
          fonts,
        };
      });
      const lines = [
        `shared entry chunk ${facts.entry?.url} ${facts.entry?.decoded} B decoded (reported against 600000); all shared script ${facts.scriptsDecoded} B`,
        `fonts ${facts.fonts.length} request(s): ${facts.fonts.map((f) => `${f.url} ${f.bytes} B`).join(', ')} (reported against 120000)`,
      ];
      for (const line of lines)
        test.info().annotations.push({ type: 'measure', description: line });
      expect(facts.fonts.length, lines[1]).toBe(1);
    } finally {
      await context.close();
    }
  });

  test(title('home.budget.lcp'), async ({ browser }) => {
    test.setTimeout(240_000);
    /* a measure row: the LCP element is the h1, never the hero's field; the time at a load under 20 */
    const failures: string[] = [];
    for (const [size, scale] of [
      [DESKTOP, 1],
      [DESKTOP, 2],
      [PHONE, 1],
    ] as const) {
      const { context, page } = await homeContext(browser, size, 'light', { scale });
      try {
        await openHome(page);
        await page.waitForTimeout(1500);
        const cold = await page.evaluate(
          () => (window as unknown as { __lcp: { ms: number; element: string } | null }).__lcp,
        );
        await page.reload();
        await page.locator('main#top[data-hydrated]').waitFor({ timeout: 30_000 });
        await page.waitForTimeout(1500);
        const warm = await page.evaluate(
          () => (window as unknown as { __lcp: { ms: number; element: string } | null }).__lcp,
        );
        const { load, read } = measureLoad();
        const label = `${size.width} x${scale}`;
        test.info().annotations.push({
          type: read ? 'measure' : 'not read: load',
          description: `${label}: LCP cold ${cold?.ms} ms on ${cold?.element}, warm ${warm?.ms} ms on ${warm?.element} (lines 400 and 200) at load ${load}`,
        });
        if (!/^h1#ts-product-h1$/.test(cold?.element ?? ''))
          failures.push(`${label}: the LCP element is ${cold?.element}`);
        if (/data-field/.test(cold?.element ?? ''))
          failures.push(`${label}: the hero's field is the LCP element`);
        if (read && (cold?.ms ?? 9999) > 400) failures.push(`${label}: LCP cold ${cold?.ms} ms`);
        if (read && (warm?.ms ?? 9999) > 200) failures.push(`${label}: LCP warm ${warm?.ms} ms`);
      } finally {
        await context.close();
      }
    }
    expect(failures).toEqual([]);
  });

  test(title('home.a11y.skip-and-contrast'), async ({ browser }) => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const notes: string[] = [];
    /* the skip link: the first Tab stop, shown, and it moves focus to the hero */
    {
      const { context, page } = await homeContext(browser, DESKTOP, 'light');
      try {
        await openHome(page);
        await page.keyboard.press('Tab');
        const first = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          const r = el?.getBoundingClientRect();
          return {
            text: (el?.textContent ?? '').trim(),
            href: el?.getAttribute('href') ?? '',
            shown: r !== undefined && r.top >= 0 && r.bottom <= innerHeight && r.width > 0,
          };
        });
        notes.push(`first Tab stop "${first.text}" ${first.href}, shown ${first.shown}`);
        if (first.text !== 'Skip to content')
          failures.push(`the first Tab stop is "${first.text}"`);
        if (!first.shown) failures.push('the skip link is not shown on focus');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        const target = await page.evaluate(
          () =>
            (document.activeElement as HTMLElement | null)?.getAttribute('data-band') ??
            document.activeElement?.tagName ??
            '',
        );
        notes.push(`after Enter, focus on ${target}`);
        if (target !== 'hero') failures.push(`the skip link moves focus to ${target}`);
      } finally {
        await context.close();
      }
    }
    /* no text at rest under 4.5:1 (3:1 at 24 px and over) in either appearance */
    for (const theme of ['light', 'dark'] as const)
      for (const size of [DESKTOP, PHONE]) {
        const { context, page } = await homeContext(browser, size, theme);
        try {
          await openHome(page);
          const low = await page.evaluate(() => {
            const parse = (c: string): [number, number, number, number] => {
              const m = /rgba?\(([^)]+)\)/.exec(c);
              if (!m) return [0, 0, 0, 0];
              const p = (m[1] ?? '')
                .split(/[\s,/]+/)
                .filter(Boolean)
                .map(Number);
              return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
            };
            const lum = ([r, g, b]: number[]) => {
              const f = (v: number) => {
                const s = v / 255;
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
              };
              return 0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0);
            };
            const over = (top: number[], bottom: number[]) => {
              const a = top[3] ?? 1;
              return [0, 1, 2].map((i) => (top[i] ?? 0) * a + (bottom[i] ?? 0) * (1 - a));
            };
            const groundOf = (el: Element): number[] => {
              const layers: number[][] = [];
              for (let at: Element | null = el; at; at = at.parentElement) {
                const bg = parse(getComputedStyle(at).backgroundColor);
                if ((bg[3] ?? 0) > 0) {
                  layers.push(bg);
                  if ((bg[3] ?? 0) >= 1) break;
                }
              }
              let ground = [255, 255, 255];
              for (const layer of layers.reverse()) ground = over(layer, ground);
              return ground;
            };
            const out: string[] = [];
            let read = 0;
            for (const el of document.querySelectorAll<HTMLElement>('main *')) {
              if (el.closest('[aria-hidden="true"], .ts-sr, .ts-skip, template, [hidden]'))
                continue;
              const own = [...el.childNodes].some(
                (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
              );
              if (!own) continue;
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              if (r.width === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
              const sheet = el.closest<HTMLElement>('[data-home-slides], .ts-seam-editable');
              const scale = sheet ? sheet.getBoundingClientRect().width / 1600 : 1;
              const px = parseFloat(cs.fontSize) * scale;
              const ground = groundOf(el);
              const ink = over(parse(cs.color), ground);
              const l1 = lum(ink);
              const l2 = lum(ground);
              const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
              const need = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700) ? 3 : 4.5;
              read += 1;
              if (ratio < need)
                out.push(
                  `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`,
                );
            }
            return { out, read };
          });
          const label = `${size.width} ${theme}`;
          notes.push(`${label}: ${low.read} text elements, ${low.out.length} under their line`);
          for (const o of low.out.slice(0, 8)) failures.push(`${label}: ${o}`);
        } finally {
          await context.close();
        }
      }
    test.info().annotations.push({ type: 'a11y', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });
}
