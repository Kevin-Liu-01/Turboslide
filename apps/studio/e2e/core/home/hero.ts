import { expect, test } from '@playwright/test';
import type { Browser, Frame, Page } from '@playwright/test';

import { extraHTTPHeaders, title } from '../lib';

// The hero step's rows (docs/SITE.md section 5; plan G.4 items 4 to 12): the live editor of /home
// in its same origin frame of /try, with Claude Code and Codex at work on a presentation that
// lives in the tab. Every observation is through the page, the frame's `window.turboslideTry`
// handle (the runner's state and the tab room's entries) and the network; nothing is written to a
// store, so no row needs a teardown.

export const ROWS: readonly string[] = [
  'home.hero.swap-no-shift',
  'home.hero.agents-work',
  'home.hero.visitor-types',
  'home.hero.no-writes',
  'home.hero.fresh-on-reload',
  'home.hero.paused',
  'home.hero.reduced-motion',
  'home.hero.phone',
  'home.hero.server-features-sentence',
];

type Theme = 'light' | 'dark';
type Cell = { width: number; height: number; theme: Theme };
type Entry = { who: string; kind: string; slides: string[]; at: number };

const TYPED = 'Typed by a visitor while two agents work';

async function open(
  browser: Browser,
  cell: Cell = { width: 1440, height: 900, theme: 'light' },
  reducedMotion: 'reduce' | 'no-preference' = 'no-preference',
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: cell.width, height: cell.height },
    reducedMotion,
  });
  await context.addInitScript((theme) => {
    try {
      localStorage.setItem('gt-theme', theme);
    } catch {
      // a private window draws the system's appearance
    }
    const shifts: number[] = [];
    (window as unknown as { __shifts: number[] }).__shifts = shifts;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[])
          if (!entry.hadRecentInput) shifts.push(entry.value);
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // a browser without the entry type reads no shift
    }
  }, cell.theme);
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

/** /home until the frame has replaced the poster; the frame of /try. */
async function live(page: Page): Promise<Frame> {
  const response = await page.goto('/home');
  expect(response?.status(), '/home answers 200').toBe(200);
  await page.locator('.ts-site[data-hydrated]').waitFor({ timeout: 60_000 });
  await page.locator('[data-hero-box][data-state="done"]').waitFor({ timeout: 120_000 });
  const frame = page.frames().find((candidate) => candidate.url().includes('/try'));
  if (frame === undefined) throw new Error('the hero has no /try frame');
  await frame.waitForFunction(() => window.turboslideTry !== undefined, null, { timeout: 60_000 });
  return frame;
}

function entries(frame: Frame): Promise<Entry[]> {
  return frame.evaluate(async () => {
    const rows = (await window.turboslideTry?.entries()) ?? [];
    return (
      rows as {
        author: { principalId?: string; name: string };
        kind: string;
        at: string;
        mutations?: { slideId?: string; slide?: { id?: string } }[];
      }[]
    ).map((row) => ({
      who: row.author.principalId ?? row.author.name,
      kind: row.kind,
      slides: (row.mutations ?? []).flatMap((m) => {
        const id = m.slideId ?? m.slide?.id;
        return id === undefined ? [] : [id];
      }),
      at: Date.parse(row.at),
    }));
  });
}

const writes = async (frame: Frame): Promise<number> =>
  frame.evaluate(() => window.turboslideTry?.state().writes ?? 0);

export function rows(): void {
  test(title('home.hero.swap-no-shift'), async ({ browser }) => {
    test.setTimeout(600_000);
    for (const cell of [
      { width: 1440, height: 900, theme: 'light' as const },
      { width: 1440, height: 900, theme: 'dark' as const },
      { width: 390, height: 844, theme: 'light' as const },
      { width: 390, height: 844, theme: 'dark' as const },
    ]) {
      const { page, close } = await open(browser, cell);
      try {
        await page.goto('/home');
        await page.locator('.ts-site[data-hydrated]').waitFor({ timeout: 60_000 });
        const before = await page.locator('[data-hero-box]').boundingBox();
        await page.locator('[data-hero-box][data-state="done"]').waitFor({ timeout: 120_000 });
        await page.waitForTimeout(10_000);
        const after = await page.locator('[data-hero-box]').boundingBox();
        const label = `${cell.width} ${cell.theme}`;
        const facts = await page.evaluate(() => ({
          cls: (window as unknown as { __shifts: number[] }).__shifts.reduce((n, v) => n + v, 0),
          posters: document.querySelectorAll('[data-hero-box] picture').length,
          fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
          frame:
            performance.getEntriesByType('resource').find((r) => r.name.includes('/try'))
              ?.startTime ?? Infinity,
        }));
        expect(after, `${label}: the box keeps its size`).toEqual(before);
        expect(facts.cls, `${label}: no layout shift`).toBe(0);
        expect(facts.posters, `${label}: the poster left`).toBe(0);
        expect(facts.frame, `${label}: the frame after the first paint`).toBeGreaterThan(facts.fcp);
      } finally {
        await close();
      }
    }
  });

  test(title('home.hero.agents-work'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, close } = await open(browser);
    try {
      const frame = await live(page);
      await expect
        .poll(
          async () =>
            new Set((await entries(frame)).filter((r) => r.kind === 'edit').map((r) => r.who)),
          { timeout: 20_000 },
        )
        .toEqual(new Set(['agent:claude-code', 'agent:codex']));
      const marks = await frame.evaluate(() =>
        [...document.querySelectorAll('[data-brand]')].map((el) => el.getAttribute('data-brand')),
      );
      expect(marks).toContain('claude-code');
      expect(marks).toContain('codex');
      await expect
        .poll(
          () =>
            frame.evaluate(
              () =>
                document.querySelector('.ts-remote-caret, .ts-remote-pointer, .ts-remote-drag') !==
                null,
            ),
          { timeout: 20_000 },
        )
        .toBe(true);
    } finally {
      await close();
    }
  });

  test(title('home.hero.visitor-types'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, close } = await open(browser);
    try {
      const frame = await live(page);
      const tab = page.frameLocator('iframe.site-hero-frame');
      const visitor = await frame.evaluate(() => window.turboslideTry?.visitor ?? '');
      const lead = tab.locator('.pt-stagewrap [data-block="lead"]').first();
      await tab.locator('.ts-filmstrip .ts-card[data-id="title"]').click();
      const before = await lead.textContent();
      await lead.dblclick();
      await page.keyboard.press('ControlOrMeta+A');
      const from = Date.now();
      await page.keyboard.type(TYPED, { delay: 120 });
      const to = Date.now();
      await page.keyboard.press('Escape');
      await expect(lead).toHaveText(TYPED);
      const during = (await entries(frame)).filter((r) => r.at >= from - 200 && r.at <= to + 200);
      expect(
        during.filter((r) => r.who.startsWith('agent:') && r.slides.includes('title')),
        'no agent write on the visitor slide',
      ).toEqual([]);
      expect(during.some((r) => r.who === visitor)).toBe(true);
      await tab
        .locator('.pt-stagewrap')
        .first()
        .click({ position: { x: 12, y: 12 } });
      await page.keyboard.press('ControlOrMeta+Z');
      await expect(lead).toHaveText(before ?? '');
    } finally {
      await close();
    }
  });

  test(title('home.hero.no-writes'), async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, close } = await open(browser);
    const requests: { method: string; path: string; top: boolean }[] = [];
    page.on('request', (r) =>
      requests.push({
        method: r.method(),
        path: new URL(r.url()).pathname,
        top: r.frame() === page.mainFrame(),
      }),
    );
    try {
      const started = Date.now();
      await live(page);
      const tab = page.frameLocator('iframe.site-hero-frame');
      await tab.locator('.ts-filmstrip .ts-card[data-id="title"]').click();
      await tab.locator('.pt-stagewrap [data-block="lead"]').first().dblclick();
      await page.keyboard.type(TYPED, { delay: 120 });
      await page.keyboard.press('Escape');
      while (Date.now() - started < 90_000) await page.waitForTimeout(1000);
      const leaving = requests.filter(
        (r) =>
          !r.top &&
          ((r.method !== 'GET' && r.method !== 'HEAD') ||
            /^\/(api\/|_serverFn|mcp|rooms\/|decks\/)/i.test(r.path)),
      );
      expect(requests.filter((r) => !r.top).length).toBeGreaterThan(0);
      expect(leaving, 'no request of the frame leaves the tab').toEqual([]);
    } finally {
      await close();
    }
  });

  test(title('home.hero.fresh-on-reload'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, close } = await open(browser);
    try {
      let frame = await live(page);
      await expect
        .poll(async () => (await entries(frame)).length, { timeout: 30_000 })
        .toBeGreaterThan(0);
      await page.reload();
      await page.locator('[data-hero-box][data-state="done"]').waitFor({ timeout: 120_000 });
      frame = page.frames().find((f) => f.url().includes('/try')) as Frame;
      await frame.waitForFunction(() => window.turboslideTry !== undefined);
      const facts = await frame.evaluate(async () => ({
        entries: ((await window.turboslideTry?.entries()) ?? []).length,
        slides: [...document.querySelectorAll('.ts-filmstrip .ts-card')].map((c) =>
          c.getAttribute('data-id'),
        ),
      }));
      expect(facts.entries).toBe(0);
      expect(facts.slides).toEqual(['title', 'agenda', 'numbers', 'shipped', 'plan']);
    } finally {
      await close();
    }
  });

  test(title('home.hero.paused'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, close } = await open(browser);
    try {
      const frame = await live(page);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(2500);
      let from = await writes(frame);
      await page.waitForTimeout(10_000);
      expect(await writes(frame), 'off screen').toBe(from);
      await page.evaluate(() => scrollTo(0, 0));
      await expect.poll(() => writes(frame), { timeout: 20_000 }).toBeGreaterThan(from);
      await frame.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(2500);
      from = await writes(frame);
      await page.waitForTimeout(10_000);
      expect(await writes(frame), 'hidden').toBe(from);
      await frame.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect.poll(() => writes(frame), { timeout: 20_000 }).toBeGreaterThan(from);
    } finally {
      await close();
    }
  });

  test(title('home.hero.reduced-motion'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, close } = await open(browser, undefined, 'reduce');
    try {
      const frame = await live(page);
      const from = await writes(frame);
      let ghost = false;
      const until = Date.now() + 30_000;
      while (Date.now() < until) {
        ghost ||= await frame.evaluate(() => document.querySelector('.ts-remote-drag') !== null);
        await page.waitForTimeout(100);
      }
      expect(await writes(frame)).toBeGreaterThan(from);
      expect(ghost, 'no drag box').toBe(false);
    } finally {
      await close();
    }
  });

  test(title('home.hero.phone'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, close } = await open(browser, { width: 390, height: 844, theme: 'light' });
    try {
      const frame = await live(page);
      const facts = await frame.evaluate(() => ({
        width: innerWidth,
        menus: [...document.querySelectorAll('button')].some((b) =>
          /Menus/.test(b.textContent ?? ''),
        ),
        filmstrip: document.querySelector('.ts-filmstrip') !== null,
      }));
      expect(facts.width).toBeLessThan(720);
      expect(facts.menus).toBe(true);
      expect(facts.filmstrip).toBe(true);
      await expect.poll(() => writes(frame), { timeout: 20_000 }).toBeGreaterThan(0);
      const y = await page.evaluate(() => scrollY);
      await page.mouse.move(195, 200);
      await page.mouse.wheel(0, 300);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y);
    } finally {
      await close();
    }
  });

  test(title('home.hero.server-features-sentence'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, close } = await open(browser);
    try {
      await live(page);
      await page.evaluate(() =>
        document.querySelector('[data-hero-box]')?.scrollIntoView({ block: 'center' }),
      );
      const tab = page.frameLocator('iframe.site-hero-frame');
      const snack = tab.locator('.ts-snackbar.is-on');
      const file = tab
        .getByRole('menuitem', { name: 'File' })
        .or(tab.getByRole('button', { name: 'File', exact: true }))
        .first();
      await tab
        .getByRole('button', { name: /^Share/ })
        .first()
        .click();
      await expect(snack).toContainText('This presentation lives only in this tab.');
      await expect(snack.getByRole('button', { name: 'New Presentation' })).toBeVisible();
      await page.keyboard.press('Escape');
      await file.click();
      await tab.getByText('Download', { exact: true }).first().hover();
      await tab.getByText('Microsoft PowerPoint (.pptx)').first().click();
      await expect(snack).toContainText('This presentation lives only in this tab.');
      await file.click();
      await tab.getByText('Print', { exact: true }).first().click();
      await expect(snack).toContainText('This presentation lives only in this tab.');
      expect(await tab.locator('[role="dialog"]').count()).toBe(0);
    } finally {
      await close();
    }
  });
}
