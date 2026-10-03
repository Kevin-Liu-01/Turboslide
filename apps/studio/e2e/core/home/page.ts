import { spawnSync } from 'node:child_process';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page, Request } from '@playwright/test';

import { FACTS_DATA } from '../../../src/components/home/facts-data';
import { HOME_RUN } from '../../../src/components/home/run.generated';
import { extraHTTPHeaders, title } from '../lib';

// A lane module of core/home.spec.ts (docs/LANDING.md 6.1, 6.7; build/integrator.md "Landing,
// day 0" 4.9 and 5.1). V1's (the first pass's L1#1, restated by the second pass's V1#8): the page
// in section 2's order, the first screen's markup as its end state, the bands after `load`, the
// h1 and the h2s, the hero's stage, the visit sentence, the numbers row, the features table, the
// byte budgets, the live core and the band chunks, the shared costs and the LCP (the two measure
// rows), the skip link and the contrast. Every observation is through the page and the network;
// nothing is read from disk but the facts and the recorded run the page itself is built from.
//
// The byte budgets are a build's (LANDING.md 4.4: "Bytes and counts are read on the preview (as
// served, brotli)"): on a Vite dev server the route chunk, the page's CSS files and brotli do not
// exist as shipped, so those lines read "not read: a dev server" and the row fails there; it is
// read on the node-server output of scripts/check.mjs or on the preview. Times are read at a one
// minute load under 20 (measure rows); above it the reading is recorded "not read: load".

export const ROWS: readonly string[] = [
  'home.page.order',
  'home.page.markup-final',
  'home.page.bands-after-load',
  'home.hero.type',
  'home.hero.stage',
  'home.lead.visit',
  'home.numbers.row',
  'home.features.table',
  'home.budget.bytes-first',
  'home.budget.bytes-page',
  'home.budget.live-module',
  'home.budget.shared',
  'home.budget.lcp',
  'home.a11y.skip-and-contrast',
];

const DESKTOP = { width: 1440, height: 900 } as const;
const MIDDLE = { width: 1280, height: 800 } as const;
const PHONE = { width: 390, height: 844 } as const;
/**
 * Section 2's order as the tree renders it (6.1: a band is rendered from its push): the menus,
 * kits, two people and patterns bands join with V2#11, V2#12, V4#20 and V4#19, and the interludes
 * replace the field strip in V4#18. A band the tree does not render is left out of the reading.
 */
const SECTION_ORDER = [
  'nav',
  'hero',
  'numbers',
  'field',
  'menus',
  'canvas',
  'tailor',
  'kits',
  'agents',
  'people',
  'present',
  'export',
  'patterns',
  'features',
  'close',
  'footer',
] as const;
const H2_OF: Readonly<Record<string, string>> = {
  menus: "The menus are Google's",
  canvas: 'Everything on a slide moves',
  tailor: 'One name on every slide',
  kits: 'Brand kits restyle every slide',
  agents: 'Agents run the same actions',
  people: 'Two people edit the same slide',
  present: 'Present from the browser',
  export: 'Export to PDF and PowerPoint',
  patterns: 'Animated patterns',
  features: 'Features and where to find them',
  close: 'A new presentation needs no account',
};
/** The bands every tree from V1#8 on renders, in order (the floor of home.page.order). */
const V1_BANDS = [
  'nav',
  'hero',
  'numbers',
  'canvas',
  'tailor',
  'agents',
  'present',
  'export',
  'features',
  'close',
  'footer',
] as const;
/** The selection colour, drawn only while the visitor works on something (2.0 "Colour"). */
const SELECTION_BLUE = 'rgb(47, 92, 224)';
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

/* A cold load of /home in a node process of its own, through playwright-core, which the runner
   does not instrument: the paths of the pictures the page requested before `load` (LANDING.md
   4.2: a band within one viewport height of the view requests its pictures after `load` and one
   idle callback, so a picture after `load` is the band's and not the first screen's). */
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
const pictures = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const loadEnd = nav ? nav.loadEventEnd : 0;
  return performance.getEntriesByType('resource')
    .filter((r) => r.initiatorType === 'img' || /\\.(png|jpe?g|webp|avif|gif)(\\?|$)/.test(r.name))
    .filter((r) => r.startTime < loadEnd)
    .map((r) => new URL(r.name).pathname);
});
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
    test.setTimeout(300_000);
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
                  (el.hasAttribute('data-band') && el.getAttribute('data-band') !== 'footer') ||
                  el.hasAttribute('data-interlude'),
              )
              .map((el) => ({
                band:
                  el.tagName === 'HEADER'
                    ? 'nav'
                    : el.tagName === 'FOOTER'
                      ? 'footer'
                      : el.hasAttribute('data-interlude')
                        ? `interlude:${el.getAttribute('data-interlude')}`
                        : (el.getAttribute('data-band') ?? ''),
                top: Math.round(el.getBoundingClientRect().top + scrollY),
                h2: [...el.querySelectorAll('h2')].map((h) => (h.textContent ?? '').trim()),
                tag: el.tagName.toLowerCase(),
                labelledBy: el.getAttribute('aria-labelledby'),
                label: el.getAttribute('aria-label'),
              }));
            const h1 = [...document.querySelectorAll('h1')].map((h) =>
              (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
            );
            const heroSheet = document.querySelector(
              '[data-band="hero"] [data-hero-frame] [data-sheet="hero"]',
            );
            return { parts, h1, heroSheet: heroSheet !== null };
          });
          const label = `${size.width} ${theme}`;
          const bands = facts.parts.filter((p) => !p.band.startsWith('interlude:'));
          const order = bands.map((p) => p.band);
          notes.push(
            `${label}: ${facts.parts.map((p) => p.band).join(' > ')}; h1 ${facts.h1.length}`,
          );
          /* section 2's order for the bands the tree renders, and every band of V1#8 present */
          const known = order.filter((b) => (SECTION_ORDER as readonly string[]).includes(b));
          if (known.length !== order.length)
            failures.push(
              `${label}: unknown bands ${order.filter((b) => !known.includes(b)).join(', ')}`,
            );
          const ranks = order.map((b) => (SECTION_ORDER as readonly string[]).indexOf(b));
          if (ranks.some((r, i) => i > 0 && r <= (ranks[i - 1] ?? -1)))
            failures.push(`${label}: the page reads ${order.join(', ')}`);
          for (const band of V1_BANDS)
            if (!order.includes(band)) failures.push(`${label}: no ${band} band`);
          for (let i = 1; i < facts.parts.length; i += 1)
            if ((facts.parts[i]?.top ?? 0) < (facts.parts[i - 1]?.top ?? 0))
              failures.push(
                `${label}: ${facts.parts[i]?.band} draws above ${facts.parts[i - 1]?.band}`,
              );
          if (facts.h1.length !== 1) failures.push(`${label}: ${facts.h1.length} h1 elements`);
          if (!facts.heroSheet) failures.push(`${label}: no slide in the hero's editor frame`);
          const numbers = bands.find((p) => p.band === 'numbers');
          if (
            numbers &&
            (numbers.tag !== 'section' || numbers.label !== 'Turboslide in four numbers')
          )
            failures.push(`${label}: the numbers row is a ${numbers.tag} named "${numbers.label}"`);
          for (const s of bands) {
            const want = H2_OF[s.band];
            if (want === undefined) continue;
            if (s.tag !== 'section') failures.push(`${label}: ${s.band} is a ${s.tag}`);
            if (s.h2.length !== 1) failures.push(`${label}: ${s.band} holds ${s.h2.length} h2`);
            if (s.h2[0] !== want) failures.push(`${label}: ${s.band} reads "${s.h2[0]}"`);
            if (s.labelledBy !== `ts-h-${s.band}`)
              failures.push(`${label}: ${s.band} is labelled by ${s.labelledBy}`);
          }
          /* from V4#18 an interlude between every two sections from the numbers row on */
          const interludes = facts.parts.filter((p) => p.band.startsWith('interlude:'));
          if (interludes.length > 0) {
            const from = facts.parts.findIndex((p) => p.band === 'numbers');
            const seq = facts.parts.slice(from, facts.parts.length - 1);
            for (let i = 0; i + 1 < seq.length; i += 1) {
              const a = seq[i]!.band;
              const b = seq[i + 1]!.band;
              if (!a.startsWith('interlude:') && !b.startsWith('interlude:'))
                failures.push(`${label}: no interlude between ${a} and ${b}`);
            }
          }
        } finally {
          await context.close();
        }
      }
    test.info().annotations.push({ type: 'order', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.page.markup-final'), async ({ browser }) => {
    test.setTimeout(400_000);
    /* the first screen without script paints as the scripted page at rest (the Blue Marble's still
       included); every band's words are in the document; each reserved box has its final size
       (LANDING.md 2.0 "At rest", 4.2) */
    const failures: string[] = [];
    const notes: string[] = [];
    for (const size of [DESKTOP, PHONE]) {
      const shots: Buffer[] = [];
      const boxes: Record<string, string>[] = [];
      let words: { band: string; h2: string; text: number }[] = [];
      for (const js of [false, true]) {
        const { context, page } = await homeContext(browser, size, 'light', { js });
        try {
          await openHome(page, js);
          if (js)
            /* at rest: H5 has ended (its still or its print's last frame) */
            await page.waitForFunction(
              () =>
                !document.documentElement.classList.contains('ts-intro') &&
                document.querySelector('[data-field="hero"][data-field-state="developing"]') ===
                  null,
              undefined,
              { timeout: 20_000 },
            );
          await page.waitForTimeout(600);
          shots.push(await page.screenshot({ animations: 'disabled' }));
          boxes.push(
            await page.evaluate(() =>
              Object.fromEntries(
                [...document.querySelectorAll<HTMLElement>('[data-reserve]')].map((el) => {
                  const r = el.getBoundingClientRect();
                  return [
                    el.getAttribute('data-reserve') ?? '',
                    `${Math.round(r.width)} by ${Math.round(r.height)}`,
                  ];
                }),
              ),
            ),
          );
          if (!js)
            words = await page.evaluate(() =>
              [...document.querySelectorAll<HTMLElement>('main section[data-band]')].map(
                (band) => ({
                  band: band.getAttribute('data-band') ?? '',
                  h2: (band.querySelector('h2')?.textContent ?? '').trim(),
                  text: (band.innerText ?? '').trim().split(/\s+/).filter(Boolean).length,
                }),
              ),
            );
        } finally {
          await context.close();
        }
      }
      /* the two first screens, compared pixel by pixel */
      const { context, page } = await homeContext(browser, { width: 400, height: 300 }, 'light');
      try {
        await page.goto('about:blank');
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
          [shots[0]!.toString('base64'), shots[1]!.toString('base64')],
        );
        const share = (diff.n / diff.total) * 100;
        notes.push(
          `${size.width}: the first screen differs in ${diff.n} of ${diff.total} pixels (${share.toFixed(3)} percent); reserved boxes ${JSON.stringify(boxes[0])}; words ${words.map((w) => `${w.band} ${w.text}`).join(', ')}`,
        );
        if (share > 0.5)
          failures.push(`${size.width}: the first screen differs in ${share.toFixed(3)} percent`);
      } finally {
        await context.close();
      }
      for (const [band, box] of Object.entries(boxes[0] ?? {}))
        if (boxes[1]?.[band] !== box)
          failures.push(
            `${size.width}: the ${band} box is ${box} without script and ${boxes[1]?.[band]} with it`,
          );
      for (const w of words) {
        if (w.band !== 'numbers' && w.band !== 'hero' && w.h2 === '')
          failures.push(`${size.width}: ${w.band} has no h2 without script`);
        if (w.text < 4)
          failures.push(`${size.width}: ${w.band} holds ${w.text} words without script`);
      }
    }
    test.info().annotations.push({ type: 'markup', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.page.bands-after-load'), async ({ browser }) => {
    test.setTimeout(300_000);
    /* nothing below the first screen before `load` and one idle callback; then a native scroll of
       600 px every 300 ms brings no unfilled reserved box into the viewport, with no shift */
    const failures: string[] = [];
    const notes: string[] = [];
    for (const size of [DESKTOP, PHONE]) {
      const { context, page } = await homeContext(browser, size, 'light');
      try {
        await page.addInitScript(() => {
          const w = window as unknown as { __cls: number; __shifts: string[] };
          w.__cls = 0;
          w.__shifts = [];
          try {
            new PerformanceObserver((list) => {
              for (const e of list.getEntries() as (PerformanceEntry & {
                value?: number;
                hadRecentInput?: boolean;
                sources?: { node?: Node | null }[];
              })[])
                if (!e.hadRecentInput) {
                  w.__cls += e.value ?? 0;
                  const nodes = (e.sources ?? []).map((s) => {
                    const el = s.node instanceof Element ? s.node : s.node?.parentElement;
                    return el
                      ? `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]}`
                      : '?';
                  });
                  w.__shifts.push(
                    `${(e.value ?? 0).toFixed(6)} at ${Math.round(e.startTime)} ms on ${nodes.join(' ')}`,
                  );
                }
            }).observe({ type: 'layout-shift', buffered: true });
          } catch {
            /* no layout shift entries */
          }
        });
        await openHome(page);
        await page.waitForSelector('main#top[data-live="ready"]', { timeout: 60_000 });
        const early = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0] as
            PerformanceNavigationTiming | undefined;
          const loadEnd = nav?.loadEventEnd ?? 0;
          return (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
            .filter((r) => r.startTime < loadEnd)
            .map((r) => new URL(r.name).pathname)
            .filter(
              (path) =>
                /\/home\/[^/]+\.(webp|jpg|png|pdf)$/.test(path) ||
                /bands\/|\.generated|pattern-mount|live\/(menus|kits|versions|people|pattern)/.test(
                  path,
                ),
            );
        });
        if (early.length > 0) failures.push(`${size.width}: before load ${early.join(', ')}`);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        const unfilled: string[] = [];
        for (let y = 0; y < height; y += 600) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y);
          await page.waitForTimeout(300);
          unfilled.push(
            ...(await page.evaluate(() =>
              [...document.querySelectorAll<HTMLElement>('[data-reserve]:not([data-filled])')]
                .filter((el) => {
                  const r = el.getBoundingClientRect();
                  return r.bottom > 0 && r.top < innerHeight;
                })
                .map((el) => `${el.getAttribute('data-reserve')} at ${Math.round(scrollY)}`),
            )),
          );
        }
        const { cls, shifts } = await page.evaluate(() => {
          const w = window as unknown as { __cls: number; __shifts: string[] };
          return { cls: w.__cls, shifts: w.__shifts };
        });
        notes.push(
          `${size.width}: before load ${early.length} band requests; unfilled in view ${unfilled.length}; CLS ${cls.toFixed(6)}${shifts.length > 0 ? ` (${shifts.join('; ')})` : ''}`,
        );
        for (const u of [...new Set(unfilled)].slice(0, 6))
          failures.push(`${size.width}: ${u} came into view unfilled`);
        if (cls > 0) failures.push(`${size.width}: CLS ${cls.toFixed(6)}`);
      } finally {
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'bands', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.hero.type'), async ({ browser }) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    const notes: string[] = [];
    for (const size of [DESKTOP, MIDDLE, PHONE])
      for (const theme of ['light', 'dark'] as const) {
        const { context, page } = await homeContext(browser, size, theme);
        try {
          await openHome(page);
          /* every band filled, so the full width sheets below the first screen are read too */
          await scrollThrough(page, 600, 300);
          await page.evaluate(() => window.scrollTo(0, 0));
          const narrow = size.width < 720;
          const facts = await page.evaluate(() => {
            const h1 = document.querySelector<HTMLElement>('h1#ts-product-h1')!;
            const cs = getComputedStyle(h1);
            const lines = [...h1.querySelectorAll('.ts-h1-line')].map((l) => ({
              text: (l.textContent ?? '').trim(),
              top: Math.round(l.getBoundingClientRect().top),
            }));
            const stage = document.querySelector<HTMLElement>('[data-hero-stage]')!;
            const h2 = [...document.querySelectorAll<HTMLElement>('main h2')].map((h) =>
              parseFloat(getComputedStyle(h).fontSize),
            );
            const weights = new Set<string>();
            for (const el of document.querySelectorAll<HTMLElement>('main *')) {
              if (el.closest('[data-home-slides], .ts-seam-editable')) continue;
              const own = [...el.childNodes].some(
                (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
              );
              if (!own) continue;
              const r = el.getBoundingClientRect();
              if (r.width === 0 || getComputedStyle(el).visibility === 'hidden') continue;
              weights.add(getComputedStyle(el).fontWeight);
            }
            const sheets = [...document.querySelectorAll<HTMLElement>('main [data-sheet]')]
              .filter((el) => !el.classList.contains('is-thumb'))
              .map((el) => {
                const r = el.getBoundingClientRect();
                const sheet = el.querySelector<HTMLElement>('.ts-sheet');
                return {
                  sheet: el.getAttribute('data-sheet') ?? '',
                  width: Math.round(r.width),
                  filled: sheet !== null,
                  border: sheet ? parseFloat(getComputedStyle(sheet).borderTopWidth) : 0,
                  shadow: sheet ? getComputedStyle(sheet).boxShadow : 'none',
                };
              });
            return {
              fontPx: parseFloat(cs.fontSize),
              weight: cs.fontWeight,
              tracking: parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize),
              inSlide: h1.closest('[data-home-slides]') !== null,
              lines,
              h1Bottom: h1.getBoundingClientRect().bottom,
              stageTop: stage.getBoundingClientRect().top,
              h2,
              weights: [...weights],
              sheets,
            };
          });
          const label = `${size.width} ${theme}`;
          notes.push(
            `${label}: h1 ${facts.fontPx.toFixed(2)} px at weight ${facts.weight}, tracking ${facts.tracking.toFixed(4)} em, lines ${facts.lines.map((l) => l.text).join(' / ')}, h2 ${[...new Set(facts.h2)].join(', ')} px, weights ${facts.weights.join(', ')}, sheets ${facts.sheets.map((s) => `${s.sheet} ${s.width}`).join(', ')}`,
          );
          /* clamp(40px, 6.67vw, 96px): 96 at 1,440 and over, 85.4 at 1,280, 40 under 720 */
          const wantPx = narrow ? 40 : Math.min(96, Math.max(40, 0.0667 * size.width));
          if (Math.abs(facts.fontPx - wantPx) > 1)
            failures.push(
              `${label}: the h1 draws at ${facts.fontPx.toFixed(2)} px, not ${wantPx.toFixed(1)}`,
            );
          if (facts.inSlide) failures.push(`${label}: the h1 sits in a slide`);
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
          if (facts.h1Bottom > facts.stageTop)
            failures.push(`${label}: the h1 ends at ${facts.h1Bottom}, below the stage's top`);
          /* clamp(30px, 3.9vw, 54px): 54 px at 1440, 30 at 390 */
          const h2Want = Math.min(54, Math.max(30, 0.039 * size.width));
          for (const px of facts.h2)
            if (Math.abs(px - h2Want) > 0.5)
              failures.push(`${label}: an h2 at ${px} px, not ${h2Want}`);
          for (const w of facts.weights)
            if (w !== '400' && w !== '500') failures.push(`${label}: page text at weight ${w}`);
          for (const s of facts.sheets) {
            if (!s.filled) failures.push(`${label}: the ${s.sheet} sheet is empty after a scroll`);
            if (s.border !== 0 || (s.shadow !== 'none' && s.shadow !== ''))
              failures.push(`${label}: the ${s.sheet} sheet draws a frame`);
          }
        } finally {
          await context.close();
        }
      }
    test.info().annotations.push({ type: 'type', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.hero.stage'), async ({ browser }) => {
    test.setTimeout(300_000);
    /* B's first screen (LANDING.md 2.2): the editor frame and the terminal side by side at 1440,
       stacked at 390; slide 1 in the first viewport; the terminal's transcript in its 22 slots;
       the counter "1 / 9"; no selection blue at rest */
    const failures: string[] = [];
    const notes: string[] = [];
    const transcript = HOME_RUN.screens.transcript.narrow;
    for (const size of [DESKTOP, PHONE])
      for (const theme of ['light', 'dark'] as const) {
        const { context, page } = await homeContext(browser, size, theme);
        try {
          await openHome(page);
          await page.waitForTimeout(1500);
          const facts = await page.evaluate((blue) => {
            const rect = (sel: string) => {
              const el = document.querySelector<HTMLElement>(sel);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return {
                x: r.x,
                y: r.y + scrollY,
                w: r.width,
                h: r.height,
                bottom: r.bottom + scrollY,
              };
            };
            const screen = document.querySelector<HTMLElement>('[data-hero-screen]');
            const slots = screen ? ([...screen.children] as HTMLElement[]) : [];
            const blues: string[] = [];
            for (const el of document.querySelectorAll<HTMLElement>('[data-band="hero"] *')) {
              const cs = getComputedStyle(el);
              const hits = [
                cs.color,
                cs.backgroundColor,
                parseFloat(cs.borderTopWidth) > 0 ? cs.borderTopColor : '',
                cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
                  ? cs.outlineColor
                  : '',
              ];
              if (hits.includes(blue) && el.getBoundingClientRect().width > 0)
                blues.push(el.className.toString().split(' ')[0] ?? el.tagName);
            }
            return {
              frame: rect('[data-hero-frame]'),
              terminal: rect('[data-hero-terminal]'),
              slide: rect('[data-hero-frame] [data-sheet="hero"]'),
              counter: (document.querySelector('[data-hero-counter]')?.textContent ?? '').trim(),
              title: (document.querySelector('[data-hero-title]')?.textContent ?? '').trim(),
              thumbs: document.querySelectorAll('[data-hero-filmstrip] [data-hero-thumb]').length,
              lines: slots.map((s) => s.textContent ?? ''),
              cut: slots.filter((s) => s.scrollWidth > s.clientWidth + 1).length,
              outside: screen
                ? slots.filter(
                    (s) =>
                      s.getBoundingClientRect().bottom >
                      screen.getBoundingClientRect().bottom + 0.5,
                  ).length
                : -1,
              wider: screen ? screen.scrollWidth > screen.clientWidth + 1 : true,
              blues,
            };
          }, SELECTION_BLUE);
          const label = `${size.width} ${theme}`;
          notes.push(
            `${label}: frame ${JSON.stringify(facts.frame)}, terminal ${JSON.stringify(facts.terminal)}, slide ${JSON.stringify(facts.slide)}, counter "${facts.counter}", ${facts.lines.length} lines, ${facts.cut} cut, ${facts.outside} outside`,
          );
          const f = facts.frame;
          const t = facts.terminal;
          const sl = facts.slide;
          if (!f || !t || !sl) {
            failures.push(`${label}: no frame, terminal or slide`);
            continue;
          }
          if (size.width >= 1440) {
            if (Math.abs(f.w - 644) > 1 || Math.abs(t.w - 364) > 1)
              failures.push(`${label}: the frame is ${f.w} px and the terminal ${t.w} px`);
            if (Math.abs(t.x - (f.x + f.w) - 16) > 1)
              failures.push(`${label}: the frame and the terminal are ${t.x - f.x - f.w} px apart`);
            if (Math.abs(f.h - 408) > 1 || Math.abs(t.h - 408) > 1)
              failures.push(`${label}: the frame is ${f.h} px tall and the terminal ${t.h}`);
            if (Math.abs(f.y - t.y) > 1) failures.push(`${label}: the two panels do not align`);
          } else {
            if (Math.abs(f.w - 358) > 1 || Math.abs(t.w - 358) > 1)
              failures.push(`${label}: the frame is ${f.w} px and the terminal ${t.w} px`);
            if (t.y < f.bottom) failures.push(`${label}: the terminal is not under the frame`);
          }
          if (sl.bottom > size.height)
            failures.push(
              `${label}: slide 1 ends at ${Math.round(sl.bottom)}, below ${size.height}`,
            );
          if (facts.counter !== '1 / 9')
            failures.push(`${label}: the counter reads ${facts.counter}`);
          if (facts.title !== 'Onboarding plan')
            failures.push(`${label}: the title row reads ${facts.title}`);
          if (facts.thumbs !== 9) failures.push(`${label}: ${facts.thumbs} thumbnails`);
          if (facts.lines.length > 22)
            failures.push(`${label}: ${facts.lines.length} lines over 22 slots`);
          if (JSON.stringify(facts.lines) !== JSON.stringify(transcript))
            failures.push(`${label}: the terminal's lines differ from the recorded transcript`);
          if (facts.cut > 0 || facts.outside > 0 || facts.wider)
            failures.push(
              `${label}: ${facts.cut} lines cut, ${facts.outside} outside the terminal`,
            );
          if (facts.blues.length > 0)
            failures.push(`${label}: the selection blue at rest on ${facts.blues.join(', ')}`);
        } finally {
          await context.close();
        }
      }
    test.info().annotations.push({ type: 'stage', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.lead.visit'), async ({ browser }) => {
    test.setTimeout(240_000);
    /* the lead's first sentence is the visit's (answer 9), set before the first paint */
    const failures: string[] = [];
    const notes: string[] = [];
    const read = async (page: Page) =>
      page.evaluate(() => {
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
        const boot = (window as unknown as { tsHomeBoot?: { t0?: number } }).tsHomeBoot;
        return {
          sentence: (document.querySelector('[data-visit]')?.textContent ?? '').trim(),
          lead: (document.querySelector('.ts-hero-lead')?.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim(),
          setAt: boot?.t0 ?? null,
          fcp,
        };
      });
    const { context, page } = await homeContext(browser, DESKTOP, 'light');
    try {
      const seen: string[] = [];
      for (let visit = 0; visit < 3; visit += 1) {
        await openHome(page);
        const facts = await read(page);
        seen.push(facts.sentence);
        notes.push(
          `visit ${visit + 1}: "${facts.sentence}" set at ${facts.setAt?.toFixed(1)} ms, first paint ${facts.fcp?.toFixed(1)} ms`,
        );
        if (facts.setAt === null || facts.fcp === null || facts.setAt > facts.fcp)
          failures.push(
            `visit ${visit + 1}: the sentence was set at ${facts.setAt} ms, after the first paint at ${facts.fcp} ms`,
          );
        if (facts.sentence.length > 50)
          failures.push(`visit ${visit + 1}: ${facts.sentence.length} characters`);
        if (!facts.lead.startsWith(facts.sentence))
          failures.push(`visit ${visit + 1}: the lead does not begin with it`);
      }
      const want = [
        'Turboslide is a slides editor in the browser.',
        'Turboslide puts one customer name on every slide.',
        'Turboslide downloads PDF and PowerPoint files.',
      ];
      if (JSON.stringify(seen) !== JSON.stringify(want))
        failures.push(`the three visits read ${seen.join(' | ')}`);
    } finally {
      await context.close();
    }
    /* storage that throws reads the first */
    {
      const { context: c2, page: p2 } = await homeContext(browser, DESKTOP, 'light');
      try {
        await p2.addInitScript(() => {
          Object.defineProperty(window, 'localStorage', {
            get() {
              throw new Error('storage blocked');
            },
          });
        });
        await openHome(p2);
        const facts = await read(p2);
        notes.push(`storage throwing: "${facts.sentence}"`);
        if (facts.sentence !== 'Turboslide is a slides editor in the browser.')
          failures.push(`with storage throwing the lead reads "${facts.sentence}"`);
      } finally {
        await c2.close();
      }
    }
    test.info().annotations.push({ type: 'visit', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.numbers.row'), async ({ browser }) => {
    const { context, page } = await homeContext(browser, DESKTOP, 'light');
    try {
      await openHome(page);
      await page.waitForTimeout(3000);
      const facts = await page.evaluate(() => {
        const band = document.querySelector<HTMLElement>('[data-band="numbers"]')!;
        return {
          cells: [...band.querySelectorAll<HTMLElement>('[data-number]')].map((cell) => ({
            id: cell.getAttribute('data-number') ?? '',
            figure: (cell.querySelector('.ts-number-figure')?.textContent ?? '').trim(),
            sentence: (cell.querySelector('.ts-number-sentence')?.textContent ?? '').trim(),
            px: parseFloat(getComputedStyle(cell.querySelector('.ts-number-figure')!).fontSize),
          })),
          moving: document.getAnimations().filter((a) => {
            const target = (a.effect as KeyframeEffect | null)?.target;
            return target instanceof Element && band.contains(target);
          }).length,
          transitions: [...band.querySelectorAll<HTMLElement>('*')].filter((el) =>
            getComputedStyle(el)
              .transitionDuration.split(',')
              .some((d) => parseFloat(d) > 0),
          ).length,
        };
      });
      test.info().annotations.push({
        type: 'numbers',
        description: facts.cells.map((c) => `${c.figure} (${c.px} px): ${c.sentence}`).join(' | '),
      });
      expect(facts.cells.map((c) => c.figure)).toEqual([
        `${FACTS_DATA.actions} actions`,
        `${FACTS_DATA.layouts} layouts`,
        `${FACTS_DATA.materials} patterns`,
        `${FACTS_DATA.shapes} shapes`,
      ]);
      expect(facts.cells.map((c) => c.sentence)).toEqual([
        "Each is a named command in the editor's action table.",
        'A new slide starts from one of these layouts.',
        "Insert > Animated pattern draws one in the theme's colors.",
        "Insert > Shape draws them from PowerPoint's preset definitions.",
      ]);
      for (const c of facts.cells) expect(c.px, c.id).toBe(32);
      expect(facts.moving, 'nothing in the band animates').toBe(0);
      expect(facts.transitions, 'nothing in the band transitions').toBe(0);
    } finally {
      await context.close();
    }
  });

  test(title('home.features.table'), async ({ browser }) => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const notes: string[] = [];
    for (const platform of ['MacIntel', 'Linux x86_64']) {
      const { context, page } = await homeContext(browser, DESKTOP, 'light');
      try {
        await page.addInitScript((value) => {
          Object.defineProperty(Navigator.prototype, 'platform', { get: () => value });
        }, platform);
        await openHome(page);
        await page.waitForTimeout(500);
        const rows = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('[data-band="features"] tbody tr')].map(
            (row) => {
              const icon = row.querySelector<HTMLElement>('.ts-icon');
              const ics = icon ? getComputedStyle(icon) : null;
              return {
                id: row.getAttribute('data-feature') ?? '',
                icon: icon?.getAttribute('data-icon') ?? '',
                masked: ics !== null && /url\(/.test(ics.maskImage || ics.webkitMaskImage),
                key: (row.querySelector('.ts-feature-key')?.textContent ?? '').trim(),
                where: (row.querySelector('.ts-feature-where')?.textContent ?? '').trim(),
                shortcut: (row.querySelector('.ts-feature-shortcut')?.textContent ?? '').trim(),
                height: Math.round(row.getBoundingClientRect().height),
              };
            },
          ),
        );
        const heads = await page.evaluate(() =>
          [...document.querySelectorAll('[data-band="features"] thead th')].map((th) =>
            (th.textContent ?? '').trim(),
          ),
        );
        notes.push(
          `${platform}: ${rows.map((r) => `${r.icon} ${r.key} | ${r.where} | ${r.shortcut}`).join('; ')}`,
        );
        const want = FACTS_DATA.features;
        if (JSON.stringify(heads) !== JSON.stringify(['Feature', 'Where', 'Shortcut']))
          failures.push(`${platform}: the heads read ${heads.join(', ')}`);
        if (JSON.stringify(rows.map((r) => r.id)) !== JSON.stringify(want.map((f) => f.id)))
          failures.push(`${platform}: the rows read ${rows.map((r) => r.id).join(', ')}`);
        if (
          JSON.stringify(rows.map((r) => r.icon)) !==
          JSON.stringify([
            'bars-3',
            'pencil-square',
            'swatch',
            'chat-bubble-left-right',
            'clock',
            'user-group',
            'presentation-chart-bar',
            'arrow-down-tray',
            'cube',
            'command-line',
          ])
        )
          failures.push(`${platform}: the icons read ${rows.map((r) => r.icon).join(', ')}`);
        for (const [i, r] of rows.entries()) {
          const f = want[i];
          if (!r.masked) failures.push(`${platform}: ${r.key} has no Heroicon`);
          if (f && r.where !== f.where)
            failures.push(`${platform}: ${r.key} is at "${r.where}", the model says "${f.where}"`);
          const shortcut = f ? (platform === 'MacIntel' ? f.mac : f.other) : '';
          if (r.shortcut !== shortcut)
            failures.push(
              `${platform}: ${r.key}'s shortcut reads "${r.shortcut}", not "${shortcut}"`,
            );
          if (/\d/.test(`${r.key} ${r.where}`))
            failures.push(`${platform}: a figure in ${r.key}'s row`);
          if (Math.abs(r.height - 56) > 1)
            failures.push(`${platform}: ${r.key}'s row is ${r.height} px`);
        }
      } finally {
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'features', description: notes.join(' | ') });
    expect(failures).toEqual([]);
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
          const nav = performance.getEntriesByType('navigation')[0] as
            PerformanceNavigationTiming | undefined;
          const loadEnd = nav?.loadEventEnd ?? 0;
          return {
            /* no chunk but the route's before load: the live core and the band chunks after it */
            earlyChunks: resources
              .filter((r) => r.startTime < loadEnd && /\/live[-/]|\/bands[-/]/.test(r.name))
              .map((r) => new URL(r.name).pathname),
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
        if (facts.earlyChunks.length > 0)
          failures.push(`${label}: before load ${facts.earlyChunks.join(', ')}`);
        /* the pictures before the first scroll, read in a browser the runner does not trace: its
           trace (trace: 'retain-on-failure') snapshots the page by reading every element's
           computed style, which resolves the canvas band's mask under content-visibility: auto
           and requests its still (read on the preview 2026-10-03: with the trace, the still at
           395 to 459 ms from the CSS; in a process of its own, none) */
        const cold = coldPictures(size, scale);
        if (cold.length > 0)
          failures.push(`${label}: ${cold.length} pictures before load (${cold.join(', ')})`);
        if (facts.pictures.length > cold.length)
          notes.push(`${label}: under the runner's trace ${facts.pictures.join(', ')}`);
        /* the document: decoded and brotli */
        const doc = await request.get('/home', {
          headers: { ...extraHTTPHeaders, 'accept-encoding': 'identity' },
        });
        const docBytes = await doc.body();
        const docBr = brotli(docBytes);
        notes.push(
          `${label}: document ${docBytes.length} B decoded, ${docBr} B brotli; pictures before load ${cold.length}`,
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
        if (cssBr > 16_000) failures.push(`${label}: the page's CSS is ${cssBr} B brotli`);
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
        if (total > 200_000) failures.push(`${label}: the pictures weigh ${total} B (line 200000)`);
        const paths = facts.home.map((r) => r.path);
        const twice = paths.filter((p, i) => paths.indexOf(p) !== i);
        if (twice.length > 0) failures.push(`${label}: requested twice: ${twice.join(', ')}`);
        for (const p of paths) {
          if (p.endsWith('.pdf')) failures.push(`${label}: a PDF was requested (${p})`);
          if (/\/home\/field-still-/.test(p))
            failures.push(`${label}: slide 7's still was requested (${p})`);
          if (/\/home\/export-browser-/.test(p))
            failures.push(`${label}: the loupe's browser raster was requested (${p})`);
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
        /* the page's own script: the route chunk and every script after load (the live core and
           the band chunks; the shared entry chunks all load before it) */
        const own: { url: string; decoded: number }[] = [];
        let ownBr = 0;
        let ownGzip = 0;
        for (const s of facts.scripts) {
          const route = /\/home-[\w-]+\.js(\?|$)/.test(s.url);
          if (!route && !s.late) continue;
          const body = await (await request.get(s.url, { headers: extraHTTPHeaders })).body();
          own.push(s);
          ownBr += brotli(body);
          ownGzip += gzipSync(body, { level: 9 }).length;
        }
        const ownDecoded = own.reduce((n, s) => n + s.decoded, 0);
        const doc = await (await request.get('/home', { headers: extraHTTPHeaders })).body();
        const wire = brotli(doc) + ownBr + total;
        notes.push(
          `${label}: own script ${ownDecoded} B decoded, ${ownGzip} B gzip; own bytes over the wire about ${wire} B`,
        );
        if (ownDecoded > 300_000)
          failures.push(`${label}: the page's own script is ${ownDecoded} B decoded (line 300000)`);
        if (ownGzip > 90_000)
          failures.push(`${label}: the page's own script is ${ownGzip} B gzip (line 90000)`);
        if (wire > 400_000)
          failures.push(`${label}: the page's own bytes are ${wire} B over the wire`);
      } finally {
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'bytes', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });

  test(title('home.budget.live-module'), async ({ browser }) => {
    test.setTimeout(240_000);
    /* the live core and the chunks it imports at once: one request after `load` and one idle
       callback, never before, at most 64 KB decoded and 20 KB gzip with no slide markup; each band
       chunk at most 56 KB decoded and 16 KB gzip (LANDING.md 4.1, 4.2) */
    const { context, page } = await homeContext(browser, DESKTOP, 'light');
    try {
      const scripts: { url: string; req: Request }[] = [];
      page.on('request', (req) => {
        if (req.resourceType() === 'script') scripts.push({ url: req.url(), req });
      });
      await openHome(page);
      await page.locator('main#top[data-live="ready"]').waitFor({ timeout: 60_000 });
      await scrollThrough(page, 600, 300);
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as
          PerformanceNavigationTiming | undefined;
        const loadEnd = nav?.loadEventEnd ?? 0;
        return (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          .filter((r) => r.initiatorType === 'script' || /\.m?js(\?|$)/.test(r.name))
          .map((r) => ({ name: r.name, late: r.startTime >= loadEnd }));
      });
      const early = timing.filter(
        (t) => !t.late && /\/live\/|\/live-|\/bands\/|bands-/.test(t.name),
      );
      expect(
        early.map((t) => t.name),
        'no part of the live core or a band before load',
      ).toEqual([]);
      if (await isDevServer(page)) {
        test.info().annotations.push({
          type: 'not read: a dev server',
          description:
            'a dev server serves the live core and the band chunks as unbundled modules; their requests and bytes exist as shipped on a build only',
        });
        throw new Error(
          'the live core and the band chunks are read on a build (the node-server output or the preview)',
        );
      }
      const late = timing.filter((t) => t.late);
      const bodies = await Promise.all(
        late.map(async (t) => {
          const s = scripts.find((x) => x.url === t.name);
          return {
            name: new URL(t.name).pathname,
            body: (await (await s?.req.response())?.body()) ?? Buffer.alloc(0),
          };
        }),
      );
      const core = bodies.find((b) => b.body.includes('ts-home-sel-layer'));
      expect(core, 'one live core after load').toBeTruthy();
      const coreText = core?.body.toString('utf8') ?? '';
      const imported = new Set(
        [...coreText.matchAll(/from\s*["']\.\/([\w.-]+\.js)["']/g)].map((m) => m[1]),
      );
      const withCore = bodies.filter(
        (b) => b === core || imported.has(b.name.split('/').pop() ?? ''),
      );
      const coreBody = Buffer.concat(withCore.map((b) => b.body));
      const coreGzip = gzipSync(coreBody, { level: 9 }).length;
      const bands = bodies.filter((b) => !withCore.includes(b));
      const lines = [
        `the core with its imports: ${coreBody.length} B decoded, ${coreGzip} B gzip (${withCore.map((b) => b.name).join(', ')}; lines 65536 and 20480)`,
        ...bands.map(
          (b) =>
            `band chunk ${b.name}: ${b.body.length} B decoded, ${gzipSync(b.body, { level: 9 }).length} B gzip (lines 57344 and 16384)`,
        ),
      ];
      for (const line of lines)
        test.info().annotations.push({ type: 'measure', description: line });
      expect(coreBody.length, lines[0]).toBeLessThanOrEqual(64 * 1024);
      expect(coreGzip, lines[0]).toBeLessThanOrEqual(20 * 1024);
      /* slide markup is the renderer's root as the build writes it; the core's selectors may name
         the attribute, never carry a slide */
      expect(coreBody.toString('utf8'), 'no slide markup in the core').not.toMatch(
        /<div class=\\?"ts-sheet sheet ts-home-slide/,
      );
      for (const b of bands) {
        expect(b.body.length, b.name).toBeLessThanOrEqual(56 * 1024);
        expect(gzipSync(b.body, { level: 9 }).length, b.name).toBeLessThanOrEqual(16 * 1024);
      }
    } finally {
      await context.close();
    }
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
        /* a dev server also imports each face's URL as a module (`?import&url`), which is script */
        const fonts = resources
          .filter((r) => /\.(woff2?|ttf|otf)(\?|$)/.test(r.name) && !/[?&]import\b/.test(r.name))
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
