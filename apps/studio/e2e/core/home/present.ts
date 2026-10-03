import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { PRESENT } from '../../../src/components/home/copy';
import { HOME_DECK } from '../../../src/components/home/deck.generated';
import { title } from '../lib';
import { freshPage, loadReading, noteTiming, openHome, typeLine } from './agents';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.7, 6.7; build/integrator.md "Landing,
// day 0" 4.9 and 5.1). L3's, push 5: the show (home.present.show), its focus (home.present.focus)
// and Print This Deck (home.present.print). Every observation is through the page; the print is
// read from the PDF Chromium prints under print emulation, one page per slide.

export const ROWS: readonly string[] = [
  'home.present.show',
  'home.present.focus',
  'home.present.print',
];

const band = (page: Page) => page.locator('[data-band="present"]');
const presentButton = (page: Page) =>
  band(page).locator('button[data-present], [data-present] button').first();
const show = (page: Page) => band(page).locator('[data-show]');
const stage = (page: Page) => band(page).locator('[data-show-stage]');
const SLIDESHOW_KEY = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+F5';

/**
 * In the page: the time from the next press or key on the band to the show's motion at rest (the
 * stage focused and no animation left on the show), or to the show gone; read with
 * `readMotion` after the action.
 */
async function watchMotion(page: Page, until: 'open' | 'closed'): Promise<void> {
  await page.evaluate((mode) => {
    const w = window as unknown as { __motion?: Promise<number> };
    const band = document.querySelector('[data-band="present"]')!;
    w.__motion = new Promise<number>((resolve) => {
      let t0 = -1;
      const start = (): void => {
        if (t0 < 0) t0 = performance.now();
      };
      band.addEventListener('pointerdown', start, { capture: true, once: true });
      band.addEventListener('keydown', start, { capture: true, once: true });
      const check = (): void => {
        if (t0 < 0) return;
        const show = band.querySelector<HTMLElement>('[data-show]');
        const done =
          mode === 'closed'
            ? show === null
            : show !== null &&
              document.activeElement === show.querySelector('[data-show-stage]') &&
              show.getAnimations({ subtree: true }).length === 0;
        if (done) {
          watch.disconnect();
          clearInterval(poll);
          resolve(performance.now() - t0);
        }
      };
      const watch = new MutationObserver(check);
      watch.observe(band, { childList: true, subtree: true, attributes: true });
      const poll = setInterval(check, 10);
    });
  }, until);
}
const readMotion = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __motion: Promise<number> }).__motion);

/** Pages in a PDF, by its page objects. */
function pdfPages(bytes: Buffer): { pages: number; boxes: string[] } {
  const text = bytes.toString('latin1');
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const boxes = [...text.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((m) => (m[1] ?? '').trim());
  return { pages, boxes };
}

export function rows(): void {
  test(title('home.present.show'), async ({ browser }) => {
    test.setTimeout(90_000);
    const page = await freshPage(browser);
    await openHome(page);
    /* a change of the visitor's and an agent's before the show */
    await page.locator('[data-band="agents"]').scrollIntoViewIfNeeded();
    await typeLine(page, `tailor --replace=${HOME_DECK.customer}=Globex`);
    await band(page).scrollIntoViewIfNeeded();
    /* S opens nothing */
    await page.locator('body').press('s');
    await expect(show(page)).toHaveCount(0);
    /* choose slide 2 in the list, then Present */
    await band(page).locator('[data-slide-row="plan"]').click();
    await expect(
      band(page).locator(
        '[data-slide-row="plan"] [aria-current="true"], [data-slide-row="plan"][aria-current="true"]',
      ),
    ).toHaveCount(1);
    await watchMotion(page, 'open');
    await presentButton(page).click();
    await expect(stage(page)).toBeFocused();
    const opened = await readMotion(page);
    noteTiming('Present to the stage at rest (in the page)', opened);
    if (loadReading().read) expect(opened).toBeLessThanOrEqual(800);
    await expect(show(page)).toHaveAttribute('role', 'dialog');
    await expect(show(page)).toHaveAttribute('aria-modal', 'true');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(2, 8));
    await expect(show(page)).toContainText(PRESENT.counter(2, 8));
    await expect(stage(page)).toContainText('Onboarding plan for Globex');
    await expect(show(page)).toContainText(/\d:\d\d/);
    const notes = HOME_DECK.slides.plan.notes.split(HOME_DECK.customer).join('Globex');
    if (notes !== '') await expect(show(page)).toContainText(notes);
    /* keys page with a cut */
    await page.keyboard.press('ArrowRight');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(3, 8));
    expect(await stage(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
    await page.keyboard.press('Space');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(4, 8));
    await page.keyboard.press('Home');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(1, 8));
    /* slide 1 carries the hero's picture and its credit */
    await expect(stage(page).locator('[data-field]')).toHaveCount(1);
    await expect(stage(page)).toContainText('NASA');
    await page.keyboard.press('End');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(8, 8));
    await page.keyboard.press('PageUp');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(7, 8));
    /* Enter on a focused Previous goes back, not forward */
    await show(page).locator('[data-show-button="previous"]').focus();
    await page.keyboard.press('Enter');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(6, 8));
    /* Escape returns with focus on Present, within 400 ms and one frame (the 400 ms exit motion) */
    await watchMotion(page, 'closed');
    await page.keyboard.press('Escape');
    await expect(show(page)).toHaveCount(0);
    await expect(presentButton(page)).toBeFocused();
    const closed = await readMotion(page);
    noteTiming('Escape to the slide back (in the page)', closed);
    if (loadReading().read) expect(closed).toBeLessThanOrEqual(400 + 17);
    /* the slideshow key opens nothing while the band is out of view, and the show once it is half in view */
    await page.locator('body').click({ position: { x: 4, y: 4 } });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press(SLIDESHOW_KEY);
    await page.waitForTimeout(300);
    await expect(show(page)).toHaveCount(0);
    await band(page).scrollIntoViewIfNeeded();
    await page.keyboard.press(SLIDESHOW_KEY);
    await expect(stage(page)).toBeFocused();
    /* a focused Exit exits on Space */
    await show(page).locator('[data-show-button="exit"]').focus();
    await page.keyboard.press('Space');
    await expect(show(page)).toHaveCount(0);
    await page.context().close();
  });

  test(title('home.present.focus'), async ({ browser }) => {
    const page = await freshPage(browser);
    await openHome(page);
    await band(page).scrollIntoViewIfNeeded();
    await presentButton(page).click();
    await expect(stage(page)).toBeFocused();
    const order: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(
          () => (document.activeElement as HTMLElement | null)?.dataset['showButton'] ?? 'outside',
        ),
      );
    }
    expect(order).toEqual(['previous', 'next', 'exit', 'previous', 'next', 'exit', 'previous']);
    await page.keyboard.press('Shift+Tab');
    expect(
      await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.dataset['showButton'],
      ),
    ).toBe('exit');
    await page.keyboard.press('Escape');
    await expect(presentButton(page)).toBeFocused();
    await page.context().close();
  });

  test(title('home.present.print'), async ({ browser }) => {
    test.setTimeout(90_000);
    /* the deck as the visitor left it, one 16 by 9 page per slide */
    const page = await freshPage(browser);
    await openHome(page);
    await page.locator('[data-band="agents"]').scrollIntoViewIfNeeded();
    await typeLine(page, `tailor --replace=${HOME_DECK.customer}=Globex`);
    /* the button opens the browser's print after it loads slide 7's still */
    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed += 1;
      };
    });
    const still = page
      .waitForRequest((r) => /\/home\/.*field/.test(r.url()) || /field-still/.test(r.url()), {
        timeout: 10_000,
      })
      .catch(() => null);
    await band(page).locator('[data-print]').click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed))
      .toBe(1);
    expect(await still, 'slide 7 still requested by the print').not.toBeNull();
    /* Cmd or Ctrl+P fires beforeprint as the button's print does: the container holds the deck */
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const deck = page.locator('[data-print-deck]');
    await expect(deck.locator(':scope > *')).toHaveCount(8);
    await expect(deck).toContainText('Onboarding plan for Globex');
    await expect(deck).not.toContainText('Northwind');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(deck.locator(':scope > *')).toHaveCount(0);
    /* Chromium's own print of the page under print emulation */
    await page.emulateMedia({ media: 'print' });
    const read = pdfPages(await page.pdf({ preferCSSPageSize: true }));
    expect(read.pages).toBe(8);
    /* 16 by 9 inches, 1152 by 648 pt; soft, so the hero's print below is read whatever this reads */
    for (const box of read.boxes)
      expect.soft(box.split(/\s+/).map(Number).slice(2)).toEqual([1152, 648]);
    await page.context().close();
    /* without the live module, the hero slide alone */
    const bare = await freshPage(browser);
    /* the live module by its path on a dev server, and on a build by its overlay's class (the
       build names its chunk after live/index.ts, index-<hash>.js, beside the entry's) */
    await bare.route(/\.(m?js|ts)(\?|$)/, async (route) => {
      if (/\/live\/|home-live-/.test(route.request().url())) return route.abort();
      const response = await route.fetch();
      if ((await response.body()).includes('ts-home-sel-layer')) return route.abort();
      return route.fulfill({ response });
    });
    await bare.goto('/home');
    await bare.waitForSelector('main#top[data-hydrated]', { timeout: 30_000 });
    await bare.emulateMedia({ media: 'print' });
    const hero = pdfPages(await bare.pdf({ preferCSSPageSize: true }));
    expect(hero.pages).toBe(1);
    await bare.context().close();
  });
}
