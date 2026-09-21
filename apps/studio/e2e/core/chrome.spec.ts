import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  coverage,
  ctl,
  extraHTTPHeaders,
  menuPath,
  newDeck,
  openEditor,
  placeBlock,
  selectBlock,
  settled,
  state,
  teardownAll,
  title,
} from './lib';

// The chrome at two viewports, the spec rows (docs/PRODUCT.md 3.3, 3.4, 8.1 `slides.layout.
// plate-four-columns`, `share.dialog.more-row` and `chrome.toolbar.fold-any-width` with the driver
// core/chrome.spec.ts): the Apply layout plate at 1280 by 800, the Share dialog's height at 900
// and its scroll at 800, and the toolbar tail folding into More at both widths. Two contexts, one
// per viewport, each with its own deck created from /new and torn down through the product; the
// walk probe keeps its one 1440 by 900 page, so the viewport rows live here.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/chrome.spec.ts

type Person = { context: BrowserContext; page: Page; scratch: Scratch; deck: string };
const people: Person[] = [];

/** A context at a viewport with its own deck (a setup, never a driven step). */
async function personAt(browser: Browser, width: number, height: number): Promise<Person> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const scratch = new Scratch();
  const deck = await newDeck(page, scratch, `Chrome at ${width}`);
  const person = { context, page, scratch, deck };
  people.push(person);
  return person;
}
let wide: Person;
let laptop: Person;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  wide = await personAt(browser, 1440, 900);
  laptop = await personAt(browser, 1280, 800);
});
test.afterAll(async () => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  for (const person of people) {
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
  expect(failures, 'every deck of this file is torn down').toEqual([]);
});

/** The layout plate's facts: the tiles' columns, whether it scrolls, and the GT group's state. */
async function plateFacts(page: Page) {
  return page.evaluate(() => {
    const plate = document.querySelector('[data-control="layout.apply.plate"]');
    if (!plate) return null;
    const tiles = [...plate.querySelectorAll('.ts-layout-tile')].filter(
      (el) => el.getClientRects().length > 0,
    );
    const groups = [...plate.querySelectorAll('.ts-layout-tiles')];
    const google = groups[0] ? [...groups[0].querySelectorAll('.ts-layout-tile')] : [];
    const columns = new Set(google.map((el) => Math.round(el.getBoundingClientRect().x))).size;
    const gt = groups[1] ? [...groups[1].querySelectorAll('.ts-layout-tile')] : [];
    const gtShown = gt.filter((el) => el.getClientRects().length > 0).length;
    const disclosure = plate.querySelector(
      'details, [aria-expanded], [data-control="layout.apply.gt"], .ts-layout-disclosure',
    );
    const scroller = [plate, ...plate.querySelectorAll('*')].find(
      (el) =>
        el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY),
    );
    const r = plate.getBoundingClientRect();
    return {
      tiles: tiles.length,
      google: google.length,
      columns,
      gtShown,
      disclosure: Boolean(disclosure),
      scrolls: Boolean(scroller),
      size: `${Math.round(r.width)} by ${Math.round(r.height)}`,
      viewport: `${window.innerWidth} by ${window.innerHeight}`,
    };
  });
}

test(title('slides.layout.plate-four-columns'), async () => {
  test.setTimeout(120_000);
  const { page, deck } = laptop;
  await openEditor(page, deck);
  await ctl(page, 'toolbar.layout').click();
  await ctl(page, 'layout.apply.plate').waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  const facts = await plateFacts(page);
  await page.keyboard.press('Escape');
  expect(facts, 'the layout plate opened').not.toBeNull();
  test.info().annotations.push({ type: 'plate', description: JSON.stringify(facts) });
  expect(facts!.columns, `the Google tiles stand in four columns at ${facts!.viewport}`).toBe(4);
  expect(facts!.google, "Google's eleven layouts").toBeGreaterThanOrEqual(11);
  expect(facts!.scrolls, `the plate (${facts!.size}) does not scroll at 800`).toBe(false);
  expect(facts!.disclosure && facts!.gtShown === 0, 'the GT layouts are a collapsed group').toBe(
    true,
  );
});

/** The Share dialog's geometry and what its first stage shows. */
async function shareFacts(page: Page) {
  await ctl(page, 'share.open').click();
  /* the first Share on a fresh browser asks for a display name once (docs/PRODUCT.md section 2 rank 4) */
  const skip = ctl(page, 'dialog.namePrompt.skip');
  if (
    await skip
      .waitFor({ timeout: 1500 })
      .then(() => true)
      .catch(() => false)
  )
    await skip.click({ timeout: 2000 }).catch(() => undefined);
  await ctl(page, 'dialog.share').waitFor({ timeout: 10_000 });
  await expect(ctl(page, 'dialog.share.loading')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(400);
  const facts = await page.evaluate(() => {
    const dialog = document.querySelector('[data-control="dialog.share"]');
    const card = dialog?.closest('[role="dialog"]') ?? dialog;
    if (!card) return null;
    const visible = (c: string) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return Boolean(el && el.getClientRects().length > 0);
    };
    const scroller = [card, ...card.querySelectorAll('*')].find(
      (el) =>
        el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY),
    );
    return {
      height: Math.round(card.getBoundingClientRect().height),
      viewport: window.innerHeight,
      more: visible('dialog.share.more'),
      emails: visible('dialog.share.emails'),
      requests: visible('dialog.share.requests'),
      settings: visible('dialog.share.settings'),
      scrolls: Boolean(scroller),
    };
  });
  return facts;
}

test(title('share.dialog.more-row'), async () => {
  test.setTimeout(120_000);
  await openEditor(wide.page, wide.deck);
  const at900 = await shareFacts(wide.page);
  expect(at900, 'the Share dialog opened at 900').not.toBeNull();
  test.info().annotations.push({ type: 'share at 900', description: JSON.stringify(at900) });
  expect(at900!.more, 'a More row is drawn').toBe(true);
  expect(
    [at900!.emails, at900!.requests, at900!.settings],
    'Add people, the requests band and Settings sit behind More',
  ).toEqual([false, false, false]);
  await ctl(wide.page, 'dialog.share.more').click();
  await wide.page.waitForTimeout(300);
  const opened = await wide.page.evaluate(() =>
    ['dialog.share.emails', 'dialog.share.settings'].map((c) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return Boolean(el && el.getClientRects().length > 0);
    }),
  );
  expect(opened.some(Boolean), 'More opens the rows behind it').toBe(true);
  await wide.page.keyboard.press('Escape');
  await expect(ctl(wide.page, 'dialog.share')).toHaveCount(0, { timeout: 5000 });
  expect(
    at900!.height,
    `the dialog is under 520 px tall at 900 (${at900!.height} px)`,
  ).toBeLessThan(520);
  await openEditor(laptop.page, laptop.deck);
  const at800 = await shareFacts(laptop.page);
  await laptop.page.keyboard.press('Escape');
  await expect(ctl(laptop.page, 'dialog.share')).toHaveCount(0, { timeout: 5000 });
  test.info().annotations.push({ type: 'share at 800', description: JSON.stringify(at800) });
  expect(at800!.scrolls, `the dialog does not scroll at 800 (${at800!.height} px)`).toBe(false);
});

/** The tail's controls: inside the bar, inside More, or neither; and the three that stay. */
async function tailFacts(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('.ts-toolbar');
    const barRect = bar?.getBoundingClientRect();
    const tail = document.querySelector('[data-control="toolbar.tail"]');
    const controls = [...(tail?.querySelectorAll('[data-control^="toolbar."]') ?? [])]
      .filter(
        (el) => el.getClientRects().length > 0 && !el.closest('[data-control="toolbar.more"]'),
      )
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-control') ?? '',
          inside: Boolean(barRect && r.left >= barRect.left - 1 && r.right <= barRect.right + 1),
        };
      });
    const visible = (c: string) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return Boolean(el && el.getClientRects().length > 0);
    };
    const first = tail?.querySelector('[data-control^="toolbar."]');
    const firstCs = first ? getComputedStyle(first) : null;
    return {
      viewport: window.innerWidth,
      controls,
      outside: controls.filter((c) => !c.inside).map((c) => c.id),
      more: visible('toolbar.more'),
      formatOptions: visible('toolbar.formatOptions'),
      pointer: visible('toolbar.pointer'),
      hideMenus: visible('toolbar.hideMenus'),
      first: first
        ? {
            id: first.getAttribute('data-control'),
            text: first.textContent?.trim().slice(0, 30) ?? '',
            disabled:
              first.getAttribute('aria-disabled') === 'true' || first.hasAttribute('disabled'),
            tag: first.tagName.toLowerCase(),
            chevron: Boolean(first.querySelector('svg, .ts-tb-chevron')),
            color: firstCs?.color ?? null,
          }
        : null,
    };
  });
}

async function foldAt(person: Person): Promise<{
  table: Awaited<ReturnType<typeof tailFacts>>;
  text: Awaited<ReturnType<typeof tailFacts>>;
}> {
  const { page, deck } = person;
  await openEditor(page, deck);
  const slideId = (await state(page)).slideId;
  const objects = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-block]')].map((el) =>
      el.getAttribute('data-block'),
    ),
  );
  if (!objects.includes('fold-table'))
    await placeBlock(page, slideId, {
      id: 'fold-table',
      type: 'table',
      columns: [{}, {}, {}],
      rows: [
        { cells: ['', '', ''], header: true },
        { cells: ['', '', ''] },
        { cells: ['', '', ''] },
      ],
      pos: { x: 120, y: 120, w: 720, h: 240 },
    });
  if (!objects.includes('fold-text'))
    await placeBlock(page, slideId, {
      id: 'fold-text',
      type: 'text',
      text: 'The tail with text selected',
      pos: { x: 120, y: 480, w: 720, h: 100 },
    });
  await settled(page);
  await selectBlock(page, 'fold-table');
  await page.waitForTimeout(400);
  const table = await tailFacts(page);
  await page.keyboard.press('Escape');
  await selectBlock(page, 'fold-text');
  await page.waitForTimeout(400);
  const text = await tailFacts(page);
  await page.keyboard.press('Escape');
  return { table, text };
}

test(title('chrome.toolbar.fold-any-width'), async () => {
  test.setTimeout(180_000);
  const at1440 = await foldAt(wide);
  const at1280 = await foldAt(laptop);
  for (const [label, facts] of [
    ['1440 table', at1440.table],
    ['1280 table', at1280.table],
  ] as const) {
    test.info().annotations.push({
      type: label,
      description: `${facts.controls.length} tail controls, outside the bar ${facts.outside.join(', ') || 'none'}, More ${facts.more}, Format options ${facts.formatOptions}, pointer ${facts.pointer}, Hide the menus ${facts.hideMenus}`,
    });
    expect(facts.outside, `${label}: every tail control is inside the bar or in More`).toEqual([]);
    expect(
      [facts.formatOptions, facts.pointer, facts.hideMenus],
      `${label}: Format options, the pointer and Hide the menus are visible`,
    ).toEqual([true, true, true]);
  }
  for (const [label, facts] of [
    ['1440 text', at1440.text],
    ['1280 text', at1280.text],
  ] as const) {
    test.info().annotations.push({ type: label, description: JSON.stringify(facts.first) });
    expect(facts.first, `${label}: the text tail has a first control`).not.toBeNull();
    expect(facts.first!.id, `${label}: the first control is the Font control`).toBe('toolbar.font');
    /* the dropdown with `fonts` present, or the read only family with `fonts` parked (3.4): a live
       button with a chevron, or a value reading Inter with no chevron; a disabled control with the
       old tooltip is neither */
    const dropdown = !facts.first!.disabled && facts.first!.chevron;
    const readOnly =
      /Inter/.test(facts.first!.text) && !facts.first!.chevron && !facts.first!.disabled;
    expect(
      dropdown || readOnly,
      `${label}: the Font dropdown or the read only family (${JSON.stringify(facts.first)})`,
    ).toBe(true);
  }
  void menuPath;
});

coverage(import.meta.filename, [
  'slides.layout.plate-four-columns',
  'share.dialog.more-row',
  'chrome.toolbar.fold-any-width',
]);
