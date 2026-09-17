import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

// The roles a link grants and the editor honours (docs/FOCUS.md 2.7 and section 5 rank 1; the
// orchestrator's ruling 2), the focus round's B6 lane. One scratch deck from /new, created by
// typing its title, torn down through File > Move to trash and Delete forever. The rows, by the
// matrix id each proves: the deck's record is restricted with its creator as owner at the first
// write; the Share dialog opens with the View, Present and Edit link rows and Copy link on each
// mints a share link that grants the row's role (`share.dialog.open`, `share.copy-view-link`,
// `share.copy-present-link`, `share.copy-edit-link`, `share.escape`); a second browser on the View
// link lands on the read only viewer and cannot edit on the editor address
// (`share.view-link-lands-viewer`, `share.view-link-cannot-edit`); the Present link opens the show;
// a third browser on the Edit link lands in the editor and its edit reaches the owner
// (`share.edit-link-lands-editor`, `collab.edit-from-second-browser` on this server's channel); a
// browser with no link cannot edit (`share.stranger-cannot-edit`); File > Share > Share with
// others opens the dialog (`share.file-menu-share-with-others`); the You need access page paints
// clean in a browser that used the editor on the light appearance (`decks.access.paint`).
//
// The mode. The server's `TURBOSLIDE_AUTHORIZE` decides what a refusal looks like, and this spec
// reads it from `GET /api/access/<deckId>` instead of the runner's environment: in enforce mode a
// stranger meets the You need access page and a 404, and a write from a viewer is refused; in
// shadow mode the editor opens read only for the role the record grants while the server refuses
// no write, and the rows say which mode they ran in through the test annotations.
//
// PLAYWRIGHT_BASE_URL=http://localhost:4366 node_modules/.bin/playwright test apps/studio/e2e/roles.spec.ts

type Mode = 'shadow' | 'enforce';
type AccessAnswer = {
  record: { owner: string | null; generalAccess: { mode: string; role: string } };
  role: string | null;
  capabilities: string[];
  authorize?: Mode;
};

const TITLE = 'Pipeline review: Acme, Q3 2026';
const TOKEN = /\/s\/[A-Za-z0-9_-]{22}$/;
const TOKEN_PRESENT = /\/s\/[A-Za-z0-9_-]{22}\?present=1$/;

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 60_000 },
  );
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '', {
    timeout: 60_000,
  });
}

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
}

async function state<T>(page: Page, key: string): Promise<T | undefined> {
  return page.evaluate(
    (k) =>
      (window.turboslide!.studio.describe().state as Record<string, unknown>)[k] as T | undefined,
    key,
  );
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      if (typeof window.turboslide?.studio?.describe !== 'function') return false;
      const s = window.turboslide.studio.describe().state as {
        revision?: number;
        serverRevision?: number;
        pending?: number;
      };
      return s.pending === 0 && s.revision === s.serverRevision;
    },
    null,
    { timeout: 30_000 },
  );
}

/** The heading of the title slide as the store holds it (`slide.get`). */
async function headingOf(page: Page, slideId: string): Promise<string> {
  const got = await invoke<{ slide: { heading?: string } }>(page, 'slide.get', { slideId });
  return got.slide.heading ?? '';
}

/** `GET /api/access/<deckId>` from the page's own cookie: the standing, the record and the mode. */
async function accessOf(
  page: Page,
  deckId: string,
): Promise<{ status: number; body: AccessAnswer | null }> {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/access/${encodeURIComponent(id)}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    const text = await response.text();
    let body: AccessAnswer | null = null;
    try {
      body = JSON.parse(text) as AccessAnswer;
    } catch {
      body = null;
    }
    return { status: response.status, body };
  }, deckId);
}

const heading = (page: Page) =>
  page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]');

/**
 * A double click on the slide's title text in a read only editor (Viewing mode draws the stage
 * without the editing runs, so the `data-run` locator of the editor does not apply): no text
 * session opens and no field becomes editable.
 */
async function doubleClickOpensNothing(page: Page): Promise<void> {
  const slide = page.locator('.pt-viewer .pt-slide').first();
  await expect(slide).toBeVisible();
  const text = slide.getByText(TITLE.slice(0, 16)).first();
  const box = (await text.count()) > 0 ? await text.boundingBox() : await slide.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.keyboard.type(' VIEWER', { delay: 20 });
  await page.waitForTimeout(3000);
  expect(await page.locator('[contenteditable="true"]').count()).toBe(0);
}

async function typeIntoHeading(page: Page, text: string, replace: boolean): Promise<void> {
  const box = await heading(page).boundingBox();
  expect(box, 'the title slide draws its heading run').not.toBeNull();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(heading(page)).toHaveAttribute('contenteditable', 'true');
  if (replace) await page.keyboard.press('ControlOrMeta+a');
  else await page.keyboard.press('End');
  await page.keyboard.type(text, { delay: 20 });
  await page.keyboard.press('Escape');
}

/** The name prompt of the first edit (SPEC-3 0.18), answered when it shows. */
async function answerNamePrompt(page: Page, name: string): Promise<void> {
  const prompt = page.locator('[data-control="dialog.namePrompt"]');
  if ((await prompt.count()) === 0) return;
  const field = page.locator('[data-control="dialog.namePrompt.name"]');
  await field.fill(name);
  await field.press('Enter');
  if ((await prompt.count()) > 0) {
    await page
      .locator('[data-control="dialog.namePrompt.continue"]')
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
  if ((await prompt.count()) > 0) {
    /* a refused name (in use, reserved) is not this spec's row: the prompt closes and the label stands */
    test.info().annotations.push({
      type: 'name prompt',
      description: `the prompt stayed after "${name}": ${(await prompt.textContent())?.trim().slice(0, 120) ?? ''}`,
    });
    await page.keyboard.press('Escape');
  }
  await expect(prompt).toHaveCount(0, { timeout: 5000 });
}

/** The scratch deck: /new, the title typed, the first write landed, the address on /edit/<id>. */
async function createDeck(page: Page): Promise<{ deckId: string; slideId: string }> {
  await page.goto('/new');
  await editorReady(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  await typeIntoHeading(page, TITLE, true);
  await page.waitForFunction(
    () => {
      /* the registry is re-installed when an owner element changes; a poll in that moment reads
         false instead of throwing (ten-tasks.spec.ts `settled`) */
      if (typeof window.turboslide?.studio?.describe !== 'function') return false;
      return (
        ((window.turboslide.studio.describe().state as { revision: number }).revision ?? 0) >= 1
      );
    },
    null,
    { timeout: 30_000 },
  );
  await settled(page);
  await answerNamePrompt(page, 'Maya');
  await expect(page).toHaveURL(new RegExp(`/edit/${info.id}`));
  const rows = await invoke<{ id: string }[]>(page, 'slide.list');
  return { deckId: info.id, slideId: rows[0]!.id };
}

/** File > Move to trash, Delete forever on /decks/trash, the 404; the actions API as the fallback. */
async function teardown(page: Page, deckId: string): Promise<void> {
  try {
    await page.goto(`/edit/${deckId}`);
    await editorReady(page);
    await settled(page);
    await page.locator('[data-control="menubar.file"]').click();
    await page.locator('[data-control="menu.file.moveToTrash"]').click();
    await page.waitForURL(/\/decks$/, { timeout: 20_000 });
    await page.goto('/decks/trash');
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    const card = page.locator(`[data-control="trash.card.${deckId}"]`);
    await card.waitFor({ timeout: 30_000 });
    await page.locator(`[data-control="trash.delete.${deckId}"]`).click();
    await page.locator('[data-control="trash.confirm.ok"]').click();
    await card.waitFor({ state: 'detached', timeout: 30_000 });
  } catch {
    await page.goto('/decks');
    await page
      .evaluate(async (id) => {
        const post = (action: string, body: unknown) =>
          fetch(`/api/actions/${action}?deck=${encodeURIComponent(id)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body),
          });
        await post('deck.trash', { id });
        await post('deck.remove', { id });
      }, deckId)
      .catch(() => undefined);
  }
  await expect
    .poll(async () => (await page.request.get(`/edit/${deckId}`)).status(), { timeout: 20_000 })
    .toBe(404);
}

test.describe.configure({ mode: 'serial' });

let owner: BrowserContext;
let ownerPage: Page;
let deckId = '';
let slideId = '';
let mode: Mode = 'shadow';
const others: BrowserContext[] = [];
const links: { view?: string; present?: string; edit?: string } = {};

test.beforeAll(async ({ browser }) => {
  owner = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  ownerPage = await owner.newPage();
  ({ deckId, slideId } = await createDeck(ownerPage));
  const access = await accessOf(ownerPage, deckId);
  mode = access.body?.authorize ?? 'shadow';
});

test.afterAll(async () => {
  for (const context of others) await context.close().catch(() => undefined);
  if (deckId !== '') await teardown(ownerPage, deckId);
  await owner.close();
});

async function otherContext(
  browser: Browser,
  options = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(options);
  others.push(context);
  return { context, page: await context.newPage() };
}

test('the record: a deck from /new is restricted with its creator as owner from its first write, and the route names the mode', async () => {
  test.info().annotations.push({ type: 'mode', description: mode });
  const access = await accessOf(ownerPage, deckId);
  expect(access.status).toBe(200);
  expect(access.body?.record.generalAccess.mode).toBe('restricted');
  expect(access.body?.role).toBe('owner');
  /* the owner is the creating principal of this browser's cookie (the /new page's own account
     facts stay the draft's until a reload, so the route's `role: 'owner'` is the proof) */
  expect(access.body?.record.owner).toMatch(/^(anon_|usr_)/);
  expect(['shadow', 'enforce']).toContain(access.body?.authorize);
});

test('share.dialog.open, share.copy-view-link, share.copy-present-link, share.copy-edit-link, share.escape: the three rows mint a link each with the row role, the same address on a second copy, and the dialog names the mode', async () => {
  test.info().annotations.push({ type: 'mode', description: mode });
  await ownerPage.locator('[data-control="share.open"]').click();
  const dialog = ownerPage.locator('[data-control="dialog.share"]');
  await expect(dialog).toBeVisible();
  for (const row of ['view', 'present', 'edit']) {
    await expect(dialog.locator(`[data-control="dialog.share.${row}"]`)).toBeVisible();
  }
  await expect(dialog.locator('[data-control="dialog.share.mode"]')).toHaveValue('restricted');
  await expect(dialog.locator('[data-control="dialog.share.footer"]')).toHaveText(
    'Speaker notes and skipped slides never travel with a view or comment link',
  );
  /* the mode sentence, from the same route the spec read */
  const sentence = dialog.locator('[data-control="dialog.share.authorize"]');
  await expect(sentence).toHaveAttribute('data-mode', mode, { timeout: 10_000 });
  await expect(sentence).toContainText(mode === 'enforce' ? 'enforced' : 'not enforced');
  /* the words the focus round removed are gone */
  await expect(dialog).not.toContainText('Read only');

  const origin = new URL(ownerPage.url()).origin;
  const copyRow = async (row: 'view' | 'present' | 'edit', pattern: RegExp): Promise<string> => {
    await dialog.locator(`[data-control="dialog.share.${row}.copy"]`).click();
    await expect
      .poll(() => ownerPage.evaluate(() => navigator.clipboard.readText()), { timeout: 10_000 })
      .toMatch(pattern);
    const copied = await ownerPage.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith(`${origin}/s/`)).toBe(true);
    return copied;
  };
  links.view = await copyRow('view', TOKEN);
  await expect(ownerPage.locator('[data-control="snackbar"]')).toContainText('Link copied');
  links.present = await copyRow('present', TOKEN_PRESENT);
  links.edit = await copyRow('edit', TOKEN);
  expect(new Set([links.view, links.present.replace('?present=1', ''), links.edit]).size).toBe(3);
  /* the three minted links are listed with their labels and roles */
  const list = dialog.locator('[data-control="dialog.share.links"] li');
  await expect(list).toHaveCount(3, { timeout: 10_000 });
  await expect(dialog.locator('[data-control="dialog.share.links"]')).toContainText('View link');
  await expect(dialog.locator('[data-control="dialog.share.links"]')).toContainText('Edit link');
  /* a second Copy link on the View row copies the same address and mints nothing */
  await dialog.locator('[data-control="dialog.share.view.copy"]').click();
  await expect
    .poll(() => ownerPage.evaluate(() => navigator.clipboard.readText()))
    .toBe(links.view);
  await expect(list).toHaveCount(3);
  /* Escape closes the dialog */
  await ownerPage.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('share.view-link-lands-viewer, share.view-link-cannot-edit: the View link lands on the read only viewer, and the editor address opens read only for the viewer role', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  test.info().annotations.push({ type: 'mode', description: mode });
  expect(links.view, 'the View link was copied in the row before').toBeDefined();
  const { page } = await otherContext(browser);
  await page.goto(links.view!);
  await page.waitForURL((url) => url.pathname === `/deck/${deckId}` && !url.href.includes('/s/'));
  await expect(page.locator('.pt-viewer')).toBeVisible();
  await expect(page.locator('.ts-editor')).toHaveCount(0);
  await expect(page.locator('[data-control="toolbar"]')).toHaveCount(0);
  await expect(page.locator('[data-control="menubar"]')).toHaveCount(0);
  await expect(page.locator('body')).toContainText(TITLE);
  expect(await page.locator('[contenteditable="true"]').count()).toBe(0);

  /* the same browser changes /deck/ to /edit/: the role the record grants decides the mode */
  await page.goto(`/edit/${deckId}`);
  await editorReady(page);
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
    'data-edit-mode',
    'viewing',
  );
  await expect(page.locator('[data-control="toolbar.viewOnly"]')).toHaveText('View only');
  const access = await state<{ role: string | null }>(page, 'access');
  expect(access?.role).toBe('viewer');
  const before = await headingOf(ownerPage, slideId);
  await doubleClickOpensNothing(page);
  expect(await headingOf(ownerPage, slideId)).toBe(before);
  /* a document write from the viewer's browser through the room's ops route (the path the
     editor's own writes take, decided over the cookie): refused in enforce mode, accepted and
     logged in shadow mode. Not /api/actions: on a dev server TURBOSLIDE_LOCAL_OPEN admits every
     localhost request there as the checkout holder, which no deployment does. */
  const write = await page.evaluate(async (id) => {
    const response = await fetch(`/api/decks/${encodeURIComponent(id)}/ops`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: 'ab'.repeat(16),
        base: { seq: 0 },
        entries: [
          {
            opId: `${'ab'.repeat(16)}:1`,
            kind: 'edit',
            mutations: [{ op: 'deck.set', path: '/title', value: 'VIEWER RENAME' }],
          },
        ],
      }),
    });
    return { status: response.status, body: (await response.text()).slice(0, 200) };
  }, deckId);
  if (mode === 'enforce') expect([401, 403, 404]).toContain(write.status);
  test.info().annotations.push({
    type: 'write from the viewer',
    description: `POST /api/decks/<id>/ops answered ${write.status} in ${mode} mode: ${write.body}`,
  });
  await expect.poll(() => headingOf(ownerPage, slideId), { timeout: 3000 }).toBe(before);
  const info = await invoke<{ revision: number; title?: string }>(ownerPage, 'deck.info');
  if (info.title !== undefined && info.title !== TITLE) {
    await invoke(ownerPage, 'deck.rename', {
      id: deckId,
      name: TITLE,
      baseRevision: info.revision,
    }).catch(() => undefined);
  }
});

test('share.copy-present-link: the Present link opens the show for the viewer role', async ({
  browser,
}) => {
  test.info().annotations.push({ type: 'mode', description: mode });
  expect(links.present).toBeDefined();
  const { page } = await otherContext(browser);
  await page.goto(links.present!);
  await page.waitForURL(
    (url) => url.pathname === `/deck/${deckId}` && url.searchParams.get('present') === '1',
  );
  await expect(page.locator('[data-control="present.show"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.ts-editor')).toHaveCount(0);
});

test('share.edit-link-lands-editor, collab.edit-from-second-browser: the Edit link lands in the editor and a typed word reaches the owner within 5 s', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  test.info().annotations.push({ type: 'mode', description: mode });
  expect(links.edit).toBeDefined();
  const { page } = await otherContext(browser);
  await page.goto(links.edit!);
  await page.waitForURL((url) => url.pathname === `/edit/${deckId}`);
  await editorReady(page);
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
    'data-edit-mode',
    'editing',
  );
  expect((await state<{ role: string | null }>(page, 'access'))?.role).toBe('editor');
  await answerNamePrompt(page, 'Bram');
  await typeIntoHeading(page, ' +B', false);
  await answerNamePrompt(page, 'Bram');
  await settled(page);
  await expect.poll(() => headingOf(ownerPage, slideId), { timeout: 5000 }).toBe(`${TITLE} +B`);
  await expect(heading(ownerPage)).toContainText('+B', { timeout: 5000 });
});

test('share.stranger-cannot-edit: a browser with no link cannot edit the deck', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  test.info().annotations.push({ type: 'mode', description: mode });
  const { page } = await otherContext(browser);
  const before = await headingOf(ownerPage, slideId);
  /* the stranger's cookie first: on a dev server with TURBOSLIDE_LOCAL_OPEN the very first,
     cookieless request of a context is admitted as the checkout holder (server/room.ts
     `requestIdentity`, SPEC-3 0.23), which no deployment does; a page load mints the anonymous
     principal the way the deployment's middleware does on the first answer */
  await page.goto('/decks');
  const response = await page.goto(`/edit/${deckId}`);
  const access = await accessOf(page, deckId);
  if (mode === 'enforce') {
    expect(response?.status()).toBe(404);
    await expect(page.locator('[data-control="access.page"]')).toBeVisible();
    await expect(page.locator('[data-control="access.sentence"]')).toHaveText(
      'This presentation is not available to you, or does not exist.',
    );
    expect(access.status).toBe(404);
  } else {
    /* shadow mode: the editor shows the role it would enforce, read only, and the server logs */
    expect(response?.status()).toBe(200);
    await editorReady(page);
    await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
      'data-edit-mode',
      'viewing',
    );
    await expect(page.locator('[data-control="toolbar.viewOnly"]')).toHaveText('View only');
    expect((await state<{ role: string | null }>(page, 'access'))?.role).toBe('viewer');
    expect(access.status).toBe(200);
    expect(access.body?.authorize).toBe('shadow');
    expect(access.body?.role).toBe('viewer');
    await doubleClickOpensNothing(page);
  }
  expect(await headingOf(ownerPage, slideId)).toBe(before);
});

test('share.file-menu-share-with-others: File > Share > Share with others opens the Share dialog', async () => {
  await ownerPage.locator('[data-control="menubar.file"]').click();
  await ownerPage.locator('[data-menu-item="file.share"]').hover();
  await ownerPage.locator('[data-menu-item="file.share.withOthers"]').click();
  const dialog = ownerPage.locator('[data-control="dialog.share"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-control="dialog.share.view"]')).toBeVisible();
  await ownerPage.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('decks.access.paint: the You need access page paints clean in a browser that used the editor on the light appearance', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { page } = await otherContext(browser);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('gt-theme', 'light');
    } catch {
      // storage refused: the page still renders
    }
  });
  /* use the editor on the light appearance first, through the Edit link so the mode does not matter */
  await page.goto(links.edit ?? `/edit/${deckId}`);
  await editorReady(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
    'light',
  );
  const response = await page.goto(`/edit/nope-${Date.now().toString(36)}`);
  expect(response?.status()).toBe(404);
  const form = page.locator('[data-control="access.page"]');
  await expect(form).toBeVisible();
  /* the route's view transition first: while it runs the outgoing page's snapshot is composited
     over the document and hit testing answers the root element, which is what a frame taken in
     that window shows (the figure over the form of audit-decks row 57) */
  await page.waitForFunction(
    () => {
      try {
        if (document.documentElement.matches(':active-view-transition')) return false;
      } catch {
        // a browser without the pseudo class: the animations alone decide
      }
      return document.getAnimations().every((animation) => animation.playState !== 'running');
    },
    null,
    { timeout: 10_000 },
  );
  const button = page.locator('[data-control="access.request"]');
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  const facts = await page.evaluate(
    ([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      const main = document.querySelector('.ts-access');
      const style = main === null ? null : getComputedStyle(main);
      return {
        hitIsButton: hit !== null && hit.closest('[data-control="access.request"]') !== null,
        hit: hit === null ? null : hit.outerHTML.slice(0, 240),
        theme: document.documentElement.getAttribute('data-theme'),
        background: style?.backgroundColor ?? null,
        zIndex: style?.zIndex ?? null,
        figures: document.querySelectorAll('.ts-empty-fig').length,
        notfound: document.querySelectorAll('[data-control="notfound"]').length,
        pointerEvents: style?.pointerEvents ?? null,
        ancestors: (() => {
          const chain: string[] = [];
          for (let el = main?.parentElement ?? null; el !== null; el = el.parentElement) {
            const pe = getComputedStyle(el).pointerEvents;
            chain.push(
              `${el.tagName.toLowerCase()}.${el.className.toString().split(' ').slice(0, 3).join('.')}${pe === 'none' ? '[pe:none]' : ''}`,
            );
          }
          return chain.join(' < ');
        })(),
        skeletons: document.querySelectorAll('.ts-skeleton').length,
      };
    },
    [box!.x + box!.width / 2, box!.y + box!.height / 2] as const,
  );
  await page.screenshot({
    path: `.turboslide/playwright/b6-access-paint-${mode}.png`,
    fullPage: false,
  });
  expect(facts.hitIsButton, `the element at the button's centre: ${JSON.stringify(facts)}`).toBe(
    true,
  );
  expect(facts.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(facts.zIndex).toBe('2');
  expect(facts.figures).toBe(0);
  /* the sign in line reads and links to the presentations */
  await expect(page.locator('[data-control="access.signin.decks"]')).toHaveAttribute(
    'href',
    '/decks',
  );
});
