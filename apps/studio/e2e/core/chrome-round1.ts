import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  ctl,
  extraHTTPHeaders,
  headingRun,
  invoke,
  newDeck,
  openEditor,
  settled,
  teardownAll,
  title,
  typeInto,
  waitEditor,
  waitRevision,
} from './lib';

// Lane B3b's rows of Round 1 in core/chrome.spec.ts (docs/NEXT.md 4.1.3 items 13 to 18, 4.1.5):
// the title row at 390 px, the deck name while the name plate shows, one status phrase. The spec
// file calls `chromeRound1()` once and spreads its ids into its coverage list, so the rows live in
// one module of the lane and the shared spec file carries three lines of it. Each test opens its
// own context with its own deck made from /new and torn down through the product, as
// core/chrome.spec.ts's own tests do.

type Person = { context: BrowserContext; page: Page; scratch: Scratch };
const people: Person[] = [];

async function contextAt(browser: Browser, width: number, height: number): Promise<Person> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const person = { context, page, scratch: new Scratch() };
  people.push(person);
  return person;
}

type Box = { x: number; right: number; w: number; y: number; bottom: number };

/** The title row's boxes at the viewport the page has: the row, the name and the right keys. */
async function titleRowFacts(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el || el.getClientRects().length === 0) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return null;
      return {
        x: Math.round(r.x * 10) / 10,
        right: Math.round(r.right * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        y: Math.round(r.y * 10) / 10,
        bottom: Math.round(r.bottom * 10) / 10,
      };
    };
    const row = document.querySelector<HTMLElement>('[data-control="title.row"]');
    const name = document.querySelector<HTMLElement>('[data-control="deck.name"]');
    return {
      viewport: window.innerWidth,
      row: box('[data-control="title.row"]'),
      rowScroll: row ? row.scrollWidth : null,
      rowClient: row ? row.clientWidth : null,
      name: box('[data-control="deck.name"]'),
      nameText: name?.textContent ?? null,
      nameTruncated: name ? name.scrollWidth > name.clientWidth + 1 : null,
      slideshow: box('[data-control="present.split"]'),
      share: box('[data-control="share.open"]'),
      more: box('[data-control="title.more"]'),
      presence: box('[data-control="title.presence"]'),
      plate: box('.ts-title-name-plate'),
    };
  });
}

const inside = (b: Box | null, width: number) => b !== null && b.x >= 0 && b.right <= width + 0.5;

/** The first write through the product on /new: the title typed into the heading run. */
async function firstWrite(page: Page, scratch: Scratch, text: string): Promise<string> {
  await page.goto('/new');
  await waitEditor(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  scratch.add(info.id);
  await typeInto(page, await headingRun(page), text);
  await waitRevision(page, 1, 30_000);
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  return info.id;
}

/** The phrases the title row's left group draws: the Last edit words and the save words. */
async function statusPhrases(page: Page) {
  return page.evaluate(() => {
    const drawn = (el: Element | null) => {
      if (!el || el.getClientRects().length === 0) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        cs.visibility !== 'hidden' &&
        cs.display !== 'none' &&
        r.width > 8 &&
        (el.textContent ?? '').trim() !== ''
      );
    };
    const words = document.querySelector('[data-control="deck.lastEdit.words"]');
    const save = document.querySelector('[data-control="deck.saveState"] .ts-title-save-live');
    const phrases: string[] = [];
    if (drawn(words)) phrases.push((words?.textContent ?? '').trim());
    if (drawn(save)) phrases.push((save?.textContent ?? '').trim());
    return {
      phrases,
      wordsTip: words?.getAttribute('data-tip') ?? null,
      clockLabel:
        document.querySelector('[data-control="deck.lastEdit"]')?.getAttribute('aria-label') ??
        null,
      saveState:
        document.querySelector('[data-control="deck.saveState"]')?.getAttribute('data-state') ??
        null,
      saveText: (
        document.querySelector('[data-control="deck.saveState"]')?.textContent ?? ''
      ).trim(),
    };
  });
}

/** Declares the lane's chrome rows; returns their ids for the spec file's coverage list. */
export function chromeRound1(): string[] {
  test.afterAll(async () => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    for (const person of people.splice(0)) {
      try {
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

  test(title('chrome.title-row.phone'), async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 390, 844);
    const deck = await newDeck(page, scratch, 'Title row at 390');
    await openEditor(page, deck);
    await page.waitForTimeout(400);
    const facts = await titleRowFacts(page);
    test.info().annotations.push({ type: 'title row at 390', description: JSON.stringify(facts) });
    expect(facts.viewport).toBe(390);
    expect(
      facts.rowScroll !== null && facts.rowClient !== null && facts.rowScroll <= facts.rowClient,
      `the row's content fits its box (${facts.rowScroll} in ${facts.rowClient})`,
    ).toBe(true);
    expect(inside(facts.row, 390), 'the row is inside the viewport').toBe(true);
    expect(
      facts.name?.w ?? 0,
      `the deck name is at least 96 px wide (${facts.name?.w})`,
    ).toBeGreaterThanOrEqual(96);
    expect(
      inside(facts.slideshow, 390),
      `Slideshow is inside the row (${JSON.stringify(facts.slideshow)})`,
    ).toBe(true);
    expect(
      inside(facts.share, 390),
      `Share is inside the row (${JSON.stringify(facts.share)})`,
    ).toBe(true);
    expect(inside(facts.more, 390), 'the More key is drawn inside the row').toBe(true);
    expect(facts.presence, 'the presence slot folds into More').toBeNull();
    /* the folded controls are one tap away: More lists Show all comments and Collaborators */
    await ctl(page, 'title.more').click();
    const menu = page.locator('#ts-menu-title-more');
    await menu.waitFor({ timeout: 5000 });
    const rows = await menu
      .locator('[data-menu-item]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-menu-item')));
    test.info().annotations.push({ type: 'More rows', description: rows.join(', ') });
    await page.keyboard.press('Escape');
    expect(rows).toContain('title.comments');
    expect(rows).toContain('title.presence');
  });

  test(title('chrome.title-row.name-after-first-write'), async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    /* the first write on /new makes the deck; the next write on the deck is the first one its
       editor counts, and the route opens the name prompt on it (SPEC-3 0.18) */
    await firstWrite(page, scratch, 'Name plate deck');
    await settled(page);
    await page.keyboard.press('Escape');
    const before = (await invoke<{ revision: number }>(page, 'deck.info')).revision;
    await page.keyboard.press('Control+m');
    const wroteAt = Date.now();
    await waitRevision(page, before + 1, 10_000);
    type Facts = Awaited<ReturnType<typeof titleRowFacts>>;
    let seen: (Facts & { ms: number }) | null = null;
    let last: Facts | null = null;
    while (Date.now() - wroteAt < 5000) {
      last = await titleRowFacts(page);
      if (last.plate !== null) {
        seen = { ...last, ms: Date.now() - wroteAt };
        break;
      }
      await page.waitForTimeout(100);
    }
    test.info().annotations.push({
      type: 'name while the plate shows',
      description: JSON.stringify(seen ?? { plate: 'not shown within 5 s', last }),
    });
    expect(seen, 'the name plate shows within 5 s of the write').not.toBeNull();
    const facts = seen!;
    expect(facts.nameTruncated, `the deck name "${facts.nameText}" keeps its full width`).toBe(
      false,
    );
    expect(facts.name?.w ?? 0, 'the deck name is at least 96 px wide').toBeGreaterThanOrEqual(96);
    expect(
      facts.plate!.y >= (facts.row?.bottom ?? 44) - 0.5,
      `the plate sits under the row (plate top ${facts.plate!.y}, row bottom ${facts.row?.bottom})`,
    ).toBe(true);
    expect(
      facts.name!.right <= facts.plate!.x || facts.name!.bottom <= facts.plate!.y,
      'the plate does not cover the name',
    ).toBe(true);
    await ctl(page, 'dialog.namePrompt.close')
      .click({ timeout: 3000 })
      .catch(() => undefined);
  });

  test(title('chrome.title-row.one-status'), async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    await page.goto('/new');
    await waitEditor(page);
    await page.waitForTimeout(600);
    const draft = await statusPhrases(page);
    test.info().annotations.push({ type: 'fresh draft', description: JSON.stringify(draft) });
    expect(
      draft.phrases.filter((p) => /Last edit/.test(p)),
      'a draft nobody edited shows no Last edit words',
    ).toEqual([]);
    expect(draft.clockLabel, 'the clock names no edit on the draft').toBe('Last edit');
    const info = await invoke<{ id: string }>(page, 'deck.info');
    scratch.add(info.id);
    await typeInto(page, await headingRun(page), 'One status phrase');
    await waitRevision(page, 1, 30_000);
    await page.waitForURL(/\/edit\//, { timeout: 30_000 });
    await settled(page);
    await ctl(page, 'dialog.namePrompt.close')
      .click({ timeout: 1500 })
      .catch(() => undefined);
    await page.waitForTimeout(800);
    const after = await statusPhrases(page);
    test.info().annotations.push({ type: 'after the write', description: JSON.stringify(after) });
    expect(after.saveState, 'the write is saved').toBe('saved');
    expect(after.phrases.length, `one status phrase (${after.phrases.join(' | ')})`).toBe(1);
    expect(after.phrases[0] ?? '', 'the phrase is the Last edit words').toMatch(/^Last edit /);
    expect(after.phrases[0] ?? '', 'the phrase names no author').not.toMatch(/ by /);
    expect(after.wordsTip ?? '', 'the tooltip names the author').toMatch(/^Last edit .+ by .+/);
    expect(after.clockLabel ?? '', 'the clock’s name names the author').toMatch(/ by /);
  });

  return [
    'chrome.title-row.phone',
    'chrome.title-row.name-after-first-write',
    'chrome.title-row.one-status',
  ];
}
