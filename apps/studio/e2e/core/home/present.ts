import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { HOME_ASSETS } from './asset-records';
import { PRESENT } from '../../../src/components/home/copy';
import { HOME_DECK } from '../../../src/components/home/deck.generated';
import { title } from '../lib';
import { bandReady, freshPage, loadReading, noteTiming, openHome, typeLine } from './agents';

/** The Present list's word for a skipped slide (2.11, `PRESENT.skipped`). */
const PRESENT_SKIPPED = PRESENT.skipped;

// A lane module of core/home.spec.ts (docs/LANDING.md 2.11, 6.7, the second pass). V3's, push
// V3#16: the show for the deck's nine slides with skipped slides left out (home.present.show), its
// focus (home.present.focus) and Print This Deck (home.present.print). Every observation is through
// the page; the print is read from the PDF Chromium prints under print emulation, one page per
// slide.

export const ROWS: readonly string[] = [
  'home.present.show',
  'home.present.focus',
  'home.present.print',
  'home.present.no-prompts',
];

const band = (page: Page) => page.locator('[data-band="present"]');
const presentButton = (page: Page) =>
  band(page).locator('button[data-present], [data-present] button').first();
const show = (page: Page) => band(page).locator('[data-show]');
const stage = (page: Page) => band(page).locator('[data-show-stage]');
const SLIDESHOW_KEY = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+F5';
/** The deck's slides at rest (nine; the page holds what deck.generated.ts says). */
const N = HOME_DECK.order.length;
const placeOf = (id: string): number => (HOME_DECK.order as readonly string[]).indexOf(id) + 1;

/** Waits for the agents band's running step to end (a press while one plays only finishes it, 2.9). */
async function agentsIdle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('[data-band="agents"] [data-chip][aria-disabled="true"]') === null,
  );
}

/** Presses one of the agents band's chips and waits for its step to end. */
async function pressChip(page: Page, chip: 'skip' | 'tailor'): Promise<void> {
  await bandReady(page, 'agents');
  await page.locator(`[data-band="agents"] [data-chip="${chip}"]`).click();
  await page.waitForFunction(
    () => document.querySelector('[data-band="agents"] [data-chip][aria-disabled="true"]') === null,
  );
}

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
    test.setTimeout(150_000);
    const page = await freshPage(browser);
    await openHome(page);
    /* a change of the visitor's and an agent's before the show */
    await bandReady(page, 'agents');
    await typeLine(page, `tailor --replace=${HOME_DECK.customer}=Globex`);
    await agentsIdle(page);
    await bandReady(page, 'present');
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
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(2, N));
    await expect(show(page)).toContainText(PRESENT.counter(2, N));
    /* slide 2 as the deck holds it, the name Tailor set on it */
    await expect(stage(page)).toContainText(
      HOME_DECK.slides.plan.title.split(HOME_DECK.customer).join('Globex'),
    );
    await expect(stage(page)).toContainText('Globex');
    await expect(stage(page)).not.toContainText(HOME_DECK.customer);
    await expect(show(page)).toContainText(/\d:\d\d/);
    const notes = HOME_DECK.slides.plan.notes.split(HOME_DECK.customer).join('Globex');
    if (notes !== '') await expect(show(page)).toContainText(notes);
    /* keys page with a cut */
    await page.keyboard.press('ArrowRight');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(3, N));
    expect(await stage(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
    await page.keyboard.press('Space');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(4, N));
    await page.keyboard.press('Home');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(1, N));
    /* slide 1 carries the hero's picture and its credit */
    await expect(stage(page).locator('[data-field]')).toHaveCount(1);
    await expect(stage(page)).toContainText('NASA');
    await page.keyboard.press('End');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(N, N));
    await page.keyboard.press('PageUp');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(N - 1, N));
    /* Enter on a focused Previous goes back, not forward */
    await show(page).locator('[data-show-button="previous"]').focus();
    await page.keyboard.press('Enter');
    await expect(stage(page)).toHaveAttribute('aria-label', PRESENT.stageName(N - 2, N));
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
    await bandReady(page, 'present');
    await page.keyboard.press(SLIDESHOW_KEY);
    await expect(stage(page)).toBeFocused();
    /* a focused Exit exits on Space */
    await show(page).locator('[data-show-button="exit"]').focus();
    await page.keyboard.press('Space');
    await expect(show(page)).toHaveCount(0);

    /* a skipped slide: marked in the list and left out of the show (2.11) */
    await pressChip(page, 'skip');
    await bandReady(page, 'present');
    const row = band(page).locator('[data-slide-row="next-steps"]');
    await expect(row).toContainText(PRESENT_SKIPPED);
    await band(page).locator('[data-slide-row="ships"]').click();
    await presentButton(page).click();
    await expect(stage(page)).toHaveAttribute(
      'aria-label',
      PRESENT.stageName(placeOf('ships'), N - 1),
    );
    await page.keyboard.press('ArrowRight');
    /* the slide after slide 5 comes next, counted among the slides the show shows */
    const after = HOME_DECK.order[placeOf('next-steps')] as string;
    await expect(stage(page).locator(`[data-home-slides][data-slide="${after}"]`)).toHaveCount(1);
    await expect(stage(page)).toHaveAttribute(
      'aria-label',
      PRESENT.stageName(placeOf('ships') + 1, N - 1),
    );
    for (let i = 0; i < N; i += 1) {
      await expect(stage(page).locator('[data-home-slides][data-slide="next-steps"]')).toHaveCount(
        0,
      );
      await page.keyboard.press('ArrowRight');
    }
    /* slide 8, the pattern: its still frame unless the pattern chunk is in and motion is allowed */
    if ((HOME_DECK.order as readonly string[]).includes('pattern')) {
      const mounted = await page.evaluate(
        () => (window as unknown as { tsHomePattern?: unknown }).tsHomePattern !== undefined,
      );
      await page.keyboard.press('Home');
      for (let i = 0; i < N; i += 1) {
        if ((await stage(page).locator('[data-home-slides][data-slide="pattern"]').count()) > 0)
          break;
        await page.keyboard.press('ArrowRight');
      }
      /* a drawing canvas: shown and sized (the print box's own empty canvas is hidden, V4's Q2) */
      const canvases = await stage(page)
        .locator('[data-home-slides][data-slide="pattern"] canvas')
        .evaluateAll(
          (els) =>
            els.filter((el) => {
              const r = el.getBoundingClientRect();
              return getComputedStyle(el).visibility === 'visible' && r.width > 0 && r.height > 0;
            }).length,
        );
      test.info().annotations.push({
        type: 'reading',
        description: `slide 8 in the show: ${canvases} shader canvas, the pattern chunk ${mounted ? 'loaded' : 'not loaded'}`,
      });
      if (!mounted) expect(canvases).toBe(0);
    }
    await page.keyboard.press('Escape');
    await expect(show(page)).toHaveCount(0);
    await pressChip(page, 'skip');
    await expect(band(page).locator('[data-slide-row="next-steps"]')).not.toContainText(
      PRESENT_SKIPPED,
    );

    /* openShow: the same show in the miniature's stage (View > Slideshow, V2's menus band) */
    const menus = page.locator('[data-band="menus"]');
    if ((await menus.count()) > 0) {
      await menus.scrollIntoViewIfNeeded();
      await menus.locator('[data-menubar] [role="menuitem"]', { hasText: 'View' }).first().click();
      await page
        .getByRole('menuitem', { name: /^Slideshow/ })
        .first()
        .click();
      const mini = menus.locator('[data-show]');
      await expect(mini).toHaveCount(1);
      await expect(mini.locator('[data-show-stage]')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(mini).toHaveCount(0);
      test.info().annotations.push({
        type: 'reading',
        description:
          "openShow through the menus band's View > Slideshow: the show in the miniature's stage, focus on its stage, Escape closes it",
      });
    } else {
      /* no menus band in the tree: openShow called on a container of the page's own, through the
         module the present chunk loaded (the dev server serves it by its path) */
      const opened = await page.evaluate(async () => {
        const url = '/src/components/home/live/show.ts';
        try {
          const m = (await import(/* @vite-ignore */ url)) as {
            openShow(container: HTMLElement, slideId: string): { close(): void } | null;
          };
          const box = document.createElement('div');
          box.dataset['testShowBox'] = '';
          box.style.cssText = 'width: 640px; height: 360px';
          const opener = document.createElement('button');
          opener.dataset['testShowOpener'] = '';
          opener.textContent = 'Open';
          document.querySelector('[data-band="present"]')?.append(opener, box);
          opener.focus();
          return m.openShow(box, 'plan') !== null;
        } catch {
          return null;
        }
      });
      if (opened === null)
        test.info().annotations.push({
          type: 'not driven',
          description:
            'openShow: the tree holds no menus band and the server does not serve the module by its path',
        });
      else {
        expect(opened).toBe(true);
        const boxed = page.locator('[data-test-show-box] [data-show]');
        await expect(boxed).toHaveCount(1);
        await expect(boxed.locator('[data-show-stage]')).toBeFocused();
        /* sized to the box, on slide 2 of the shown slides */
        const [outer, inner] = await Promise.all([
          page.locator('[data-test-show-box]').boundingBox(),
          boxed.boundingBox(),
        ]);
        expect(inner!.width).toBeLessThanOrEqual(outer!.width + 1);
        expect(inner!.height).toBeLessThanOrEqual(outer!.height + 1);
        await expect(boxed).toContainText(HOME_DECK.slides.plan.title);
        await page.keyboard.press('Escape');
        await expect(boxed).toHaveCount(0);
        await expect(page.locator('[data-test-show-opener]')).toBeFocused();
        test.info().annotations.push({
          type: 'reading',
          description:
            'openShow driven on a container of the page (the tree holds no menus band): the show inside it, focus on its stage, Escape back to the opener',
        });
      }
    }
    await page.context().close();

    /* the band runs taller than the screen at 1440 by 900 (since DR-D4#7) and at 390, so the show
       covers the screen at both: the slide and the bar inside the window at its middle wherever
       the band is scrolled, the bar inside the column's 16 px gutter */
    for (const width of ['desktop', 'phone'] as const) {
      const viewer = await freshPage(browser);
      await openHome(viewer, width);
      await bandReady(viewer, 'present');
      await viewer.evaluate(() => {
        const top = document.querySelector('[data-band="present"]')!.getBoundingClientRect().top;
        window.scrollBy(0, top - 58);
      });
      await presentButton(viewer).click();
      await expect(stage(viewer)).toBeFocused();
      await viewer.waitForFunction(
        () =>
          document
            .querySelector('[data-band="present"] [data-show]')
            ?.getAnimations({ subtree: true }).length === 0,
      );
      const fit = await viewer.evaluate(() => {
        const show = document.querySelector('[data-band="present"] [data-show]')!;
        const box = (sel: string) => show.querySelector(sel)!.getBoundingClientRect();
        const stage = box('[data-show-stage]');
        const bar = box('.ts-home-show-bar');
        return {
          width: innerWidth,
          height: innerHeight,
          barLeft: bar.left,
          barRight: bar.right,
          top: stage.top,
          bottom: bar.bottom,
        };
      });
      test.info().annotations.push({
        type: 'reading',
        description: `the show at ${fit.width} by ${fit.height}: the slide from y ${Math.round(fit.top)}, the bar to y ${Math.round(fit.bottom)}, the bar from x ${Math.round(fit.barLeft)} to ${Math.round(fit.barRight)}`,
      });
      expect(fit.top).toBeGreaterThanOrEqual(0);
      expect(fit.bottom).toBeLessThanOrEqual(fit.height);
      expect(fit.barLeft).toBeGreaterThanOrEqual(16 - 0.5);
      expect(fit.barRight).toBeLessThanOrEqual(fit.width - 16 + 0.5);
      expect(Math.abs(fit.top - (fit.height - fit.bottom))).toBeLessThanOrEqual(2);
      await viewer.keyboard.press('Escape');
      await expect(show(viewer)).toHaveCount(0);
      await expect(presentButton(viewer)).toBeFocused();
      await viewer.context().close();
    }
  });

  test(title('home.present.focus'), async ({ browser }) => {
    const page = await freshPage(browser);
    await openHome(page);
    await bandReady(page, 'present');
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
    /* Exit, by the keyboard and by a click, gives focus back to Present */
    await page.keyboard.press('Enter');
    await expect(stage(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(show(page)).toHaveCount(0);
    await expect(presentButton(page)).toBeFocused();
    await presentButton(page).click();
    await expect(stage(page)).toBeFocused();
    await show(page).locator('[data-show-button="exit"]').click();
    await expect(show(page)).toHaveCount(0);
    await expect(presentButton(page)).toBeFocused();
    await page.context().close();
  });

  test(title('home.present.print'), async ({ browser }) => {
    test.setTimeout(90_000);
    /* the deck as the visitor left it, one 16 by 9 page per slide */
    const page = await freshPage(browser);
    const loaded = new Set<string>();
    page.on('requestfinished', (request) => loaded.add(new URL(request.url()).pathname));
    await openHome(page);
    await bandReady(page, 'agents');
    await typeLine(page, `tailor --replace=${HOME_DECK.customer}=Globex`);
    await agentsIdle(page);
    /* the Globex kit, which every printed slide takes, slide 8 with the rest (2.8; verify2 N3) */
    await bandReady(page, 'kits');
    await page.locator('[data-band="kits"] [data-kit="globex"]').first().click();
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
    await bandReady(page, 'present');
    await band(page).locator('[data-print]').click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed))
      .toBe(1);
    expect(await still, 'slide 7 still requested by the print').not.toBeNull();
    /* Cmd or Ctrl+P fires beforeprint as the button's print does: the container holds the deck */
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const deck = page.locator('[data-print-deck]');
    await expect(deck.locator(':scope > *')).toHaveCount(N);
    await expect(deck).toContainText('Onboarding plan for Globex');
    await expect(deck).not.toContainText('Northwind');
    /* slide 8 prints the still frame the exporter stores for its pattern through the frame's dots
       (the mask, requested before the button opened the print) in the kit's ink over its paper,
       as every other slide takes the kit; its print box alone is a whole page of ink */
    const frame = HOME_ASSETS.find((a) => a.role === 'pattern-mask');
    if ((HOME_DECK.order as readonly string[]).includes('pattern') && frame !== undefined) {
      const drawn = await deck
        .locator(
          '[data-home-slides][data-slide="pattern"] [data-field="pattern"] > .ts-field-still',
        )
        .evaluate((el, path) => {
          const style = getComputedStyle(el);
          const sheet = getComputedStyle(el.closest('[data-home-slides]')!);
          return {
            mask: style.maskImage.includes(path),
            ink: style.backgroundColor,
            paper: sheet.getPropertyValue('--paper').trim(),
          };
        }, frame.path);
      expect(drawn, "slide 8's print draws the pattern's dots in the kit's ink").toEqual({
        mask: true,
        ink: 'rgb(244, 241, 234)',
        paper: '#0a1b38',
      });
      expect(loaded.has(frame.path), 'the mask loaded before the print').toBe(true);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(deck.locator(':scope > *')).toHaveCount(0);
    /* Chromium's own print of the page under print emulation */
    await page.emulateMedia({ media: 'print' });
    const read = pdfPages(await page.pdf({ preferCSSPageSize: true }));
    expect(read.pages).toBe(N);
    /* 16 by 9 inches, 1152 by 648 pt; soft, so the hero's print below is read whatever this reads */
    for (const box of read.boxes)
      expect.soft(box.split(/\s+/).map(Number).slice(2)).toEqual([1152, 648]);
    /* a skipped slide leaves the print, as the product's print leaves it (2.11) */
    await page.emulateMedia({ media: 'screen' });
    await pressChip(page, 'skip');
    await expect(band(page).locator('[data-slide-row="next-steps"]')).toContainText(
      PRESENT_SKIPPED,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(deck.locator(':scope > *')).toHaveCount(N - 1);
    await expect(deck.locator('[data-home-slides][data-slide="next-steps"]')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.emulateMedia({ media: 'print' });
    expect(pdfPages(await page.pdf({ preferCSSPageSize: true })).pages).toBe(N - 1);
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

  test(title('home.present.no-prompts'), async ({ browser }) => {
    test.setTimeout(120_000);
    /* recorded version 2 holds slide 5 as the run's first step inserted it: the layout's empty
       placeholders, which the bands draw with the editor stage's prompts */
    const page = await freshPage(browser);
    await openHome(page);
    await bandReady(page, 'agents');
    const versionSlider = page.locator('[data-band="agents"] [data-version-slider][role="slider"]');
    for (const version of [2, 3]) {
      await versionSlider.focus();
      await page.keyboard.press('Home');
      for (let i = 1; i < version; i += 1) await page.keyboard.press('ArrowRight');
      await expect(versionSlider).toHaveAttribute('aria-valuenow', String(version));
      await page.locator('[data-band="agents"] [data-version-restore]').click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as { tsHomeStore: { get(): { agentStep: number } } }
              ).tsHomeStore.get().agentStep,
          ),
        )
        .toBe(version - 1);
      /* the band's slide 5 keeps its prompts (the editor stage's) */
      expect(
        await page
          .locator('[data-band="agents"] [data-home-slides][data-slide="next-steps"] [data-prompt]')
          .count(),
      ).toBeGreaterThan(0);

      /* the Present band's chosen slide and the show draw none, as the product's Slideshow */
      await bandReady(page, 'present');
      await band(page).locator('[data-slide-row="next-steps"]').click();
      await expect(
        band(page).locator('[data-home-slides][data-slide="next-steps"]').first(),
      ).toBeVisible();
      expect(
        await band(page).locator('[data-present-display] [data-prompt]').count(),
        `the chosen slide, version ${version}`,
      ).toBe(0);
      await presentButton(page).click();
      await expect(stage(page)).toBeFocused();
      await expect(stage(page)).toHaveAttribute(
        'aria-label',
        PRESENT.stageName(placeOf('next-steps'), N),
      );
      expect(await stage(page).locator('[data-prompt]').count(), `show, version ${version}`).toBe(
        0,
      );
      await expect(stage(page)).not.toContainText('Click to add');
      await page.keyboard.press('Escape');
      await expect(show(page)).toHaveCount(0);

      /* the print, which Cmd or Ctrl+P fills as the button does: nine slides, no prompt */
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      const deck = page.locator('[data-print-deck]');
      await expect(deck.locator(':scope > *')).toHaveCount(N);
      await expect(deck.locator('[data-home-slides][data-slide="next-steps"]')).toHaveCount(1);
      expect(await deck.locator('[data-prompt]').count(), `print, version ${version}`).toBe(0);
      await expect(deck).not.toContainText('Click to add');
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await expect(deck.locator(':scope > *')).toHaveCount(0);
      await bandReady(page, 'agents');
    }
    await page.context().close();
  });
}
