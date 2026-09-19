import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  OIDC,
  Scratch,
  clickCard,
  coverage,
  ctl,
  deleteForever,
  extraHTTPHeaders,
  invoke,
  menuPath,
  newDeck,
  openEditor,
  ownerContext,
  settled,
  slideJson,
  slideOrder,
  state,
  statusOf,
  teardownAll,
  title,
  typeNote,
  waitEditor,
} from './lib';

// Decks and the home surfaces, the spec rows (docs/FOCUS.md 2.1, 6.4 `decks.*` with the driver
// core/decks.spec.ts): /home and its calls to action, the root redirect, the /decks list, its
// search and its three ways into the editor, the card menu with its seven rows, Rename from the
// card and from the list view row, Make a copy, Open in new tab, Present, Move to trash with
// Undo, the GT brand deck copy, the trash page with Restore and Delete forever (Cancel, the
// button, Enter), Back and Forward, the You need access pages, Not found, File > Make a copy with
// Remove speaker notes, and the card's Download. One context for the file (one principal); every
// deck it makes is torn down at the end. The return round (docs/RETURN.md section 5) adds File >
// New > From template gallery, File > Open > Upload with a bundle, File > Import slides > Upload
// with a bundle, and Help > Help Turboslide improve; a row still parked on this build is reached
// with Tools > Advanced tools on and the switch goes back after it. The deck an upload makes (the
// Upload tab of Open and of Import slides) is known from the upload route's answer (`deckId` of
// POST /api/decks/bundle), never from a listing (the blob tier's listing lags a fresh deck by up
// to a minute: VERIFICATION.md R1-F2, where run 1 never registered the Import slides copy), is
// registered for teardown at that answer, and leaves at the end of its row through the window API
// from its own editor (deck.trash, then deck.remove with confirm), proven by a 404 on /edit/<id>
// and its absence from deck.list; the row asserts that its uploader could, the way an uploaded
// file in Google Slides is the uploader's. When the product refuses and the environment carries
// TURBOSLIDE_TOKEN (the deployment's bootstrap bearer, the gate operator's, never printed), the
// refused copy is removed with it through POST /api/actions so the store the preview shares with
// production keeps no scratch deck; the row is red either way and names the copy.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/decks.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';
let deckName = 'Northwind renewal v2';

test.beforeAll(async ({ browser }) => {
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Northwind renewal');
  await menuPath(page, 'file', 'file.rename');
  await page.locator('input[data-control="deck.name"]').waitFor({ timeout: 6000 });
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(deckName, { delay: 40 });
  await page.keyboard.press('Enter');
  await settled(page);
});
test.afterAll(async () => {
  /* the teardown runs past a failed row and past the file's own test timeout, so no scratch deck
     is left behind (VERIFICATION.md C2-F29) */
  test.setTimeout(300_000);
  try {
    /* an upload's deck whose row failed before its own teardown leaves here the same way; one
       no path removed is named by the soft assertion, and the file's own decks still leave */
    const left = await removeLeftoverUploads();
    expect
      .soft(left, "every upload's deck is removed by its uploader, or by the bearer when set")
      .toEqual([]);
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

async function gotoDecks(p: Page = page): Promise<void> {
  await p.goto('/decks');
  await p.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
}
async function gotoTrash(p: Page = page): Promise<void> {
  await p.goto('/decks/trash');
  await p.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
    timeout: 30_000,
  });
}
async function openCardMenu(id: string, p: Page = page) {
  await ctl(p, `home.more.${id}`).click();
  const menu = p.locator('#home-card-menu[role="menu"]');
  await expect(menu).toBeVisible();
  return menu;
}
async function cardMenuRow(id: string, label: RegExp, p: Page = page): Promise<void> {
  const menu = await openCardMenu(id, p);
  await menu.locator('[role="menuitem"]', { hasText: label }).first().click();
}
type ListedDeck = { id: string; revision: number };
/** The rows of a deck.list answer, whatever shape the transport gives them. */
function rowsOf(list: unknown): ListedDeck[] {
  if (Array.isArray(list)) return list as ListedDeck[];
  const shaped = (list ?? {}) as { decks?: ListedDeck[]; items?: ListedDeck[] };
  return shaped.decks ?? shaped.items ?? [];
}
/**
 * The ids of this studio's decks through deck.list (the Open and Import slides dialogs' source;
 * here the proof that a removed upload left the list).
 */
async function deckIds(p: Page = page): Promise<string[]> {
  return rowsOf(await invoke(p, 'deck.list', {})).map((r) => r.id);
}
async function trashFromEditor(id: string): Promise<void> {
  await openEditor(page, id);
  await page.keyboard.press('Escape');
  await menuPath(page, 'file', 'file.moveToTrash');
  await page.waitForURL(/\/decks/, { timeout: 20_000 });
}

test(title('decks.home.new-presentation'), async () => {
  await page.goto('/home');
  /* /home carries speculation rules that prerender /new on a hover (routes/home.tsx). The
     prerender is the browser's own request and carries none of Playwright's headers, so on a
     preview behind Vercel Authentication it is answered with the SSO redirect, and the click
     then lands on vercel.com/login from the prefetch cache (VERIFICATION.md F15; the b4 repros
     home-hero: a context route neither adds the header to it nor aborts it, and
     --disable-features=Prerender2 leaves the prefetch). On a preview alone the rules are
     removed before the click; production and localhost keep them, as a person's browser does. */
  if (OIDC)
    await page.evaluate(() => {
      for (const rules of document.querySelectorAll('script[type="speculationrules"]'))
        rules.remove();
    });
  const hero = page.locator('main a[href="/new"]', { hasText: /New Presentation/i }).first();
  await hero.click();
  await page.waitForURL(/\/new/, { timeout: 20_000 });
  await waitEditor(page);
  const s = await state(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  expect(s.revision).toBe(0);
  expect(info.id).toMatch(/^untitled-/);
});

test(title('decks.home.your-presentations'), async () => {
  await page.goto('/home');
  await page
    .locator('a[href="/decks"]', { hasText: /Your presentations/i })
    .first()
    .click();
  await page.waitForURL(/\/decks/, { timeout: 20_000 });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
});

test(title('decks.root.redirect'), async () => {
  const res = await page.request.get('/', { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()['location']).toMatch(/\/new$/);
  await page.goto('/');
  await page.waitForURL(/\/new/, { timeout: 20_000 });
  await waitEditor(page);
  expect((await state(page)).revision).toBe(0);
});

test(title('decks.list.read'), async () => {
  await gotoDecks();
  await expect(ctl(page, 'home.blank')).toContainText('Blank presentation');
  await expect(ctl(page, 'home.gt-brand')).toContainText('GT brand deck');
  await expect(ctl(page, 'home.recent')).toBeVisible();
  await expect(ctl(page, 'home.cards')).toBeVisible();
  await expect(ctl(page, `home.card.${deck}`)).toBeVisible();
});

test(title('decks.list.search'), async () => {
  await gotoDecks();
  const search = ctl(page, 'home.search');
  await search.fill(deckName);
  await expect(ctl(page, `home.card.${deck}`)).toBeVisible();
  await search.fill('nothing like this at all');
  await expect(ctl(page, 'home.empty')).toBeVisible();
  await search.fill('');
  await expect(ctl(page, `home.card.${deck}`)).toBeVisible();
});

for (const [id, control] of [
  ['decks.list.open-thumbnail', 'home.open'],
  ['decks.list.open-title', 'home.title'],
  ['decks.list.open-recent', 'home.recent.open'],
] as const) {
  test(title(id), async () => {
    await gotoDecks();
    const target = ctl(page, `${control}.${deck}`);
    await expect(target).toBeVisible();
    await target.click();
    await page.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 20_000 });
    await waitEditor(page);
    await page.goBack();
    await page.waitForURL(/\/decks$/, { timeout: 20_000 });
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  });
}

test(title('decks.card.menu-open-escape'), async () => {
  await gotoDecks();
  const menu = await openCardMenu(deck);
  const rows = (await menu.locator('[role="menuitem"]').allTextContents()).map((s) => s.trim());
  expect(rows).toEqual([
    'Open',
    'Open in new tab',
    'Present',
    'Rename',
    'Make a copy',
    'Download',
    'Move to trash',
  ]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#home-card-menu')).toHaveCount(0);
  await expect(ctl(page, `home.more.${deck}`)).toBeFocused();
});

test(title('decks.card.rename-enter'), async () => {
  test.setTimeout(90_000);
  /* the deck just edited: a write in the editor, then the card */
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await typeNote(page, 'A note before the rename.');
  void first;
  await gotoDecks();
  await cardMenuRow(deck, /^Rename$/);
  const field = ctl(page, `home.rename.${deck}`);
  await field.waitFor({ timeout: 6000 });
  deckName = 'Northwind renewal v3';
  await field.fill(deckName);
  await page.keyboard.press('Enter');
  await expect(ctl(page, `home.title.${deck}`)).toHaveText(deckName, { timeout: 5000 });
  await page.waitForTimeout(500);
  await gotoDecks();
  await expect(ctl(page, `home.title.${deck}`), 'the store has the name').toHaveText(deckName, {
    timeout: 5000,
  });
});

test(title('decks.card.rename-escape'), async () => {
  await gotoDecks();
  const before = (await ctl(page, `home.title.${deck}`).textContent())?.trim();
  await cardMenuRow(deck, /^Rename$/);
  const field = ctl(page, `home.rename.${deck}`);
  await field.waitFor({ timeout: 6000 });
  await field.fill('Thrown away');
  await page.keyboard.press('Escape');
  await expect(ctl(page, `home.title.${deck}`)).toHaveText(before ?? '');
});

test(title('decks.row.rename-enter'), async () => {
  test.setTimeout(90_000);
  await gotoDecks();
  await ctl(page, 'home.view.list').click();
  await expect(ctl(page, 'home.rows')).toBeVisible();
  await cardMenuRow(deck, /^Rename$/);
  const field = ctl(page, `home.rename.${deck}`);
  await field.waitFor({ timeout: 6000 });
  deckName = 'Northwind renewal v4';
  await field.fill(deckName);
  await page.keyboard.press('Enter');
  await expect(
    page.locator(`[data-control="home.rows"] [data-control="home.title.${deck}"]`),
  ).toHaveText(deckName, { timeout: 5000 });
  await gotoDecks();
  await ctl(page, 'home.view.list').click();
  await expect(
    page.locator(`[data-control="home.rows"] [data-control="home.title.${deck}"]`),
    'the store has the name',
  ).toHaveText(deckName, { timeout: 5000 });
  await ctl(page, 'home.view.grid').click();
});

test(title('decks.card.make-a-copy'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await typeNote(page, ' And a word.');
  await gotoDecks();
  await cardMenuRow(deck, /^Make a copy$/);
  const dialog = page.locator('[data-control="home.copy"][role="dialog"]');
  await expect(dialog).toBeVisible();
  const opened = context.waitForEvent('page', { timeout: 30_000 });
  const t0 = Date.now();
  await ctl(page, 'home.copy.ok').click();
  const copyPage = await opened;
  await copyPage.waitForURL(/\/edit\//, { timeout: 30_000 });
  const copyId = copyPage.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? '';
  scratch.add(copyId);
  await waitEditor(copyPage);
  const openedMs = Date.now() - t0;
  expect(openedMs, 'the copy opens in a new tab within 30 s').toBeLessThan(30_000);
  await copyPage.close();
  /* the copy's card on /decks. The list is the store's `deck.list`; on the blob tier that is the
     folder listing of `decks/` joined with the mirrors the answering instance holds
     (packages/store/src/blob-store.ts `deckIds`): the instance that made the copy lists it at
     once, another instance only once the folder listing shows it, which lags the store by up to a
     minute (the note on `pull`). The bound follows that mechanism: the page is reloaded every
     3 s to 65 s and the time the card took is recorded, so the ship note reads the listing's lag
     and not a 10 s guess (VERIFICATION.md R2-F2: one red of three on the preview at 10 s). On the
     memory and file tiers one instance answers and the card is on the first load. */
  const t1 = Date.now();
  let listedMs: number | null = null;
  for (;;) {
    await gotoDecks();
    if (
      await ctl(page, `home.card.${copyId}`)
        .isVisible()
        .catch(() => false)
    ) {
      listedMs = Date.now() - t1;
      break;
    }
    if (Date.now() - t1 > 65_000) break;
    await page.waitForTimeout(3000);
  }
  test.info().annotations.push({
    type: 'listing',
    description: `the copy opened in ${openedMs} ms; its card was listed on /decks after ${listedMs ?? 'more than 65000'} ms`,
  });
  expect(
    listedMs,
    `the copy ${copyId} is listed on /decks within 65 s (the blob tier's folder listing lags a fresh deck by up to a minute on an instance that did not make it; the card was ${listedMs === null ? 'not listed within 65 s' : `listed after ${listedMs} ms`})`,
  ).not.toBeNull();
});

test(title('decks.card.open-in-new-tab'), async () => {
  await gotoDecks();
  const opened = context.waitForEvent('page', { timeout: 20_000 });
  await cardMenuRow(deck, /^Open in new tab$/);
  const tab = await opened;
  await tab.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 20_000 });
  await waitEditor(tab);
  expect(page.url()).toMatch(/\/decks$/);
  await tab.close();
});

test(title('decks.card.present'), async () => {
  await gotoDecks();
  const opened = context.waitForEvent('page', { timeout: 20_000 });
  await cardMenuRow(deck, /^Present$/);
  const tab = await opened;
  await tab.waitForURL(new RegExp(`/deck/${deck}\\?present=1`), { timeout: 20_000 });
  await expect(tab.locator('[data-control="present.show"], .ts-slideshow').first()).toBeAttached({
    timeout: 20_000,
  });
  await tab.close();
});

test(title('decks.card.move-to-trash-undo'), async () => {
  await gotoDecks();
  await cardMenuRow(deck, /^Move to trash$/);
  await expect(ctl(page, `home.card.${deck}`)).toHaveCount(0);
  await ctl(page, 'snackbar.action').click();
  await expect(ctl(page, `home.card.${deck}`)).toBeVisible({ timeout: 10_000 });
});

test(title('decks.list.gt-brand-deck'), async () => {
  test.setTimeout(120_000);
  await gotoDecks();
  const t = Date.now();
  await ctl(page, 'home.gt-brand').click();
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await waitEditor(page);
  const id = page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? '';
  expect(id).not.toBe('gt-brand');
  scratch.add(id);
  const slides = await slideOrder(page);
  expect(Date.now() - t, 'within 15 s').toBeLessThan(15_000);
  expect(slides.length).toBe(85);
});

test(title('decks.card.download'), async () => {
  test.setTimeout(90_000);
  await gotoDecks();
  /* the row's Download mints a ticket and clicks a one time anchor for
     /api/decks/<id>/bundle?t=<ticket> (routes/decks.index.tsx triggerDownload). On production
     and on localhost the browser's download arrives and its bytes are read. A preview behind
     Vercel Authentication answers that navigation with the SSO redirect: a download the browser
     starts from an anchor carries neither Playwright's extraHTTPHeaders nor a page.route header
     (VERIFICATION.md F13, the b4 repro download-route), so there the URL the page's own click
     started is read from the request and fetched with the OIDC header through the API context. */
  /* the ticket the row minted, read from the server function's own answer (a navigation that
     becomes a download emits no request or response event in Playwright) */
  const bundleUrl = new RegExp(`/api/decks/${deck}/bundle\\?[^"\\\\\\s]+`);
  const answers = serverFnAnswers(page);
  const ticket = page
    .waitForResponse(
      async (r) =>
        r.url().includes('/_serverFn/') && bundleUrl.test(await r.text().catch(() => '')),
      { timeout: 30_000 },
    )
    .then(async (r) => (await r.text()).match(bundleUrl)?.[0] ?? null)
    .catch(() => null);
  const t = Date.now();
  const started = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
  await cardMenuRow(deck, /^Download$/);
  const url = await ticket;
  expect(
    url,
    `the card menu mints the bundle ticket and starts the download (the server functions answered: ${answers.stop()})`,
  ).not.toBeNull();
  expect(Date.now() - t).toBeLessThan(30_000);
  const arrived = await Promise.race([
    started,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), OIDC ? 8000 : 30_000)),
  ]);
  if (arrived) {
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync(await arrived.path());
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    return;
  }
  expect(OIDC, 'the download arrives where no authentication wall stands').toBeTruthy();
  const res = await page.request.get(url!, { headers: extraHTTPHeaders });
  expect(res.status()).toBe(200);
  const bytes = await res.body();
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  /* the wall answered the browser's own download navigation with its login page; back to the list */
  if (!page.url().startsWith(new URL(page.url()).origin) || /vercel\.com/.test(page.url()))
    await gotoDecks();
});

test(title('decks.file.make-a-copy'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  /* the row's own setup: a note on the first slide, read back from the slide before the copy
     (the note pane writes slide.set /notes after a 400 ms pause or on blur; Escape blurs it) */
  await typeNote(page, 'A note the copy leaves out.');
  await expect
    .poll(async () => String((await slideJson(page, first))['notes'] ?? ''), {
      timeout: 10_000,
    })
    .toContain('A note the copy leaves out.');
  await menuPath(page, 'file', 'file.makeCopy', 'file.makeCopy.entire');
  await ctl(page, 'dialog.makeCopy').waitFor({ timeout: 8000 });
  const remove = ctl(page, 'dialog.makeCopy.removeNotes');
  const input = remove.locator('input').first();
  const target = (await input.count()) > 0 ? input : remove;
  if (!(await target.isChecked().catch(() => false))) await target.click({ force: true });
  /* a name of its own: the dialog's default "Copy of <name>" is the name the card's Make a copy
     row already used in this file, and a second copy under it is refused ("… exists already;
     pick another name", the local gate run of the fix round) */
  const nameField = ctl(page, 'dialog.makeCopy.name');
  await nameField.click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(`${deckName} without notes`, { delay: 40 });
  const opened = context.waitForEvent('page', { timeout: 30_000 });
  await ctl(page, 'dialog.makeCopy.ok').click();
  /* the dialog opens a blank tab on the click and points it at the copy once deck.copy answers;
     a refused copy closes that tab and shows the refusal in the dialog (MakeCopy.tsx `run`), so a
     tab that closes is read together with the dialog's sentence rather than as a closed target */
  const copyPage = await opened;
  const landed = await copyPage
    .waitForURL(/\/edit\//, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!landed) {
    const alert = page
      .locator('[data-control="dialog.makeCopy"] [role="alert"], .ts-dialog-error-row')
      .first();
    const refusal = (await alert.count()) > 0 ? await alert.textContent() : null;
    expect(
      landed,
      `the copy opens in the new tab; the dialog says ${JSON.stringify(refusal)} and the tab is ${copyPage.isClosed() ? 'closed' : copyPage.url()}`,
    ).toBe(true);
  }
  const copyId = copyPage.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? '';
  scratch.add(copyId);
  await waitEditor(copyPage);
  const copyFirst = (await slideOrder(copyPage))[0]!;
  const copied = await slideJson(copyPage, copyFirst);
  expect(String(copied['notes'] ?? ''), 'the copy has no notes').toBe('');
  await copyPage.close();
  await gotoDecks();
  await expect(ctl(page, `home.card.${copyId}`)).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------------------------
// the return round's rows (docs/RETURN.md 2.17, section 5)

/** Turns Tools > Advanced tools on when a menubar row is absent; answers whether it switched. */
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
  expect(await present(), `${rowIds[rowIds.length - 1]} is drawn with the switch on`).toBe(true);
  return true;
}
async function switchOff(p: Page): Promise<void> {
  if ((await state(p)).settings?.['advancedTools'] === true)
    await menuPath(p, 'tools', 'tools.advancedTools');
}
/**
 * Records every server function answer a page receives while a row mints a ticket, so a ticket
 * that never comes is named by what the server said (a quota refusal, `authorizeExport` in
 * server/download.ts, answers the function's error and not the bundle address; VERIFICATION.md
 * R2-F10 read "the bundle ticket" null once in a run that shared one identity between two files
 * and could not say why). `stop()` returns the answers and detaches the listener.
 */
function serverFnAnswers(p: Page): { stop: () => string } {
  const answers: string[] = [];
  const onResponse = (r: import('@playwright/test').Response) => {
    if (!r.url().includes('/_serverFn/')) return;
    void r
      .text()
      .then((text) => {
        answers.push(`${r.status()} ${text.replace(/\s+/g, ' ').slice(0, 240)}`);
      })
      .catch(() => undefined);
  };
  p.on('response', onResponse);
  return {
    stop: () => {
      p.off('response', onResponse);
      return answers.length > 0 ? answers.join(' | ') : 'no server function answered';
    },
  };
}

/** The deck's bundle, downloaded from the card menu (the product's own transfer file). */
async function bundleBytes(p: Page, id: string): Promise<Buffer> {
  await gotoDecks(p);
  const started = p.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
  const bundleUrl = new RegExp(`/api/decks/${id}/bundle\\?[^"\\\\\\s]+`);
  const answers = serverFnAnswers(p);
  const ticket = p
    .waitForResponse(
      async (r) =>
        r.url().includes('/_serverFn/') && bundleUrl.test(await r.text().catch(() => '')),
      { timeout: 30_000 },
    )
    .then(async (r) => (await r.text()).match(bundleUrl)?.[0] ?? null)
    .catch(() => null);
  await cardMenuRow(id, /^Download$/, p);
  const arrived = await Promise.race([
    started,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), OIDC ? 8000 : 30_000)),
  ]);
  if (arrived) {
    answers.stop();
    const { readFileSync } = await import('node:fs');
    return readFileSync(await arrived.path());
  }
  const url = await ticket;
  expect(
    url,
    `the bundle ticket (the server functions answered: ${answers.stop()})`,
  ).not.toBeNull();
  const res = await p.request.get(url!, { headers: extraHTTPHeaders });
  expect(res.status()).toBe(200);
  return res.body();
}

/** The decks the two upload rows made, by the route's answer; each leaves at the end of its row. */
const uploads = new Set<string>();
type UploadAnswer = { id: string; status: number; error: string };

/**
 * The upload route's answer to the dialog's POST (EditorRoot.tsx `uploadBundleFile`), armed
 * before the file goes to the input: the new deck's id from the 201's `location` header
 * (`/edit/<id>`, read at the response event), else from its JSON. The header comes first because
 * the Open dialog navigates to the new deck as soon as the answer lands, and a body is not
 * readable once its frame has navigated (the first local run of this fix read status 201 and no
 * id). The id is never read from a listing: the blob tier's listing lags a fresh deck by up to a
 * minute (VERIFICATION.md R1-F2: in run 1 the Import slides copy was not in the `deck.list` diff,
 * was never registered and stayed on the store).
 */
function uploadAnswer(p: Page): Promise<UploadAnswer> {
  const answer = p
    .waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/decks/bundle',
      { timeout: 60_000 },
    )
    .then(async (r) => {
      const fromLocation = (r.headers()['location'] ?? '').match(/\/edit\/([^/?#]+)/)?.[1];
      const body = fromLocation
        ? {}
        : ((await r.json().catch(() => ({}))) as {
            deckId?: string;
            error?: string | { message?: string };
          });
      const error = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
      return { id: fromLocation ?? body.deckId ?? '', status: r.status(), error };
    });
  answer.catch(() => undefined);
  return answer;
}
/** Registers an upload's deck for teardown the moment it is known; the id (empty registers nothing). */
function registerUpload(id: string): string {
  if (id !== '') {
    scratch.add(id);
    uploads.add(id);
  }
  return id;
}
/** The sentence an upload's answer is judged with: the status and the route's error, if any. */
function answered(answer: UploadAnswer): string {
  return `status ${answer.status}${answer.error ? `: ${answer.error}` : ''}`;
}

type Removal = {
  /** the uploader's own calls removed it */
  byUploader: boolean;
  /** /edit/<id> answers 404 at the end, by any path */
  gone: boolean;
  how: string;
};
/**
 * Tears down a deck an upload made, as its uploader: the copy's own editor, `deck.info` for the
 * revision and the caller's standing, `deck.trash` on that revision, `deck.remove` with confirm
 * on the stamp's, then from `home` (a healthy editor) the store's word within 20 s each: 404 on
 * /edit/<id> and the id gone from deck.list (the listing skips a deck whose manifest is gone, so
 * the wait is the store's, not the CDN's). Answers what happened for the row to assert. On the
 * enforce preview (VERIFICATION.md R1-F2, both traces) the product refused `trash` and `remove`
 * for the browser that uploaded: POST /api/decks/bundle writes no access record for a new deck,
 * so its uploader stands on it as an editor by open access, which holds neither; the refusal is
 * kept in `how` with the standing read, and when the environment carries TURBOSLIDE_TOKEN (the
 * deployment's bootstrap bearer; never printed) the copy is then removed with it through
 * POST /api/actions, so the store the preview shares with production keeps no scratch deck.
 */
async function removeUploaded(p: Page, id: string, home: () => Promise<void>): Promise<Removal> {
  const steps: string[] = [];
  const firstLine = (error: unknown): string =>
    (error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, 160);
  const answers404 = async (): Promise<boolean> => {
    const until = Date.now() + 20_000;
    for (;;) {
      if ((await statusOf(p, `/edit/${id}`)) === 404) return true;
      if (Date.now() >= until) return false;
      await p.waitForTimeout(2000);
    }
  };
  if ((await statusOf(p, `/edit/${id}`)) === 404)
    return { byUploader: true, gone: true, how: `${id} answered 404 before its teardown` };
  let revision: number | null = null;
  let byUploader = false;
  let at = "the copy's editor";
  try {
    const opened = await Promise.race([
      openEditor(p, id).then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 40_000)),
    ]);
    if (!opened) throw new Error('did not hydrate within 40 s');
    at = 'deck.info';
    const info = await invoke<{ revision: number }>(p, 'deck.info', undefined, 20_000);
    revision = info.revision;
    const access = (await state(p)).access;
    steps.push(`the uploader stands on ${id} as ${access.role} by ${access.mode} access`);
    at = 'deck.trash';
    try {
      const stamped = await invoke<{ revision: number }>(
        p,
        'deck.trash',
        { id, baseRevision: revision },
        20_000,
      );
      revision = stamped.revision;
      steps.push('deck.trash ok');
    } catch (error) {
      steps.push(`deck.trash refused: ${firstLine(error)}`);
    }
    at = 'deck.remove';
    await invoke(p, 'deck.remove', { id, confirm: true, baseRevision: revision }, 20_000);
    steps.push('deck.remove ok');
    byUploader = true;
  } catch (error) {
    steps.push(`${at} refused: ${firstLine(error)}`);
  }
  await home();
  let gone = byUploader && (await answers404());
  if (!gone) {
    steps.push(
      byUploader ? `${id} still answers 20 s after deck.remove` : `${id} stays on the store`,
    );
    const bearer = process.env['TURBOSLIDE_TOKEN'];
    if (bearer !== undefined && bearer !== '') {
      const post = (action: string, body: Record<string, unknown>) =>
        p.request.post(`/api/actions/${action}`, {
          headers: { ...extraHTTPHeaders, authorization: `Bearer ${bearer}` },
          data: body,
        });
      const rev =
        revision ??
        rowsOf(
          await (await post('deck.list', { includeTrashed: true })).json().catch(() => []),
        ).find((row) => row.id === id)?.revision ??
        null;
      if (rev === null) steps.push('the bearer read no revision to base on');
      else {
        const trashed = await post('deck.trash', { id, baseRevision: rev });
        const stamped = (await trashed.json().catch(() => null)) as { revision?: number } | null;
        const removed = await post('deck.remove', {
          id,
          confirm: true,
          baseRevision: stamped?.revision ?? rev,
        });
        steps.push(
          `the deployment's bearer: deck.trash ${trashed.status()}, deck.remove ${removed.status()}`,
        );
        gone = await answers404();
        steps.push(
          gone ? `${id} removed by the bearer, not by its uploader` : `${id} still answers`,
        );
      }
    }
  }
  let listed: boolean | null = null;
  if (gone) {
    const until = Date.now() + 30_000;
    for (;;) {
      try {
        listed = (await deckIds(p)).includes(id);
      } catch (error) {
        listed = null;
        steps.push(`deck.list unreadable here: ${firstLine(error)}`);
        break;
      }
      if (!listed || Date.now() >= until) break;
      await p.waitForTimeout(2000);
    }
    if (listed === true) steps.push(`deck.list still names ${id} after 30 s`);
    if (listed === false) steps.push(`${id} gone from deck.list`);
  }
  return { byUploader: byUploader && gone && listed !== true, gone, how: steps.join('; ') };
}
/**
 * The uploads a failed row left registered leave here the way their rows would have removed
 * them; the ids no path removed are returned for the hook's soft assertion, so the file's own
 * teardown still runs after them. The healthy editor for the proofs is the file's deck while it
 * stands, else the fresh draft at /new (nothing is stored there before a write).
 */
async function removeLeftoverUploads(): Promise<string[]> {
  const left: string[] = [];
  for (const id of [...uploads]) {
    uploads.delete(id);
    scratch.ids.delete(id);
    if ((await statusOf(page, `/edit/${id}`)) === 404) continue;
    const removal = await removeUploaded(page, id, async () => {
      if ((await statusOf(page, `/edit/${deck}`)) !== 404) await openEditor(page, deck);
      else {
        await page.goto('/new');
        await waitEditor(page);
      }
    });
    console.log(`core/decks.spec.ts teardown, the upload ${id}: ${removal.how}`);
    if (!removal.gone) left.push(id);
  }
  return left;
}

test(title('decks.file.template-gallery'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  const switched = await reachMenuRow(page, 'file', 'file.new', 'file.new.templateGallery');
  const opened = context.waitForEvent('page', { timeout: 20_000 });
  await menuPath(page, 'file', 'file.new', 'file.new.templateGallery');
  const tab = await opened;
  await tab.waitForURL(/\/decks#templates/, { timeout: 20_000 });
  await tab.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await expect(ctl(tab, 'home.blank')).toContainText('Blank presentation');
  await expect(ctl(tab, 'home.gt-brand')).toContainText('GT brand deck');
  expect(new URL(tab.url()).hash).toBe('#templates');
  await tab.close();
  if (switched) await switchOff(page);
});

test(title('decks.file.open-upload-bundle'), async () => {
  test.setTimeout(150_000);
  const bytes = await bundleBytes(page, deck);
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  test.info().annotations.push({ type: 'step', description: 'bundle downloaded' });
  await openEditor(page, deck);
  const slides = (await slideOrder(page)).length;
  const switched = await reachMenuRow(page, 'file', 'file.open');
  await menuPath(page, 'file', 'file.open');
  await ctl(page, 'dialog.open').waitFor({ timeout: 8000 });
  test.info().annotations.push({ type: 'step', description: 'Open dialog open' });

  /* the file input lives on the dialog's Upload tab (Open.tsx: `tab === 'upload'`); the run of
     2026-09-19T04:21Z waited on it from the Presentations tab to the test's bound. The tab is
     picked first and every wait after it is bounded, so a missing control names its step. */
  await ctl(page, 'dialog.open.tab.upload').click({ timeout: 8000 });
  await ctl(page, 'dialog.open.file').waitFor({ state: 'attached', timeout: 8000 });
  test.info().annotations.push({ type: 'step', description: 'Upload tab picked' });
  /* the control is the <input type="file"> itself (Open.tsx): the bytes go to it; the route's
     answer is armed first, so the new deck is registered the moment it exists */
  const answer = uploadAnswer(page);
  await ctl(page, 'dialog.open.file').setInputFiles(
    { name: `${deck}.zip`, mimeType: 'application/zip', buffer: bytes },
    { timeout: 8000 },
  );
  test.info().annotations.push({ type: 'step', description: 'the bundle set on the input' });
  /* the upload opens the new deck at once, or through the dialog's Open. The new address is
     judged by its whole id against the route's answer: the upload names the copy `<id>-2`, which
     contains the original id, so a substring test read the landed page as the original (the
     first drive: the POST answered 201 with location /edit/<id>-2 and the page was there;
     return/build/integrator.md) */
  const landed = page
    .waitForURL(
      (u) => {
        const id = u.pathname.match(/^\/edit\/([^/]+)/)?.[1];
        return id !== undefined && id !== deck;
      },
      { timeout: 30_000 },
    )
    .then(() => true)
    .catch(() => false);
  const ok = ctl(page, 'dialog.open.ok');
  /* a timeout on the click: a disabled Open fails the row instead of holding it to the test's bound */
  if (await ok.isVisible().catch(() => false))
    await ok.click({ timeout: 8000 }).catch(() => undefined);
  const upload = await answer;
  registerUpload(upload.id);
  test.info().annotations.push({
    type: 'step',
    description: `the upload answered ${upload.id || 'no id'} (${answered(upload)})`,
  });
  expect(await landed, 'the bundle opens as a new deck at /edit/<id>').toBe(true);
  test.info().annotations.push({ type: 'step', description: 'the new deck address reached' });
  /* bounded: lib's waitEditor waits 90 s, past the test's own bound with the steps after it */
  await Promise.race([
    waitEditor(page),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("the uploaded deck's editor did not hydrate within 40 s")),
        40_000,
      ),
    ),
  ]);
  test.info().annotations.push({ type: 'step', description: 'the uploaded deck hydrated' });
  const copyId = page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? '';
  /* the address names the deck when the answer did not, so the copy is registered either way */
  const uploaded = registerUpload(upload.id || copyId);
  expect(
    upload.id,
    `the upload's answer names the deck the address opens (${answered(upload)})`,
  ).toBe(copyId);
  expect((await slideOrder(page)).length, 'the copy carries the slides').toBe(slides);
  /* the new deck leaves with its row, removed by the person who uploaded it (an uploaded file
     is the uploader's in Google Slides); the proofs run from the original's editor, which the
     write below uses next. A copy the uploader cannot remove is named by the assertion at the
     end, after the row's other facts are read */
  const removal = await removeUploaded(page, uploaded, () => openEditor(page, deck));
  uploads.delete(uploaded);
  scratch.ids.delete(uploaded);
  test
    .info()
    .annotations.push({ type: 'step', description: `the copy's teardown: ${removal.how}` });
  /* the original keeps taking writes */
  const before = (await slideOrder(page)).length;
  await ctl(page, 'toolbar.newSlide').click({ timeout: 10_000 });
  await expect
    .poll(async () => (await slideOrder(page)).length, { timeout: 20_000 })
    .toBe(before + 1);
  await settled(page);
  if (switched) await switchOff(page);
  expect(
    removal.byUploader,
    `the uploader moves the uploaded deck to the trash and deletes it forever (${removal.how})`,
  ).toBe(true);
});

test(title('decks.file.import-slides-bundle'), async () => {
  test.setTimeout(150_000);
  const bytes = await bundleBytes(page, deck);
  test.info().annotations.push({ type: 'step', description: 'bundle downloaded' });
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  const before = await slideOrder(page);
  const switched = await reachMenuRow(page, 'file', 'file.importSlides');
  await menuPath(page, 'file', 'file.importSlides');
  await ctl(page, 'dialog.importSlides').waitFor({ timeout: 8000 });
  test.info().annotations.push({ type: 'step', description: 'Import slides dialog open' });

  /* the upload makes a deck of the bundle (ImportSlides.tsx: `uploadBundle`, then `choose(id)`),
     listed like any other; the route's answer names it (a `deck.list` diff missed it on the blob
     tier, whose listing lags a fresh deck: VERIFICATION.md R1-F2, run 1) and it leaves with this
     row. The file input lives on the dialog's Upload tab, as in Open (the run of
     2026-09-19T04:21Z waited on it from the Presentations tab to the test's bound) */
  await ctl(page, 'dialog.importSlides.tab.upload').click({ timeout: 8000 });
  await ctl(page, 'dialog.importSlides.file').waitFor({ state: 'attached', timeout: 8000 });
  test.info().annotations.push({ type: 'step', description: 'Upload tab picked' });
  /* the control is the <input type="file"> itself (ImportSlides.tsx): the bytes go to it, and
     the POST fires on the pick */
  const answer = uploadAnswer(page);
  await ctl(page, 'dialog.importSlides.file').setInputFiles(
    { name: `${deck}.zip`, mimeType: 'application/zip', buffer: bytes },
    { timeout: 8000 },
  );
  const upload = await answer;
  const uploaded = registerUpload(upload.id);
  test.info().annotations.push({
    type: 'step',
    description: `the upload answered ${uploaded || 'no id'} (${answered(upload)})`,
  });
  expect(uploaded, `the upload's answer names the dialog's deck (${answered(upload)})`).not.toBe(
    '',
  );
  await page
    .locator('[data-control^="dialog.importSlides.slide."]')
    .first()
    .waitFor({ timeout: 20_000 });
  test.info().annotations.push({ type: 'step', description: 'the bundle slides listed' });
  await ctl(page, 'dialog.importSlides.none').click({ timeout: 8000 });
  await page
    .locator('[data-control^="dialog.importSlides.slide."]')
    .first()
    .click({ timeout: 8000 });
  await ctl(page, 'dialog.importSlides.ok').click({ timeout: 8000 });
  await expect
    .poll(async () => (await slideOrder(page)).length, { timeout: 20_000 })
    .toBe(before.length + 1);
  const after = await slideOrder(page);
  expect(before.includes(after[1]!), 'the slide lands after the current one').toBe(false);
  await settled(page);
  if (switched) await switchOff(page);
  /* the dialog's deck leaves with its row, removed by the person who uploaded it */
  const removal = await removeUploaded(page, uploaded, () => openEditor(page, deck));
  uploads.delete(uploaded);
  scratch.ids.delete(uploaded);
  test
    .info()
    .annotations.push({ type: 'step', description: `the copy's teardown: ${removal.how}` });
  expect(
    removal.byUploader,
    `the uploader moves the dialog's deck to the trash and deletes it forever (${removal.how})`,
  ).toBe(true);
});

test(title('help.improve-link'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  const switched = await reachMenuRow(page, 'help', 'help.improve');
  const opened = context.waitForEvent('page', { timeout: 20_000 });
  await menuPath(page, 'help', 'help.improve');
  const tab = await opened;
  await tab.waitForLoadState('domcontentloaded').catch(() => undefined);
  const address = tab.url();
  await tab.close();
  const issueForm = /github\.com\/[^/]+\/Turboslide\/issues\/new/;
  const returnTo = /github\.com\/login\?return_to=([^&]+)/.exec(address);
  const target = returnTo ? decodeURIComponent(returnTo[1]!) : address;
  expect(target, `the new tab's address (${address})`).toMatch(issueForm);
  if (switched) await switchOff(page);
});

test(title('decks.trash.listed-after-move'), async () => {
  test.setTimeout(90_000);
  await trashFromEditor(deck);
  await gotoTrash();
  await expect(ctl(page, `trash.card.${deck}`), 'listed within 5 s').toBeVisible({ timeout: 5000 });
});

/**
 * Restore on the trash page, then the product's confirmation: the snackbar "Restored <title>"
 * (a refused restore says "Restore: <sentence>" and brings the card back, which fails the row).
 * The row's "within 5 s of Restore" counts from that confirmation, the way a seller reads it
 * before leaving the page, so the restore's flight time on the blob tier is not inside the
 * reload (b7 R8; the flake of VERIFICATION.md pass 1 F12).
 */
async function restoreFromTrash(id: string): Promise<void> {
  await ctl(page, `trash.restore.${id}`).click();
  await expect(ctl(page, 'snackbar'), 'the trash page confirms the restore').toContainText(
    /^Restored /,
    { timeout: 15_000 },
  );
  await expect(ctl(page, `trash.card.${id}`)).toHaveCount(0, { timeout: 10_000 });
}

test(title('decks.trash.restore'), async () => {
  test.setTimeout(90_000);
  await gotoTrash();
  await restoreFromTrash(deck);
  await gotoDecks();
  await expect(ctl(page, `home.card.${deck}`)).toBeVisible({ timeout: 10_000 });
});

test(title('decks.trash.lists-after-restore'), async () => {
  test.setTimeout(90_000);
  await trashFromEditor(deck);
  await gotoTrash();
  await restoreFromTrash(deck);
  await gotoDecks();
  await expect(ctl(page, `home.card.${deck}`), 'on /decks within 5 s').toBeVisible({
    timeout: 5000,
  });
  await gotoTrash();
  await expect(ctl(page, `trash.card.${deck}`), 'not in the trash').toHaveCount(0, {
    timeout: 5000,
  });
});

test(title('decks.trash.delete-forever-cancel'), async () => {
  test.setTimeout(90_000);
  await trashFromEditor(deck);
  await gotoTrash();
  await ctl(page, `trash.delete.${deck}`).click();
  await expect(page.locator('[data-control="trash.confirm"][role="dialog"]')).toBeVisible();
  await ctl(page, 'trash.confirm.cancel').click();
  await expect(ctl(page, `trash.card.${deck}`)).toBeVisible();
  expect(await statusOf(page, `/edit/${deck}`)).toBe(200);
});

test(title('decks.trash.delete-forever-enter'), async () => {
  test.setTimeout(120_000);
  const other = await newDeck(page, scratch, 'Enter deletes me');
  await trashFromEditor(other);
  await gotoTrash();
  await ctl(page, `trash.delete.${other}`).click();
  await expect(page.locator('[data-control="trash.confirm"][role="dialog"]')).toBeVisible();
  const tip =
    (await ctl(page, 'trash.confirm.ok').getAttribute('data-tip')) ??
    (await ctl(page, 'trash.confirm.ok').getAttribute('title')) ??
    (await ctl(page, 'trash.confirm.ok').getAttribute('aria-keyshortcuts')) ??
    '';
  await page.keyboard.press('Enter');
  await expect(
    ctl(page, `trash.card.${other}`),
    `Enter deletes (the button's tooltip: "${tip}")`,
  ).toHaveCount(0, { timeout: 20_000 });
  await expect
    .poll(() => statusOf(page, `/edit/${other}`), { timeout: 20_000, intervals: [2000] })
    .toBe(404);
  scratch.ids.delete(other);
});

test(title('decks.nav.back-forward'), async () => {
  test.setTimeout(120_000);
  await page.goto('/home');
  await page.goto('/decks');
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await gotoDecks();
  await ctl(page, `trash`).count();
  /* the deck sits in the trash since delete-forever-cancel; a trashed deck still opens, read only
     under its banner, and `decks.access.paint` restores it before its own setup write */
  await page.goto(`/edit/${deck}`);
  await waitEditor(page);
  await page.goto('/new');
  await waitEditor(page);
  const seen: string[] = [];
  const check = async (pattern: RegExp, root: string) => {
    await page.waitForURL(pattern, { timeout: 20_000 });
    await expect(page.locator(root).first()).toBeAttached({ timeout: 30_000 });
    seen.push(new URL(page.url()).pathname);
  };
  await page.goBack();
  await check(new RegExp(`/edit/${deck}`), '.pt-viewer');
  await page.goBack();
  await check(/\/decks$/, '.ts-home-page');
  await page.goBack();
  await check(/\/home$/, 'main');
  await page.goForward();
  await check(/\/decks$/, '.ts-home-page');
  await page.goForward();
  await check(new RegExp(`/edit/${deck}`), '.pt-viewer');
  await page.goForward();
  await check(/\/(new|edit\/untitled-[^/]+)$/, '.pt-viewer');
  expect(seen.length).toBe(6);
});

test(title('decks.access.unknown-edit'), async () => {
  const res = await page.goto('/edit/no-such-deck-core-spec');
  expect(res?.status()).toBe(404);
  await expect(ctl(page, 'access.page')).toBeVisible();
  await expect(ctl(page, 'access.sentence')).toContainText(/not available to you|does not exist/);
  await expect(ctl(page, 'access.signin.decks')).toBeVisible();
});

test(title('decks.access.paint'), async () => {
  test.setTimeout(120_000);
  /* the deck sits in the trash since `decks.trash.delete-forever-cancel` (its Cancel leaves it
     there, and `decks.nav.back-forward` opens it trashed on purpose), and a trashed presentation
     is read only under its banner (gslides-parity SPEC 6.4), so the setup write of the appearance
     below needs it restored first (VERIFICATION.md C2-F6, b7's C2-R19: the row failed on every
     tier by its own setup, "mode viewing, role owner", and its second load waited 20 s for a mode
     that could not come) */
  await gotoTrash();
  if ((await ctl(page, `trash.card.${deck}`).count()) > 0) await restoreFromTrash(deck);
  /* the editor used on the light appearance first: the setup write of the appearance */
  await openEditor(page, deck);
  const mode = () =>
    page
      .locator('.pt-viewer:not(.ts-skeleton)')
      .first()
      .getAttribute('data-edit-mode')
      .catch(() => null);
  const editing = await expect
    .poll(mode, { timeout: 20_000 })
    .toBe('editing')
    .then(() => true)
    .catch(() => false);
  expect(
    editing,
    `the restored deck is in Editing mode for its owner (mode ${await mode()}, role ${(await state(page)).access?.role})`,
  ).toBe(true);
  const s = await state(page);
  await invoke(page, 'deck.set', {
    baseRevision: s.revision,
    path: '/defaults/appearance',
    value: 'light',
  });
  await expect.poll(async () => (await state(page)).theme, { timeout: 10_000 }).toBe('light');
  await settled(page);
  await page.goto('/edit/no-such-deck-core-spec-light');
  await ctl(page, 'access.page').waitFor({ timeout: 20_000 });
  const clean = await page.evaluate(() => {
    const page = document.querySelector('[data-control="access.page"]');
    const form = document.querySelector(
      '[data-control="access.form"], [data-control="access.sentence"]',
    );
    if (!page || !form) return { ok: false, why: 'no form' };
    const r = form.getBoundingClientRect();
    const points: [number, number][] = [
      [r.x + r.width / 2, r.y + r.height / 2],
      [r.x + 8, r.y + 8],
      [r.x + r.width - 8, r.y + r.height - 8],
    ];
    const hits = points.map(([x, y]) => document.elementFromPoint(x, y));
    const covered = hits.filter(
      (el): el is Element => el !== null && !form.contains(el) && !el.contains(form),
    );
    return {
      ok: covered.length === 0,
      why: covered.map((el) => `${el.tagName.toLowerCase()}.${el.className}`).join(', '),
    };
  });
  expect(clean.ok, `nothing is drawn over the form (${clean.why})`).toBe(true);
  await openEditor(page, deck);
  const s2 = await state(page);
  await invoke(page, 'deck.set', {
    baseRevision: s2.revision,
    path: '/defaults/appearance',
    value: 'dark',
  });
  await settled(page);
});

test(title('decks.access.sign-in-link'), async () => {
  await page.goto('/edit/no-such-deck-core-spec');
  await ctl(page, 'access.signin.decks').click();
  await page.waitForURL(/\/decks/, { timeout: 20_000 });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
});

test(title('decks.access.unknown-deck'), async () => {
  const res = await page.goto('/deck/no-such-deck-core-spec');
  expect(res?.status()).toBe(404);
  await expect(ctl(page, 'access.page')).toBeVisible();
});

test(title('decks.notfound.page'), async () => {
  const res = await page.goto('/no-such-page-core-spec');
  expect(res?.status()).toBe(404);
  await expect(ctl(page, 'notfound')).toBeVisible();
  await expect(ctl(page, 'notfound')).toContainText(/Not found/i);
  for (const link of ['notfound.new', 'notfound.decks', 'notfound.about'])
    await expect(ctl(page, link)).toBeVisible();
});

test(title('decks.trash.delete-forever-button'), async () => {
  test.setTimeout(120_000);
  /* the deck is in the trash from the Cancel row; Delete forever with the button, then 404 */
  await gotoTrash();
  if ((await ctl(page, `trash.card.${deck}`).count()) === 0) await trashFromEditor(deck);
  await deleteForever(page, deck);
  await expect
    .poll(() => statusOf(page, `/edit/${deck}`), { timeout: 20_000, intervals: [2000] })
    .toBe(404);
  scratch.ids.delete(deck);
});

coverage(import.meta.filename, [
  'decks.home.new-presentation',
  'decks.home.your-presentations',
  'decks.root.redirect',
  'decks.list.read',
  'decks.list.search',
  'decks.list.open-thumbnail',
  'decks.list.open-title',
  'decks.list.open-recent',
  'decks.card.menu-open-escape',
  'decks.card.rename-enter',
  'decks.card.rename-escape',
  'decks.row.rename-enter',
  'decks.card.make-a-copy',
  'decks.card.open-in-new-tab',
  'decks.card.present',
  'decks.card.move-to-trash-undo',
  'decks.list.gt-brand-deck',
  'decks.trash.listed-after-move',
  'decks.trash.restore',
  'decks.trash.lists-after-restore',
  'decks.trash.delete-forever-cancel',
  'decks.trash.delete-forever-button',
  'decks.trash.delete-forever-enter',
  'decks.nav.back-forward',
  'decks.access.unknown-edit',
  'decks.access.paint',
  'decks.access.sign-in-link',
  'decks.access.unknown-deck',
  'decks.notfound.page',
  'decks.file.make-a-copy',
  'decks.card.download',
  'decks.file.template-gallery',
  'decks.file.open-upload-bundle',
  'decks.file.import-slides-bundle',
  'help.improve-link',
]);
