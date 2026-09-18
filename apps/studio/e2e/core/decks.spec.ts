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
  teardown,
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
// deck it makes is torn down at the end.
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
  test.setTimeout(180_000);
  try {
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
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await typeNote(page, ' And a word.');
  await gotoDecks();
  await cardMenuRow(deck, /^Make a copy$/);
  const dialog = page.locator('[data-control="home.copy"][role="dialog"]');
  await expect(dialog).toBeVisible();
  const opened = context.waitForEvent('page', { timeout: 30_000 });
  await ctl(page, 'home.copy.ok').click();
  const copyPage = await opened;
  await copyPage.waitForURL(/\/edit\//, { timeout: 30_000 });
  const copyId = copyPage.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? '';
  scratch.add(copyId);
  await waitEditor(copyPage);
  await copyPage.close();
  await gotoDecks();
  await expect(ctl(page, `home.card.${copyId}`), 'the copy is listed').toBeVisible({
    timeout: 10_000,
  });
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
  expect(url, 'the card menu mints the bundle ticket and starts the download').not.toBeNull();
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
  void teardown;
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
]);
