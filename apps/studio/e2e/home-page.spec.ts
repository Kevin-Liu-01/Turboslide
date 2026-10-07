import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { BOOT_LIMIT_BYTES } from '../src/components/home/boot';
import { BOOT_SCRIPT } from '../src/components/home/boot.generated';
import {
  AGENTS,
  CANVAS,
  EXPORT,
  FEATURES,
  HERO,
  PATTERNS,
  PEOPLE,
  PRESENT,
  REPORT_WORDS,
  TAILOR,
} from '../src/components/home/copy';
import {
  CLOSE_ROUND,
  HERO_ROUND,
  KITS_ROUND,
  MENUS_ROUND,
} from '../src/components/home/design-copy';
import { HOME_META } from '../src/components/home/home-meta';

// The landing, /home (docs/LANDING.md section 2; V4's file, restated for the second pass in V4's
// hunk of V1#8). The page's own rows are the `home.*` rows of core/home.spec.ts and the
// `decks.home.*` rows of core/decks.spec.ts; this spec keeps the checks of the page those rows do
// not hold: the server's HTML (main#top, the h1 as page text, the visit sentence, the head, the
// boot script as main's first child, the first screen's ten slide instances in the markup), the
// bands' h2s in section 2's order for the bands the tree renders, the shared theme button of the
// navigation (docs/DESIGN.md 8.1) switching the appearance, every same origin link and the buttons' routes, the GitHub links, the
// footer lockup, the rendered copy's rules (2.17), the Speculation Rules script, the shader only in
// the patterns band's chunk and only once the band nears, and CLS 0 over the load and a full
// scroll at 1440 and 390. Runs against a lane's server with PLAYWRIGHT_BASE_URL (AGENTS.md dev
// server rules) or the runner's 4321.

/** Each band's h2 in section 2's order; a band joins the page in its push (LANDING.md 6.8). */
const BAND_H2: readonly (readonly [string, string])[] = [
  ['menus', MENUS_ROUND.h2],
  ['canvas', CANVAS.h2],
  ['tailor', TAILOR.h2],
  ['kits', KITS_ROUND.h2],
  ['agents', AGENTS.h2],
  ['people', PEOPLE.h2],
  ['present', PRESENT.h2],
  ['export', EXPORT.h2],
  ['patterns', PATTERNS.h2],
  ['features', FEATURES.h2],
  ['close', CLOSE_ROUND.h2],
];

/** The h2s of the bands this page renders, in section 2's order. */
function h2Of(bands: readonly string[]): string[] {
  return BAND_H2.filter(([band]) => bands.includes(band)).map(([, h2]) => h2);
}

type Theme = 'light' | 'dark';

const OBSERVERS = `
  window.__cls = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls.push(+e.value.toFixed(4)); }).observe({ type: 'layout-shift', buffered: true }); } catch {}
`;

async function openHome(page: Page, theme: Theme = 'light'): Promise<void> {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('gt-theme', value);
    } catch {
      // private mode
    }
  }, theme);
  await page.addInitScript(OBSERVERS);
  const response = await page.goto('/home');
  expect(response?.status()).toBe(200);
  await page.locator('main.ts-product[data-hydrated]').waitFor({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** A full native scroll by the wheel, then back to the top. */
async function humanScroll(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  for (let y = 0; y < height - vh; y += 640) {
    await page.mouse.wheel(0, 640);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
}

test("the server's HTML carries main#top, the h1, the head, the boot script and the slides", async ({
  request,
}) => {
  const response = await request.get('/home');
  expect(response.status()).toBe(200);
  /* the server escapes the apostrophe of the lead as an entity */
  const html = (await response.text()).replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  expect(html).toMatch(/<main[^>]*\bid="top"[^>]*>/);
  expect(html).toMatch(/<main[^>]*\bclass="ts-product"[^>]*>/);
  expect(html).toMatch(/<main[^>]*\bdata-page="home"[^>]*>/);
  for (const line of HERO_ROUND.h1Lines) expect(html).toContain(line);
  /* the h1 is page text, in no slide (2.2) */
  expect(html).toMatch(/<h1[^>]*>[\s\S]*?Presentations for/);
  expect(/data-home-slides[^>]*>(?:(?!<\/section>)[\s\S])*<h1/.test(html)).toBe(false);
  /* the lead's first sentence is the visit sentence, the first visit's in the markup, in one run of
     text with the rest of the lead (docs/DESIGN.md 8.2, the design round's finishing round 2) */
  const run = `${HERO.visit[0]!} ${HERO_ROUND.lead}`.replace(/[.,]/g, (c) => `\\${c}`);
  expect(html).toMatch(new RegExp(`data-visit[^>]*>${run}<`));
  expect(html).toContain(HERO_ROUND.lead);
  expect(html).toContain(`<title>${HOME_META.title}</title>`);
  expect(html).toMatch(/property="og:url" content="[^"]*\/home"/);
  expect(html).toMatch(/property="og:image" content="[^"]*\/og\/turboslide\.png"/);
  if (process.env.TURBOSLIDE_PUBLIC_ORIGIN === undefined)
    expect(html).toContain('property="og:url" content="https://www.turboslide.com/home"');
  expect(html).not.toMatch(/name="robots" content="noindex"/);
  /* the rules script is in the document, as the browser must read it before any script runs */
  expect(html).toContain('<script type="speculationrules"');
  /* the boot script is main's first child once the build wrote it (LANDING.md 6.1; l4.md M1) */
  if (BOOT_SCRIPT !== '') {
    expect(Buffer.byteLength(BOOT_SCRIPT)).toBeLessThanOrEqual(BOOT_LIMIT_BYTES);
    const first = /<main[^>]*>\s*<script[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(first?.[1]).toBe(BOOT_SCRIPT);
  }
  /* the first screen's ten slide instances (the frame's slide 1 and its nine thumbnails) are in
     the markup, rendered by the server; every other instance travels in its band's chunk (2.0) */
  expect((html.match(/\bdata-home-slides\b/g) ?? []).length).toBe(10);
  /* the navigation's theme button is the editor's (DESIGN.md 8.1), in the server's markup */
  expect(html).toContain('data-control="view.theme"');
});

test('the page holds one h1 and the bands h2s in the order of section 2', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.locator('main h1')).toHaveText(HERO_ROUND.heading);
  const bands = await page
    .locator('main [data-band]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['band'] ?? ''));
  expect(await page.locator('main h2').allTextContents()).toEqual(h2Of(bands));
  /* no icon before a heading (DECK-GRAMMAR 40) */
  await expect(page.locator('main h1 svg, main h2 svg')).toHaveCount(0);
});

for (const theme of ['dark', 'light'] as const) {
  test(`the theme button switches the stored ${theme} appearance and writes gt-theme`, async ({
    page,
  }) => {
    await openHome(page, theme);
    const other: Theme = theme === 'dark' ? 'light' : 'dark';
    /* the navigation's one control in place of the Light and Dark pair (DESIGN.md 8.1) */
    const button = page.locator('header [data-control="view.theme"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(button).toHaveAttribute('aria-label', `Switch to ${other}`);
    await button.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', other);
    expect(await page.evaluate(() => localStorage.getItem('gt-theme'))).toBe(other);
    await expect(button).toHaveAttribute('aria-label', `Switch to ${theme}`);
    /* the meta follows the stored theme (SPEC-4 1.6); the first meta is the one a browser reads */
    expect(await page.locator('meta[name="theme-color"]').first().getAttribute('content')).toBe(
      other === 'light' ? '#ffffff' : '#070707',
    );
  });
}

test('every same origin link answers 200 and the buttons route as section 2 says', async ({
  page,
  request,
}) => {
  await openHome(page);
  const links = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('main a[href]')].map((a) => ({
      control: a.getAttribute('data-control'),
      href: a.getAttribute('href') ?? '',
      target: a.getAttribute('target'),
    })),
  );
  expect(links.length).toBeGreaterThan(10);
  const seen = new Set<string>();
  for (const link of links) {
    if (link.href.startsWith('#') || seen.has(link.href)) continue;
    seen.add(link.href);
    if (link.href.startsWith('/')) {
      /* the PDF is requested only on its click (LANDING.md 2.8); its bytes are export.ts's */
      if (/\.pdf$/.test(link.href)) continue;
      const response = await request.get(link.href, { maxRedirects: 5 });
      expect(response.status(), `${link.control} ${link.href}`).toBe(200);
    } else {
      expect(link.href.startsWith('https://github.com/Kevin-Liu-01/Turboslide'), link.href).toBe(
        true,
      );
      expect(link.target, link.href).toBe('_blank');
    }
  }
  for (const where of ['hero', 'close'] as const) {
    expect(await page.locator(`[data-control="home.${where}.new"]`).getAttribute('href')).toBe(
      '/new',
    );
    expect(await page.locator(`[data-control="home.${where}.deck"]`).getAttribute('href')).toBe(
      '/deck/gt-brand',
    );
    await expect(page.locator(`[data-control="home.${where}.deck"]`)).toHaveText(
      'Open the Example Deck',
    );
  }
  expect(await page.locator('[data-control="home.foot.decks"]').getAttribute('href')).toBe(
    '/decks',
  );
  await expect(page.locator('[data-control="home.foot.decks"]')).toHaveText('Your presentations');
  expect(await page.locator('[data-control="home.export.record"]').getAttribute('href')).toMatch(
    /\/docs\/pptx\.md$/,
  );
});

test('the GitHub links answer 200 when the network is reachable', async ({ page, request }) => {
  await openHome(page);
  const hrefs = await page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll<HTMLAnchorElement>('main a[href^="https://"]')].map(
        (a) => a.href,
      ),
    ),
  ]);
  expect(hrefs.length).toBeGreaterThan(2);
  let reachable = true;
  for (const href of hrefs) {
    try {
      const response = await request.get(href, { timeout: 15_000, maxRedirects: 5 });
      expect(response.status(), href).toBe(200);
    } catch (error) {
      if (
        error instanceof Error &&
        /ENOTFOUND|ECONNREFUSED|timeout|ETIMEDOUT|EAI_AGAIN/i.test(error.message)
      ) {
        reachable = false;
        break;
      }
      throw error;
    }
  }
  test.skip(!reachable, 'the network is not reachable from this run');
});

test('the footer lockup scrolls to the top', async ({ page }) => {
  await openHome(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(2000);
  await page.locator('[data-control="home.foot.lockup"]').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.evaluate(() => location.hash)).toBe('#top');
  await expect(page.locator('main#top')).toHaveCount(1);
});

test('the rendered copy follows the rules of LANDING.md 2.17', async ({ page }) => {
  await openHome(page);
  const copy = await page.evaluate(() => {
    const main = document.querySelector('main.ts-product')!;
    const headings = [...main.querySelectorAll('h1, h2')].map(
      (h) => h.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
    /* the page's own copy: no slide, no panel, no code, no Version history row */
    const clone = main.cloneNode(true) as HTMLElement;
    for (const el of clone.querySelectorAll(
      'script, style, svg, code, pre, [data-home-slides], [data-transports], [role="tabpanel"], [data-panel], [data-log], [data-history], [data-sheet], .ts-home-panel, [aria-hidden="true"], [role="menubar"], [data-menubar]',
    ))
      el.remove();
    document.body.append(clone);
    const prose = clone.innerText;
    clone.remove();
    return { headings, prose };
  });
  const bands = await page
    .locator('main [data-band]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['band'] ?? ''));
  expect(copy.headings.length).toBe(1 + h2Of(bands).length);
  for (const heading of copy.headings) {
    expect(/[.:;]$/.test(heading), heading).toBe(false);
    expect(/^[A-Z]/.test(heading), heading).toBe(true);
  }
  for (const heading of copy.headings.slice(1)) expect(heading, heading).not.toContain(',');
  expect(copy.prose).not.toContain(';');
  expect(copy.prose).not.toContain('—');
  expect(copy.prose).not.toContain('–');
  expect(copy.prose).not.toContain('!');
  for (const word of REPORT_WORDS)
    expect(new RegExp(`\\b${word}\\b`, 'i').test(copy.prose), word).toBe(false);
  expect(/\b20\d\d-\d\d-\d\d\b/.test(copy.prose), 'no date').toBe(false);
  for (const line of copy.prose.split('\n')) {
    for (const sentence of line.split(/(?<=[.?!])\s+/)) {
      const count = sentence.trim().split(/\s+/).filter(Boolean).length;
      expect(count, sentence).toBeLessThan(20);
    }
  }
});

test('the speculation rules script names /new with moderate eagerness', async ({ page }) => {
  await openHome(page);
  const rules = await page.locator('script[type="speculationrules"]').first().textContent();
  const parsed = JSON.parse(rules ?? '{}') as {
    prerender?: { source: string; urls: string[]; eagerness?: string }[];
    prefetch?: { source: string; urls: string[] }[];
  };
  expect(parsed.prerender?.[0]?.urls).toEqual(['/new']);
  expect(parsed.prerender?.[0]?.eagerness).toBe('moderate');
  expect(parsed.prefetch?.[0]?.urls).toEqual(['/decks', '/deck/gt-brand']);
  await expect(page.locator('script[type="speculationrules"]')).toHaveCount(1);
});

test("the shader is only in the patterns band's chunk, requested once the band nears (2.13)", async ({
  page,
}) => {
  const scripts: { url: string; at: number; shader: boolean }[] = [];
  page.on('response', (response) => {
    const type = response.headers()['content-type'] ?? '';
    const url = response.url();
    if (!/javascript|ecmascript/.test(type) && !/\.(m?js|tsx?)(\?|$)/.test(url)) return;
    void response
      .text()
      .then((body) =>
        scripts.push({
          url,
          at: Date.now(),
          /* a fragment shader's own source (the dithering fragment's matrix, or another of the
             package's), which no caller carries: a dev server serves the package and
             pattern-mount.ts as two modules, and only the package's holds the source */
          shader: /bayer8x8\[64\]|liquidMetalFragmentShader/.test(body),
        }),
      )
      .catch(() => undefined);
  });
  await openHome(page);
  await page.waitForLoadState('networkidle');
  expect(scripts.length).toBeGreaterThan(0);
  expect(
    scripts.filter((s) => s.shader).map((s) => s.url),
    'no shader in the first screen',
  ).toEqual([]);
  const decoded = scripts.length;
  test.info().annotations.push({ type: 'js-scripts-first-screen', description: String(decoded) });
  const patterns = page.locator('[data-band="patterns"]');
  if ((await patterns.count()) === 0) {
    /* before V4#19 the page loads no shader at all, after a full scroll too */
    await humanScroll(page);
    await page.waitForLoadState('networkidle');
    expect(scripts.filter((s) => s.shader).map((s) => s.url)).toEqual([]);
    return;
  }
  const before = Date.now();
  await patterns.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3_000);
  await page.waitForLoadState('networkidle');
  const shaders = scripts.filter((s) => s.shader);
  expect(shaders.length, 'one script carries the shader').toBe(1);
  expect(shaders[0]!.at).toBeGreaterThanOrEqual(before);
});

for (const width of [1440, 390] as const) {
  test(`the layout shifts nothing over the load and a full scroll at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await openHome(page);
    await humanScroll(page);
    await page.waitForTimeout(500);
    const cls = await page.evaluate(() =>
      (window as unknown as { __cls: number[] }).__cls.reduce((a, b) => a + b, 0),
    );
    expect(cls).toBe(0);
  });
}
