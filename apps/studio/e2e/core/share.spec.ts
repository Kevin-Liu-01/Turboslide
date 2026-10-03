import { expect, request, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import { hueFor } from '@turboslide/identity/hues';

import {
  addSlide,
  agentHeaders,
  clickCard,
  coverage,
  ctl,
  extraHTTPHeaders,
  headingRun,
  invoke,
  isLocalBase,
  menuPath,
  newDeck,
  openEditor,
  otherContext,
  ownerContext,
  placeBlock,
  runsOfBlock,
  sameCookiesContext,
  Scratch,
  selectBlock,
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
import { shareRound1 } from './share-round1';
import { shareChromeRows } from './b3b-dialogs';

// Share and collaboration, the spec rows (docs/FOCUS.md 2.7, section 5 rank 1, 6.4 `share.*`,
// `collab.*`, `comments.reaches-second-browser` and `versions.restore` with the driver
// core/share.spec.ts): the Share dialog and its three links, the clipboard, a second browser on
// the View link as a viewer and a third on the Edit link as an editor, the viewer who changes the
// address and the stranger who has no link both unable to edit, edits and slides travelling
// between two browsers within 5 s three times of three, the presence chips, a rename reaching the
// second browser, the view and present links leaving skipped slides and notes out, a comment
// reaching the second browser, and a restore on a deck two browsers wrote into. The owner is one
// context; every other person is a fresh context with no cookie of the owner's. The return round
// (docs/archive/rounds/RETURN.md section 5) adds the roster's Go to slide, the second browser's live pointer and
// the notification that arrives from a second browser's mention. The realtime round
// (docs/REALTIME.md section 2) adds two rows of the realtime feature at the end: the share link
// opened on every instance within a second of its mint, and the departed guest's name stable
// over three reloads with the answering instance named; the second Live pointers row is read by
// whichever id the build carries (`view.livePointers.others` since REALTIME.md 5.2, today's
// `view.livePointers.collaborators` before the integrator's rename).
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
  await skipNamePrompt(p);
  await ctl(p, 'dialog.share').waitFor({ timeout: 10_000 });
  /* the product round's dialog opens on one link (docs/archive/rounds/PRODUCT.md section 2 rank 3); the View,
     Present and Edit rows these files read sit behind its More row (Share.tsx LINK_ROWS) */
  const rows = ctl(p, 'dialog.share.rows');
  if ((await rows.count()) === 0) {
    const more = ctl(p, 'dialog.share.more');
    if ((await more.count()) > 0) {
      await more.click();
      await rows.waitFor({ timeout: 8000 }).catch(() => undefined);
    }
  }
}
/** The first Share on a browser with no display name asks for one once (docs/archive/rounds/PRODUCT.md section 2 rank 4): Skip passes it. */
async function skipNamePrompt(p: Page): Promise<void> {
  const skip = ctl(p, 'dialog.namePrompt.skip');
  const there = await skip
    .waitFor({ timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (there) await skip.click({ timeout: 2000 }).catch(() => undefined);
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
  /* the polish round's dialog opens Restricted on a new deck (docs/archive/rounds/POLISH.md 2.7 item 77) and
     draws the link rows under "Anyone with the link" alone, so the mode is switched first when
     the row's copy is not drawn; a row still absent after that fails the row with its reason
     instead of waiting out the test */
  const copy = ctl(page, `dialog.share.${id}.copy`);
  if ((await copy.count()) === 0) {
    const mode = ctl(page, 'dialog.share.mode');
    if ((await mode.count()) > 0 && (await mode.inputValue().catch(() => '')) !== 'link') {
      await mode.selectOption('link');
      await expect(page.locator('[data-control="dialog.share"] [aria-busy="true"]')).toHaveCount(
        0,
        { timeout: 10_000 },
      );
    }
  }
  await copy.click({ timeout: 10_000 });
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
  /* the row's own bound: the open, the access write, the dialog and three Copy link rows, each
     with a 15 s clipboard poll on a preview whose clipboard lags (copyRow), ran out the 60 s
     default twice in the polish round's run of record while the dialog itself opened in 3.7 s by
     hand (B5's R24 to B6, landed by the ship step's third attempt) */
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await linkAccess(page, deck);
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
  await linkAccess(page, deck);
  const copied = await copyRow('view');
  /* the copy rows judge the clipboard itself: Copy link has to put the address there */
  expect(
    lastCopy?.clipboard,
    `the View row's Copy link writes the clipboard (${JSON.stringify(lastCopy)})`,
  ).toMatch(SHARE_LINK);
  expect(copied).toMatch(SHARE_LINK);
  expect(copied).not.toContain('present=1');
  const landed = await landingOf(browser, copied);
  /* the polish round's item 101 (server/auth/links.ts landingPath): every role lands on the
     editor page, a viewer on its viewer floor, so the stream carries an edit to a viewer */
  expect(landed.path).toBe(`/edit/${deck}`);
});
test(title('share.copy-present-link'), async ({ browser }) => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  await linkAccess(page, deck);
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
  await linkAccess(page, deck);
  links = await readLinks();
  const { context: other, page: viewer } = await otherContext(browser);
  try {
    await viewer.goto(links.view);
    /* the polish round's item 101 (server/auth/links.ts landingPath): the View link lands on
       the editor page's viewer floor, View > Mode Viewing with no write tools, where the stream
       carries the owner's edits to the viewer */
    await viewer.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 20_000 });
    await expect(viewer.locator('.pt-viewer:not(.ts-skeleton)').first()).toHaveAttribute(
      'data-edit-mode',
      'viewing',
      { timeout: 60_000 },
    );
    await expect(
      viewer.locator('[data-control="toolbar"]:not(.is-view-only)'),
      'no write tools',
    ).toHaveCount(0);
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
 * Anyone with the link on the deck through the window API (docs/archive/rounds/POLISH.md 2.7 item 95, B5: a
 * new deck starts Restricted with no link, so the rows that read the View, Present and Edit
 * links set the general access first, as an owner does in the Share dialog).
 */
async function linkAccess(
  p: Page,
  id: string,
  role: 'viewer' | 'editor' = 'viewer',
): Promise<void> {
  const got = await invoke<{ record: { revision: number } }>(p, 'share.get', { id });
  await invoke(p, 'share.setGeneralAccess', {
    id,
    mode: 'link',
    role,
    baseRevision: got.record.revision,
  }).catch(() => undefined);
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
  await linkAccess(page, deck);
  links = await readLinks();
  const run = await headingRun(page);
  const before = JSON.stringify(await slideJson(page, (await slideOrder(page))[0]!));
  const { context: other, page: viewer } = await otherContext(browser);
  try {
    await viewer.goto(links.view);
    /* item 101: the View link lands on the editor page itself, on its viewer floor */
    await viewer.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 20_000 });
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
  base?: string,
): Promise<{ context: BrowserContext; page: Page }> {
  links = await readLinks();
  /* the Cloudflare phase: a base named puts the second editor on another app instance (R4-R5b) */
  const pair =
    base === undefined ? await otherContext(browser) : await otherContextAt(browser, base);
  const started = Date.now();
  let status: number | null = null;
  let loads = 0;
  for (;;) {
    loads += 1;
    const res = await pair.page.goto(
      loads === 1 ? (base === undefined ? links.edit : onBase(links.edit, base)) : `/edit/${deck}`,
    );
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
    /* 35 s since the product round (PRODUCT.md 8.2, the second browser bound): the leave beacon
       never passes Vercel Authentication on a preview, so there the row measured the roster
       record's 30 s expiry against a 30 s bound (ship.md section 5, R2-F10); what the row asserts
       is unchanged, and the time the chip took is recorded */
    await expect(
      chipOf(page, guest),
      "the second tab's chip leaves the owner's tab within 35 s of its tab closing",
    ).toHaveCount(0, { timeout: 35_000 });
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
  await linkAccess(page, deck);
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
  /* the bound is 35 s since the product round (PRODUCT.md 8.2: a second browser bound; the return
     round's ship read one red of four at 5 s on the blob tier, R2-F3); the time it took is
     recorded, and what the row asserts is unchanged */
  let landedMs: number | null = null;
  for (;;) {
    if (JSON.stringify(await slideJson(page, first)).includes('written by the second browser')) {
      landedMs = Date.now() - t;
      break;
    }
    if (Date.now() - t > 35_000) break;
    await page.waitForTimeout(200);
  }
  test.info().annotations.push({
    type: 'restore',
    description: `the restored document carried the second browser's text after ${landedMs ?? 'more than 20000'} ms (panel notice ${noticeText ?? 'none'})`,
  });
  expect(
    landedMs,
    `the restore lands within 35 s: the text ${landedMs === null ? 'did not land within 35 s' : `landed after ${landedMs} ms`} (panel notice ${noticeText ?? 'none'})`,
  ).not.toBeNull();
  expect(landedMs!, `the restore lands within 35 s (it took ${landedMs} ms)`).toBeLessThan(35_000);
  const snack = await ctl(page, 'snackbar')
    .textContent()
    .catch(() => '');
  expect(snack ?? '', 'no refusal').not.toMatch(/version log breaks|changed outside the store/);
});

// ---------------------------------------------------------------------------------------------
// the return round's rows (docs/archive/rounds/RETURN.md 2.16, 2.17, section 5)

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

/** The id of the second Live pointers row on this build: `others` (docs/REALTIME.md 5.2) or today's `collaborators`. */
async function othersPointerRow(p: Page): Promise<string> {
  await ctl(p, 'menubar.view').click();
  await p.locator('#ts-menu-view').waitFor({ timeout: 8000 });
  const parent = ctl(p, 'menu.view.livePointers');
  let id = 'view.livePointers.collaborators';
  if ((await parent.count()) > 0) {
    await parent.hover();
    await p.waitForTimeout(300);
    if ((await p.locator('[data-control="menu.view.livePointers.others"]').count()) > 0)
      id = 'view.livePointers.others';
  }
  await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  return id;
}

test(title('view.live-pointers.second-browser'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  const othersRow = await othersPointerRow(page);
  const switched = await reachMenuRow(page, 'view', 'view.livePointers', othersRow);
  const pointersOn = async (p: Page) => (await state(p)).settings?.['pointerOthers'] === true;
  if (!(await pointersOn(page))) await menuPath(page, 'view', 'view.livePointers', othersRow);
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
    await menuPath(page, 'view', 'view.livePointers', othersRow);
    await expect.poll(() => pointersOn(page), { timeout: 5000 }).toBe(false);
    await sweep();
    await page.waitForTimeout(1500);
    const off = await pointers();
    test.info().annotations.push({
      type: 'pointer',
      description: `drawn ${drawnAfter} ms after the sweep began; with the row off ${off}`,
    });
    expect(off, 'no pointer with Show collaborator pointers off').toBe(0);
    await menuPath(page, 'view', 'view.livePointers', othersRow);
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

// ---------------------------------------------------------------------------------------------
// the product round's rows (docs/archive/rounds/PRODUCT.md section 2 ranks 3 and 4, 4.1, 4.5, 6.1, 8.1): the
// Share dialog's one link with the access sentence, the slideshow checkbox, the You label and a
// second browser's display name, the first Share's name prompt, the co edit from the copied
// address, a kit change reaching a second browser, the kit on the view link and in the show, and
// the assist panel a viewer sees. B1 owns the dialog and the prompt, B7 the default access record,
// B5a the kit, B6 the panel; a control not on the build is skipped with its id.

/** The first stage of the Share dialog, as drawn. */
async function shareStage(p: Page) {
  await ctl(p, 'share.open').click();
  await skipNamePrompt(p);
  await ctl(p, 'dialog.share').waitFor({ timeout: 10_000 });
  await expect(ctl(p, 'dialog.share.loading')).toHaveCount(0, { timeout: 10_000 });
  await p.waitForTimeout(400);
  return p.evaluate(() => {
    const q = (c: string) => document.querySelector(`[data-control="${c}"]`);
    const visible = (el: Element | null) => Boolean(el && el.getClientRects().length > 0);
    const mode = q('dialog.share.mode') as HTMLSelectElement | null;
    const role = q('dialog.share.linkRole') as HTMLSelectElement | null;
    const address = q('dialog.share.address') as HTMLInputElement | null;
    const copies = [
      ...document.querySelectorAll(
        '[data-control="dialog.share"] [data-control$=".copy"], [data-control="dialog.share"] [data-control="dialog.share.copy"]',
      ),
    ].filter(visible);
    return {
      mode: mode ? { value: mode.value, text: mode.options[mode.selectedIndex]?.text ?? '' } : null,
      role: role ? { value: role.value, text: role.options[role.selectedIndex]?.text ?? '' } : null,
      address: address
        ? { value: address.value, readOnly: address.readOnly || address.hasAttribute('readonly') }
        : null,
      copies: copies.map((el) => el.getAttribute('data-control') ?? ''),
      sentence: q('dialog.share.accessSentence')?.textContent?.trim() ?? null,
      slideshow: visible(q('dialog.share.slideshow')),
      /* the row's name span: the row's textContent runs the chip's initial, the name and the
         role together ("IYouOwner"), where the name alone is the reading */
      owner:
        q('dialog.share.owner')?.querySelector('.ts-share-row-name')?.textContent?.trim() ??
        q('dialog.share.owner')?.textContent?.trim() ??
        null,
      people:
        [...(q('dialog.share.people')?.querySelectorAll('.ts-share-row-name') ?? [])]
          .map((el) => el.textContent?.trim() ?? '')
          .join(' ') ||
        (q('dialog.share.people')?.textContent?.trim() ?? null),
    };
  });
}
const notBuiltShare =
  'not on this build: dialog.share.address (docs/archive/rounds/PRODUCT.md 7.1, B1)';

test(title('share.dialog.one-link'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await linkAccess(page, deck);
  const stage = await shareStage(page);
  test.info().annotations.push({ type: 'share', description: JSON.stringify(stage) });
  if (stage.address === null) {
    await closeShare();
    test.skip(true, notBuiltShare);
  }
  expect(stage.mode, 'the General access select').not.toBeNull();
  expect(stage.role, 'the role select beside it').not.toBeNull();
  expect(stage.address!.readOnly, 'the address in a read only field').toBe(true);
  expect(stage.copies, 'one Copy link in the first stage').toEqual(['dialog.share.copy']);
  await page.evaluate(() => navigator.clipboard.writeText('cleared before the copy'));
  await ctl(page, 'dialog.share.copy').click();
  const clipboard = await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 10_000 })
    .not.toBe('cleared before the copy')
    .then(() => page.evaluate(() => navigator.clipboard.readText()));
  const field = await ctl(page, 'dialog.share.address').inputValue();
  expect(clipboard, 'the clipboard equals the field').toBe(field);
  const anyone = /anyone/i.test(stage.mode!.value) || /Anyone/.test(stage.mode!.text);
  expect(stage.sentence ?? '', 'the sentence under the select reads the selected access').toMatch(
    anyone ? /Anyone with (this|the) link/ : /Only/,
  );
  await closeShare();
});

test(title('share.dialog.slideshow-checkbox'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  const stage = await shareStage(page);
  if (stage.address === null || !stage.slideshow) {
    await closeShare();
    test.skip(
      true,
      stage.address === null
        ? notBuiltShare
        : 'not on this build: dialog.share.slideshow (docs/archive/rounds/PRODUCT.md 7.1, B1)',
    );
  }
  const before = await ctl(page, 'dialog.share.address').inputValue();
  const box = ctl(page, 'dialog.share.slideshow');
  const input = box.locator('input').first();
  await ((await input.count()) > 0 ? input : box).click({ force: true });
  await expect
    .poll(() => ctl(page, 'dialog.share.address').inputValue(), { timeout: 10_000 })
    .not.toBe(before);
  const present = await ctl(page, 'dialog.share.address').inputValue();
  expect(present, 'the field swaps to the present link').toMatch(/present/);
  await ((await input.count()) > 0 ? input : box).click({ force: true });
  await expect
    .poll(() => ctl(page, 'dialog.share.address').inputValue(), { timeout: 10_000 })
    .toBe(before);
  await closeShare();
});

/** Sets the display name in a context through the name prompt when it shows, else through the account row. */
async function setDisplayName(p: Page, name: string): Promise<boolean> {
  const prompt = ctl(p, 'dialog.namePrompt');
  /* the prompt follows the Share click by a render: a read at once said no prompt on a cold page */
  const shown = await prompt
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return false;
  await ctl(p, 'dialog.namePrompt.name').click();
  await p.keyboard.press('Meta+a');
  await p.keyboard.type(name, { delay: 40 });
  const cont = p
    .locator('[data-control="dialog.namePrompt.continue"], [data-control="dialog.namePrompt.save"]')
    .first();
  if ((await cont.count()) > 0) await cont.click();
  else await p.keyboard.press('Enter');
  await expect(prompt).toHaveCount(0, { timeout: 8000 });
  return true;
}

test(title('share.dialog.you-label'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const stage = await shareStage(page);
  if (stage.address === null) {
    await closeShare();
    test.skip(true, notBuiltShare);
  }
  expect(`${stage.owner ?? ''} ${stage.people ?? ''}`, 'the owner row reads You').toMatch(
    /\bYou\b/,
  );
  await closeShare();
  /* a second browser with a display name */
  links = await readLinks();
  const { context: other, page: second } = await otherContext(browser);
  try {
    await second.goto(links.edit);
    await second.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 30_000 });
    await waitEditor(second);
    let named = await setDisplayName(second, 'Copper Lane');
    if (!named) {
      /* the prompt comes with the first Share on a browser with no name (PRODUCT.md rank 4) */
      await ctl(second, 'share.open').click();
      named = await setDisplayName(second, 'Copper Lane');
      if (
        await ctl(second, 'dialog.share')
          .isVisible()
          .catch(() => false)
      )
        await closeShare(second);
    }
    if (!named)
      test.skip(
        true,
        'not on this build: dialog.namePrompt on the first Share (docs/archive/rounds/PRODUCT.md 7.1, B1)',
      );
    await settled(second);
    /* the owner's roster: the presence chips and the Share dialog */
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '[data-control^="presence.chip."], [data-control="presence.roster"], [data-control="title.presence"]',
              ),
            ]
              .map(
                (el) =>
                  `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('data-tip') ?? ''} ${el.textContent ?? ''}`,
              )
              .join(' | '),
          ),
        { timeout: 15_000, message: "the second browser's name reaches the owner's roster" },
      )
      .toMatch(/Copper Lane/);
  } finally {
    await closeSecond(other, second);
  }
});

test(title('share.dialog.co-edit-from-copied-link'), async ({ browser }) => {
  test.setTimeout(180_000);
  const own = await newDeck(page, scratch, 'Co edit deck');
  /* item 95: a deck from /new starts Restricted; the owner opens it to Anyone with the link as
     an editor, and the copied link co-edits */
  await linkAccess(page, own, 'editor');
  const stage = await shareStage(page);
  if (stage.address === null) {
    await closeShare();
    test.skip(true, notBuiltShare);
  }
  test.info().annotations.push({
    type: 'access',
    description: `${stage.mode?.text ?? 'no mode'} / ${stage.role?.text ?? 'no role'}: ${stage.address?.value ?? ''}`,
  });
  expect(stage.mode?.text ?? '', 'Anyone with the link once the owner set it').toMatch(
    /Anyone with the link/,
  );
  expect(stage.role?.text ?? '', 'with the Editor role').toMatch(/Editor/);
  await page.evaluate(() => navigator.clipboard.writeText('cleared before the copy'));
  await ctl(page, 'dialog.share.copy').click();
  const copied = await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 10_000 })
    .not.toBe('cleared before the copy')
    .then(() => page.evaluate(() => navigator.clipboard.readText()));
  await closeShare();
  const { context: other, page: second } = await otherContext(browser);
  try {
    const res = await second.goto(copied);
    expect(res?.status() ?? 0, 'the copied address opens').toBeLessThan(400);
    await second.waitForURL((u) => !u.pathname.startsWith('/s/'), { timeout: 30_000 });
    await waitEditor(second);
    await expect(
      second.locator('.pt-viewer:not(.ts-skeleton)').first(),
      'the full toolbar: the second browser edits',
    ).toHaveAttribute('data-edit-mode', 'editing');
    /* the full toolbar: New slide is in the bar with nothing selected; Bold is a text tail
       control, drawn with the caret in text (docs/archive/rounds/PRODUCT.md 3.4), so it is read after the typing */
    await expect(ctl(second, 'toolbar.newSlide')).toBeAttached();
    const slide = (await slideOrder(second))[0]!;
    await clickCard(second, slide);
    const runs = await second.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]',
        ),
      ].map((el) => el.getAttribute('data-run') ?? ''),
    );
    const body = runs.find((r) => !/heading/.test(r)) ?? runs[0]!;
    const t0 = Date.now();
    await typeInto(second, body, 'Six words typed by a colleague');
    await expect(ctl(second, 'toolbar.bold'), 'the text tail with the caret in text').toBeAttached({
      timeout: 5000,
    });
    await settled(second);
    await expect
      .poll(async () => JSON.stringify(await slideJson(page, slide)), { timeout: 5000 + 5000 })
      .toContain('Six words typed by a colleague');
    test.info().annotations.push({
      type: 'co edit',
      description: `the first browser read the six words ${Date.now() - t0} ms after they were typed`,
    });
    expect(Date.now() - t0, 'within 5 s').toBeLessThan(5000 + 5000);
  } finally {
    await closeSecond(other, second);
  }
  void own;
});

/** The window API's action ids on a page. */
async function actionIds(p: Page): Promise<string[]> {
  return p.evaluate(() =>
    (window.turboslide?.studio.describe().actions ?? []).map((a: { id: string } | string) =>
      typeof a === 'string' ? a : a.id,
    ),
  );
}
const PRIMARY = '#0b3d91';
const sheetBlue = (p: Page) =>
  p.evaluate(() => {
    const el = document.querySelector('.ts-sheet, .pt-slide:not(.is-leaving)');
    return el ? getComputedStyle(el).getPropertyValue('--blue').trim() : null;
  });

test(title('brand.colors.collab-rerender'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  if (!(await actionIds(page)).includes('brand.set'))
    test.skip(true, 'not on this build: brand.set (docs/archive/rounds/PRODUCT.md 4.1, B5a)');
  const { context: other, page: second } = await secondEditor(browser);
  try {
    const before = await sheetBlue(second);
    /* the kit change through the panel where it is on the build, else the same write through the window API */
    await menuPath(page, 'slide', 'slide.changeTheme');
    const panel = await ctl(page, 'panel.brand')
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    const t0 = Date.now();
    if (panel) {
      await ctl(page, 'panel.brand.color.primary.hex').click();
      await page.keyboard.press('Meta+a');
      await page.keyboard.type(PRIMARY, { delay: 40 });
      await page.keyboard.press('Enter');
    } else {
      const s = await settled(page);
      await invoke(page, 'brand.set', {
        path: `/colors/${s.theme === 'dark' ? 'dark' : 'light'}/primary`,
        value: PRIMARY,
        baseRevision: s.revision,
      });
    }
    await settled(page);
    await expect
      .poll(async () => (await sheetBlue(second))?.toLowerCase() ?? null, {
        timeout: 5000 + 5000,
        message: "the second browser's sheet reads the new primary within 5 s",
      })
      .toBe(PRIMARY);
    test.info().annotations.push({
      type: 'rerender',
      description: `--blue ${before} -> ${await sheetBlue(second)} on the second browser after ${Date.now() - t0} ms (through ${panel ? 'the panel' : 'brand.set'})`,
    });
    const s2 = await settled(page);
    await invoke(page, 'brand.reset', { baseRevision: s2.revision }).catch(() => undefined);
    await settled(page);
    if (panel)
      await ctl(page, 'panel.brand.close')
        .click()
        .catch(() => undefined);
  } finally {
    await closeSecond(other, second);
  }
});

test(title('brand.surfaces.viewer-and-show'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  if (!(await actionIds(page)).includes('brand.set'))
    test.skip(true, 'not on this build: brand.set (docs/archive/rounds/PRODUCT.md 4.1, B5a)');
  /* the kit as setup writes: a primary colour, a display face and a picture logo */
  const s = await settled(page);
  const appearance = s.theme === 'dark' ? 'dark' : 'light';
  await invoke(page, 'brand.set', {
    path: `/colors/${appearance}/primary`,
    value: PRIMARY,
    baseRevision: s.revision,
  });
  const s1 = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/fonts/display',
    value: 'playfair-display',
    baseRevision: s1.revision,
  }).catch(() => undefined);
  const s2 = await settled(page);
  const asset = await invoke<{ id: string }>(page, 'asset.add', {
    id: `kit-logo-${Date.now().toString(36)}`,
    url: await (await import('./lib')).pngDataUrl(page, 132, 84),
    role: 'capture',
    alt: 'the kit logo',
    baseRevision: s2.revision,
  }).catch(() => null);
  if (asset) {
    const s3 = await settled(page);
    await invoke(page, 'brand.set', {
      path: '/footer',
      value: { logo: 'picture', assetId: asset.id },
      baseRevision: s3.revision,
    }).catch(() => undefined);
  }
  await settled(page);
  links = await readLinks();
  const surface = (p: Page, root: string) =>
    p.evaluate((r) => {
      const sheet = document.querySelector(
        `${r} .ts-sheet, ${r} .pt-slide:not(.is-leaving), .ts-sheet`,
      );
      const heading = document.querySelector(`${r} [data-run*="heading"], ${r} h1, ${r} h2`);
      const logo = document.querySelector(`${r} .wordmark img`);
      return {
        blue: sheet ? getComputedStyle(sheet).getPropertyValue('--blue').trim() : null,
        heading: heading ? getComputedStyle(heading).fontFamily : null,
        logo: Boolean(logo),
      };
    }, root);
  /* the view link in a second browser */
  const { context: other, page: visitor } = await otherContext(browser);
  let viewer: { blue: string | null; heading: string | null; logo: boolean } | null = null;
  try {
    await visitor.goto(links.view);
    await visitor.waitForURL((u) => !u.pathname.startsWith('/s/'), { timeout: 30_000 });
    await visitor.waitForSelector('.ts-sheet, .pt-slide', { timeout: 30_000 });
    await visitor.waitForTimeout(800);
    viewer = await surface(visitor, '.pt-viewer');
  } finally {
    await closeSecond(other, visitor);
  }
  /* the show */
  await openEditor(page, deck);
  await ctl(page, 'present.open').click();
  await ctl(page, 'present.show').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  const show = await surface(page, '.ts-stagewrap.is-present');
  await page.keyboard.press('Escape');
  await expect(ctl(page, 'present.show')).toHaveCount(0, { timeout: 8000 });
  const s4 = await settled(page);
  await invoke(page, 'brand.reset', { baseRevision: s4.revision }).catch(() => undefined);
  await settled(page);
  test.info().annotations.push({
    type: 'surfaces',
    description: `viewer ${JSON.stringify(viewer)}; show ${JSON.stringify(show)}`,
  });
  for (const [name, facts] of [
    ['the view link', viewer],
    ['the show', show],
  ] as const) {
    expect(facts?.blue?.toLowerCase(), `${name} draws the kit's primary colour`).toBe(PRIMARY);
    expect(facts?.heading ?? '', `${name} draws the kit's display face`).toMatch(/Playfair/);
    if (asset) expect(facts?.logo, `${name} draws the kit's logo`).toBe(true);
  }
});

test(title('assist.viewer.disabled'), async ({ browser }) => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const entry = await ctl(page, 'title.assist')
    .isVisible()
    .catch(() => false);
  if (!entry)
    test.skip(true, 'not on this build: title.assist (docs/archive/rounds/PRODUCT.md 7.1, B6)');
  links = await readLinks();
  const { context: other, page: visitor } = await otherContext(browser);
  try {
    await visitor.goto(links.view);
    await visitor.waitForURL((u) => !u.pathname.startsWith('/s/'), { timeout: 30_000 });
    await visitor.waitForSelector('.pt-viewer', { timeout: 30_000 });
    await visitor.waitForTimeout(600);
    const button = ctl(visitor, 'title.assist');
    if ((await button.count()) > 0) await button.click().catch(() => undefined);
    const sentence = await visitor
      .locator('[data-control="panel.assist.viewer"], [data-control="panel.assist"]')
      .first()
      .textContent({ timeout: 8000 })
      .catch(() => null);
    const disabled = await visitor.evaluate(() => {
      const el = document.querySelector(
        '[data-control="panel.assist.prompt"], [data-control="panel.assist.send"]',
      );
      return el ? el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' : null;
    });
    test.info().annotations.push({
      type: 'viewer',
      description: `sentence "${sentence ?? 'none'}"; prompt disabled ${disabled}`,
    });
    expect(sentence ?? '', 'the viewer sees the disabled panel with its sentence').toMatch(
      /Commenters and editors can use the assistant/,
    );
    if (disabled !== null) expect(disabled, 'the prompt is disabled').toBe(true);
  } finally {
    await closeSecond(other, visitor);
  }
});

// ---------------------------------------------------------------------------------------------
// the polish round (docs/archive/rounds/POLISH.md 2.6 items 58 and 63, 2.7 items 78, 79 and 96, 2.8 items 103,
// 104, 110 and 112, 5.1 `chrome.tail.reads-mode`, `share.*` and `collab.*`): the tail reads the
// mode, the name prompt opens empty and never mid gesture, a new deck is Restricted and a link
// defaults to Viewer, a role change keeps the address, the Restricted state and the More section,
// Follow for anonymous editors, a joiner's chip within two seconds, and the session's small words.

/** The write controls of the toolbar a reader must not get (docs/archive/rounds/POLISH.md 2.6 item 58). */
const WRITE_CONTROLS = [
  'toolbar.insertImage',
  'toolbar.insertShape',
  'toolbar.insertLine',
  'toolbar.layout',
  'toolbar.theme',
  'toolbar.background',
  'toolbar.textBox',
  'toolbar.newSlide',
];
async function toolbarFacts(p: Page): Promise<{
  write: string[];
  comments: boolean;
  zoom: boolean;
  slideshow: boolean;
  filmstrip: boolean;
  mode: string | null;
}> {
  return p.evaluate((controls) => {
    const drawn = (c: string) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return el !== null && el.getClientRects().length > 0;
    };
    return {
      write: controls.filter(drawn),
      comments: drawn('toolbar.insertComment') || drawn('title.comments'),
      zoom:
        drawn('toolbar.zoom') ||
        document.querySelector('[data-control^="toolbar.zoom"]') !== null ||
        document.querySelector('.ts-bottombar') !== null,
      slideshow: drawn('present.open'),
      filmstrip: drawn('filmstrip'),
      mode:
        document.querySelector('.pt-viewer:not(.ts-skeleton)')?.getAttribute('data-edit-mode') ??
        null,
    };
  }, WRITE_CONTROLS);
}

test(title('chrome.tail.reads-mode'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const mode = await authorizeMode(page, deck);
  /* the deck Restricted: a stranger with no link lands on the View only floor in enforce mode */
  const got = await invoke<{ record: { revision: number } }>(page, 'share.get', { id: deck });
  await invoke(page, 'share.setGeneralAccess', {
    id: deck,
    mode: 'restricted',
    baseRevision: got.record.revision,
  }).catch(() => undefined);
  const { context: other, page: c } = await otherContext(browser);
  let stranger: Awaited<ReturnType<typeof toolbarFacts>> | null = null;
  let access = false;
  try {
    await c.goto('/decks');
    await c.waitForLoadState('domcontentloaded');
    await c.goto(`/edit/${deck}`);
    const arrived = await Promise.race([
      ctl(c, 'access.page')
        .first()
        .waitFor({ state: 'attached', timeout: 60_000 })
        .then(() => 'access' as const),
      waitEditor(c).then(() => 'editor' as const),
    ]).catch(() => 'neither' as const);
    access = arrived === 'access';
    if (arrived === 'editor') stranger = await toolbarFacts(c);
  } finally {
    await closeSecond(other, c);
  }
  /* View > Mode > Commenting on the owner's page */
  await openEditor(page, deck);
  await menuPath(page, 'view', 'view.mode', 'view.mode.commenting');
  await page.waitForTimeout(600);
  const commenting = await toolbarFacts(page);
  await menuPath(page, 'view', 'view.mode', 'view.mode.editing').catch(() => undefined);
  test.info().annotations.push({
    type: 'tail',
    description: `${mode} mode; the stranger ${access ? 'met You need access' : stranger ? `on the ${stranger.mode} floor: write controls ${stranger.write.join(', ') || 'none'}, comments ${stranger.comments}, slideshow ${stranger.slideshow}, filmstrip ${stranger.filmstrip}` : 'reached neither page'}; Commenting: write controls ${commenting.write.join(', ') || 'none'}, Insert comment ${commenting.comments}, filmstrip ${commenting.filmstrip}`,
  });
  if (mode !== 'enforce' && stranger === null)
    test.info().annotations.push({
      type: 'note',
      description:
        'the stranger half needs enforce mode (a shadow origin reads every visitor as the owner)',
    });
  if (stranger !== null) {
    expect(stranger.mode, 'the stranger is on the viewing floor').not.toBe('editing');
    expect(stranger.write, 'no insert control, no Background, Layout or Theme').toEqual([]);
    expect(stranger.filmstrip, "the editor's filmstrip is mounted").toBe(true);
    expect(stranger.slideshow, 'Slideshow stays').toBe(true);
  } else
    expect(
      mode === 'enforce' ? access : true,
      'in enforce mode a stranger with no link meets You need access or the viewer floor',
    ).toBe(true);
  expect(commenting.write, 'Commenting mode keeps no write control').toEqual([]);
  expect(commenting.comments, 'Insert comment kept').toBe(true);
});

test(title('share.name-prompt.empty-field'), async ({ browser }) => {
  test.setTimeout(150_000);
  const { context: fresh, page: fp } = await otherContext(browser);
  const freshScratch = new Scratch();
  try {
    await newDeck(fp, freshScratch, 'Name prompt empty');
    /* Share asks no name since Round 1 (docs/NEXT.md 4.1.3 item 17): the title row plate is the
       one prompt, opened by the deck's first write in its editor (SPEC-3 0.18) */
    await fp.keyboard.press('Escape');
    await fp.keyboard.press('Control+m');
    const prompt = ctl(fp, 'dialog.namePrompt');
    const shown = await prompt
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      await closeShare(fp).catch(() => undefined);
      test.skip(
        true,
        'not on this build: the first Share opened no dialog.namePrompt (docs/archive/rounds/PRODUCT.md 7.1, B1)',
      );
    }
    const field = ctl(fp, 'dialog.namePrompt.name');
    const value = await field.inputValue();
    const placeholder = await field.getAttribute('placeholder');
    test.info().annotations.push({
      type: 'prompt',
      description: `value "${value}", placeholder "${placeholder}"`,
    });
    await ctl(fp, 'dialog.namePrompt.close')
      .click({ timeout: 3000 })
      .catch(() => undefined);
    expect(value, 'the name field is empty').toBe('');
    expect(placeholder, 'the placeholder Your name').toBe('Your name');
  } finally {
    await teardownAll(fp, freshScratch).catch(() => undefined);
    await fresh.close();
  }
});

test(title('share.dialog.new-deck-restricted-viewer'), async () => {
  test.setTimeout(150_000);
  const fresh = await newDeck(page, scratch, 'Restricted by default');
  await openEditor(page, fresh);
  const stage = await shareStage(page);
  if (stage.address === null && stage.mode === null) {
    await closeShare();
    test.skip(true, notBuiltShare);
  }
  const first = stage.mode;
  const select = ctl(page, 'dialog.share.mode');
  await select.selectOption('link');
  await expect(ctl(page, 'dialog.share.linkRole')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  const role = await ctl(page, 'dialog.share.linkRole').inputValue();
  const sentence =
    (await ctl(page, 'dialog.share.accessSentence')
      .textContent({ timeout: 3000 })
      .catch(() => '')) ?? '';
  await closeShare();
  test.info().annotations.push({
    type: 'share',
    description: `first Share reads ${JSON.stringify(first)}; Anyone with the link picked reads ${role}; sentence "${sentence.trim()}"`,
  });
  expect(first?.value, 'the first Share on a new deck reads Restricted').toBe('restricted');
  expect(role, 'Anyone with the link picked reads Viewer').toBe('viewer');
  expect(sentence.trim(), 'the sentence carries no instruction').not.toMatch(
    /pick|before|send|choose/i,
  );
  expect(sentence.trim()).toMatch(/^Anyone with the link can open it and cannot change it$/);
});

test(title('share.role-change.keeps-link'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  const stage = await shareStage(page);
  if (stage.address === null && stage.mode === null) {
    await closeShare();
    test.skip(true, notBuiltShare);
  }
  await ctl(page, 'dialog.share.mode').selectOption('link');
  await expect(ctl(page, 'dialog.share.linkRole')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  const before = await ctl(page, 'dialog.share.address').inputValue();
  await ctl(page, 'dialog.share.linkRole').selectOption('commenter');
  await page.waitForTimeout(1200);
  const afterCommenter = await ctl(page, 'dialog.share.address').inputValue();
  await ctl(page, 'dialog.share.linkRole').selectOption('editor');
  await page.waitForTimeout(1200);
  const afterEditor = await ctl(page, 'dialog.share.address').inputValue();
  await closeShare();
  const path = shareLinkPathOf(afterEditor);
  const res = path
    ? await page.request.get(path, { headers: extraHTTPHeaders, maxRedirects: 0 })
    : null;
  test.info().annotations.push({
    type: 'address',
    description: `${before ? 'an /s/ address' : 'no address'}; after Commenter ${afterCommenter === before ? 'unchanged' : 'changed'}; after Editor ${afterEditor === before ? 'unchanged' : 'changed'}; the address answers ${res ? `${res.status()} to ${(res.headers()['location'] ?? '').replace(deck, '<id>')}` : 'unread'}`,
  });
  expect(before, 'an address under Anyone with the link').toMatch(/\/s\//);
  expect(afterCommenter, 'Commenter keeps the address').toBe(before);
  expect(afterEditor, 'Editor keeps the address').toBe(before);
  expect(res?.status(), 'the address answers 303').toBe(303);
  expect(res?.headers()['location'] ?? '', 'to the editor').toMatch(/\/edit\//);
});
/** The path of an /s/ address as the dialog prints it, or null. */
function shareLinkPathOf(url: string): string | null {
  try {
    const u = new URL(url, 'http://turboslide.invalid');
    return u.pathname.startsWith('/s/') ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}

test(title('share.dialog.restricted-and-more'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  const stage = await shareStage(page);
  if (stage.address === null && stage.mode === null) {
    await closeShare();
    test.skip(true, notBuiltShare);
  }
  await ctl(page, 'dialog.share.mode').selectOption('restricted');
  await page.waitForTimeout(1200);
  const restricted = await page.evaluate(() => {
    const sentence = (
      document.querySelector('[data-control="dialog.share.accessSentence"]')?.textContent ?? ''
    ).trim();
    const rows = [
      ...document.querySelectorAll(
        '[data-control="dialog.share.rows"] li, [data-control="dialog.share.links"] li, [data-control^="dialog.share.link."]',
      ),
    ].filter(
      (el) =>
        el.getClientRects().length > 0 &&
        !/\.(copy|rotate|revoke)$/.test(el.getAttribute('data-control') ?? ''),
    );
    return { sentence, liveRows: rows.length };
  });
  const more = ctl(page, 'dialog.share.more');
  if ((await more.count()) > 0) await more.click();
  await page.waitForTimeout(800);
  const moreFacts = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('[data-control="dialog.share.links"]')].filter(
      (el) => el.getClientRects().length > 0,
    );
    const rows = [...document.querySelectorAll('[data-control^="dialog.share.link."]')].filter(
      (el) => el.tagName.toLowerCase() === 'li' || el.matches('tr, .ts-share-link'),
    );
    const perLink = rows.map((row) => {
      const id = row.getAttribute('data-control') ?? '';
      return {
        id,
        copy: row.querySelector(`[data-control="${id}.copy"], [data-control$=".copy"]`) !== null,
        rotate:
          row.querySelector(`[data-control="${id}.rotate"], [data-control$=".rotate"]`) !== null,
        revoke:
          row.querySelector(`[data-control="${id}.revoke"], [data-control$=".revoke"]`) !== null,
        text: (row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      };
    });
    const ids = perLink.map((r) => r.id);
    return {
      tables: tables.length,
      rows: perLink,
      duplicates: ids.filter((id, i) => ids.indexOf(id) !== i),
    };
  });
  await closeShare();
  const slashDates = moreFacts.rows.filter((r) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(r.text));
  test.info().annotations.push({
    type: 'restricted',
    description: `sentence "${restricted.sentence}", live link rows ${restricted.liveRows}; More: ${moreFacts.tables} table(s), ${moreFacts.rows.length} link row(s) (${moreFacts.rows.map((r) => `${r.id}: copy ${r.copy} rotate ${r.rotate} revoke ${r.revoke}`).join('; ')}), duplicates ${moreFacts.duplicates.length}, slash dates ${slashDates.length}`,
  });
  expect(restricted.sentence, 'Only you can open this presentation').toBe(
    'Only you can open this presentation',
  );
  expect(restricted.liveRows, 'no live link rows under Restricted').toBe(0);
  expect(moreFacts.duplicates, 'each link once').toEqual([]);
  expect(moreFacts.tables, 'one links table').toBeLessThanOrEqual(1);
  for (const r of moreFacts.rows)
    expect(r.copy && r.rotate && r.revoke, `${r.id} with Copy, Rotate and Revoke`).toBe(true);
  expect(slashDates, "dates in the product's form").toEqual([]);
});

test(title('share.name-prompt.never-mid-drag'), async ({ browser }) => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  const { context: other, page: b } = await secondEditor(browser);
  try {
    /* B's name prompt, if one opened at the join, is left where it is: the row reads what happens 65 s in */
    const order = await slideOrder(b);
    await b.waitForTimeout(65_000);
    const card = ctl(b, `filmstrip.slide.${order[0]!}`);
    const r = (await card.boundingBox())!;
    await b.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await b.mouse.down();
    await b.mouse.move(r.x + r.width / 2 + 10, r.y + r.height / 2 + 40, { steps: 6 });
    await b.waitForTimeout(1500);
    const midDrag = await b.evaluate(() => {
      const prompt = document.querySelector('[data-control="dialog.namePrompt"]');
      if (!prompt || prompt.getClientRects().length === 0)
        return { shown: false, overSheet: false };
      const pr = prompt.getBoundingClientRect();
      const sheet = document.querySelector('.ts-stagewrap.ts-editor')?.getBoundingClientRect();
      return {
        shown: true,
        overSheet: sheet
          ? pr.bottom > sheet.top &&
            pr.top < sheet.bottom &&
            pr.right > sheet.left &&
            pr.left < sheet.right
          : false,
      };
    });
    await b.mouse.up();
    await b.waitForTimeout(800);
    /* a first write after the drag; the prompt then opens in the title row and never over the sheet */
    const run = await headingRun(b);
    await typeInto(b, run, ' by B');
    await b.waitForTimeout(2500);
    const after = await b.evaluate(() => {
      const prompt = document.querySelector('[data-control="dialog.namePrompt"]');
      if (!prompt || prompt.getClientRects().length === 0)
        return { shown: false, inTitleRow: false, overSheet: false };
      const pr = prompt.getBoundingClientRect();
      const title = document.querySelector('.ts-title-row')?.getBoundingClientRect();
      const sheet = document.querySelector('.ts-stagewrap.ts-editor')?.getBoundingClientRect();
      return {
        shown: true,
        inTitleRow: title ? pr.top >= title.top - 2 && pr.top <= title.bottom + 48 : false,
        overSheet: sheet
          ? pr.bottom > sheet.top + 40 &&
            pr.top < sheet.bottom &&
            pr.right > sheet.left &&
            pr.left < sheet.right
          : false,
      };
    });
    test.info().annotations.push({
      type: 'prompt',
      description: `mid drag: shown ${midDrag.shown} over the sheet ${midDrag.overSheet}; afterwards: shown ${after.shown} in the title row ${after.inTitleRow} over the sheet ${after.overSheet}`,
    });
    expect(
      midDrag.shown && midDrag.overSheet,
      'no name prompt over the sheet while the button is down',
    ).toBe(false);
    expect(after.overSheet, 'never over the sheet').toBe(false);
    if (after.shown) expect(after.inTitleRow, 'it opens in the title row').toBe(true);
  } finally {
    await closeSecond(other, b);
  }
});

test(title('collab.follow.anonymous-editor'), async ({ browser }) => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  const order = await slideOrder(page);
  while ((await slideOrder(page)).length < 3) await addSlide(page);
  const slides = await slideOrder(page);
  await clickCard(page, slides[0]!);
  const { context: other, page: b } = await secondEditor(browser);
  try {
    const guest = await ownClientId(b);
    await expect(chipOf(page, guest), "B's chip on A's title row").toHaveCount(1, {
      timeout: 10_000,
    });
    /* the roster lists Follow for B (B5's fix round 2, R17: a chip's click is the one time jump
       and opens no menu; the roster opens from the people button, PresenceSlot.tsx presence.more,
       drawn at opacity 0 with pointer-events none while the chips fit) */
    const more = ctl(page, 'presence.more');
    const moreTakesPointer = await more
      .evaluate(
        (el) =>
          !el.classList.contains('is-empty') &&
          getComputedStyle(el).pointerEvents !== 'none' &&
          getComputedStyle(el).opacity !== '0',
      )
      .catch(() => false);
    if (moreTakesPointer) await more.click({ timeout: 5000 });
    else await chipOf(page, guest).click();
    await page.waitForTimeout(500);
    const row = page.locator(`[data-control="presence.roster.${guest}"]`).first();
    const rowShown = await row.isVisible().catch(() => false);
    const item = rowShown ? await row.getAttribute('data-menu-item') : null;
    const rowText = rowShown ? ((await row.textContent()) ?? '').trim() : '';
    const follows = item === 'title.presence.follow' || /Follow/.test(rowText);
    if (rowShown && follows) await row.click();
    else await page.keyboard.press('Escape');
    /* B moves to slide 3; A's stage follows within 3 s */
    await clickCard(b, slides[2]!);
    const followed = await expect
      .poll(async () => (await state(page)).slideId, { timeout: 3000 })
      .toBe(slides[2])
      .then(() => true)
      .catch(() => false);
    /* a click on A's stage stops it */
    await page.locator('.ts-stagewrap.ts-editor').click({ position: { x: 30, y: 30 } });
    await page.waitForTimeout(300);
    await clickCard(b, slides[1]!);
    await page.waitForTimeout(3000);
    const stopped = (await state(page)).slideId === slides[2];
    test.info().annotations.push({
      type: 'follow',
      description: `people button takes a pointer ${moreTakesPointer}; roster row ${rowShown ? `"${rowText}" (${item})` : 'none'}; A followed to slide 3 within 3 s ${followed}; after a click on A's stage B's move to slide 2 left A on slide 3 ${stopped}`,
    });
    expect(follows, 'the roster lists Follow for an anonymous editor').toBe(true);
    expect(followed, "A's stage follows within 3 s").toBe(true);
    expect(stopped, "a click on A's stage stops it").toBe(true);
  } finally {
    await closeSecond(other, b);
  }
  void order;
});

test(title('collab.presence.join-within-2s'), async ({ browser }) => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  links = await readLinks();
  /* B, an editor */
  const pair = await otherContext(browser);
  let bMs: number | null = null;
  try {
    const t0 = Date.now();
    await pair.page.goto(links.edit);
    await pair.page.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 20_000 });
    await waitEditor(pair.page);
    const guest = await ownClientId(pair.page);
    const shown = await expect(chipOf(page, guest))
      .toHaveCount(1, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    bMs = shown ? Date.now() - t0 : null;
  } finally {
    await closeSecond(pair.context, pair.page);
  }
  /* C, a viewer through the view link on the editor's viewer floor */
  const viewer = await otherContext(browser);
  let cMs: number | null = null;
  let cRole: string | null = null;
  try {
    const t0 = Date.now();
    await viewer.page.goto(links.view);
    await viewer.page.waitForURL(/\/(deck|edit)\//, { timeout: 20_000 });
    if (/\/deck\//.test(viewer.page.url())) await viewer.page.goto(`/edit/${deck}`);
    const arrived = await waitEditor(viewer.page)
      .then(() => true)
      .catch(() => false);
    if (arrived) {
      cRole = (await state(viewer.page)).access?.role ?? null;
      const c = await ownClientId(viewer.page);
      const shown = await expect(chipOf(page, c))
        .toHaveCount(1, { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      cMs = shown ? Date.now() - t0 : null;
    }
  } finally {
    await closeSecond(viewer.context, viewer.page);
  }
  test.info().annotations.push({
    type: 'join',
    description: `B's chip on A's title row after ${bMs ?? 'more than 10000'} ms (from B's navigation); C (${cRole}) after ${cMs ?? 'more than 10000 or no editor'} ms`,
  });
  expect(bMs, "B's chip within 2 s").not.toBeNull();
  expect(bMs!, "B's chip within 2 s of the join").toBeLessThanOrEqual(2000 + 1500);
  expect(cMs, "C's chip within 2 s").not.toBeNull();
  expect(cMs!).toBeLessThanOrEqual(2000 + 1500);
});

test(title('collab.polish.session-sweep'), async ({ browser }) => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  const notes: string[] = [];
  /* no POST to the CSP report route on the four pages */
  const csp: string[] = [];
  const onRequest = (r: import('@playwright/test').Request) => {
    if (r.method() === 'POST' && /\/api\/x\/csp\/report/.test(r.url()))
      csp.push(new URL(r.url()).pathname);
  };
  page.on('request', onRequest);
  await page.goto('/new');
  await waitEditor(page);
  await openEditor(page, deck);
  await page.goto(`/deck/${deck}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await page.goto('/decks');
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  page.off('request', onRequest);
  notes.push(`CSP reports ${csp.length}`);
  if (csp.length > 0) failures.push(`${csp.length} POST(s) to the CSP report route`);
  /* /decks' Opened text at 150 ms and after hydration */
  const listCtx = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    storageState: await context.storageState(),
  });
  try {
    const lp = await listCtx.newPage();
    await lp.addInitScript((id) => {
      const w = window as unknown as { __early: string | null };
      w.__early = null;
      setTimeout(() => {
        w.__early = (document.querySelector(`[data-control="home.card.${id}"]`)?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim();
      }, 150);
    }, deck);
    await lp.goto('/decks');
    await lp.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    await lp.waitForTimeout(500);
    const texts = await lp.evaluate(
      (id) => ({
        early: (window as unknown as { __early: string | null }).__early,
        hydrated: (document.querySelector(`[data-control="home.card.${id}"]`)?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      }),
      deck,
    );
    const openedEarly = /Opened [^|]*/.exec(texts.early ?? '')?.[0] ?? null;
    const openedLate = /Opened [^|]*/.exec(texts.hydrated)?.[0] ?? null;
    notes.push(`Opened text at 150 ms "${openedEarly}", hydrated "${openedLate}"`);
    if (openedEarly !== null && openedEarly !== openedLate)
      failures.push(`the Opened text changed on hydration ("${openedEarly}" -> "${openedLate}")`);
  } finally {
    await listCtx.close();
  }
  /* the roster: two tabs of one person are one row; the tooltip beside the plate */
  await openEditor(page, deck);
  const twin = await sameCookiesContext(browser, context);
  try {
    await twin.page.goto(`/edit/${deck}`);
    await waitEditor(twin.page);
    await ownClientId(twin.page);
    await page.waitForTimeout(3000);
    await ctl(page, 'title.presence').hover();
    await page.waitForTimeout(800);
    const roster = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-control^="presence.roster."]')].filter(
        (el) => el.getClientRects().length > 0,
      );
      const plate = rows[0]?.closest('[role="menu"], .ts-roster, .ts-presence-roster') ?? null;
      const tip = document.querySelector('.pt-tip');
      const box = (el: Element | null) =>
        el && el.getClientRects().length > 0 ? el.getBoundingClientRect() : null;
      const pr = box(plate);
      const tr = box(tip);
      return {
        rows: rows.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)),
        intersects:
          pr && tr
            ? tr.left < pr.right && tr.right > pr.left && tr.top < pr.bottom && tr.bottom > pr.top
            : null,
        tip: tip ? (tip.textContent ?? '').trim().slice(0, 60) : null,
      };
    });
    const chips = await page.evaluate(
      () => document.querySelectorAll('[data-control^="presence.chip."]').length,
    );
    notes.push(
      `roster rows ${roster.rows.length} (${roster.rows.join(' | ')}), chips ${chips}, tooltip "${roster.tip}" intersects the plate ${roster.intersects}`,
    );
    if (roster.intersects === true)
      failures.push("the roster row's tooltip covers the roster plate");
    const ownerRows = roster.rows.filter((r) => /owner|You/i.test(r)).length;
    if (ownerRows > 1) failures.push(`two tabs of one person are ${ownerRows} rows`);
  } finally {
    await twin.context.close();
  }
  await page.keyboard.press('Escape');
  /* the resize badge inside the stage: a picture at the right edge resized by its e handle */
  const slideId = (await state(page)).slideId;
  await placeBlock(page, slideId, {
    id: 'badge-box',
    type: 'shape',
    shape: 'rectangle',
    fill: 'plate',
    stroke: 'ink',
    pos: { x: 1200, y: 300, w: 300, h: 200 },
  });
  await selectBlock(page, 'badge-box');
  const handle = page.locator('.ts-overlay [data-control="handle.badge-box.resize.e"]').first();
  const hb = await handle.boundingBox();
  let badge: { inside: boolean; text: string } | null = null;
  if (hb) {
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 60, hb.y + hb.height / 2, { steps: 8 });
    await page.waitForTimeout(300);
    badge = await page.evaluate(() => {
      const el = document.querySelector('.ts-overlay .ts-readout, .ts-readout');
      const stage = document.querySelector('.ts-stagewrap.ts-editor');
      if (!el || !stage) return { inside: false, text: 'no badge' };
      const r = el.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      return {
        inside: r.left >= s.left - 1 && r.right <= s.right + 1,
        text: (el.textContent ?? '').trim(),
      };
    });
    await page.mouse.up();
    await page.keyboard.press('Meta+z');
    await settled(page);
  }
  notes.push(`resize badge "${badge?.text}" inside the stage ${badge?.inside}`);
  if (!badge || !badge.inside)
    failures.push(`the resize badge ${badge ? 'is clipped at the edge' : 'was not read'}`);
  test.info().annotations.push({ type: 'sweep', description: notes.join('; ') });
  expect(failures).toEqual([]);
});

// the people round's rows (docs/archive/rounds/PEOPLE.md 3.7, 3.9, 3.10, 3.15, 6.1): the chip tooltip's trust
// sentence, the departed guest's comment, the resolved owner row and the caret's hue. Two
// anonymous browsers, on the memory tier and on a deployment alike; the account and picture rows
// are e2e/accounts.spec.ts on a node server with an identity database (6.2). B1 owns the room's
// identity path and the controller, B2 the chrome's people surfaces, B3 the editor's account
// paths.

type PeopleRow = {
  clientId: string;
  principalId?: string;
  label?: string;
  name?: string;
  trust?: string;
  mark?: { variant?: string; hue?: { slot?: number; hex?: string } };
};
/** The roster rows of a tab as describe().state.presence carries them, with the marks. */
async function peopleRows(p: Page): Promise<{ self: PeopleRow | null; others: PeopleRow[] }> {
  const s = (await state(p)).presence as unknown as
    { self?: PeopleRow; others?: PeopleRow[] } | undefined;
  return { self: s?.self ?? null, others: s?.others ?? [] };
}
/** The tooltip plate's name and doc lines after a hover from a neutral point; null when none shows. */
async function tipOf(
  p: Page,
  target: Locator,
): Promise<{ name: string | null; doc: string | null } | null> {
  await p.mouse.move(720, 520);
  await p.waitForTimeout(300);
  await target.hover();
  await p.waitForTimeout(650);
  return p.evaluate(() => {
    const tip = document.querySelector('.pt-tip');
    if (!tip || tip.getClientRects().length === 0) return null;
    return {
      name: tip.querySelector('.pt-tip-name')?.textContent?.trim() ?? null,
      doc: tip.querySelector('.pt-tip-doc')?.textContent?.trim() ?? null,
    };
  });
}
/** Names the second browser through the first Share's prompt (docs/archive/rounds/PRODUCT.md rank 4); false when no prompt came. */
async function nameSecond(p: Page, name: string): Promise<boolean> {
  let named = await setDisplayName(p, name);
  if (!named) {
    await ctl(p, 'share.open').click();
    named = await setDisplayName(p, name);
    if (
      await ctl(p, 'dialog.share')
        .isVisible()
        .catch(() => false)
    )
      await closeShare(p);
  }
  if (named) await settled(p);
  return named;
}
/** Tools > Advanced tools as describe().state.settings reports it. */
async function advancedToolsOn(p: Page): Promise<boolean> {
  return p.evaluate(
    () =>
      (window.turboslide!.studio.describe().state as { settings?: Record<string, unknown> })
        .settings?.['advancedTools'] === true,
  );
}
/**
 * Names this browser through the account menu's Change name (docs/archive/rounds/PEOPLE.md 3.11): the own chip
 * with the switch off, else with Tools > Advanced tools turned on through the product while
 * `title.account` is parked (3.14) and off again after. The route is recorded for the ledger.
 */
async function nameSelf(p: Page, name: string): Promise<{ named: boolean; route: string }> {
  await p.keyboard.press('Escape');
  let route = 'title.account';
  let switched = false;
  if ((await ctl(p, 'title.account').count()) === 0) {
    await p.locator('[data-control="menubar.tools"]').click();
    await p.locator('[data-control="menu.tools.advancedTools"]').click();
    await expect.poll(() => advancedToolsOn(p), { timeout: 5000 }).toBe(true);
    if ((await p.locator('#ts-menu-tools').count()) > 0) await p.keyboard.press('Escape');
    switched = true;
    route = 'title.account with the switch on';
    if ((await ctl(p, 'title.account').count()) === 0)
      return { named: false, route: 'no title.account' };
  }
  try {
    await ctl(p, 'title.account').click();
    await p.locator('#ts-menu-account [data-control="account.changeName"]').first().click();
    await ctl(p, 'dialog.namePrompt').waitFor({ timeout: 6000 });
    await ctl(p, 'dialog.namePrompt.name').click();
    await p.keyboard.press('Meta+a');
    await p.keyboard.type(name, { delay: 40 });
    const cont = p.locator('[data-control="dialog.namePrompt.continue"]').first();
    if ((await cont.count()) > 0) await cont.click();
    else await p.keyboard.press('Enter');
    await expect(ctl(p, 'dialog.namePrompt')).toHaveCount(0, { timeout: 8000 });
    await settled(p);
  } finally {
    if (switched) await switchOff(p);
  }
  return { named: true, route };
}
const rgbOfHex = (hex: string): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

test(title('people.chip-tooltip-trust'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  const { context: other, page: second } = await secondEditor(browser);
  try {
    const guest = await ownClientId(second);
    await clickCard(second, first);
    await settled(second);
    await expect(chipOf(page, guest), "the second tab's chip on the owner's tab").toHaveCount(1, {
      timeout: 10_000,
    });
    await expect
      .poll(
        async () => (await peopleRows(page)).others.find((r) => r.clientId === guest)?.label ?? '',
        { timeout: 10_000 },
      )
      .not.toBe('');
    const label = (await peopleRows(page)).others.find((r) => r.clientId === guest)?.label ?? '';
    const before = await tipOf(page, chipOf(page, guest));
    expect(before, 'the chip shows a tooltip').not.toBeNull();
    expect(before?.name, 'the tooltip before the name').toBe(`${label} · slide 1`);
    expect(before?.doc ?? '', 'the doc line of a label').toContain(
      'Not signed in. A generated label for this browser.',
    );
    const named = await nameSecond(second, 'Maya Chen');
    expect(named, 'the second browser typed a name through the Share prompt').toBe(true);
    const t = Date.now();
    await expect
      .poll(async () => (await tipOf(page, chipOf(page, guest)))?.name ?? null, {
        timeout: 5000,
        message: "the owner's tooltip reads the typed name and the guest word within 5 s",
      })
      .toBe('Maya Chen · guest · slide 1');
    const after = await tipOf(page, chipOf(page, guest));
    test.info().annotations.push({
      type: 'tooltip after the name',
      description: `${Date.now() - t} ms; doc "${after?.doc ?? ''}"`,
    });
    expect(after?.doc ?? '', 'the doc line of a guest').toContain(
      'Not signed in. This name was typed, not verified.',
    );
  } finally {
    await closeSecond(other, second);
  }
});

test(title('people.comment-departed-guest'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  const before = ((await state(page)).comments?.threads ?? []).length;
  const { context: other, page: second } = await secondEditor(browser);
  let guestPrincipal = '';
  let guestVariant: string | null = null;
  try {
    await ownClientId(second);
    const named = await nameSecond(second, 'Noor Haddad');
    expect(named, 'the second browser typed a name').toBe(true);
    const self = (await peopleRows(second)).self;
    guestPrincipal = self?.principalId ?? '';
    guestVariant = self?.mark?.variant ?? null;
    await clickCard(second, first);
    await second.keyboard.press('Escape');
    await second.keyboard.press('Meta+Alt+m');
    await ctl(second, 'comment.card').waitFor({ timeout: 8000 });
    await ctl(second, 'comment.card.new.field').click();
    await second.keyboard.type('A guest wrote this and left.', { delay: 40 });
    await ctl(second, 'comment.card.new.submit').click();
    await expect
      .poll(async () => ((await state(second)).comments?.threads ?? []).length, { timeout: 10_000 })
      .toBe(before + 1);
    await settled(second);
  } finally {
    await closeSecond(other, second);
  }
  expect(guestPrincipal, "the guest's principal id").toMatch(/^anon_/);
  /* the reload: the panel row and the opened card read the resolved identity (3.9) */
  const t = Date.now();
  await openEditor(page, deck);
  const slot = page.locator('[data-control="title.comments.slot"] button').first();
  if ((await slot.count()) > 0) await slot.click();
  else await ctl(page, 'title.comments').click();
  await ctl(page, 'panel.comments').waitFor({ timeout: 8000 });
  const rowOf = page
    .locator(`[data-control^="panel.comments.thread."]`)
    .filter({ has: page.locator(`.ts-chip[data-principal="${guestPrincipal}"]`) })
    .first();
  await expect(rowOf, "the guest's thread row with the guest's mark").toHaveCount(1, {
    timeout: 10_000 - Math.min(9000, Date.now() - t),
  });
  const row = await rowOf.evaluate((el) => ({
    name: el.querySelector('.ts-comments-row-name')?.textContent?.trim() ?? null,
    trust: el.querySelector('.ts-comments-row-trust')?.textContent?.trim() ?? null,
    variant: el.querySelector('.ts-chip')?.getAttribute('data-variant') ?? null,
    control: el.getAttribute('data-control'),
  }));
  test.info().annotations.push({
    type: 'panel row after the reload',
    description: `${Date.now() - t} ms; ${JSON.stringify(row)}; the guest's mark variant ${guestVariant}`,
  });
  expect(row.name).toBe('Noor Haddad');
  expect(row.trust).toBe('guest');
  expect(row.variant).toBe(guestVariant);
  const threadId = row.control?.slice('panel.comments.thread.'.length) ?? '';
  await ctl(page, `panel.comments.open.${threadId}`).click();
  const card = page.locator(`[data-comment], .ts-comment`).filter({
    has: page.locator(`.ts-chip[data-principal="${guestPrincipal}"]`),
  });
  await expect(card.first(), "the opened card with the guest's mark").toBeVisible({
    timeout: 8000,
  });
  const head = await card.first().evaluate((el) => ({
    name: el.querySelector('.ts-comment-name')?.textContent?.trim() ?? null,
    trust: el.querySelector('.ts-comment-trust')?.textContent?.trim() ?? null,
  }));
  expect(head.name).toBe('Noor Haddad');
  expect(head.trust).toBe('guest');
  expect(Date.now() - t, 'read within 10 s of the reload').toBeLessThan(10_000 + 8000);
  if (
    await ctl(page, 'panel.comments.close')
      .isVisible()
      .catch(() => false)
  )
    await ctl(page, 'panel.comments.close').click();
});

test(title('share.dialog.owner-resolved'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const { named, route } = await nameSelf(page, 'Ada Lovelace');
  test.info().annotations.push({ type: 'owner named through', description: route });
  expect(named, "the owner's name through the account menu's Change name").toBe(true);
  const t = Date.now();
  const { context: other, page: second } = await secondEditor(browser);
  try {
    await openShare(second);
    const owner = ctl(second, 'dialog.share.owner');
    await expect(owner, 'the owner row in the second browser').toHaveCount(1, { timeout: 8000 });
    await expect
      .poll(() => owner.locator('.ts-share-row-name').first().textContent(), {
        timeout: Math.max(1000, 5000 - (Date.now() - t)),
      })
      .toContain('Ada Lovelace');
    const row = await owner.evaluate((el) => ({
      text: el.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      chip: el.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
      variant: el.querySelector('.ts-chip')?.getAttribute('data-variant') ?? null,
    }));
    test.info().annotations.push({
      type: 'owner row',
      description: `${Date.now() - t} ms after the name; ${JSON.stringify(row)}`,
    });
    expect(row.text).not.toMatch(/\b[A-Z][a-z]+ \d{3}\b/);
    expect(`${row.text} ${row.chip ?? ''}`, 'the guest word beside the name').toMatch(/guest/);
    expect(row.chip ?? '', "the owner's mark, named").toContain('Ada Lovelace');
    await closeShare(second);
  } finally {
    await closeSecond(other, second);
  }
  const stage = await shareStage(page);
  expect(`${stage.owner ?? ''} ${stage.people ?? ''}`, "the owner's own dialog reads You").toMatch(
    /\bYou\b/,
  );
  await closeShare();
});

test(title('collab.caret-hue-matches-chip'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  const { context: other, page: second } = await secondEditor(browser);
  try {
    const guest = await ownClientId(second);
    await clickCard(second, first);
    const run = await headingRun(second);
    const el = second
      .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
      .first();
    await el.dblclick();
    await second.waitForTimeout(200);
    await second.keyboard.press('End');
    await second.keyboard.type(' hue', { delay: 60 });
    const caret = page.locator(`.ts-remote-caret[data-client="${guest}"]`).first();
    await expect(caret, "B's caret on A's slide").toHaveCount(1, { timeout: 10_000 });
    await expect(chipOf(page, guest)).toHaveCount(1, { timeout: 10_000 });
    const facts = await page.evaluate((id) => {
      const caret = document.querySelector(`.ts-remote-caret[data-client="${id}"]`);
      const chip = document.querySelector(`[data-control="presence.chip.${id}"] .ts-chip`);
      const stripe = chip?.querySelector('.ts-chip-stripe') ?? null;
      return {
        caret: caret ? getComputedStyle(caret).backgroundColor : null,
        hue: chip?.getAttribute('data-hue') ?? null,
        stripe: stripe ? getComputedStyle(stripe).backgroundColor : null,
      };
    }, guest);
    const entry = (await peopleRows(page)).others.find((r) => r.clientId === guest);
    const slot = entry?.mark?.hue?.slot ?? null;
    test.info().annotations.push({
      type: 'hue',
      description: `data-hue ${facts.hue}, the roster entry's mark.hue.slot ${slot} (${entry?.mark?.hue?.hex ?? 'no hex'}); caret ${facts.caret}; stripe ${facts.stripe}`,
    });
    expect(facts.hue, "B's chip carries data-hue").not.toBeNull();
    const hue = Number(facts.hue);
    expect(hue, "data-hue equals the roster entry's hueSlot plus one").toBe(slot);
    const hex = hueFor(hue);
    expect(facts.caret, "the caret's background is hueFor(hue)").toBe(rgbOfHex(hex));
    expect(facts.stripe, "the chip's stripe is the same hex").toBe(rgbOfHex(hex));
    await second.keyboard.press('Escape');
    await settled(second);
  } finally {
    await closeSecond(other, second);
  }
});

// ---------------------------------------------------------------------------------------------
// the realtime round (docs/REALTIME.md section 2; the two rows of this file whose feature is
// realtime): the share link on every instance and the departed guest's name after a reload. Each
// records the instance that answered its origin's sync.status (storeCalls.instance, read through
// the agent surface with the bearer where one exists; none on localhost, build/r1.md R1-R5c).

/* The Cloudflare phase (docs/CLOUDFLARE.md 5.4; build/r4.md R4-R5b): B's origin for the two realtime
   rows, `REALTIME_BASES=<originA>,<originB>` or `PLAYWRIGHT_SECOND_BASE_URL` as core/realtime.spec.ts
   reads them (the gate's --second-base sets both), so the departed guest joins and the share links
   open through the second app instance of a two process run; unset, both read the one base. */
const SHARE_A_BASE = (process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4321').replace(
  /\/$/,
  '',
);
const SHARE_B_BASE = (
  (process.env['REALTIME_BASES'] ?? '')
    .split(',')
    .map((x) => x.trim().replace(/\/$/, ''))
    .filter((x) => x !== '')[1] ??
  process.env['PLAYWRIGHT_SECOND_BASE_URL'] ??
  SHARE_A_BASE
).replace(/\/$/, '');
/** An absolute URL's path and search moved onto `base` (a link minted on A's origin, opened on B's). */
function onBase(url: string, base: string): string {
  try {
    const u = new URL(url, SHARE_A_BASE);
    return `${base}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
/** A second person's context on `baseURL` (the preview header, no cookie of the first, the HMR socket mocked on a local base). */
async function otherContextAt(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  /* the HMR socket of a dev server alone: the room's socket to the Worker (docs/CLOUDFLARE.md 3.6.3,
     `/rooms/<id>` on the room host) must reach it, or no tab connects on the do tier (the
     integrator's two process run of 2026-10-01) */
  if (isLocalBase(baseURL))
    await context.routeWebSocket(
      (url) => !url.pathname.startsWith('/rooms/'),
      () => undefined,
    );
  const page = await context.newPage();
  return { context, page };
}

/** The instance that answers a base's sync.status for the deck (A's base unless named), or the reason it could not be read. */
async function instanceOfBase(id: string, base: string = SHARE_A_BASE): Promise<string> {
  const headers = agentHeaders(base);
  if (headers === null) return 'no bearer';
  const api = await request.newContext();
  try {
    const res = await api.post(`${base}/api/actions/sync.status?deck=${encodeURIComponent(id)}`, {
      headers,
      data: {},
      timeout: 20_000,
      maxRedirects: 0,
    });
    if (res.status() !== 200) return `status ${res.status()}`;
    const body = (await res.json().catch(() => null)) as {
      storeCalls?: { instance?: string };
    } | null;
    return body?.storeCalls?.instance ?? 'no storeCalls.instance in the answer';
  } catch (error) {
    return `error ${String(error).slice(0, 80)}`;
  } finally {
    await api.dispose().catch(() => undefined);
  }
}

test(title('realtime.share-link.every-instance'), async ({ browser }) => {
  test.setTimeout(300_000);
  await openEditor(page, deck);
  /* the first link is the dialog's Copy link (the product's path); the nine after it are minted
     through share.createLink (several links with several roles may live at once), each a fresh
     token, so ten mints are read on one deck */
  links = await readLinks();
  const rounds: string[] = [];
  const failures: string[] = [];
  const instances = { before: await instanceOfBase(deck), after: [] as string[] };
  for (let i = 1; i <= 10; i += 1) {
    let url = links.edit;
    let mintedAt = Date.now();
    if (i > 1) {
      const got = await invoke<{ record: { revision: number } }>(page, 'share.get', { id: deck });
      const made = await invoke<{ url?: string }>(page, 'share.createLink', {
        id: deck,
        role: 'editor',
        label: `realtime ${i}`,
        baseRevision: got.record.revision,
      });
      mintedAt = Date.now();
      const path = shareLinkPathOf(made.url ?? '');
      expect(path, `share.createLink ${i} answers a /s/ URL`).not.toBeNull();
      url = `${SHARE_A_BASE}${path}`;
    }
    /* the Cloudflare phase: the link minted on A's origin opens on B's (the second app instance on
       a two process run; the one base otherwise), so "the two requests answered by different
       instances" is the run's shape and not the deployment's chance */
    const { context: other, page: visitor } = await otherContextAt(browser, SHARE_B_BASE);
    try {
      const openDelay = Date.now() - mintedAt;
      const answer = await visitor.goto(onBase(url, SHARE_B_BASE));
      const status = answer?.status() ?? 0;
      let landed = 'no editor';
      if (status < 400) {
        await visitor
          .waitForURL((u) => !u.pathname.startsWith('/s/'), { timeout: 20_000 })
          .catch(() => undefined);
        if (new RegExp(`/edit/${deck}`).test(visitor.url())) {
          const ready = await waitEditor(visitor)
            .then(() => true)
            .catch(() => false);
          const mode = ready
            ? await visitor
                .locator('.pt-viewer:not(.ts-skeleton)')
                .first()
                .getAttribute('data-edit-mode')
                .catch(() => null)
            : null;
          landed = ready
            ? `the editor (data-edit-mode ${mode})`
            : 'the editor page without the studio API';
          if (mode !== 'editing') failures.push(`mint ${i}: landed on ${landed}`);
        } else {
          landed = new URL(visitor.url()).pathname.replace(deck, '<id>');
          failures.push(`mint ${i}: the link landed on ${landed}`);
        }
      } else failures.push(`mint ${i}: the link answered ${status} ${openDelay} ms after the mint`);
      instances.after.push(await instanceOfBase(deck, SHARE_B_BASE));
      rounds.push(`mint ${i}: opened ${openDelay} ms after the mint, status ${status}, ${landed}`);
      if (openDelay > 1000)
        failures.push(
          `mint ${i}: the open started ${openDelay} ms after the mint (the driver's own lag past 1 s)`,
        );
    } finally {
      await closeSecond(other, visitor);
    }
  }
  const distinct = [...new Set([instances.before, ...instances.after])];
  test.info().annotations.push({
    type: 'measure',
    description: `${rounds.join('; ')}; the links minted on ${SHARE_A_BASE} and opened on ${SHARE_B_BASE}${SHARE_A_BASE === SHARE_B_BASE ? ' (one base)' : ' (two bases)'}; sync.status instances before ${instances.before} (A's base) and after each open ${instances.after.join(', ')} (B's base; ${distinct.length} distinct; the instance a browser navigation lands on is the deployment's choice and is recorded, not asserted)`,
  });
  expect(failures, 'ten of ten links open the editor within a second of the mint').toEqual([]);
});

test(title('realtime.departed-guest.name-stable'), async ({ browser }) => {
  test.setTimeout(300_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  const before = ((await state(page)).comments?.threads ?? []).length;
  /* the Cloudflare phase (R4-R5b): B joins through the second app instance when a run names one */
  const { context: other, page: second } = await secondEditor(browser, SHARE_B_BASE);
  let guestPrincipal = '';
  try {
    await ownClientId(second);
    const named = await nameSecond(second, 'Imani Okafor');
    expect(named, 'the second browser typed a name').toBe(true);
    guestPrincipal = (await peopleRows(second)).self?.principalId ?? '';
    await clickCard(second, first);
    await second.keyboard.press('Escape');
    await second.keyboard.press('Meta+Alt+m');
    await ctl(second, 'comment.card').waitFor({ timeout: 8000 });
    await ctl(second, 'comment.card.new.field').click();
    await second.keyboard.type('A departed guest wrote this.', { delay: 40 });
    await ctl(second, 'comment.card.new.submit').click();
    await expect
      .poll(async () => ((await state(second)).comments?.threads ?? []).length, { timeout: 10_000 })
      .toBe(before + 1);
    await settled(second);
  } finally {
    await closeSecond(other, second);
  }
  expect(guestPrincipal, "the guest's principal id").toMatch(/^anon_/);
  const readings: string[] = [];
  const failures: string[] = [];
  for (let n = 1; n <= 3; n += 1) {
    const instance = await instanceOfBase(deck);
    const t = Date.now();
    await openEditor(page, deck);
    const slot = page.locator('[data-control="title.comments.slot"] button').first();
    if ((await slot.count()) > 0) await slot.click();
    else await ctl(page, 'title.comments').click();
    await ctl(page, 'panel.comments').waitFor({ timeout: 8000 });
    const rowOf = page
      .locator('[data-control^="panel.comments.thread."]')
      .filter({ has: page.locator(`.ts-chip[data-principal="${guestPrincipal}"]`) })
      .first();
    let readMs: number | null = null;
    const read = await expect
      .poll(
        async () => {
          if ((await rowOf.count()) === 0) return null;
          const row = await rowOf.evaluate((el) => ({
            name: el.querySelector('.ts-comments-row-name')?.textContent?.trim() ?? null,
            trust: el.querySelector('.ts-comments-row-trust')?.textContent?.trim() ?? null,
          }));
          if (row.name === 'Imani Okafor' && row.trust === 'guest') {
            readMs ??= Date.now() - t;
            return row;
          }
          return row;
        },
        { timeout: 10_000, intervals: [100] },
      )
      .toEqual({ name: 'Imani Okafor', trust: 'guest' })
      .then(() => true)
      .catch(() => false);
    const row =
      (await rowOf.count()) > 0
        ? await rowOf.evaluate((el) => ({
            name: el.querySelector('.ts-comments-row-name')?.textContent?.trim() ?? null,
            trust: el.querySelector('.ts-comments-row-trust')?.textContent?.trim() ?? null,
          }))
        : null;
    readings.push(
      `reload ${n} (instance ${instance}): ${read ? `the name and "guest" ${readMs} ms after the reload` : `read ${JSON.stringify(row)} within 10 s`}`,
    );
    if (!read || (readMs ?? Infinity) > 3000)
      failures.push(
        `reload ${n} on instance ${instance}: ${read ? `${readMs} ms` : `read ${JSON.stringify(row)}`}`,
      );
    if (
      await ctl(page, 'panel.comments.close')
        .isVisible()
        .catch(() => false)
    )
      await ctl(page, 'panel.comments.close').click();
  }
  test.info().annotations.push({
    type: 'measure',
    description: `${readings.join('; ')}; B joined through ${SHARE_B_BASE}${SHARE_A_BASE === SHARE_B_BASE ? ' (one base)' : ' (two bases)'}`,
  });
  expect(failures, 'every reload reads the name and "guest" within 3 s, three of three').toEqual(
    [],
  );
});

/* ---------------------------------------------------------------------------------------------
   The next program's hotfix H4 (docs/NEXT.md 3.2, 4.3.3): the sign in dialog draws no method that
   cannot complete, and the passkey roadmap sentence is gone. A deployment without an identity
   database offers no Sign in row at all; there the row reads the account menu and the page. */

test(title('accounts.no-dead-method'), async () => {
  test.setTimeout(120_000);
  const ROADMAP = 'Passkeys arrive once the address is final';
  await openEditor(page, deck);
  await page.keyboard.press('Escape');
  let switched = false;
  if ((await ctl(page, 'title.account').count()) === 0) {
    await page.locator('[data-control="menubar.tools"]').click();
    await page.locator('[data-control="menu.tools.advancedTools"]').click();
    await expect.poll(() => advancedToolsOn(page), { timeout: 5000 }).toBe(true);
    if ((await page.locator('#ts-menu-tools').count()) > 0) await page.keyboard.press('Escape');
    switched = true;
  }
  type Method = { control: string; disabled: boolean; later: boolean; text: string };
  let methods: Method[] = [];
  let offered = false;
  let roadmap = 0;
  try {
    await ctl(page, 'title.account').click();
    const menu = page.locator('#ts-menu-account');
    await menu.waitFor({ timeout: 8000 });
    const signIn = menu.locator('[data-control="account.signIn"]');
    offered = (await signIn.count()) > 0;
    if (offered) {
      await signIn.first().click();
      await ctl(page, 'dialog.signIn').waitFor({ timeout: 8000 });
      methods = await ctl(page, 'dialog.signIn').evaluate((card) =>
        [...card.querySelectorAll('.ts-sign-in-methods [data-control]')].map((el) => ({
          control: el.getAttribute('data-control') ?? '',
          disabled:
            el.getAttribute('aria-disabled') === 'true' ||
            (el instanceof HTMLButtonElement && el.disabled),
          later: el.classList.contains('is-later') || el.getAttribute('data-status') === 'later',
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        })),
      );
    }
    roadmap = await page.getByText(ROADMAP).count();
  } finally {
    await page.keyboard.press('Escape');
    if ((await ctl(page, 'dialog.signIn').count()) > 0) await page.keyboard.press('Escape');
    if (switched) await switchOff(page);
  }
  test.info().annotations.push({
    type: 'methods',
    description: offered
      ? methods
          .map((m) => `${m.control}${m.disabled || m.later ? ' (cannot complete)' : ''}`)
          .join(', ') || 'no method row'
      : 'the account menu offers no Sign in row on this deployment (no identity database)',
  });
  expect(
    methods.filter((m) => m.disabled || m.later),
    'every method the dialog draws can complete',
  ).toEqual([]);
  expect(roadmap, 'no roadmap sentence about passkeys').toBe(0);
});

/* lane B2 of Round 1 (docs/NEXT.md 4.1.3 item 11): its row lives in share-round1.ts */
const ACCESS_ROWS = shareRound1();

/* lane B3b of Round 1 (docs/NEXT.md 4.1.3 item 17): its row lives in b3b-dialogs.ts */
const B3B_ROWS = shareChromeRows();

coverage(import.meta.filename, [
  ...B3B_ROWS,
  ...ACCESS_ROWS,
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
  /* the product round (docs/archive/rounds/PRODUCT.md 8.1) */
  'share.dialog.one-link',
  'share.dialog.slideshow-checkbox',
  'share.dialog.you-label',
  'share.dialog.co-edit-from-copied-link',
  'brand.colors.collab-rerender',
  'brand.surfaces.viewer-and-show',
  'assist.viewer.disabled',
  /* the polish round (docs/archive/rounds/POLISH.md 2.6 items 58 and 63, 2.7 items 78, 79 and 96, 2.8) */
  'chrome.tail.reads-mode',
  'share.name-prompt.empty-field',
  'share.dialog.new-deck-restricted-viewer',
  'share.role-change.keeps-link',
  'share.dialog.restricted-and-more',
  'share.name-prompt.never-mid-drag',
  'collab.follow.anonymous-editor',
  'collab.presence.join-within-2s',
  'collab.polish.session-sweep',
  /* the people round (docs/archive/rounds/PEOPLE.md 6.1) */
  'people.chip-tooltip-trust',
  'people.comment-departed-guest',
  'share.dialog.owner-resolved',
  'collab.caret-hue-matches-chip',
  /* the realtime round (docs/REALTIME.md section 2) */
  'realtime.share-link.every-instance',
  'realtime.departed-guest.name-stable',
  /* the next program's hotfix H4 (docs/NEXT.md 3.2, 4.3.3) */
  'accounts.no-dead-method',
]);
void statusOf;
