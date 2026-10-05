import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  OIDC,
  Scratch,
  agentHeaders,
  clickCard,
  coverage,
  ctl,
  deleteForever,
  download,
  extraHTTPHeaders,
  fetchBytes,
  invoke,
  menuPath,
  newDeck,
  openEditor,
  openGtBrandCopy,
  otherContext,
  ownerContext,
  placeBlock,
  pngSize,
  selectBlock,
  settled,
  slideJson,
  slideOrder,
  snackbarText,
  state,
  statusOf,
  teardownAll,
  title,
  typeNote,
  waitEditor,
} from './lib';
import { pagesR1f } from './pages-r1f';

// Decks and the home surfaces, the spec rows (docs/FOCUS.md 2.1, 6.4 `decks.*` with the driver
// core/decks.spec.ts): /home and its calls to action, the root redirect, the /decks list, its
// search and its three ways into the editor, the card menu with its seven rows, Rename from the
// card and from the list view row, Make a copy, Open in new tab, Present, Move to trash with
// Undo, the GT brand deck copy, the trash page with Restore and Delete forever (Cancel, the
// button, Enter), Back and Forward, the You need access pages, Not found, File > Make a copy with
// Remove speaker notes, and the card's Download. One context for the file (one principal); every
// deck it makes is torn down at the end. The return round (docs/archive/rounds/RETURN.md section 5) adds File >
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
  /* the landing (docs/LANDING.md 2.10, 6.7): the close band's New Presentation reaches /new the
     same way as the hero's; both are document navigations to /new */
  const close = page.locator('[data-band="close"] a[href="/new"]', {
    hasText: /New Presentation/i,
  });
  await expect(close, "the close band's New Presentation").toHaveCount(1);
  const hero = page.locator('main a[href="/new"]', { hasText: /New Presentation/i }).first();
  await hero.click();
  await page.waitForURL(/\/new/, { timeout: 20_000 });
  await waitEditor(page);
  const s = await state(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  expect(s.revision).toBe(0);
  expect(info.id).toMatch(/^untitled-/);
  await page.goto('/home');
  if (OIDC)
    await page.evaluate(() => {
      for (const rules of document.querySelectorAll('script[type="speculationrules"]'))
        rules.remove();
    });
  await page.locator('[data-band="close"] a[href="/new"]').click();
  await page.waitForURL(/\/new/, { timeout: 20_000 });
  await waitEditor(page);
  const second = await invoke<{ id: string }>(page, 'deck.info');
  expect(second.id).toMatch(/^untitled-/);
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
  /* the polish round (docs/archive/rounds/POLISH.md 2.7 item 75, B5): the Recent row is gone; this browser's
     decks are the first cards with the line "Opened just now" */
  /* Round 1 (docs/NEXT.md 4.1.3 item 10): the ruled rows are the default view */
  const listed = page.locator('[data-control="home.rows"], [data-control="home.cards"]').first();
  await expect(listed).toBeVisible();
  await expect(ctl(page, `home.card.${deck}`)).toBeVisible();
  await expect(listed.locator('[data-control^="home.card."]').first()).toContainText(/Opened/);
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
  /* item 75: the Recent row's open is the card's own open since the polish round */
  ['decks.list.open-recent', 'home.open'],
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
  /* the list stays the view, the default since Round 1 */
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
  const id = await openGtBrandCopy(page, 30_000);
  const addressed = Date.now() - t;
  scratch.add(id);
  await waitEditor(page);
  expect(id).not.toBe('gt-brand');
  const slides = await slideOrder(page);
  const opened = Date.now() - t;
  test.info().annotations.push({
    type: 'copy',
    description: `the copy ${id}: its editor address ${addressed} ms after the click, the editor settled with ${slides.length} slides at ${opened} ms`,
  });
  expect(opened, 'within 15 s').toBeLessThan(15_000);
  expect(slides.length).toBe(95);
});

test(title('decks.card.download'), async () => {
  test.setTimeout(90_000);
  await gotoDecks();
  /* the card's Download is the PowerPoint since docs/archive/rounds/POLISH.md item 85 (routes/decks.index.tsx:
     the same export path as File > Download, saved from the page's own fetch, so a preview behind
     Vercel Authentication answers it too); the bundle is File > Download > Turboslide bundle
     (`bundleBytes`, `export.zip.bundle`). The row reads the file the card gives within 30 s: a
     PK file named `.pptx`; `decks.card.download-powerpoint` reads its name and the snackbar. The
     polish round's run of record read no bundle ticket twice through the older mechanism (B5's
     R21, landed by the ship step's third attempt). */
  const file = await download(page, () => cardMenuRow(deck, /^Download$/), 30_000);
  test.info().annotations.push({
    type: 'download',
    description: `${file.name} (${file.bytes.length} B) in ${file.ms} ms`,
  });
  expect(file.ms, 'within 30 s').toBeLessThan(30_000);
  expect(file.bytes.subarray(0, 2).toString('latin1'), 'a PK file').toBe('PK');
  expect(file.name, 'the PowerPoint').toMatch(/\.pptx$/);
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
  /* the polish round (docs/archive/rounds/POLISH.md 2.6 item 74): Make a copy draws as its one visible row
     while Selected slides is parked, the row keeping its own id */
  await menuPath(page, 'file', 'file.makeCopy.entire');
  await ctl(page, 'dialog.makeCopy').waitFor({ timeout: 8000 });
  const remove = ctl(page, 'dialog.makeCopy.removeNotes');
  const input = remove.locator('input').first();
  const target = (await input.count()) > 0 ? input : remove;
  if (!(await target.isChecked().catch(() => false))) await target.click({ force: true });
  /* a name of its own: the dialog's default "Copy of <name>" is the name the card's Make a copy
     row already used in this file, and a second copy under it is refused ("… exists already;
     pick another name", the local gate run of the fix round); the name carries a tag of this run,
     because the preview and production share one Blob store and another pipeline's run of this
     file holding "<name> without notes" refused both runs of the features round's ship two */
  const nameField = ctl(page, 'dialog.makeCopy.name');
  await nameField.click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(`${deckName} without notes ${Date.now().toString(36).slice(-4)}`, {
    delay: 40,
  });
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
// the return round's rows (docs/archive/rounds/RETURN.md 2.17, section 5)

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
 * The deck's bundle (the product's own transfer file), downloaded from the deck's editor through
 * File > Download > More formats > Turboslide bundle, the way `export.zip.bundle` reads it. Since docs/archive/rounds/POLISH.md
 * item 85 the card's Download is the PowerPoint, a PK file with no `manifest.json`, which the
 * upload rows read as "Not a deck bundle" twice in the polish round's run of record (B5's R21 to
 * B6, landed by the ship step's third attempt). The bundle row sits behind Advanced tools on
 * some builds; `reachMenuRow` switches it on and the caller's row switches it back.
 */
async function bundleBytes(p: Page, id: string): Promise<Buffer> {
  await openEditor(p, id);
  const switched = await reachMenuRow(
    p,
    'file',
    'file.download',
    'file.download.more',
    'file.download.zip',
  );
  const zip = await download(
    p,
    () => menuPath(p, 'file', 'file.download', 'file.download.more', 'file.download.zip'),
    60_000,
  );
  expect(zip.bytes.subarray(0, 2).toString('latin1'), 'a zip').toBe('PK');
  if (switched) await switchOff(p);
  return zip.bytes;
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
  /* the product round's gallery page (docs/archive/rounds/PRODUCT.md section 5, B5b): /decks/templates with
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
  /* a narrowed run (`--rows`) runs this row without `decks.trash.listed-after-move`, which is what
     puts the deck in the trash (the polish round's once rerun read the restore's click waiting to
     the bound; B5's R25 to B6, landed by the ship step's third attempt): the row trashes the deck
     itself when the trash lists no card, the way `decks.trash.delete-forever-button` does */
  await gotoTrash();
  if ((await ctl(page, `trash.card.${deck}`).count()) === 0) {
    await trashFromEditor(deck);
    await gotoTrash();
  }
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

/** Whether this deployment offers an anonymous visitor a sign in method: the /decks bar says what
    its loader read (Round 1, docs/NEXT.md 4.1.3 items 10 and 11). */
async function signInOffered(p: Page = page): Promise<boolean> {
  await p.goto('/decks');
  await p.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  return (await p.locator('.ts-appbar-end').getAttribute('data-sign-in')) === 'offered';
}

test(title('decks.access.unknown-edit'), async () => {
  const res = await page.goto('/edit/no-such-deck-core-spec');
  expect(res?.status()).toBe(404);
  await expect(ctl(page, 'access.page')).toBeVisible();
  await expect(ctl(page, 'access.sentence')).toContainText(/not available to you|does not exist/);
  /* Round 1 (docs/NEXT.md 4.1.3 item 11): the sign in link where a method exists, none without */
  const offered = await (async () => {
    const other = await context.newPage();
    try {
      return await signInOffered(other);
    } finally {
      await other.close();
    }
  })();
  if (offered) await expect(ctl(page, 'access.signin.decks')).toBeVisible();
  else await expect(ctl(page, 'access.signin.decks')).toHaveCount(0);
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
  /* Round 1 (docs/NEXT.md 4.1.3 item 11): the sentence exists only where a method does */
  if (!(await signInOffered())) {
    await page.goto('/edit/no-such-deck-core-spec');
    await ctl(page, 'access.page').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await expect(ctl(page, 'access.signin.decks')).toHaveCount(0);
    return;
  }
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
// the product round's rows (docs/archive/rounds/PRODUCT.md section 2 ranks 4, 15, 16, 20, 22 and 26, sections
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
  /* item 75: the opened deck is a card of the list (no Recent row since the polish round) */
  const listedBefore = await ctl(page, `home.card.${deck}`).count();
  await trashFromEditor(deck);
  await gotoDecks();
  const listedAfter = await ctl(page, `home.card.${deck}`).count();
  test.info().annotations.push({
    type: 'recent',
    description: `listed before ${listedBefore}, after the trash ${listedAfter}`,
  });
  await gotoTrash();
  await restoreFromTrash(deck);
  expect(listedBefore, 'the opened deck is a card of the list').toBeGreaterThan(0);
  expect(listedAfter, 'the trashed deck leaves the list').toBe(0);
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
    test.skip(
      true,
      'not on this build: home.recent.sentence (docs/archive/rounds/PRODUCT.md 7.1, B1)',
    );
  await expect(sentence).toContainText(/this browser/);
  await expect(sentence).toContainText(/On another computer/);
});

test(title('decks.home.seller-lead'), async ({ browser }) => {
  test.setTimeout(90_000);
  /* the landing (docs/LANDING.md 2.2, 6.7, the second pass): the h1 is page text in three locked
     lines, its text the standing sentence; in a fresh context (no visit recorded) the lead's first
     sentence is the first visit sentence; the second hero button opens the GT brand deck */
  const fresh = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const p = await fresh.newPage();
    await p.goto('/home');
    await p.locator('main[data-hydrated]').waitFor({ timeout: 30_000 });
    if (OIDC)
      await p.evaluate(() => {
        for (const rules of document.querySelectorAll('script[type="speculationrules"]'))
          rules.remove();
      });
    const h1 = await p.locator('main h1').first().textContent();
    expect(h1?.replace(/\s+/g, ' ').trim(), "the h1 reads the seller's sentence").toBe(HOME_H1);
    const lines = (await p.locator('main h1 .ts-h1-line').allTextContents()).map((l) => l.trim());
    expect(lines, 'three locked lines').toEqual([
      'Build the pitch,',
      'present it and',
      'send the link',
    ]);
    const lead = await p.locator('[data-band="hero"] .ts-hero-lead').first().textContent();
    expect(
      lead?.replace(/\s+/g, ' ').trim().startsWith('Turboslide is a slides editor in the browser.'),
      "the lead begins with the first visit's sentence",
    ).toBe(true);
    const deckButton = p.locator('[data-band="hero"] a[href="/deck/gt-brand"]').first();
    await expect(deckButton, 'the second button opens the example deck').toHaveText(
      'Open the Example Deck',
    );
    await deckButton.click();
    await p.waitForURL(/\/deck\/gt-brand/, { timeout: 20_000 });
  } finally {
    await fresh.close();
  }
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
     browser opened reads "Opened 2 hours ago" instead (docs/archive/rounds/PRODUCT.md 3.6, decks.index.tsx
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
  test.info().annotations.push({
    type: 'card',
    description: `when "${facts.when}"; list row ${rowHeight} px`,
  });
  /* Round 1 (docs/NEXT.md 4.1.3 item 10): the ruled rows carry the 64 by 36 thumbnail */
  expect(rowHeight, "the list view's rows are 56 px").toBe(56);
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
  /* docs/archive/rounds/POLISH.md 2.7 item 97: Empty trash is a text button like Restore and Delete forever
     (`is-solid` dropped by B5; `decks.trash.empty-not-primary` reads the same control), so the
     page draws no solid button. The ship's run of record read `solid []` twice against the row's
     older words (the polish fix round 3, B6) */
  expect(facts.solid, 'no solid button on the trash page (item 97)').toEqual([]);
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
    /* Title Case on every button since Round 1 (docs/NEXT.md 4.1.2 "Buttons") */
    expect(facts.linksText, 'the links read Your Presentations and New Presentation').toMatch(
      /Your Presentations/,
    );
    expect(facts.linksText).toMatch(/New Presentation/);
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
  /* Title Case on every button since Round 1 (docs/NEXT.md 4.1.2 "Buttons") */
  expect(facts.map((f) => f.text)).toEqual([
    'New Presentation',
    'Your Presentations',
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
      `not on this build: templates.page (docs/archive/rounds/PRODUCT.md 7.1, B5b); /decks/templates answered ${res?.status() ?? 'nothing'}`,
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
  const copy = await openGtBrandCopy(page, 60_000);
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

// ---------------------------------------------------------------------------------------------
// the polish round (docs/archive/rounds/POLISH.md 2.7 and section 3, 5.1 `decks.*` with the driver
// core/decks.spec.ts): the home page remade, judged from the DOM's boxes at three widths in both
// appearances, its copy against 3.1, its pictures, its links and its card, its load and its
// layout shift (a measure row); and the list and the trash: the Recent row keeping this
// browser's deck, one card per deck renamed everywhere, Move to trash leaving at once, the
// titles' ellipsis, the card's PowerPoint, the Upload drop zone, Back restoring the list, a
// thumbnail or a plate on every card, Enter confirming Delete forever, the rename field, Empty
// trash not primary, the thumbnail route never 502 and the pages' small words and states.

const HOME_H1 = 'Build the pitch, present it and send the link';
/** The report words of 3.1 that never appear on the page. */
const HOME_REPORT_WORDS = [
  'Advanced tools',
  'default view',
  'acceptance',
  'audit',
  'verification',
  'revision',
];
type HomeTheme = 'light' | 'dark';
const HOME_WIDTHS: readonly { width: number; height: number }[] = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

/** A fresh context on /home at a viewport in an appearance, with the layout shift and long frame observers armed before the load. */
async function homeContext(
  browser: import('@playwright/test').Browser,
  size: { width: number; height: number },
  theme: HomeTheme,
): Promise<{ context: BrowserContext; page: Page }> {
  const fresh = await browser.newContext({ extraHTTPHeaders, viewport: size });
  const p = await fresh.newPage();
  await p.addInitScript((value) => {
    try {
      localStorage.setItem('gt-theme', value);
    } catch {
      // private mode
    }
  }, theme);
  await p.addInitScript(() => {
    const w = window as unknown as {
      __cls: number[];
      __loaf: number[];
      __lcp: { ms: number; element: string } | null;
      __pressedEarly: string | null;
    };
    w.__cls = [];
    w.__loaf = [];
    w.__lcp = null;
    w.__pressedEarly = null;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        })[])
          if (!entry.hadRecentInput) w.__cls.push(Number((entry.value ?? 0).toFixed(4)));
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // no layout shift entries in this browser
    }
    try {
      /* LCP entries reach an observer alone (getEntriesByType lists none); the last entry is the
         candidate that stood when the first input or the read arrived */
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          element?: Element;
          renderTime?: number;
          loadTime?: number;
        })[]) {
          const el = entry.element;
          w.__lcp = {
            ms: Math.round(entry.renderTime || entry.loadTime || entry.startTime),
            element: el
              ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-shot') ? `[${el.getAttribute('data-shot')}]` : ''}`
              : '',
          };
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // no LCP entries in this browser
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__loaf.push(Math.round(entry.duration));
      }).observe({ type: 'long-animation-frame', buffered: true });
    } catch {
      // no long animation frame entries in this browser
    }
    setTimeout(() => {
      const pressed = [
        ...document.querySelectorAll('[data-control^="home.theme"][aria-pressed="true"]'),
      ].map((el) => el.getAttribute('data-control') ?? '');
      w.__pressedEarly = pressed.join(',');
    }, 150);
  });
  return { context: fresh, page: p };
}
async function homeOpen(p: Page): Promise<number> {
  const t0 = Date.now();
  const response = await p.goto('/home');
  expect(response?.status(), '/home answers 200').toBe(200);
  await p
    .locator('main.ts-product[data-hydrated], main[data-hydrated]')
    .first()
    .waitFor({ timeout: 30_000 });
  await p.evaluate(() => document.fonts.ready);
  return Date.now() - t0;
}
async function homeScroll(p: Page): Promise<void> {
  const height = await p.evaluate(() => document.documentElement.scrollHeight);
  const vh = await p.evaluate(() => innerHeight);
  for (let y = 0; y < height - vh; y += 640) {
    await p.mouse.wheel(0, 640);
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(400);
}
/**
 * The widths LANDING.md section 2 gives each slide instance, at 1,024 px of content and at 358
 * (the second pass: the hero frame's slide 540 and 326; the agents band's slide 5 above the console
 * at 588 and 358 from V3#13, 2.9).
 */
const HOME_SHEET_WIDTHS: Readonly<Record<string, readonly [number, number]>> = {
  hero: [540, 326],
  agents: [588, 358],
  'tailor-stage': [856, 358],
  'tailor-thumb-title': [144, 80],
  'tailor-thumb-plan': [144, 80],
  'tailor-thumb-gets': [144, 80],
  'tailor-thumb-ships': [144, 80],
  'tailor-thumb-next-steps': [144, 80],
  canvas: [1024, 358],
  present: [588, 358],
  close: [1024, 358],
};
/** The narrowest width the page holds without a sideways scroll (docs/LANDING.md 5, 2.1). */
const HOME_NARROWEST = { width: 320, height: 640 };

test(title('decks.home.pictures-three-widths'), async ({ browser }) => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  const notes: string[] = [];
  for (const size of [...HOME_WIDTHS, HOME_NARROWEST])
    for (const theme of ['dark', 'light'] as const) {
      const { context: fresh, page: p } = await homeContext(browser, size, theme);
      try {
        await homeOpen(p);
        /* every band's chunk, so the slides below the first screen are in place */
        await homeScroll(p);
        const narrow = size.width < 720;
        const facts = await p.evaluate(() => {
          const sheets = [...document.querySelectorAll<HTMLElement>('main [data-sheet]')].map(
            (el) => {
              const r = el.getBoundingClientRect();
              return {
                sheet: el.getAttribute('data-sheet') ?? '',
                w: Math.round(r.width * 10) / 10,
                h: Math.round(r.height * 10) / 10,
              };
            },
          );
          const seam = document.querySelector<HTMLElement>('[data-seam-root] .ts-seam-box');
          /* a filmstrip that scrolls inside its frame (2.2, 2.7) holds thumbnails past the
             viewport's edge, clipped by the scroller: they cross nothing the reader sees */
          const inScroller = (el: Element) => {
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              if (getComputedStyle(a).overflowX === 'visible') continue;
              const r = a.getBoundingClientRect();
              if (r.left >= -1 && r.right <= innerWidth + 1) return true;
            }
            return false;
          };
          const wide = [...document.querySelectorAll('main *')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !inScroller(el);
          }).length;
          return {
            sheets,
            seam: seam ? Math.round(seam.getBoundingClientRect().width) : null,
            wide,
            height: document.documentElement.scrollHeight,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        const label = `${size.width} ${theme}`;
        notes.push(
          `${label}: height ${facts.height}, sheets ${facts.sheets.map((s) => `${s.sheet} ${s.w}`).join(', ')}, seam ${facts.seam}, wide ${facts.wide}`,
        );
        for (const [sheet, [wideW, narrowW]] of Object.entries(HOME_SHEET_WIDTHS)) {
          /* at 320 the column is 288 px: the widths are read at the three widths of section 2 */
          if (size.width < 390) break;
          const found = facts.sheets.find((s) => s.sheet === sheet);
          const want = narrow ? narrowW : wideW;
          if (!found) failures.push(`${label}: no ${sheet} slide`);
          else {
            if (Math.abs(found.w - want) > 1.5)
              failures.push(`${label}: ${sheet} is ${found.w} px wide (section 2 says ${want})`);
            if (Math.abs(found.h - (found.w * 9) / 16) > 1.5)
              failures.push(`${label}: ${sheet} is ${found.w} by ${found.h}, not 16 by 9`);
          }
        }
        const seamWant = narrow ? 358 : 1024;
        if (size.width >= 390 && (facts.seam === null || Math.abs(facts.seam - seamWant) > 1.5))
          failures.push(
            `${label}: the export slide is ${facts.seam} px wide (section 2 says ${seamWant})`,
          );
        if (facts.overflow || facts.wide > 0)
          failures.push(`${label}: ${facts.wide} elements wider than the viewport`);
        /* question 11: under 14,000 px at 1440 (and 1280), 15,000 at 390 */
        if (facts.height >= (narrow ? 15_000 : 14_000))
          failures.push(`${label}: the page is ${facts.height} px tall`);
      } finally {
        await fresh.close();
      }
    }
  test.info().annotations.push({ type: 'home', description: notes.join(' | ') });
  expect(failures, 'the widths of docs/LANDING.md section 2 at 1440, 1280 and 390').toEqual([]);
});

test(title('decks.home.copy-rules'), async ({ browser }) => {
  test.setTimeout(240_000);
  /* copy.test.ts with the rules of LANDING.md 2.17, run from the checkout beside the spec */
  const root = resolve(import.meta.dirname, '..', '..', '..', '..');
  const vitest = spawnSync(
    resolve(root, 'node_modules', '.bin', 'vitest'),
    ['run', 'apps/studio/src/components/home/copy.test.ts'],
    { cwd: root, encoding: 'utf8', timeout: 180_000 },
  );
  const tail = `${vitest.stdout ?? ''}${vitest.stderr ?? ''}`
    .split('\n')
    .filter((l) => /Tests|Test Files|FAIL|✓|×/.test(l))
    .slice(-6)
    .join(' | ');
  test
    .info()
    .annotations.push({ type: 'copy.test.ts', description: `exit ${vitest.status}: ${tail}` });
  const { context: fresh, page: p } = await homeContext(
    browser,
    { width: 1440, height: 900 },
    'dark',
  );
  try {
    await homeOpen(p);
    const copy = await p.evaluate(() => {
      const main = document.querySelector('main.ts-product, main') as HTMLElement;
      const headings = [...main.querySelectorAll('h1, h2')].map((h) =>
        (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
      /* the page's own copy: outside the slides, the two panels, Version history's rows, the
         editor frame's drawn chrome, the features table's shortcuts and the Tailor dialog's
         product strings (LANDING.md 2.17); the export band's Editable text side is slide 7 as
         the PowerPoint file holds it, so it counts as a slide */
      const clone = main.cloneNode(true) as HTMLElement;
      for (const el of clone.querySelectorAll(
        'script, style, template, [data-home-slides], .ts-seam-editable, .ts-home-panel, [data-history], [data-tailor-from], [data-tailor-count], [data-tailor-apply], .ts-tailor-dialog .ts-row-key, .ts-slide-row-title, [data-hero-title], [data-hero-counter], [data-hero-thumb], [aria-hidden="true"], kbd, .ts-sr, .ts-skip, [hidden]',
      ))
        el.remove();
      document.body.append(clone);
      const prose = clone.innerText;
      clone.remove();
      return { headings, prose };
    });
    const words = copy.prose.trim().split(/\s+/).filter(Boolean).length;
    const commaHeadings = copy.headings.filter(
      (h, index) =>
        h.includes(',') && (index > 0 || /,\s+(in|on|at|with|from|which|that)\b/.test(h)),
    );
    const report = HOME_REPORT_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(copy.prose));
    const paths = copy.prose.match(/\b[\w-]+\/[\w./-]+/g) ?? [];
    test.info().annotations.push({
      type: 'copy',
      description: `${words} words of the page's own copy; ${copy.headings.length} headings; semicolons ${(copy.prose.match(/;/g) ?? []).length}; report words ${report.join(', ') || 'none'}; paths ${paths.join(', ') || 'none'}`,
    });
    expect(vitest.status, 'copy.test.ts passes').toBe(0);
    expect(words, 'under 750 words').toBeLessThan(750);
    expect(copy.prose, 'no semicolon').not.toContain(';');
    expect(commaHeadings, 'no comma in a heading').toEqual([]);
    expect(report, 'no report word').toEqual([]);
    expect(paths, 'no file path outside the panel').toEqual([]);
    expect(copy.prose, 'never pixel for pixel').not.toMatch(/pixel for pixel/i);
  } finally {
    await fresh.close();
  }
});

test(title('decks.home.product-pictures'), async ({ browser }) => {
  test.setTimeout(240_000);
  /* every slide on /home is the renderSlide output of the page deck built from
     apps/studio/home-deck, and every picture a file part or a still in assets.json or an inlined
     still of slides.generated.ts: build-home-assets.ts --check exits 0 (LANDING.md 6.7) */
  const root = resolve(import.meta.dirname, '..', '..', '..', '..');
  const check = spawnSync(process.execPath, ['scripts/build-home-assets.ts', '--check'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
  });
  const tail = `${check.stdout ?? ''}${check.stderr ?? ''}`
    .trim()
    .split('\n')
    .slice(-2)
    .join(' | ');
  test.info().annotations.push({
    type: 'build-home-assets --check',
    description: `exit ${check.status}: ${tail}`,
  });
  const failures: string[] = [];
  const notes: string[] = [];
  for (const theme of ['dark', 'light'] as const) {
    const { context: fresh, page: p } = await homeContext(
      browser,
      { width: 1440, height: 900 },
      theme,
    );
    try {
      await homeOpen(p);
      await homeScroll(p);
      await p.waitForTimeout(1500);
      const facts = await p.evaluate(() => {
        const roots = [...document.querySelectorAll<HTMLElement>('main [data-home-slides]')];
        const pictures = [...document.querySelectorAll<HTMLImageElement>('main img')]
          .filter((img) => img.getBoundingClientRect().width > 0)
          .map((img) => img.getAttribute('src') ?? '');
        const masks = [...document.querySelectorAll<HTMLElement>('main [data-field]')].map(
          (el) =>
            `${el.getAttribute('data-field')} ${getComputedStyle(el).getPropertyValue('--ts-still').slice(0, 40)}`,
        );
        return {
          instances: roots.map(
            (r) => `${r.getAttribute('data-instance')}=${r.getAttribute('data-slide')}`,
          ),
          themes: roots.filter((r) => r.hasAttribute('data-theme')).length,
          pictures,
          masks,
        };
      });
      notes.push(
        `${theme}: ${facts.instances.length} instances (${facts.instances.join(', ')}); pictures ${facts.pictures.join(', ')}; fields ${facts.masks.join('; ')}`,
      );
      /* the first screen's ten (the hero frame's slide and its nine thumbnails) and every band's */
      const nine = [
        'title',
        'plan',
        'gets',
        'ships',
        'next-steps',
        'lighthouse',
        'field',
        'pattern',
        'close',
      ];
      if (facts.instances.length < 10)
        failures.push(`${theme}: ${facts.instances.length} slide instances, fewer than 10`);
      for (const instance of facts.instances)
        if (!nine.includes(instance.split('=')[1] ?? ''))
          failures.push(`${theme}: the instance ${instance} draws no slide of the page deck`);
      if (facts.themes > 0)
        failures.push(`${theme}: ${facts.themes} slides carry their own data-theme`);
      for (const src of facts.pictures)
        if (!/^\/home\/[a-z-]+-[0-9a-f]{10}\.(webp|png|jpg)$/.test(src))
          failures.push(`${theme}: the picture ${src} is not a hashed file of assets.json`);
      if (facts.pictures.length === 0) failures.push(`${theme}: no picture shown`);
    } finally {
      await fresh.close();
    }
  }
  test.info().annotations.push({ type: 'pictures', description: notes.join(' | ') });
  expect(check.status, 'build-home-assets.ts --check exits 0').toBe(0);
  expect(failures).toEqual([]);
});

test(title('decks.home.links-and-card'), async ({ browser, request }) => {
  test.setTimeout(240_000);
  const { context: fresh, page: p } = await homeContext(
    browser,
    { width: 1440, height: 900 },
    'dark',
  );
  try {
    await homeOpen(p);
    const links = await p.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map(
        (a) => a.getAttribute('href') ?? '',
      ),
    );
    const seen = new Set<string>();
    const failures: string[] = [];
    let checked = 0;
    for (const href of links) {
      if (href.startsWith('#') || seen.has(href) || href.startsWith('mailto:')) continue;
      seen.add(href);
      try {
        const res = await request.get(href.startsWith('/') ? href : href, {
          maxRedirects: 5,
          headers: href.startsWith('/') ? extraHTTPHeaders : {},
        });
        checked += 1;
        if (res.status() !== 200) failures.push(`${href} ${res.status()}`);
      } catch (error) {
        failures.push(
          `${href} ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      }
    }
    const meta = await p.evaluate(() => ({
      url: document.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null,
      image: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null,
    }));
    const card = meta.image ? await fetchBytes(p, meta.image) : null;
    const size = card ? pngSize(card.bytes) : null;
    /* the footer lockup after a full scroll */
    await homeScroll(p);
    const before = await p.evaluate(() => scrollY);
    const lockup = p.locator('[data-control="home.foot.lockup"], footer a[href="#top"]').first();
    await lockup.click();
    await p.waitForTimeout(600);
    const after = await p.evaluate(() => scrollY);
    test.info().annotations.push({
      type: 'links',
      description: `${checked} links checked; og:url ${meta.url}; og:image ${meta.image} (${card ? `${card.status} ${card.contentType} ${size ? `${size.width} by ${size.height}` : 'not a PNG'}` : 'unread'}); the lockup scrolled ${before} -> ${after}`,
    });
    expect(failures, 'every href answers 200').toEqual([]);
    expect(meta.url ?? '', 'og:url names www.turboslide.com').toContain('www.turboslide.com');
    expect(meta.image ?? '', 'og:image names www.turboslide.com').toContain('www.turboslide.com');
    expect(card?.status, 'the card answers').toBe(200);
    expect(size, 'the card is 1200 by 630').toEqual({ width: 1200, height: 630 });
    expect(after, 'the footer lockup scrolls to the top').toBe(0);
  } finally {
    await fresh.close();
  }
});

/* A cold load of /home at 1440 by 900 in the dark appearance in a node process of its own, through
   playwright-core, which the runner does not trace: the pictures requested and the long animation
   frames before the first scroll. The runner's trace (`trace: 'retain-on-failure'`, which this
   file keeps) snapshots the page by reading every element's computed style, which resolves the
   canvas band's mask under `content-visibility: auto` and requests its still. Read on 2026-10-04
   against the node-server build of d6f02a18: traced, the lighthouse's still (4,592 B) at 201 to
   209 ms from the CSS in 3 of 3 loads; untraced, or traced without DOM snapshots, none in 3 of 3
   (the integrator's fixer, build/integrator.md "Landing second pass, fix round"). */
const COLD_HOME = `
const { chromium } = await import('playwright-core');
const oidc = process.env.VERCEL_OIDC_TOKEN;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {} });
await context.addInitScript(() => {
  try { localStorage.setItem('gt-theme', 'dark'); } catch {}
  window.__loaf = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__loaf.push(Math.round(entry.duration));
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
});
const page = await context.newPage();
await page.goto(new URL('/home', process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321').href);
await page.locator('main#top[data-hydrated]').waitFor({ timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);
const facts = await page.evaluate(() => {
  const pictures = performance.getEntriesByType('resource')
    .filter((r) => r.initiatorType === 'img' || /\\.(png|jpe?g|webp|avif|svg)(\\?|$)/.test(r.name));
  return {
    pictures: pictures.reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0),
    paths: pictures.map((r) => new URL(r.name).pathname),
    longFrames: window.__loaf.filter((d) => d > 100),
  };
});
await browser.close();
process.stdout.write(JSON.stringify(facts));
`;

function coldHome(): { pictures: number; paths: string[]; longFrames: number[] } {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', COLD_HOME], {
    cwd: resolve(import.meta.dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (run.status !== 0) throw new Error(`the cold load exited ${run.status}: ${run.stderr}`);
  return JSON.parse(run.stdout) as { pictures: number; paths: string[]; longFrames: number[] };
}

test(title('decks.home.load-budget'), async ({ browser }) => {
  test.setTimeout(240_000);
  /* a measure row (docs/LANDING.md 4.1, the budgets of the landing): its numbers are recorded
     beside their lines; the document is reported against 60 KB until audit item 13 serves the
     renderer's CSS as a file (Kevin's answer 10), and the gating lines are home.budget.*; the
     pictures and the long frames before the first scroll are read cold (`coldHome`) */
  const cold = coldHome();
  const { context: fresh, page: p } = await homeContext(
    browser,
    { width: 1440, height: 900 },
    'dark',
  );
  try {
    const readyMs = await homeOpen(p);
    await p.waitForTimeout(1500);
    const before = await p.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const pictures = resources.filter(
        (r) => r.initiatorType === 'img' || /\.(png|jpe?g|webp|avif|svg)(\?|$)/.test(r.name),
      );
      const decodedJs = resources
        .filter((r) => r.initiatorType === 'script' || /\.m?js(\?|$)/.test(r.name))
        .reduce((n, r) => n + (r.decodedBodySize || 0), 0);
      const w = window as unknown as {
        __loaf: number[];
        __lcp: { ms: number; element: string } | null;
      };
      return {
        ttfb: nav ? Math.round(nav.responseStart) : null,
        documentBytes: nav ? nav.decodedBodySize || nav.transferSize : null,
        pictures: pictures.reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0),
        pictureCount: pictures.length,
        js: decodedJs,
        lcp: w.__lcp?.ms ?? 0,
        lcpElement: w.__lcp?.element ?? '',
        longFrames: w.__loaf.filter((d) => d > 100),
      };
    });
    await homeScroll(p);
    await p.waitForTimeout(1500);
    const after = await p.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return resources
        .filter(
          (r) => r.initiatorType === 'img' || /\.(png|jpe?g|webp|avif|svg)(\?|$)/.test(r.name),
        )
        .reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0);
    });
    const lines = [
      `first byte ${before.ttfb} ms (line 150)`,
      `LCP ${before.lcp} ms on ${before.lcpElement || 'no element'} (line 400 cold, the h1)`,
      `ready ${readyMs} ms (line 500)`,
      `pictures before the first scroll ${cold.pictures} B in ${cold.paths.length} requests, read cold (line 0)${cold.paths.length > 0 ? `: ${cold.paths.join(', ')}` : ''}`,
      `pictures after a full scroll ${after} B (line 200000)`,
      `document ${before.documentBytes} B decoded (reported against 60000 until audit item 13; gated at 100000 by home.budget.bytes-first)`,
      `long animation frames over 100 ms ${cold.longFrames.length}, read cold${cold.longFrames.length > 0 ? ` (${cold.longFrames.join(', ')} ms)` : ''}`,
      `JavaScript decoded ${before.js} B (reported against 600000)`,
      `under the runner's trace: pictures before the first scroll ${before.pictures} B in ${before.pictureCount} requests; long animation frames over 100 ms ${before.longFrames.length}`,
    ];
    for (const line of lines) test.info().annotations.push({ type: 'measure', description: line });
    expect(before.ttfb ?? 9999, lines[0]).toBeLessThanOrEqual(150);
    expect(before.lcp, lines[1]).toBeLessThanOrEqual(400);
    expect(/^h1/.test(before.lcpElement), lines[1]).toBe(true);
    expect(readyMs, lines[2]).toBeLessThanOrEqual(500);
    expect(cold.paths, lines[3]).toEqual([]);
    expect(after, lines[4]).toBeLessThanOrEqual(200_000);
    expect(cold.longFrames, lines[6]).toEqual([]);
  } finally {
    await fresh.close();
  }
});

test(title('decks.home.layout-shift'), async ({ browser }) => {
  test.setTimeout(300_000);
  /* CLS 0 at the three widths in both appearances over the load, a full scroll and the bands'
     resting states (docs/LANDING.md 4.1; the hero sequence and the in view motions join with
     their pushes, which hold this row) */
  const failures: string[] = [];
  const notes: string[] = [];
  for (const size of HOME_WIDTHS)
    for (const theme of ['dark', 'light'] as const) {
      const { context: fresh, page: p } = await homeContext(browser, size, theme);
      try {
        await homeOpen(p);
        await p.waitForTimeout(5000);
        await homeScroll(p);
        await p.waitForTimeout(1000);
        const facts = await p.evaluate(() => {
          const w = window as unknown as { __cls: number[]; __pressedEarly: string | null };
          const pressed = [
            ...document.querySelectorAll('[data-control^="home.theme"][aria-pressed="true"]'),
          ]
            .map((el) => el.getAttribute('data-control') ?? '')
            .join(',');
          return {
            cls: w.__cls.reduce((a, b) => a + b, 0),
            shifts: w.__cls.length,
            early: w.__pressedEarly,
            hydrated: pressed,
          };
        });
        const label = `${size.width} ${theme}`;
        notes.push(
          `${label}: CLS ${facts.cls.toFixed(4)} over ${facts.shifts} shifts; pressed at 150 ms "${facts.early}", hydrated "${facts.hydrated}"`,
        );
        if (facts.cls > 0) failures.push(`${label}: CLS ${facts.cls.toFixed(4)}`);
        if (facts.early !== facts.hydrated)
          failures.push(
            `${label}: the pressed appearance at 150 ms (${facts.early}) differs from the hydrated one (${facts.hydrated})`,
          );
      } finally {
        await fresh.close();
      }
    }
  test.info().annotations.push({ type: 'layout shift', description: notes.join(' | ') });
  expect(failures).toEqual([]);
});

// ---- the landing's grammar (docs/LANDING.md 2.0; Round 1's B2a rule kept): the rails, the seams,
// the 58 px bar, no icon before a heading, the monospace on the two #101010 panels alone (the hero's
// terminal and the agents band's console, LANDING.md 2.0 "The two panels"), and no sheet
// wider than a thumbnail drawing a frame

/** The selection colour, which /home draws only while something is being worked on (answer 3). */
const SELECTION_BLUE = 'rgb(47, 92, 224)';

test(title('decks.home.grammar'), async ({ browser }) => {
  test.setTimeout(240_000);
  const failures: string[] = [];
  const notes: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    const { context: fresh, page: p } = await homeContext(
      browser,
      { width: 1440, height: 900 },
      theme,
    );
    try {
      await homeOpen(p);
      /* every band's chunk in place, so the sheets below the first screen are read filled */
      await homeScroll(p);
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(400);
      const facts = await p.evaluate(() => {
        const num = (v: string) => Math.round(parseFloat(v) * 100) / 100;
        const rails = [...document.querySelectorAll<HTMLElement>('main.ts-product .ts-rails')].map(
          (el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
              left: Math.round(r.left),
              width: Math.round(r.width),
              borders: `${cs.borderLeftWidth} ${cs.borderLeftStyle} ${cs.borderRightWidth} ${cs.borderRightStyle}`,
            };
          },
        );
        const page = document.documentElement.scrollHeight;
        const others = [...document.querySelectorAll<HTMLElement>('main.ts-product *')]
          .filter((el) => !el.classList.contains('ts-rails'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return (
              r.height > page * 0.5 &&
              (parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0)
            );
          }).length;
        const crosses = [...document.querySelectorAll<HTMLElement>('main.ts-product .ts-seam')].map(
          (el) => {
            const r = el.getBoundingClientRect();
            const own = getComputedStyle(el);
            const padBottom = r.bottom - parseFloat(own.borderBottomWidth);
            const one = (pseudo: '::before' | '::after') => {
              const cs = getComputedStyle(el, pseudo);
              const top = padBottom - parseFloat(cs.bottom) - parseFloat(cs.height);
              return {
                w: num(cs.width),
                h: num(cs.height),
                x: Math.round(r.left + parseFloat(cs.left) + 4),
                y: Math.round(top + 4),
              };
            };
            return {
              band: el.getAttribute('data-band') ?? el.className.split(' ')[0] ?? '',
              seam: Math.round(r.bottom) - 1,
              before: one('::before'),
              after: one('::after'),
            };
          },
        );
        const nav = document.querySelector<HTMLElement>('.ts-product-nav-row');
        const headings = [...document.querySelectorAll<HTMLElement>('main h1, main h2')].map(
          (h) => ({
            text: (h.textContent ?? '').trim(),
            svg: h.querySelectorAll('svg').length,
            before: h.previousElementSibling?.tagName.toLowerCase() === 'svg',
          }),
        );
        const panel = document.querySelector<HTMLElement>('.ts-home-panel');
        const panelFacts = panel
          ? {
              background: getComputedStyle(panel).backgroundColor,
              color: getComputedStyle(panel).color,
              font: getComputedStyle(panel).fontFamily,
              count: document.querySelectorAll('.ts-home-panel').length,
            }
          : null;
        const mono = [...document.querySelectorAll<HTMLElement>('main.ts-product *')].filter(
          (el) =>
            el.closest('.ts-home-panel') === null &&
            el.closest('[data-home-slides]') === null &&
            /monospace|Menlo|Consolas|SF Mono/.test(getComputedStyle(el).fontFamily) &&
            (el.textContent ?? '').trim() !== '',
        ).length;
        /* no sheet wider than a thumbnail draws a frame; a thumbnail keeps its 1 px edge */
        const frames = [...document.querySelectorAll<HTMLElement>('main [data-sheet]')].map(
          (el) => {
            const sheet = el.querySelector<HTMLElement>('.ts-sheet');
            const cs = sheet ? getComputedStyle(sheet) : null;
            const after = getComputedStyle(el, '::after');
            return {
              sheet: el.getAttribute('data-sheet') ?? '',
              thumb: el.classList.contains('is-thumb'),
              /* the chosen thumbnail (the stage's slide) draws a 2 px ink edge in place of the 1 px */
              chosen: el.closest('[data-selected]') !== null,
              border: cs ? parseFloat(cs.borderTopWidth) : -1,
              shadow: cs ? cs.boxShadow : '',
              edge: after.content !== 'none' ? parseFloat(after.borderTopWidth) : 0,
            };
          },
        );
        return {
          rails,
          others,
          crosses,
          navHeight: nav ? Math.round(nav.getBoundingClientRect().height) : null,
          headings,
          panel: panelFacts,
          mono,
          frames,
        };
      });
      const label = `1440 ${theme}`;
      notes.push(
        `${label}: rails ${JSON.stringify(facts.rails)}, other long side lines ${facts.others}, ${facts.crosses.length} seams, nav ${facts.navHeight} px, panel ${JSON.stringify(facts.panel)}, monospace outside the panel ${facts.mono}, frames ${facts.frames.map((f) => `${f.sheet} ${f.border}/${f.edge}`).join(', ')}`,
      );
      if (facts.rails.length !== 1) failures.push(`${label}: ${facts.rails.length} rail elements`);
      const rail = facts.rails[0];
      if (rail !== undefined) {
        if (rail.left !== 168 || rail.width !== 1104)
          failures.push(`${label}: the rails stand at ${rail.left} and ${rail.left + rail.width}`);
        if (rail.borders !== '1px solid 1px solid')
          failures.push(`${label}: the rails are ${rail.borders}`);
      }
      if (facts.others > 0) failures.push(`${label}: ${facts.others} more long vertical lines`);
      if (facts.crosses.length < 9) failures.push(`${label}: ${facts.crosses.length} seams`);
      for (const c of facts.crosses)
        for (const [side, cross, x] of [
          ['left', c.before, 168],
          ['right', c.after, 1271],
        ] as const) {
          if (cross.w !== 9 || cross.h !== 9)
            failures.push(`${label}: ${c.band} ${side} cross ${cross.w} by ${cross.h}`);
          if (Math.abs(cross.x - x) > 1 || Math.abs(cross.y - c.seam) > 1)
            failures.push(
              `${label}: ${c.band} ${side} cross centred at ${cross.x},${cross.y}, the seam at ${x},${c.seam}`,
            );
        }
      if (facts.navHeight !== 58)
        failures.push(`${label}: the navigation is ${facts.navHeight} px`);
      for (const h of facts.headings)
        if (h.svg > 0 || h.before) failures.push(`${label}: an icon at the heading "${h.text}"`);
      if (facts.panel?.count !== 2)
        failures.push(`${label}: ${facts.panel?.count ?? 0} panels, not 2`);
      if (facts.panel?.background !== 'rgb(16, 16, 16)')
        failures.push(`${label}: the panel sits on ${facts.panel?.background}`);
      if (!/monospace|Menlo|Consolas/.test(facts.panel?.font ?? ''))
        failures.push(`${label}: the panel is set in ${facts.panel?.font}`);
      if (facts.mono > 0)
        failures.push(`${label}: ${facts.mono} monospace runs outside the panels`);
      for (const f of facts.frames) {
        if (f.border !== 0 || (f.shadow !== 'none' && f.shadow !== ''))
          failures.push(
            `${label}: the ${f.sheet} sheet draws a frame (${f.border} px, ${f.shadow})`,
          );
        if (f.thumb && f.edge !== (f.chosen ? 2 : 1))
          failures.push(`${label}: the thumbnail ${f.sheet} has no ${f.chosen ? 2 : 1} px edge`);
        if (!f.thumb && f.edge !== 0) failures.push(`${label}: the ${f.sheet} sheet draws an edge`);
      }
    } finally {
      await fresh.close();
    }
  }
  test.info().annotations.push({ type: 'grammar', description: notes.join(' | ') });
  expect(failures).toEqual([]);
});

test(title('decks.home.capture-plain'), async ({ browser }) => {
  test.setTimeout(240_000);
  /* no selection ring, chip, handle, caret or guide is drawn at rest (docs/LANDING.md 6.7): the
     page, read itself, draws nothing in the selection colour and holds no overlay and no focused
     text field after a full scroll (Kevin's answer 3: the blue only while something is worked on) */
  const failures: string[] = [];
  const notes: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const size of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const { context: fresh, page: p } = await homeContext(browser, size, theme);
      try {
        await homeOpen(p);
        await homeScroll(p);
        await p.waitForTimeout(600);
        const facts = await p.evaluate((blue) => {
          const blues: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>('body *')) {
            const cs = getComputedStyle(el);
            const hits = [
              cs.color,
              cs.backgroundColor,
              parseFloat(cs.borderTopWidth) > 0 ? cs.borderTopColor : '',
              parseFloat(cs.borderLeftWidth) > 0 ? cs.borderLeftColor : '',
              cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? cs.outlineColor : '',
            ];
            if (hits.includes(blue) && el.getBoundingClientRect().width > 0)
              blues.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]}`);
          }
          const active = document.activeElement;
          return {
            blues,
            /* drawn ones: the version view waits hidden in the agents band until a row is shown */
            overlays: [
              ...document.querySelectorAll(
                '.ts-home-sel-layer, [data-live-overlay], .ts-home-guide, .ts-home-ring, .ts-home-flag',
              ),
            ].filter((el) => el.getClientRects().length > 0).length,
            focused: active && active !== document.body ? active.tagName.toLowerCase() : 'none',
          };
        }, SELECTION_BLUE);
        const label = `${size.width} ${theme}`;
        notes.push(
          `${label}: ${facts.blues.length} elements in the selection blue, ${facts.overlays} overlays, focus on ${facts.focused}`,
        );
        if (facts.blues.length > 0)
          failures.push(
            `${label}: the selection blue at rest on ${facts.blues.slice(0, 5).join(', ')}`,
          );
        if (facts.overlays > 0)
          failures.push(`${label}: ${facts.overlays} selection overlays at rest`);
        if (facts.focused !== 'none') failures.push(`${label}: focus at rest on ${facts.focused}`);
      } finally {
        await fresh.close();
      }
    }
  }
  test.info().annotations.push({ type: 'rest', description: notes.join(' | ') });
  expect(failures).toEqual([]);
});

test(title('decks.home.copy'), async ({ browser }) => {
  test.setTimeout(120_000);
  const { context: fresh, page: p } = await homeContext(
    browser,
    { width: 1440, height: 900 },
    'light',
  );
  try {
    await homeOpen(p);
    const copy = await p.evaluate(() => ({
      title: document.title,
      og: document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? null,
      text: (document.querySelector('main') as HTMLElement).innerText,
      attributes: [...document.querySelectorAll('main [aria-label], main [alt]')]
        .map((el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('alt') ?? ''}`)
        .join(' '),
    }));
    const licence = `${copy.text} ${copy.attributes}`.match(/\blicence\b/gi) ?? [];
    test.info().annotations.push({
      type: 'copy',
      description: `title "${copy.title}"; og:title "${copy.og}"; "licence" ${licence.length} times; "license" ${(copy.text.match(/\blicense\b/gi) ?? []).length} times`,
    });
    expect(copy.title).toBe('Turboslide is a slides editor in the browser');
    expect(copy.og).toBe('Turboslide is a slides editor in the browser');
    expect(licence, 'no word on the page reads "licence"').toEqual([]);
  } finally {
    await fresh.close();
  }
});

test(title('decks.home.phone'), async ({ browser }) => {
  test.setTimeout(240_000);
  const failures: string[] = [];
  const notes: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    const { context: fresh, page: p } = await homeContext(
      browser,
      { width: 390, height: 844 },
      theme,
    );
    try {
      await homeOpen(p);
      await p.waitForTimeout(800);
      const facts = await p.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const nav = [
          ...document.querySelectorAll<HTMLElement>(
            '.ts-product-nav-row > *, .ts-product-nav-links > *, .ts-product-nav-signin > *',
          ),
        ]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              control: el.getAttribute('data-control') ?? el.className.split(' ')[0] ?? '',
              left: Math.round(r.left),
              right: Math.round(r.right),
            };
          });
        /* thumbnails clipped by a filmstrip that scrolls inside its frame cross nothing */
        const inScroller = (el: Element) => {
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            if (getComputedStyle(a).overflowX === 'visible') continue;
            const r = a.getBoundingClientRect();
            if (r.left >= -1 && r.right <= width + 1) return true;
          }
          return false;
        };
        const crossing = [...document.querySelectorAll<HTMLElement>('main.ts-product *')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > width + 1 || r.left < -1) && !inScroller(el);
          })
          .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]}`);
        return {
          width,
          scroll: document.documentElement.scrollWidth,
          nav,
          crossing,
        };
      });
      const label = `390 ${theme}`;
      notes.push(
        `${label}: nav ${facts.nav.map((n) => `${n.control} ${n.left}..${n.right}`).join(', ')}; scroll width ${facts.scroll}; crossing ${facts.crossing.length}`,
      );
      for (const n of facts.nav)
        if (n.left < 16 || n.right > facts.width - 16)
          failures.push(`${label}: ${n.control} at ${n.left}..${n.right} leaves the 16 px gutter`);
      if (facts.scroll > facts.width)
        failures.push(`${label}: the page scrolls to ${facts.scroll}`);
      if (facts.crossing.length > 0)
        failures.push(`${label}: ${facts.crossing.slice(0, 6).join(', ')} cross the viewport`);
    } finally {
      await fresh.close();
    }
  }
  test.info().annotations.push({ type: 'phone', description: notes.join(' | ') });
  expect(failures).toEqual([]);
});

// ---- the next program's Round 1 push B2b#16 (docs/NEXT.md 4.1.3 item 10, 4.1.5): /decks as ruled rows

test(title('decks.list.ruled-rows'), async () => {
  test.setTimeout(120_000);
  await gotoDecks();
  const facts = await page.evaluate((id) => {
    const rows = document.querySelector('[data-control="home.rows"]');
    const row = document.querySelector<HTMLElement>(`tr[data-control="home.card.${id}"]`);
    const thumb = row?.querySelector<HTMLElement>('.ts-row-thumb') ?? null;
    const edge = (() => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--pt-edge)';
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    })();
    const box = thumb?.getBoundingClientRect();
    const tcs = thumb ? getComputedStyle(thumb) : null;
    const cells = row ? [...row.querySelectorAll('td')] : [];
    const framed = cells.some((td) => {
      const cs = getComputedStyle(td);
      return (
        parseFloat(cs.borderTopWidth) > 0 ||
        parseFloat(cs.borderLeftWidth) > 0 ||
        parseFloat(cs.borderRightWidth) > 0 ||
        cs.boxShadow !== 'none'
      );
    });
    const rule = cells[0] ? getComputedStyle(cells[0]) : null;
    const strip = document.querySelector('#templates');
    const hatch = strip?.nextElementSibling ?? null;
    const hatchFill = hatch?.querySelector<HTMLElement>('.ts-hatch');
    const signIn = document.querySelector<HTMLElement>('.ts-appbar [data-control="home.signIn"]');
    const scs = signIn ? getComputedStyle(signIn) : null;
    return {
      list: rows !== null,
      cards: document.querySelector('[data-control="home.cards"]') !== null,
      row: row?.tagName.toLowerCase() ?? null,
      thumb: box ? { width: Math.round(box.width), height: Math.round(box.height) } : null,
      thumbBorder: tcs ? `${tcs.borderTopWidth} ${tcs.borderTopStyle} ${tcs.borderTopColor}` : null,
      edge,
      thumbImg: thumb?.querySelector('img')?.getAttribute('src') ?? null,
      framed,
      rule: rule ? `${rule.borderBottomWidth} ${rule.borderBottomStyle}` : null,
      hatchAfterStrip: hatch?.classList.contains('ts-decks-hatch') ?? false,
      hatchImage: hatchFill ? getComputedStyle(hatchFill).backgroundImage : '',
      offered: signIn !== null,
      signIn: signIn
        ? {
            text: (signIn.textContent ?? '').trim(),
            border: scs?.borderTopColor ?? '',
            background: scs?.backgroundColor ?? '',
            tag: signIn.tagName.toLowerCase(),
          }
        : null,
    };
  }, deck);
  /* whether this deployment offers this visitor a sign in method: the bar's end says what the
     loader read (components/home/sign-in.tsx readSignInFacts) */
  const offered =
    (await ctl(page, 'home.signIn').count()) > 0 ||
    (await page.locator('.ts-appbar-end').getAttribute('data-sign-in')) === 'offered';
  test.info().annotations.push({
    type: 'rows',
    description: `rows ${facts.list}, cards ${facts.cards}; the deck's entry a ${facts.row}; thumbnail ${JSON.stringify(facts.thumb)} ${facts.thumbBorder} (edge ${facts.edge}), src ${facts.thumbImg}; a box around the row ${facts.framed}; the row's rule ${facts.rule}; the hatch after the strip ${facts.hatchAfterStrip} (${facts.hatchImage.slice(0, 40)}); sign in offered by the deployment ${offered}, drawn ${JSON.stringify(facts.signIn)}`,
  });
  expect(facts.list, 'the list draws as rows by default').toBe(true);
  expect(facts.cards, 'no card grid by default').toBe(false);
  expect(facts.row, "the deck's entry is a row").toBe('tr');
  expect(facts.thumb, 'a 64 by 36 thumbnail').toEqual({ width: 64, height: 36 });
  expect(facts.thumbBorder, 'framed in the edge role').toBe(`1px solid ${facts.edge}`);
  expect(facts.framed, 'the row is ruled, not boxed').toBe(false);
  expect(facts.rule, 'the row owns its line').toBe('1px solid');
  expect(facts.hatchAfterStrip, 'the hatch strip follows Start a new presentation').toBe(true);
  expect(facts.hatchImage, 'the hatch is drawn').toContain('repeating-linear-gradient');
  if (offered) {
    expect(facts.signIn?.text, 'Sign In as text in the bar').toBe('Sign In');
    expect(facts.signIn?.border, 'no frame around Sign In').toBe('rgba(0, 0, 0, 0)');
  } else {
    /* a deployment without a method draws no Sign In (docs/NEXT.md 3.2 H4's rule) */
    expect(facts.signIn, 'no Sign In without a method').toBeNull();
  }
});

// ---- the next program's Round 1 push B2d#18 (docs/NEXT.md 4.1.3 item 12, 4.1.5): a shared deck's card

test(title('decks.og.deck-card'), async () => {
  test.setTimeout(90_000);
  const res = await page.goto(`/deck/${deck}`);
  expect(res?.status(), "the deck's page answers").toBe(200);
  await page.locator('.pt-viewer').first().waitFor({ timeout: 60_000 });
  const meta = await page.evaluate(() => {
    const read = (key: string) =>
      document
        .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
        ?.getAttribute('content') ?? null;
    return {
      title: document.title,
      ogTitle: read('og:title'),
      ogUrl: read('og:url'),
      ogImage: read('og:image'),
      ogDescription: read('og:description'),
      twitterTitle: read('twitter:title'),
      counts: {
        ogTitle: document.querySelectorAll('meta[property="og:title"]').length,
        ogUrl: document.querySelectorAll('meta[property="og:url"]').length,
      },
    };
  });
  /* the card's address in the template the brand build renders the picture from */
  const root = resolve(import.meta.dirname, '..', '..', '..', '..');
  const template = readFileSync(
    resolve(root, 'packages', 'theme', 'brand', 'og-template.html'),
    'utf8',
  );
  const monoAddress = /mono/i.test(
    (template.match(/[^{}]*www\.turboslide\.com[^{}]*/) ?? [''])[0] +
      (template.match(/\.(?:address|url|domain)[^{]*\{[^}]*\}/) ?? [''])[0],
  );
  test.info().annotations.push({
    type: 'card',
    description: `${JSON.stringify(meta)}; the template sets the address in monospace ${monoAddress}`,
  });
  const name = meta.title.replace(/, Turboslide$/, '');
  expect(meta.ogTitle, "og:title is the deck's title").toBe(name);
  expect(meta.twitterTitle, "twitter:title is the deck's title").toBe(name);
  expect(meta.counts, 'one og:title and one og:url').toEqual({ ogTitle: 1, ogUrl: 1 });
  expect(meta.ogUrl ?? '', "og:url is the deck's address on www").toMatch(
    new RegExp(`^https://www\\.turboslide\\.com/deck/${deck}$`),
  );
  expect(meta.ogImage ?? '', 'og:image is on www').toMatch(/^https:\/\/www\.turboslide\.com\//);
  expect(meta.ogDescription ?? '', 'og:description is one sentence').toMatch(/^[A-Z].*\.$/);
  expect(monoAddress, "the card's address is not set in monospace").toBe(false);
});

// ---- the list and the trash (docs/archive/rounds/POLISH.md 2.7)

/** The cards of a deck on /decks, with the line under each title. */
async function cardsOf(
  id: string,
  p: Page = page,
): Promise<{ count: number; titles: string[]; lines: string[]; recentHead: boolean }> {
  return p.evaluate((deckId) => {
    const cards = [...document.querySelectorAll(`[data-control="home.card.${deckId}"]`)];
    return {
      count: cards.length,
      titles: cards.map((c) =>
        (
          c.querySelector(`[data-control="home.title.${deckId}"]`)?.textContent ??
          c.textContent ??
          ''
        ).trim(),
      ),
      lines: cards.map((c) =>
        (
          c.querySelector('.ts-hm-card-line, .ts-hm-card-meta, .ts-hm-card-when')?.textContent ?? ''
        ).trim(),
      ),
      recentHead:
        document.querySelector(
          '[data-control="home.recent"] h2, [data-control="home.recent"] .ts-hm-recent-head, [data-control="home.recent.sentence"]',
        ) !== null,
    };
  }, id);
}

test(title('decks.recent.keeps-new-deck'), async () => {
  test.setTimeout(150_000);
  const fresh = await newDeck(page, scratch, 'Recent keeps me');
  /* the mark clicked: the list within 1 s of its ready mark */
  await ctl(page, 'title.home').click();
  await page.waitForURL(/\/decks/, { timeout: 20_000 });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  const t0 = Date.now();
  const listed = await expect
    .poll(async () => (await cardsOf(fresh)).count, { timeout: 1000 })
    .toBeGreaterThan(0)
    .then(() => true)
    .catch(() => false);
  const afterMark = Date.now() - t0;
  await gotoDecks();
  const afterReload = (await cardsOf(fresh)).count;
  await openEditor(page, deck);
  await menuPath(page, 'file', 'file.open');
  await ctl(page, 'dialog.open').waitFor({ timeout: 8000 });
  const inOpen = await expect
    .poll(() => ctl(page, `dialog.open.deck.${fresh}`).count(), { timeout: 8000 })
    .toBeGreaterThan(0)
    .then(() => true)
    .catch(() => false);
  await page.keyboard.press('Escape');
  test.info().annotations.push({
    type: 'recent',
    description: `card within 1 s of the mark ${listed} (${afterMark} ms); after a reload ${afterReload}; File > Open lists it ${inOpen}`,
  });
  expect(listed, "the deck's card is on /decks within 1 s of the ready mark").toBe(true);
  expect(afterReload, 'and again after a reload').toBeGreaterThan(0);
  expect(inOpen, 'File > Open lists it').toBe(true);
});

test(title('decks.card.rename-everywhere'), async () => {
  test.setTimeout(120_000);
  await gotoDecks();
  const name = `Renamed everywhere ${Date.now().toString(36)}`;
  await cardMenuRow(deck, /^Rename$/);
  const field = ctl(page, `home.rename.${deck}`);
  await field.waitFor({ timeout: 6000 });
  await field.fill(name);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const cards = await cardsOf(deck);
  test.info().annotations.push({
    type: 'rename',
    description: `${cards.count} card(s): ${cards.titles.join(' | ')}`,
  });
  deckName = name;
  expect(cards.count, 'the deck appears once').toBe(1);
  expect(
    cards.titles.every((t) => t === name),
    'every card of the deck reads the new name within 500 ms',
  ).toBe(true);
});

test(title('decks.list.one-card-per-deck'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  await gotoDecks();
  const cards = await cardsOf(deck);
  test.info().annotations.push({
    type: 'cards',
    description: `${cards.count} card(s); recent head ${cards.recentHead}; lines ${cards.lines.join(' | ')}`,
  });
  expect(cards.count, 'one card for the deck this browser opened').toBe(1);
  expect(cards.recentHead, 'no Recent row head').toBe(false);
  expect(cards.lines.join(' '), 'the line reads Opened just now').toMatch(/Opened just now/);
});

test(title('decks.trash.leaves-at-once'), async () => {
  test.setTimeout(120_000);
  const other = await newDeck(page, scratch, 'Leaves at once');
  await page.keyboard.press('Escape');
  await menuPath(page, 'file', 'file.moveToTrash');
  const t0 = Date.now();
  await page.waitForURL(/\/decks/, { timeout: 20_000 });
  const ms = Date.now() - t0;
  const words = await expect
    .poll(() => snackbarText(page), { timeout: 5000 })
    .toMatch(/Moved to trash/)
    .then(() => snackbarText(page))
    .catch(() => snackbarText(page));
  const undo = await ctl(page, 'snackbar.action')
    .textContent({ timeout: 3000 })
    .catch(() => null);
  test.info().annotations.push({
    type: 'trash',
    description: `/decks after ${ms} ms; snackbar "${words}" with "${undo}"`,
  });
  expect(ms, '/decks is the address within 1.5 s').toBeLessThan(1500);
  expect(words ?? '', 'Moved to trash').toMatch(/Moved to trash/);
  expect(undo ?? '', 'with Undo').toMatch(/Undo/);
  void other;
});

test(title('decks.card.title-ellipsis'), async () => {
  test.setTimeout(150_000);
  const long = 'A sixty character presentation title that runs past the card';
  const other = await newDeck(page, scratch, long.slice(0, 60));
  await gotoDecks();
  const onList = await page.evaluate((id) => {
    const el = document.querySelector(
      `[data-control="home.title.${id}"] .ts-hm-card-title-text, [data-control="home.title.${id}"]`,
    ) as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      ellipsis: cs.textOverflow === 'ellipsis',
      nowrap: cs.whiteSpace === 'nowrap',
      overflow: cs.overflow,
      truncated: el.scrollWidth > el.clientWidth + 1,
    };
  }, other);
  await trashFromEditor(other);
  await gotoTrash();
  const inTrash = await page.evaluate((id) => {
    const card = document.querySelector(`[data-control="trash.card.${id}"]`);
    const el = (card?.querySelector('.ts-hm-card-title-text, .ts-hm-card-title, .ts-trash-title') ??
      null) as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      ellipsis: cs.textOverflow === 'ellipsis',
      nowrap: cs.whiteSpace === 'nowrap',
      overflow: cs.overflow,
      truncated: el.scrollWidth > el.clientWidth + 1,
    };
  }, other);
  test.info().annotations.push({
    type: 'ellipsis',
    description: `list ${JSON.stringify(onList)}; trash ${JSON.stringify(inTrash)}`,
  });
  expect(
    onList?.ellipsis && onList.nowrap && onList.overflow !== 'visible',
    'the list title ends in an ellipsis',
  ).toBe(true);
  expect(
    inTrash?.ellipsis && inTrash.nowrap && inTrash.overflow !== 'visible',
    'the trash title ends in an ellipsis',
  ).toBe(true);
});

test(title('decks.card.download-powerpoint'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await gotoDecks();
  const file = await download(page, () => cardMenuRow(deck, /^Download$/), 60_000);
  const words = await expect
    .poll(() => snackbarText(page), { timeout: 8000 })
    .toMatch(/Saved/)
    .then(() => snackbarText(page))
    .catch(() => snackbarText(page));
  test.info().annotations.push({
    type: 'download',
    description: `${file.name} (${file.bytes.length} B) in ${file.ms} ms; snackbar "${words}"`,
  });
  expect(file.name, 'a .pptx').toMatch(/\.pptx$/);
  expect(file.name.toLowerCase(), 'named after the title').toContain(
    deckName
      .split(' ')[0]!
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ''),
  );
  expect(words ?? '', 'Saved <name>').toMatch(
    new RegExp(`Saved .*${file.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
});

test(title('decks.import.upload-drop-zone'), async () => {
  test.setTimeout(90_000);
  await openEditor(page, deck);
  await menuPath(page, 'file', 'file.importSlides');
  await ctl(page, 'dialog.importSlides').waitFor({ timeout: 8000 });
  const upload = page
    .locator(
      '[data-control="dialog.importSlides.tab.upload"], [data-control="dialog.importSlides.tab"] [role="tab"]:has-text("Upload")',
    )
    .first();
  if ((await upload.count()) > 0) await upload.click();
  await page.waitForTimeout(300);
  const facts = await page.evaluate(() => {
    const dialog = document.querySelector('[data-control="dialog.importSlides"]');
    const inputs = [...(dialog?.querySelectorAll('input[type="file"]') ?? [])];
    /* a native input the dialog keeps in the tree but clips away (upload.css: `clip: rect(0 0 0 0)`,
       a 1 px box) is not visible; one a person can see has a box and no clip */
    const visibleNative = inputs.filter((i) => {
      const cs = getComputedStyle(i);
      const box = i.getBoundingClientRect();
      return (
        (i as HTMLElement).offsetParent !== null &&
        cs.opacity !== '0' &&
        cs.visibility !== 'hidden' &&
        (cs.clip === 'auto' || cs.clip === '') &&
        cs.clipPath === 'none' &&
        box.width >= 8 &&
        box.height >= 8
      );
    }).length;
    /* the styled button (B5's `dialog.importSlides.upload.button`) over the hidden input the
       dialog keeps as `dialog.importSlides.file` */
    const button =
      dialog?.querySelector(
        '[data-control="dialog.importSlides.upload.button"], [data-control="dialog.importSlides.upload"] button, button[data-control^="dialog.importSlides.upload"]',
      ) ?? dialog?.querySelector('[data-control="dialog.importSlides.file"]');
    /* the drop target: the dialog card takes a drop (b5.md: the card is the target), which a
       drop zone shows by cancelling dragover; a marked zone element counts as well */
    const marked =
      dialog?.querySelector(
        '[data-drop], .ts-dialog-drop, [data-control="dialog.importSlides.drop"]',
      ) ??
      button?.closest('[data-drop], .ts-dialog-drop') ??
      null;
    const accepts = (el: Element | null) => {
      if (!el) return false;
      try {
        const ev = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer(),
        });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      } catch {
        return false;
      }
    };
    const zone =
      marked ??
      (accepts(dialog?.querySelector('[data-control="dialog.importSlides.upload"]') ?? null) ||
      accepts(dialog)
        ? dialog
        : null);
    return {
      inputs: inputs.length,
      visibleNative,
      button: button ? button.tagName.toLowerCase() : null,
      buttonText: (button?.textContent ?? '').trim(),
      zone: zone !== null,
    };
  });
  await page.keyboard.press('Escape');
  test.info().annotations.push({ type: 'upload tab', description: JSON.stringify(facts) });
  expect(facts.visibleNative, 'no native file control visible').toBe(0);
  expect(facts.button, 'a button opens the hidden input').toBe('button');
  expect(facts.zone, 'the dialog is a drop target').toBe(true);
});

test(title('decks.back.list-restored'), async () => {
  test.setTimeout(120_000);
  await gotoDecks();
  await ctl(page, `home.open.${deck}`)
    .first()
    .click({ timeout: 5000 })
    .catch(async () => {
      await ctl(page, `home.card.${deck}`).first().click();
    });
  await page.waitForURL(/\/edit\//, { timeout: 20_000 });
  await waitEditor(page);
  const t0 = Date.now();
  await page.goBack();
  await page.waitForURL(/\/decks/, { timeout: 20_000 });
  const painted = await expect
    .poll(
      async () =>
        page.evaluate(() => document.querySelectorAll('[data-control^="home.card."]').length),
      { timeout: 300 },
    )
    .toBeGreaterThan(0)
    .then(() => true)
    .catch(() => false);
  const ms = Date.now() - t0;
  const frames = await page.evaluate(
    () =>
      document.querySelectorAll(
        '[data-control="home.pending"], .ts-hm-card.is-pending, .ts-hm-skeleton',
      ).length,
  );
  test.info().annotations.push({
    type: 'back',
    description: `cards painted ${painted} after ${ms} ms; grey frames ${frames}`,
  });
  expect(painted, 'the cards paint within 300 ms of Back').toBe(true);
  expect(frames, 'no grey frames').toBe(0);
});

test(title('decks.card.thumbnail-or-plate'), async ({ browser }) => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  /* a second context with this file's cookies and Recent record and a cold HTTP cache: since H2
     (docs/NEXT.md 3.2) /decks lists a browser's own decks, so a context with no identity lists
     none (round1/build/b2.md request 12) */
  const fresh = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    storageState: await page.context().storageState(),
  });
  const p = await fresh.newPage();
  const renders: string[] = [];
  p.on('request', (r) => {
    if (/\/api\/render\//.test(r.url())) renders.push(r.url());
  });
  try {
    await p.goto('/decks');
    await p.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    const first = await p.evaluate(() =>
      [...document.querySelectorAll('[data-control^="home.card."]')].map((card) => ({
        id: card.getAttribute('data-control') ?? '',
        img: card.querySelector('.ts-hm-card-thumb img, img') !== null,
        plate: card.querySelector('.ts-hm-card-plate') !== null,
      })),
    );
    const blank = first.filter((c) => !c.img && !c.plate);
    /* a card scrolled into view asks again */
    const before = renders.length;
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(2500);
    const asked = renders.length - before;
    test.info().annotations.push({
      type: 'thumbnails',
      description: `${first.length} cards at first paint, ${blank.length} blank; ${asked} render request(s) after the scroll`,
    });
    expect(first.length).toBeGreaterThan(0);
    expect(blank, 'every card draws an img or the title plate at first paint').toEqual([]);
  } finally {
    await fresh.close();
  }
});

test(title('decks.trash.enter-confirms'), async () => {
  test.setTimeout(120_000);
  const other = await newDeck(page, scratch, 'Enter confirms');
  await trashFromEditor(other);
  await gotoTrash();
  await ctl(page, `trash.delete.${other}`).click();
  await expect(page.locator('[data-control="trash.confirm"][role="dialog"]')).toBeVisible();
  const focused = await page.evaluate(
    () =>
      document.activeElement?.getAttribute('data-control') ??
      document.activeElement?.tagName.toLowerCase() ??
      'none',
  );
  await page.keyboard.press('Enter');
  const gone = await expect(ctl(page, `trash.card.${other}`))
    .toHaveCount(0, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  test.info().annotations.push({
    type: 'confirm',
    description: `the focus on open ${focused}; Enter deleted ${gone}`,
  });
  expect(focused, 'the primary button holds the focus').toBe('trash.confirm.ok');
  expect(gone, 'Enter deletes').toBe(true);
  await expect
    .poll(() => statusOf(page, `/edit/${other}`), { timeout: 20_000, intervals: [2000] })
    .toBe(404);
  scratch.ids.delete(other);
});

test(title('decks.card.rename-field-fits'), async () => {
  test.setTimeout(90_000);
  await gotoDecks();
  await cardMenuRow(deck, /^Rename$/);
  const field = ctl(page, `home.rename.${deck}`);
  await field.waitFor({ timeout: 6000 });
  const facts = await page.evaluate((id) => {
    const input = document.querySelector(
      `[data-control="home.rename.${id}"]`,
    ) as HTMLInputElement | null;
    /* the card's body, or the ruled row's label cell, the default view since Round 1 */
    const body = input?.closest('.ts-hm-card-body, .ts-hm-card, .ts-row-label') ?? null;
    if (!input || !body) return null;
    const ir = input.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    return {
      field: Math.round(ir.width),
      body: Math.round(br.width),
      scrollLeft: input.scrollLeft,
      startVisible: input.scrollLeft === 0,
    };
  }, deck);
  await page.keyboard.press('Escape');
  test.info().annotations.push({ type: 'rename field', description: JSON.stringify(facts) });
  expect(facts, 'the field and the card body').not.toBeNull();
  expect(facts!.field, 'the field spans the card body').toBeGreaterThanOrEqual(facts!.body - 32);
  expect(facts!.startVisible, "the title's start is visible").toBe(true);
});

test(title('decks.trash.empty-not-primary'), async () => {
  await gotoTrash();
  const cls = (await ctl(page, 'trash.empty').getAttribute('class')) ?? '';
  test.info().annotations.push({ type: 'empty trash', description: `class "${cls}"` });
  expect(cls.split(/\s+/), 'Empty trash carries no is-solid').not.toContain('is-solid');
});

test(title('decks.thumbnail.never-502'), async ({ browser }) => {
  test.setTimeout(150_000);
  /* the fresh context is the owner's browser once more (the file's cookies copied in): a new deck
     is Restricted (docs/archive/rounds/POLISH.md item 78), so a stranger's context met the access page on the
     enforce preview and never the editor (the polish round's run of record, twice; B5's R22 to
     B6, landed by the ship step's third attempt). The cold `/decks` and the 60 s idle are the
     row's own reading; the context is fresh for its cache, not for its identity. */
  const fresh = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    storageState: await context.storageState(),
  });
  const p = await fresh.newPage();
  const bad: string[] = [];
  const errors: string[] = [];
  p.on('response', (r) => {
    if (/\/api\/render\//.test(r.url()) && r.status() === 502) bad.push(r.url());
  });
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 120));
  });
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  try {
    await p.goto('/decks');
    await p.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    await p.waitForTimeout(60_000);
    const listErrors = errors.length;
    await p.goto(`/edit/${deck}`);
    await waitEditor(p);
    await p.waitForTimeout(3000);
    test.info().annotations.push({
      type: '502',
      description: `${bad.length} render responses 502 over 60 s idle; console errors on the list ${listErrors}, on the editor load ${errors.length - listErrors}${errors.length > 0 ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`,
    });
    expect(bad, 'no /api/render response is 502').toEqual([]);
    expect(errors.slice(listErrors), 'an editor load logs no console error').toEqual([]);
  } finally {
    await fresh.close();
  }
});

test(title('decks.polish.pages-sweep'), async ({ browser }) => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  const notes: string[] = [];
  /* the end plate: ArrowRight past the last slide, a click leaves */
  await openEditor(page, deck);
  const order = await slideOrder(page);
  await clickCard(page, order[order.length - 1]!);
  await ctl(page, 'present.open').click();
  const show = page.locator('[data-control="present.show"]');
  await show.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  const endPlate = (await ctl(page, 'present.end').count()) > 0;
  if (endPlate) {
    await ctl(page, 'present.end').click();
    await page.waitForTimeout(800);
  }
  const left = (await show.count()) === 0;
  notes.push(`end plate ${endPlate}, a click leaves ${left}`);
  if (!endPlate || !left) failures.push(`the end plate: shown ${endPlate}, a click leaves ${left}`);
  if (!left) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  /* the access page's link is ink */
  const stranger = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const sp = await stranger.newPage();
    await sp.goto('/deck/no-such-deck-polish-sweep');
    await sp.locator('[data-control="access.page"]').first().waitFor({ timeout: 30_000 });
    const link = await sp.evaluate(() => {
      const a = document.querySelector(
        '[data-control="access.links"] a, [data-control="access.page"] a',
      ) as HTMLElement | null;
      if (!a) return null;
      const color = getComputedStyle(a).color;
      const probe = document.createElement('span');
      probe.style.color = 'var(--pt-ink)';
      document.body.append(probe);
      const ink = getComputedStyle(probe).color;
      probe.remove();
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
      const blue = m ? Number(m[3]) > Number(m[1]) + 60 : false;
      return {
        color,
        ink,
        blue,
        sentence: (
          document.querySelector('[data-control="access.sentence"]')?.textContent ?? ''
        ).trim(),
      };
    });
    notes.push(
      `access link ${link ? `${link.color} (ink ${link.ink}, blue ${link.blue}); sentence "${link.sentence}"` : 'none'}`,
    );
    if (!link || link.blue || /\?/.test(link.sentence))
      failures.push(
        `the access page: link ${link?.color ?? 'none'}, sentence "${link?.sentence ?? ''}"`,
      );
  } finally {
    await stranger.close();
  }
  /* the card's Make a copy lists Copy comments */
  await gotoDecks();
  await cardMenuRow(deck, /Make a copy/);
  /* the card's dialog is the home page's own (`home.copy`, decks.index.tsx; B5's item 98 note
     names `home.copy.copy-comments`), not the editor's `dialog.makeCopy`: the first form of
     this read waited for the editor's id on the home page and read red on every tier of the
     round (the ship step's third attempt) */
  const copyDialog = await ctl(page, 'home.copy')
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  const copyComments = copyDialog
    ? (await ctl(page, 'home.copy.copy-comments').count()) > 0
    : false;
  await page.keyboard.press('Escape');
  notes.push(`Make a copy dialog ${copyDialog} with Copy comments ${copyComments}`);
  if (!copyComments) failures.push("the card's Make a copy lists no Copy comments");
  /* the presenter's pane has no Audience tools tab */
  const presenter = await page.goto(`/present/${deck}`, { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-control="presenter"]')
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  const audience = await ctl(page, 'presenter.tab.audience').count();
  notes.push(`presenter ${presenter?.status()}: Audience tools tab ${audience}`);
  if (audience > 0) failures.push("the presenter's Audience tools tab is drawn");
  /* the comment card: no empty header, Resolve reads Resolved with Undo */
  await openEditor(page, deck);
  const slideId = (await state(page)).slideId;
  await placeBlock(page, slideId, {
    id: 'sweep-box',
    type: 'shape',
    shape: 'rectangle',
    fill: 'plate',
    stroke: 'ink',
    pos: { x: 900, y: 500, w: 240, h: 160 },
  });
  await selectBlock(page, 'sweep-box');
  await page.keyboard.press('Meta+Alt+m');
  const card = await ctl(page, 'comment.card')
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (card) {
    const emptyHead = await page.evaluate(() => {
      const head = document.querySelector('[data-control="comment.card"] .ts-comment-card-head');
      return (
        head !== null &&
        (head.textContent ?? '').trim() === '' &&
        head.getClientRects().length > 0 &&
        head.getBoundingClientRect().height > 8
      );
    });
    await ctl(page, 'comment.card.new.field').click();
    await page.keyboard.type('Sweep comment', { delay: 40 });
    await ctl(page, 'comment.card.new.submit').click();
    /* posting closes the composer's card (CommentCard.tsx onSubmit runs onClose), and the
       thread's card opens from its marker, the way a seller and `comments.resolve`
       (present.spec.ts) open it; the first form of this read looked for the tick on the closed
       card (count 0 on every tier of the round; the ship step's third attempt) */
    const marker = await expect
      .poll(() => ctl(page, 'comment.marker').count(), { timeout: 10_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    if (marker) {
      await ctl(page, 'comment.marker').click();
      await ctl(page, 'comment.card')
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
    }
    const resolve = ctl(page, 'comment.card.resolve');
    let resolvedWords: string | null = null;
    let undo: string | null = null;
    if (marker && (await resolve.count()) > 0) {
      await resolve.click();
      resolvedWords = await expect
        .poll(() => snackbarText(page), { timeout: 5000 })
        .toMatch(/Resolved/)
        .then(() => snackbarText(page))
        .catch(() => snackbarText(page));
      undo = await ctl(page, 'snackbar.action')
        .textContent({ timeout: 3000 })
        .catch(() => null);
    }
    notes.push(
      `comment card: empty header ${emptyHead}; after Resolve "${resolvedWords}" with "${undo}"`,
    );
    if (emptyHead || !/Resolved/.test(resolvedWords ?? '') || !/Undo/.test(undo ?? ''))
      failures.push(
        `the comment card: empty header ${emptyHead}, resolve words "${resolvedWords}", action "${undo}"`,
      );
    await page.keyboard.press('Escape');
  } else failures.push('no comment card after Cmd+Alt+M on the shape');
  /* at 1280 by 800 the show's bar does not intersect the sheet */
  await page.setViewportSize({ width: 1280, height: 800 });
  await ctl(page, 'present.open').click();
  await show.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.mouse.move(640, 400);
  await page.mouse.move(660, 420);
  await page.waitForTimeout(300);
  const boxes = await page.evaluate(() => {
    const bar = document.querySelector('[data-control="present.toolbar"]');
    /* the show's slide is the stage's sheet in present mode (`.ts-stagewrap.is-present`) */
    const sheet = document.querySelector(
      '.ts-stagewrap.is-present .pt-slide:not(.is-leaving), [data-control="present.show"] .pt-slide:not(.is-leaving), .pt-viewer.is-present .pt-slide:not(.is-leaving)',
    );
    if (!bar || !sheet) return null;
    const b = bar.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    return {
      barTop: Math.round(b.top),
      sheetBottom: Math.round(s.bottom),
      intersects: b.top < s.bottom && b.bottom > s.top && b.left < s.right && b.right > s.left,
    };
  });
  await page.keyboard.press('Escape');
  await expect.poll(() => show.count(), { timeout: 8000 }).toBe(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  notes.push(
    `show at 1280 by 800: ${boxes ? `bar top ${boxes.barTop}, sheet bottom ${boxes.sheetBottom}, intersects ${boxes.intersects}` : 'unread'}`,
  );
  if (!boxes || boxes.intersects)
    failures.push(`the show's bar at 1280 by 800: ${boxes ? 'intersects the sheet' : 'unread'}`);
  /* /edit/<id> answers 404 within 1 s of Delete forever */
  const victim = await newDeck(page, scratch, 'Deleted within a second');
  await trashFromEditor(victim);
  await gotoTrash();
  await ctl(page, `trash.delete.${victim}`).click();
  await ctl(page, 'trash.confirm.ok').click();
  await ctl(page, `trash.card.${victim}`).waitFor({ state: 'detached', timeout: 30_000 });
  const t0 = Date.now();
  let status = 0;
  while (Date.now() - t0 < 1000) {
    status = await statusOf(page, `/edit/${victim}`);
    if (status === 404) break;
    await page.waitForTimeout(100);
  }
  notes.push(`/edit/<id> answered ${status} ${Date.now() - t0} ms after Delete forever`);
  if (status !== 404) failures.push(`/edit/<id> answered ${status} within 1 s of Delete forever`);
  if (status === 404) scratch.ids.delete(victim);
  test.info().annotations.push({ type: 'sweep', description: notes.join('; ') });
  expect(failures).toEqual([]);
});

/* ---------------------------------------------------------------------------------------------
   The listing scoped to the viewer (docs/NEXT.md 3.2 H2, 4.1.5): a fresh anonymous browser lists
   no deck it did not open, the deck.list action answers a principal its own decks alone, and the
   checkout holder or the deployment's bearer still lists the whole store. */

const BASE = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4321';

/** The data-control ids of the cards /decks draws in its grid, once the listing has landed. */
async function listedCards(p: Page): Promise<string[]> {
  await expect(
    p
      .locator(
        '[data-control="home.rows"], [data-control="home.cards"], [data-control="home.empty"]',
      )
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  /* the listing streams behind the shell: the frames leave when it lands */
  await expect(p.locator('[data-control="home.pending"]')).toHaveCount(0, { timeout: 30_000 });
  /* the ruled rows are the default view since Round 1 (docs/NEXT.md 4.1.3 item 10) */
  return p
    .locator(
      '[data-control="home.rows"] tbody > [data-control^="home.card."], [data-control="home.cards"] > [data-control^="home.card."]',
    )
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-control') ?? ''));
}

test(title('decks.list.own-and-shared'), async ({ browser }) => {
  test.setTimeout(180_000);
  const { context: freshCtx, page: fresh } = await otherContext(browser);
  const freshScratch = new Scratch();
  try {
    await gotoDecks(fresh);
    const first = await listedCards(fresh);
    const caption = await fresh
      .getByText('Every presentation on this Turboslide is listed here')
      .count();
    /* the deck this browser makes and opens: its Recent record lists it, and nothing else */
    const own = await newDeck(fresh, freshScratch, 'Own and shared row');
    await gotoDecks(fresh);
    await expect(ctl(fresh, `home.card.${own}`)).toBeVisible({ timeout: 20_000 });
    const after = await listedCards(fresh);
    test.info().annotations.push({
      type: 'listing',
      description: `fresh browser: ${first.length} cards (${first.slice(0, 5).join(', ') || 'none'}); after its own deck ${own}: ${after.join(', ')}; caption count ${caption}; the file's deck ${deck} listed: ${after.includes(`home.card.${deck}`)}`,
    });
    expect(first, 'a fresh anonymous browser lists no presentation').toEqual([]);
    expect(caption, 'no caption claims every presentation').toBe(0);
    expect(after, "the deck it opened, and no other person's").toEqual([`home.card.${own}`]);
  } finally {
    try {
      await teardownAll(fresh, freshScratch);
    } finally {
      await freshCtx.close();
    }
  }
});

test(title('decks.list.action-scoped'), async ({ browser }) => {
  test.setTimeout(180_000);
  const { context: freshCtx, page: fresh } = await otherContext(browser);
  const freshScratch = new Scratch();
  try {
    const own = await newDeck(fresh, freshScratch, 'Action scoped row');
    /* the window transport, as the principal's own editor runs it */
    const windowIds = rowsOf(await invoke(fresh, 'deck.list', {})).map((row) => row.id);
    const windowTrashed = rowsOf(await invoke(fresh, 'deck.list', { includeTrashed: true })).map(
      (row) => row.id,
    );
    /* POST /api/actions/deck.list with the fresh principal's cookie (a deployment answers 401
       without the bearer, which lists nothing) */
    const posted = await fresh.request.post(
      `/api/actions/deck.list?deck=${encodeURIComponent(own)}`,
      { headers: { ...extraHTTPHeaders, 'content-type': 'application/json' }, data: {} },
    );
    const postedIds =
      posted.status() === 200 ? rowsOf(await posted.json()).map((row) => row.id) : null;
    /* the checkout holder (a cookieless localhost call) or the deployment's bearer */
    const headers = agentHeaders(BASE);
    let ownerIds: string[] | null = null;
    let ownerStatus = 0;
    if (headers !== null) {
      const res = await fetch(`${BASE}/api/actions/deck.list?deck=${encodeURIComponent(own)}`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      ownerStatus = res.status;
      if (res.ok) ownerIds = rowsOf(await res.json()).map((row) => row.id);
    }
    test.info().annotations.push({
      type: 'listing',
      description: `window: ${windowIds.join(', ')}; window with trash: ${windowTrashed.length}; POST with the cookie: ${posted.status()} ${postedIds === null ? '' : postedIds.join(', ')}; the holder or the bearer: ${headers === null ? 'not read (no bearer for this deployment)' : `${ownerStatus}, ${ownerIds?.length ?? 0} decks, the file's deck ${ownerIds?.includes(deck) ?? false}, the fresh deck ${ownerIds?.includes(own) ?? false}`}`,
    });
    expect(windowIds, 'the principal lists its own deck alone').toEqual([own]);
    expect(windowTrashed, "with the trash: still no other person's deck").toEqual([own]);
    if (postedIds !== null)
      expect(postedIds, 'POST with the cookie lists its own deck alone').toEqual([own]);
    else expect(posted.status(), 'POST without the bearer is refused').toBe(401);
    if (headers !== null) {
      expect(ownerStatus).toBe(200);
      expect(ownerIds, 'the holder or the bearer lists the whole store').toEqual(
        expect.arrayContaining([own, deck]),
      );
    }
  } finally {
    try {
      await teardownAll(fresh, freshScratch);
    } finally {
      await freshCtx.close();
    }
  }
});

/* the next program's Round 1 push B1#2 (docs/NEXT.md 4.1.3 item 3, 4.1.5): the installed app's
   colours are the paper's, the manifest packages/theme/brand/site.ts writes through the brand build */
test(title('decks.manifest.paper'), async () => {
  const answer = await page.request.get('/manifest.webmanifest');
  const body = (await answer.json().catch(() => ({}))) as {
    background_color?: string;
    theme_color?: string;
    start_url?: string;
  };
  test.info().annotations.push({
    type: 'manifest',
    description: `${answer.status()} ${answer.headers()['content-type'] ?? ''}: background_color ${body.background_color}, theme_color ${body.theme_color}, start_url ${body.start_url}`,
  });
  expect(answer.status(), 'the manifest answers').toBe(200);
  expect(body.background_color, 'background_color is the paper').toBe('#ffffff');
  expect(body.theme_color, 'theme_color is the paper').toBe('#ffffff');
});

/* lane C of the Round 1 follow-up: its rows live in pages-r1f.ts */
const LANE_C_ROWS = pagesR1f();

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
  /* the product round (docs/archive/rounds/PRODUCT.md 8.1) */
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
  /* the polish round (docs/archive/rounds/POLISH.md 2.7, section 3, 5.1) */
  'decks.home.pictures-three-widths',
  'decks.home.copy-rules',
  'decks.home.product-pictures',
  'decks.home.links-and-card',
  'decks.home.load-budget',
  'decks.home.layout-shift',
  'decks.recent.keeps-new-deck',
  'decks.card.rename-everywhere',
  'decks.list.one-card-per-deck',
  'decks.trash.leaves-at-once',
  'decks.card.title-ellipsis',
  'decks.card.download-powerpoint',
  'decks.import.upload-drop-zone',
  'decks.back.list-restored',
  'decks.card.thumbnail-or-plate',
  'decks.trash.enter-confirms',
  'decks.card.rename-field-fits',
  'decks.trash.empty-not-primary',
  'decks.thumbnail.never-502',
  'decks.polish.pages-sweep',
  /* the next program's hotfix H2 (docs/NEXT.md 3.2, 4.1.5) */
  'decks.list.own-and-shared',
  'decks.list.action-scoped',
  /* the next program's Round 1 push B1#2 (docs/NEXT.md 4.1.3 item 3, 4.1.5) */
  'decks.manifest.paper',
  /* the next program's Round 1 push B2a#15 (docs/NEXT.md 4.1.3 item 9, 4.1.5) */
  'decks.home.grammar',
  'decks.home.capture-plain',
  'decks.home.copy',
  'decks.home.phone',
  /* the next program's Round 1 push B2b#16 (docs/NEXT.md 4.1.3 item 10, 4.1.5) */
  'decks.list.ruled-rows',
  /* the next program's Round 1 push B2d#18 (docs/NEXT.md 4.1.3 item 12, 4.1.5) */
  'decks.og.deck-card',
  ...LANE_C_ROWS,
]);
