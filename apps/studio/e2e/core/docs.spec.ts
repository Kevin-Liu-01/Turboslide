import { loadavg } from 'node:os';

import { chromium, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page, Request } from '@playwright/test';

import { coverage, extraHTTPHeaders, title } from './lib';
import { isCoreId } from './matrix';

// The docs at /docs (docs/POLISH-2.md 5, 6.5): the `help.docs.*` rows of lane D. A row's test is
// declared once its id is in the matrix (each push of the lane enters its own rows), so the file
// carries every row's driver from the first push. The pages are read from the site itself: the
// search index lists every page in the sidebar's order, which the rows walk.
//
// The scrollbar reading needs the bars drawn: Playwright's Chromium runs with `--hide-scrollbars`,
// so the page row launches one Chromium of its own without that switch (the shape of
// design-pages.ts) and reads the document's bar as `innerWidth - clientWidth`.
//
//   PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/docs.spec.ts

type Appearance = 'light' | 'dark';
type Index = { rows: { u: string; t: string; h: string; a: string; x: string }[] };

const WIDTHS = [1440, 390] as const;
const APPEARANCES: readonly Appearance[] = ['light', 'dark'];
const GROUPS = ['Use Turboslide', 'Agents', 'Reference'];

const DRIVEN: string[] = [];
function row(id: string, body: () => Promise<void>, timeout = 600_000): void {
  if (!isCoreId(id)) return;
  DRIVEN.push(id);
  test(title(id), async () => {
    test.setTimeout(timeout);
    await body();
  });
}

let bars: Browser | null = null;
let plain: Browser | null = null;
const contexts: BrowserContext[] = [];

test.afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => undefined);
  await bars?.close().catch(() => undefined);
  await plain?.close().catch(() => undefined);
});

function base(): string {
  return (process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4321').replace(/\/$/, '');
}

async function open(
  width: number,
  appearance: Appearance,
  options: { javaScript?: boolean; scrollbars?: boolean; clipboard?: boolean } = {},
): Promise<Page> {
  const browser: Browser =
    options.scrollbars === true
      ? (bars ??= await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] }))
      : (plain ??= await chromium.launch());
  const context = await browser.newContext({
    baseURL: base(),
    extraHTTPHeaders,
    viewport: { width, height: 900 },
    colorScheme: appearance,
    javaScriptEnabled: options.javaScript !== false,
    ...(options.clipboard === true ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}),
  });
  await context.addInitScript((theme) => {
    try {
      localStorage.setItem('gt-theme', theme);
    } catch {
      /* the system's appearance is the same here */
    }
  }, appearance);
  contexts.push(context);
  return context.newPage();
}

/** Every page's address in the sidebar's order, from the search index. */
async function pagesOf(page: Page): Promise<{ url: string; title: string }[]> {
  const response = await page.request.get(`${base()}/docs/search.json`, {
    headers: extraHTTPHeaders,
  });
  expect(response.status(), '/docs/search.json').toBe(200);
  const index = (await response.json()) as Index;
  const seen = new Map<string, string>();
  for (const entry of index.rows) if (!seen.has(entry.u)) seen.set(entry.u, entry.t);
  return [...seen].map(([url, name]) => ({ url, title: name }));
}

/** Waits until the docs page has hydrated (DocsShell stamps `data-hydrated` on its root). */
async function hydrated(page: Page): Promise<void> {
  await page.locator('[data-control="docs"][data-hydrated]').waitFor({ timeout: 120_000 });
}

/**
 * Waits out the router's view transition after a client navigation: while its snapshots fade the
 * document reads up to a scrollbar's width wider than the window.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          !(
            animation.effect instanceof KeyframeEffect &&
            (animation.effect.pseudoElement ?? '').startsWith('::view-transition')
          ),
      ),
  );
}

/** The facts of one docs view that the page row judges. */
type View = {
  bar: number;
  rails: boolean;
  lockup: boolean;
  documentation: boolean;
  searchPill: { visible: boolean; width: number; label: boolean };
  theme: boolean;
  newPresentation: boolean;
  pagesButton: boolean;
  groups: string[];
  current: string | null;
  h1: string;
  lead: string;
  copyPage: boolean;
  article: number;
  toc: boolean;
  tocItems: number;
  pager: { previous: boolean; next: boolean };
  radii: { name: string; radius: string }[];
  shadows: string[];
  scrollbar: number;
  sideScroll: boolean;
  /** how far the document runs past the window, in px (0 when it fits) */
  overflow: number;
  /** short inline code and kept words (mdx.tsx `Code`) drawn over two lines */
  brokenCode: string[];
};

async function viewOf(page: Page): Promise<View> {
  return page.evaluate(() => {
    const q = (selector: string): HTMLElement | null => document.querySelector(selector);
    const shown = (element: Element | null): boolean => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0;
    };
    const radius = (element: Element | null): string =>
      element === null ? 'absent' : getComputedStyle(element).borderTopLeftRadius;
    const radii: { name: string; radius: string }[] = [];
    const add = (name: string, selector: string): void => {
      const element = document.querySelector(selector);
      if (element !== null) radii.push({ name, radius: radius(element) });
    };
    add('button 6', '[data-control="docs.copyPage"]');
    add('search pill 6', '[data-control="docs.search.open"]');
    add('new 6', '[data-control="docs.bar.new"]');
    add('tab 6', '.ts-docs-tablist .pt-ib');
    add('code 8', '.ts-docs-code');
    add('callout 8', '.ts-docs-callout');
    add('card 8', '.ts-docs-card');
    add('pager 8', '.ts-docs-pager-link');
    add('step 4', '.ts-docs-step-n');
    add('key 4', '.ts-docs kbd.pt-kbd');
    add('row 0', '.ts-docs-nav-link');
    add('toc 0', '.ts-docs-toc a');
    /* a shadow with an offset or a blur, anywhere in the page */
    const shadows: string[] = [];
    for (const element of document.querySelectorAll('*')) {
      const value = getComputedStyle(element).boxShadow;
      if (value === 'none' || value === '') continue;
      for (const layer of value.split(/,(?![^(]*\))/)) {
        const lengths =
          layer.replace(/rgba?\([^)]*\)|oklch\([^)]*\)|#\w+/g, '').match(/-?\d+(?:\.\d+)?px/g) ??
          [];
        const [x = '0px', y = '0px', blur = '0px'] = lengths;
        if (parseFloat(x) !== 0 || parseFloat(y) !== 0 || parseFloat(blur) !== 0)
          shadows.push(`${element.className}: ${layer.trim()}`);
      }
    }
    const pill = q('[data-control="docs.search.open"]');
    const groups = [
      ...document.querySelectorAll('[data-control="docs.nav"] .ts-docs-nav-label'),
    ].map((label) => label.textContent?.trim() ?? '');
    const current = q('[data-control="docs.nav"] [aria-current="page"]');
    const side = q('.ts-docs-side');
    return {
      bar: q('.ts-page-frame-row')?.getBoundingClientRect().height ?? 0,
      rails: q('.ts-docs .ts-rails') !== null,
      lockup: shown(q('.ts-docs .ts-brand-lockup')),
      documentation: shown(q('[data-control="docs.bar.documentation"]')),
      searchPill: {
        visible: shown(pill),
        width: pill?.getBoundingClientRect().width ?? 0,
        label:
          shown(q('.ts-docs-search-label.is-long')) || shown(q('.ts-docs-search-label.is-short')),
      },
      theme: shown(q('.ts-docs [data-control="view.theme"]')),
      newPresentation: shown(q('[data-control="docs.bar.new"]')),
      pagesButton: shown(q('[data-control="docs.menu"]')),
      groups,
      current: current?.textContent?.trim() ?? null,
      h1: q('.ts-docs-title')?.textContent?.trim() ?? '',
      lead: q('.ts-docs-lead')?.textContent?.trim() ?? '',
      copyPage: shown(q('[data-control="docs.copyPage"]')),
      article: q('.ts-docs-article')?.getBoundingClientRect().width ?? 0,
      toc: shown(q('[data-control="docs.toc"]')),
      tocItems: document.querySelectorAll('[data-control="docs.toc"] li').length,
      pager: {
        previous: shown(q('[data-control="docs.previous"]')),
        next: shown(q('[data-control="docs.next"]')),
      },
      radii,
      shadows,
      scrollbar: window.innerWidth - document.documentElement.clientWidth,
      sideScroll: side?.classList.contains('pt-scroll') ?? false,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenCode: [...document.querySelectorAll('code.is-short, code > .ts-docs-keep')]
        .filter((element) => element.getClientRects().length > 1)
        .map((element) => element.textContent ?? ''),
    };
  });
}

/** Sentence case: in a title of three words or more, a word after the first is lower case. */
function sentenceCase(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word));
  if (words.length < 3) return true;
  return words.slice(1).some((word) => /^[a-z]/.test(word));
}

const RADIUS_WANT: Record<string, string> = {
  '6': '6px',
  '8': '8px',
  '4': '4px',
  '0': '0px',
};

function judgeView(
  view: View,
  width: number,
  url: string,
  first: boolean,
  last: boolean,
): string[] {
  const faults: string[] = [];
  if (Math.round(view.bar) !== 58) faults.push(`bar ${view.bar} px`);
  if (!view.rails) faults.push('no rails');
  if (!view.lockup) faults.push('no lockup');
  if (!view.theme) faults.push('no theme button');
  if (width >= 720) {
    if (!view.documentation) faults.push('no Documentation in the bar');
    if (!view.searchPill.visible || !view.searchPill.label) faults.push('no search pill');
    if (!view.newPresentation) faults.push('no New Presentation');
    if (view.pagesButton) faults.push('a Pages button at 720 px and over');
    if (JSON.stringify(view.groups) !== JSON.stringify(GROUPS))
      faults.push(`groups ${JSON.stringify(view.groups)}`);
    if (view.current === null) faults.push('no current page in the sidebar');
  } else {
    if (view.documentation) faults.push('Documentation in the bar under 720 px');
    if (
      !view.searchPill.visible ||
      Math.round(view.searchPill.width) !== 32 ||
      view.searchPill.label
    )
      faults.push(`search is not an icon button (${view.searchPill.width} px)`);
    if (!view.pagesButton) faults.push('no Pages button');
  }
  if (view.h1 === '' || !sentenceCase(view.h1)) faults.push(`title "${view.h1}"`);
  if (view.lead === '') faults.push('no description');
  if (!view.copyPage) faults.push('no Copy Page');
  if (view.article > 640.5) faults.push(`article ${view.article} px`);
  if (width >= 1180 && view.tocItems > 0 && !view.toc) faults.push('no table of contents');
  if (width < 1180 && view.toc) faults.push('a table of contents under 1180 px');
  if (!first && !view.pager.previous) faults.push('no Previous');
  if (!last && !view.pager.next) faults.push('no Next');
  for (const { name, radius } of view.radii) {
    const want = RADIUS_WANT[name.split(' ')[1] ?? ''];
    if (want !== undefined && radius !== want)
      faults.push(`${name.split(' ')[0]} corner ${radius}`);
  }
  if (view.shadows.length > 0) faults.push(`shadows ${view.shadows.slice(0, 3).join('; ')}`);
  if (!view.sideScroll) faults.push('the sidebar is not .pt-scroll');
  if (view.overflow > 0) faults.push(`the document is ${view.overflow} px wider than the window`);
  if (view.brokenCode.length > 0) faults.push(`code over two lines: ${view.brokenCode.join(', ')}`);
  return faults.map((fault) => `${url} at ${width}: ${fault}`);
}

row('help.docs.page', async () => {
  const probe = await open(1440, 'light');
  const pages = await pagesOf(probe);
  expect(pages.length, 'pages in the index').toBeGreaterThan(0);
  /* every page answers 200 */
  for (const { url } of pages) {
    const response = await probe.request.get(`${base()}${url}`, { headers: extraHTTPHeaders });
    expect(response.status(), url).toBe(200);
  }
  const faults: string[] = [];
  const readings: string[] = [];
  for (const width of WIDTHS)
    for (const appearance of APPEARANCES) {
      const page = await open(width, appearance, { scrollbars: true });
      await page.goto(pages[0]?.url ?? '/docs');
      await hydrated(page);
      for (const [at, { url }] of pages.entries()) {
        if (at > 0) {
          /* the next page by its Next link, a client navigation */
          await page.locator('[data-control="docs.next"]').click();
          await page.waitForURL((address) => address.pathname.replace(/\/$/, '') === url, {
            timeout: 60_000,
          });
        }
        await expect(page.locator('.ts-docs-title')).toHaveText(pages[at]?.title ?? '', {
          timeout: 60_000,
        });
        await settled(page);
        const view = await viewOf(page);
        faults.push(...judgeView(view, width, url, at === 0, at === pages.length - 1));
        if (at === 0) {
          readings.push(
            `${width} ${appearance}: bar ${view.bar}, article ${Math.round(view.article)}, scrollbar ${view.scrollbar}, corners ${view.radii.map((r) => `${r.name}=${r.radius}`).join(' ')}`,
          );
          if (width >= 720 && view.scrollbar !== 8)
            faults.push(
              `${url} at ${width}: the document's scrollbar is ${view.scrollbar} px, not the shared 8`,
            );
        }
      }
      if (width < 720) {
        /* the Pages button opens the sidebar as a sheet; Escape closes it */
        await page.locator('[data-control="docs.menu"]').click();
        const sheet = page.locator('[data-control="docs.sheet"]');
        await expect(sheet).toBeVisible();
        const sheetFacts = await sheet.evaluate((element) => ({
          radius: getComputedStyle(element).borderTopLeftRadius,
          links: element.querySelectorAll('a').length,
          layer: element.closest('[data-layer]')?.getAttribute('data-layer') ?? null,
        }));
        if (sheetFacts.radius !== '8px') faults.push(`the sheet's corner ${sheetFacts.radius}`);
        if (sheetFacts.links < pages.length)
          faults.push(`the sheet lists ${sheetFacts.links} pages`);
        if (sheetFacts.layer !== 'dialog') faults.push(`the sheet's layer ${sheetFacts.layer}`);
        await page.keyboard.press('Escape');
        await expect(sheet).toBeHidden();
      }
    }
  /* no page scrolls sideways at 320 and 768 either (1440 and 390 are read above) */
  for (const width of [320, 768]) {
    const page = await open(width, 'light');
    await page.goto(pages[0]?.url ?? '/docs');
    await hydrated(page);
    for (const [at, { url, title: name }] of pages.entries()) {
      if (at > 0) {
        await page.locator('[data-control="docs.next"]').click();
        await page.waitForURL((address) => address.pathname.replace(/\/$/, '') === url, {
          timeout: 60_000,
        });
      }
      await expect(page.locator('.ts-docs-title')).toHaveText(name, { timeout: 60_000 });
      await settled(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0)
        faults.push(`${url} at ${width}: the document is ${overflow} px wider than the window`);
    }
  }
  /* a miss under /docs: the docs layout with the three closest pages, 404 */
  const miss = await open(1440, 'light');
  const response = await miss.goto('/docs/editr');
  expect(response?.status(), 'the miss answers 404').toBe(404);
  await expect(miss.locator('[data-control="docs.miss"]')).toBeVisible();
  await expect(miss.locator('[data-control="docs.nav"]')).toBeVisible();
  await expect(miss.locator('[data-control="docs.miss.page"]')).toHaveCount(3);
  test.info().annotations.push({ type: 'measure', description: readings.join(' | ') });
  expect(faults, faults.join('\n')).toEqual([]);
});

row('help.docs.prerendered', async () => {
  const live = await open(1440, 'light');
  const pages = await pagesOf(live);
  const home = await live.request.get(`${base()}/home`, { headers: extraHTTPHeaders });
  const homeCache = home.headers()['cache-control'] ?? '(none)';
  const off = await open(1440, 'light', { javaScript: false });
  const faults: string[] = [];
  for (const { url } of pages) {
    await live.goto(url);
    await hydrated(live);
    const want = await live.evaluate(() => ({
      title: document.querySelector('.ts-docs-title')?.textContent?.trim() ?? '',
      lead: document.querySelector('.ts-docs-lead')?.textContent?.trim() ?? '',
      headings: [...document.querySelectorAll('.ts-docs-body-text h2, .ts-docs-body-text h3')].map(
        (h) => h.textContent?.trim() ?? '',
      ),
      text: (document.querySelector('.ts-docs-body-text')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    }));
    const response = await off.goto(url);
    const cache = response?.headers()['cache-control'] ?? '(none)';
    if (cache !== homeCache) faults.push(`${url}: cache-control ${cache}, /home ${homeCache}`);
    const got = await off.evaluate(() => ({
      title: document.querySelector('.ts-docs-title')?.textContent?.trim() ?? '',
      lead: document.querySelector('.ts-docs-lead')?.textContent?.trim() ?? '',
      headings: [...document.querySelectorAll('.ts-docs-body-text h2, .ts-docs-body-text h3')].map(
        (h) => h.textContent?.trim() ?? '',
      ),
      text: (document.querySelector('.ts-docs-body-text')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    }));
    if (got.title !== want.title) faults.push(`${url}: title "${got.title}"`);
    if (got.lead !== want.lead) faults.push(`${url}: description "${got.lead}"`);
    if (JSON.stringify(got.headings) !== JSON.stringify(want.headings))
      faults.push(`${url}: headings ${got.headings.length} of ${want.headings.length}`);
    if (got.text !== want.text || got.text.length < 200)
      faults.push(`${url}: article text ${got.text.length} of ${want.text.length} characters`);
  }
  test.info().annotations.push({
    type: 'measure',
    description: `pages ${pages.length}; /home cache-control ${homeCache}`,
  });
  expect(faults, faults.join('\n')).toEqual([]);
});

/** A request the nav-client row counts: a script, a document, a server function. */
function kindOf(request: Request): 'serverFn' | 'staticCache' | 'document' | 'script' | null {
  const url = request.url();
  if (url.includes('/_serverFn')) return 'serverFn';
  if (url.includes('/__tsr/staticServerFnCache')) return 'staticCache';
  if (request.resourceType() === 'document') return 'document';
  if (request.resourceType() === 'script') return 'script';
  return null;
}

row('help.docs.nav-client', async () => {
  const page = await open(1440, 'light');
  const pages = await pagesOf(page);
  /* a page of the splat route with a page after it, and a third page to reach from the sidebar */
  const start = pages.findIndex((entry, at) => entry.url !== '/docs' && at < pages.length - 1);
  expect(start, 'a page with a next page').toBeGreaterThanOrEqual(0);
  const next = pages[start + 1];
  const other =
    pages.find((entry, at) => at !== start && at !== start + 1 && entry.url !== '/docs') ??
    pages[start];
  await page.goto(pages[start]?.url ?? '/docs');
  await hydrated(page);
  await page.waitForLoadState('networkidle');
  const steps: { how: string; to: string; requests: string[]; faults: string[] }[] = [];
  const step = async (
    how: string,
    to: { url: string; title: string },
    click: () => Promise<void>,
  ) => {
    const seen: Request[] = [];
    const listen = (request: Request): void => {
      if (kindOf(request) !== null) seen.push(request);
    };
    page.on('request', listen);
    await click();
    await page.waitForURL((address) => address.pathname.replace(/\/$/, '') === to.url, {
      timeout: 60_000,
    });
    await expect(page.locator('.ts-docs-title')).toHaveText(to.title, { timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    page.off('request', listen);
    const faults: string[] = [];
    const scripts = seen.filter((request) => kindOf(request) === 'script');
    for (const request of seen) {
      const kind = kindOf(request);
      if (kind === 'serverFn' || kind === 'staticCache' || kind === 'document')
        faults.push(`${kind} ${request.url()}`);
    }
    /* that page's chunk alone: one script on a build, the page's MDX module and nothing else on
       the dev server */
    const others = scripts.filter((request) => !/\.mdx(?:[?&]|$)/.test(request.url()));
    if (scripts.length > 1 && others.length > 0)
      faults.push(
        `scripts ${scripts.map((request) => request.url().replace(/^https?:\/\/[^/]+/, '')).join(', ')}`,
      );
    steps.push({
      how,
      to: to.url,
      requests: seen.map(
        (request) => `${kindOf(request)} ${request.url().replace(/^https?:\/\/[^/]+/, '')}`,
      ),
      faults,
    });
  };
  if (next !== undefined)
    await step('Next', next, () => page.locator('[data-control="docs.next"]').click());
  if (other !== undefined)
    await step('the sidebar', other, () =>
      page.locator(`[data-control="docs.nav"] a[href="${other.url}"]`).click(),
    );
  test.info().annotations.push({
    type: 'measure',
    description: steps
      .map((s) => `${s.how} -> ${s.to}: ${s.requests.join(', ') || 'no request'}`)
      .join(' | '),
  });
  const faults = steps.flatMap((s) => s.faults.map((fault) => `${s.how}: ${fault}`));
  expect(faults, faults.join('\n')).toEqual([]);
});

row('help.docs.search', async () => {
  const faults: string[] = [];
  const readings: string[] = [];
  for (const chord of ['Meta+k', 'Control+k', '/'] as const) {
    const page = await open(1440, 'light');
    const asked: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/docs/search.json')) asked.push(request.url());
    });
    await page.goto('/docs/editor');
    await hydrated(page);
    await page.waitForLoadState('networkidle');
    if (asked.length > 0) faults.push(`${chord}: the index was requested before the first open`);
    const opener = page.locator('[data-control="docs.copyPage"]');
    await opener.focus();
    await page.keyboard.press(chord);
    const window_ = page.locator('[data-control="docs.search.window"]');
    await expect(window_).toBeVisible({ timeout: 30_000 });
    const facts = await window_.evaluate((element) => ({
      radius: getComputedStyle(element).borderTopLeftRadius,
      layer: element.closest('[data-layer]')?.getAttribute('data-layer') ?? null,
      focused: document.activeElement?.getAttribute('data-control') ?? null,
    }));
    if (facts.radius !== '8px') faults.push(`${chord}: the window's corner ${facts.radius}`);
    if (facts.layer !== 'dialog') faults.push(`${chord}: the window's layer ${facts.layer}`);
    if (facts.focused !== 'docs.search.field') faults.push(`${chord}: focus on ${facts.focused}`);
    if (chord !== 'Meta+k') {
      await page.keyboard.press('Escape');
      await expect(window_).toBeHidden();
      const back = await page.evaluate(
        () => document.activeElement?.getAttribute('data-control') ?? null,
      );
      if (back !== 'docs.copyPage') faults.push(`${chord}: Escape left the focus on ${back}`);
      continue;
    }
    await page.keyboard.type('theme', { delay: 60 });
    const hits = page.locator('[data-control="docs.search.hit"]');
    await expect(hits.first()).toBeVisible({ timeout: 30_000 });
    const first = (await hits.first().locator('.ts-docs-search-head').textContent())?.trim() ?? '';
    const texts = await hits.allTextContents();
    readings.push(
      `"theme": ${texts.length} hits, first "${first}"; index requests ${asked.length}`,
    );
    if (!first.startsWith('Themes and brand kits')) faults.push(`the first hit is "${first}"`);
    if (texts.some((text) => /Copy Page/.test(text))) faults.push('a hit holds Copy Page');
    if (asked.length !== 1) faults.push(`the index was requested ${asked.length} times`);
    await page.keyboard.press('Enter');
    await page.waitForURL((address) => address.pathname === '/docs/themes', { timeout: 60_000 });
    await expect(window_).toBeHidden();
  }
  test.info().annotations.push({ type: 'measure', description: readings.join(' | ') });
  expect(faults, faults.join('\n')).toEqual([]);
});

/** A twin's markdown with its code blocks taken out, for the reads that must not see code. */
function prose(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '');
}

row('help.docs.twin', async () => {
  const page = await open(1440, 'light');
  const pages = await pagesOf(page);
  const faults: string[] = [];
  const forms = { quote: 0, numbered: 0, tabs: 0, cards: 0 };
  for (const { url } of pages) {
    const twin = url === '/docs' ? '/docs/index.md' : `${url}.md`;
    const response = await page.request.get(`${base()}${twin}`, { headers: extraHTTPHeaders });
    if (response.status() !== 200) {
      faults.push(`${twin}: ${response.status()}`);
      continue;
    }
    const type = response.headers()['content-type'] ?? '';
    if (type !== 'text/markdown; charset=utf-8') faults.push(`${twin}: content-type ${type}`);
    const link = response.headers()['link'] ?? '';
    if (!new RegExp(`<https?://[^>]+${url.replace(/\//g, '\\/')}>; rel="canonical"`).test(link))
      faults.push(`${twin}: link ${link}`);
    const text = prose(await response.text());
    if (/<[A-Z][A-Za-z]*[\s/>]/.test(text)) faults.push(`${twin}: a JSX tag`);
    if (/^import\s|^export\s/m.test(text)) faults.push(`${twin}: an import or export`);
    if (/^#{1,6} .*(?:\[#[^\]]+\]|\{#[^}]+\})\s*$/m.test(text))
      faults.push(`${twin}: a heading id suffix`);
    if (/^> \*\*[^*]+\.\*\*/m.test(text)) forms.quote += 1;
    if (/^1\. \*\*/m.test(text)) forms.numbered += 1;
    if (/^- \[[^\]]+\]\(\/[^)]*\)/m.test(text)) forms.cards += 1;
    if (/^#{3,6} (?:Command line|MCP|HTTP|Browser)$/m.test(text)) forms.tabs += 1;
    await page.goto(url);
    const alternate = await page
      .locator('link[rel="alternate"][type="text/markdown"]')
      .getAttribute('href');
    if (alternate !== twin) faults.push(`${url}: alternate ${alternate}`);
  }
  if (forms.quote === 0 || forms.numbered === 0 || forms.tabs === 0 || forms.cards === 0)
    faults.push(`component forms seen ${JSON.stringify(forms)}`);
  const llms = await (
    await page.request.get(`${base()}/llms.txt`, { headers: extraHTTPHeaders })
  ).text();
  const documentation = llms.split(/^## /m).find((section) => section.startsWith('Documentation'));
  if (documentation === undefined) faults.push('/llms.txt has no Documentation section');
  else
    for (const { url } of pages) {
      const twin = url === '/docs' ? '/docs/index.md' : `${url}.md`;
      if (!documentation.includes(`(${twin})`)) faults.push(`/llms.txt does not list ${twin}`);
    }
  const full = await page.request.get(`${base()}/docs/llms-full.txt`, {
    headers: extraHTTPHeaders,
  });
  if (full.status() !== 200) faults.push(`/docs/llms-full.txt: ${full.status()}`);
  const fullText = await full.text();
  for (const { url, title: name } of pages)
    if (!url.startsWith('/docs/reference') && !fullText.includes(`# ${name}`))
      faults.push(`/docs/llms-full.txt has no page ${name}`);
  test.info().annotations.push({
    type: 'measure',
    description: `pages ${pages.length}; forms ${JSON.stringify(forms)}`,
  });
  expect(faults, faults.join('\n')).toEqual([]);
});

row('help.docs.copy-page', async () => {
  const faults: string[] = [];
  for (const target of ['/docs/editor', '/docs/reference']) {
    const page = await open(1440, 'light', { clipboard: true });
    await page.goto(target);
    await hydrated(page);
    await page.locator('[data-control="docs.copyPage"]').click();
    await expect(page.locator('[data-control="docs.copyPage"] .ts-docs-swap')).toHaveAttribute(
      'data-state',
      'copied',
      { timeout: 30_000 },
    );
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const twin = `${target}.md`;
    const served = await (
      await page.request.get(`${base()}${twin}`, { headers: extraHTTPHeaders })
    ).text();
    if (copied !== served)
      faults.push(
        `${target}: the clipboard holds ${copied.length} characters, the twin ${served.length}`,
      );
    await page.locator('[data-control="docs.copyPage.menu"]').click();
    const plate = page.locator('[data-control="docs.copyPage.plate"]');
    await expect(plate).toBeVisible({ timeout: 30_000 });
    const facts = await plate.evaluate((element) => ({
      radius: getComputedStyle(element).borderTopLeftRadius,
      layer:
        element.closest('[data-layer]')?.getAttribute('data-layer') ??
        element.getAttribute('data-layer'),
      rows: [...element.querySelectorAll('a')].map((a) => ({
        label: a.querySelector('.ts-docs-menu-label')?.textContent?.trim() ?? '',
        href: a.getAttribute('href') ?? '',
      })),
    }));
    if (facts.radius !== '6px') faults.push(`${target}: the menu's corner ${facts.radius}`);
    if (facts.layer !== 'popover') faults.push(`${target}: the menu's layer ${facts.layer}`);
    const want = [
      ['View as Markdown', twin],
      ['llms.txt', '/llms.txt'],
      ['Full documentation for agents', '/docs/llms-full.txt'],
      ['Open in Claude', 'https://claude.ai/new?q='],
      ['Open in ChatGPT', 'https://chatgpt.com/?hints=search&q='],
      ...(target === '/docs/reference' ? [['OpenAPI document', '/openapi.json']] : []),
    ];
    const got = facts.rows.map((r) => r.label);
    if (JSON.stringify(got) !== JSON.stringify(want.map((w) => w[0])))
      faults.push(`${target}: rows ${got.join(', ')}`);
    for (const [label, href] of want) {
      const found = facts.rows.find((r) => r.label === label);
      if (found === undefined || !found.href.startsWith(href ?? ''))
        faults.push(`${target}: ${label} -> ${found?.href}`);
    }
    await page.keyboard.press('Escape');
    await expect(plate).toBeHidden();
  }
  expect(faults, faults.join('\n')).toEqual([]);
});

row('help.docs.reference', async () => {
  const page = await open(1440, 'light');
  const get = async (path: string): Promise<unknown> =>
    (await page.request.get(`${base()}${path}`, { headers: extraHTTPHeaders })).json();
  const faults: string[] = [];
  const openapi = (await get('/openapi.json')) as { paths: Record<string, unknown> };
  /* the endpoints of the actions, not the template path `/api/actions/{id}` */
  const actionPaths = Object.keys(openapi.paths).filter(
    (path) => path.startsWith('/api/actions/') && !path.includes('{'),
  );
  await page.goto('/docs/reference');
  await hydrated(page);
  const counts = await page.locator('[data-control="docs.reference.counts"]').textContent();
  test.info().annotations.push({
    type: 'measure',
    description: `counts "${counts}"; openapi action paths ${actionPaths.length}`,
  });
  if (counts === null || !counts.includes(String(actionPaths.length)))
    faults.push(`/docs/reference counts "${counts}" name no ${actionPaths.length} HTTP actions`);
  const twin = await (
    await page.request.get(`${base()}/docs/reference.md`, { headers: extraHTTPHeaders })
  ).text();
  const groups = [...twin.matchAll(/\]\(\/docs\/reference\/([a-z-]+)\)/g)].map((m) => m[1] ?? '');
  if (groups.length === 0) faults.push('/docs/reference lists no group');
  let sections = 0;
  for (const group of groups) {
    const text = await (
      await page.request.get(`${base()}/docs/reference/${group}.md`, { headers: extraHTTPHeaders })
    ).text();
    for (const section of text.split(/^## /m).slice(1)) {
      sections += 1;
      /* markdown may escape a character of the heading (`view\\.goto`) */
      const id = (section.split('\n')[0] ?? '').trim().replace(/\\(.)/g, '$1');
      if (!/^[a-z]+\.[A-Za-z.]+$/.test(id)) faults.push(`${group}: a section "${id}"`);
      if (!/turboslide /.test(section) && !/No CLI command/.test(section))
        faults.push(`${id}: no CLI usage`);
      if (!/`deck_[a-z_]+`|No MCP tool/.test(section)) faults.push(`${id}: no MCP tool`);
      if (!/POST \/api\/actions\/|No HTTP endpoint/.test(section))
        faults.push(`${id}: no HTTP endpoint`);
    }
  }
  const pages = await pagesOf(page);
  for (const { url } of pages) {
    if (url.startsWith('/docs/reference')) continue;
    const text = await (
      await page.request.get(`${base()}${url === '/docs' ? '/docs/index.md' : `${url}.md`}`, {
        headers: extraHTTPHeaders,
      })
    ).text();
    if (/\b\d{2,3} actions\b/.test(prose(text))) faults.push(`${url} types a count of actions`);
  }
  if (sections < 100) faults.push(`${sections} action sections`);
  expect(faults, faults.join('\n')).toEqual([]);
});

row('help.docs.links', async () => {
  const faults: string[] = [];
  const page = await open(1440, 'light');
  await page.goto('/home');
  const nav = page.locator('[data-control="home.nav.docs"]');
  const navFacts = await nav.evaluate((element) => ({
    href: element.getAttribute('href'),
    target: element.getAttribute('target'),
    glyph: getComputedStyle(element, '::after').content,
  }));
  if (
    navFacts.href !== '/docs' ||
    navFacts.target !== null ||
    (navFacts.glyph !== 'none' && navFacts.glyph !== 'normal')
  )
    faults.push(`the navigation's Documentation ${JSON.stringify(navFacts)}`);
  const foot = page.locator('[data-control="home.foot.docs"]');
  const footFacts = await foot.evaluate((element) => ({
    href: element.getAttribute('href'),
    target: element.getAttribute('target'),
    glyph: getComputedStyle(element, '::after').content,
  }));
  if (
    footFacts.href !== '/docs' ||
    footFacts.target !== null ||
    (footFacts.glyph !== 'none' && footFacts.glyph !== 'normal')
  )
    faults.push(`the footer's Documentation ${JSON.stringify(footFacts)}`);
  const robots = await (
    await page.request.get(`${base()}/robots.txt`, { headers: extraHTTPHeaders })
  ).text();
  const sitemapLine = /^Sitemap: (\S+)$/m.exec(robots)?.[1] ?? null;
  if (sitemapLine === null || !sitemapLine.endsWith('/sitemap.xml'))
    faults.push(`robots.txt sitemap line ${sitemapLine}`);
  const sitemap = await (
    await page.request.get(`${base()}/sitemap.xml`, { headers: extraHTTPHeaders })
  ).text();
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => new URL(m[1] ?? '').pathname,
  );
  const pages = await pagesOf(page);
  for (const want of ['/home', ...pages.map((p) => p.url)])
    if (!locs.includes(want)) faults.push(`the sitemap does not list ${want}`);
  /* Help > Help in the editor: Documentation opens /docs in a new tab */
  await page.goto('/new');
  await page.locator('[data-control="menubar.help"]').click({ timeout: 300_000 });
  await page.locator('[data-control="menu.help.help"]').click({ timeout: 30_000 });
  const link = page.locator('[data-control="dialog.help.docs"]');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const help = { href: await link.getAttribute('href'), target: await link.getAttribute('target') };
  if (help.href !== '/docs' || help.target !== '_blank')
    faults.push(`Help's Documentation ${JSON.stringify(help)}`);
  /* the link is drawn in the dialog's ink with an underline, not the browser's link blue */
  const ink = await link.evaluate((element) => ({
    link: getComputedStyle(element).color,
    title: getComputedStyle(document.querySelector('.ts-dialog-title') ?? element).color,
    line: getComputedStyle(element).textDecorationLine,
  }));
  if (ink.link !== ink.title || ink.line !== 'underline')
    faults.push(`Help's Documentation is drawn ${JSON.stringify(ink)}`);
  const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await tab.waitForLoadState('domcontentloaded');
  if (new URL(tab.url()).pathname !== '/docs') faults.push(`the new tab opened ${tab.url()}`);
  test.info().annotations.push({
    type: 'measure',
    description: `load ${loadavg()[0]?.toFixed(0)} (links, headers and bytes; no timing)`,
  });
  expect(faults, faults.join('\n')).toEqual([]);
});

coverage(import.meta.filename, DRIVEN);
