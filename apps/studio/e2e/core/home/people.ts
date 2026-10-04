import { loadavg } from 'node:os';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { MOTION_KEY } from '../../../src/components/home/boot';
import { PEOPLE } from '../../../src/components/home/copy';
import { PEOPLE_LOOP_MS } from '../../../src/components/home/live/people-timing';
import { extraHTTPHeaders, title } from '../lib';
import { rowsForDriver } from '../matrix';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.10, 3.4 P-L, 3.6 W1, 6.7; the second
// pass). V4's, V4#20: the two people band. An init script records, from the first frame, every
// change of the two screens' Week 3 row and heading with the page's clock, the presence marks'
// states and the slide each screen shows, so the staged loop is read from the page as it plays.
// Times are interaction bounds read only at a one minute load under 24.

export const ROWS: readonly string[] = ['home.people.loop', 'home.people.type'];

const entered = (id: string): boolean =>
  rowsForDriver('core/home.spec.ts').some((row) => row.id === id);

const INTERACTION_LOAD = 24;
const load = (): number => Math.round((loadavg()[0] ?? 0) * 10) / 10;
function note(what: string, value: number | string): void {
  test.info().annotations.push({
    type: 'reading',
    description: `${what}: ${typeof value === 'number' ? `${Math.round(value)} ms` : value} at load ${load()}`,
  });
}

/** Samples the two screens every animation frame the page draws (the band's own clock). */
const SAMPLER = String(() => {
  type Sample = {
    t: number;
    week3: { maya: string; sam: string };
    heading: { maya: string; sam: string };
    slide: { maya: string; sam: string };
    flag: { maya: string; sam: string };
    chip: boolean;
    plate: boolean;
  };
  const samples: Sample[] = [];
  (window as unknown as { __people: Sample[] }).__people = samples;
  const text = (who: string, run: string): string =>
    document.querySelector(
      `[data-screen="${who}"] .ts-home-sheet:not([hidden]) [data-run="${run}"]`,
    )?.textContent ?? '';
  const shown = (who: string): string =>
    document
      .querySelector(`[data-screen="${who}"] .ts-home-sheet:not([hidden]) [data-home-slides]`)
      ?.getAttribute('data-slide') ?? '';
  const flag = (who: string): string => {
    const f = document.querySelector<HTMLElement>(`[data-screen="${who}"] .ts-people-flag`);
    return f !== null && !f.hidden ? (f.textContent ?? '') : '';
  };
  const sample = (): void => {
    const last = samples.at(-1);
    const next: Sample = {
      t: performance.now(),
      week3: { maya: text('maya', 'rows/items/2/value'), sam: text('sam', 'rows/items/2/value') },
      heading: { maya: text('maya', 'h/text'), sam: text('sam', 'h/text') },
      slide: { maya: shown('maya'), sam: shown('sam') },
      flag: { maya: flag('maya'), sam: flag('sam') },
      chip: !(
        document.querySelector<HTMLElement>('[data-screen="maya"] .ts-people-chip')?.hidden ?? true
      ),
      plate: !(document.querySelector<HTMLElement>('[data-follow]')?.hidden ?? true),
    };
    const key = (s: Sample | undefined): string =>
      JSON.stringify(s === undefined ? null : { ...s, t: 0 });
    if (key(next) !== key(last)) samples.push(next);
  };
  const tick = (): void => {
    sample();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

type Sample = {
  t: number;
  week3: { maya: string; sam: string };
  heading: { maya: string; sam: string };
  slide: { maya: string; sam: string };
  flag: { maya: string; sam: string };
  chip: boolean;
  plate: boolean;
};

async function open(
  browser: Browser,
  options: { reduce?: boolean; paused?: boolean; sample?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
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
  if (options.sample === true) await context.addInitScript(`(${SAMPLER})()`);
  const page = await context.newPage();
  const response = await page.goto('/home');
  expect(response?.status()).toBe(200);
  await page.waitForSelector('main#top[data-live="ready"]', { timeout: 60_000 });
  return { context, page };
}

const pair = (page: Page) => page.locator('[data-reserve="people"]');

/** Brings the band to the middle of the viewport and waits for its screens. */
async function bandInView(page: Page): Promise<void> {
  await pair(page).scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    document.querySelector('[data-reserve="people"]')!.scrollIntoView({ block: 'center' }),
  );
  await page.waitForSelector('[data-screen="sam"] [data-people-box]', { timeout: 60_000 });
}

const samples = (page: Page): Promise<Sample[]> =>
  page.evaluate(() => (window as unknown as { __people: Sample[] }).__people);
const history = (page: Page): Promise<number> =>
  page.locator('[data-history] [data-history-row]').count();

export function rows(): void {
  if (entered('home.people.loop'))
    test(title('home.people.loop'), async ({ browser }) => {
      test.setTimeout(180_000);
      const quiet = load() < INTERACTION_LOAD;
      const { context, page } = await open(browser, { sample: true });
      try {
        const rows0 = await history(page);
        await bandInView(page);
        await page.waitForFunction(
          () => window.tsHomeMotion?.running().includes('P-L') === true,
          undefined,
          {
            timeout: 10_000,
          },
        );
        /* two cycles and a little more */
        await page.waitForTimeout(2 * PEOPLE_LOOP_MS + 2_000);
        const list = await samples(page);
        const rest = list.find((s) => s.week3.sam !== '')!;
        const restWeek3 = rest.week3.sam.replace(/ in person$/, '');
        /* Sam types " in person" on his screen with a person's gaps; Maya's trails by one key */
        const keys = list.filter(
          (s, i) =>
            i > 0 &&
            s.week3.sam.length > restWeek3.length &&
            s.week3.sam.length === list[i - 1]!.week3.sam.length + 1 &&
            s.week3.sam.startsWith(restWeek3),
        );
        const typed = keys.map((s) => s.week3.sam.slice(restWeek3.length));
        expect(typed.slice(0, 10)).toEqual([
          ' ',
          ' i',
          ' in',
          ' in ',
          ' in p',
          ' in pe',
          ' in per',
          ' in pers',
          ' in perso',
          ' in person',
        ]);
        const gaps = keys.slice(1, 10).map((s, i) => s.t - keys[i]!.t);
        note("Sam's key gaps", gaps.map((g) => Math.round(g)).join(', '));
        if (quiet)
          for (const [i, gap] of gaps.entries()) {
            const space = typed[i + 1]!.endsWith(' ');
            expect(gap).toBeGreaterThanOrEqual(space ? 280 : 55);
            expect(gap).toBeLessThanOrEqual(space ? 480 : 260);
          }
        for (const s of keys.slice(0, 9)) {
          const maya = s.week3.maya.slice(restWeek3.length);
          expect(maya.length, 'Maya one key behind').toBe(
            s.week3.sam.slice(restWeek3.length).length - 1,
          );
        }
        /* his flag on Maya's screen; hers on Sam's when she types; Follow, its plate and the cut */
        expect(list.some((s) => s.flag.maya === PEOPLE.flags.sam)).toBe(true);
        expect(list.some((s) => s.flag.sam === PEOPLE.flags.maya)).toBe(true);
        expect(list.some((s) => s.plate && s.slide.maya === 'gets' && s.slide.sam === 'gets')).toBe(
          true,
        );
        expect(list.some((s) => s.chip)).toBe(true);
        /* the seam: both screens back on slide 2 with the typed words gone; a cycle's length */
        const seams = list.filter(
          (s, i) =>
            i > 0 &&
            s.slide.maya === 'plan' &&
            list[i - 1]!.slide.maya === 'gets' &&
            s.week3.sam === restWeek3,
        );
        expect(seams.length, 'two seams in two cycles').toBeGreaterThanOrEqual(2);
        const cycle = seams[1]!.t - seams[0]!.t;
        note('a cycle', cycle);
        if (quiet) expect(Math.abs(cycle - PEOPLE_LOOP_MS)).toBeLessThanOrEqual(1_000);
        /* the marks are ink */
        const marks = await page.evaluate(() => {
          const ink = getComputedStyle(document.documentElement)
            .getPropertyValue('--pt-ink')
            .trim();
          const probe = document.createElement('i');
          probe.style.color = ink;
          document.body.append(probe);
          const inkRgb = getComputedStyle(probe).color;
          probe.remove();
          const outline = document.querySelector<HTMLElement>(
            '[data-screen="maya"] .ts-people-outline',
          )!;
          const flag = document.querySelector<HTMLElement>('[data-screen="maya"] .ts-people-flag')!;
          return {
            inkRgb,
            outline: getComputedStyle(outline).borderTopColor,
            flag: getComputedStyle(flag).backgroundColor,
          };
        });
        expect(marks.outline).toBe(marks.inkRgb);
        expect(marks.flag).toBe(marks.inkRgb);
        /* nothing reaches the page deck or Version history */
        expect(await history(page)).toBe(rows0);
      } finally {
        await context.close();
      }
      /* reduced motion and Pause Motion stored: B's still, Sam's words on both screens */
      for (const options of [{ reduce: true }, { paused: true }] as const) {
        const other = await open(browser, options);
        try {
          await bandInView(other.page);
          await other.page.waitForTimeout(1_500);
          const still = await other.page.evaluate(() => ({
            maya:
              document.querySelector('[data-screen="maya"] [data-run="rows/items/2/value"]')
                ?.textContent ?? '',
            sam:
              document.querySelector('[data-screen="sam"] [data-run="rows/items/2/value"]')
                ?.textContent ?? '',
            flag:
              document.querySelector<HTMLElement>('[data-screen="maya"] .ts-people-flag')
                ?.textContent ?? '',
            running: window.tsHomeMotion?.running() ?? [],
          }));
          expect(still.maya, JSON.stringify(options)).toMatch(/ in person$/);
          expect(still.sam).toMatch(/ in person$/);
          expect(still.flag).toBe(PEOPLE.flags.sam);
          expect(still.running).not.toContain('P-L');
        } finally {
          await other.context.close();
        }
      }
      test.skip(!quiet, `not read: load ${load()} (the functional checks passed)`);
    });

  if (entered('home.people.type'))
    test(title('home.people.type'), async ({ browser }) => {
      test.setTimeout(120_000);
      const quiet = load() < INTERACTION_LOAD;
      const { context, page } = await open(browser);
      try {
        const rows0 = await history(page);
        await bandInView(page);
        /* Tab and Enter reach each text box: five on each screen */
        const boxes = await page
          .locator('[data-screen] [data-people-box]')
          .evaluateAll(
            (els) =>
              els.filter((el) => (el as HTMLElement).tabIndex === 0 && !el.closest('[hidden]'))
                .length,
          );
        expect(boxes).toBe(10);
        /* a click on Week 2 of Maya's screen types as Maya and stops the loop for good */
        const box = page.locator(
          '[data-screen="maya"] [data-slide="plan"] [data-run="rows/items/1/value"]',
        );
        await box.click();
        await expect(box).toHaveAttribute('contenteditable', /plaintext-only|true/);
        expect(await page.evaluate(() => window.tsHomeMotion?.running().includes('P-L'))).toBe(
          false,
        );
        await page.keyboard.press('End');
        /* read in the page: the last key's keydown and the first change of Sam's screen that
           holds the words (the driver's own round trips and polling stay out of the reading) */
        await page.evaluate(() => {
          const w = window as unknown as { __lastKey: number; __mirrored: number };
          w.__lastKey = 0;
          w.__mirrored = 0;
          document.addEventListener('keydown', () => void (w.__lastKey = performance.now()), true);
          const screen = document.querySelector('[data-screen="sam"]')!;
          new MutationObserver(() => {
            const run = screen.querySelector('[data-slide="plan"] [data-run="rows/items/1/value"]');
            if (w.__mirrored === 0 && (run?.textContent ?? '').includes(' now'))
              w.__mirrored = performance.now();
          }).observe(screen, { subtree: true, childList: true, characterData: true });
        });
        await page.keyboard.type(' now', { delay: 30 });
        const mirrored = page.locator(
          '[data-screen="sam"] [data-slide="plan"] [data-run="rows/items/1/value"]',
        );
        await expect(mirrored).toContainText(' now', { timeout: 2_000 });
        const lag = await page.evaluate(() => {
          const w = window as unknown as { __lastKey: number; __mirrored: number };
          return w.__mirrored - w.__lastKey;
        });
        note('the words on the other screen after the last key', lag);
        if (quiet) expect(lag).toBeLessThanOrEqual(200);
        await expect(page.locator('[data-screen="sam"] .ts-people-flag')).toHaveText(
          PEOPLE.flags.maya,
        );
        await expect(page.locator('[data-screen="sam"] .ts-people-caret')).toHaveCount(1);
        /* the visitor's own screen draws the live selection */
        const mine = await page.evaluate(() => {
          const outline = document.querySelector<HTMLElement>(
            '[data-screen="maya"] .ts-people-outline',
          )!;
          return outline.classList.contains('is-mine') && !outline.hidden;
        });
        expect(mine).toBe(true);
        /* Escape ends the typing */
        await page.keyboard.press('Escape');
        await expect(box).not.toHaveAttribute('contenteditable', /plaintext-only|true/);
        await expect(page.locator('[data-screen="sam"] .ts-people-flag')).toBeHidden();
        await page.waitForTimeout(2_000);
        expect(await page.evaluate(() => window.tsHomeMotion?.running().includes('P-L'))).toBe(
          false,
        );
        /* Enter on Sam's heading types as Sam */
        const heading = page.locator('[data-screen="sam"] [data-slide="plan"] [data-run="h/text"]');
        await heading.focus();
        await page.keyboard.press('Enter');
        await expect(heading).toHaveAttribute('contenteditable', /plaintext-only|true/);
        await page.keyboard.type('x', { delay: 30 });
        await page.keyboard.press('Backspace');
        await expect(page.locator('[data-screen="maya"] .ts-people-flag')).toHaveText(
          PEOPLE.flags.sam,
        );
        await page.keyboard.press('Escape');
        expect(await history(page), 'nothing reaches Version history').toBe(rows0);
      } finally {
        await context.close();
      }
      test.skip(!quiet, `not read: load ${load()} (the functional checks passed)`);
    });
}
