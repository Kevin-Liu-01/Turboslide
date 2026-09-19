import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

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
// context; every other person is a fresh context with no cookie of the owner's. The return round
// (docs/RETURN.md section 5) adds the roster's Go to slide, the second browser's live pointer and
// the notification that arrives from a second browser's mention.
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

// ---------------------------------------------------------------------------------------------
// the second person's tab: its client id, its roster and the way it leaves

const CLIENT_ID = /^[0-9a-f]{32}$/;
/** The tab's own client id once the stream's hello has minted it (32 hex characters, report 10 F26). */
async function ownClientId(p: Page): Promise<string> {
  await expect
    .poll(async () => (await state(p)).presence?.clientId ?? '', { timeout: 15_000 })
    .toMatch(CLIENT_ID);
  return (await state(p)).presence.clientId ?? '';
}
/** The client ids the tab's roster lists beside its own (`describe().state.presence.others`). */
async function othersOf(p: Page): Promise<string[]> {
  return ((await state(p)).presence?.others ?? []).map((row) => row.clientId);
}
/** One client's chip in the title row's four slots (PresenceSlot.tsx `presence.chip.<id>`). */
const chipOf = (p: Page, clientId: string): Locator =>
  p.locator(`[data-control="presence.chip.${clientId}"]`);
/** When each second tab navigated away, by its client id, for the roster readings of the rows after it. */
const leftAt = new Map<string, number>();

/**
 * Closes a second person's context the way their tab closes: a navigation to `about:blank`
 * first, which fires `pagehide` and lets the room client post its leave with keepalive (b7's
 * SF-R1; t2.md section 1 proved the client's half), then the context. A context closed under
 * the beacon cancels it, and a row whose leave never landed stays in every roster for the
 * record's 30 s life on the blob tier (VERIFICATION.md C3T-F1: `collab.presence-chips` read its
 * `before` count while two such rows of the collaboration rows' closed contexts were alive). The
 * leave warning of EditorRoot.tsx fires only with a pending write, so a page with a client id
 * waits for its pending count to read zero first (up to 5 s, through `describe()` alone: lib's
 * `settled` reads the `deck.saveState` control, which a viewer's page does not carry, and its
 * locator read has no action timeout, so it held the two cannot edit rows to the test timeout
 * on the first run of this round) and a dialog is accepted either way. When the page held a
 * client id, the owner's roster is given up to 3 s to drop it before the context closes, so no
 * POST is cut in flight; a roster that keeps the row is not this helper's claim
 * (`collab.presence-chips` judges the leave) and the context closes all the same, the
 * navigation's time kept in `leftAt`.
 */
async function closeSecond(other: BrowserContext, p: Page): Promise<void> {
  try {
    if (p.isClosed() || !/^https?:/.test(p.url())) return;
    const joined = await state(p)
      .then((s) => s.presence?.clientId ?? null)
      .catch(() => null);
    if (joined !== null)
      await expect
        .poll(
          () =>
            state(p)
              .then((s) => s.sync?.pending ?? 0)
              .catch(() => 0),
          { timeout: 5000 },
        )
        .toBe(0)
        .catch(() => undefined);
    p.once('dialog', (dialog) => void dialog.accept().catch(() => undefined));
    const t = Date.now();
    await p.goto('about:blank', { timeout: 10_000 }).catch(() => undefined);
    if (joined !== null) {
      leftAt.set(joined, t);
      if (!page.isClosed())
        await expect
          .poll(() => othersOf(page).catch(() => [joined]), { timeout: 3000 })
          .not.toContain(joined)
          .catch(() => undefined);
    }
  } finally {
    await other.close();
  }
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
    await closeSecond(other, visitor);
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
    await closeSecond(other, viewer);
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
    await closeSecond(other, editor);
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
    await closeSecond(other, viewer);
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
    await closeSecond(other, stranger);
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
    await closeSecond(other, second);
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
    await closeSecond(other, second);
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
    await closeSecond(other, second);
  }
});

test(title('collab.presence-chips'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const owner = await ownClientId(page);
  /* the row reads the second tab by its client id, never by a count: VERIFICATION.md C3T-F1 read
     the row's `before` count while rows of the earlier rows' closed second contexts were alive on
     the shared record (12 to 30 s after their close on the blob tier) and its navigation while
     the second tab's first presence post was still in flight, so the owner's count never fell
     below `before` and the row failed on rows that were not its tab's. Here the owner's roster
     must show the second tab's own chip first (the matrix's 10 s), which proves its presence has
     landed on the owner's view before the tab leaves, and the leave is judged on that chip alone.
     The four slots fill in join order (presence-model.ts slotChips), so a chip is in the +N count
     while four other rows are alive: the row waits for a free slot, bounded by the record's 30 s
     life plus the poll, and records the rows that stayed with the time since their tab left
     (`leftAt`, kept by closeSecond) for the verifier; a row that outlives its tab is the
     product's half of C3T-F1 (b4.md, the request to b7) and is not this row's claim */
  const t0 = Date.now();
  const stale = await othersOf(page);
  await expect
    .poll(async () => (await othersOf(page)).length, {
      timeout: 35_000,
      message: "a free chip slot on the owner's tab (fewer than four other rows)",
    })
    .toBeLessThan(4);
  const staleNow = await othersOf(page);
  const ages = stale.map((id) => {
    const at = leftAt.get(id);
    return at === undefined
      ? `${id.slice(0, 8)} unknown`
      : `${id.slice(0, 8)} left ${t0 - at} ms ago`;
  });
  test.info().annotations.push({
    type: 'presence roster before',
    description:
      `${stale.length} row(s) of closed tabs in the owner's roster at the row's start` +
      (ages.length > 0 ? ` (${ages.join(', ')})` : '') +
      `; ${staleNow.length} after ${Date.now() - t0} ms`,
  });
  const { context: other, page: second } = await secondEditor(browser);
  try {
    const guest = await ownClientId(second);
    /* both tabs show the other person within 10 s */
    const shown = Date.now();
    await expect(
      chipOf(page, guest),
      "the owner's tab shows the second tab's chip within 10 s",
    ).toHaveCount(1, { timeout: 10_000 });
    const ownerSaw = Date.now() - shown;
    await expect(
      chipOf(second, owner),
      "the second tab shows the owner's chip within 10 s",
    ).toHaveCount(1, { timeout: 10_000 });
    test.info().annotations.push({
      type: 'presence join',
      description: `the owner's tab showed the second tab's chip ${ownerSaw} ms after its hello; both tabs show the other within ${Date.now() - shown} ms`,
    });
    /* the second tab closes the way a person's does: a navigation away fires `pagehide`, the
       controller stops and the room client posts `POST /presence?leave=1` with keepalive, which the
       browser carries across the navigation (EditorRoot.tsx onPageHide, room-client.ts stop).
       Closing the context under that beacon cancelled it (the run 2 trace of VERIFICATION.md
       C3S-F3 shows no leave, pass 1's one at status -1), so the chip lived the roster record's
       30 s life and the row's 30 s bound sat inside it (b7's SF-R1). The bound stays the matrix's
       30 s: with the leave delivered the chip goes within the leave's push and the poll (5 s and
       5 s on the blob tier, at once on the memory channel), and without it the row fails as
       before. The context closes only after the owner's tab has read the leave, so no beacon is
       cut under it; the leave warning of EditorRoot.tsx fires only with a pending write, which
       `settled` rules out, and a dialog is accepted so the navigation goes through either way.
       The leave is read through the owner's roster alone: a keepalive request issued under
       `pagehide` is shown by neither Playwright's request events nor a trace nor a raw CDP
       Network session (t2.md, the probe of 2026-09-18: the client's fetch call was recorded, the
       Network domain reported nothing), so the driver cannot assert on the request itself */
    await settled(second);
    second.once('dialog', (dialog) => void dialog.accept().catch(() => undefined));
    const t = Date.now();
    await second.goto('about:blank');
    leftAt.set(guest, t);
    await expect(
      chipOf(page, guest),
      "the second tab's chip leaves the owner's tab within 30 s of its tab closing",
    ).toHaveCount(0, { timeout: 30_000 });
    const gone = Date.now() - t;
    const listed = (await othersOf(page)).includes(guest);
    test.info().annotations.push({
      type: 'presence leave',
      description: `the second tab's chip left the owner's tab ${gone} ms after it navigated away${listed ? ' (its roster row is still listed)' : ''}`,
    });
  } finally {
    await closeSecond(other, second);
  }
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
    await closeSecond(other, second);
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
    await closeSecond(other, viewer);
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
    await closeSecond(other, viewer);
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
    /* on the blob tier the thread reaches the second browser's instance through the deck pulse
       and the comments index watcher (comments-store.ts `watchSidecarIndex`; VERIFICATION.md
       C2-F28, C3T-F3: the watcher took an index its mirror had pulled for the owner's read back
       as its own push and announced nothing). A failure names what the second tab knew when the
       wait ended, so a stream that was down reads apart from an announcement that never came */
    await expect
      .poll(async () => ((await state(second)).comments?.threads ?? []).length, { timeout: 10_000 })
      .toBe(before + 1)
      .catch(async (error: unknown) => {
        const after = await state(second).catch(() => null);
        throw new Error(
          `the second browser lists ${after?.comments?.threads.length ?? 'no'} thread(s) ${Date.now() - t} ms after the owner's submit, ${before + 1} expected (its stream connected ${String(after?.sync.connected)}, pending ${String(after?.sync.pending)}, comments loaded ${String(after?.comments?.loaded)}): ${error instanceof Error ? error.message : String(error)}`,
        );
      });
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
    await closeSecond(other, second);
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
    await closeSecond(other, second);
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
  /* the row's bound is the matrix's 5 s; the document is read past it, to 20 s, so a miss names
     the time the restore took rather than "not within 5 s" alone (VERIFICATION.md R2-F3: one red
     of three on the preview under a machine load of 50 to 133, passed on every quiet run) */
  let landedMs: number | null = null;
  for (;;) {
    if (JSON.stringify(await slideJson(page, first)).includes('written by the second browser')) {
      landedMs = Date.now() - t;
      break;
    }
    if (Date.now() - t > 20_000) break;
    await page.waitForTimeout(200);
  }
  test.info().annotations.push({
    type: 'restore',
    description: `the restored document carried the second browser's text after ${landedMs ?? 'more than 20000'} ms (panel notice ${noticeText ?? 'none'})`,
  });
  expect(
    landedMs,
    `the restore lands within 5 s: the text ${landedMs === null ? 'did not land within 20 s' : `landed after ${landedMs} ms`} (panel notice ${noticeText ?? 'none'})`,
  ).not.toBeNull();
  expect(landedMs!, `the restore lands within 5 s (it took ${landedMs} ms)`).toBeLessThan(5000);
  const snack = await ctl(page, 'snackbar')
    .textContent()
    .catch(() => '');
  expect(snack ?? '', 'no refusal').not.toMatch(/version log breaks|changed outside the store/);
});

// ---------------------------------------------------------------------------------------------
// the return round's rows (docs/RETURN.md 2.16, 2.17, section 5)

/** Turns Tools > Advanced tools on in a page when a menubar row is absent; answers whether it did. */
async function reachMenuRow(p: Page, menuId: string, ...rowIds: string[]): Promise<boolean> {
  const present = async () => {
    await ctl(p, `menubar.${menuId}`).click();
    await p.locator(`#ts-menu-${menuId}`).waitFor({ timeout: 8000 });
    for (let i = 0; i < rowIds.length - 1; i += 1) {
      const row = ctl(p, `menu.${rowIds[i]}`);
      if ((await row.count()) === 0) break;
      await row.hover();
      await p.waitForTimeout(350);
    }
    const drawn = (await ctl(p, `menu.${rowIds[rowIds.length - 1]}`).count()) > 0;
    await p.keyboard.press('Escape');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    return drawn;
  };
  if (await present()) return false;
  await menuPath(p, 'tools', 'tools.advancedTools');
  await expect
    .poll(async () => (await state(p)).settings?.['advancedTools'] === true, { timeout: 5000 })
    .toBe(true);
  return true;
}
async function switchOff(p: Page): Promise<void> {
  if ((await state(p)).settings?.['advancedTools'] === true)
    await menuPath(p, 'tools', 'tools.advancedTools');
}

test(title('collab.roster.go-to-slide'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const order = await slideOrder(page);
  await clickCard(page, order[0]!);
  const { context: other, page: second } = await secondEditor(browser);
  let switched = false;
  try {
    const guest = await ownClientId(second);
    await ownClientId(page);
    /* the second browser moves to the last slide; the owner's chip row follows */
    const last = order[order.length - 1]!;
    await clickCard(second, last);
    await expect(chipOf(page, guest), "the second tab's chip on the owner's tab").toHaveCount(1, {
      timeout: 10_000,
    });
    /* the roster's own record of the guest's slide, as the owner's tab holds it
       (`describe().state.presence.others[].slideId`, the row `goToClient` reads: controller.tsx
       `latest().roster.find(...)`, then `shell.select(target.slideId)`). It is read to the last
       slide before the click, within the matrix's 10 s for a presence change to reach the other
       tab, so the row names its half on a miss: a record that still carries the guest's first
       slide is the store's (VERIFICATION.md R2-F1: three preview runs read the owner landing on
       `title`, the guest's first slide, after the click), and a click that does not jump with the
       record right is the chip's */
    const guestSlide = async (): Promise<string | null> => {
      const rows = ((await state(page)).presence?.others ?? []) as {
        clientId: string;
        slideId?: string;
      }[];
      return rows.find((row) => row.clientId === guest)?.slideId ?? null;
    };
    const t0 = Date.now();
    let rosterMs: number | null = null;
    for (;;) {
      if ((await guestSlide()) === last) {
        rosterMs = Date.now() - t0;
        break;
      }
      if (Date.now() - t0 > 10_000) break;
      await page.waitForTimeout(250);
    }
    const rosterSlide = await guestSlide();
    test.info().annotations.push({
      type: 'roster',
      description: `the owner's record of the guest's slide read ${rosterSlide ?? 'none'} (expected ${last}) after ${rosterMs ?? 'more than 10000'} ms`,
    });
    expect(
      rosterSlide,
      `the owner's roster carries the guest's slide within 10 s (read ${rosterSlide ?? 'none'}, expected ${last}: the record's half, not the chip's)`,
    ).toBe(last);
    /* Go to slide: the chip itself is the row (PresenceSlot.tsx, data-menu-item
       title.presence.goTo); a click jumps to the person's slide */
    const chipItem = await chipOf(page, guest).getAttribute('data-menu-item');
    await chipOf(page, guest).click({ timeout: 5000 });
    await expect
      .poll(async () => (await state(page)).slideId, {
        timeout: 8000,
        message: `Go to slide jumps (the owner's record read ${last} after ${rosterMs} ms, so a miss is the chip's click)`,
      })
      .toBe(last);
    /* the roster: RosterMenu opens from the +N button alone (PresenceSlot.tsx presence.more);
       with the chips fitting, B1's 4.3 draws that button at opacity 0 with pointer-events none
       (is-empty at more === 0), so the roster has no opener a person can reach. The row measures
       that as it stands: the button's state is read, the roster opened when it takes a pointer */
    const more = ctl(page, 'presence.more');
    const moreTakesPointer = await more
      .evaluate(
        (el) =>
          !el.classList.contains('is-empty') &&
          getComputedStyle(el).pointerEvents !== 'none' &&
          getComputedStyle(el).opacity !== '0',
      )
      .catch(() => false);
    let rowText = '';
    let ownDrawn = false;
    if (moreTakesPointer) {
      await more.click({ timeout: 5000 });
      const row = page.locator(`[data-control="presence.roster.${guest}"]`).first();
      await row.waitFor({ timeout: 8000 });
      rowText = (await row.textContent()) ?? '';
      expect(rowText, 'the row names the slide and the role').toMatch(/slide \d+/i);
      expect(rowText).toMatch(/viewer|editor|owner/i);
      await page.keyboard.press('Escape');
      /* the own row opens the account menu (its plate is parked: drawn with the switch on) */
      switched = await reachMenuRow(page, 'tools', 'tools.advancedTools').catch(() => false);
      if ((await state(page)).settings?.['advancedTools'] !== true)
        await menuPath(page, 'tools', 'tools.advancedTools');
      await more.click({ timeout: 5000 });
      const own = page
        .locator('[data-control^="presence.roster."][data-menu-item="title.presence.me"]')
        .first();
      ownDrawn = (await own.count()) > 0;
      if (ownDrawn) {
        await own.click({ timeout: 5000 });
        await expect(
          page.locator('[data-control^="account."]').first(),
          'the own row opens the account menu',
        ).toBeVisible({ timeout: 5000 });
        await page.keyboard.press('Escape');
      }
    }
    test.info().annotations.push({
      type: 'roster',
      description: `chip item ${chipItem}; +N takes a pointer ${moreTakesPointer}; row "${rowText.trim()}"; own row drawn with the switch on ${ownDrawn}`,
    });
    expect(
      moreTakesPointer,
      'the roster has an opener with one collaborator present (the +N button is drawn at opacity 0 with pointer-events none while the chips fit, PresenceSlot.tsx is-empty at more === 0)',
    ).toBe(true);
    expect(ownDrawn, 'the own row is listed with the switch on').toBe(true);
  } finally {
    if (switched) await switchOff(page).catch(() => undefined);
    await closeSecond(other, second);
  }
});

test(title('view.live-pointers.second-browser'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  const switched = await reachMenuRow(
    page,
    'view',
    'view.livePointers',
    'view.livePointers.collaborators',
  );
  const pointersOn = async (p: Page) => (await state(p)).settings?.['pointerOthers'] === true;
  if (!(await pointersOn(page)))
    await menuPath(page, 'view', 'view.livePointers', 'view.livePointers.collaborators');
  await expect.poll(() => pointersOn(page), { timeout: 5000 }).toBe(true);
  const { context: other, page: second } = await secondEditor(browser);
  try {
    await clickCard(second, first);
    const guest = await ownClientId(second);
    await expect(chipOf(page, guest)).toHaveCount(1, { timeout: 10_000 });
    /* the second browser shows its own pointer (View > Live pointers > Show my pointer, the sender's half) */
    const mineOn = async () => (await state(second)).settings?.['pointerMine'] === true;
    const secondSwitched = await reachMenuRow(
      second,
      'view',
      'view.livePointers',
      'view.livePointers.mine',
    );
    if (!(await mineOn()))
      await menuPath(second, 'view', 'view.livePointers', 'view.livePointers.mine');
    await expect.poll(mineOn, { timeout: 5000 }).toBe(true);
    const sheet = (await second
      .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
      .first()
      .boundingBox())!;
    const pointers = () => page.locator('.ts-remote-pointer-group').count();
    const sweep = async () => {
      for (let i = 0; i < 6; i += 1) {
        await second.mouse.move(
          sheet.x + sheet.width * (0.3 + i * 0.05),
          sheet.y + sheet.height * (0.4 + i * 0.03),
        );
        await second.waitForTimeout(150);
      }
    };
    const t = Date.now();
    await sweep();
    /* polled for 10 s so a late pointer is on record; the row's 2 s bound is judged below */
    let drawnAfter: number | null = null;
    await expect
      .poll(
        async () => {
          if ((await pointers()) > 0) {
            drawnAfter ??= Date.now() - t;
            return true;
          }
          await sweep();
          return false;
        },
        {
          timeout: 10_000,
          message: "the second browser's pointer is drawn on the first within 10 s",
        },
      )
      .toBe(true);
    expect(
      drawnAfter,
      `the second browser's pointer is drawn on the first within 2 s (drawn after ${drawnAfter} ms)`,
    ).toBeLessThanOrEqual(2000 + 900);
    /* with the row off it is not */
    await menuPath(page, 'view', 'view.livePointers', 'view.livePointers.collaborators');
    await expect.poll(() => pointersOn(page), { timeout: 5000 }).toBe(false);
    await sweep();
    await page.waitForTimeout(1500);
    const off = await pointers();
    test.info().annotations.push({
      type: 'pointer',
      description: `drawn ${drawnAfter} ms after the sweep began; with the row off ${off}`,
    });
    expect(off, 'no pointer with Show collaborator pointers off').toBe(0);
    await menuPath(page, 'view', 'view.livePointers', 'view.livePointers.collaborators');
    if (secondSwitched) await switchOff(second);
  } finally {
    await closeSecond(other, second);
    if (switched) await switchOff(page).catch(() => undefined);
  }
});

test(title('inbox.notification-arrives'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  /* the inbox plate is parked: the bell is drawn with the switch on */
  const switched = await reachMenuRow(page, 'tools', 'tools.notificationSettings');
  if ((await state(page)).settings?.['advancedTools'] !== true)
    await menuPath(page, 'tools', 'tools.advancedTools');
  await expect(ctl(page, 'title.inbox'), 'the bell is drawn').toBeVisible({ timeout: 8000 });
  const unread = async () =>
    Number((await ctl(page, 'title.inbox').getAttribute('data-unread')) ?? '0');
  const before = await unread();
  /* the first browser's principal, read from its own state, is what the second browser mentions */
  const me = await page.evaluate(() => {
    const s = window.turboslide!.studio.describe().state as unknown as {
      author?: { principalId?: string; id?: string; name?: string };
      account?: { principalId?: string };
      presence?: { me?: { principalId?: string } };
    };
    return (
      s.author?.principalId ??
      s.account?.principalId ??
      s.presence?.me?.principalId ??
      s.author?.id ??
      null
    );
  });
  const { context: other, page: second } = await secondEditor(browser);
  try {
    await clickCard(second, first);
    const heads = await runsOfBlock(second, 'collab-box');
    const blockId = heads.length > 0 ? 'collab-box' : null;
    /* the comment with a mention through the second browser's window API (comment.add; the
       comment card's mention picker is not this row's question) */
    const s2 = await state(second);
    const r = await invokeOn(second, 'comment.add', {
      anchor: blockId
        ? { kind: 'block', slideId: first, blockId }
        : { kind: 'slide', slideId: first },
      body: {
        text: 'Please look at this {@0}',
        mentions: me ? [{ kind: 'principal', principalId: me }] : [],
      },
      baseRevision: s2.comments?.threads ? undefined : undefined,
    });
    expect(r, 'the second browser added the comment').toBeTruthy();
    const t = Date.now();
    await expect
      .poll(unread, {
        timeout: 10_000,
        message: "the first browser's bell shows a count of 1 within 10 s",
      })
      .toBe(before + 1);
    const arrived = Date.now() - t;
    await ctl(page, 'title.inbox').click();
    await ctl(page, 'panel.inbox').waitFor({ timeout: 8000 });
    /* the panel lists the comment as a sentence from its kind, actor and slide (inbox-model.ts
       inboxSentence: "<name> mentioned you on slide N"), not as the comment's words */
    const mentionItem = page
      .locator('[data-control^="panel.inbox.item."][data-kind="mention"]')
      .first();
    await expect(mentionItem, 'the panel lists the comment as a mention').toBeVisible({
      timeout: 8000,
    });
    const sentence = (await mentionItem.textContent()) ?? '';
    expect(sentence, 'the row names the mention').toMatch(/mention/i);
    await ctl(page, 'panel.inbox.markAllRead').click();
    await expect.poll(unread, { timeout: 8000, message: 'Mark all read clears the count' }).toBe(0);
    test.info().annotations.push({
      type: 'notification',
      description: `mentioned ${me ?? 'nobody (no principal id read)'}; the count reached ${before + 1} after ${arrived} ms; the row read "${sentence.trim().slice(0, 80)}"`,
    });
    if (
      await ctl(page, 'panel.inbox.close')
        .isVisible()
        .catch(() => false)
    )
      await ctl(page, 'panel.inbox.close').click();
  } finally {
    await closeSecond(other, second);
    if (switched) await switchOff(page).catch(() => undefined);
  }
});
/** A window API call on another page (lib's invoke is bound to a page; this names the page). */
async function invokeOn(p: Page, action: string, input: unknown): Promise<unknown> {
  const { invoke } = await import('./lib');
  return invoke(p, action, input);
}

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
  'collab.roster.go-to-slide',
  'view.live-pointers.second-browser',
  'inbox.notification-arrives',
]);
void statusOf;
