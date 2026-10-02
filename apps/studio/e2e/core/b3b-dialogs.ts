import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { Scratch, ctl, extraHTTPHeaders, newDeck, openEditor, teardownAll, title } from './lib';
import { isCoreId } from './matrix';

// Lane B3b's dialog and presenter rows of Round 1 (docs/NEXT.md 4.1.3 item 17, 4.1.5): the Share
// dialog's ruled rows in core/share.spec.ts and the presenter head on a phone in
// core/present.spec.ts. Each spec file calls its function once and spreads the ids into its
// coverage list; a row's test is declared once its row is in the matrix (round1/build/b3b.md).
// Each test opens its own context with its own deck from /new, torn down through the product.

type Person = { context: BrowserContext; page: Page; scratch: Scratch };

async function contextAt(
  people: Person[],
  browser: Browser,
  width: number,
  height: number,
): Promise<Person> {
  const context = await browser.newContext({ extraHTTPHeaders, viewport: { width, height } });
  const page = await context.newPage();
  const person = { context, page, scratch: new Scratch() };
  people.push(person);
  return person;
}

function teardownHook(people: Person[]): void {
  test.afterAll(async () => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    for (const person of people.splice(0)) {
      try {
        /* the teardown opens File from the menu bar, which the phone editor folds into its
           Menus key under 720 px (PhoneEditor.css): a phone context is widened first */
        await person.page.setViewportSize({ width: 1440, height: 900 });
        await teardownAll(person.page, person.scratch);
      } catch (error) {
        failures.push(
          error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error),
        );
      } finally {
        await person.context.close().catch(() => undefined);
      }
    }
    expect(failures, 'every deck of the B3b rows is torn down').toEqual([]);
  });
}

type Body = (args: { browser: Browser }) => Promise<void>;

function rows(): { declared: string[]; row: (id: string, body: Body) => void } {
  const declared: string[] = [];
  return {
    declared,
    row: (id, body) => {
      if (!isCoreId(id)) return;
      declared.push(id);
      test(title(id), body);
    },
  };
}

/** The Share dialog's rows: B3b's in core/share.spec.ts. */
export function shareChromeRows(): string[] {
  const people: Person[] = [];
  teardownHook(people);
  const { declared, row } = rows();

  row('share.dialog.ruled-rows', async ({ browser }) => {
    test.setTimeout(180_000);
    /* a fresh browser with no display name: the first Share asked one before (rank 21) */
    const { page, scratch } = await contextAt(people, browser, 1440, 900);
    const deck = await newDeck(page, scratch, 'Ruled rows');
    await openEditor(page, deck);
    await ctl(page, 'share.open').click();
    await ctl(page, 'dialog.share').waitFor({ timeout: 10_000 });
    await expect(ctl(page, 'dialog.share.loading')).toHaveCount(0, { timeout: 10_000 });
    await page.waitForTimeout(500);
    const read = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('[data-control="dialog.share"]');
        const card = dialog?.closest('[role="dialog"]') ?? dialog;
        if (!card) return null;
        const width = (el: Element, side: string) =>
          parseFloat(getComputedStyle(el).getPropertyValue(`border-${side}-width`)) || 0;
        /* a frame: a box inside the body with a line on all four sides that is no field, no select,
           no button, no picture and no chip of a person */
        const framed = [...card.querySelectorAll('div, ul, ol, li, section')]
          .filter((el) => el.getClientRects().length > 0)
          .filter((el) => ['top', 'right', 'bottom', 'left'].every((side) => width(el, side) > 0))
          .filter(
            (el) => el.closest('.ts-chip, .ts-identity-chip, [data-control$=".claim"]') === null,
          )
          .map((el) =>
            typeof el.className === 'string' ? el.className.split(/\s+/)[0] : el.tagName,
          );
        const ruled = [
          ...card.querySelectorAll('.ts-share-row, .ts-share-more .ts-dialog-row'),
        ].map((el) => width(el, 'bottom'));
        return {
          prompt: card.querySelector('[data-control="dialog.namePrompt"]') !== null,
          framed,
          ruled,
        };
      });
    const first = await read();
    await ctl(page, 'dialog.share.more').click();
    await page.waitForTimeout(400);
    const opened = await read();
    await page.keyboard.press('Escape');
    test.info().annotations.push({ type: 'share', description: JSON.stringify({ first, opened }) });
    expect(first, 'the Share dialog opened').not.toBeNull();
    expect(first!.prompt, 'the dialog opens without a name prompt').toBe(false);
    expect(first!.ruled.length, 'the rows are drawn').toBeGreaterThan(0);
    expect(
      first!.ruled.every((w) => w >= 1),
      'each row draws its line',
    ).toBe(true);
    expect(first!.framed, 'no framed box in the first stage').toEqual([]);
    expect(opened!.framed, 'no framed box behind More').toEqual([]);
  });

  return declared;
}

/** The presenter's rows: B3b's in core/present.spec.ts. */
export function presentChromeRows(): string[] {
  const people: Person[] = [];
  teardownHook(people);
  const { declared, row } = rows();

  row('present.presenter.phone-head', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page, scratch } = await contextAt(people, browser, 390, 844);
    const deck = await newDeck(page, scratch, 'Presenter at 390');
    const console = await context.newPage();
    await console.goto(`/present/${deck}`);
    await console.locator('.ts-presenter-head').first().waitFor({ timeout: 30_000 });
    await console.waitForTimeout(1000);
    const facts = await console.evaluate(() => {
      const box = (el: Element | null) => {
        if (!el || el.getClientRects().length === 0) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      };
      const status = box(document.querySelector('.ts-presenter-link'));
      const buttons = [
        ...document.querySelectorAll('.ts-presenter-timer .ts-presenter-text-btn'),
      ].map((el) => ({ word: (el.textContent ?? '').trim(), box: box(el) }));
      const crosses = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
        a !== null &&
        b !== null &&
        a.x < b.right - 0.5 &&
        b.x < a.right - 0.5 &&
        a.y < b.bottom - 0.5 &&
        b.y < a.bottom - 0.5;
      return {
        viewport: window.innerWidth,
        status,
        statusWords: (document.querySelector('.ts-presenter-link')?.textContent ?? '').trim(),
        buttons,
        overlaps: buttons.filter((b) => crosses(status, b.box)).map((b) => b.word),
      };
    });
    await console.close();
    test.info().annotations.push({ type: 'presenter head', description: JSON.stringify(facts) });
    expect(facts.viewport).toBe(390);
    expect(facts.status, 'the status line is drawn').not.toBeNull();
    expect(facts.buttons.map((b) => b.word)).toEqual(expect.arrayContaining(['Pause', 'Reset']));
    expect(facts.overlaps, `"${facts.statusWords}" overlaps no button of the timer`).toEqual([]);
    expect(
      facts.status!.right <= 390.5 && facts.status!.x >= 0,
      'the status line is inside the head',
    ).toBe(true);
  });

  return declared;
}
