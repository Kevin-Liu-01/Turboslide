import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  clickCard,
  ctl,
  ensureShader,
  extraHTTPHeaders,
  menuPath,
  newDeck,
  openEditor,
  selectBlock,
  teardownAll,
  title,
  waitEditor,
} from './lib';
import { isCoreId } from './matrix';

// Lane C's rows of the Round 1 follow-up (the pages and the words the production verification of
// Round 1 found): the editor's Sign in dialog sized to its content, the animated pattern's chip
// noun, the refused page's words for an address that names no presentation, the /deck view's
// first visit hint clear of the book's title, and the trash page's ruled rows. core/decks.spec.ts
// calls `pagesR1f()` once and spreads its ids into its coverage list, so the rows live in this one
// module. A row's test is declared only once its row is in the matrix, so each commit of the lane
// enters its row and its test together. Each test opens its own contexts; every deck it makes is
// torn down through the product at the end.

type Person = { context: BrowserContext; page: Page; scratch: Scratch };
const people: Person[] = [];

async function contextAt(
  browser: Browser,
  width: number,
  height: number,
  theme: 'light' | 'dark' = 'light',
): Promise<Person> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height },
    colorScheme: theme,
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('gt-theme', t);
      localStorage.setItem('ts-chrome-appearance', t);
    } catch {
      // a context without storage reads the scheme alone
    }
  }, theme);
  const page = await context.newPage();
  const person = { context, page, scratch: new Scratch() };
  people.push(person);
  return person;
}

type Rect = { x: number; y: number; right: number; bottom: number; w: number; h: number };

/**
 * The open Sign in dialog's band: the distance from the bottom of the last thing the body draws
 * (a button, a field, a line of text, an error row) to the action bar's top rule. The body's own
 * bottom padding is 20 px, so a dialog sized to its content reads 20 or 21.
 */
async function signInBand(page: Page) {
  return page.evaluate(() => {
    const d = document.querySelector('[data-control="dialog.signIn"]');
    if (!d) return null;
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
    };
    const body = d.querySelector('.ts-dialog-body');
    const actions = d.querySelector('.ts-dialog-actions');
    const drawn = [
      ...(body?.querySelectorAll('button, input, label, p, .ts-dialog-error-row') ?? []),
    ].filter((el) => el.getClientRects().length > 0);
    const last = Math.max(...drawn.map((el) => el.getBoundingClientRect().bottom));
    return {
      dialog: rect(d),
      actions: actions ? rect(actions) : null,
      last,
      band: actions ? Math.round(actions.getBoundingClientRect().top - last) : null,
      controls: [...d.querySelectorAll('[data-control]')].map(
        (el) => el.getAttribute('data-control') ?? '',
      ),
    };
  });
}

const overlaps = (a: Rect | null, b: Rect | null): boolean =>
  a !== null && b !== null && a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;

/** Declares the lane's rows; returns their ids for the spec file's coverage list. */
export function pagesR1f(): string[] {
  const declared: string[] = [];
  const row = (id: string, body: Parameters<typeof test>[2]) => {
    if (!isCoreId(id)) return;
    declared.push(id);
    test(title(id), body);
  };
  test.afterAll(async () => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    for (const person of people.splice(0)) {
      try {
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
    expect(failures, 'every deck of the lane C rows is torn down').toEqual([]);
  });

  /* item 1: the dialog's fixed 400 by 320 box drew Continue with Google over an empty band of
     about 150 px where Google is the only method (production); restated in polish two, P2-A#1
     (docs/POLISH-2.md 6.6): at most 24 px from the body's last line (a method or the field) to
     the action bar, and no reserved error row on the methods step */
  row('accounts.sign-in-fits', async ({ browser }) => {
    test.setTimeout(240_000);
    const readings: string[] = [];
    for (const width of [1440, 390]) {
      const { page } = await contextAt(browser, width, width < 720 ? 844 : 900);
      await page.goto('/new');
      await waitEditor(page);
      await page.waitForTimeout(600);
      if (width < 720) {
        await ctl(page, 'title.more').click();
        const menu = page.locator('#ts-menu-title-more');
        await menu.waitFor({ timeout: 5000 });
        const entry = menu.locator('[data-menu-item*="signIn"]').first();
        if ((await entry.count()) === 0) {
          readings.push(`${width}: More lists no Sign in; the deployment offers no method`);
          await page.keyboard.press('Escape');
          continue;
        }
        await entry.click();
      } else {
        if ((await ctl(page, 'title.signIn').count()) === 0) {
          readings.push(`${width}: no Sign In in the title row; the deployment offers no method`);
          continue;
        }
        await ctl(page, 'title.signIn').click();
      }
      await ctl(page, 'dialog.signIn').waitFor({ timeout: 10_000 });
      await page.waitForTimeout(300);
      const facts = await signInBand(page);
      readings.push(`${width}: ${JSON.stringify(facts)}`);
      expect(facts, 'the dialog is open').not.toBeNull();
      expect(facts!.band, `the band under the body's last line at ${width}`).not.toBeNull();
      expect(
        facts!.band!,
        `at most the body's 20 px padding under the last line at ${width} (${facts!.band} px)`,
      ).toBeLessThanOrEqual(24);
      expect(facts!.dialog.right, 'the dialog is inside the viewport').toBeLessThanOrEqual(width);
      /* polish two, P2-A#1: no reserved error row on the methods step, the field drawn or not
         (the row under the field was part of the empty band of Kevin's screenshot, K4) */
      expect(facts!.controls, 'no reserved error row on the methods step').not.toContain(
        'dialog.signIn.error',
      );
      await page.keyboard.press('Escape');
    }
    test.info().annotations.push({ type: 'sign in dialog', description: readings.join(' | ') });
  });

  /* item 2: the chip read "Shader" while Insert reads "Animated pattern" */
  row('shaders.insert.chip-noun', async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    await newDeck(page, scratch, 'Chip noun');
    const slideId = await addSlide(page);
    const shader = await ensureShader(page, slideId);
    /* the pattern's slide: ensureShader leaves the editor there; the card click holds it */
    await clickCard(page, slideId);
    await page.keyboard.press('Escape');
    await selectBlock(page, shader.id);
    const chip = await page.evaluate(
      () => document.querySelector('.ts-overlay .ts-select-chip')?.textContent?.trim() ?? null,
    );
    test.info().annotations.push({ type: 'chip', description: `${shader.how}; chip "${chip}"` });
    expect(chip, 'the chip names the block as Insert does').toBe('Animated pattern');
  });

  /* item 3: /edit/Not_A_Slug drew "deckId must be a slug." under "This presentation could not
     be opened" with Reload */
  row('decks.refused.address-words', async ({ browser }) => {
    test.setTimeout(180_000);
    const readings: string[] = [];
    for (const [width, path] of [
      [1440, '/edit/Not_A_Slug'],
      [1440, '/deck/Not_A_Slug'],
      [390, '/edit/Not_A_Slug'],
    ] as const) {
      const { page } = await contextAt(browser, width, width < 720 ? 844 : 900);
      await page.goto(path);
      await page.locator('[data-control="refused"]').waitFor({ timeout: 30_000 });
      const facts = await page.evaluate(() => ({
        h1: document.querySelector('[data-control="refused"] h1')?.textContent ?? null,
        sentence: document.querySelector('[data-control="refused"] .ts-page-sentence')?.textContent,
        text: document.querySelector('main')?.textContent ?? '',
        reload: document.querySelectorAll('[data-control="refused.reload"]').length,
        decks: document.querySelector('[data-control="refused.decks"]')?.getAttribute('href'),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      readings.push(`${width} ${path}: ${JSON.stringify({ ...facts, text: undefined })}`);
      expect(facts.h1, `the heading at ${path}`).toBe('This address is not a presentation');
      expect(facts.sentence ?? '', 'the product sentence').toMatch(
        /^A presentation’s address ends in lower case letters, digits and hyphens\./,
      );
      expect(facts.text, 'no store words on the page').not.toMatch(/deckId|slug/i);
      expect(facts.reload, 'no Reload: the same address refuses the same way').toBe(0);
      expect(facts.decks, 'Your Presentations is the way back').toBe('/decks');
      expect(facts.overflow, 'nothing crosses the viewport').toBeLessThanOrEqual(0);
    }
    test.info().annotations.push({ type: 'refused page', description: readings.join(' | ') });
  });

  /* item 4: on a phone the first visit hint hung over the book's title */
  row('view.book.hint-clear', async ({ browser }) => {
    test.setTimeout(240_000);
    const readings: string[] = [];
    for (const theme of ['light', 'dark'] as const)
      for (const width of [1440, 1280, 390]) {
        /* a fresh context is a first visit: the hint shows for 5 s on the shell's first open */
        const { page } = await contextAt(browser, width, width < 720 ? 844 : 900, theme);
        await page.goto('/deck/gt-brand?mode=book');
        /* the hint holds 5 s from the shell's boot: the boxes are read in the first frame that
           draws both the hint and the book's title */
        type Facts = { toast: Rect | null; h1: Rect | null };
        const read = (): Promise<Facts> =>
          page.evaluate(() => {
            const box = (el: Element | null) => {
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
            };
            return {
              toast: box(document.querySelector('.pt-toast.is-on')),
              h1: box(document.querySelector('.pt-book-head h1')),
            };
          });
        let facts: Facts = { toast: null, h1: null };
        const t0 = Date.now();
        while (Date.now() - t0 < 60_000) {
          facts = await read();
          if (facts.toast !== null && facts.h1 !== null) break;
          await page.waitForTimeout(100);
        }
        readings.push(`${theme} ${width}: ${JSON.stringify(facts)}`);
        expect(facts.toast, `the hint shows on the first visit (${theme} ${width})`).not.toBeNull();
        expect(
          overlaps(facts.toast, facts.h1),
          `the hint is clear of the title (${theme} ${width})`,
        ).toBe(false);
      }
    test.info().annotations.push({ type: 'hint and title', description: readings.join(' | ') });
  });

  /* item 5: /decks draws ruled rows, and the trash one click away drew boxed cards with framed
     Restore and Delete forever */
  row('decks.trash.ruled-rows', async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    const deck = await newDeck(page, scratch, 'Ruled trash row');
    await openEditor(page, deck);
    await page.keyboard.press('Escape');
    await menuPath(page, 'file', 'file.moveToTrash');
    await page.waitForURL(/\/decks/, { timeout: 20_000 });
    const readings: string[] = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width < 720 ? 844 : 900 });
      await page.goto('/decks/trash');
      await page.waitForSelector('.ts-trash-page[data-hydrated]', { timeout: 30_000 });
      await ctl(page, `trash.card.${deck}`).waitFor({ timeout: 30_000 });
      const facts = await page.evaluate((id) => {
        const row = document.querySelector(`[data-control="trash.card.${id}"]`);
        /* the sides that draw a line: a frame is a line on the top, the left or the right (the
           ruled row's own line is its bottom, read as the rule) */
        const frame = (el: Element | null, sides = ['Top', 'Right', 'Bottom', 'Left']) => {
          if (!el) return null;
          const s = getComputedStyle(el);
          return sides
            .map((side) => {
              const w = s.getPropertyValue(`border-${side.toLowerCase()}-width`);
              const c = s.getPropertyValue(`border-${side.toLowerCase()}-color`);
              return parseFloat(w) > 0 && !/rgba\([^)]*,\s*0\)|transparent/.test(c) ? side : '';
            })
            .filter(Boolean);
        };
        const button = (control: string) => {
          const el = document.querySelector(`[data-control="${control}"]`);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { h: Math.round(r.height), right: r.right, framed: frame(el) };
        };
        const thumb = row?.querySelector('.ts-row-thumb')?.getBoundingClientRect();
        /* the title's room: the label beside the thumbnail, whatever the title's length */
        const titleText = row?.querySelector('.ts-row-label')?.getBoundingClientRect();
        return {
          tag: row?.tagName ?? null,
          inRows: Boolean(row?.closest('table.ts-rows')),
          cards: document.querySelectorAll('.ts-trash-page .ts-hm-card').length,
          rails: Boolean(document.querySelector('.ts-trash-page .ts-rails')),
          rowFrame: frame(row, ['Top', 'Right', 'Left']),
          rule:
            row === null
              ? null
              : `${Math.max(
                  parseFloat(getComputedStyle(row).borderBottomWidth),
                  parseFloat(getComputedStyle(row.querySelector('td') ?? row).borderBottomWidth),
                )}px`,
          thumb: thumb ? [Math.round(thumb.width), Math.round(thumb.height)] : null,
          titleWidth: titleText ? Math.round(titleText.width) : null,
          restore: button(`trash.restore.${id}`),
          remove: button(`trash.delete.${id}`),
          back: button('trash.back'),
          empty: button('trash.empty'),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      }, deck);
      readings.push(`${width}: ${JSON.stringify(facts)}`);
      expect(facts.inRows, `the deck is a ruled row of the rows table at ${width}`).toBe(true);
      expect(facts.cards, 'no boxed card').toBe(0);
      expect(facts.rails, "the page stands on /decks' rails").toBe(true);
      expect(facts.tag, 'a table row').toBe('TR');
      expect(facts.rule, 'the row owns its 1 px rule').toBe('1px');
      expect(facts.rowFrame, 'the row draws no frame').toEqual([]);
      expect(facts.thumb, 'the 64 by 36 framed thumbnail').toEqual([64, 36]);
      for (const [name, b] of [
        ['Restore', facts.restore],
        ['Delete forever', facts.remove],
        ['Recent presentations', facts.back],
        ['Empty trash', facts.empty],
      ] as const) {
        expect(b, `${name} is drawn`).not.toBeNull();
        expect(b!.framed, `${name} is a text button without a frame at ${width}`).toEqual([]);
        expect(b!.right, `${name} is inside the viewport at ${width}`).toBeLessThanOrEqual(width);
      }
      expect(facts.restore!.h, 'Restore is 32 px').toBe(32);
      expect(facts.remove!.h, 'Delete forever is 32 px').toBe(32);
      expect(facts.titleWidth ?? 0, 'the title keeps room to read').toBeGreaterThanOrEqual(96);
      expect(facts.overflow, 'nothing crosses the viewport').toBeLessThanOrEqual(0);
    }
    test.info().annotations.push({ type: 'trash rows', description: readings.join(' | ') });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  return declared;
}
