import { expect, test } from '@playwright/test';
import type { BrowserContext, Page, Route } from '@playwright/test';

import {
  Scratch,
  addSlide,
  clickCard,
  coverage,
  ctl,
  headingRun,
  menuPath,
  newDeck,
  openEditor,
  ownerContext,
  settled,
  slideJson,
  slideOrder,
  teardownAll,
  title,
  typeInto,
} from './lib';

// Slides, the spec row (docs/FOCUS.md 2.2, 6.4 `slides.clipboard.copy-paste-card`, driver
// core/slides.spec.ts): a slide copied from a filmstrip card's right click menu and pasted after
// another card, within one deck and between two decks open in two tabs of one browser. The Round 1
// follow-up, lane A, adds the two Import slides rows: the example deck a fresh browser is offered
// (`slides.import.example-deck`, a second context of its own) and the tiles in view at the end of
// the example deck's long list (`slides.import.tiles-in-view-first`, after the deck's tile
// pictures were fetched once, so the server answers each from its store, and with every tile
// picture answered 1 s late by the page's route, so the scroll outruns the answers).
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/slides.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ({ context, page } = await ownerContext(browser));
});
test.afterAll(async () => {
  /* the teardown runs past a failed row and past the file's own test timeout, so no scratch deck
     is left behind (VERIFICATION.md C2-F29) */
  test.setTimeout(180_000);
  try {
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

async function copyCard(p: Page, slideId: string): Promise<void> {
  await p.locator(`[data-control="filmstrip.slide.${slideId}"]`).click({ button: 'right' });
  await p.locator('.ts-context-menu [data-control="menu.edit.copy"]').first().click();
  await p.waitForTimeout(300);
}
async function pasteAfterCard(p: Page, slideId: string): Promise<void> {
  await p.locator(`[data-control="filmstrip.slide.${slideId}"]`).click({ button: 'right' });
  const row = p.locator('.ts-context-menu [data-control="menu.edit.paste"]').first();
  await row.waitFor({ timeout: 6000 });
  /* a disabled Paste row is the row's failure, read at once rather than as a click that waits
     for the test's timeout: in a tab that has not copied anything the menu predicate reads the
     page's own clipboard payload alone and disables Paste while the system clipboard holds the
     other tab's envelope (b4.md Fix round FR2) */
  await expect(row, 'the Paste row is enabled').not.toHaveAttribute('aria-disabled', 'true', {
    timeout: 3000,
  });
  await row.click();
  await p.waitForTimeout(300);
}

test(title('slides.clipboard.copy-paste-card'), async () => {
  test.setTimeout(240_000);
  const a = await newDeck(page, scratch, 'Copy paste source');
  const first = await slideOrder(page);
  const source = await addSlide(page);
  const run = await headingRun(page);
  await typeInto(page, run, 'Travelling slide');
  await settled(page);
  /* within the deck: right click the source card > Copy, right click the first card > Paste */
  await copyCard(page, source);
  await pasteAfterCard(page, first[0]!);
  await expect
    .poll(async () => (await slideOrder(page)).length, { timeout: 15_000 })
    .toBe(first.length + 2);
  const within = await slideOrder(page);
  const pasted = within.find((id) => !first.includes(id) && id !== source)!;
  expect(within.indexOf(pasted), 'the pasted slide lands after the card it was pasted on').toBe(
    within.indexOf(first[0]!) + 1,
  );
  expect(JSON.stringify(await slideJson(page, pasted))).toContain('Travelling slide');
  await settled(page);
  /* between two decks in two tabs: copy in deck A, paste in deck B */
  const pageB = await context.newPage();
  const b = await newDeck(pageB, scratch, 'Copy paste target');
  const beforeB = await slideOrder(pageB);
  await page.bringToFront();
  await openEditor(page, a);
  await clickCard(page, source);
  await copyCard(page, source);
  await pageB.bringToFront();
  await pasteAfterCard(pageB, beforeB[0]!);
  await expect
    .poll(async () => (await slideOrder(pageB)).length, { timeout: 15_000 })
    .toBe(beforeB.length + 1);
  const afterB = await slideOrder(pageB);
  const landed = afterB.find((id) => !beforeB.includes(id))!;
  expect(afterB.indexOf(landed)).toBe(afterB.indexOf(beforeB[0]!) + 1);
  expect(JSON.stringify(await slideJson(pageB, landed))).toContain('Travelling slide');
  await settled(pageB);
  await pageB.close();
  void b;
});

/** What the open Import slides dialog lists: the deck rows, the sentences and whether it is busy. */
async function importListing(p: Page) {
  return p.evaluate(() => {
    const dialog = document.querySelector('[data-control="dialog.importSlides"]');
    if (dialog === null) return { open: false, busy: false, rows: [], metas: [], sentences: [] };
    const buttons = [...dialog.querySelectorAll('[data-control^="dialog.importSlides.deck."]')];
    return {
      open: true,
      busy: dialog.querySelector('[aria-busy="true"]') !== null,
      rows: buttons.map((el) =>
        (el.getAttribute('data-control') ?? '').replace('dialog.importSlides.deck.', ''),
      ),
      metas: buttons.map((el) => el.querySelector('.ts-dialog-row-meta')?.textContent ?? ''),
      sentences: [...dialog.querySelectorAll('.ts-dialog-empty')].map(
        (el) => el.textContent?.trim() ?? '',
      ),
    };
  });
}

/** File > Import slides, waited until its listing has landed. */
async function openImportSlides(p: Page) {
  await menuPath(p, 'file', 'file.importSlides');
  await ctl(p, 'dialog.importSlides').waitFor({ timeout: 8000 });
  await expect
    .poll(async () => (await importListing(p)).busy, { timeout: 30_000 })
    .toBe(false);
  return importListing(p);
}

/** The tile buttons of step 2. */
const TILES = '[data-control^="dialog.importSlides.slide."]';
/** The example deck's tile pictures as the dialog asks for them, and how late the row answers them. */
const TILE_PICTURE = /\/api\/render\/[^?]+\?deck=gt-brand&theme=dark&w=320/;
const LATE_MS = 1000;

test(title('slides.import.example-deck'), async ({ browser }) => {
  test.setTimeout(240_000);
  /* a fresh browser: a context of its own, whose one deck is the one it imports into */
  const fresh = await ownerContext(browser);
  const own = new Scratch();
  try {
    await newDeck(fresh.page, own, 'Import target');
    /* File > Open lists this browser's decks: the example deck is not one of them */
    await menuPath(fresh.page, 'file', 'file.open');
    await ctl(fresh.page, 'dialog.open').waitFor({ timeout: 8000 });
    await expect
      .poll(
        () =>
          fresh.page.evaluate(
            () =>
              document.querySelector('[data-control="dialog.open"] [aria-busy="true"]') === null,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    expect(await ctl(fresh.page, 'dialog.open.deck.gt-brand').count()).toBe(0);
    await fresh.page.keyboard.press('Escape');
    await ctl(fresh.page, 'dialog.open').waitFor({ state: 'detached', timeout: 4000 });
    /* File > Import slides offers the example deck under a sentence true of this browser's decks */
    const listed = await openImportSlides(fresh.page);
    expect(listed.rows, 'the example deck is the one presentation offered').toEqual(['gt-brand']);
    expect(listed.metas[0]).toMatch(/^Example · \d+ slides$/);
    expect(listed.sentences).toEqual(['You have no other presentations yet']);
    const before = await slideOrder(fresh.page);
    await ctl(fresh.page, 'dialog.importSlides.deck.gt-brand').click();
    const tiles = fresh.page.locator(TILES);
    await tiles.first().waitFor({ timeout: 30_000 });
    expect(
      await fresh.page.locator(`${TILES}[aria-selected="true"]`).count(),
      'no tile is picked when the list opens',
    ).toBe(0);
    await tiles.nth(0).click();
    await tiles.nth(1).click();
    await expect(ctl(fresh.page, 'dialog.importSlides.ok')).toHaveText('Import 2 slides');
    await ctl(fresh.page, 'dialog.importSlides.ok').click();
    await expect
      .poll(async () => (await slideOrder(fresh.page)).length, { timeout: 30_000 })
      .toBe(before.length + 2);
    const after = await slideOrder(fresh.page);
    const landed = after.filter((id) => !before.includes(id));
    expect(landed).toHaveLength(2);
    expect(after.indexOf(landed[0]!), 'the slides land after the current one').toBe(
      after.indexOf(before[0]!) + 1,
    );
    await settled(fresh.page);
  } finally {
    test.setTimeout(240_000);
    try {
      await teardownAll(fresh.page, own);
    } finally {
      await fresh.context.close();
    }
  }
});

test(title('slides.import.tiles-in-view-first'), async () => {
  test.setTimeout(300_000);
  await newDeck(page, scratch, 'Import tiles target');
  const listed = await openImportSlides(page);
  expect(listed.rows, 'the example deck is offered').toContain('gt-brand');
  await ctl(page, 'dialog.importSlides.deck.gt-brand').click();
  await page.locator(TILES).first().waitFor({ timeout: 30_000 });
  /* a warm server: every tile picture of the example deck fetched once outside the page's cache */
  const pictures = await page.evaluate(
    (sel) => [...document.querySelectorAll(`${sel} img`)].length,
    TILES,
  );
  const slideIds = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].map((el) =>
        (el.getAttribute('data-control') ?? '').replace('dialog.importSlides.slide.', ''),
      ),
    TILES,
  );
  expect(pictures).toBe(slideIds.length);
  expect(slideIds.length, 'a long list').toBeGreaterThan(40);
  let next = 0;
  const warm = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= slideIds.length) return;
      await page.request
        .get(`/api/render/${encodeURIComponent(slideIds[i]!)}?deck=gt-brand&theme=dark&w=320`, {
          timeout: 120_000,
        })
        .catch(() => undefined);
    }
  };
  await Promise.all([warm(), warm(), warm(), warm()]);
  /* every tile picture of the page answered 1 s late, so the server is slower than the scroll as
     production's renders were (1.8 to 11.2 s each, verify-r1.md finding 6); the list again from
     nothing: Back, the deck again */
  const late = async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, LATE_MS));
    await route.continue().catch(() => undefined);
  };
  await page.route(TILE_PICTURE, late);
  await ctl(page, 'dialog.importSlides.back').click();
  await ctl(page, 'dialog.importSlides.deck.gt-brand').click();
  const list = page.locator('.ts-dialog-slides').first();
  await list.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  /* the tile picture requests from here on: which tile, and whether it is still out */
  const out = new Map<object, { slide: string; done: boolean; ended: boolean }>();
  const isTile = (url: string) => TILE_PICTURE.test(url);
  const onRequest = (r: { url(): string }) => {
    if (isTile(r.url()))
      out.set(r, {
        slide: decodeURIComponent(new URL(r.url()).pathname.split('/').pop()!),
        done: false,
        ended: false,
      });
  };
  const onDone = (r: object) => {
    const e = out.get(r);
    if (e) e.done = true;
  };
  /* a request the page ended: a tile that left dropped its src (net::ERR_ABORTED) */
  const onFailed = (r: { failure(): { errorText: string } | null }) => {
    const e = out.get(r);
    if (e) {
      e.done = true;
      e.ended = /ERR_ABORTED/.test(r.failure()?.errorText ?? '');
    }
  };
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onFailed);
  try {
    /* the wheel over the list, to its end over 8 s */
    const box = (await list.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const height = await list.evaluate((el) => el.scrollHeight - el.clientHeight);
    for (let i = 0; i < 40; i += 1) {
      await page.mouse.wheel(0, Math.ceil(height / 40) + 4);
      await page.waitForTimeout(200);
    }
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const scrolled = Date.now();
    /* the tiles in the list's visible area, and the ones within the 200 px around it whose
       pictures the dialog asks for ahead (ImportSlides.tsx TILE_NEAR_MARGIN) */
    const inView = () =>
      list.evaluate((el) => {
        const lr = el.getBoundingClientRect();
        const tiles = [...el.querySelectorAll('[data-control^="dialog.importSlides.slide."]')];
        const within = (b: Element, margin: number) => {
          const r = b.getBoundingClientRect();
          return r.bottom > lr.top + 1 - margin && r.top < lr.bottom - 1 + margin;
        };
        const idOf = (b: Element) =>
          (b.getAttribute('data-control') ?? '').replace('dialog.importSlides.slide.', '');
        const seen = tiles.filter((b) => within(b, 0));
        const drawn = seen.filter((b) => {
          const img = b.querySelector('img');
          return img !== null && img.getAttribute('src') !== null && img.complete && img.naturalWidth > 0;
        });
        return {
          ids: seen.map(idOf),
          near: tiles.filter((b) => within(b, 200)).map(idOf),
          drawn: drawn.length,
        };
      });
    let view = await inView();
    while (Date.now() - scrolled < 3000 && view.drawn < view.ids.length) {
      await page.waitForTimeout(100);
      view = await inView();
    }
    const ms = Date.now() - scrolled;
    const behind = [...out.values()].filter((e) => !e.done && !view.near.includes(e.slide));
    const ended = [...out.values()].filter((e) => e.ended).length;
    test.info().annotations.push({
      type: 'reading',
      description: `${view.drawn} of ${view.ids.length} tiles in view drawn ${ms} ms after the scroll; ${out.size} tile requests, ${ended} ended by a leave`,
    });
    expect(view.ids.length, 'tiles in view at the end').toBeGreaterThan(0);
    expect(
      view.drawn,
      `the ${view.ids.length} tiles in view at the end drew ${view.drawn} within 3 s (${ms} ms)`,
    ).toBe(view.ids.length);
    expect(
      behind.map((e) => e.slide),
      'no tile the scroll passed and left 200 px behind keeps a picture request out',
    ).toEqual([]);
    expect(ended, 'the tiles the scroll left ended their picture requests').toBeGreaterThan(0);
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onDone);
    page.off('requestfailed', onFailed);
    await page.unroute(TILE_PICTURE, late);
    await page.keyboard.press('Escape');
  }
});

coverage(import.meta.filename, [
  'slides.clipboard.copy-paste-card',
  'slides.import.example-deck',
  'slides.import.tiles-in-view-first',
]);
