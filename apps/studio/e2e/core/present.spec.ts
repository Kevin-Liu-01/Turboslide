import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  clickCard,
  coverage,
  ctl,
  editing,
  headingRun,
  invoke,
  menuPath,
  newDeck,
  objectsOf,
  openEditor,
  ownerContext,
  placeBlock,
  runsOfBlock,
  selectBlock,
  settled,
  skipCurrent,
  slideJson,
  slideOrder,
  state,
  teardownAll,
  title,
  typeInto,
  typeNote,
} from './lib';

// Present and comments, the spec rows (docs/FOCUS.md 2.7, 6.4 `present.*`, `comments.*` and
// `text.link.present-click` with the driver core/present.spec.ts): the show from the title row
// and Cmd+Enter, every key of Google's table driven, the counter, the laser, Escape, Presenter
// view as a second window, Start from beginning, the blank slides, the skipped slide left out of
// the show, the card's Present and the present link; the comment card on the title placeholder,
// the slide and an object, reply, resolve, the toolbar and the menu routes; and the linked word
// clicked in the show.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/present.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';
let slides: string[] = [];
const NOTE = 'Open with the renewal date and the two new logos.';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Pipeline review: Acme, Q3 2026');
  await typeNote(page, NOTE);
  await addSlide(page);
  const run2 = await headingRun(page);
  await typeInto(page, run2, 'Second');
  await addSlide(page);
  const run3 = await headingRun(page);
  await typeInto(page, run3, 'Third');
  await addSlide(page);
  const run4 = await headingRun(page);
  await typeInto(page, run4, 'Fourth');
  await settled(page);
  slides = await slideOrder(page);
});
test.afterAll(async () => {
  /* the teardown of every deck this file made runs past a failed row and past the file's own
     test timeout, so no scratch deck is left behind (VERIFICATION.md C2-F29) */
  test.setTimeout(180_000);
  try {
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

const show = (p: Page = page) => p.locator('[data-control="present.show"]');
async function showIndex(p: Page = page): Promise<number> {
  return Number((await show(p).getAttribute('data-index')) ?? '-1');
}
async function inShow(p: Page = page): Promise<boolean> {
  return (await show(p).count()) > 0;
}
async function leaveShow(p: Page = page): Promise<void> {
  if (await inShow(p)) {
    await p.keyboard.press('Escape');
    await expect.poll(() => inShow(p), { timeout: 8000 }).toBe(false);
  }
}
/**
 * The show has opened and its full screen request has settled (the document is full screen, or
 * the browser refused within 800 ms). An Escape sent while that request is still in flight races
 * it: the show unmounts, the pending request then takes the document full screen with the show
 * gone, or the show comes back with the document out of full screen (the b4 repro
 * from-beginning-fast: 2 of 6 immediate Escapes left the show on). A person never presses Escape
 * inside that window; the rows judge the show after it has settled.
 */
async function showSettled(p: Page = page): Promise<void> {
  await expect(show(p)).toBeAttached({ timeout: 10_000 });
  await p
    .waitForFunction(() => document.fullscreenElement !== null, null, { timeout: 800 })
    .catch(() => undefined);
  await p.waitForTimeout(200);
}
async function startShow(): Promise<number> {
  const t = Date.now();
  await ctl(page, 'present.open').click();
  await expect(show()).toBeAttached({ timeout: 10_000 });
  const ms = Date.now() - t;
  await showSettled();
  return ms;
}

test(title('present.slideshow.button'), async () => {
  await openEditor(page, deck);
  await clickCard(page, slides[1]!);
  const ms = await startShow();
  expect(ms).toBeLessThan(5000);
  expect(await showIndex()).toBe(1);
  await expect(page.locator('.pt-viewer').first()).toHaveClass(/is-present/);
  await leaveShow();
});

test(title('present.slideshow.cmd-enter'), async () => {
  await openEditor(page, deck);
  await clickCard(page, slides[0]!);
  const t = Date.now();
  await page.keyboard.press('Meta+Enter');
  await expect(show()).toBeAttached({ timeout: 10_000 });
  expect(Date.now() - t).toBeLessThan(5000);
  await showSettled();
  await leaveShow();
});

test.describe('the keys of the show', () => {
  test.beforeEach(async () => {
    await openEditor(page, deck);
    await clickCard(page, slides[0]!);
    await startShow();
  });
  test.afterEach(async () => {
    await leaveShow();
  });
  test(title('present.keys.arrow-right'), async () => {
    await page.keyboard.press('ArrowRight');
    await expect(show()).toHaveAttribute('data-index', '1');
  });
  test(title('present.keys.arrow-left'), async () => {
    await page.keyboard.press('ArrowRight');
    await expect(show()).toHaveAttribute('data-index', '1');
    await page.keyboard.press('ArrowLeft');
    await expect(show()).toHaveAttribute('data-index', '0');
  });
  test(title('present.keys.space'), async () => {
    await page.keyboard.press(' ');
    await expect(show()).toHaveAttribute('data-index', '1');
  });
  test(title('present.keys.digit-enter'), async () => {
    await page.keyboard.press('3');
    await page.keyboard.press('Enter');
    await expect(show()).toHaveAttribute('data-index', '2');
  });
  test(title('present.keys.home'), async () => {
    await page.keyboard.press('End');
    await expect(show()).toHaveAttribute('data-index', String(slides.length - 1));
    await page.keyboard.press('Home');
    await expect(show()).toHaveAttribute('data-index', '0');
  });
  test(title('present.keys.end'), async () => {
    await page.keyboard.press('End');
    await expect(show()).toHaveAttribute('data-index', String(slides.length - 1));
  });
  test(title('present.click-advances'), async () => {
    const box = (await show().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(show()).toHaveAttribute('data-index', '1');
  });
  test(title('present.counter'), async () => {
    await expect(ctl(page, 'present.counter')).toContainText(`1 of ${slides.length}`);
    await page.keyboard.press('ArrowRight');
    await expect(ctl(page, 'present.counter')).toContainText(`2 of ${slides.length}`);
  });
  test(title('present.laser'), async () => {
    await page.keyboard.press('l');
    await expect(show()).toHaveAttribute('data-laser', 'true');
    await page.keyboard.press('l');
    await expect(show()).not.toHaveAttribute('data-laser', 'true');
  });
  test(title('present.escape'), async () => {
    await page.keyboard.press('ArrowRight');
    await expect(show()).toHaveAttribute('data-index', '1');
    await page.keyboard.press('Escape');
    await expect.poll(() => inShow(), { timeout: 8000 }).toBe(false);
    expect((await state(page)).slideId, 'the editor shows the slide the show left on').toBe(
      slides[1],
    );
  });
  test(title('present.keys.blank-black-white'), async () => {
    await page.keyboard.press('b');
    await expect(show()).toHaveAttribute('data-blank', 'black');
    await page.keyboard.press('ArrowRight');
    await expect(show()).not.toHaveAttribute('data-blank', 'black');
    await page.keyboard.press('w');
    await expect(show()).toHaveAttribute('data-blank', 'white');
    await page.keyboard.press('ArrowLeft');
    await expect(show()).not.toHaveAttribute('data-blank', 'white');
  });
});

test(title('present.presenter-view.arrow'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  await clickCard(page, slides[0]!);
  const t = Date.now();
  const opened = context.waitForEvent('page', { timeout: 10_000 });
  await ctl(page, 'present.arrow').click();
  await page.locator('#ts-menu-slideshow').waitFor({ timeout: 6000 });
  await ctl(page, 'menu.title.slideshow.presenterView').click();
  const presenter = await opened;
  await presenter.waitForURL(/\/present\//, { timeout: 10_000 });
  await ctl(presenter, 'presenter').waitFor({ timeout: 20_000 });
  expect(Date.now() - t).toBeLessThan(5000 + 5000);
  await expect(ctl(presenter, 'presenter.notesText')).toContainText('renewal date', {
    timeout: 10_000,
  });
  await expect(ctl(presenter, 'presenter.next')).toBeVisible();
  await expect(ctl(presenter, 'presenter.timer')).toBeVisible();
  await expect(show()).toBeAttached({ timeout: 10_000 });
  /* the two windows follow each other */
  await ctl(presenter, 'presenter.next').click();
  await expect(show()).toHaveAttribute('data-index', '1', { timeout: 8000 });
  await page.bringToFront();
  await page.keyboard.press('ArrowRight');
  await expect(ctl(presenter, 'presenter')).toHaveAttribute('data-index', '2', { timeout: 8000 });
  await presenter.close();
  await leaveShow();
});

test(title('present.presenter-view.s-key'), async () => {
  await openEditor(page, deck);
  await clickCard(page, slides[0]!);
  await startShow();
  const opened = context.waitForEvent('page', { timeout: 10_000 });
  await page.keyboard.press('s');
  const presenter = await opened;
  await presenter.waitForURL(/\/present\//, { timeout: 10_000 });
  await presenter.close();
  await leaveShow();
});

test(title('present.notes-in-presenter'), async () => {
  await openEditor(page, deck);
  await clickCard(page, slides[0]!);
  const opened = context.waitForEvent('page', { timeout: 10_000 });
  await ctl(page, 'present.arrow').click();
  await ctl(page, 'menu.title.slideshow.presenterView').click();
  const presenter = await opened;
  await ctl(presenter, 'presenter.notesText').waitFor({ timeout: 20_000 });
  await expect(ctl(presenter, 'presenter.notesText')).toContainText(NOTE);
  await presenter.close();
  await leaveShow();
});

test(title('present.slideshow.from-beginning'), async () => {
  await openEditor(page, deck);
  await clickCard(page, slides[2]!);
  let t = Date.now();
  await ctl(page, 'present.arrow').click();
  await page.locator('#ts-menu-slideshow').waitFor({ timeout: 6000 });
  await ctl(page, 'menu.title.slideshow.startFromBeginning').click();
  await expect(show()).toBeAttached({ timeout: 10_000 });
  expect(Date.now() - t).toBeLessThan(5000);
  await expect(show()).toHaveAttribute('data-index', '0');
  await showSettled();
  await leaveShow();
  await clickCard(page, slides[2]!);
  t = Date.now();
  await page.keyboard.press('Meta+Shift+Enter');
  await expect(show()).toBeAttached({ timeout: 10_000 });
  expect(Date.now() - t).toBeLessThan(5000);
  await expect(show()).toHaveAttribute('data-index', '0');
  await showSettled();
  await leaveShow();
});

test(title('present.skipped-left-out'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await clickCard(page, slides[2]!);
  await skipCurrent(page);
  await clickCard(page, slides[0]!);
  /* the skip is acknowledged (skipCurrent waits for the store's copy and All changes saved), so
     the three reads below judge the show, the card's Present tab and the present link on the
     server's document; each read is named, since the cycle 2 flip of this row (C2-F25: "4 where
     3 was expected") did not say which of the three loads counted the skipped slide */
  const skipStored = (await slideJson(page, slides[2]!))['skip'] === true;
  const revision = (await state(page)).serverRevision;
  await startShow();
  const total = slides.length - 1;
  await expect(
    show(),
    `the show started from the editor leaves the skipped slide out (skip stored ${skipStored}, server revision ${revision})`,
  ).toHaveAttribute('data-total', String(total));
  await expect(ctl(page, 'present.counter')).toContainText(`of ${total}`);
  const ids: string[] = [];
  for (let i = 0; i < total; i += 1) {
    ids.push((await show().getAttribute('data-slide-id')) ?? '');
    await page.keyboard.press('ArrowRight');
  }
  expect(ids).not.toContain(slides[2]);
  await leaveShow();
  /* the card's Present */
  await page.goto('/decks');
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  const opened = context.waitForEvent('page', { timeout: 20_000 });
  await ctl(page, `home.more.${deck}`).click();
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: /^Present$/ }).click();
  const tab = await opened;
  await tab.waitForURL(/present=1/, { timeout: 20_000 });
  await expect(
    show(tab),
    `the card's Present tab (a fresh load of the server's document) leaves the skipped slide out`,
  ).toHaveAttribute('data-total', String(total), { timeout: 20_000 });
  await tab.close();
  /* the present link */
  await page.goto(`/deck/${deck}?present=1`);
  await expect(
    show(),
    'the present link /deck/<id>?present=1 (a fresh load) leaves the skipped slide out',
  ).toHaveAttribute('data-total', String(total), { timeout: 20_000 });
  await openEditor(page, deck);
  await clickCard(page, slides[2]!);
  await menuPath(page, 'slide', 'slide.skipSlide');
  await settled(page);
});

test(title('text.link.present-click'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await clickCard(page, slides[3]!);
  const slideId = slides[3]!;
  await placeBlock(page, slideId, {
    id: 'linked',
    type: 'text',
    text: 'See the proposal online',
    pos: { x: 300, y: 500, w: 600, h: 100 },
  });
  const run = (await runsOfBlock(page, 'linked'))[0]!;
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${run}"]`).first();
  await el.dblclick();
  await page.waitForTimeout(200);
  /* select the word "proposal" by a double click on it */
  const word = await page.evaluate((r) => {
    const node = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    const walker = document.createTreeWalker(node!, NodeFilter.SHOW_TEXT);
    let text: Text | null;
    while ((text = walker.nextNode() as Text | null)) {
      const at = text.textContent?.indexOf('proposal') ?? -1;
      if (at >= 0) {
        const range = document.createRange();
        range.setStart(text, at);
        range.setEnd(text, at + 'proposal'.length);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
    }
    return null;
  }, run);
  expect(word).not.toBeNull();
  await page.mouse.dblclick(word!.x, word!.y);
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+k');
  /* the link popover's field is run.link.href (the probe's row text.link.cmd-k-enter reads the
     same id); dialog.link.url is the Insert > Link dialog's field on a block */
  const field = page
    .locator(
      '[data-control="popover.link.url"], [data-control="run.link.href"], [data-control="dialog.link.url"]',
    )
    .first();
  await field.waitFor({ timeout: 6000 });
  await field.click();
  const target = `${new URL(page.url()).origin}/home`;
  await page.keyboard.type(target, { delay: 40 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await settled(page);
  const stored = JSON.stringify(await objectsOf(page, slideId));
  expect(stored.includes('/home'), 'the link is stored on the word').toBe(true);
  await startShow();
  /* the show's slide is the stage's sheet in present mode, `.ts-stagewrap.is-present
     .pt-slide:not(.is-leaving)`; `[data-control="present.show"]` is the Slideshow overlay, a
     sibling of the stage that never holds a slide, so the anchor was looked for where it cannot
     be (b1's R32, VERIFICATION.md C2-F5: the product draws `<a href>` for the linked run in the
     show's stage and the click opened the address in a new page) */
  const linked = page
    .locator('.ts-stagewrap.is-present .pt-slide:not(.is-leaving) a[href*="/home"]')
    .first();
  await expect(linked, 'the show draws the linked word as a link element').toBeAttached({
    timeout: 10_000,
  });
  const popup = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null);
  await linked.click();
  const opened = await popup;
  if (opened) {
    await opened.waitForURL(/\/home/, { timeout: 15_000 });
    await opened.close();
  } else {
    await page.waitForURL(/\/home/, { timeout: 15_000 });
  }
  await leaveShow().catch(() => undefined);
});

// ---- comments

async function submitComment(text: string): Promise<void> {
  await ctl(page, 'comment.card').waitFor({ timeout: 8000 });
  await ctl(page, 'comment.card.new.field').click();
  await page.keyboard.type(text, { delay: 40 });
  await ctl(page, 'comment.card.new.submit').click();
}
async function threads(): Promise<{ id: string; resolved?: boolean; replies: unknown[] }[]> {
  return (await state(page)).comments?.threads ?? [];
}
async function markers(): Promise<number> {
  return ctl(page, 'comment.marker').count();
}

/**
 * The thread count once the comments have loaded after openEditor's reload: the threads load
 * beside the document, so a count read at once can miss the previous row's comment and the row
 * then counts it as its own (b6 R5: the preview run read 3 where 2 were expected). Two reads
 * 500 ms apart have to agree.
 */
async function threadCountSettled(): Promise<number> {
  /* the product's own fact first (b6's cycle 3 R3): `describe().state.comments.loaded` reads true
     once `comment.list` has answered after the reload; until the controller projects it (the
     integrator's half of R3) the field is undefined and the two agreeing reads below decide */
  await expect
    .poll(async () => (await state(page)).comments?.loaded ?? null, { timeout: 15_000 })
    .not.toBe(false);
  let last = (await threads()).length;
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(500);
    const now = (await threads()).length;
    if (now === last) return now;
    last = now;
  }
  return last;
}

test(title('comments.on-slide'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  await clickCard(page, slides[1]!);
  await page.keyboard.press('Escape');
  const before = await threadCountSettled();
  const t = Date.now();
  await page.keyboard.press('Meta+Alt+m');
  await submitComment('A slide level note for the reviewer.');
  await expect.poll(async () => (await threads()).length, { timeout: 20_000 }).toBe(before + 1);
  await expect.poll(markers, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(Date.now() - t).toBeLessThan(20_000);
  await page.keyboard.press('Escape');
});

test(title('comments.on-object'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  await clickCard(page, slides[1]!);
  await placeBlock(page, slides[1]!, {
    id: 'commented',
    type: 'text',
    text: 'Commented box',
    pos: { x: 200, y: 400, w: 400, h: 100 },
  });
  /* the box selected as an object by one click (AMENDMENTS.md A1 rule 1; lib selectBlock keeps
     the Escape fallback for a build that still opens the caret), so the card anchors on the block */
  await selectBlock(page, 'commented');
  await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText(/Text box/);
  const before = await threadCountSettled();
  await page.keyboard.press('Meta+Alt+m');
  await submitComment('This box needs the new logo.');
  await expect.poll(async () => (await threads()).length, { timeout: 20_000 }).toBe(before + 1);
  await expect.poll(markers, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
});

test(title('comments.on-title-placeholder'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  await clickCard(page, slides[0]!);
  const run = await headingRun(page);
  await page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${run}"]`).first().click();
  await page.waitForTimeout(200);
  /* one click selects the placeholder as an object (A1 rule 1); on a build that still opens the
     caret, Escape leaves it selected */
  if (await editing(page)) await page.keyboard.press('Escape');
  await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText(/Title|Heading/, {
    timeout: 5000,
  });
  const before = await threadCountSettled();
  await page.keyboard.press('Meta+Alt+m');
  await submitComment('Rename the customer here.');
  await expect.poll(async () => (await threads()).length, { timeout: 20_000 }).toBe(before + 1);
  await expect.poll(markers, { timeout: 20_000 }).toBeGreaterThan(0);
  /* a refusal sentence in the card, read only when one is drawn (a textContent() on a missing
     alert waits for it until the test's timeout, which was this row's 90 s in the fix round) */
  const alert = page
    .locator('[data-control="comment.card"] [role="alert"], .ts-dialog-error-row')
    .first();
  const refused = (await alert.count()) > 0 ? await alert.textContent() : null;
  expect(refused ?? '', 'no refusal in the card').not.toMatch(/anchor names nothing/);
  await page.keyboard.press('Escape');
});

/** The threads of the deck after a reload: the comments load beside the document, so they are polled. */
async function threadsLoaded(
  slideId: string,
): Promise<{ id: string; resolved?: boolean; replies: unknown[] }[]> {
  await expect.poll(async () => (await threads()).length, { timeout: 15_000 }).toBeGreaterThan(0);
  /* the reply and resolve rows open a thread from its marker; when the object row's comment did
     not land (it read one thread where two were expected on the preview, run 2) the slide holds a
     slide level thread alone and draws no marker after the reload, so a thread on a setup block is
     placed through the window API first (a setup write, never a driven step) */
  await page.waitForTimeout(1500);
  if ((await ctl(page, 'comment.marker').count()) === 0) {
    await placeBlock(page, slideId, {
      id: 'reply-box',
      type: 'text',
      text: 'Reply box',
      pos: { x: 200, y: 600, w: 400, h: 100 },
    });
    await invoke(page, 'comment.add', {
      anchor: { kind: 'block', slideId, blockId: 'reply-box' },
      body: 'A thread to reply to.',
    }).catch(() => undefined);
    await settled(page);
  }
  await expect(
    ctl(page, 'comment.marker'),
    'a thread on this slide draws its marker after the reload',
  ).toBeAttached({ timeout: 15_000 });
  return threads();
}

test(title('comments.reply'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  await clickCard(page, slides[1]!);
  const list = await threadsLoaded(slides[1]!);
  await ctl(page, 'comment.marker').first().click();
  await ctl(page, 'comment.card').waitFor({ timeout: 8000 });
  const thread =
    (await ctl(page, 'comment.marker').first().getAttribute('data-thread')) ?? list[0]!.id;
  const repliesBefore = (await threads()).find((x) => x.id === thread)?.replies.length ?? 0;
  const replyBox = ctl(page, 'comment.card.replyBox.field');
  if ((await replyBox.count()) === 0) await ctl(page, 'comment.card.reply').click();
  await ctl(page, 'comment.card.replyBox.field').click();
  await page.keyboard.type('Done, the logo is in.', { delay: 40 });
  await ctl(page, 'comment.card.replyBox.submit').click();
  await expect
    .poll(async () => (await threads()).find((x) => x.id === thread)?.replies.length ?? 0, {
      timeout: 20_000,
    })
    .toBe(repliesBefore + 1);
  await page.keyboard.press('Escape');
});

test(title('comments.resolve'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  await clickCard(page, slides[1]!);
  await threadsLoaded(slides[1]!);
  await ctl(page, 'comment.marker').first().click();
  await ctl(page, 'comment.card').waitFor({ timeout: 8000 });
  const thread =
    (await ctl(page, 'comment.marker').first().getAttribute('data-thread')) ??
    (await threads())[0]!.id;
  await ctl(page, 'comment.card.resolve').click();
  await expect
    .poll(async () => (await threads()).find((x) => x.id === thread)?.resolved === true, {
      timeout: 5000,
    })
    .toBe(true);
  await page.keyboard.press('Escape');
});

test(title('comments.toolbar-and-menu-routes'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await clickCard(page, slides[3]!);
  await page.keyboard.press('Escape');
  /* the count once the threads have loaded, as the `comments.on-*` rows read it (b6 R5); read
     at once it missed the earlier rows' threads and the row then counted them as its own (the
     cycle 2 rerun, C2-F25: "4 threads where 1 was expected") */
  const before = await threadCountSettled();
  await ctl(page, 'toolbar.insertComment').click();
  await submitComment('From the toolbar.');
  await expect.poll(async () => (await threads()).length, { timeout: 20_000 }).toBe(before + 1);
  await page.keyboard.press('Escape');
  await menuPath(page, 'insert', 'insert.comment');
  await submitComment('From the Insert menu.');
  await expect.poll(async () => (await threads()).length, { timeout: 20_000 }).toBe(before + 2);
  await expect.poll(markers, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Escape');
});

// ---------------------------------------------------------------------------------------------
// the product round's rows (docs/PRODUCT.md section 2 ranks 19 and 23, 3.1.1, 3.6, 4.1, 8.1): a
// slide as a link's target followed in the show, no paper block under the show's bar, the bar on
// entry and after a pointer move, the presenter's labels in sentence case, and the frame toggles
// of the kit read in the editor, the show and the presenter. B2 owns the popover and the click in
// the show, B1 the show's bar and the presenter, B5a the kit; a control not on the build is skipped
// with its id.

test(title('text.link.slide-target'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await clickCard(page, slides[0]!);
  const slideId = slides[0]!;
  await placeBlock(page, slideId, {
    id: 'slide-link',
    type: 'text',
    text: 'Jump to the pricing slide',
    pos: { x: 300, y: 640, w: 700, h: 100 },
  });
  const run = (await runsOfBlock(page, 'slide-link'))[0]!;
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${run}"]`).first();
  await el.dblclick();
  await page.waitForTimeout(200);
  const word = await page.evaluate((r) => {
    const node = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    const walker = document.createTreeWalker(node!, NodeFilter.SHOW_TEXT);
    let text: Text | null;
    while ((text = walker.nextNode() as Text | null)) {
      const at = text.textContent?.indexOf('pricing') ?? -1;
      if (at >= 0) {
        const range = document.createRange();
        range.setStart(text, at);
        range.setEnd(text, at + 'pricing'.length);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
    }
    return null;
  }, run);
  expect(word).not.toBeNull();
  await page.mouse.dblclick(word!.x, word!.y);
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+k');
  const slideSelect = page.locator('[data-control="popover.link.slide"]').first();
  const shown = await slideSelect
    .waitFor({ timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) {
    const bare = await ctl(page, 'run.link.href')
      .isVisible()
      .catch(() => false);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect(
      shown,
      `Cmd+K shows the popover's Slides in this presentation select (the bare field run.link.href ${bare ? 'opened alone' : 'did not open either'}; audit-gaps 4)`,
    ).toBe(true);
  }
  const tag = await slideSelect.evaluate((e) => e.tagName.toLowerCase());
  /* the options read "<n>. <title>" since the product round (docs/PRODUCT.md section 2 rank 19,
     InlineText.tsx slideTargets): the third slide is picked by its id, the option's value */
  if (tag === 'select')
    await slideSelect
      .selectOption({ value: slides[2]! }, { timeout: 8000 })
      .catch(() => slideSelect.selectOption({ label: 'Slide 3' }, { timeout: 8000 }));
  else {
    await slideSelect.click();
    await page
      .locator('[data-control^="popover.link.slide."], [role="option"]', { hasText: /^Slide 3$/ })
      .first()
      .click();
  }
  const apply = ctl(page, 'popover.link.apply');
  if ((await apply.count()) > 0) await apply.click();
  else await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await settled(page);
  const stored = JSON.stringify(await objectsOf(page, slideId));
  /* the product writes a slide link inline as [word](#s/<slideId>) (InlineText.tsx, the show's
     mountSlideLinkClicks); the field form stays accepted */
  expect(stored, 'the word carries a slide link').toMatch(/"slide":\s*"[^"]+"|\]\(#s\/[^)]+\)/);
  await startShow();
  const linked = page
    .locator(
      '.ts-stagewrap.is-present .pt-slide:not(.is-leaving) a, .ts-stagewrap.is-present .pt-slide:not(.is-leaving) [data-link-slide]',
    )
    .first();
  await expect(linked, 'the show draws the linked word').toBeAttached({ timeout: 10_000 });
  await linked.click();
  await expect(show(), 'the show jumps to slide 3').toHaveAttribute('data-index', '2', {
    timeout: 8000,
  });
  await leaveShow();
});

/** The show's bar and what paints paper in the bottom left 400 by 120 px. */
async function showPaint(): Promise<{
  barShown: boolean;
  barOpacity: number | null;
  paperOutsideBar: number;
  barRect: { x: number; y: number; w: number; h: number } | null;
}> {
  return page.evaluate(() => {
    const overlay = document.querySelector('[data-control="present.show"]');
    const bar =
      overlay?.querySelector('[role="toolbar"], .ts-present-bar, .pt-present-bar, .ts-pbar') ??
      null;
    const barRect = bar ? bar.getBoundingClientRect() : null;
    const cs = bar ? getComputedStyle(bar) : null;
    const barShown = Boolean(
      bar &&
      bar.getClientRects().length > 0 &&
      cs &&
      cs.visibility !== 'hidden' &&
      parseFloat(cs.opacity) > 0.5,
    );
    /* every element painted paper in the region, outside the bar */
    const region = { x: 0, y: window.innerHeight - 120, w: 400, h: 120 };
    const paper = (c: string) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
      if (!m) return false;
      const a = m[4] === undefined ? 1 : Number(m[4]);
      return a > 0.5 && Number(m[1]) > 225 && Number(m[2]) > 225 && Number(m[3]) > 225;
    };
    let count = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (bar && (bar === el || bar.contains(el))) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const inside =
        r.left < region.x + region.w &&
        r.right > region.x &&
        r.top < region.y + region.h &&
        r.bottom > region.y;
      if (!inside) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) === 0)
        continue;
      if (el.closest('.pt-slide, .ts-sheet')) continue;
      /* a ground that spans the viewport (the viewer's own region, the stage wrap, the show's
         letterbox) is the page's paper and not a block in the corner; the checkout's hosting
         notice (a fixed status strip a deployment with a Blob store never draws) is not the
         show's either */
      if (r.width >= window.innerWidth * 0.98 && r.height >= window.innerHeight * 0.98) continue;
      if (el.matches('.ts-banner[data-state="hosting"], .ts-banner[data-state="hosting"] *'))
        continue;
      if (
        paper(s.backgroundColor) && s.clipPath === 'none' && s.position !== 'static'
          ? true
          : paper(s.backgroundColor) && el.getClientRects().length > 0 && !el.closest('.pt-slide')
      )
        count += 1;
    }
    return {
      barShown,
      barOpacity: cs ? parseFloat(cs.opacity) : null,
      paperOutsideBar: count,
      barRect: barRect ? { x: barRect.x, y: barRect.y, w: barRect.width, h: barRect.height } : null,
    };
  });
}

test(title('present.show.no-white-block'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await clickCard(page, slides[0]!);
  await startShow();
  await page.mouse.move(700, 450);
  await page.mouse.move(720, 460);
  await page.waitForTimeout(500);
  const facts = await showPaint();
  test.info().annotations.push({ type: 'paint', description: JSON.stringify(facts) });
  await leaveShow();
  expect(facts.barShown, 'the bar is up').toBe(true);
  expect(facts.paperOutsideBar, 'no element but the bar is painted paper in the bottom left').toBe(
    0,
  );
});

test(title('present.show.bar-on-entry'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await clickCard(page, slides[0]!);
  await startShow();
  const onEntry = await showPaint();
  await page.waitForTimeout(4500);
  const afterWait = await showPaint();
  await page.mouse.move(700, 450);
  await page.mouse.move(740, 470);
  await page.waitForTimeout(400);
  const afterMove = await showPaint();
  test.info().annotations.push({
    type: 'bar',
    description: `on entry ${onEntry.barShown} (opacity ${onEntry.barOpacity}); after 4.5 s ${afterWait.barShown} (${afterWait.barOpacity}); after a move ${afterMove.barShown} (${afterMove.barOpacity})`,
  });
  await leaveShow();
  expect(onEntry.barShown, 'the bar is visible on entry').toBe(true);
  expect(afterWait.barShown, 'the bar fades after about 3 s').toBe(false);
  expect(afterMove.barShown, 'a pointer move brings it back').toBe(true);
});

test(title('present.presenter.sentence-case'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await clickCard(page, slides[0]!);
  const opened = context.waitForEvent('page', { timeout: 10_000 });
  await ctl(page, 'present.arrow').click();
  await page.locator('#ts-menu-slideshow').waitFor({ timeout: 6000 });
  await ctl(page, 'menu.title.slideshow.presenterView').click();
  const presenter = await opened;
  await presenter.waitForURL(/\/present\//, { timeout: 10_000 });
  await ctl(presenter, 'presenter').waitFor({ timeout: 20_000 });
  await presenter.waitForTimeout(500);
  const facts = await presenter.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--pt-ink-2)';
    document.body.appendChild(probe);
    const ink2 = getComputedStyle(probe).color;
    probe.remove();
    const root = document.querySelector('[data-control="presenter"]') ?? document.body;
    const labels = [...root.querySelectorAll('*')]
      .filter(
        (el) =>
          el.children.length === 0 &&
          /^(Timer|Time|Previous slide|Next slide|TIMER|TIME|PREVIOUS|NEXT|Prev|Elapsed|Clock)$/i.test(
            el.textContent?.trim() ?? '',
          ),
      )
      .map((el) => {
        const cs = getComputedStyle(el);
        return {
          text: el.textContent?.trim() ?? '',
          size: parseFloat(cs.fontSize),
          color: cs.color,
          transform: cs.textTransform,
        };
      });
    const arrows = ['presenter.previous', 'presenter.next'].map((c) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        c,
        label:
          el.getAttribute('aria-label') ??
          el.getAttribute('data-tip') ??
          el.textContent?.trim() ??
          '',
        color: cs.color,
        size: Math.round(r.height),
        /* on the first slide Previous is disabled and reads the disabled token on purpose
           (chrome.disabled.token-both-appearances); the row's ink-2 is the enabled arrow's */
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      };
    });
    return { ink2, labels, arrows };
  });
  await presenter.close();
  await leaveShow().catch(() => undefined);
  test.info().annotations.push({ type: 'presenter', description: JSON.stringify(facts) });
  const words = facts.labels.map((l) => l.text);
  expect(words, 'the labels read Timer and Time').toEqual(
    expect.arrayContaining(['Timer', 'Time']),
  );
  for (const l of facts.labels) {
    expect(l.text, 'sentence case, no capitals').toMatch(/^[A-Z][a-z]+( [a-z]+)*$/);
    expect(l.transform, 'no text-transform').not.toBe('uppercase');
    expect(Math.abs(l.size - 12.5) < 0.3, `${l.text} at 12.5 px (${l.size})`).toBe(true);
    expect(l.color, `${l.text} in ink-2`).toBe(facts.ink2);
  }
  for (const a of facts.arrows) {
    expect(a, 'the arrow is drawn').not.toBeNull();
    expect(a!.label, 'named Previous slide or Next slide').toMatch(/^(Previous slide|Next slide)/);
    if (!a!.disabled) expect(a!.color, 'in ink-2').toBe(facts.ink2);
    expect(a!.size, 'at 32 px').toBe(32);
  }
  expect(
    facts.arrows.some((a) => a !== null && !a.disabled),
    'at least one arrow is enabled and read in ink-2',
  ).toBe(true);
});

test(title('brand.frame.toggles'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await clickCard(page, slides[1]!);
  const actions = await page.evaluate(() =>
    (window.turboslide?.studio.describe().actions ?? []).map((a: { id: string } | string) =>
      typeof a === 'string' ? a : a.id,
    ),
  );
  if (!actions.includes('brand.set'))
    test.skip(true, 'not on this build: brand.set (docs/PRODUCT.md 4.1, B5a)');
  /* the three toggles through the panel where it is on the build, each row with its sentence */
  await menuPath(page, 'slide', 'slide.changeTheme');
  const panel = await ctl(page, 'panel.brand')
    .waitFor({ timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  let sentences: string[] = [];
  if (panel) {
    sentences = await page.evaluate(() =>
      ['rails', 'rules', 'crosses'].map((k) => {
        /* the check row, then its sentence under it (ThemesPanel.tsx `.ts-brand-line`, the
           product's "each with one sentence under it", docs/PRODUCT.md 4.4) */
        const row = document
          .querySelector(`[data-control="panel.brand.frame.${k}"]`)
          ?.closest('label, div, li');
        const line = row?.nextElementSibling;
        return `${row?.textContent?.trim() ?? ''} ${line?.classList.contains('ts-brand-line') ? (line.textContent?.trim() ?? '') : ''}`.trim();
      }),
    );
    for (const k of ['rails', 'rules', 'crosses']) {
      const box = ctl(page, `panel.brand.frame.${k}`);
      const input = box.locator('input').first();
      const target = (await input.count()) > 0 ? input : box;
      if (await target.isChecked().catch(() => true)) await target.click({ force: true });
      await settled(page);
    }
    await ctl(page, 'panel.brand.close')
      .click()
      .catch(() => undefined);
  } else {
    const s = await settled(page);
    await invoke(page, 'brand.set', {
      path: '/frame',
      value: { rails: false, rules: false, crosses: false },
      baseRevision: s.revision,
    });
    await settled(page);
  }
  const frameDrawn = (p: Page, root: string) =>
    p.evaluate((r) => {
      const stage = document.querySelector(`${r} .ts-stage`) ?? document.querySelector('.ts-stage');
      const drawn = (sel: string) =>
        [...(stage?.querySelectorAll(sel) ?? [])].filter((el) => {
          const cs = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return (
            cs.display !== 'none' &&
            cs.visibility !== 'hidden' &&
            parseFloat(cs.opacity) > 0 &&
            box.width > 0 &&
            box.height > 0
          );
        }).length;
      return {
        rules: drawn('.frame .rule'),
        crosses: drawn('.frame .cross'),
        rails: drawn('.rail, .frame .rail, [data-rail]'),
      };
    }, root);
  const editor = await frameDrawn(page, '.ts-stagewrap.ts-editor');
  await startShow();
  const inShow = await frameDrawn(page, '.ts-stagewrap.is-present');
  await leaveShow();
  const opened = context.waitForEvent('page', { timeout: 10_000 });
  await ctl(page, 'present.arrow').click();
  await page.locator('#ts-menu-slideshow').waitFor({ timeout: 6000 });
  await ctl(page, 'menu.title.slideshow.presenterView').click();
  const presenter = await opened;
  await ctl(presenter, 'presenter').waitFor({ timeout: 20_000 });
  await presenter.waitForTimeout(500);
  const inPresenter = await frameDrawn(presenter, '[data-control="presenter"]');
  await presenter.close();
  await leaveShow().catch(() => undefined);
  const s2 = await settled(page);
  await invoke(page, 'brand.reset', { path: '/frame', baseRevision: s2.revision }).catch(
    () => undefined,
  );
  await settled(page);
  test.info().annotations.push({
    type: 'frame',
    description: `sentences ${JSON.stringify(sentences)}; editor ${JSON.stringify(editor)}; show ${JSON.stringify(inShow)}; presenter ${JSON.stringify(inPresenter)}`,
  });
  if (panel) {
    expect(sentences[0], 'the Rails row carries its sentence').toMatch(
      /Rails: the margins at the sides of every slide/,
    );
    expect(sentences[1], 'the Rules row').toMatch(/Rules: the thin lines that frame the slide/);
    expect(sentences[2], 'the Crosses row').toMatch(/Crosses: the small marks at the frame/);
  }
  for (const [name, f] of [
    ['the editor', editor],
    ['the show', inShow],
    ['the presenter', inPresenter],
  ] as const)
    expect([f.rules, f.crosses, f.rails], `${name} draws no rule, cross or rail`).toEqual([
      0, 0, 0,
    ]);
});

coverage(import.meta.filename, [
  'present.slideshow.button',
  'present.slideshow.cmd-enter',
  'present.keys.arrow-right',
  'present.keys.arrow-left',
  'present.keys.space',
  'present.keys.digit-enter',
  'present.keys.home',
  'present.keys.end',
  'present.click-advances',
  'present.counter',
  'present.laser',
  'present.escape',
  'present.presenter-view.arrow',
  'present.presenter-view.s-key',
  'present.notes-in-presenter',
  'present.slideshow.from-beginning',
  'present.keys.blank-black-white',
  'present.skipped-left-out',
  'text.link.present-click',
  'comments.on-title-placeholder',
  'comments.on-slide',
  'comments.on-object',
  'comments.reply',
  'comments.resolve',
  'comments.toolbar-and-menu-routes',
  /* the product round (docs/PRODUCT.md 8.1) */
  'text.link.slide-target',
  'present.show.no-white-block',
  'present.show.bar-on-entry',
  'present.presenter.sentence-case',
  'brand.frame.toggles',
]);
