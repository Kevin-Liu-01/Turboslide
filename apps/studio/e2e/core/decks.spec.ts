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
  await expect(ctl(page, 'home.template.gt-brand')).toContainText('GT brand deck');
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
  await ctl(page, 'home.template.gt-brand').click();
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
  /* the product round's gallery page (docs/PRODUCT.md section 5, B5b): /decks/templates with
     the Blank card and the organisation's brand deck; the old /decks#templates address redirects */
  await tab.waitForURL(/\/decks\/templates/, { timeout: 20_000 });
  await tab.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 });
  await expect(ctl(tab, 'templates.card.blank')).toContainText('Blank');
  await expect(ctl(tab, 'templates.card.gt-brand')).toContainText('General Translation brand deck');
  expect(new URL(tab.url()).pathname).toBe('/decks/templates');
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
  test.setTimeout(180_000);
  /* the row's own copy of the deck, so the bundle it uploads carries a fresh id and the upload's
     name (`<id>-2`) is never the one the row before it (`decks.file.open-upload-bundle`) uploaded
     and removed: on the blob tier an instance can still hold a removed copy inside the removal's
     propagation window and refuse the same name (the return round's ship, ship.md section 10
     item 3, R2-F6; PRODUCT.md 8.2). The copy is a setup write through the window API and leaves
     with the file's teardown */
  await openEditor(page, deck);
  const sCopy = await state(page);
  const copyAnswer = await invoke<{ deckId?: string; id?: string; deck?: { id?: string } }>(
    page,
    'deck.copy',
    {
      id: deck,
      name: `Import bundle source ${Date.now().toString(36)}`,
      baseRevision: sCopy.revision,
    },
  );
  const source = copyAnswer.deckId ?? copyAnswer.id ?? copyAnswer.deck?.id ?? '';
  expect(source, 'the row has its own copy to bundle').not.toBe('');
  scratch.add(source);
  /* the copy's card on /decks: the listing on the blob tier lags a fresh deck by up to a minute
     on an instance that did not make it (PRODUCT.md 8.2: a listing waits up to 65 s) */
  const tList = Date.now();
  for (;;) {
    await gotoDecks();
    if (
      await ctl(page, `home.card.${source}`)
        .isVisible()
        .catch(() => false)
    )
      break;
    if (Date.now() - tList > 65_000) break;
    await page.waitForTimeout(3000);
  }
  test.info().annotations.push({
    type: 'listing',
    description: `the copy ${source} was listed after ${Date.now() - tList} ms`,
  });
  const bytes = await bundleBytes(page, source);
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
    { name: `${source}.zip`, mimeType: 'application/zip', buffer: bytes },
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
  /* a presentation this browser opened sits in the Opened on this device row and leaves the
     grid (decks.index.tsx `hidden`), so its card is either control */
  await expect(
    page
      .locator(`[data-control="home.card.${deck}"], [data-control="home.recent.${deck}"]`)
      .first(),
  ).toBeVisible({ timeout: 10_000 });
});

test(title('decks.trash.lists-after-restore'), async () => {
  test.setTimeout(90_000);
  await trashFromEditor(deck);
  await gotoTrash();
  await restoreFromTrash(deck);
  await gotoDecks();
  await expect(
    page
      .locator(`[data-control="home.card.${deck}"], [data-control="home.recent.${deck}"]`)
      .first(),
    'on /decks within 5 s',
  ).toBeVisible({ timeout: 5000 });
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

// ---------------------------------------------------------------------------------------------
// the product round's rows (docs/PRODUCT.md section 2 ranks 4, 15, 16, 20, 22 and 26, sections
// 3.3, 3.5, 3.6 and 4.3, 8.1): the Recent row and the trash snackbar, the /home lead, the cards,
// the trash page, the skeleton, the access and Not found pages, the template gallery and the
// strip, the chrome's first visit appearance and the deck's default appearance. B1 owns the pages,
// B5b the gallery, B7 the thumbnail capture; a row of a page or control not on the build is
// skipped with its id, which the gate reads as not driven with that reason.

/** The token a css custom property resolves to on this page. */
async function tokenValue(p: Page, name: string): Promise<string> {
  return p.evaluate((n) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${n})`;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, name);
}
/** Whether the snackbar shows the words within `ms`, and whether its action reads Undo. */
async function snackbarWithin(
  p: Page,
  words: RegExp,
  ms: number,
): Promise<{ said: string | null; undo: boolean }> {
  const t0 = Date.now();
  let said: string | null = null;
  while (Date.now() - t0 < ms) {
    said = await ctl(p, 'snackbar')
      .textContent({ timeout: 500 })
      .catch(() => null);
    if (said && words.test(said)) break;
    await p.waitForTimeout(150);
  }
  const action = await ctl(p, 'snackbar.action')
    .textContent({ timeout: 500 })
    .catch(() => null);
  return { said, undo: /undo/i.test(action ?? '') };
}

test(title('decks.recent.drops-trashed'), async () => {
  test.setTimeout(150_000);
  /* the row before (decks.trash.delete-forever-button) deleted the file's deck forever, so this
     row and the rows after take a fresh one; the afterAll tears it down */
  deck = await newDeck(page, scratch, 'Northwind renewal');
  await openEditor(page, deck);
  await gotoDecks();
  const listedBefore = await ctl(page, `home.recent.${deck}`).count();
  await trashFromEditor(deck);
  await gotoDecks();
  const listedAfter = await ctl(page, `home.recent.${deck}`).count();
  test.info().annotations.push({
    type: 'recent',
    description: `listed before ${listedBefore}, after the trash ${listedAfter}`,
  });
  await gotoTrash();
  await restoreFromTrash(deck);
  expect(listedBefore, 'the opened deck is in the Opened on this device row').toBeGreaterThan(0);
  expect(listedAfter, 'the trashed deck leaves the row').toBe(0);
});

test(title('decks.trash.editor-undo-snackbar'), async () => {
  test.setTimeout(120_000);
  await trashFromEditor(deck);
  const t0 = Date.now();
  const { said, undo } = await snackbarWithin(page, /Moved to trash/, 3000);
  const ms = Date.now() - t0;
  test.info().annotations.push({
    type: 'snackbar',
    description: `"${said ?? 'none'}" after ${ms} ms, Undo ${undo}`,
  });
  expect(said ?? '', 'the /decks page shows Moved to trash within 3 s').toMatch(/Moved to trash/);
  expect(undo, 'with Undo').toBe(true);
  await ctl(page, 'snackbar.action').click();
  await expect(ctl(page, `home.card.${deck}`), 'the card returns').toBeVisible({ timeout: 10_000 });
  expect(await statusOf(page, `/edit/${deck}`), 'the deck is restored').not.toBe(404);
});

test(title('decks.recent.this-browser-sentence'), async () => {
  await gotoDecks();
  const sentence = ctl(page, 'home.recent.sentence');
  if ((await sentence.count()) === 0)
    test.skip(true, 'not on this build: home.recent.sentence (docs/PRODUCT.md 7.1, B1)');
  await expect(sentence).toContainText(/this browser/);
  await expect(sentence).toContainText(/On another computer/);
});

test(title('decks.home.seller-lead'), async () => {
  test.setTimeout(90_000);
  await page.goto('/home');
  if (OIDC)
    await page.evaluate(() => {
      for (const rules of document.querySelectorAll('script[type="speculationrules"]'))
        rules.remove();
    });
  const hero = await page.locator('main h1').first().textContent();
  expect(hero?.trim(), "the hero leads with the seller's sentence").toBe(
    'Build the pitch, present it and send the link, in one place',
  );
  const start = page.locator('main a, main button', { hasText: /^Start from a template$/ }).first();
  await expect(start, "the first band's button reads Start from a template").toBeVisible();
  await start.click();
  await page.waitForURL(/\/decks\/templates/, { timeout: 20_000 });
});

test(title('decks.card.thumbnail-slide-1'), async () => {
  test.setTimeout(120_000);
  const fresh = await newDeck(page, scratch, 'Thumbnail deck');
  const t0 = Date.now();
  await gotoDecks();
  const plate = await page.evaluate((id) => {
    const card = document.querySelector(`[data-control="home.card.${id}"]`);
    const el = card?.querySelector('.ts-hm-card-plate');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cs.backgroundColor);
    const lum = m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 : null;
    return {
      background: cs.backgroundColor,
      color: cs.color,
      lum,
      text: el.textContent?.trim() ?? '',
    };
  }, fresh);
  let rendered: number | null = null;
  for (;;) {
    const img = await page.evaluate((id) => {
      const card = document.querySelector(`[data-control="home.card.${id}"]`);
      const image = card?.querySelector('.ts-hm-card-thumb img') as HTMLImageElement | null;
      return image ? { complete: image.complete, natural: image.naturalWidth } : null;
    }, fresh);
    if (img && img.complete && img.natural > 0) {
      rendered = Date.now() - t0;
      break;
    }
    if (Date.now() - t0 > 10_000) break;
    await page.waitForTimeout(1000);
    await gotoDecks();
  }
  test.info().annotations.push({
    type: 'thumbnail',
    description: `plate ${JSON.stringify(plate)}; slide 1 rendered after ${rendered ?? 'more than 10000'} ms`,
  });
  if (plate !== null) {
    /* a fresh deck is light on this deployment (PRODUCT.md section 1): the plate is paper, never black */
    expect(
      plate.lum ?? 0,
      `the plate is the deck's paper colour, not black (${plate.background})`,
    ).toBeGreaterThan(160);
  }
  expect(rendered, "the card shows slide 1's render within 10 s of the first edit").not.toBeNull();
});

test(title('decks.card.edited-relative-time'), async () => {
  test.setTimeout(90_000);
  await gotoDecks();
  const facts = await page.evaluate((id) => {
    const card = document.querySelector(`[data-control="home.card.${id}"]`);
    const lines = [...(card?.querySelectorAll('span, p, small, time') ?? [])].map(
      (el) => el.textContent?.trim() ?? '',
    );
    const when = lines.find((l) => /^(Edited|Opened)/.test(l)) ?? null;
    return { when };
  }, deck);
  expect(facts.when, 'the card carries a when line').not.toBeNull();
  /* "Edited yesterday at 14:02" or "2:02 PM" in the browser's locale from the store; a deck this
     browser opened reads "Opened 2 hours ago" instead (docs/PRODUCT.md 3.6, decks.index.tsx
     whenLine), and this file's browser opened the deck */
  expect(facts.when!, 'reads Edited <relative day> at <locale time>, or Opened <ago>').toMatch(
    /^(Edited .+ at \d{1,2}:\d{2}( ?[AP]M)?|Opened .+)/,
  );
  await ctl(page, 'home.view.list').click();
  await page.waitForTimeout(400);
  const rowHeight = await page.evaluate((id) => {
    const row = document.querySelector(`[data-control="home.card.${id}"]`);
    return row ? Math.round(row.getBoundingClientRect().height) : null;
  }, deck);
  await ctl(page, 'home.view.grid').click();
  test.info().annotations.push({
    type: 'card',
    description: `when "${facts.when}"; list row ${rowHeight} px`,
  });
  expect(rowHeight, "the list view's rows are 32 px").toBe(32);
});

test(title('decks.card.more-glyph'), async () => {
  await gotoDecks();
  const facts = await page.evaluate((id) => {
    const more = document.querySelector(`[data-control="home.more.${id}"]`);
    const svg = more?.querySelector('svg');
    return {
      svg: Boolean(svg),
      size: svg ? Math.round(svg.getBoundingClientRect().width) : null,
      text: more?.textContent?.trim() ?? '',
    };
  }, deck);
  expect(facts.svg, 'the more button draws an svg glyph').toBe(true);
  expect(facts.text, 'no text glyph').not.toMatch(/[⋯…•]/);
});

test(title('decks.trash.button-heights'), async () => {
  test.setTimeout(120_000);
  await trashFromEditor(deck);
  await gotoTrash();
  const ink = await tokenValue(page, '--pt-ink');
  const facts = await page.evaluate((id) => {
    const h = (c: string) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return el ? Math.round(el.getBoundingClientRect().height) : null;
    };
    const del = document.querySelector(`[data-control="trash.delete.${id}"]`);
    const solid = [...document.querySelectorAll('.is-solid, .pt-ib.is-solid')].filter(
      (el) => el.getClientRects().length > 0,
    );
    return {
      restore: h(`trash.restore.${id}`),
      remove: h(`trash.delete.${id}`),
      removeColor: del ? getComputedStyle(del).color : null,
      removeGlyph: Boolean(del?.querySelector('svg')),
      solid: solid.map((el) => el.getAttribute('data-control') ?? el.className),
    };
  }, deck);
  await restoreFromTrash(deck);
  test.info().annotations.push({ type: 'trash', description: JSON.stringify(facts) });
  expect(facts.restore, 'Restore is 32 px').toBe(32);
  expect(facts.remove, 'Delete forever is 32 px').toBe(32);
  expect(facts.removeColor, 'Delete forever is in ink').toBe(ink);
  expect(facts.removeGlyph, 'with its glyph').toBe(true);
  expect(facts.solid, "Empty trash is the page's one solid button").toEqual(['trash.empty']);
});

test(title('decks.trash.confirm-dialog-chrome'), async () => {
  test.setTimeout(120_000);
  await trashFromEditor(deck);
  await gotoTrash();
  await ctl(page, `trash.delete.${deck}`).click();
  const dialog = page.locator('.ts-dialog-scrim [role="dialog"]').first();
  await dialog.waitFor({ timeout: 8000 });
  const facts = await dialog.evaluate((el) => {
    const titleEl = el.querySelector('h2, .ts-dialog-title, [id$="-title"]');
    const lead = [...el.querySelectorAll('p')].map((p) => p.textContent?.trim() ?? '');
    return {
      title: titleEl?.textContent?.trim() ?? null,
      titleSize: titleEl ? parseFloat(getComputedStyle(titleEl).fontSize) : null,
      lead,
    };
  });
  await page.keyboard.press('Escape');
  await expect(dialog, 'Escape closes it').toHaveCount(0, { timeout: 5000 });
  await ctl(page, `trash.delete.${deck}`).click();
  await dialog.waitFor({ timeout: 8000 });
  await page.mouse.click(8, 8);
  await expect(dialog, 'a click outside closes it').toHaveCount(0, { timeout: 5000 });
  await restoreFromTrash(deck);
  test.info().annotations.push({ type: 'dialog', description: JSON.stringify(facts) });
  expect(facts.title ?? '', 'the title names the delete').toMatch(/^Delete .* forever\?$/);
  expect(facts.titleSize, 'the title is 18 px').toBe(18);
  expect(facts.lead.join(' '), 'the lead line').toMatch(/This cannot be undone/);
});

test(title('decks.new.skeleton-one-frame'), async ({ browser }) => {
  test.setTimeout(90_000);
  const fresh = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
  });
  const p = await fresh.newPage();
  try {
    await p.addInitScript(() => {
      const w = window as unknown as {
        __skeleton: {
          first: number | null;
          frames: number | null;
          canvases: number | null;
          gone: number | null;
        };
      };
      w.__skeleton = { first: null, frames: null, canvases: null, gone: null };
      const read = () => {
        const sk = document.querySelector('.ts-skeleton');
        if (sk && w.__skeleton.first === null) {
          w.__skeleton.first = performance.now();
          w.__skeleton.frames = sk.querySelectorAll('.ts-skeleton-card').length;
          w.__skeleton.canvases = sk.querySelectorAll('canvas, img').length;
        }
        if (!sk && w.__skeleton.first !== null && w.__skeleton.gone === null) {
          w.__skeleton.gone = performance.now();
        }
        const ready = document.querySelector('.pt-viewer:not(.ts-skeleton)[data-settled]');
        if (ready && w.__skeleton.gone === null && w.__skeleton.first === null)
          w.__skeleton.gone = performance.now();
      };
      new MutationObserver(read).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    });
    await p.goto('/new');
    await waitEditor(p);
    const facts = (await p.evaluate(
      () => (window as unknown as { __skeleton: unknown }).__skeleton,
    )) as {
      first: number | null;
      frames: number | null;
      canvases: number | null;
      gone: number | null;
    };
    const ready = await p.evaluate(() => performance.now());
    test.info().annotations.push({
      type: 'skeleton',
      description: `${JSON.stringify(facts)}; ready at ${Math.round(ready)} ms`,
    });
    if (facts.first === null) {
      /* the editor was ready without a skeleton: allowed when it stood inside 300 ms */
      expect(ready, 'no skeleton was drawn; the editor was ready inside 300 ms').toBeLessThan(
        300 + 100,
      );
    } else {
      expect(facts.frames, 'one filmstrip frame for a one slide draft').toBe(1);
      expect(facts.canvases, 'a quiet paper plate, no figure').toBe(0);
    }
  } finally {
    await fresh.close();
  }
});

test(title('decks.access.stranger-links'), async ({ browser }) => {
  test.setTimeout(90_000);
  const stranger = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
  });
  const p = await stranger.newPage();
  try {
    await p.goto('/deck/no-such-deck-core-spec');
    await ctl(p, 'access.page').waitFor({ timeout: 60_000 });
    await p.waitForTimeout(800);
    const modeRes = await p.request.get('/api/access/no-such-deck-core-spec', {
      headers: extraHTTPHeaders,
    });
    const mode =
      ((await modeRes.json().catch(() => ({}))) as { authorize?: string }).authorize ?? 'unknown';
    const facts = await p.evaluate(() => {
      const y = (c: string) => {
        const el = document.querySelector(`[data-control="${c}"]`);
        return el && el.getClientRects().length > 0 ? el.getBoundingClientRect().y : null;
      };
      const links = document.querySelector('[data-control="access.links"]');
      return {
        decks: y('access.link.decks'),
        newLink: y('access.link.new'),
        form: y('access.form'),
        linksText: links?.textContent?.trim() ?? '',
      };
    });
    test
      .info()
      .annotations.push({ type: 'access', description: `${mode} mode; ${JSON.stringify(facts)}` });
    expect(
      facts.decks !== null && facts.newLink !== null,
      'Your presentations and New presentation are drawn',
    ).toBe(true);
    expect(facts.linksText, 'the links read Your presentations and New presentation').toMatch(
      /Your presentations/,
    );
    expect(facts.linksText).toMatch(/New presentation/);
    if (facts.form !== null)
      expect(facts.decks!, 'the links lead the form').toBeLessThan(facts.form);
    if (mode === 'shadow')
      expect(facts.form, 'no request form under shadow authorization').toBeNull();
  } finally {
    await stranger.close();
  }
});

test(title('decks.notfound.sentence-case'), async () => {
  await page.goto('/no-such-page-core-spec');
  await ctl(page, 'notfound').waitFor({ timeout: 30_000 });
  const facts = await page.evaluate(() =>
    ['notfound.new', 'notfound.decks', 'notfound.about'].map((c) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return {
        c,
        text: el?.textContent?.trim() ?? null,
        h: el ? Math.round(el.getBoundingClientRect().height) : null,
      };
    }),
  );
  test.info().annotations.push({ type: 'notfound', description: JSON.stringify(facts) });
  expect(facts.map((f) => f.text)).toEqual([
    'New presentation',
    'Your presentations',
    'About Turboslide',
  ]);
  for (const f of facts) expect(f.h, `${f.c} is 40 px`).toBe(40);
});

test(title('templates.gallery.page'), async () => {
  test.setTimeout(120_000);
  const res = await page.goto('/decks/templates');
  const pageCtl = ctl(page, 'templates.page');
  if (!res || res.status() >= 400 || (await pageCtl.count()) === 0)
    test.skip(
      true,
      `not on this build: templates.page (docs/PRODUCT.md 7.1, B5b); /decks/templates answered ${res?.status() ?? 'nothing'}`,
    );
  await page.waitForTimeout(600);
  const facts = await page.evaluate(() => {
    const group = (c: string) => document.querySelector(`[data-control="${c}"]`);
    const cardsOf = (g: Element | null) =>
      [...(g?.querySelectorAll('[data-control^="templates.card."]') ?? [])]
        .filter((el) => /^templates\.card\.[^.]+$/.test(el.getAttribute('data-control') ?? ''))
        .map((el) => ({
          slug: (el.getAttribute('data-control') ?? '').replace('templates.card.', ''),
          name:
            el
              .querySelector('h3, .ts-hm-card-title, [data-control$=".name"]')
              ?.textContent?.trim() ??
            el.textContent?.trim().slice(0, 60) ??
            '',
          /* a cover is the slide's live clone (decks.templates.tsx `.ts-gallery-cover`), a
             picture or the card thumb */
          cover: Boolean(
            el.querySelector('img, .ts-hm-card-thumb') ||
            (el.querySelector('.ts-gallery-cover')?.childElementCount ?? 0) > 0,
          ),
          count: /\d+ slides?/.test(el.textContent ?? ''),
          sentence: (el.querySelector('p')?.textContent?.trim().length ?? 0) > 10,
          isDefault: Boolean(el.querySelector('[data-control$=".default"]')),
        }));
    return {
      organisation: cardsOf(group('templates.group.organisation')),
      turboslide: cardsOf(group('templates.group.turboslide')),
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    };
  });
  test.info().annotations.push({ type: 'gallery', description: JSON.stringify(facts) });
  expect(facts.heading, 'the heading').toBe('Template gallery');
  const blank = facts.turboslide.find((c) => c.slug === 'blank');
  expect(blank, "Turboslide's Blank is listed").toBeTruthy();
  const gt = facts.organisation.find((c) => c.slug === 'gt-brand');
  expect(gt, 'the General Translation brand deck is listed under Your organisation').toBeTruthy();
  expect(gt!.name, 'under its own name').toMatch(/General Translation brand deck/);
  for (const c of [...facts.organisation, ...facts.turboslide]) {
    expect(c.cover, `${c.slug} has a cover`).toBe(true);
    expect(c.count, `${c.slug} names its slide count`).toBe(true);
    expect(c.sentence, `${c.slug} has one sentence`).toBe(true);
  }
  expect(
    [...facts.organisation, ...facts.turboslide].filter((c) => c.isDefault).length,
    'one card is marked as used for new presentations',
  ).toBe(1);
  /* the /decks link and File > New > From template gallery open it; /decks#templates redirects */
  await gotoDecks();
  await ctl(page, 'home.gallery').click();
  await page.waitForURL(/\/decks\/templates/, { timeout: 20_000 });
  await openEditor(page, deck);
  /* the row opens the gallery in a new tab since the product round (decks.file.template-gallery) */
  const opened = context.waitForEvent('page', { timeout: 20_000 });
  await menuPath(page, 'file', 'file.new', 'file.new.templateGallery');
  const tab = await opened;
  await tab.waitForURL(/\/decks\/templates/, { timeout: 20_000 });
  await tab.close();
  await page.goto('/decks#templates');
  await page.waitForURL(/\/decks\/templates/, { timeout: 20_000 });
});

test(title('templates.gallery.strip-and-link'), async () => {
  await gotoDecks();
  const facts = await page.evaluate(() => {
    /* the strip is a list: Blank's card sits in its own item (decks.index.tsx) */
    const blank = document.querySelector('[data-control="home.blank"]');
    const strip = blank?.closest('ul') ?? blank?.parentElement ?? null;
    const cards = [...(strip?.querySelectorAll('[data-control^="home."]') ?? [])]
      .filter((el) =>
        /^home\.(blank|template\.[^.]+|gt-brand)$/.test(el.getAttribute('data-control') ?? ''),
      )
      .map((el) => el.getAttribute('data-control') ?? '');
    const link = document.querySelector('[data-control="home.gallery"]');
    return { cards, link: link?.getAttribute('href') ?? null };
  });
  test.info().annotations.push({ type: 'strip', description: JSON.stringify(facts) });
  expect(facts.cards[0], 'Blank comes first').toBe('home.blank');
  expect(
    facts.cards.slice(1).every((c) => c.startsWith('home.template.')),
    "then the organisation's templates as home.template.<id>",
  ).toBe(true);
  expect(facts.cards.length, 'at least one template after Blank').toBeGreaterThan(1);
  expect(facts.link, 'the Template gallery link points at the page').toMatch(/\/decks\/templates$/);
});

test(title('chrome.appearance.first-visit-follows-os'), async ({ browser }) => {
  test.setTimeout(120_000);
  const light = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });
  const p = await light.newPage();
  const theme = () => p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  try {
    await p.goto('/home');
    await p.waitForSelector('.ts-product, main', { timeout: 30_000 });
    const home = await theme();
    await p.goto('/new');
    await waitEditor(p);
    const fresh = await theme();
    await p.evaluate(() => localStorage.setItem('gt-theme', 'dark'));
    await p.goto('/home');
    await p.waitForSelector('.ts-product, main', { timeout: 30_000 });
    const stored = await theme();
    test.info().annotations.push({
      type: 'appearance',
      description: `light scheme: /home ${home}, /new ${fresh}; with gt-theme dark stored ${stored}`,
    });
    expect(home, 'a light system opens /home light').toBe('light');
    expect(fresh, 'and /new light').toBe('light');
    expect(stored, 'a stored gt-theme wins on the next visit').toBe('dark');
  } finally {
    await light.close();
  }
  const dark = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const q = await dark.newPage();
  try {
    await q.goto('/home');
    await q.waitForSelector('.ts-product, main', { timeout: 30_000 });
    expect(
      await q.evaluate(() => document.documentElement.getAttribute('data-theme')),
      'a dark system opens dark',
    ).toBe('dark');
  } finally {
    await dark.close();
  }
});

test(title('brand.appearance.default'), async () => {
  test.setTimeout(150_000);
  await page.goto('/new');
  await waitEditor(page);
  const s = await state(page);
  const info = await invoke<{
    defaults?: { appearance?: string };
    brand?: { appearance?: string };
  }>(page, 'deck.info');
  const draft = info.defaults?.appearance ?? info.brand?.appearance ?? s.theme;
  const ground = await page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    for (let node = sheet; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(bg)) return bg;
    }
    return null;
  });
  const lum = (() => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(ground ?? '');
    return m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 : null;
  })();
  test.info().annotations.push({
    type: 'new',
    description: `appearance ${draft} (state ${s.theme}); ground ${ground}`,
  });
  expect(
    draft,
    "/new opens in the deployment kit's default appearance, light on this deployment",
  ).toBe('light');
  expect(lum ?? 0, 'and the sheet paints light').toBeGreaterThan(160);
  /* a deck from a template whose kit says dark: the General Translation brand deck */
  await gotoDecks();
  const gtCard = page
    .locator('[data-control="home.template.gt-brand"], [data-control="home.template.gt-brand"]')
    .first();
  await gtCard.click();
  await page.waitForURL(/\/edit\//, { timeout: 60_000 });
  const copy = page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? '';
  scratch.add(copy);
  await waitEditor(page);
  const gt = await invoke<{ defaults?: { appearance?: string }; brand?: { appearance?: string } }>(
    page,
    'deck.info',
  );
  const gtAppearance = gt.brand?.appearance ?? gt.defaults?.appearance ?? (await state(page)).theme;
  test.info().annotations.push({
    type: 'template',
    description: `the General Translation brand deck copy ${copy} opens ${gtAppearance}`,
  });
  expect(gtAppearance, 'a deck from a template whose kit says dark opens dark').toBe('dark');
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
  /* the product round (docs/PRODUCT.md 8.1) */
  'decks.recent.drops-trashed',
  'decks.trash.editor-undo-snackbar',
  'decks.recent.this-browser-sentence',
  'decks.home.seller-lead',
  'decks.card.thumbnail-slide-1',
  'decks.card.edited-relative-time',
  'decks.card.more-glyph',
  'decks.trash.button-heights',
  'decks.trash.confirm-dialog-chrome',
  'decks.new.skeleton-one-frame',
  'decks.access.stranger-links',
  'decks.notfound.sentence-case',
  'templates.gallery.page',
  'templates.gallery.strip-and-link',
  'chrome.appearance.first-visit-follows-os',
  'brand.appearance.default',
]);
