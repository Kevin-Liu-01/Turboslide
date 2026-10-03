import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { HISTORY, VERSIONS } from '../../../src/components/home/copy';
import { title } from '../lib';
import { bandReady, openHome } from './objects';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.9 "The scrubber", 6.7, the second pass).
// V2's, push V2#14: Version history's scrubber and Restore This Version. home.versions.scrub reads
// the slider's versions, ticks and keys, the slide above showing the chosen version's slide by a
// cut, the caption, and nothing else on the page changing; home.versions.restore restores an
// earlier version as one change by You and reads every band equal to it. Every observation is
// through the page (the versions through `window.tsHomeStore`, read only); /home writes no store.

export const ROWS: readonly string[] = ['home.versions.scrub', 'home.versions.restore'];

type V = {
  n: number;
  author: string;
  words: string;
  at: number;
  recorded: boolean;
  slide: string | null;
};

const versions = (page: Page): Promise<V[]> =>
  page.evaluate(() =>
    (window as unknown as { tsHomeStore: { versions(): V[] } }).tsHomeStore.versions(),
  );

const state = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        tsHomeStore: {
          get(): {
            order: string[];
            customer: string;
            kit: string;
            agentStep: number;
            history: { words: string; author: string }[];
          };
        };
      }
    ).tsHomeStore.get(),
  );

const band = (page: Page): Locator => page.locator('[data-band="agents"]');
const slider = (page: Page): Locator => band(page).locator('[data-version-slider][role="slider"]');
const restore = (page: Page): Locator => band(page).locator('[data-version-restore]');
const caption = (page: Page): Locator => band(page).locator('[data-version-caption]');
const view = (page: Page): Locator => band(page).locator('[data-version-view]');

/** Three changes made on the page: a move in the hero frame, a kit, and Tailor's name. */
async function makeChanges(page: Page): Promise<void> {
  const title = page.locator('[data-band="hero"] [data-hero-slide] [data-object="title#heading"]');
  await title.focus();
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(800);
  // the kits band's swatch (V2#12), else the first pass's kits row in the Tailor band
  const kits = (await page.locator('[data-band="kits"]').count()) > 0 ? 'kits' : 'tailor';
  await bandReady(page, kits);
  await page.locator(`[data-band="${kits}"] [data-kit="kestrel"]`).click();
  await bandReady(page, 'tailor');
  const tailor = page.locator('[data-band="tailor"]');
  await tailor.locator('[data-tailor-to]').fill('Globex');
  await tailor.locator('[data-tailor-to]').press('Enter');
  // the names are set 55 ms apart in reading order: the change is whole when no slide spells the
  // old name
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-home-slides]')].some((el) =>
          (el.textContent ?? '').includes('Northwind'),
        ),
      ),
    )
    .toBe(false);
}

/** The page's own text and colours outside the slide above, to read that nothing else changes. */
const elsewhere = (page: Page) =>
  page.evaluate(() => ({
    text: [...document.querySelectorAll<HTMLElement>('[data-home-slides]')]
      .filter((el) => el.closest('[data-version-view]') === null)
      .map(
        (el) =>
          `${el.dataset['instance'] ?? ''}:${el.dataset['counter'] ?? ''}:${el.textContent ?? ''}`,
      )
      .join('|'),
    paper: [...document.querySelectorAll<HTMLElement>('[data-home-slides]')]
      .filter((el) => el.closest('[data-version-view]') === null)
      .map((el) => getComputedStyle(el).getPropertyValue('--paper').trim())
      .join(','),
  }));

export function rows(): void {
  test(title('home.versions.scrub'), async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await openHome(browser);
    try {
      await makeChanges(page);
      await bandReady(page, 'agents');
      const list = await versions(page);
      // the deck before the run, the run's three steps, the three changes made on the page
      expect(list.length).toBe(7);
      expect(list.slice(0, 4).every((v) => v.recorded)).toBe(true);
      await expect(slider(page)).toHaveAttribute('aria-valuemax', '7');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '7');
      // one tick a version: ink for You, titanium for Agent and the recorded versions
      const ticks = await slider(page)
        .locator('.ts-versions-ticks > i')
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['author'] ?? ''));
      expect(ticks).toEqual(['recorded', 'recorded', 'recorded', 'recorded', 'you', 'you', 'you']);
      await expect(restore(page)).toHaveAttribute('aria-disabled', 'true');
      await expect(view(page)).toBeHidden();
      const before = await elsewhere(page);

      // the keys: one version, five, the ends; the slide above shows the version's slide
      await slider(page).focus();
      await page.keyboard.press('ArrowLeft');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '6');
      await expect(view(page)).toBeVisible();
      // the view lies on the slide above and nothing else (the scrubber stays pressable)
      const [vb, sb] = await Promise.all([
        view(page).boundingBox(),
        band(page).locator('[data-fill="agents"]').boundingBox(),
      ]);
      for (const k of ['x', 'y', 'width', 'height'] as const)
        expect(Math.abs((vb?.[k] ?? 0) - (sb?.[k] ?? -9)), `the view's ${k}`).toBeLessThanOrEqual(
          1,
        );
      // version 6 is the kit: a change of the whole deck shows slide 1 in Kestrel
      await expect(view(page).locator('[data-home-slides]')).toHaveAttribute('data-slide', 'title');
      await expect(caption(page)).toHaveText(
        VERSIONS.caption(
          6,
          7,
          'You',
          await page.evaluate(
            (at) =>
              new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            list[5]?.at ?? 0,
          ),
        ),
      );
      expect(
        await view(page)
          .locator('[data-home-slides]')
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--paper').trim()),
      ).toBe('#f3efe6');
      expect(
        await view(page)
          .locator('[data-home-slides]')
          .evaluate((el) => el.textContent ?? ''),
      ).toContain('Northwind');
      await expect(restore(page)).toHaveAttribute('aria-disabled', 'false');
      await page.keyboard.press('PageDown');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '1');
      // version 1, the deck before the run: slide 5 absent, eight slides
      await expect(caption(page)).toHaveText(VERSIONS.recordedCaption(1, 7));
      await expect(view(page).locator('[data-home-slides]')).toHaveAttribute(
        'data-counter',
        '1 / 8',
      );
      await page.keyboard.press('ArrowRight');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '2');
      // version 2: slide 5 with its layout's placeholders, as the run's first step left it
      await expect(view(page).locator('[data-home-slides]')).toHaveAttribute(
        'data-slide',
        'next-steps',
      );
      await page.keyboard.press('End');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '7');
      await expect(view(page)).toBeHidden();
      await page.keyboard.press('Home');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '1');
      await page.keyboard.press('PageUp');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '6');

      // a click on the track and a drag of the thumb choose a version
      const track = await slider(page).locator('.ts-versions-track').boundingBox();
      expect(track).not.toBeNull();
      if (track !== null) {
        const at = (n: number) => track.x + ((n - 1) / 6) * track.width;
        await page.mouse.click(at(4), track.y + track.height / 2);
        await expect(slider(page)).toHaveAttribute('aria-valuenow', '4');
        await page.mouse.move(at(4), track.y + 1);
        await page.mouse.down();
        await page.mouse.move(at(2), track.y + 1, { steps: 6 });
        await expect(slider(page)).toHaveAttribute('aria-valuenow', '2');
        await page.mouse.move(at(5), track.y + 1, { steps: 6 });
        await page.mouse.up();
        await expect(slider(page)).toHaveAttribute('aria-valuenow', '5');
      }
      // the slide changes by a cut: no animation on the view
      expect(await view(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
      // nothing else on the page changed while the visitor scrubbed
      expect(await elsewhere(page)).toEqual(before);
      expect((await versions(page)).length).toBe(7);
    } finally {
      await context.close();
    }
  });

  test(title('home.versions.restore'), async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await openHome(browser);
    try {
      await makeChanges(page);
      await bandReady(page, 'agents');
      expect((await state(page)).customer).toBe('Globex');
      // version 5, the move alone: the kit and the name go back, the move stays
      await slider(page).focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '5');
      await restore(page).click();
      let s = await state(page);
      expect(s.customer).toBe('Northwind');
      expect(s.kit).toBe('gt');
      expect(s.history.at(-1)?.author).toBe('you');
      expect(s.history.at(-1)?.words).toMatch(/^Restored the version of /);
      // a new newest version enters, the scrubber moves to it and Restore is unavailable
      await expect(slider(page)).toHaveAttribute('aria-valuemax', '8');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '8');
      await expect(restore(page)).toHaveAttribute('aria-disabled', 'true');
      // every band equals version 5: the names on every slide, the kit gone
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll('[data-home-slides]')].some((el) =>
            (el.textContent ?? '').includes('Globex'),
          ),
        ),
      ).toBe(false);
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('[data-home-slides]')].some(
            (el) => el.style.getPropertyValue('--paper') !== '',
          ),
        ),
      ).toBe(false);

      // version 1: the deck before the run; slide 5 leaves every counter (Restore kept focus)
      await slider(page).focus();
      await page.keyboard.press('Home');
      await expect(slider(page)).toHaveAttribute('aria-valuenow', '1');
      await restore(page).click();
      s = await state(page);
      expect(s.order).not.toContain('next-steps');
      expect(s.agentStep).toBe(0);
      expect(s.history.at(-1)?.words).toBe('Restored version 1');
      await expect(page.locator('[data-hero-slide] [data-home-slides]').first()).toHaveAttribute(
        'data-counter',
        '1 / 8',
      );
      // a typed `version restore <n>` does the same by Agent (V3's console)
      const input = band(page).locator('[data-cmd]');
      if ((await input.count()) > 0) {
        await input.fill('version restore 4');
        await input.press('Enter');
        await expect.poll(async () => (await state(page)).history.at(-1)?.author).toBe('agent');
        expect((await state(page)).order).toContain('next-steps');
      } else
        test.info().annotations.push({
          type: 'not reached',
          description: 'a typed version restore: no console input on this tree (V3#13)',
        });
      expect(HISTORY.restored('6:45 PM')).toBe('Restored the version of 6:45 PM');
    } finally {
      await context.close();
    }
  });
}
