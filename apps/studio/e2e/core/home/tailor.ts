import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { TAILOR as PRODUCT } from '@turboslide/chrome/panels/assist-strings';

import { ANNOUNCE, TAILOR } from '../../../src/components/home/copy';
import { HOME_RUN } from '../../../src/components/home/run.generated';
import { title } from '../lib';
import { bandReady, openHome, played, recordAnimations } from './objects';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.7, 6.7; build/integrator.md "Landing,
// day 0" 3, 4.9 and 5.1), L2's push 3 and V2's push 12: Tailor and the filmstrip (the kits have
// their own band and module, kits.ts, since V2#12). Every observation is through the page; /home
// writes no store. The figures the count must equal are the CLI's recorded answers
// (`run.generated.ts` `tailorCounts`), and the strings are the product's (`assist-strings.ts`
// TAILOR) and the page's (`copy.ts` TAILOR).

export const ROWS: readonly string[] = ['home.tailor.apply', 'home.tailor.filmstrip'];

/** The text of every slide on the page, joined; the Present list's titles with it. */
const slidesText = (page: Page): Promise<string> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-home-slides], [data-slide-row]')]
      .map((el) => el.textContent ?? '')
      .join('\n'),
  );

const count = (text: string, word: string): number => text.split(word).length - 1;

/**
 * The --pt-select pixels the page shows across a 6 px run centred on (x, y), read from a
 * screenshot decoded in the page (what the eye sees, whatever paints over a rule).
 */
async function blueAt(page: Page, x: number, y: number): Promise<number> {
  const shot = await page.screenshot({
    clip: { x: Math.max(0, x - 3), y: Math.max(0, y), width: 6, height: 1 },
  });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (ctx === null) return -1;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (
        Math.abs((d[i] ?? 0) - 47) < 24 &&
        Math.abs((d[i + 1] ?? 0) - 92) < 24 &&
        Math.abs((d[i + 2] ?? 0) - 224) < 24
      )
        n += 1;
    return n;
  }, shot.toString('base64'));
}

export function rows(): void {
  test(title('home.tailor.apply'), async ({ browser }) => {
    const { context, page } = await openHome(browser);
    try {
      const band = page.locator('[data-band="tailor"]');
      await bandReady(page, 'tailor');
      const field = band.locator('[data-tailor-to]');
      const countCell = band.locator('[data-tailor-count]');
      const apply = band.locator('[data-tailor-apply]');
      expect(await field.getAttribute('maxlength')).toBe('24');

      // an empty field answers the page's sentence
      await apply.click();
      await expect(countCell).toHaveText(TAILOR.empty);

      // the count is the product's sentence with the CLI's figures for the deck the page holds
      const rest = HOME_RUN.tailorCounts.rest;
      await field.fill('Globex');
      await expect(countCell).toHaveText(PRODUCT.count(rest.places, rest.slides));
      const before = await slidesText(page);
      const names = count(before, 'Northwind');
      expect(names).toBeGreaterThan(0);

      // Enter: every name on every slide within 1 s, the snackbar with the product's words
      const t0 = Date.now();
      await field.press('Enter');
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll('[data-home-slides], [data-slide-row]')].some((el) =>
            (el.textContent ?? '').includes('Northwind'),
          ),
        undefined,
        { timeout: 1000 },
      );
      expect(Date.now() - t0).toBeLessThanOrEqual(1000);
      const after = await slidesText(page);
      expect(count(after, 'Globex')).toBe(names);
      const snack = band.locator('[data-snackbar]');
      await expect(snack).toHaveAttribute('data-on', '');
      await expect(snack.locator('[data-snackbar-text]')).toHaveText(
        PRODUCT.result('Globex', rest.places, rest.slides, 0),
      );
      await expect(band.locator('[data-tailor-from]')).toHaveText('Globex');

      // the snackbar's Undo puts every name back and the bar leaves by a cut
      await snack.locator('[data-snackbar-undo]').click();
      expect(await snack.getAttribute('data-on')).toBeNull();
      expect(await snack.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
      expect(count(await slidesText(page), 'Northwind')).toBe(names);
      expect(count(await slidesText(page), 'Globex')).toBe(0);

      // Apply by the button; the next change of the band cuts the snackbar
      await field.fill('Initech');
      await apply.click();
      await expect(snack).toHaveAttribute('data-on', '');
      // the next change: slide 2 moved down in the band's filmstrip
      const thumb = band.locator('[data-thumb="plan"]');
      await thumb.focus();
      await page.keyboard.press('ControlOrMeta+ArrowDown');
      await expect(snack.locator('[data-snackbar-text]')).not.toContainText('Initech');
      await page.keyboard.press('Escape');
      expect(await snack.getAttribute('data-on')).toBeNull();
      // the band's Undo by the key with focus in the band (2.0): the move, then the names
      await thumb.focus();
      await page.keyboard.press('ControlOrMeta+z');
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => count(await slidesText(page), 'Northwind')).toBe(names);

      // the field takes at most 24 characters
      await field.fill('');
      await field.type('A customer name over twenty four characters', { delay: 5 });
      expect((await field.inputValue()).length).toBeLessThanOrEqual(24);

      // without slide 5 the count is the fixture's recording. The page reaches that deck by
      // restoring version 1 (Version history's scrubber, V2#14) or a typed `version restore 1`
      // (V3#13); a tree without either records the clause as not reached rather than passed
      const restore = page.locator('[data-version-restore]');
      const slider = page.locator('[data-version-slider][role="slider"]');
      if ((await slider.count()) > 0 && (await restore.count()) > 0) {
        await slider.scrollIntoViewIfNeeded();
        await slider.focus();
        await page.keyboard.press('Home');
        await restore.click();
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll<HTMLElement>('[data-home-slides][data-counter]')].some(
              (el) => (el.dataset['counter'] ?? '').endsWith('/ 8'),
            ),
          undefined,
          { timeout: 3000 },
        );
        await band.scrollIntoViewIfNeeded();
        const start = HOME_RUN.tailorCounts.start;
        await expect(countCell).toHaveText(PRODUCT.count(start.places, start.slides));
        await field.fill('Globex');
        await field.press('Enter');
        await expect(band.locator('[data-snackbar-text]')).toHaveText(
          PRODUCT.result('Globex', start.places, start.slides, 0),
        );
      } else
        test.info().annotations.push({
          type: 'not reached',
          description:
            'the deck without slide 5: no Restore This Version on this tree (the scrubber is V2#14)',
        });
    } finally {
      await context.close();
    }
  });

  test(title('home.tailor.filmstrip'), async ({ browser }) => {
    const { context, page } = await openHome(browser);
    try {
      const band = page.locator('[data-band="tailor"]');
      await bandReady(page, 'tailor');
      const order = () =>
        band
          .locator('[data-filmstrip] [data-thumb]:not([hidden])')
          .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['thumb'] ?? ''));
      const counters = () =>
        page.evaluate(() =>
          Object.fromEntries(
            [...document.querySelectorAll<HTMLElement>('[data-home-slides]')].map((el) => [
              `${el.dataset['instance'] ?? ''}`,
              el.dataset['counter'] ?? '',
            ]),
          ),
        );
      const o0 = await order();
      expect(o0).toEqual(['title', 'plan', 'gets', 'ships', 'next-steps']);
      const thumb = (id: string) => band.locator(`[data-thumb="${id}"]`);
      const box = async (id: string) => {
        const b = await thumb(id).boundingBox();
        if (b === null) throw new Error(`no box for ${id}`);
        return b;
      };

      // drag slide 2 to place 4: lifted with a 2 px outline, the others make room in 200 ms
      const a = await box('plan');
      const c = await box('ships');
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2 + 3, a.y + a.height / 2 + 3, { steps: 2 });
      await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2 + 2, { steps: 10 });
      // the outline as the eye sees it: --pt-select pixels along the held slide's left edge
      const edge = await thumb('plan').evaluate((el) => {
        const sheet = (el.querySelector('.ts-home-sheet') ?? el).getBoundingClientRect();
        return { x: sheet.left, y: sheet.top + sheet.height / 2 };
      });
      expect(
        await blueAt(page, edge.x, edge.y),
        'lifted with a 2 px outline in --pt-select',
      ).toBeGreaterThanOrEqual(2);
      const room = await thumb('gets').evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(room).toBe('0.2s');
      await recordAnimations(page);
      await page.mouse.up();
      const settle = (await played(page)).filter((p) => p.target === 'plan');
      expect(settle.map((p) => [p.duration, p.props])).toEqual([[240, ['transform']]]);
      await page.waitForTimeout(300);
      expect(await order()).toEqual(['title', 'gets', 'ships', 'plan', 'next-steps']);
      // every counter on the page renumbers
      const cs = await counters();
      for (const [instance, counter] of Object.entries(cs)) {
        if (instance.includes('plan') || instance === 'tailor-stage') continue;
        if (instance.includes('gets') || instance === 'present')
          expect(counter, instance).toBe('2 / 9');
        if (instance.includes('ships')) expect(counter, instance).toBe('3 / 9');
      }
      expect(cs['tailor-thumb-plan']).toBe('4 / 9');
      await expect(band.locator('[data-announce]')).toHaveText(ANNOUNCE.slideMoved(2, 4));

      // Undo returns it (the move's sentence holds the snackbar's Undo)
      await expect(band.locator('[data-snackbar-text]')).toHaveText(ANNOUNCE.slideMoved(2, 4));
      await band.locator('[data-snackbar-undo]').click();
      await page.waitForTimeout(300);
      expect(await order()).toEqual(o0);
      expect((await counters())['tailor-thumb-plan']).toBe('2 / 9');

      // Cmd or Ctrl with Down moves the focused slide; Move Up moves it back
      await thumb('gets').focus();
      await page.keyboard.press('ControlOrMeta+ArrowDown');
      expect(await order()).toEqual(['title', 'plan', 'ships', 'gets', 'next-steps']);
      await thumb('gets').click();
      const up = thumb('gets').locator('[data-thumb-move="up"]');
      await expect(up).toBeVisible();
      await up.click();
      expect(await order()).toEqual(o0);
      await thumb('gets').locator('[data-thumb-move="down"]').click();
      expect(await order()).toEqual(['title', 'plan', 'ships', 'gets', 'next-steps']);
    } finally {
      await context.close();
    }

    // on touch a 350 ms press lifts it; a quick swipe does not
    const touch = await openHome(browser, { touch: true, width: 390, height: 844 });
    try {
      const band = touch.page.locator('[data-band="tailor"]');
      await bandReady(touch.page, 'tailor');
      const t = band.locator('[data-thumb="plan"]');
      const b = await t.boundingBox();
      if (b === null) throw new Error('no plan thumbnail');
      const cdp = await touch.context.newCDPSession(touch.page);
      const point = (x: number, y: number) => [{ x, y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: point(b.x + 20, b.y + 20),
      });
      await touch.page.waitForTimeout(420);
      expect(await t.getAttribute('data-lifted'), 'a 350 ms press lifts it').toBe('');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await touch.context.close();
    }
  });
}
