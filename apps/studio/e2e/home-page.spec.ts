import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The product page, /home (gslides-parity SPEC-4 section 2, 0.23, 0.24, 0.42, 0.43; MILESTONES-4
// B2 item 5): the page answers 200 with the hero sentence and its `main` in the server's HTML;
// the fifteen README pictures carry width and height; the editor pair follows `gt-theme`; the
// appearance group writes `gt-theme` and holds `aria-pressed`; the three hero links resolve; no
// element is wider than the viewport at 390; every number has a source line beside it; the
// Speculation Rules script names /new with `moderate` eagerness; no script the page loads carries
// the shader library's mount (the hero is still, 0.6); every control carries the Tooltip
// primitive. Runs against a builder's server with PLAYWRIGHT_BASE_URL (AGENTS.md dev server
// rules; B2's port is 4342) or the runner's 4321.

const HERO_SENTENCE =
  "A slides editor with Google Slides' menus, toolbar and shortcuts, a canvas on every slide, and a PowerPoint export that matches the screen pixel for pixel.";

const README_SHOTS = [
  '01-new-presentation',
  '02-file-menu',
  '03-insert-menu',
  '04-layout-grid',
  '05-filmstrip-menu',
  '06-canvas-rotation',
  '07-canvas-snap-guides',
  '08-format-options',
  '09-download-dialog',
  '10-decks-home',
  '11-presenter-console',
  '12-slideshow-dither',
  '13-editor-light',
  '14-book-view',
  '15-grid-view',
];

async function openHome(page: Page, theme: 'light' | 'dark' = 'dark'): Promise<void> {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('gt-theme', value);
    } catch {
      // private mode
    }
  }, theme);
  const response = await page.goto('/home');
  expect(response?.status()).toBe(200);
  await page.locator('main.ts-product[data-hydrated]').waitFor({ timeout: 30_000 });
}

test("the server's HTML carries main and the hero sentence", async ({ request }) => {
  const response = await request.get('/home');
  expect(response.status()).toBe(200);
  /* the server escapes the apostrophe of the sentence as an entity */
  const html = (await response.text()).replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  expect(html).toContain('<main class="ts-product"');
  expect(html).toContain(HERO_SENTENCE);
  expect(html).toContain('<title>Turboslide</title>');
  expect(html).toMatch(/property="og:url" content="[^"]*\/home"/);
  expect(html).not.toMatch(/name="robots" content="noindex"/);
  /* the rules script is in the document, as the browser must read it before any script runs */
  expect(html).toContain('<script type="speculationrules"');
});

test('the fifteen README pictures are on the page with width and height', async ({ page }) => {
  await openHome(page);
  for (const name of README_SHOTS) {
    const img = page.locator(`img[data-shot="${name}"]`).first();
    await expect(img).toHaveCount(1);
    const width = Number(await img.getAttribute('width'));
    const height = Number(await img.getAttribute('height'));
    expect(width, name).toBeGreaterThan(0);
    expect(height, name).toBeGreaterThan(0);
    expect(await img.getAttribute('srcset'), name).toMatch(/720w/);
    expect(await img.getAttribute('sizes'), name).toBeTruthy();
    expect((await img.getAttribute('alt')) ?? '', name).toMatch(/\.$/);
  }
  /* the pictures under the fold are lazy; the editor pair's dark shot is the eager one */
  expect(await page.locator('img[data-shot="01-new-presentation"]').getAttribute('loading')).toBe(
    'eager',
  );
  expect(await page.locator('img[data-shot="09-download-dialog"]').getAttribute('loading')).toBe(
    'lazy',
  );
});

test('the editor pair follows gt-theme and the appearance group writes it', async ({ page }) => {
  await openHome(page, 'dark');
  const dark = page.locator('img[data-shot="01-new-presentation"]');
  const light = page.locator('img[data-shot="13-editor-light"]');
  await expect(dark).toBeVisible();
  await expect(light).toBeHidden();
  await expect(page.locator('[data-control="home.theme.dark"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-control="home.theme.light"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await page.locator('[data-control="home.theme.light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(light).toBeVisible();
  await expect(dark).toBeHidden();
  await expect(page.locator('[data-control="home.theme.light"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-control="home.theme.dark"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(await page.evaluate(() => localStorage.getItem('gt-theme'))).toBe('light');
  /* the meta follows the stored theme (SPEC-4 1.6) */
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#ffffff');
  /* the hero twin and the pipeline cell read the light twin's path */
  const twin = await page
    .locator('.ts-product-hero-twin')
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(twin).toContain('/brand/hero-light.png');

  await page.locator('[data-control="home.theme.dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('gt-theme'))).toBe('dark');
  const group = page.locator('[data-control="home.theme"]');
  await expect(group).toHaveAttribute('role', 'group');
});

test('the three hero links resolve', async ({ page, request }) => {
  await openHome(page);
  const newHref = await page.locator('[data-control="home.hero.new"]').getAttribute('href');
  const deckHref = await page.locator('[data-control="home.hero.deck"]').getAttribute('href');
  const githubHref = await page.locator('[data-control="home.hero.github"]').getAttribute('href');
  expect(newHref).toBe('/new');
  expect(deckHref).toBe('/deck/gt-brand');
  expect(githubHref).toBe('https://github.com/Kevin-Liu-01/Turboslide');
  expect((await request.get('/new')).status()).toBe(200);
  expect((await request.get('/deck/gt-brand')).status()).toBe(200);
  await expect(page.locator('[data-control="home.hero.github"]')).toHaveAttribute(
    'target',
    '_blank',
  );
});

test('nothing is wider than the viewport at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > width)
      out.push(`document ${document.documentElement.scrollWidth} > ${width}`);
    const clipped = (el: HTMLElement): boolean => {
      /* an element inside a box that clips or scrolls cannot widen the page: the comparison
         table's own scroll box (SPEC-4 2.2 item 9), the hero band, the curtain's track */
      for (let node = el.parentElement; node !== null; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowX;
        if (overflow !== 'visible') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll<HTMLElement>('main.ts-product *')) {
      if (clipped(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      if (rect.right > width + 1 || rect.left < -1)
        out.push(
          `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} ${Math.round(rect.left)}..${Math.round(rect.right)}`,
        );
    }
    return out;
  });
  expect(overflow).toEqual([]);
  /* the four links hide under 760, the button and the group stay */
  await expect(page.locator('[data-control="home.nav.decks"]')).toBeHidden();
  await expect(page.locator('[data-control="home.nav.new"]')).toBeVisible();
  await expect(page.locator('[data-control="home.theme.light"]')).toBeVisible();
});

test('every number has a sibling source line', async ({ page }) => {
  await openHome(page);
  const numbers = page.locator('.ts-product-number');
  await expect(numbers).toHaveCount(6);
  for (let i = 0; i < 6; i += 1) {
    await expect(numbers.nth(i).locator('.ts-product-source')).toHaveCount(1);
    expect(
      (await numbers.nth(i).locator('.ts-product-source').textContent())?.trim().length,
    ).toBeGreaterThan(3);
  }
  const rows = page.locator('.ts-product-row');
  await expect(rows).toHaveCount(8);
  for (let i = 0; i < 8; i += 1) {
    await expect(rows.nth(i).locator('.ts-product-row-number')).toHaveCount(1);
    await expect(rows.nth(i).locator('.ts-product-source')).toHaveCount(1);
  }
  await expect(
    page.locator('.ts-product-closing[data-row="closing"] .ts-product-source'),
  ).toHaveCount(1);
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
  /* one rules script, and nowhere else: the other routes carry none (0.42) */
  await expect(page.locator('script[type="speculationrules"]')).toHaveCount(1);
});

test('no script the page loads carries the shader mount (the hero is still)', async ({ page }) => {
  const scripts: { url: string; body: string }[] = [];
  page.on('response', (response) => {
    const type = response.headers()['content-type'] ?? '';
    const url = response.url();
    if (!/javascript|ecmascript/.test(type) && !/\.(m?js|tsx?)(\?|$)/.test(url)) return;
    void response
      .text()
      .then((body) => scripts.push({ url, body }))
      .catch(() => undefined);
  });
  await openHome(page);
  await page.waitForLoadState('networkidle');
  expect(scripts.length).toBeGreaterThan(0);
  const offenders = scripts
    .filter((s) => /ShaderMount|liquidMetalFragmentShader/.test(s.body))
    .map((s) => s.url);
  expect(offenders).toEqual([]);
  /* the page's decoded JavaScript, for the record beside the check's own row (the check is step 31) */
  const decoded = scripts.reduce((sum, s) => sum + s.body.length, 0);
  test.info().annotations.push({ type: 'js-decoded-bytes', description: String(decoded) });
});

test('every link and button carries the Tooltip primitive', async ({ page }) => {
  await openHome(page);
  const bare = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      'main.ts-product a[href], main.ts-product button',
    )) {
      if (el.closest('[data-tip]') === null)
        out.push(
          `${el.tagName.toLowerCase()} ${el.getAttribute('data-control') ?? el.textContent?.trim() ?? ''}`,
        );
    }
    return out;
  });
  expect(bare).toEqual([]);
  /* the lockup is the h1 with the mark and the word */
  await expect(page.locator('h1.ts-product-h1')).toHaveText('Turboslide');
  await expect(page.locator('h1.ts-product-h1 svg.ts-mark')).toHaveCount(1);
  /* the credit line sits under the band */
  await expect(page.locator('.ts-product-credit')).toHaveText(
    'Material: liquid metal, Paper Shaders, one frame through the two tone screen',
  );
});
