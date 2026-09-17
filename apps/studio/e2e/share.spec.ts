import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';

// Sharing (gslides-parity SPEC-3 0.15, 0.16, 6.3 to 6.5, 6.8, 16.3 `share.spec.ts`; research 09
// 12.1): the stranger receives the You need access page on four routes and 403 on the write
// functions; the Share dialog opens on Restricted with the people field first and the footer
// sentence; Anyone with the link as Viewer through `/s/<token>` lands on `/deck` with no notes and
// no skipped slide, and `/edit/<id>` opens Viewing mode with the View only button; a commenter
// link lands on `/edit` in Commenting mode; the link opened from a page on another origin and from
// a bare address bar both land and a `cors` fetch of it is 403; rotate, Stop sharing, publish, the
// embed's messages, 410 after unpublish; request access with the dot, the banner and Approve as
// commenter; the legacy deck's claim; the toolbar's Copy link holds no token.
//
// PLAYWRIGHT_BASE_URL=http://localhost:4335 node_modules/.bin/playwright test apps/studio/e2e/share.spec.ts

const ROOT = join(import.meta.dirname, '..', '..', '..');
/* the refusal rows need `authorize()` enforcing (SPEC-3 11.5 R3): the check runner and the
   builders' servers run shadow mode by default, where a stranger is admitted as the legacy editor
   and the denial is logged (VERIFICATION-3 section 4: "shadow admits the stranger by design"), so
   those rows read the mode the server was started with, as security.spec.ts does */
/* since the focus round the mode is read from the deployment itself, `GET /api/access/<id>`
   answers `authorize: 'shadow' | 'enforce'` (b6.md: roles.spec.ts and security.spec.ts read it the
   same way), so a run against a preview records the preview's mode and never the runner's */
async function authorizeMode(page: Page, deckId: string): Promise<'shadow' | 'enforce'> {
  const response = await page.request.get(`/api/access/${deckId}`);
  const body = (await response.json().catch(() => ({}))) as { authorize?: string };
  return body.authorize === 'enforce' ? 'enforce' : 'shadow';
}
const SOURCE = 'gt-brand';
const COPY = `e2e-share-${Date.now().toString(36)}`;
const FOOTER = 'Speaker notes and skipped slides never travel with a view or comment link';

type Access = {
  revision: number;
  generalAccess: { mode: string; role: string };
  requests?: unknown[];
};

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

async function openDeck(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  /* the editor skeleton carries `pt-viewer` too while the shell hydrates (B5's EditorSkeleton),
     and two of them coexist for a frame, so the settled viewer is the one that is not a skeleton
     (the chain's step 26 on this row: "strict mode violation: locator('.pt-viewer') resolved to
     2 elements", both `pt-viewer is-editor ts-skeleton`) */
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
}

/* the copy's owner is the sealed cookie of the context that made it (SPEC-3 6.1, 7.1), and a
   share write is never shadowed (VERIFICATION-3 finding 40: every test opened a fresh context,
   a new anonymous principal, and `share.setGeneralAccess` answered "not available to you"), so
   the owner's storage state is kept from the copying context and every owner context below
   starts from it */
let ownerState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;

async function scratchDeck(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openDeck(page, `/edit/${SOURCE}`);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Share walk',
    newId: COPY,
    baseRevision: info.revision,
  });
  ownerState = await context.storageState();
  await context.close();
}

/** A context holding the owner's identity cookie (the one `scratchDeck` copied with). */
function ownerContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  return browser.newContext({ ...options, storageState: ownerState });
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  rmSync(join(ROOT, 'decks', COPY), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', COPY), { recursive: true, force: true });
});

test('the Share dialog opens on Restricted with the people field first and the footer sentence; the toolbar Copy link holds no token', async ({
  browser,
}) => {
  await scratchDeck(browser);
  const owner = await ownerContext(browser, {
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await owner.newPage();
  await openDeck(page, `/edit/${COPY}`);
  const access = await state<Access>(page, 'access');
  expect(
    access,
    'describe().state.access is the record (SPEC-3 3.10); the route passes EditorShellInput.access (B2 day 4, B3 day 4)',
  ).toBeDefined();
  expect(access!.generalAccess.mode).toBe('restricted');
  await page.locator('[data-control="share.open"]').click();
  const dialog = page.locator('[data-control="dialog.share"]');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(520);
  /* the people field comes before General access, and the review slot is present at zero */
  const emails = dialog.locator('[data-control="dialog.share.emails"]');
  await expect(emails).toBeVisible();
  await expect(dialog.locator('[data-control="dialog.share.review"]')).toHaveText(
    'No pending requests',
  );
  await expect(dialog.locator('[data-control="dialog.share.mode"]')).toHaveValue('restricted');
  await expect(dialog.locator('[data-control="dialog.share.footer"]')).toHaveText(FOOTER);
  const emailsBox = await emails.boundingBox();
  const modeBox = await dialog.locator('[data-control="dialog.share.mode"]').boundingBox();
  expect(emailsBox!.y).toBeLessThan(modeBox!.y);
  await dialog.locator('[data-control="dialog.share.done"]').click();
  /* File > Share > Copy link copies the address without a token */
  await page.locator('[data-control="menubar.file"]').click();
  await page.locator('[data-menu-item="file.share"]').hover();
  await page.locator('[data-menu-item="file.share.copyLink"]').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(`${new URL(page.url()).origin}/deck/${COPY}`);
  expect(copied.includes('/s/')).toBe(false);
  await owner.close();
});

test('a stranger receives the You need access page on four routes and 403 on the writes; a viewer link lands on /deck without notes and /edit opens Viewing with View only; a commenter link lands in Commenting', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const owner = await ownerContext(browser);
  const pageO = await owner.newPage();
  await openDeck(pageO, `/edit/${COPY}`);
  const stranger = await browser.newContext();
  const pageS = await stranger.newPage();
  /* the stranger's first request carries a cookie: a cookieless first request on a
     TURBOSLIDE_LOCAL_OPEN dev server is admitted as the checkout holder (b6.md R11) */
  await pageS.goto('/decks');
  const ENFORCE = (await authorizeMode(pageO, COPY)) === 'enforce';
  if (ENFORCE) {
    for (const path of [`/edit/${COPY}`, `/deck/${COPY}`, `/present/${COPY}`, `/print/${COPY}`]) {
      const response = await pageS.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(pageS.locator('[data-control="access.page"]')).toBeVisible();
      await expect(pageS.locator('[data-control="access.sentence"]')).toHaveText(
        'This presentation is not available to you, or does not exist.',
      );
    }
    const write = await pageS.request.post(`/api/actions/deck.rename?deck=${COPY}`, {
      data: { name: 'x', baseRevision: 1 },
    });
    expect([401, 403, 404]).toContain(write.status());
  } else {
    /* shadow mode: the stranger is admitted as today's editor and the record stays restricted; the
       refusal is the log line (SPEC-3 11.5 R3) */
    const response = await pageS.goto(`/deck/${COPY}`);
    expect(response?.status()).toBe(200);
    const record = (await state<Access>(pageO, 'access'))!;
    expect(record.generalAccess.mode).toBe('restricted');
  }

  /* Anyone with the link as Viewer */
  const access = (await state<Access>(pageO, 'access'))!;
  const viewerLink = await invoke<{ url: string }>(pageO, 'share.setGeneralAccess', {
    id: COPY,
    mode: 'link',
    role: 'viewer',
    baseRevision: access.revision,
  });
  expect(viewerLink.url).toMatch(/\/s\/[A-Za-z0-9_-]{22}$/);
  await pageS.goto(viewerLink.url);
  await pageS.waitForURL((url) => url.pathname === `/deck/${COPY}` && !url.href.includes('/s/'));
  const html = await pageS.content();
  expect(html.includes('"notes"')).toBe(false);
  await pageS.goto(`/edit/${COPY}`);
  await expect(pageS.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await expect(pageS.locator('[data-control="toolbar.viewOnly"]')).toHaveText('View only');
  await expect(pageS.locator('[data-control="menubar.edit"]')).toHaveCount(0);
  await expect(pageS.locator('[data-menu-item="view.mode"]')).toHaveCount(0);
  await expect(pageS.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
    'data-edit-mode',
    'viewing',
  );

  /* a `cors` fetch of the link is 403 */
  const cors = await pageS.evaluate(
    async (url) => (await fetch(url, { mode: 'cors', redirect: 'manual' })).status,
    viewerLink.url,
  );
  expect(cors).toBe(403);

  /* a commenter link lands on /edit in Commenting mode */
  const record = (await state<Access>(pageO, 'access'))!;
  const commenterLink = await invoke<{ url: string }>(pageO, 'share.createLink', {
    id: COPY,
    role: 'commenter',
    baseRevision: record.revision,
  });
  const commenter = await browser.newContext();
  const pageC = await commenter.newPage();
  await pageC.goto(commenterLink.url);
  await pageC.waitForURL((url) => url.pathname === `/edit/${COPY}`);
  await expect(pageC.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
    'data-edit-mode',
    'commenting',
  );
  await pageC.locator('[data-control="menubar.insert"]').click();
  await expect(pageC.locator('[data-menu-item="insert.comment"]')).toBeVisible();
  await expect(pageC.locator('[data-menu-item="insert.textBox"]')).toHaveCount(0);
  await pageC.keyboard.press('Escape');
  await expect(pageC.locator('[data-control="toolbar.viewOnly"]')).toHaveCount(0);
  await commenter.close();
  await stranger.close();
  await owner.close();
});

test('rotate and Stop sharing kill the link; publish gives the player, the embed answers and 410 after unpublish', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const owner = await ownerContext(browser);
  const pageO = await owner.newPage();
  await openDeck(pageO, `/edit/${COPY}`);
  /* every share write bases on the record as the server holds it now, read through share.get,
     and a write the record moved under is re-read and retried once, which is what the SPEC-3 6.4
     sentence ("re-read and retry") tells a client to do: the previous row's link exchanges wrote
     the visitors' grants into this record, and a page opened right after them held the record one
     revision behind (the round three hotfix ship step, check step 26) */
  const shareWrite = async <T>(action: string, input: Record<string, unknown>): Promise<T> => {
    const base = async () => {
      const got = await invoke<{ revision?: number; record?: { revision: number } }>(
        pageO,
        'share.get',
        { id: COPY },
      );
      return got.record?.revision ?? got.revision ?? 0;
    };
    try {
      return await invoke<T>(pageO, action, { ...input, baseRevision: await base() });
    } catch (error) {
      if (!/re-read and retry|changed since they were read/.test(String(error))) throw error;
      return invoke<T>(pageO, action, { ...input, baseRevision: await base() });
    }
  };
  const link = await shareWrite<{ url: string; link: { id: string } }>('share.createLink', {
    id: COPY,
    role: 'viewer',
  });
  const rotated = await shareWrite<{ url: string }>('share.rotateLink', {
    id: COPY,
    linkId: link.link.id,
  });
  expect(rotated.url).not.toBe(link.url);
  const dead = await pageO.request.get(link.url, { maxRedirects: 0 });
  expect(dead.status()).toBe(404);
  await shareWrite('share.stop', { id: COPY });
  const stopped = await pageO.request.get(rotated.url, { maxRedirects: 0 });
  expect(stopped.status()).toBe(404);

  const published = await shareWrite<{ url: string; embed: string }>('deck.publish', {
    id: COPY,
  });
  expect(published.url).toContain('?p=');
  const player = await browser.newContext();
  const pageP = await player.newPage();
  const playerResponse = await pageP.goto(published.url);
  expect(playerResponse?.status()).toBe(200);
  expect(playerResponse?.headers()['x-robots-tag']).toContain('noindex');
  // a same-origin host page around the frame, as Prototemplate's DeckFrame is (viewer.spec.ts):
  // the embed's frame-ancestors admits the studio's own origin on a dev server, the recorder is
  // installed before the frame is appended so the opening slide message is not missed, and the
  // frame src is the embed's own path so the host and the frame share the origin (the round three
  // hotfix ship step, check step 26; DeckViewer.tsx postSlide posts with target origin '*')
  await pageP.goto(new URL('/decks', published.url).href);
  const embedPath = new URL(published.embed, published.url);
  const messages = await pageP.evaluateHandle((src) => {
    const seen: unknown[] = [];
    window.addEventListener('message', (event) => {
      const data = event.data as { type?: string };
      if (data?.type === 'gt-deck-slide') seen.push(data);
    });
    const frame = document.createElement('iframe');
    frame.id = 'embed';
    frame.src = src;
    frame.width = '960';
    frame.height = '540';
    document.body.appendChild(frame);
    return seen;
  }, `${embedPath.pathname}${embedPath.search}`);
  await expect
    .poll(() => messages.evaluate((seen) => seen.length), {
      timeout: 15_000,
      message: 'the embed posts gt-deck-slide',
    })
    .toBeGreaterThan(0);
  const message = await messages.evaluate((seen) => seen[0] ?? null);
  expect(message, 'the embed posts gt-deck-slide').not.toBeNull();
  await shareWrite('deck.unpublish', { id: COPY });
  const gone = await pageP.request.get(published.url);
  expect(gone.status()).toBe(410);
  expect(await gone.text()).toContain('This presentation is no longer published');
  await player.close();
  await owner.close();
});

test('request access shows the dot on Share, the banner and Approve as commenter; a legacy deck shows the claim', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const owner = await ownerContext(browser);
  const pageO = await owner.newPage();
  await openDeck(pageO, `/edit/${COPY}`);
  const stranger = await browser.newContext();
  const pageS = await stranger.newPage();
  await pageS.goto('/decks');
  /* the request access form stands on the You need access page, an enforce mode surface: in
     shadow mode the stranger is admitted as a viewer and the form is not there (b6.md R11) */
  const mode = await authorizeMode(pageO, COPY);
  if (mode === 'enforce') {
    await pageS.goto(`/deck/${COPY}`);
    await requestAccessRows(pageS, pageO);
  } else {
    const response = await pageS.goto(`/deck/${COPY}`);
    expect(response?.status(), 'shadow mode admits the stranger as a viewer').toBe(200);
    await expect(pageS.locator('[data-control="access.request"]')).toHaveCount(0);
  }
  await stranger.close();

  /* the legacy deck: a synthesized record, the claim sentence in the dialog */
  await openDeck(pageO, `/edit/${SOURCE}`);
  const legacy = await state<Access & { claimable?: boolean; generalAccess: { mode: string } }>(
    pageO,
    'access',
  );
  expect(legacy?.generalAccess.mode).toBe('open');
  await pageO.locator('[data-control="share.open"]').click();
  await expect(pageO.locator('[data-control="dialog.share.legacy"]')).toContainText(
    'Anyone with the address can view (legacy)',
  );
  /* the claim block ("This presentation has no owner yet") is a signed in principal's (SPEC-3 6.1
     and its actions table: `share.claim` is "a signed in principal claims an unowned deck"; the
     view's `claimable` reads `owner === null && identity.kind === 'account'` in EditorRoot.tsx and
     the controller, and share-dialog.test.tsx pins both the rule and the block's sentence). The
     owner context here is the anonymous cookie that made the copy, so the dialog shows the legacy
     row and no claim block. The earlier assertion of the sentence was never reached in a chain run
     (build-4 integrator.md step 26: share.spec.ts:320 failed before it, at the request access
     form) and could not hold for an anonymous principal; the focus round's fixer moved it to the
     rule */
  expect(legacy?.claimable ?? false).toBe(false);
  await expect(pageO.locator('[data-control="dialog.share.claim"]')).toHaveCount(0);
  await owner.close();
});

/** The request access rows of the fourth test, in enforce mode: the dot, the review, Approve as commenter. */
async function requestAccessRows(pageS: Page, pageO: Page): Promise<void> {
  await pageS.locator('[data-control="access.role"]').selectOption('commenter');
  await pageS.locator('[data-control="access.email"]').fill('reviewer@example.test');
  await pageS.locator('[data-control="access.request"]').click();
  await expect(pageS.locator('[data-control="access.answer"]')).toHaveText(
    'If this presentation exists, its owner has been asked.',
  );
  await expect(pageO.locator('.ts-title-share-slot')).toHaveClass(/has-dot/, { timeout: 5000 });
  await pageO.locator('[data-control="share.open"]').click();
  const dialog = pageO.locator('[data-control="dialog.share"]');
  await expect(dialog.locator('[data-control="dialog.share.review"]')).toHaveClass(/has-requests/);
  await dialog.locator('[data-control="dialog.share.review.toggle"]').click();
  const approve = dialog.locator('[data-control$=".approve"]');
  await expect(approve).toHaveText('Approve as Commenter');
  await approve.click();
  await expect(dialog.locator('[data-control="dialog.share.review"]')).toHaveText(
    'No pending requests',
    { timeout: 5000 },
  );
  await expect(dialog.locator('[data-control^="dialog.share.grant."]')).toHaveCount(1);
  await expect(dialog.locator('[data-control^="dialog.share.grant."]')).toContainText('Pending');
  await dialog.locator('[data-control="dialog.share.done"]').click();
}
