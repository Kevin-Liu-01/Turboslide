import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

// The sync engine spec of round five (gslides-parity SPEC-5-amendments A3 items 1 to 8, A6; B7):
// two browser contexts (two people) and a second tab of the first person on one scratch deck
// against a dev server on the memory tier. One person's rapid edits are each acknowledged at
// exactly the next revision with no stale words anywhere (items 1, 4, 8); the revision the tab
// reports never sits behind the server's (item 4); a reload keeps the tab's client id and draws
// no ghost of it (item 5); a second tab of the same person is nobody on every presence surface
// while the other person is exactly one other (item 5); two people alternating edits converge to
// one document and one revision (item 3); a five second offline window replays the pending
// operations and converges (item 7). The rebase of a refused write and the write queue are unit
// tested in packages/realtime/client/room-client.test.ts, because the memory tier transforms a
// stale base on the server and never answers 409; the blob tier's 409 path is the sync stress
// probe against the preview (A3 item 7).
//
// Runs against the builder's own dev server with TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory:
// PLAYWRIGHT_BASE_URL=http://localhost:4358 node_modules/.bin/playwright test apps/studio/e2e/sync.spec.ts

const SOURCE = 'gt-brand';
const DECK = `e2e-sync-${Date.now().toString(36)}`;
const SLIDE = 'content-rule';
const PARA = 'p1';
/** The words a refused write must never show a person (A3 item 8). */
const STALE = /is stale|baseRevision|changed in the Blob store|reload and rebase|not accepted/i;

type SyncStatus = {
  seq: number;
  revision: number;
  pending: number;
  retained: number;
  tier: string;
  connected: boolean;
  offline?: boolean;
  rebased?: number;
};

type Participant = { clientId: string; principalId?: string };
type PresenceList = { self: Participant; others: Participant[] };

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

async function status(page: Page): Promise<SyncStatus> {
  return invoke<SyncStatus>(page, 'sync.status');
}

async function stateOf<T>(page: Page, key: string): Promise<T> {
  return page.evaluate(
    (k) => (window.turboslide!.studio.describe().state as Record<string, unknown>)[k] as T,
    key,
  );
}

async function revision(page: Page): Promise<number> {
  return stateOf<number>(page, 'revision');
}

async function serverRevision(page: Page): Promise<number> {
  return stateOf<number>(page, 'serverRevision');
}

async function openEditor(page: Page, deckId: string, slideId = SLIDE): Promise<void> {
  await page.goto(`/edit/${deckId}`);
  await editorReady(page);
  await invoke(page, 'view.goto', { slideId });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', slideId);
  await expect(page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]').first()).toBeVisible();
  await expect.poll(() => status(page).then((s) => s.connected), { timeout: 45_000 }).toBe(true);
}

/** Nothing pending or retained in the room of this tab. */
async function settled(page: Page, timeout = 15_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const s = await status(page);
        return s.pending + s.retained;
      },
      { timeout },
    )
    .toBe(0);
}

/** The document's text at a run pointer, read through slide.get. */
async function runText(page: Page, blockId: string, pointer = 'text'): Promise<string> {
  return page.evaluate(
    async ([sid, bid, ptr]) => {
      const got = (await window.turboslide!.studio.invoke('slide.get', { slideId: sid })) as {
        slide: { slots: Record<string, { id: string; [key: string]: unknown }[]> };
      };
      const block = Object.values(got.slide.slots)
        .flat()
        .find((b) => b.id === bid);
      if (!block) return '';
      const value = ptr
        .split('/')
        .reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], block);
      return typeof value === 'string' ? value.replace(/ /g, ' ') : '';
    },
    [SLIDE, blockId, pointer] as const,
  );
}

/** A click on a run opens the inline session; the caret goes to the end of the text. */
async function caretAtEnd(page: Page, blockId: string): Promise<void> {
  const run = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${blockId}/text"]`);
  const box = await run.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 8, box!.y + 8);
  await expect(run).toHaveAttribute('contenteditable', 'true');
  await page.evaluate((bid) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${bid}/text"]`);
    if (!(el instanceof HTMLElement)) throw new Error(`no run ${bid}`);
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, blockId);
}

async function endEdit(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  const prompt = page.locator('[data-control="dialog.namePrompt"]');
  const opened = await prompt
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (opened) {
    await prompt.locator('[data-control="dialog.namePrompt.close"]').click();
    await expect(prompt).toBeHidden();
  }
}

/** The stale words, wherever a person could read them: the state's error, the snackbar, a toast, the status row. */
async function staleWords(page: Page): Promise<string | null> {
  const error = await stateOf<string | null>(page, 'error');
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-snackbar.is-on, .pt-toast.is-on, .ts-status')]
      .map((el) => el.textContent ?? '')
      .join(' | '),
  );
  const hits = [error ?? '', shown].filter((text) => STALE.test(text));
  return hits.length === 0 ? null : hits.join(' ; ');
}

async function others(page: Page): Promise<Participant[]> {
  return (await invoke<PresenceList>(page, 'presence.list')).others;
}

async function ownClientId(page: Page): Promise<string | null> {
  return stateOf<{ clientId?: string } | null>(page, 'presence').then((p) => p?.clientId ?? null);
}

/** The remote presence drawn in a tab: what a person sees of others. */
async function drawn(page: Page): Promise<{ chips: number; outlines: number; carets: number }> {
  return page.evaluate(() => ({
    chips: document.querySelectorAll('[data-control^="presence.chip."]').length,
    outlines: document.querySelectorAll('.ts-remote-outline').length,
    carets: document.querySelectorAll('.ts-remote-caret').length,
  }));
}

let a: BrowserContext;
let b: BrowserContext;
let pageA: Page;
let pageB: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  a = await browser.newContext();
  b = await browser.newContext();
  pageA = await a.newPage();
  pageB = await b.newPage();
  await pageA.goto(`/edit/${SOURCE}`);
  await editorReady(pageA);
  const info = await invoke<{ revision: number }>(pageA, 'deck.info');
  const copied = await invoke<{ deckId: string }>(pageA, 'deck.copy', {
    id: SOURCE,
    name: 'Sync walk',
    newId: DECK,
    baseRevision: info.revision,
  });
  expect(copied.deckId).toBe(DECK);
});

test.afterAll(async () => {
  try {
    await pageA.goto(`/edit/${DECK}`);
    await editorReady(pageA);
    const info = await invoke<{ revision: number }>(pageA, 'deck.info');
    await invoke(pageA, 'deck.remove', { id: DECK, baseRevision: info.revision, confirm: true });
  } catch {
    // the deck may be gone already
  }
  await a.close();
  await b.close();
});

test('twelve rapid edits are each acknowledged at exactly the next revision, with no stale words and the reported revision never behind the server (A3 items 1, 4, 8)', async () => {
  test.setTimeout(120_000);
  await openEditor(pageA, DECK);
  await settled(pageA);
  const before = await runText(pageA, PARA);
  await caretAtEnd(pageA, PARA);
  let expected = before;
  let current = await revision(pageA);
  const exact: boolean[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const token = ` s${i}`;
    const typedAt = Date.now();
    await pageA.keyboard.type(token, { delay: 20 });
    expected += token;
    const want = current + 1;
    await expect.poll(() => revision(pageA), { timeout: 10_000 }).toBeGreaterThanOrEqual(want);
    const got = await revision(pageA);
    exact.push(got === want);
    expect(await staleWords(pageA), `edit ${i}`).toBeNull();
    // the reported revision is the acknowledged one, never a number behind the server's
    expect(got).toBeGreaterThanOrEqual(await serverRevision(pageA));
    current = got;
    // past the 100 ms typing burst, so the next token is its own write
    await pageA.waitForTimeout(Math.max(0, 450 - (Date.now() - typedAt)));
  }
  await endEdit(pageA);
  await settled(pageA);
  expect(exact.every(Boolean), `each edit at the next revision: ${exact.join(',')}`).toBe(true);
  expect(await runText(pageA, PARA)).toBe(expected);
  const s = await status(pageA);
  expect(s.revision).toBe(await serverRevision(pageA));
  expect(s.pending).toBe(0);
  expect(s.offline ?? false).toBe(false);
  // the save words read saved, and a status chip that shows a revision shows the server's
  await expect(pageA.locator('[data-control="deck.saveState"]')).toHaveAttribute(
    'data-state',
    'saved',
  );
});

test('a reload keeps the tab’s client id and draws no ghost of it; the other person is exactly one other (A3 item 5)', async () => {
  test.setTimeout(120_000);
  await openEditor(pageB, DECK);
  const idBefore = await ownClientId(pageA);
  expect(idBefore).toMatch(/^[0-9a-f]{32}$/);
  await pageA.reload();
  await editorReady(pageA);
  await expect.poll(() => status(pageA).then((s) => s.connected), { timeout: 45_000 }).toBe(true);
  // one client id per tab (sessionStorage): the reload asks for the id it held and keeps it
  await expect.poll(() => ownClientId(pageA), { timeout: 10_000 }).toBe(idBefore);
  const idB = await ownClientId(pageB);
  // A lists B once and never itself or an earlier id of its own; B lists A once
  await expect
    .poll(async () => (await others(pageA)).map((row) => row.clientId), { timeout: 20_000 })
    .toEqual([idB]);
  await expect
    .poll(async () => (await others(pageB)).map((row) => row.clientId), { timeout: 20_000 })
    .toEqual([idBefore]);
  await expect.poll(() => drawn(pageA).then((d) => d.chips), { timeout: 10_000 }).toBe(1);
  // the roster menu: B's row and one self row
  await pageA.locator('[data-control="presence.more"]').click();
  const roster = pageA.locator('#ts-menu-roster');
  await expect(roster).toBeVisible();
  await expect(roster.locator('[data-control^="presence.roster."]')).toHaveCount(2);
  await expect(roster.locator('.ts-roster-row.is-self')).toHaveCount(1);
  await pageA.keyboard.press('Escape');
  await expect(roster).toBeHidden();
});

test('a second tab of the same person is nobody on every presence surface, in both tabs (A3 item 5)', async () => {
  test.setTimeout(120_000);
  const shared = await a.browser()!.newContext({ storageState: await a.storageState() });
  const pageS = await shared.newPage();
  try {
    await openEditor(pageS, DECK);
    const idA = await ownClientId(pageA);
    const idS = await ownClientId(pageS);
    const idB = await ownClientId(pageB);
    expect(idS).not.toBe(idA);
    const me = (await invoke<PresenceList>(pageS, 'presence.list')).self.principalId;
    const meA = (await invoke<PresenceList>(pageA, 'presence.list')).self.principalId;
    expect(me).toBe(meA);
    await pageS.waitForTimeout(1500);
    // A still lists exactly B; S lists exactly B; neither lists the same person's other tab
    await expect
      .poll(async () => (await others(pageA)).map((row) => row.clientId), { timeout: 20_000 })
      .toEqual([idB]);
    await expect
      .poll(async () => (await others(pageS)).map((row) => row.clientId), { timeout: 20_000 })
      .toEqual([idB]);
    expect((await drawn(pageA)).chips).toBe(1);
    expect((await drawn(pageS)).chips).toBe(1);
    // B sees two tabs of the same person: two rows, one chip each
    await expect
      .poll(async () => (await others(pageB)).map((row) => row.clientId).sort(), {
        timeout: 20_000,
      })
      .toEqual([idA, idS].sort());
  } finally {
    await pageS.close({ runBeforeUnload: true }).catch(() => undefined);
    await shared.close();
  }
  await expect
    .poll(async () => (await others(pageB)).map((row) => row.clientId), { timeout: 30_000 })
    .toEqual([await ownClientId(pageA)]);
});

test('two people alternating edits converge to one document and one revision (A3 item 3)', async () => {
  test.setTimeout(180_000);
  await settled(pageA);
  await settled(pageB);
  await expect
    .poll(async () => (await status(pageA)).seq === (await status(pageB)).seq, { timeout: 20_000 })
    .toBe(true);
  let expected = await runText(pageA, PARA);
  for (let round = 1; round <= 4; round += 1) {
    for (const [page, other, who] of [
      [pageA, pageB, 'a'],
      [pageB, pageA, 'b'],
    ] as const) {
      await caretAtEnd(page, PARA);
      const token = ` ${who}${round}`;
      await page.keyboard.type(token, { delay: 20 });
      expected += token;
      await endEdit(page);
      await settled(page);
      await expect.poll(() => runText(other, PARA), { timeout: 15_000 }).toContain(token);
      expect(await staleWords(page)).toBeNull();
      expect(await staleWords(other)).toBeNull();
    }
  }
  await settled(pageA);
  await settled(pageB);
  expect(await runText(pageA, PARA)).toBe(expected);
  expect(await runText(pageB, PARA)).toBe(expected);
  const sA = await status(pageA);
  const sB = await status(pageB);
  expect(sA.revision).toBe(sB.revision);
  expect(await revision(pageA)).toBe(await serverRevision(pageA));
  expect(await revision(pageB)).toBe(await serverRevision(pageB));
});

test('a five second offline window replays every pending operation and both tabs converge (A3 item 7)', async () => {
  test.setTimeout(120_000);
  await settled(pageA);
  let expected = await runText(pageA, PARA);
  await caretAtEnd(pageA, PARA);
  await a.setOffline(true);
  const startedAt = Date.now();
  let typed = '';
  while (Date.now() - startedAt < 5000) {
    const ch = String.fromCharCode(97 + (typed.length % 26));
    await pageA.keyboard.type(ch, { delay: 0 });
    typed += ch;
    await pageA.waitForTimeout(180);
  }
  expected += typed;
  await endEdit(pageA);
  const during = await status(pageA);
  expect(during.pending).toBeGreaterThan(0);
  await a.setOffline(false);
  await expect
    .poll(
      async () => {
        const s = await status(pageA);
        return s.pending === 0 && s.connected && (s.offline ?? false) === false;
      },
      { timeout: 40_000 },
    )
    .toBe(true);
  await expect.poll(() => runText(pageA, PARA), { timeout: 10_000 }).toBe(expected);
  await expect.poll(() => runText(pageB, PARA), { timeout: 20_000 }).toBe(expected);
  expect(await staleWords(pageA)).toBeNull();
  const sA = await status(pageA);
  const sB = await status(pageB);
  expect(sA.revision).toBe(sB.revision);
});
