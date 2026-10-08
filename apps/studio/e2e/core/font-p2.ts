import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { Scratch, extraHTTPHeaders, newDeck, teardownAll, title } from './lib';
import { isCoreId } from './matrix';

// Lane F's rows of polish two in core/chrome.spec.ts (docs/POLISH-2.md 2.4, 2.5, 6.2): the one
// served face is the Inter 4.1 release file its record names, its features take effect (measured
// by advance widths), no element outside a slide draws a stylistic set or a character variant, and
// every number alone outside a slide and a code surface draws tabular figures. The spec file calls
// `chromeFontP2()` once and spreads its ids into its coverage list; a row registers once its id is
// in the matrix. Every context is fresh (no cache, so the first load is cold), the appearance is
// stored before the first paint as the theme button stores it, and the decks the editor pages make
// from /new are torn down through the product.

type Appearance = 'light' | 'dark';

/** The served Latin upright's record, as scripts/build-fonts.py wrote it. */
const LATIN = (() => {
  const fonts = JSON.parse(
    readFileSync(new URL('../../../../packages/fonts/export/fonts.json', import.meta.url), 'utf8'),
  ) as { web: { file: string; bytes: number; sha256: string }[] };
  const record = fonts.web.find((w) => w.file === 'InterVariable-latin.woff2');
  if (record === undefined) throw new Error('fonts.json has no InterVariable-latin.woff2 record');
  return record;
})();

/**
 * A slide: the elements of a deck the page draws (the landing's page deck, the editor's stage and
 * filmstrip, the previews), which take their theme's features; the rows read everything else.
 */
const SLIDE = '.ts-sheet, .pt-slide, .ts-thumb, .pt-preview-frame';

/** A code surface (docs/DESIGN.md 4.5): its figures are the monospace face's own. */
const CODE = 'code, pre, kbd, samp, .ts-home-panel';

/** The tags a feature value may not name outside a slide (docs/POLISH-2.md 2.3 item 1). */
const ALTERNATE = /\b(?:ss\d\d|cv\d\d|salt|swsh|aalt)\b/;

/** Inter's advance widths at 2,048 units to the em (docs/DESIGN.md 4.2), at weight 400 and opsz 14. */
const ADVANCE = { six9: 1270, six9Open: 1191, a: 1150, aSingle: 1254 } as const;
const SPECIMEN_PX = 100;
const expectedWidth = (units: number): number => (4 * units * SPECIMEN_PX) / 2048;

/** A fresh context at a width in an appearance, the appearance stored before the first paint. */
async function contextIn(
  browser: Browser,
  appearance: Appearance,
  width: number,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height: width < 720 ? 844 : 900 },
    colorScheme: appearance,
  });
  await context.addInitScript((value) => {
    try {
      localStorage.setItem('gt-theme', value);
    } catch {
      /* a storage that refuses keeps the system's appearance */
    }
  }, appearance);
  return context;
}

/** Opens a page and waits for its fonts; `/new` makes a deck (registered for teardown). */
async function open(page: Page, path: string, scratch: Scratch): Promise<void> {
  if (path === '/new') await newDeck(page, scratch, 'Face rows');
  else {
    const res = await page.goto(path, { waitUntil: 'load' });
    expect(res?.status(), `${path} answers`).toBeLessThan(400);
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  /* a face a late paint asks for (a menu, a lazy band) has a moment to load */
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Every docs page the sidebar of /docs links, /docs first. */
async function docsPages(page: Page): Promise<string[]> {
  const paths = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/docs"]')]
      .map((a) => new URL(a.href).pathname.replace(/\/$/, ''))
      .filter((p) => !p.endsWith('.md') && !p.endsWith('.json') && !p.endsWith('.txt')),
  );
  return ['/docs', ...new Set(paths.filter((p) => p !== '/docs'))];
}

/** The elements outside a slide that pick an alternate, and the initials of the presence chips. */
async function alternatesOf(page: Page): Promise<{ found: string[]; initials: string[] }> {
  return page.evaluate(
    ({ slide, alternate }) => {
      const pattern = new RegExp(alternate);
      const name = (el: Element): string =>
        `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : ''}`;
      const found: string[] = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest(slide)) continue;
        const style = getComputedStyle(el);
        if (pattern.test(style.fontFeatureSettings))
          found.push(`${name(el)} font-feature-settings ${style.fontFeatureSettings}`);
        if (style.fontVariantAlternates !== 'normal')
          found.push(`${name(el)} font-variant-alternates ${style.fontVariantAlternates}`);
      }
      const initials = [...document.querySelectorAll('.ts-chip-initials, .ts-mark-initials')].map(
        (el) =>
          `${el.textContent ?? ''} ${getComputedStyle(el).fontFeatureSettings} ${el.getAttribute('style') ?? ''}`.trim(),
      );
      return { found: [...new Set(found)], initials };
    },
    { slide: SLIDE, alternate: ALTERNATE.source },
  );
}

/** The rendered elements outside a slide and a code surface whose own text is a number alone. */
async function figuresOf(page: Page): Promise<{ read: number; proportional: string[] }> {
  return page.evaluate(
    ({ slide, code }) => {
      /* digits with . , : / % + and minus signs and spaces, and at most one unit of up to two letters */
      const NUMBER =
        /^(?=[^A-Za-z]*\d)[\d\s.,:/%+\-−]*(?:[A-Za-z]{1,2}(?![A-Za-z])[\d\s.,:/%+\-−]*)?$/;
      let read = 0;
      const proportional: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (el.closest(slide) || el.closest(code)) continue;
        if (el instanceof HTMLScriptElement || el instanceof HTMLStyleElement) continue;
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
        if (own === '' || !NUMBER.test(own)) continue;
        if (el.getClientRects().length === 0) continue;
        const style = getComputedStyle(el);
        if (/mono/i.test(style.fontFamily)) continue;
        read += 1;
        if (!/tabular-nums/.test(style.fontVariantNumeric))
          proportional.push(
            `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''} "${own}" ${style.fontVariantNumeric}`,
          );
      }
      return { read, proportional: [...new Set(proportional)] };
    },
    { slide: SLIDE, code: CODE },
  );
}

export function chromeFontP2(): string[] {
  const declared: string[] = [];
  const row = (id: string, body: Parameters<typeof test>[2]) => {
    if (!isCoreId(id)) return;
    declared.push(id);
    test(title(id), body);
  };

  row('chrome.font.official-inter', async ({ browser }) => {
    test.setTimeout(600_000);
    const readings: string[] = [];
    const failures: string[] = [];
    for (const path of ['/home', '/decks', '/new', '/signin', '/docs']) {
      const context = await contextIn(browser, 'light', 1440);
      const scratch = new Scratch();
      const page = await context.newPage();
      const fonts: { url: string; status: number; bytes: number; sha256: string }[] = [];
      const bodies: Promise<void>[] = [];
      page.on('response', (response) => {
        const url = new URL(response.url()).pathname;
        const status = response.status();
        /* a font the page fetched as a font (a dev server's `?import` module of a font URL is a
           script); a 304 is the same file revalidated, which a dev server's no-cache asks for when
           the head's preload link is drawn again after hydration, and carries no body */
        if (response.request().resourceType() !== 'font') return;
        if (status !== 200) {
          fonts.push({ url, status, bytes: 0, sha256: '' });
          return;
        }
        bodies.push(
          response
            .body()
            .then((body) => {
              fonts.push({
                url,
                status,
                bytes: body.byteLength,
                sha256: createHash('sha256').update(body).digest('hex'),
              });
            })
            .catch(() => {
              fonts.push({ url, status, bytes: -1, sha256: 'unread' });
            }),
        );
      });
      try {
        await open(page, path, scratch);
        await Promise.all(bodies);
        const faces = await page.evaluate(() =>
          [...document.fonts]
            .filter((f) => f.family.replace(/["']/g, '') === 'Inter' && f.status === 'loaded')
            .map((f) => `${f.style} ${f.weight} ${f.unicodeRange.slice(0, 24)}`),
        );
        /* the specimen spans of docs/DESIGN.md 4.2's units, in the page's own Inter face; a dev
           server reloads the page once when its optimizer finds a new dependency after a restart,
           so a measurement that reload interrupts is taken again on the settled page */
        const specimen = (): Promise<
          Record<'six9' | 'six9Open' | 'a' | 'aSingle' | 'ones' | 'zeros', number>
        > =>
          page.evaluate((px) => {
            const box = document.createElement('div');
            box.setAttribute('data-face-specimen', '');
            box.style.cssText =
              'position:absolute;left:-20000px;top:0;visibility:hidden;white-space:pre;';
            const span = (text: string, features: string): HTMLSpanElement => {
              const s = document.createElement('span');
              s.textContent = text;
              s.style.cssText = `font-family:Inter;font-size:${px}px;font-weight:400;font-style:normal;font-optical-sizing:none;font-kerning:none;letter-spacing:0;font-variant-numeric:normal;font-feature-settings:${features};`;
              box.append(s, document.createElement('br'));
              return s;
            };
            const spans = {
              six9: span('6969', 'normal'),
              six9Open: span('6969', "'ss01'"),
              a: span('aaaa', 'normal'),
              aSingle: span('aaaa', "'cv11'"),
              ones: span('1111', "'tnum'"),
              zeros: span('0000', "'tnum'"),
            };
            document.body.append(box);
            const out = Object.fromEntries(
              Object.entries(spans).map(([k, s]) => [k, s.getBoundingClientRect().width]),
            );
            box.remove();
            return out as Record<keyof typeof spans, number>;
          }, SPECIMEN_PX);
        const widths = await specimen().catch(async () => {
          await page.waitForLoadState('load');
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          return specimen();
        });
        /* one file: every font response names the Latin upright, and one of them carries its bytes */
        const files = [...new Set(fonts.map((f) => f.url))];
        const latin = fonts.filter(
          (f) => f.status === 200 && /\/InterVariable-latin(?!-ext)[^/]*\.woff2/.test(f.url),
        );
        readings.push(
          `${path}: ${files.length} font file(s) in ${fonts.length} response(s) (${fonts.map((f) => `${f.url.split('/').pop()} ${f.status} ${f.bytes} B ${f.sha256.slice(0, 12)}`).join(', ')}); loaded Inter faces ${faces.length} (${faces.join('; ')}); widths 6969 ${widths.six9.toFixed(2)} and with ss01 ${widths.six9Open.toFixed(2)}, aaaa ${widths.a.toFixed(2)} and with cv11 ${widths.aSingle.toFixed(2)}, tnum 1111 ${widths.ones.toFixed(2)} and 0000 ${widths.zeros.toFixed(2)}`,
        );
        if (files.length !== 1 || latin.length !== 1)
          failures.push(
            `${path}: ${files.length} font files, ${latin.length} full answer(s) of the Latin file`,
          );
        for (const f of latin) {
          if (f.bytes !== LATIN.bytes)
            failures.push(`${path}: ${f.bytes} B, the record ${LATIN.bytes}`);
          if (f.sha256 !== LATIN.sha256)
            failures.push(`${path}: sha256 ${f.sha256}, not the record's`);
        }
        if (faces.length !== 1) failures.push(`${path}: ${faces.length} loaded Inter faces`);
        const near = (got: number, units: number, what: string): void => {
          if (Math.abs(got - expectedWidth(units)) > 1)
            failures.push(
              `${path}: ${what} ${got.toFixed(2)} px, ${expectedWidth(units).toFixed(2)} expected`,
            );
        };
        near(widths.six9, ADVANCE.six9, '6969');
        near(widths.six9Open, ADVANCE.six9Open, "6969 with 'ss01'");
        near(widths.a, ADVANCE.a, 'aaaa');
        near(widths.aSingle, ADVANCE.aSingle, "aaaa with 'cv11'");
        if (Math.abs(widths.ones - widths.zeros) > 0.01)
          failures.push(`${path}: tnum 1111 ${widths.ones} and 0000 ${widths.zeros}`);
      } finally {
        if (scratch.ids.size > 0) await teardownAll(page, scratch).catch(() => undefined);
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'face', description: readings.join(' | ') });
    expect(failures, 'one Inter file, the release, with its features in effect').toEqual([]);
  });

  row('chrome.font.no-stylistic-sets', async ({ browser }) => {
    test.setTimeout(1_200_000);
    const paths = [
      '/home',
      '/decks',
      '/decks/templates',
      '/new',
      '/signin',
      '/device',
      '/docs',
      '/docs/agents',
    ];
    const readings: string[] = [];
    const failures: string[] = [];
    let initialsRead = 0;
    for (const appearance of ['light', 'dark'] as const)
      for (const width of [1440, 390]) {
        const context = await contextIn(browser, appearance, width);
        const scratch = new Scratch();
        const page = await context.newPage();
        try {
          for (const path of paths) {
            await open(page, path, scratch);
            const { found, initials } = await alternatesOf(page);
            initialsRead += initials.length;
            readings.push(
              `${appearance} ${width} ${path}: ${found.length} element(s) with an alternate, ${initials.length} initials (${initials.slice(0, 3).join('; ')})`,
            );
            for (const f of found) failures.push(`${appearance} ${width} ${path}: ${f}`);
            for (const i of initials)
              if (/ss\d\d|cv\d\d|font-feature-settings/.test(i))
                failures.push(`${appearance} ${width} ${path}: the initials ${i}`);
          }
        } finally {
          if (scratch.ids.size > 0) await teardownAll(page, scratch).catch(() => undefined);
          await context.close();
        }
      }
    test.info().annotations.push({
      type: 'alternates',
      description: `${readings.join(' | ')}; initials read ${initialsRead}`,
    });
    expect(failures.slice(0, 40), 'no stylistic set or character variant outside a slide').toEqual(
      [],
    );
  });

  row('chrome.font.tabular-figures', async ({ browser }) => {
    test.setTimeout(1_200_000);
    const readings: string[] = [];
    const failures: string[] = [];
    for (const appearance of ['light', 'dark'] as const) {
      const context = await contextIn(browser, appearance, 1440);
      const scratch = new Scratch();
      const page = await context.newPage();
      try {
        await open(page, '/docs', scratch);
        const docs = await docsPages(page);
        for (const path of ['/home', '/decks', '/new', '/signin', '/device', ...docs]) {
          await open(page, path, scratch);
          const { read, proportional } = await figuresOf(page);
          readings.push(
            `${appearance} ${path}: ${read} number(s), ${proportional.length} proportional`,
          );
          for (const p of proportional) failures.push(`${appearance} ${path}: ${p}`);
        }
      } finally {
        if (scratch.ids.size > 0) await teardownAll(page, scratch).catch(() => undefined);
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'figures', description: readings.join(' | ') });
    expect(failures.slice(0, 40), 'every number alone draws tabular figures').toEqual([]);
  });

  return declared;
}
