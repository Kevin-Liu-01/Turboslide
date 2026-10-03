import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The product page, /home (docs/archive/rounds/POLISH.md section 3, its rows decks.home.* of 5.1; the round
// four rules of gslides-parity SPEC-4 section 2 stand under them): the page answers 200 with the
// hero sentence, its `main#top` and the head in the server's HTML; the sections stand in order
// with one heading, one lead and one picture or one diagram each; the pictures carry width,
// height, srcset and sizes and the hidden appearance's twin is never requested; the spacing
// system of 3.4 reads from the DOM's boxes at 1440, 1280 and 390 with the page under 5,000 and
// 8,500 px and nothing wider than the viewport; the appearance group renders its pressed state
// before hydration and writes `gt-theme`; every same origin link answers 200; the footer lockup
// scrolls to the top; the rendered copy follows the rules of 3.1; the Speculation Rules script
// names /new; no script the page loads carries the shader library's mount; CLS is 0 over the load
// and a full scroll. Runs against a builder's server with PLAYWRIGHT_BASE_URL (AGENTS.md dev
// server rules; B7's port is 4447) or the runner's 4321. Round 1 (docs/NEXT.md 4.1.3 item 9, B2a)
// moved the page onto the deck's grammar: the 1104 px column and its 40 px gutters, the ladder of
// slide 29, no icon before a heading, the canvas section's diagram in place of its capture, the
// hero at 72 px under the seam (48 under 1024), the diagram labels at 20 units.

const HERO_HEADING = 'Build the pitch, present it and send the link';
const HERO_LEAD =
  "Turboslide is a slides editor in the browser. It has Google Slides' menus and shortcuts. No account is needed.";
const TITLE = 'Turboslide is a slides editor in the browser';

const BANDS = ['hero', 'canvas', 'menus', 'present', 'export', 'agents', 'licence'] as const;
const HEADINGS: Record<(typeof BANDS)[number], string> = {
  hero: HERO_HEADING,
  canvas: 'Everything on a slide moves',
  menus: "The menus are Google's",
  present: 'Present from the browser',
  export: 'Export to PDF and PowerPoint',
  agents: 'Agents run the same actions',
  licence: 'Free under the MIT license',
};

/** The report words of 3.1 that never appear on the page. */
const REPORT_WORDS = [
  'Advanced tools',
  'default view',
  'acceptance',
  'audit',
  'verification',
  'revision',
];

type Theme = 'light' | 'dark';

const OBSERVERS = `
  window.__cls = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls.push(+e.value.toFixed(4)); }).observe({ type: 'layout-shift', buffered: true }); } catch {}
`;

async function openHome(page: Page, theme: Theme = 'dark'): Promise<void> {
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

async function humanScroll(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  for (let y = 0; y < height - vh; y += 640) {
    await page.mouse.wheel(0, 640);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
}

/** The box of an element in page coordinates, rounded. */
const boxOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top + scrollY),
      bottom: Math.round(r.bottom + scrollY),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }, selector);

const styleOf = (page: Page, selector: string, props: string[]) =>
  page.evaluate(
    ([sel, list]) => {
      const el = document.querySelector(sel as string);
      if (!el) return null;
      const s = getComputedStyle(el);
      const out: Record<string, string> = {};
      for (const p of list as string[]) out[p] = s.getPropertyValue(p);
      return out;
    },
    [selector, props] as const,
  );

test("the server's HTML carries main#top, the hero and the head", async ({ request }) => {
  const response = await request.get('/home');
  expect(response.status()).toBe(200);
  /* the server escapes the apostrophe of the lead as an entity */
  const html = (await response.text()).replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  expect(html).toMatch(/<main[^>]*\bid="top"[^>]*>/);
  expect(html).toMatch(/<main[^>]*\bclass="ts-product"[^>]*>/);
  expect(html).toContain(HERO_HEADING);
  expect(html).toContain(HERO_LEAD);
  expect(html).toContain(`<title>${TITLE}</title>`);
  expect(html).toMatch(/property="og:url" content="[^"]*\/home"/);
  expect(html).toMatch(/property="og:image" content="[^"]*\/og\/turboslide\.png"/);
  /* the card and the page name the domain unless the deployment sets another public origin */
  if (process.env.TURBOSLIDE_PUBLIC_ORIGIN === undefined) {
    expect(html).toContain('property="og:url" content="https://www.turboslide.com/home"');
    expect(html).toContain(
      'property="og:image" content="https://www.turboslide.com/og/turboslide.png"',
    );
  }
  expect(html).not.toMatch(/name="robots" content="noindex"/);
  /* the rules script is in the document, as the browser must read it before any script runs */
  expect(html).toContain('<script type="speculationrules"');
  /* the pressed state script sits after the appearance group, before hydration */
  expect(html).toContain('data-theme-option');
  expect(html).toMatch(
    /data-theme-option[\s\S]*<script[^>]*>\(function\(\)\{try\{var t=document\.documentElement\.getAttribute\('data-theme'\)/,
  );
});

test('the sections stand in order with one heading, one lead and one picture or diagram each', async ({
  page,
}) => {
  await openHome(page);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('main.ts-product > [data-band]')].map(
      (el) => el.getAttribute('data-band') ?? '',
    ),
  );
  expect(order).toEqual([...BANDS, 'footer']);
  for (const band of BANDS) {
    const section = page.locator(`[data-band="${band}"]`);
    const heading = section.locator(band === 'hero' ? 'h1' : 'h2');
    await expect(heading, band).toHaveCount(1);
    await expect(heading, band).toHaveText(HEADINGS[band]);
    await expect(section.locator('.ts-product-lead'), band).toHaveCount(1);
    /* no icon before a heading (DECK-GRAMMAR 40) */
    await expect(section.locator('h1 svg, h2 svg'), band).toHaveCount(0);
    const pictures = await section.locator('figure img').count();
    const diagrams = await section.locator('svg[role="img"][data-diagram]').count();
    if (band === 'licence') {
      expect(pictures + diagrams, band).toBe(0);
    } else if (['hero', 'menus'].includes(band)) {
      /* one picture: the dark and the light file of one capture */
      expect(pictures, band).toBe(2);
      expect(diagrams, band).toBe(0);
    } else {
      expect(pictures, band).toBe(0);
      expect(diagrams, band).toBe(1);
    }
  }
  /* the h1 is the seller's sentence at weight 500 */
  expect(await styleOf(page, 'main h1', ['font-weight', 'font-size'])).toEqual({
    'font-weight': '500',
    'font-size': '59.2px',
  });
  await expect(page.locator('main h1')).toHaveCount(1);
  /* one command box, the one monospace on the page */
  await expect(page.locator('main pre code')).toHaveCount(1);
  await expect(page.locator('main pre code')).toHaveText(
    'pnpm exec turboslide slide new --layout split --deck decks/pitch --json',
  );
});

test('the pictures carry width, height, srcset and sizes; the hidden appearance is never requested', async ({
  page,
}) => {
  await openHome(page, 'dark');
  for (const name of ['hero', 'menus']) {
    for (const theme of ['dark', 'light']) {
      const img = page.locator(`img[data-shot="${name}-${theme}"]`);
      await expect(img, name).toHaveCount(1);
      expect(Number(await img.getAttribute('width')), name).toBeGreaterThan(0);
      expect(Number(await img.getAttribute('height')), name).toBeGreaterThan(0);
      expect(await img.getAttribute('srcset'), name).toMatch(/ 2880w| 1224w/);
      expect(await img.getAttribute('sizes'), name).toBeTruthy();
      expect((await img.getAttribute('alt')) ?? '', name).toMatch(/\.$/);
      expect(await img.getAttribute('loading'), name).toBe('lazy');
    }
  }
  expect(await page.locator('img[data-shot="hero-dark"]').getAttribute('fetchpriority')).toBe(
    'high',
  );
  await humanScroll(page);
  await page.waitForTimeout(600);
  const loaded = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLImageElement>('img[data-shot]')].map((img) => ({
      shot: img.getAttribute('data-shot'),
      visible: img.getBoundingClientRect().width > 0,
      current: img.currentSrc,
      complete: img.complete && img.naturalWidth > 0,
    })),
  );
  for (const entry of loaded) {
    if (entry.shot?.endsWith('-dark')) {
      expect(entry.visible, entry.shot).toBe(true);
      expect(entry.complete, entry.shot).toBe(true);
      expect(entry.current, entry.shot).toMatch(/\/home\//);
    } else {
      expect(entry.visible, entry.shot ?? '').toBe(false);
      expect(entry.current, entry.shot ?? '').toBe('');
    }
  }
  /* every home picture the page fetched is one of the dark appearance's */
  const fetched = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => /\/home\/(hero|canvas|menus)-[^/]+\.(jpg|png)(\?|$)/.test(n))
      .map((n) => n.split('/').pop() ?? ''),
  );
  expect(fetched.length).toBeGreaterThan(0);
  for (const file of fetched) expect(file, file).toMatch(/-dark/);
});

for (const width of [1440, 1280] as const) {
  test(`the spacing system of 3.4 reads from the boxes at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    await openHome(page);
    /* the hero: 72 under the navigation, 112 under the picture; the bands 112 and 112 */
    expect(await styleOf(page, '[data-band="hero"]', ['padding-top', 'padding-bottom'])).toEqual({
      'padding-top': '72px',
      'padding-bottom': '112px',
    });
    for (const band of BANDS.slice(1))
      expect(
        await styleOf(page, `[data-band="${band}"]`, ['padding-top', 'padding-bottom']),
        band,
      ).toEqual({ 'padding-top': '112px', 'padding-bottom': '112px' });
    /* h1 to lead 24, lead to buttons 32, buttons to picture 56 */
    const h1 = await boxOf(page, 'main h1');
    const lead = await boxOf(page, '[data-band="hero"] .ts-product-lead');
    const cta = await boxOf(page, '[data-band="hero"] .ts-product-cta');
    const shot = await boxOf(page, '[data-band="hero"] figure');
    expect(lead!.top - h1!.bottom).toBe(24);
    expect(cta!.top - lead!.bottom).toBe(32);
    expect(shot!.top - cta!.bottom).toBe(56);
    /* the picture at the column's 1024 px content width in a 1 px edge frame (the picture 1022
       inside it, 0.71 of its 1440 px capture), its top in the first screen */
    expect(shot!.width).toBe(1024);
    expect((await page.locator('img[data-shot="hero-dark"]').boundingBox())!.width).toBe(1022);
    expect(shot!.top).toBeLessThan(width === 1440 ? 560 : 560);
    const frame = await styleOf(page, '[data-band="hero"] figure', [
      'border-top-width',
      'border-top-color',
    ]);
    expect(frame!['border-top-width']).toBe('1px');
    const edge = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--pt-edge)';
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
    expect(frame!['border-top-color']).toBe(edge);
    /* h2 to lead 16; the lead measure 560; two columns 5 of 12 and 7 of 12 with a 72 gap, aligned at the start */
    for (const band of ['canvas', 'menus', 'present', 'export', 'agents'] as const) {
      const h2 = await boxOf(page, `[data-band="${band}"] h2`);
      const l = await boxOf(page, `[data-band="${band}"] .ts-product-lead`);
      expect(l!.top - h2!.bottom, band).toBe(16);
      expect(l!.width, band).toBeLessThanOrEqual(560);
      const two = await styleOf(page, `[data-band="${band}"] .ts-product-two`, [
        'grid-template-columns',
        'column-gap',
        'align-items',
      ]);
      expect(two!['align-items'], band).toBe('start');
      expect(two!['column-gap'], band).toBe('72px');
      const columns = (two!['grid-template-columns'] ?? '').split(' ').map(parseFloat);
      expect(columns.length, band).toBe(2);
      expect(Math.round((columns[0]! / (columns[0]! + columns[1]!)) * 12), band).toBe(5);
      const text = await boxOf(page, `[data-band="${band}"] .ts-product-text`);
      const pic = await boxOf(
        page,
        `[data-band="${band}"] figure, [data-band="${band}"] svg[role="img"]`,
      );
      expect(pic!.top, band).toBe(text!.top);
    }
    /* the crop is drawn at its slot: seven twelfths of the column's 1024 px less the 72 px gap
       is 555.3 px, and the frame takes 2 */
    for (const name of ['menus']) {
      const img = page.locator(`img[data-shot="${name}-dark"]`);
      const drawn = (await img.boundingBox())!.width;
      expect(Math.abs(drawn - 553), name).toBeLessThanOrEqual(2);
    }
    /* the footer 56 and 64 */
    expect(await styleOf(page, 'footer', ['padding-top', 'padding-bottom'])).toEqual({
      'padding-top': '56px',
      'padding-bottom': '64px',
    });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThan(5000);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      'no horizontal overflow',
    ).toBe(false);
  });
}

test('the narrow layout at 390: one column, the text first, the numbers of 3.4', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  expect(await styleOf(page, '[data-band="hero"]', ['padding-top', 'padding-bottom'])).toEqual({
    'padding-top': '48px',
    'padding-bottom': '72px',
  });
  for (const band of BANDS.slice(1))
    expect(
      await styleOf(page, `[data-band="${band}"]`, ['padding-top', 'padding-bottom']),
      band,
    ).toEqual({ 'padding-top': '72px', 'padding-bottom': '72px' });
  expect(await styleOf(page, 'main h1', ['font-size', 'font-weight'])).toEqual({
    'font-size': '40px',
    'font-weight': '500',
  });
  /* the ladder of slide 29: the hero alone has its own size under 720 px */
  expect((await styleOf(page, 'main h2', ['font-size']))!['font-size']).toBe('36px');
  expect((await styleOf(page, '.ts-product-lead', ['font-size']))!['font-size']).toBe('17px');
  const h1 = await boxOf(page, 'main h1');
  const lead = await boxOf(page, '[data-band="hero"] .ts-product-lead');
  const cta = await boxOf(page, '[data-band="hero"] .ts-product-cta');
  const shot = await boxOf(page, '[data-band="hero"] figure');
  const facts = await boxOf(page, '[data-band="hero"] .ts-product-facts');
  expect(lead!.top - h1!.bottom).toBe(16);
  expect(cta!.top - lead!.bottom).toBe(24);
  /* one column: the text, the facts rows 32 under it, the picture 32 under them */
  expect(facts!.top - cta!.bottom).toBe(32);
  expect(shot!.top - facts!.bottom).toBe(32);
  /* the buttons stacked full width, 8 apart */
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('[data-band="hero"] .ts-product-cta a')].map((a) => {
      const r = a.getBoundingClientRect();
      return {
        top: Math.round(r.top + scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }),
  );
  expect(buttons.length).toBe(2);
  /* the column's content: 390 less 16 px margins and 16 px gutters on each side */
  expect(buttons[0]!.width).toBe(326);
  expect(buttons[1]!.top - (buttons[0]!.top + buttons[0]!.height)).toBe(8);
  /* one column, the text above the picture or the diagram */
  for (const band of ['canvas', 'menus', 'present', 'export', 'agents'] as const) {
    const h2 = await boxOf(page, `[data-band="${band}"] h2`);
    const l = await boxOf(page, `[data-band="${band}"] .ts-product-lead`);
    expect(l!.top - h2!.bottom, band).toBe(12);
    const text = await boxOf(page, `[data-band="${band}"] .ts-product-text`);
    const pic = await boxOf(
      page,
      `[data-band="${band}"] figure, [data-band="${band}"] svg[role="img"]`,
    );
    expect(pic!.top - text!.bottom, band).toBe(32);
    expect(pic!.width, band).toBeLessThanOrEqual(326);
  }
  /* the navigation keeps the word and Documentation; GitHub is the footer's since Round 1 */
  await expect(page.locator('.ts-product-nav .ts-product-lockup-word')).toBeVisible();
  await expect(page.locator('[data-control="home.nav.docs"]')).toBeVisible();
  await expect(page.locator('[data-control="home.nav.github"]')).toHaveCount(0);
  await expect(page.locator('[data-control="home.nav.new"]')).toBeVisible();
  await expect(page.locator('[data-control="home.theme.light"]')).toBeVisible();
  /* the diagram labels stay 13 px or larger on screen */
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll<SVGTextElement>('svg[data-diagram] text')].map((t) => {
      const svg = t.ownerSVGElement!;
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      return { text: t.textContent, px: parseFloat(getComputedStyle(t).fontSize) * scale };
    }),
  );
  expect(labels.length).toBeGreaterThan(10);
  for (const label of labels) expect(label.px, label.text ?? '').toBeGreaterThanOrEqual(12.9);
  expect(await styleOf(page, 'footer', ['padding-top', 'padding-bottom'])).toEqual({
    'padding-top': '48px',
    'padding-bottom': '56px',
  });
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > width)
      out.push(`document ${document.documentElement.scrollWidth} > ${width}`);
    for (const el of document.querySelectorAll<HTMLElement>('main.ts-product *')) {
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
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThan(8500);
});

for (const theme of ['dark', 'light'] as const) {
  test(`the appearance group is pressed for the stored ${theme} from the first paint and writes gt-theme`, async ({
    page,
  }) => {
    await openHome(page, theme);
    const other: Theme = theme === 'dark' ? 'light' : 'dark';
    await expect(page.locator(`[data-control="home.theme.${theme}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator(`[data-control="home.theme.${other}"]`)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    /* the pressed look comes from the stamped attribute: the pressed button's frame is ink, the other's not */
    const frames = await page.evaluate(() => {
      /* the ink as the browser computes it (rgb), through a probe element, so the token's hex
         form and the border's computed form compare as colours */
      const probe = document.createElement('div');
      probe.style.color = 'var(--pt-ink)';
      document.body.append(probe);
      const ink = getComputedStyle(probe).color;
      probe.remove();
      return [...document.querySelectorAll<HTMLElement>('[data-theme-option]')].map((b) => ({
        option: b.getAttribute('data-theme-option'),
        ink: getComputedStyle(b).borderTopColor === ink,
      }));
    });
    expect(frames.find((f) => f.option === theme)?.ink, 'the stored appearance is pressed').toBe(
      true,
    );
    expect(frames.find((f) => f.option === other)?.ink, 'the other is not').toBe(false);
    await expect(page.locator(`img[data-shot="hero-${theme}"]`)).toBeVisible();
    await expect(page.locator(`img[data-shot="hero-${other}"]`)).toBeHidden();

    await page.locator(`[data-control="home.theme.${other}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', other);
    expect(await page.evaluate(() => localStorage.getItem('gt-theme'))).toBe(other);
    await expect(page.locator(`[data-control="home.theme.${other}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator(`img[data-shot="hero-${other}"]`)).toBeVisible();
    await expect(page.locator(`img[data-shot="hero-${theme}"]`)).toBeHidden();
    /* the meta follows the stored theme (SPEC-4 1.6); the first meta is the one a browser reads.
       With a stored light appearance the head manager renders a second theme-color meta beside
       the one the boot script rewrote (the root route's head, build/b7.md request 7), so the
       count is reported, not asserted */
    expect(await page.locator('meta[name="theme-color"]').first().getAttribute('content')).toBe(
      other === 'light' ? '#ffffff' : '#070707',
    );
    test.info().annotations.push({
      type: 'theme-color-metas',
      description: String(await page.locator('meta[name="theme-color"]').count()),
    });
    await expect(page.locator('[data-control="home.theme"]')).toHaveAttribute('role', 'group');
  });
}

test('every same origin link answers 200 and the buttons route as 3.2 says', async ({
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
  expect(links.length).toBeGreaterThan(12);
  const seen = new Set<string>();
  for (const link of links) {
    if (link.href.startsWith('#') || seen.has(link.href)) continue;
    seen.add(link.href);
    if (link.href.startsWith('/')) {
      const response = await request.get(link.href, { maxRedirects: 5 });
      expect(response.status(), `${link.control} ${link.href}`).toBe(200);
    } else {
      expect(link.href.startsWith('https://github.com/Kevin-Liu-01/Turboslide'), link.href).toBe(
        true,
      );
      expect(link.target, link.href).toBe('_blank');
    }
  }
  expect(await page.locator('[data-control="home.hero.new"]').getAttribute('href')).toBe('/new');
  expect(await page.locator('[data-control="home.hero.deck"]').getAttribute('href')).toBe(
    '/deck/gt-brand',
  );
  await expect(page.locator('[data-control="home.hero.deck"]')).toHaveText('Open the Example Deck');
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
  expect(hrefs.length).toBeGreaterThan(3);
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

test('the rendered copy follows the rules of 3.1', async ({ page }) => {
  await openHome(page);
  const copy = await page.evaluate(() => {
    const main = document.querySelector('main.ts-product')!;
    const headings = [...main.querySelectorAll('h1, h2')].map((h) => h.textContent?.trim() ?? '');
    const code = [...main.querySelectorAll('pre code')].map((c) => c.textContent ?? '');
    const clone = main.cloneNode(true) as HTMLElement;
    for (const pre of clone.querySelectorAll('pre')) pre.remove();
    for (const script of clone.querySelectorAll('script')) script.remove();
    document.body.append(clone);
    const prose = clone.innerText;
    clone.remove();
    return { headings, code, prose, all: (main as HTMLElement).innerText };
  });
  const words = copy.all.trim().split(/\s+/).filter(Boolean).length;
  expect(words).toBeLessThan(350);
  expect(words).toBeGreaterThan(150);
  expect(copy.headings.length).toBe(7);
  for (const heading of copy.headings) {
    expect(/[.:;]$/.test(heading), heading).toBe(false);
    expect(/^[A-Z]/.test(heading), heading).toBe(true);
  }
  for (const heading of copy.headings.slice(1)) expect(heading, heading).not.toContain(',');
  expect(copy.prose).not.toContain(';');
  expect(copy.prose).not.toContain('—');
  expect(copy.prose).not.toContain('!');
  for (const word of REPORT_WORDS)
    expect(new RegExp(`\\b${word}\\b`, 'i').test(copy.prose), word).toBe(false);
  expect(/\b[\w-]+\/[\w./-]+/.test(copy.prose), 'no file path outside the command box').toBe(false);
  expect(/\b20\d\d-\d\d-\d\d\b/.test(copy.prose), 'no date').toBe(false);
  expect(copy.code.length).toBe(1);
  for (const line of copy.prose.split('\n')) {
    for (const sentence of line.split(/(?<=[.?!])\s+/)) {
      const count = sentence.trim().split(/\s+/).filter(Boolean).length;
      expect(count, sentence).toBeLessThan(20);
    }
  }
});

test('the diagrams are inline, named, small and drawn from the tokens', async ({ page }) => {
  await openHome(page);
  const diagrams = await page.evaluate(() =>
    [...document.querySelectorAll<SVGSVGElement>('svg[data-diagram]')].map((svg) => {
      const label = svg.querySelector('text');
      const edge = svg.querySelector('.dg-edge');
      return {
        name: svg.getAttribute('data-diagram'),
        role: svg.getAttribute('role'),
        label: svg.getAttribute('aria-label') ?? '',
        bytes: svg.outerHTML.length,
        fontSize: label ? getComputedStyle(label).fontSize : '',
        strokeWidth: edge ? getComputedStyle(edge).strokeWidth : '',
        animated: svg.querySelectorAll('animate, animateTransform, set').length,
      };
    }),
  );
  expect(diagrams.map((d) => d.name)).toEqual(['canvas', 'present', 'export', 'agents']);
  for (const diagram of diagrams) {
    expect(diagram.role, diagram.name ?? '').toBe('img');
    expect(diagram.label, diagram.name ?? '').toMatch(/^[A-Z].*\.$/);
    expect(diagram.bytes, diagram.name ?? '').toBeLessThan(10_000);
    /* 20 units (DECK-GRAMMAR "Diagrams"), 18 px or more on screen at the wide layouts */
    expect(diagram.fontSize, diagram.name ?? '').toBe('20px');
    expect(diagram.strokeWidth, diagram.name ?? '').toBe('1px');
    expect(diagram.animated, diagram.name ?? '').toBe(0);
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

test('no script the page loads carries the shader mount (the page animates nothing)', async ({
  page,
}) => {
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
  const decoded = scripts.reduce((sum, s) => sum + s.body.length, 0);
  test.info().annotations.push({ type: 'js-decoded-bytes', description: String(decoded) });
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
