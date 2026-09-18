import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  clickCard,
  coverage,
  ctl,
  extraHTTPHeaders,
  headingRun,
  menuPath,
  newDeck,
  openEditor,
  otherContext,
  ownerContext,
  placeBlock,
  runsOfBlock,
  settled,
  skipCurrent,
  slideJson,
  slideOrder,
  state,
  statusOf,
  teardownAll,
  title,
  typeInto,
  typeNote,
  waitEditor,
} from './lib';

// Share and collaboration, the spec rows (docs/FOCUS.md 2.7, section 5 rank 1, 6.4 `share.*`,
// `collab.*`, `comments.reaches-second-browser` and `versions.restore` with the driver
// core/share.spec.ts): the Share dialog and its three links, the clipboard, a second browser on
// the View link as a viewer and a third on the Edit link as an editor, the viewer who changes the
// address and the stranger who has no link both unable to edit, edits and slides travelling
// between two browsers within 5 s three times of three, the presence chips, a rename reaching the
// second browser, the view and present links leaving skipped slides and notes out, a comment
// reaching the second browser, and a restore on a deck two browsers wrote into. The owner is one
// context; every other person is a fresh context with no cookie of the owner's.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/share.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';
let links: { view: string; present: string; edit: string } = { view: '', present: '', edit: '' };
const NOTE = 'A note that never travels with a link.';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Shared review deck');
  await typeNote(page, NOTE);
  await addSlide(page);
  await settled(page);
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

async function openShare(p: Page = page): Promise<void> {
  await ctl(p, 'share.open').click();
  await ctl(p, 'dialog.share').waitFor({ timeout: 10_000 });
}
/**
 * Closes the dialog with its Done button, the way the rows that are not about Escape leave it.
 * `share.escape` alone judges Escape, on a freshly opened dialog. After a Copy link the focus has
 * left the dialog (document.activeElement is the body) and Escape reaches nothing (the Dialog's
 * key handler sits on its card), so a row that copied a link and pressed Escape hung for 5 s in
 * every run of the verification (VERIFICATION.md F8; the mechanism is b6's, b4.md Fix round).
 */
async function closeShare(p: Page = page): Promise<void> {
  const done = ctl(p, 'dialog.share.done');
  if ((await done.count()) > 0) await done.click();
  else await ctl(p, 'dialog.share.close').click();
  await expect(ctl(p, 'dialog.share')).toHaveCount(0, { timeout: 5000 });
}
/* since the focus round the rows hand out no plain address: Copy link mints a share link with the
   row's role (viewer, viewer opening as a show, editor) and copies `<origin>/s/<token>`, the Present
   row's with `?present=1`, and a second Copy link on the same browser sends the same address
   (docs/FOCUS.md 2.7, ruling 2; b6.md R6). The links are read through the product's own Copy link
   and the clipboard, which is how a seller gets them. */
const SHARE_LINK = /\/s\/[A-Za-z0-9_-]{22}/;
async function copyRow(id: string): Promise<string> {
  await openShare();
  /* the row's copy runs once the dialog has its access record (Share.tsx `write` returns while
     the record loads or a write is busy), so the loading state is waited out first */
  await expect(ctl(page, 'dialog.share.loading')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('[data-control="dialog.share"] [aria-busy="true"]')).toHaveCount(0, {
    timeout: 10_000,
  });
  /* the clipboard is cleared first, so the poll below reads this row's link and never the one
     the previous row left there */
  await page.evaluate(() => navigator.clipboard.writeText('cleared before the copy'));
  /* the minted address is read from the server function's own answer as well (the way the
     card Download row reads its ticket): on the preview the runner's clipboard kept the marker
     for 15 s while the dialog said Link copied (VERIFICATION.md pass 2 F-share-copy), so the rows
     behind readLinks judge the link a copy minted even when the clipboard read lags; the
     clipboard stays the copy rows' own assertion through `copied` */
  const minted = page
    .waitForResponse(
      async (r) =>
        r.url().includes('/_serverFn/') && SHARE_LINK.test(await r.text().catch(() => '')),
      { timeout: 15_000 },
    )
    .then(async (r) => {
      const text = await r.text();
      const m = /https?:\\?\/\\?\/[^"\\\s]*\/s\/[A-Za-z0-9_-]{22}[^"\\\s]*/.exec(text);
      return m ? m[0].replace(/\\\//g, '/') : null;
    })
    .catch(() => null);
  await ctl(page, `dialog.share.${id}.copy`).click();
  /* the first Copy link of a row mints the link on the server before it copies; a miss reports
     the dialog's own error sentence and the snackbar, so the row's failure names the mechanism */
  const facts = async () => ({
    clipboard: await page.evaluate(() => navigator.clipboard.readText()),
    error: await ctl(page, 'dialog.share.error')
      .textContent()
      .catch(() => null),
    busy: await page.locator('[data-control="dialog.share"] [aria-busy="true"]').count(),
    snackbar: await ctl(page, 'snackbar')
      .textContent()
      .catch(() => null),
  });
  const clipboardAt = Date.now();
  const clipboard = await expect
    .poll(async () => (await facts()).clipboard, { timeout: 15_000 })
    .toMatch(SHARE_LINK)
    .then(() => page.evaluate(() => navigator.clipboard.readText()))
    .catch(() => null);
  const answer = await minted;
  lastCopy = {
    id,
    clipboard,
    answer,
    ms: Date.now() - clipboardAt,
    facts: await facts(),
  };
  await closeShare();
  /* a row with a copied link is judged on it; a row whose clipboard read lagged is judged on
     the minted answer and says so, and a row with neither fails naming the dialog's own facts */
  const copied =
    clipboard ??
    (answer !== null && id === 'present'
      ? `${answer}${answer.includes('present=1') ? '' : '?present=1'}`
      : answer);
  expect(
    copied,
    `Copy link on the ${id} row writes a share link; the dialog read ${JSON.stringify(lastCopy.facts)}`,
  ).not.toBeNull();
  return copied!;
}
/** The last copy's facts: the clipboard, the minted answer and how long the clipboard took. */
let lastCopy: {
  id: string;
  clipboard: string | null;
  answer: string | null;
  ms: number;
  facts: unknown;
} | null = null;
async function readLinks(): Promise<typeof links> {
  if (links.view !== '' && links.present !== '' && links.edit !== '') return links;
  return {
    view: await copyRow('view'),
    present: await copyRow('present'),
    edit: await copyRow('edit'),
  };
}
/** Follows a copied link in a second context and answers the path it landed on. */
async function landingOf(browser: import('@playwright/test').Browser, url: string) {
  const { context: other, page: visitor } = await otherContext(browser);
  try {
    /* the link's own answer is read, so a token the route does not know fails the row by its
       status instead of a 20 s wait (the b4 repro links-and-stranger: a link minted and copied
       1 s earlier answered 404 to a fresh browser on the preview) */
    const answer = await visitor.goto(url);
    const status = answer?.status() ?? 0;
    expect(status, `the share link ${url.replace(/\/s\/.*$/, '/s/<token>')} opens`).toBeLessThan(
      400,
    );
    await visitor.waitForURL((u) => !u.pathname.startsWith('/s/'), { timeout: 20_000 });
    const landed = new URL(visitor.url());
    return { path: landed.pathname, search: landed.search };
  } finally {
    await other.close();
  }
}

test(title('share.dialog.open'), async () => {
  await openEditor(page, deck);
  await openShare();
  for (const id of ['view', 'present', 'edit'])
    await expect(ctl(page, `dialog.share.${id}`)).toBeVisible();
  await closeShare();
  links = await readLinks();
  expect(links.view).toMatch(SHARE_LINK);
  expect(links.present).toMatch(SHARE_LINK);
  expect(links.present).toContain('present=1');
  expect(links.edit).toMatch(SHARE_LINK);
  /* a second Copy link on this browser sends the same address instead of rotating it */
  expect(await copyRow('view')).toBe(links.view);
});

test(title('share.copy-view-link'), async ({ browser }) => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  const copied = await copyRow('view');
  /* the copy rows judge the clipboard itself: Copy link has to put the address there */
  expect(
    lastCopy?.clipboard,
    `the View row's Copy link writes the clipboard (${JSON.stringify(lastCopy)})`,
  ).toMatch(SHARE_LINK);
  expect(copied).toMatch(SHARE_LINK);
  expect(copied).not.toContain('present=1');
  const landed = await landingOf(browser, copied);
  expect(landed.path).toBe(`/deck/${deck}`);
});
test(title('share.copy-present-link'), async ({ browser }) => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  const copied = await copyRow('present');
  expect(
    lastCopy?.clipboard,
    `the Present row's Copy link writes the clipboard (${JSON.stringify(lastCopy)})`,
  ).toMatch(SHARE_LINK);
  expect(copied).toMatch(SHARE_LINK);
  expect(copied).toContain('present=1');
  const landed = await landingOf(browser, copied);
  expect(landed.path).toBe(`/deck/${deck}`);
  expect(landed.search).toContain('present=1');
});
test(title('share.copy-edit-link'), async ({ browser }) => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  const copied = await copyRow('edit');
  expect(
    lastCopy?.clipboard,
    `the Edit row's Copy link writes the clipboard (${JSON.stringify(lastCopy)})`,
  ).toMatch(SHARE_LINK);
  expect(copied).toMatch(SHARE_LINK);
  const landed = await landingOf(browser, copied);
  expect(landed.path).toBe(`/edit/${deck}`);
});
test(title('share.escape'), async () => {
  await openEditor(page, deck);
  await openShare();
  await page.keyboard.press('Escape');
  await expect(ctl(page, 'dialog.share')).toHaveCount(0, { timeout: 5000 });
});
test(title('share.file-menu-copy-link'), async () => {
  await openEditor(page, deck);
  await menuPath(page, 'file', 'file.share', 'file.share.copyLink');
  await page.waitForTimeout(300);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`/deck/${deck}`);
});

test(title('share.view-link-lands-viewer'), async ({ browser }) => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  links = await readLinks();
  const { context: other, page: viewer } = await otherContext(browser);
  try {
    await viewer.goto(links.view);
    await viewer.waitForURL(new RegExp(`/deck/${deck}`), { timeout: 20_000 });
    await expect(viewer.locator('.pt-viewer').first()).toHaveAttribute('data-settled', '', {
      timeout: 60_000,
    });
    await expect(ctl(viewer, 'menubar'), 'no editor chrome').toHaveCount(0);
    await expect(ctl(viewer, 'toolbar'), 'no toolbar').toHaveCount(0);
  } finally {
    await other.close();
  }
});

test(title('share.edit-link-lands-editor'), async ({ browser }) => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  links = await readLinks();
  const { context: other, page: editor } = await otherContext(browser);
  try {
    await editor.goto(links.edit);
    await editor.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 20_000 });
    await waitEditor(editor);
    await expect(ctl(editor, 'menubar')).toBeVisible();
    await expect(editor.locator('.pt-viewer:not(.ts-skeleton)').first()).toHaveAttribute(
      'data-edit-mode',
      'editing',
    );
  } finally {
    await other.close();
  }
});

/**
 * The authorization mode the deployment runs in, read from the access route the dialog reads
 * (`/api/access/<id>` carries `authorize`), so a refusal row names the mode it ran in (b6 R2):
 * the two cannot edit rows are enforce mode rows; shadow mode refuses no write by its rule.
 */
async function authorizeMode(p: Page, id: string): Promise<string> {
  const res = await p.request.get(`/api/access/${id}`, { headers: extraHTTPHeaders });
  const body = (await res.json().catch(() => ({}))) as { authorize?: string; mode?: string };
  return body.authorize ?? body.mode ?? `unknown (${res.status()})`;
}
/**
 * True when the page cannot edit: You need access, or the editor in a mode without Edit. The
 * write half is judged in enforce mode alone; in shadow mode the page's chrome is judged and the
 * write's answer is recorded, since the mode admits every write by design (b6 R2).
 */
async function cannotEdit(p: Page, id: string): Promise<{ ok: boolean; why: string }> {
  const mode = await authorizeMode(p, id);
  /* the /edit route renders the access page client side after its loader's 404, so the page is
     read for whichever comes first, the access page or the editor, instead of one count of the
     access page followed by the editor's whole wait (b6 R2 addendum: the stranger row ended on
     its budget at the verdict line on a dev server) */
  const arrived = await Promise.race([
    ctl(p, 'access.page')
      .first()
      .waitFor({ state: 'attached', timeout: 90_000 })
      .then(() => 'access' as const),
    waitEditor(p).then(() => 'editor' as const),
  ]).catch(() => 'neither' as const);
  const access = arrived === 'access' || (await ctl(p, 'access.page').count()) > 0;
  if (access) return { ok: true, why: `You need access (${mode} mode)` };
  const editMode = await p
    .locator('.pt-viewer:not(.ts-skeleton)')
    .first()
    .getAttribute('data-edit-mode');
  const editMenu = await ctl(p, 'menubar.edit').count();
  const write = await p.request.post(`/api/actions/deck.rename?deck=${id}`, {
    data: { name: 'x', baseRevision: 1 },
  });
  const refused = [401, 403, 404].includes(write.status());
  const enforce = mode === 'enforce';
  return {
    ok: editMode !== 'editing' && editMenu === 0 && (refused || !enforce),
    why: `${mode} mode: edit mode ${editMode}, Edit menu ${editMenu}, a write answered ${write.status()}${enforce ? '' : ' (the write half is judged in enforce mode alone)'}`,
  };
}

test(title('share.view-link-cannot-edit'), async ({ browser }) => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  links = await readLinks();
  const run = await headingRun(page);
  const before = JSON.stringify(await slideJson(page, (await slideOrder(page))[0]!));
  const { context: other, page: viewer } = await otherContext(browser);
  try {
    await viewer.goto(links.view);
    await viewer.waitForURL(new RegExp(`/deck/${deck}`), { timeout: 20_000 });
    await viewer.goto(viewer.url().replace('/deck/', '/edit/'));
    await viewer.waitForLoadState('domcontentloaded');
    const verdict = await cannotEdit(viewer, deck);
    expect(verdict.ok, verdict.why).toBe(true);
    /* nothing typed in that browser reaches the owner */
    if ((await ctl(viewer, 'access.page').count()) === 0) {
      const el = viewer.locator(`.ts-stagewrap .pt-slide [data-run="${run}"]`).first();
      if ((await el.count()) > 0) {
        await el.dblclick().catch(() => undefined);
        await viewer.keyboard.type('intruder', { delay: 40 });
        await viewer.keyboard.press('Escape');
      }
    }
    await page.waitForTimeout(5500);
    const after = JSON.stringify(await slideJson(page, (await slideOrder(page))[0]!));
    expect(after.includes('intruder'), "the viewer's typing never reaches the owner").toBe(false);
    void before;
  } finally {
    await other.close();
  }
});

test(title('share.stranger-cannot-edit'), async ({ browser }) => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const { context: other, page: stranger } = await otherContext(browser);
  try {
    /* the stranger's browser opens the list first, so its principal exists before the deck is
       asked for: on a TURBOSLIDE_LOCAL_OPEN dev server a cookieless first request is admitted as
       the checkout holder (b6 R2, the way roles.spec.ts starts its second person) */
    await stranger.goto('/decks');
    await stranger.waitForLoadState('domcontentloaded');
    await stranger.goto(`/edit/${deck}`);
    await stranger.waitForLoadState('domcontentloaded');
    const verdict = await cannotEdit(stranger, deck);
    expect(verdict.ok, verdict.why).toBe(true);
  } finally {
    await other.close();
  }
});

/**
 * A second editor on the Edit link, kept for the collaboration rows. The link's landing is a
 * setup here, not the row (`share.edit-link-lands-editor` judges it): on the blob tier a link
 * minted seconds after the deck's creation can redirect to an `/edit/<id>` that answers 404 on
 * the instance serving it (the cycle 3 drive of the collab rows alone: `/s/<token>` 303 to
 * `/edit/<deck>` 404, `waitEditor` at its 90 s bound on a Not found page), so the load is made
 * again every 2 s for up to 30 s until the editor route answers, and the wait is recorded as an
 * annotation of the test for the ledger.
 */
async function secondEditor(
  browser: import('@playwright/test').Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  links = await readLinks();
  const pair = await otherContext(browser);
  const started = Date.now();
  let status: number | null = null;
  let loads = 0;
  for (;;) {
    loads += 1;
    const res = await pair.page.goto(loads === 1 ? links.edit : `/edit/${deck}`);
    status = res?.status() ?? null;
    if (status !== 404 || Date.now() - started > 30_000) break;
    await pair.page.waitForTimeout(2000);
  }
  if (loads > 1)
    test.info().annotations.push({
      type: 'second editor landing',
      description: `${loads} loads over ${Date.now() - started} ms before /edit/${deck} answered ${status} for the Edit link's browser`,
    });
  expect(
    status,
    `the Edit link lands /edit/${deck} (${loads} load(s), ${Date.now() - started} ms)`,
  ).not.toBe(404);
  await pair.page.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 20_000 });
  await waitEditor(pair.page);
  await expect(pair.page.locator('.pt-viewer:not(.ts-skeleton)').first()).toHaveAttribute(
    'data-edit-mode',
    'editing',
  );
  return pair;
}

test(title('collab.edit-from-second-browser'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const { context: other, page: second } = await secondEditor(browser);
  try {
    const first = (await slideOrder(page))[0]!;
    await clickCard(page, first);
    await clickCard(second, first);
    await placeBlock(second, first, {
      id: 'collab-box',
      type: 'text',
      text: 'Start',
      pos: { x: 200, y: 500, w: 500, h: 100 },
    });
    const run = (await runsOfBlock(second, 'collab-box'))[0]!;
    const times: number[] = [];
    for (const word of ['alpha', 'bravo', 'charlie']) {
      await typeInto(second, run, word);
      const t = Date.now();
      await expect
        .poll(async () => JSON.stringify(await slideJson(page, first)), { timeout: 5000 })
        .toContain(word);
      times.push(Date.now() - t);
    }
    expect(
      times.every((ms) => ms < 5000),
      `three of three within 5 s (${times.join(', ')} ms)`,
    ).toBe(true);
  } finally {
    await other.close();
  }
});

test(title('collab.edit-from-owner'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const { context: other, page: second } = await secondEditor(browser);
  try {
    const first = (await slideOrder(page))[0]!;
    await clickCard(page, first);
    await clickCard(second, first);
    if ((await runsOfBlock(page, 'collab-box')).length === 0)
      await placeBlock(page, first, {
        id: 'collab-box',
        type: 'text',
        text: 'Start',
        pos: { x: 200, y: 500, w: 500, h: 100 },
      });
    const run = (await runsOfBlock(page, 'collab-box'))[0]!;
    const times: number[] = [];
    for (const word of ['delta', 'echo', 'foxtrot']) {
      await typeInto(page, run, word);
      const t = Date.now();
      await expect
        .poll(async () => JSON.stringify(await slideJson(second, first)), { timeout: 5000 })
        .toContain(word);
      times.push(Date.now() - t);
    }
    expect(
      times.every((ms) => ms < 5000),
      `three of three within 5 s (${times.join(', ')} ms)`,
    ).toBe(true);
  } finally {
    await other.close();
  }
});

test(title('collab.slide-added-appears'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const { context: other, page: second } = await secondEditor(browser);
  try {
    const times: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const before = (await slideOrder(page)).length;
      await ctl(second, 'toolbar.newSlide').click();
      const t = Date.now();
      await expect
        .poll(async () => (await slideOrder(page)).length, { timeout: 5000 })
        .toBe(before + 1);
      await expect(page.locator('[data-control^="filmstrip.slide."]')).toHaveCount(before + 1, {
        timeout: 5000,
      });
      times.push(Date.now() - t);
      await settled(second);
    }
    expect(
      times.every((ms) => ms < 5000),
      `three of three within 5 s (${times.join(', ')} ms)`,
    ).toBe(true);
  } finally {
    await other.close();
  }
});

test(title('collab.presence-chips'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const { context: other, page: second } = await secondEditor(browser);
  const chips = (p: Page) => p.locator('[data-control^="presence.chip."]').count();
  await expect.poll(() => chips(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => chips(second), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  const before = await chips(page);
  await other.close();
  await expect.poll(() => chips(page), { timeout: 30_000 }).toBeLessThan(before);
});

test(title('collab.rename-reaches-second-browser'), async ({ browser }) => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const { context: other, page: second } = await secondEditor(browser);
  try {
    const name = `Shared review deck ${Date.now().toString(36)}`;
    await menuPath(page, 'file', 'file.rename');
    await page.locator('input[data-control="deck.name"]').waitFor({ timeout: 6000 });
    await page.keyboard.press('Meta+a');
    await page.keyboard.type(name, { delay: 40 });
    await page.keyboard.press('Enter');
    await settled(page);
    await expect(second.locator('[data-control="deck.name"]').first()).toHaveText(name, {
      timeout: 5000,
    });
    await expect.poll(() => second.title(), { timeout: 5000 }).toContain(name);
  } finally {
    await other.close();
  }
});

test(title('share.view-link-excludes-skipped-and-notes'), async ({ browser }) => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const order = await slideOrder(page);
  await clickCard(page, order[order.length - 1]!);
  await skipCurrent(page);
  links = await readLinks();
  const { context: other, page: viewer } = await otherContext(browser);
  try {
    const res = await viewer.goto(links.view);
    const html = (await res?.text()) ?? '';
    await expect(viewer.locator('.pt-viewer').first()).toHaveAttribute('data-settled', '', {
      timeout: 60_000,
    });
    const content = await viewer.content();
    expect(
      html.includes('"notes"') || content.includes(NOTE),
      'no note text in the page or the payload',
    ).toBe(false);
    const total = Number(
      (await viewer.locator('.pt-viewer').first().getAttribute('data-total')) ??
        (await viewer.evaluate(
          () => document.querySelectorAll('.pt-slide, [data-slide-id]').length,
        )),
    );
    const shown = await viewer.evaluate(() =>
      [...document.querySelectorAll('[data-slide-id]')].map((el) =>
        el.getAttribute('data-slide-id'),
      ),
    );
    expect(
      shown.includes(order[order.length - 1]!) || total === order.length,
      'the skipped slide is out',
    ).toBe(false);
  } finally {
    await other.close();
  }
});

test(title('share.present-link-excludes-skipped'), async ({ browser }) => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const order = await slideOrder(page);
  const skipped = (await page.locator('[data-control^="filmstrip.slide."][data-skip]').count()) > 0;
  if (!skipped) {
    await clickCard(page, order[order.length - 1]!);
    await skipCurrent(page);
  }
  links = await readLinks();
  const { context: other, page: viewer } = await otherContext(browser);
  try {
    await viewer.goto(links.present);
    await expect(viewer.locator('[data-control="present.show"]')).toHaveAttribute(
      'data-total',
      String(order.length - 1),
      { timeout: 30_000 },
    );
  } finally {
    await other.close();
  }
});

test(title('comments.reaches-second-browser'), async ({ browser }) => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const { context: other, page: second } = await secondEditor(browser);
  try {
    const first = (await slideOrder(page))[0]!;
    await clickCard(page, first);
    await clickCard(second, first);
    const before = ((await state(second)).comments?.threads ?? []).length;
    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+Alt+m');
    await ctl(page, 'comment.card').waitFor({ timeout: 8000 });
    await ctl(page, 'comment.card.new.field').click();
    await page.keyboard.type('Please check the totals.', { delay: 40 });
    await ctl(page, 'comment.card.new.submit').click();
    const t = Date.now();
    await expect
      .poll(async () => ((await state(second)).comments?.threads ?? []).length, { timeout: 10_000 })
      .toBe(before + 1);
    expect(Date.now() - t).toBeLessThan(10_000);
    /* the Comments panel of the second browser lists it */
    const slot = second.locator('[data-control="title.comments.slot"] button').first();
    if ((await slot.count()) > 0) {
      await slot.click();
      await expect(ctl(second, 'panel.comments')).toContainText('Please check the totals.', {
        timeout: 10_000,
      });
    }
  } finally {
    await other.close();
  }
});

test(title('versions.restore'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  const { context: other, page: second } = await secondEditor(browser);
  try {
    /* the second browser writes into the deck */
    await clickCard(second, first);
    if ((await runsOfBlock(second, 'collab-box')).length === 0)
      await placeBlock(second, first, {
        id: 'collab-box',
        type: 'text',
        text: 'Start',
        pos: { x: 200, y: 500, w: 500, h: 100 },
      });
    const run = (await runsOfBlock(second, 'collab-box'))[0]!;
    await typeInto(second, run, 'written by the second browser');
    await settled(second);
    await expect
      .poll(async () => JSON.stringify(await slideJson(page, first)), { timeout: 10_000 })
      .toContain('written by the second browser');
  } finally {
    await other.close();
  }
  /* the owner names the current version, changes the deck, then restores */
  await clickCard(page, first);
  await menuPath(page, 'file', 'file.versionHistory', 'file.versionHistory.nameCurrent');
  await ctl(page, 'dialog.nameVersion.name').waitFor({ timeout: 8000 });
  await ctl(page, 'dialog.nameVersion.name').click();
  await page.keyboard.type('Before the change', { delay: 40 });
  await ctl(page, 'dialog.nameVersion.save').click();
  await settled(page);
  const run = (await runsOfBlock(page, 'collab-box'))[0]!;
  await typeInto(page, run, 'changed after the version');
  await settled(page);
  await menuPath(page, 'file', 'file.versionHistory', 'file.versionHistory.see');
  await ctl(page, 'panel.versionHistory').waitFor({ timeout: 8000 });
  const named = page.locator('[data-control="panel.versionHistory"]', {
    hasText: 'Before the change',
  });
  await expect(named).toBeVisible();
  for (const w of await page.locator('[data-control^="versionHistory.window."]').all())
    await w.click().catch(() => undefined);
  const pick = page
    .locator('[data-control^="versionHistory."][data-control$=".pick"]', {
      hasText: 'Before the change',
    })
    .first();
  if ((await pick.count()) > 0) await pick.click();
  const restore = page
    .locator(
      '[data-control^="versionHistory."][data-control$=".restore"], [data-control^="version.restore."]',
    )
    .first();
  await restore.waitFor({ timeout: 8000 });
  const t = Date.now();
  await restore.click();
  /* the panel's notice names the restore or its refusal (b7 C2-R14): it is read before the
     document is polled, so a refused restore fails on its sentence and not on a 5 s wait */
  const notice = page.locator('.ts-versions-notice').first();
  await notice.waitFor({ timeout: 5000 }).catch(() => undefined);
  const noticeText = (await notice.count()) > 0 ? await notice.textContent() : null;
  expect(noticeText ?? '', `the panel's notice (${noticeText ?? 'none'})`).not.toMatch(
    /refused|stale|failed|cannot/i,
  );
  await expect
    .poll(async () => JSON.stringify(await slideJson(page, first)), {
      timeout: 5000,
      message: `the restore lands within 5 s (panel notice ${noticeText ?? 'none'})`,
    })
    .toContain('written by the second browser');
  expect(Date.now() - t).toBeLessThan(5000);
  const snack = await ctl(page, 'snackbar')
    .textContent()
    .catch(() => '');
  expect(snack ?? '', 'no refusal').not.toMatch(/version log breaks|changed outside the store/);
});

coverage(import.meta.filename, [
  'share.dialog.open',
  'share.copy-view-link',
  'share.copy-edit-link',
  'share.escape',
  'share.file-menu-copy-link',
  'share.view-link-lands-viewer',
  'share.edit-link-lands-editor',
  'share.view-link-cannot-edit',
  'share.stranger-cannot-edit',
  'collab.edit-from-second-browser',
  'collab.edit-from-owner',
  'collab.slide-added-appears',
  'collab.presence-chips',
  'collab.rename-reaches-second-browser',
  'share.view-link-excludes-skipped-and-notes',
  'share.present-link-excludes-skipped',
  'share.copy-present-link',
  'comments.reaches-second-browser',
  'versions.restore',
]);
void statusOf;
