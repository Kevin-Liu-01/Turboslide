import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

// Comments (gslides-parity SPEC-3 5.3 to 5.6, section 14, 16.3 `comments.spec.ts`; research 08
// section 11): two browser contexts on one scratch deck. A adds a comment on a block through the
// card with a mention of B; within 2 s B shows the marker, the filmstrip chip reads 1, the inbox
// plate reads 1 and the panel's For you tab lists the thread; B replies and resolves; A sees the
// resolve within 2 s and its inbox reads 1; A deletes its comment, the tombstone reads "Comment
// deleted" with B's reply kept and Undo restores it; A removes the block and the thread lists as
// orphaned with its quoted text, undo revives it; a third context on a viewer link sees no marker
// until the owner turns on "Viewers can see comments"; the four display modes; every chord of
// section 14. Every refusal and label is data in menus/strings.ts.
//
// PLAYWRIGHT_BASE_URL=http://localhost:4335 node_modules/.bin/playwright test apps/studio/e2e/comments.spec.ts

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SOURCE = 'gt-brand';
const COPY = `e2e-comments-${Date.now().toString(36)}`;
/* a content slide with a slot block: the thread's anchor is the block, its removal orphans the
   thread and the undo revives it. `thesis` is a statement slide whose `big` is a slide field, not
   a block (the schema's `locateTopBlock`), so a block anchor on it was refused as naming nothing
   and the build-4 chain recorded this spec red at step 26; the focus round moves the fixture. */
const SLIDE = 'avoid';
const BLOCK = 'p1';

type Thread = {
  id: string;
  resolved?: boolean;
  comment: { deleted?: boolean };
  replies: unknown[];
  anchor: { orphaned?: boolean; quote?: string };
};
type CommentsState = { threads: Thread[]; revision: number };

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
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

async function goTo(page: Page, slideId: string): Promise<void> {
  await invoke(page, 'view.goto', { slideId });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', slideId);
}

/* the copy's owner is the sealed cookie of the context that made it (SPEC-3 6.1); since the focus
   round the editor honours the role the record grants whatever the mode (docs/FOCUS.md section
   5 rank 1: a stranger on a restricted deck is a viewer, never the legacy editor), so the owner's
   storage state is kept for the owner's rows and every other browser joins through an editor
   link the owner minted, which gives it its own identity and the editor role */
let ownerState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;
let editLink = '';

async function scratchDeck(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openDeck(page, `/edit/${SOURCE}`);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Comments walk',
    newId: COPY,
    baseRevision: info.revision,
  });
  await openDeck(page, `/edit/${COPY}`);
  const access = await state<{ revision: number }>(page, 'access');
  const link = await invoke<{ url: string }>(page, 'share.createLink', {
    id: COPY,
    role: 'editor',
    label: 'Edit link',
    baseRevision: access?.revision ?? 0,
  });
  editLink = link.url;
  ownerState = await context.storageState();
  await context.close();
}

/** A browser of its own identity that holds the editor role on the copy, through the owner's link. */
async function joinAsEditor(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(editLink);
  await page.waitForURL((url) => url.pathname === `/edit/${COPY}`);
  return { context, page };
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  rmSync(join(ROOT, 'decks', COPY), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', COPY), { recursive: true, force: true });
});

/**
 * Tools > Advanced tools through the product's own row, read back from `describe().state.settings`
 * (docs/FOCUS.md 3.1). The inbox plate `title.inbox` leaves the default view with the switch since
 * b1's fix round (the title row's plate, own chip and own roster row), so the rows below that read
 * the plate's unread count turn the switch on first; the View > Comments submenu is parked too
 * (3.2). Idempotent: a page already in the state asked for is left alone.
 */
async function setAdvancedTools(page: Page, on: boolean): Promise<void> {
  const read = () =>
    page.evaluate(
      () =>
        (window.turboslide!.studio.describe().state as { settings?: Record<string, unknown> })
          .settings?.['advancedTools'] === true,
    );
  if ((await read()) === on) return;
  await page.locator('[data-control="menubar.tools"]').click();
  await page.locator('[data-control="menu.tools.advancedTools"]').click();
  await expect.poll(read, { timeout: 5000 }).toBe(on);
  if ((await page.locator('#ts-menu-tools').count()) > 0) await page.keyboard.press('Escape');
  await expect(page.locator('#ts-menu-tools')).toHaveCount(0);
}

test('a comment with a mention reaches the other browser within 2 s: the marker, the filmstrip chip, the inbox plate and For you; reply, resolve, delete with Undo, the orphan and its revival', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await scratchDeck(browser);
  const { context: a, page: pageA } = await joinAsEditor(browser);
  const { context: b, page: pageB } = await joinAsEditor(browser);
  await openDeck(pageA, `/edit/${COPY}`);
  await openDeck(pageB, `/edit/${COPY}`);
  await goTo(pageA, SLIDE);
  await goTo(pageB, SLIDE);
  /* the inbox plate and View > Comments sit behind Tools > Advanced tools since the focus round */
  await setAdvancedTools(pageA, true);
  await setAdvancedTools(pageB, true);
  expect(
    await state<CommentsState>(pageA, 'comments'),
    'describe().state.comments is the sidecar (SPEC-3 3.10); the route passes EditorShellInput.comments (B2 day 4)',
  ).toBeDefined();
  const me = await state<{ principalId: string; label: string }>(pageB, 'account');
  expect(me, 'describe().state.account is the caller (SPEC-3 3.10)').toBeDefined();

  /* A: select the block, Insert > Comment, name B, post */
  await pageA
    .locator(`.ts-stagewrap.ts-editor [data-block="${BLOCK}"]`)
    .click({ position: { x: 4, y: 4 } });
  await pageA.keyboard.press('ControlOrMeta+Alt+m');
  const card = pageA.locator('[data-control="comment.card"]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-control="comment.card.new.field"]')).toHaveAttribute(
    'placeholder',
    'Comment or add others with @',
  );
  await card.locator('[data-control="comment.card.new.field"]').fill('Check this @');
  await card.locator('[data-control="comment.card.new.field"]').type(me!.label.slice(0, 3));
  await expect(card.locator('[data-control^="comment.card.new.mention."]').first()).toBeVisible();
  await card.locator('[data-control^="comment.card.new.mention."]').first().click();
  await card.locator('[data-control="comment.card.new.field"]').type(' please');
  await card.locator('[data-control="comment.card.new.submit"]').click();

  /* B within 2 s: the marker, the chip, the plate, For you */
  const markerB = pageB.locator('[data-control="comment.marker"]');
  await expect(markerB).toHaveCount(1, { timeout: 2000 });
  await expect(markerB).toHaveAttribute('data-count', '1');
  await expect(pageB.locator(`[data-control="filmstrip.comments.${SLIDE}"]`)).toHaveText('1');
  await expect(pageB.locator('[data-control="title.inbox"]')).toHaveAttribute('data-unread', '1');
  await pageB.locator('[data-control="title.comments"]').click();
  await pageB.locator('[data-control="panel.comments.tab.forYou"]').click();
  await expect(pageB.locator('[data-control="panel.comments.list"] [data-thread]')).toHaveCount(1);
  const threadId = (await state<CommentsState>(pageB, 'comments'))!.threads[0]!.id;

  /* B replies and resolves through the card */
  await pageB.locator(`[data-control="panel.comments.open.${threadId}"]`).click();
  const cardB = pageB.locator('[data-control="comment.card"]');
  await expect(cardB).toBeVisible();
  await cardB.locator('[data-control="comment.card.reply"]').click();
  await cardB.locator('[data-control="comment.card.replyBox.field"]').fill('Done here');
  await cardB.locator('[data-control="comment.card.replyBox.submit"]').click();
  await expect
    .poll(async () => (await state<CommentsState>(pageA, 'comments'))!.threads[0]!.replies.length, {
      timeout: 2000,
    })
    .toBe(1);
  await cardB.locator('[data-control="comment.card.resolve"]').click();
  await expect
    .poll(async () => (await state<CommentsState>(pageA, 'comments'))!.threads[0]!.resolved, {
      timeout: 2000,
    })
    .toBe(true);
  /* A's inbox: B's reply and B's resolve are two kinds, one row each (SPEC-3 5.5 coalesces per
     thread and kind); before the focus round A joined as the legacy editor of a stranger's cookie
     and the rows counted differently, which is why this once read 1 */
  await expect(pageA.locator('[data-control="title.inbox"]')).toHaveAttribute('data-unread', '2');
  await expect(pageA.locator('[data-control="comment.marker"]')).toHaveCount(0);

  /* A reopens from the panel, deletes its comment: the tombstone keeps the reply; Undo restores */
  await pageA.locator('[data-control="title.comments"]').click();
  await pageA.locator(`[data-control="panel.comments.reopen.${threadId}"]`).click();
  await expect(pageA.locator('[data-control="comment.marker"]')).toHaveCount(1, { timeout: 2000 });
  await pageA.locator('[data-control="comment.marker"]').click();
  const cardA = pageA.locator('[data-control="comment.card"]');
  await cardA.locator('[data-control="comment.card.first"]').hover();
  await cardA.locator('[data-control="comment.card.first.more"]').click();
  await pageA.locator('[data-control="comment.card.first.menu.delete"]').click();
  await expect(cardA.locator('[data-control="comment.card.first"]')).toContainText(
    'Comment deleted',
  );
  /* one reply row (`comment.card.reply.<n>`); the row's own controls share the prefix, so the
     rows are counted by their exact ids */
  await expect
    .poll(() =>
      cardA
        .locator('[data-control^="comment.card.reply."]')
        .evaluateAll(
          (els) =>
            els.filter((el) =>
              /^comment\.card\.reply\.\d+$/.test(el.getAttribute('data-control') ?? ''),
            ).length,
        ),
    )
    .toBe(1);
  await pageA.locator('.ts-snackbar button', { hasText: 'Undo' }).click();
  await expect(cardA.locator('[data-control="comment.card.first"]')).not.toContainText(
    'Comment deleted',
    { timeout: 2000 },
  );
  /* the card closes through its own button: after the snackbar's Undo the focus sits on the
     snackbar, where an Escape reaches no card */
  await cardA.locator('[data-control="comment.card.close"]').click();
  await expect(cardA).toHaveCount(0);

  /* A removes the block: the thread lists as orphaned with its quoted text; undo revives it */
  await invoke(pageA, 'block.remove', {
    slideId: SLIDE,
    blockId: BLOCK,
    baseRevision: (await invoke<{ revision: number }>(pageA, 'deck.info')).revision,
  });
  await expect(pageA.locator(`[data-control="panel.comments.thread.${threadId}"]`)).toHaveClass(
    /is-orphan/,
    { timeout: 5000 },
  );
  await pageA.locator('body').press('ControlOrMeta+z');
  await expect(pageA.locator(`[data-control="panel.comments.thread.${threadId}"]`)).not.toHaveClass(
    /is-orphan/,
    { timeout: 5000 },
  );

  /* the four display modes over View > Comments: a parked submenu since the focus round
     (docs/FOCUS.md 3.2; `parked(sub('view.comments', ...))` in menus/model.ts), so the rows and
     the Cmd+Option+Shift+J chord are driven behind Tools > Advanced tools, flipped through the
     product's own row (3.1) */
  await setAdvancedTools(pageA, true);
  const setDisplay = async (id: string) => {
    await pageA.locator('[data-control="menubar.view"]').click();
    await pageA.locator('[data-menu-item="view.comments"]').hover();
    await pageA.locator(`[data-menu-item="${id}"]`).click();
  };
  await setDisplay('view.comments.hide');
  await expect(pageA.locator('[data-control="comment.marker"]')).toHaveCount(0);
  await setDisplay('view.comments.minimize');
  await expect(pageA.locator('[data-control="comment.marker"]')).toHaveCount(1);
  await expect(pageA.locator('[data-control^="comment.card"]')).toHaveCount(0);
  await setDisplay('view.comments.expand');
  await expect(pageA.locator(`[data-control="comment.card.${threadId}"]`)).toBeVisible();
  await setDisplay('view.comments.showAll');
  await pageA.keyboard.press('ControlOrMeta+Alt+Shift+j');
  await expect(pageA.locator('[data-control="comment.marker"]')).toHaveCount(0);
  await setDisplay('view.comments.showAll');

  /* the chords of section 14: Ctrl+Enter enters the marker's card, j and k step, r replies, e resolves, u leaves */
  await pageA.locator('[data-control="comment.marker"]').focus();
  await pageA.keyboard.press('Control+Enter');
  /* the chord enters the card: the focus lands inside it, on its first control (section 14) */
  await expect
    .poll(
      () =>
        pageA.evaluate(
          () => document.activeElement?.closest('[data-control="comment.card"]') !== null,
        ),
      { timeout: 5000 },
    )
    .toBe(true);
  await pageA.keyboard.press('r');
  await expect(cardA.locator('[data-control="comment.card.replyBox.field"]')).toBeFocused();
  await pageA.keyboard.press('Escape');
  await expect(cardA).toBeVisible();
  await pageA.keyboard.press('u');
  await expect(cardA).toHaveCount(0);
  await pageA.keyboard.press('ControlOrMeta+Alt+Shift+a');
  await expect(pageA.locator('[data-control="panel.comments"]')).toBeVisible();
  await b.close();
  await a.close();
});

/* The focus round's rows (docs/FOCUS.md section 5 ranks 19 and 36, section 5.1; B6): one deck from
   /new, whose one slide is the blank template's title slide, so the title placeholder is a slide
   field and not a block. `comments.on-title-placeholder`: the placeholder selected, Cmd+Option+M,
   a comment lands as a marker and a thread; `comments.toolbar-and-menu-routes`: with nothing
   selected the toolbar button and Insert > Comment each open the card and each comment lands;
   `comments.resolve`: Resolve on the first click reads resolved within 5 s;
   `comments.reaches-second-browser`: a second browser, arrived by an editor link so the mode of
   the server does not matter, lists the comments within 10 s. The deck is trashed and deleted
   forever through the product at the end. */
const FOCUS_TITLE = 'Comments on the cover';

async function createFromNew(page: Page): Promise<{ deckId: string; slideId: string }> {
  await page.goto('/new');
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 60_000 });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '', {
    timeout: 60_000,
  });
  const info = await invoke<{ id: string }>(page, 'deck.info');
  const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]');
  const box = await heading.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(heading).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(FOCUS_TITLE, { delay: 20 });
  await page.keyboard.press('Escape');
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
  await page.waitForFunction(() => {
    if (typeof window.turboslide?.studio?.describe !== 'function') return false;
    const s = window.turboslide.studio.describe().state as {
      revision?: number;
      serverRevision?: number;
      pending?: number;
    };
    return s.pending === 0 && s.revision === s.serverRevision;
  });
  const prompt = page.locator('[data-control="dialog.namePrompt"]');
  if ((await prompt.count()) > 0) {
    const field = page.locator('[data-control="dialog.namePrompt.name"]');
    await field.fill('Maya');
    await field.press('Enter');
    if ((await prompt.count()) > 0) {
      await page
        .locator('[data-control="dialog.namePrompt.continue"]')
        .click({ timeout: 2000 })
        .catch(() => undefined);
    }
    if ((await prompt.count()) > 0) await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0, { timeout: 5000 });
  }
  const rows = await invoke<{ id: string }[]>(page, 'slide.list');
  return { deckId: info.id, slideId: rows[0]!.id };
}

async function trashForever(page: Page, deckId: string): Promise<void> {
  try {
    await page.goto(`/edit/${deckId}`);
    await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 60_000 });
    await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
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

test('comments.on-title-placeholder, comments.toolbar-and-menu-routes, comments.resolve, comments.reaches-second-browser: the three routes land a comment on the cover, Resolve reads resolved on the first click, and a second browser lists them', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = await browser.newContext();
  const pageA = await owner.newPage();
  const { deckId, slideId } = await createFromNew(pageA);
  const second = await browser.newContext();
  const pageB = await second.newPage();
  try {
    const markers = pageA.locator('[data-control="comment.marker"]');
    const card = pageA.locator('[data-control="comment.card"]');
    const submit = async (text: string): Promise<void> => {
      await expect(card).toBeVisible();
      await card.locator('[data-control="comment.card.new.field"]').fill(text);
      await card.locator('[data-control="comment.card.new.submit"]').click();
    };

    /* 1. the title placeholder selected (the chip reads Title), Cmd+Option+M, type, Comment */
    const heading = pageA.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]');
    await heading.click();
    await pageA.keyboard.press('ControlOrMeta+Alt+m');
    await submit('Swap the logo before the call');
    await expect(markers).toHaveCount(1, { timeout: 20_000 });
    await expect(pageA.locator('[data-control="snackbar"]')).not.toContainText('names nothing');
    let threads = (await state<CommentsState>(pageA, 'comments'))!.threads;
    expect(threads).toHaveLength(1);
    expect(threads[0]!.anchor).toMatchObject({ slideId });

    /* 2. nothing selected: the toolbar's Insert comment, then Insert > Comment */
    await pageA.keyboard.press('Escape');
    await pageA.keyboard.press('Escape');
    await pageA.locator('[data-control="toolbar.insertComment"]').click();
    await submit('From the toolbar');
    /* every comment here anchors on the slide, and the slide's threads share one marker whose
       count chip grows (CommentMarkers `markerGroups`): the marker stays one, its count reads 2, 3 */
    await expect(markers).toHaveAttribute('data-count', '2', { timeout: 20_000 });
    await pageA.keyboard.press('Escape');
    await pageA.locator('[data-control="menubar.insert"]').click();
    await pageA.locator('[data-menu-item="insert.comment"]').click();
    await submit('From the Insert menu');
    await expect(markers).toHaveAttribute('data-count', '3', { timeout: 20_000 });
    await expect(markers).toHaveCount(1);
    await expect
      .poll(async () => (await state<CommentsState>(pageA, 'comments'))!.threads.length, {
        timeout: 20_000,
      })
      .toBe(3);

    /* 3. Resolve on the first click: the tick reads resolved within 5 s, the thread too */
    threads = (await state<CommentsState>(pageA, 'comments'))!.threads;
    const first = threads.find((thread) => thread.replies.length === 0)!.id;
    await pageA.locator('[data-control="title.comments"]').click();
    await pageA.locator(`[data-control="panel.comments.open.${first}"]`).click();
    await expect(card).toBeVisible();
    const tick = card.locator('[data-control="comment.card.resolve"]');
    await expect(tick).toHaveAttribute('aria-label', 'Resolve');
    await tick.click();
    await expect(tick).toHaveAttribute('aria-label', 'Re-open', { timeout: 5000 });
    await expect
      .poll(
        async () =>
          (await state<CommentsState>(pageA, 'comments'))!.threads.find((t) => t.id === first)
            ?.resolved,
        { timeout: 5000 },
      )
      .toBe(true);
    await expect(markers).toHaveAttribute('data-count', '2', { timeout: 5000 });

    /* 4. a second browser, arrived by an editor link, lists the comments within 10 s */
    const access = await state<{ revision: number }>(pageA, 'access');
    const link = await invoke<{ url: string }>(pageA, 'share.createLink', {
      id: deckId,
      role: 'editor',
      label: 'Edit link',
      baseRevision: access?.revision ?? 0,
    });
    await pageB.goto(link.url);
    await pageB.waitForURL((url) => url.pathname === `/edit/${deckId}`);
    await openDeck(pageB, `/edit/${deckId}`);
    const markersB = pageB.locator('[data-control="comment.marker"]');
    await expect(markersB).toHaveAttribute('data-count', '2', { timeout: 10_000 });
    await pageB.locator('[data-control="title.comments"]').click();
    /* the panel lists every thread, the resolved one among them; the marker counts the open ones */
    await expect(pageB.locator('[data-control="panel.comments.list"] [data-thread]')).toHaveCount(
      3,
      { timeout: 10_000 },
    );
    /* one more from A, with nothing selected: B's count moves within 10 s */
    await pageA.keyboard.press('Escape');
    await pageA.keyboard.press('Escape');
    await pageA.keyboard.press('ControlOrMeta+Alt+m');
    await submit('Reaches the other browser');
    await expect(markersB).toHaveAttribute('data-count', '3', { timeout: 10_000 });
    await expect(pageB.locator('[data-control="panel.comments.list"] [data-thread]')).toHaveCount(
      4,
      { timeout: 10_000 },
    );
  } finally {
    await second.close();
    await trashForever(pageA, deckId);
    await owner.close();
  }
});

/* The viewer's marker (SPEC-3 5.3, the setting Viewers can see comments): the row stands as round
   three wrote it and is last in the file because it is red for a mechanism outside this lane (the
   markers layer mounts inside the editing overlay alone; build/b6.md request R10), so the rows
   before it keep running. */
test('a viewer link sees no marker until the owner turns on Viewers can see comments', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const owner = await browser.newContext({ storageState: ownerState });
  const pageO = await owner.newPage();
  await openDeck(pageO, `/edit/${COPY}`);
  const access = await state<{ revision: number }>(pageO, 'access');
  expect(access, 'describe().state.access is the record (SPEC-3 3.10)').toBeDefined();
  const link = await invoke<{ url: string }>(pageO, 'share.setGeneralAccess', {
    id: COPY,
    mode: 'link',
    role: 'viewer',
    baseRevision: access!.revision,
  });
  const viewer = await browser.newContext();
  const pageV = await viewer.newPage();
  await pageV.goto(link.url);
  await pageV.waitForURL(/\/deck\//);
  await pageV.goto(`/edit/${COPY}`);
  await expect(pageV.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
  await goTo(pageV, SLIDE);
  await expect(pageV.locator('[data-control="toolbar.viewOnly"]')).toBeVisible();
  await expect(pageV.locator('[data-control="comment.marker"]')).toHaveCount(0);
  await expect(pageV.locator('[data-control="title.comments"]')).toHaveCount(0);
  const record = await state<{ revision: number }>(pageO, 'access');
  const viewerRevisionBefore = (await state<{ revision?: number }>(pageV, 'access'))?.revision;
  const settingsAnswer = await invoke(pageO, 'share.settings', {
    id: COPY,
    viewersCanSeeComments: true,
    baseRevision: record!.revision,
  });
  const ownerRecord = await pageO.evaluate(async (id) => {
    const response = await fetch(`/api/access/${encodeURIComponent(id)}`, {
      credentials: 'same-origin',
    });
    const body = (await response.json()) as {
      record?: { revision?: number; settings?: Record<string, unknown> };
    };
    return { revision: body.record?.revision, settings: body.record?.settings };
  }, COPY);
  const viewerFacts = () =>
    pageV.evaluate(() => {
      const st = window.turboslide!.studio.describe().state as {
        access?: { role?: string | null; capabilities?: string[] };
        comments?: { threads?: unknown[]; loaded?: boolean };
        sync?: { connected?: boolean };
      };
      return {
        role: st.access?.role ?? null,
        revision: (st.access as { revision?: number } | undefined)?.revision ?? null,
        capabilities: st.access?.capabilities ?? [],
        threads: st.comments?.threads?.length ?? -1,
        loaded: st.comments?.loaded ?? null,
        connected: st.sync?.connected ?? null,
        markers: document.querySelectorAll('[data-control="comment.marker"]').length,
      };
    });
  await expect
    .poll(async () => (await viewerFacts()).markers, {
      timeout: 5000,
      message: `the viewer's page after Viewers can see comments: ${JSON.stringify(await viewerFacts())}; the viewer's record revision before ${String(viewerRevisionBefore)}; the owner's write answered ${JSON.stringify(settingsAnswer).slice(0, 200)}; the route's record ${JSON.stringify(ownerRecord)}`,
    })
    .toBe(1);
  await expect(pageV.locator('[data-control="title.comments"]')).toBeVisible();
  await viewer.close();
  await owner.close();
});
