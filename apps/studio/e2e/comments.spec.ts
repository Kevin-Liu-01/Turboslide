import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

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
const SLIDE = 'thesis';
const BLOCK = 'big';

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
  await context.close();
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  rmSync(join(ROOT, 'decks', COPY), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', COPY), { recursive: true, force: true });
});

test('a comment with a mention reaches the other browser within 2 s: the marker, the filmstrip chip, the inbox plate and For you; reply, resolve, delete with Undo, the orphan and its revival', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await scratchDeck(browser);
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  await openDeck(pageA, `/edit/${COPY}`);
  await openDeck(pageB, `/edit/${COPY}`);
  await goTo(pageA, SLIDE);
  await goTo(pageB, SLIDE);
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
  await expect(pageA.locator('[data-control="title.inbox"]')).toHaveAttribute('data-unread', '1');
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
  await expect(cardA.locator('[data-control^="comment.card.reply."]')).toHaveCount(1);
  await pageA.locator('.ts-snackbar button', { hasText: 'Undo' }).click();
  await expect(cardA.locator('[data-control="comment.card.first"]')).not.toContainText(
    'Comment deleted',
    { timeout: 2000 },
  );
  await pageA.keyboard.press('Escape');

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

  /* the four display modes over View > Comments */
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
  await expect(cardA).toBeFocused();
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

test('a viewer link sees no marker until the owner turns on Viewers can see comments', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const owner = await browser.newContext();
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
  await invoke(pageO, 'share.settings', {
    id: COPY,
    viewersCanSeeComments: true,
    baseRevision: record!.revision,
  });
  await expect(pageV.locator('[data-control="comment.marker"]')).toHaveCount(1, { timeout: 5000 });
  await expect(pageV.locator('[data-control="title.comments"]')).toBeVisible();
  await viewer.close();
  await owner.close();
});
