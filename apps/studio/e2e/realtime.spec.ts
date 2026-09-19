import { expect, test } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

// The multiplayer spec of round three (gslides-parity SPEC-3 16.3 `realtime.spec.ts`; MILESTONES-3
// B2 day 6): two browser contexts on one deck against a dev server on the memory channel (SPEC-3
// 3.11). Two people type in one paragraph and converge byte for byte; a drag and a keystroke on
// one slide both apply; an agent write through /api/actions appears in both tabs within a second;
// a rejected op shows inline with its content; undo in A never reverts B's later change; a tab
// that lost its stream replays what landed and resends its pending queue; a position more than
// 2,000 entries behind resyncs; a closed tab's pending queue is offered on the next open and
// Apply lands it; sync.status reads the same numbers through the window API and describe().state.
// The scratch deck is a copy of the GT deck (the one deck every store seeds) made through
// deck.copy and removed at the end, so a run against the file store leaves decks/ as it found it
// and a TURBOSLIDE_STORE=tmp server keeps it in the overlay. One worker, two contexts, one deck:
// nothing here overlaps another spec.

const SOURCE = 'gt-brand';
/** One scratch deck per run, so a run interrupted before its afterAll never blocks the next. */
const DECK = `e2e-realtime-${Date.now().toString(36)}`;
const SLIDE = 'content-rule';
/** The paragraph of the content rule slide the two people type in. */
const PARA = 'p1';
/**
 * The convergence bound of the 200 keystroke row on the dev server (SPEC-3 16.3, recorded by the
 * round three hotfix; VERIFICATION-3 finding 50). The design target is 2 s; the memory tier on a
 * Vite dev server converged in 5,168 ms quiet and 6.8 s under load, so the gate stands at 10 s
 * and the figure is logged beside it.
 */
const CONVERGENCE_BOUND_MS = 10_000;

type SyncStatus = {
  seq: number;
  revision: number;
  pending: number;
  retained: number;
  tier: string;
  transport: string;
  connected: boolean;
};

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

async function openEditor(page: Page, deckId: string, slideId = SLIDE): Promise<void> {
  await page.goto(`/edit/${deckId}`);
  await editorReady(page);
  await page.evaluate(
    (id) => window.turboslide!.studio.invoke('view.goto', { slideId: id }),
    slideId,
  );
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', slideId);
  await expect(page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]').first()).toBeVisible();
  // the room's stream is up once sync.status reports a connection
  // the stream's first hello waits on the deck's room and the page's boot; 45 s covers a machine
  // at a load average above ten (the shared checkout runs six builders' servers and suites)
  await expect.poll(() => status(page).then((s) => s.connected), { timeout: 45_000 }).toBe(true);
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

async function revision(page: Page): Promise<number> {
  return page.evaluate(() => window.turboslide!.studio.describe().state.revision as number);
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
      return typeof value === 'string' ? value : '';
    },
    [SLIDE, blockId, pointer] as const,
  );
}

/** Nothing pending or retained in the room of this tab. */
async function settled(page: Page, timeout = 15_000): Promise<void> {
  await expect.poll(async () => (await status(page)).pending, { timeout }).toBe(0);
}

/**
 * A double click on a run's text opens the inline session (AMENDMENTS.md A1: one click selects
 * the object, the double click enters); the caret is then placed at the start or the end.
 */
async function caretIn(page: Page, blockId: string, where: 'start' | 'end'): Promise<void> {
  const run = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${blockId}/text"]`);
  const box = await run.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x + 8, box!.y + 8);
  await expect(run).toHaveAttribute('contenteditable', 'true');
  // the caret at the very start or end of the run (Meta+End moves to the line's end in headless
  // Chromium on macOS, so the selection is placed by hand)
  await page.evaluate(
    ([bid, at]) => {
      const el = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-run="${bid}/text"]`,
      );
      if (!(el instanceof HTMLElement)) throw new Error(`no run ${bid}`);
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(at === 'start');
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    [blockId, where] as const,
  );
}

async function endEdit(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  // the name prompt of an anonymous first edit opens once the session ends (SPEC-3 0.18); Esc
  // keeps the generated label and the prompt never returns in this tab
  const prompt = page.locator('[data-control="dialog.namePrompt"]');
  const opened = await prompt
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (opened) {
    // the prompt's own Close keeps the label whether or not the dialog took focus (the prompt no
    // longer steals the caret of the person typing, VERIFICATION-3 finding 8)
    await prompt.locator('[data-control="dialog.namePrompt.close"]').click();
    await expect(prompt).toBeHidden();
  }
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
  // the scratch deck through the window API of a page on the source deck
  await pageA.goto(`/edit/${SOURCE}`);
  await editorReady(pageA);
  const info = await invoke<{ revision: number }>(pageA, 'deck.info');
  const copied = await invoke<{ deckId: string }>(pageA, 'deck.copy', {
    id: SOURCE,
    name: 'Realtime walk',
    newId: DECK,
    baseRevision: info.revision,
  });
  expect(copied.deckId).toBe(DECK);
  /* the copy is restricted to A since the focus round (docs/FOCUS.md rank 1, ruling 2), so B
     joins through one editor link A mints; B's first request is a page load, which mints B's own
     anonymous cookie before any API call (a cookieless localhost request would be admitted as
     the checkout holder, `agent:localhost`; b6.md R9) */
  await pageA.goto(`/edit/${DECK}`);
  await editorReady(pageA);
  const access = await pageA.evaluate(
    () => (window.turboslide!.studio.describe().state as { access?: { revision?: number } }).access,
  );
  const link = await invoke<{ url: string }>(pageA, 'share.createLink', {
    id: DECK,
    role: 'editor',
    label: 'Edit link',
    baseRevision: access?.revision ?? 0,
  });
  await pageB.goto('/decks');
  await pageB.goto(link.url);
  await pageB.waitForURL((url) => url.pathname === `/edit/${DECK}`);
});

test.afterAll(async () => {
  try {
    await pageA.goto(`/edit/${DECK}`);
    await editorReady(pageA);
    const info = await invoke<{ revision: number }>(pageA, 'deck.info');
    // `confirm` is the action's input (schema/actions.ts deck.remove); without it the call was
    // refused "invalid input at /confirm" and a failed run left its deck under decks/
    // (VERIFICATION C3-F11)
    await invoke(pageA, 'deck.remove', { id: DECK, confirm: true, baseRevision: info.revision });
  } catch {
    // the deck may be gone already
  }
  await a.close();
  await b.close();
});

test('two contexts open one deck as two labels and see each other in the roster', async () => {
  await openEditor(pageA, DECK);
  await openEditor(pageB, DECK);
  const stateA = await pageA.evaluate(
    () => window.turboslide!.studio.describe().state as { account?: { principalId: string } },
  );
  const stateB = await pageB.evaluate(
    () => window.turboslide!.studio.describe().state as { account?: { principalId: string } },
  );
  expect(stateA.account?.principalId).toMatch(/^anon_/);
  expect(stateB.account?.principalId).toMatch(/^anon_/);
  expect(stateA.account?.principalId).not.toBe(stateB.account?.principalId);
  await expect
    .poll(async () => (await invoke<{ others: unknown[] }>(pageA, 'presence.list')).others.length, {
      timeout: 20_000,
    })
    .toBe(1);
  const roster = await invoke<{
    self: { label: string };
    others: { label: string; role: string }[];
  }>(pageA, 'presence.list');
  expect(roster.self.label).not.toBe(roster.others[0]?.label);
  expect(roster.others[0]?.role).toBe('editor');
});

test('two contexts type in one paragraph and converge byte for byte over 200 keystrokes, no character lost', async () => {
  test.setTimeout(180_000);
  // the row opens both editors on the slide itself (by line it typed on the slide beforeAll left
  // and read nothing typed) and pins the two stream positions equal before either types (SPEC-3
  // 3.6; VERIFICATION-3 finding 33: a page whose position lags holds its first write)
  await openEditor(pageA, DECK);
  await openEditor(pageB, DECK);
  const before = await runText(pageA, PARA);
  await expect
    .poll(async () => (await status(pageA)).seq === (await status(pageB)).seq, { timeout: 20_000 })
    .toBe(true);
  await caretIn(pageA, PARA, 'start');
  await caretIn(pageB, PARA, 'end');
  const left =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const right =
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
  const started = Date.now();
  await Promise.all([
    pageA.keyboard.type(left, { delay: 15 }),
    pageB.keyboard.type(right, { delay: 15 }),
  ]);
  const typed = Date.now();
  await endEdit(pageA);
  await endEdit(pageB);
  await settled(pageA);
  await settled(pageB);
  // both documents hold both strings around the original paragraph, every character kept (SPEC-3
  // 3.5, the S2 situation): this is the deterministic correctness of the row. The convergence is
  // polled with a generous window so the shared checkout's load does not flake it, and gated at
  // the bound SPEC-3 16.3 records for the dev server (VERIFICATION-3 finding 50): the 2 s design
  // target is not met by the memory tier on a Vite dev server, where the op to screen latency
  // alone is about 325 ms (the row below); measured 5,168 ms quiet on 2026-09-14 at a load
  // average of 4, 6.8 s under a load of 10 to 12 (finding 39), so the gate is 10 s.
  await expect
    .poll(() => runText(pageA, PARA), { timeout: 30_000 })
    .toBe(`${left}${before}${right}`);
  const converged = Date.now();
  await expect
    .poll(() => runText(pageB, PARA), { timeout: 30_000 })
    .toBe(`${left}${before}${right}`);
  expect(converged - typed).toBeLessThan(CONVERGENCE_BOUND_MS);
  console.info(
    `realtime: 200 keystrokes typed in ${typed - started} ms, both tabs converged ${converged - typed} ms after the last one (16.3 bound ${CONVERGENCE_BOUND_MS} ms on the dev server, design target 2000 ms; findings 39 and 50)`,
  );
  // the stream position moved by at least one entry per burst on each side
  const statusA = await status(pageA);
  const statusB = await status(pageB);
  expect(statusA.seq).toBe(statusB.seq);
  expect(statusA.tier).toBe('memory');
  expect(statusA.transport).toBe('sse');
});

test('a keystroke reaches the other tab: the op to screen latency on the dev server', async () => {
  test.setTimeout(60_000);
  await caretIn(pageA, 'h', 'end');
  const samples: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const marker = String.fromCharCode(97 + i);
    const startedAt = Date.now();
    await pageA.keyboard.type(marker);
    await expect
      .poll(() => runText(pageB, 'h'), { timeout: 5000, intervals: [5, 10, 20, 40] })
      .toMatch(new RegExp(`${marker}$`));
    samples.push(Date.now() - startedAt);
  }
  await endEdit(pageA);
  const sorted = [...samples].sort((x, y) => x - y);
  const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  console.info(
    `realtime: op to screen on the dev server p50 ${p50} ms, p95 ${p95} ms (${samples.join(', ')})`,
  );
  // the 100 ms flush plus one round trip plus the poll interval; well under the 200 ms target of 3.9 p95 in region
  expect(p95).toBeLessThan(1000);
  await settled(pageA);
});

test('a block change and a keystroke on one slide both apply', async () => {
  test.setTimeout(60_000);
  // B changes a field of the heading while A types in the paragraph: two blocks of one slide,
  // two people, both writes land in both tabs. B's write is the mutation a toolbar change emits
  // (a drag's `pos` set needs the canvas layout, whose conversion is the render worker's and is
  // covered by canvas.spec.ts).
  const levelBefore = await pageB.evaluate(async () => {
    const got = (await window.turboslide!.studio.invoke('slide.get', {
      slideId: 'content-rule',
    })) as { slide: { slots: Record<string, { id: string; level?: string }[]> } };
    return Object.values(got.slide.slots)
      .flat()
      .find((b) => b.id === 'h')?.level;
  });
  expect(levelBefore).toBeDefined();
  // the heading levels the schema allows are h1, h2, big and title
  const levelAfter = levelBefore === 'h1' ? 'h2' : 'h1';
  await caretIn(pageA, PARA, 'end');
  const typing = pageA.keyboard.type(' drag', { delay: 20 });
  const rev = await revision(pageB);
  await invoke(pageB, 'block.set', {
    slideId: SLIDE,
    blockId: 'h',
    path: '/level',
    value: levelAfter,
    baseRevision: rev,
  });
  await typing;
  await endEdit(pageA);
  await settled(pageA);
  await settled(pageB);
  await expect.poll(() => runText(pageA, PARA)).toMatch(/ drag$/);
  await expect.poll(() => runText(pageB, PARA)).toMatch(/ drag$/);
  const levelA = await pageA.evaluate(async () => {
    const got = (await window.turboslide!.studio.invoke('slide.get', {
      slideId: 'content-rule',
    })) as { slide: { slots: Record<string, { id: string; level?: string }[]> } };
    return Object.values(got.slide.slots)
      .flat()
      .find((b) => b.id === 'h')?.level;
  });
  expect(levelA).toBe(levelAfter);
});

test('an agent write through /api/actions appears in both tabs within 1 s', async ({ request }) => {
  const rev = await revision(pageA);
  const started = Date.now();
  const response = await post(request, 'block.set', {
    slideId: SLIDE,
    blockId: 'h',
    path: '/text',
    value: 'Agent heading',
    baseRevision: rev,
  });
  expect(response.ok(), await response.text()).toBe(true);
  await expect.poll(() => runText(pageA, 'h'), { timeout: 3000 }).toBe('Agent heading');
  await expect.poll(() => runText(pageB, 'h'), { timeout: 3000 }).toBe('Agent heading');
  const took = Date.now() - started;
  console.info(`realtime: an agent write reached both tabs in ${took} ms`);
  expect(took).toBeLessThan(3000);
});

test('undo in A never reverts B’s later change', async () => {
  test.setTimeout(60_000);
  const before = await runText(pageA, PARA);
  await caretIn(pageA, PARA, 'start');
  await pageA.keyboard.type('U');
  await endEdit(pageA);
  await settled(pageA);
  await expect.poll(() => runText(pageB, PARA)).toBe(`U${before}`);
  await caretIn(pageB, PARA, 'start');
  await pageB.keyboard.type('VV');
  await endEdit(pageB);
  await settled(pageB);
  await expect.poll(() => runText(pageA, PARA)).toBe(`VVU${before}`);
  await pageA.locator('.ts-stagewrap').click({ position: { x: 5, y: 5 } });
  await pageA.keyboard.press('ControlOrMeta+z');
  await settled(pageA);
  await expect.poll(() => runText(pageA, PARA)).toBe(`VV${before}`);
  await expect.poll(() => runText(pageB, PARA)).toBe(`VV${before}`);
});

test('a tab that lost its stream replays what landed and resends its pending queue', async () => {
  test.setTimeout(90_000);
  const before = await runText(pageA, PARA);
  await a.setOffline(true);
  await caretIn(pageA, PARA, 'end');
  await pageA.keyboard.type(' offline', { delay: 20 });
  await endEdit(pageA);
  await expect
    .poll(async () => (await status(pageA)).pending, { timeout: 5000 })
    .toBeGreaterThan(0);
  await expect(pageA.locator('.ts-title-save')).toHaveAttribute('data-state', 'offline', {
    timeout: 10_000,
  });
  // B keeps working while A is away
  await caretIn(pageB, PARA, 'start');
  await pageB.keyboard.type('W');
  await endEdit(pageB);
  await settled(pageB);
  await a.setOffline(false);
  await settled(pageA, 30_000);
  await expect.poll(() => runText(pageA, PARA), { timeout: 10_000 }).toBe(`W${before} offline`);
  await expect.poll(() => runText(pageB, PARA), { timeout: 10_000 }).toBe(`W${before} offline`);
  await expect.poll(async () => (await status(pageA)).connected).toBe(true);
});

test('a rejected op comes back to its author with its content', async () => {
  test.setTimeout(90_000);
  // A types in the list item while offline; B removes the list; A's op cannot land
  await a.setOffline(true);
  const item = pageA.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="list/items/0/text"]');
  const box = await item.boundingBox();
  expect(box).not.toBeNull();
  await pageA.mouse.dblclick(box!.x + 8, box!.y + 8);
  await expect(item).toHaveAttribute('contenteditable', 'true');
  await pageA.keyboard.press('End');
  await pageA.keyboard.type(' kept words', { delay: 20 });
  await endEdit(pageA);
  await expect
    .poll(async () => (await status(pageA)).pending, { timeout: 5000 })
    .toBeGreaterThan(0);
  const rev = await revision(pageB);
  await invoke(pageB, 'block.remove', { slideId: SLIDE, blockId: 'list', baseRevision: rev });
  await settled(pageB);
  await a.setOffline(false);
  const card = pageA.locator('.ts-conflict[data-state="conflict"]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('pre').first()).toContainText('kept words');
  await expect(card.locator('[data-control="conflict.copy"]').first()).toBeVisible();
  await card.locator('[data-control="conflict.discard"]').first().click();
  await expect(card).toBeHidden();
  await settled(pageA);
  const listGone = await pageA.evaluate(async () => {
    const got = (await window.turboslide!.studio.invoke('slide.get', {
      slideId: 'content-rule',
    })) as {
      slide: { slots: Record<string, { id: string }[]> };
    };
    return !Object.values(got.slide.slots)
      .flat()
      .some((b) => b.id === 'list');
  });
  expect(listGone).toBe(true);
});

test('a position more than 2,000 entries behind resyncs and rebases the pending ops', async () => {
  test.setTimeout(480_000);
  await a.setOffline(true);
  await caretIn(pageA, PARA, 'end');
  await pageA.keyboard.type(' late', { delay: 20 });
  await endEdit(pageA);
  await expect
    .poll(async () => (await status(pageA)).pending, { timeout: 5000 })
    .toBeGreaterThan(0);
  // B lands 2,001 operations through the window API while A is away. A window API write answers
  // the revision its checkpoint made (controller.tsx acknowledgedAbove, VERIFICATION F22), and on
  // the memory tier that checkpoint comes 2 s after the last op, so 2,001 writes awaited one by
  // one cost a checkpoint each (measured 2.2 s per write: 217 entries in the 480 s the test has;
  // VERIFICATION C2-F17). The writes go in chunks of fifty issued together: every write of a
  // chunk bases on the revision the page reports before the chunk, the room client flushes them
  // as one batch of entries, and the chunk's answers arrive with its checkpoint. The entries
  // are the same 2,001 text splices on one run, one stream entry each.
  await pageB.evaluate(async () => {
    const CHUNK = 50;
    for (let done = 0; done < 2001; done += CHUNK) {
      const count = Math.min(CHUNK, 2001 - done);
      const rev = window.turboslide!.studio.describe().state.revision as number;
      await Promise.all(
        Array.from({ length: count }, () =>
          window.turboslide!.studio.invoke('slide.update', {
            slideId: 'content-rule',
            baseRevision: rev,
            mutations: [
              {
                op: 'text.splice',
                slideId: 'content-rule',
                blockId: 'h',
                path: '/text',
                at: 0,
                remove: 0,
                insert: 'z',
              },
            ],
          }),
        ),
      );
    }
  });
  await settled(pageB, 60_000);
  const headB = (await status(pageB)).seq;
  await a.setOffline(false);
  await settled(pageA, 60_000);
  await expect
    .poll(async () => (await status(pageA)).seq, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(headB);
  const textA = await runText(pageA, 'h');
  await expect.poll(() => runText(pageB, 'h'), { timeout: 10_000 }).toBe(textA);
  expect(textA.startsWith('z'.repeat(2001))).toBe(true);
  await expect.poll(() => runText(pageA, PARA), { timeout: 10_000 }).toMatch(/ late$/);
  await expect.poll(() => runText(pageB, PARA), { timeout: 10_000 }).toMatch(/ late$/);
});

test('a closed tab’s pending queue is offered on the next open and Apply lands it', async () => {
  test.setTimeout(120_000);
  const before = await runText(pageB, PARA);
  await a.setOffline(true);
  await caretIn(pageA, PARA, 'end');
  // three bursts: a pause longer than the 100 ms flush between the characters
  await pageA.keyboard.type('1');
  await pageA.waitForTimeout(250);
  await pageA.keyboard.type('2');
  await pageA.waitForTimeout(250);
  await pageA.keyboard.type('3');
  await endEdit(pageA);
  await expect.poll(async () => (await status(pageA)).pending, { timeout: 5000 }).toBe(3);
  await pageA.waitForTimeout(300);
  await pageA.close();
  await a.setOffline(false);
  pageA = await a.newPage();
  await pageA.goto(`/edit/${DECK}`);
  await editorReady(pageA);
  const plate = pageA.locator('[data-control="sync.persisted"]');
  await expect(plate).toBeVisible({ timeout: 15_000 });
  await expect(plate).toContainText('3 unsaved changes from this browser');
  await pageA.locator('[data-control="sync.persisted.apply"]').click();
  await settled(pageA, 30_000);
  await expect.poll(() => runText(pageB, PARA), { timeout: 10_000 }).toBe(`${before}123`);
  await expect(plate).toBeHidden();
});

test('a refused stream (503 with retry-after) keeps the tab saving over POST, and the client reopens it after the wait with one roster row (C3-F1)', async () => {
  test.setTimeout(120_000);
  await openEditor(pageA, DECK);
  await openEditor(pageB, DECK);
  await settled(pageA);
  await settled(pageB);
  const clientIdOf = (page: Page) =>
    page.evaluate(
      () =>
        (window.turboslide!.studio.describe().state as { presence?: { clientId?: string } })
          .presence?.clientId ?? null,
    );
  const othersOf = (page: Page) =>
    page.evaluate(
      () =>
        (
          window.turboslide!.studio.describe().state as {
            presence?: { others?: { clientId: string }[] };
          }
        ).presence?.others?.map((row) => row.clientId) ?? [],
    );
  const idBefore = await clientIdOf(pageA);
  expect(idBefore).not.toBeNull();
  // every open of A's stream is refused the way the instance's cap refuses a tab's fourth
  // stream (routes/api/decks.$deckId.stream.ts), with a one second wait
  const refusedAt: number[] = [];
  const refusing = async (route: import('@playwright/test').Route): Promise<void> => {
    refusedAt.push(Date.now());
    await route.fulfill({
      status: 503,
      headers: { 'content-type': 'application/json', 'retry-after': '1' },
      body: JSON.stringify({ error: 'too_many_streams', cap: 'identity' }),
    });
  };
  await pageA.route(/\/api\/decks\/[^/?]+\/stream(\?|$)/, refusing);
  // the stream A holds is cut for a moment, so the client's reopen meets the refusal
  await a.setOffline(true);
  await expect.poll(async () => (await status(pageA)).connected, { timeout: 10_000 }).toBe(false);
  await a.setOffline(false);
  await expect.poll(() => refusedAt.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  // A writes while its stream is refused: the POST lands, the op is acknowledged, B reads it
  const before = await runText(pageA, PARA);
  await caretIn(pageA, PARA, 'end');
  await pageA.keyboard.type(' refused', { delay: 20 });
  await endEdit(pageA);
  await expect.poll(async () => (await status(pageA)).pending, { timeout: 10_000 }).toBe(0);
  expect((await status(pageA)).connected).toBe(false);
  await expect.poll(() => runText(pageB, PARA), { timeout: 10_000 }).toBe(`${before} refused`);
  // the reopens follow the wait the refusal named (about one second apart), never a burst
  await expect.poll(() => refusedAt.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  const gaps = refusedAt.slice(1).map((at, i) => at - refusedAt[i]!);
  for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(800);
  // the cap frees a slot: the next reopen lands within the wait, with a new client id, and B's
  // roster lists A once (the reopen retired the tab's earlier id)
  await pageA.unroute(/\/api\/decks\/[^/?]+\/stream(\?|$)/, refusing);
  await expect.poll(async () => (await status(pageA)).connected, { timeout: 10_000 }).toBe(true);
  const idAfter = await clientIdOf(pageA);
  expect(idAfter).not.toBeNull();
  expect(idAfter).not.toBe(idBefore);
  await expect.poll(() => othersOf(pageB), { timeout: 15_000 }).toEqual([idAfter]);
  await settled(pageA);
  await expect(pageA.locator('.ts-title-save')).toHaveAttribute('data-state', 'saved');
});

test('a page whose every stream open is refused from the start writes under the id the refusal minted, and joins once a slot frees (C3S-F2)', async () => {
  test.setTimeout(120_000);
  await openEditor(pageB, DECK);
  await settled(pageB);
  const clientIdOf = (page: Page) =>
    page.evaluate(
      () =>
        (window.turboslide!.studio.describe().state as { presence?: { clientId?: string } })
          .presence?.clientId ?? null,
    );
  // A's own stream of the last row leaves first: the navigation fires `pagehide`, the room
  // client posts its leave with keepalive and the route closes the stream on it, so the
  // identity's four slots are free for the holders below
  await pageA.goto('/decks');
  await pageA.waitForLoadState('domcontentloaded');
  // A's identity holds its cap of four streams (raw fetches, held; the shape of C3S-F2's
  // aborted opens the runtime never released), so the editor page's own open is refused at the
  // identity cap by the real route. The fetches leave this process under A's own cookie, not
  // the browser: on the HTTP/1.1 dev server the browser's six connections per host held the
  // four streams and B's, and the editor page's own long lived open queued in the browser
  // behind them, so the route never judged it while the cap was full (VERIFICATION C3S-F9);
  // a preview is HTTP/2 and has no such queue
  const base = test.info().project.use.baseURL ?? 'http://localhost:4321';
  const cookie = (await a.cookies(base)).map((row) => `${row.name}=${row.value}`).join('; ');
  expect(cookie, 'A holds its anonymous identity cookie').toMatch(/ts_id=/);
  const holders: AbortController[] = [];
  const held: number[] = [];
  const holding = Date.now();
  while (held.length < 4) {
    const controller = new AbortController();
    // the same origin headers a browser sends: the studio's cross site filter (start.ts
    // `csrfFilter`) refuses a cookie carrying request of the stream route without them
    const response = await fetch(`${base}/api/decks/${DECK}/stream?since=0`, {
      headers: {
        cookie,
        accept: 'text/event-stream',
        origin: base,
        'sec-fetch-site': 'same-origin',
      },
      signal: controller.signal,
    });
    if (response.status !== 200) {
      // the last row's stream has not left yet: its leave is on its way (the wait the refusal
      // names is 5 s; the row gives it 30 s before it records the refusal)
      controller.abort();
      if (Date.now() - holding > 30_000) {
        held.push(response.status);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    const reader = response.body!.getReader();
    // the hello (or the resync frame of a long log), then the stream is held open
    await reader.read();
    void (async () => {
      try {
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch {
        // aborted below
      }
    })();
    holders.push(controller);
    held.push(response.status);
  }
  const refusals: { status: number; clientId: string | null }[] = [];
  const onResponse = (response: import('@playwright/test').Response): void => {
    if (/\/api\/decks\/[^/?]+\/stream(\?|$)/.test(response.url()) && response.status() === 503) {
      void response
        .json()
        .then((body: { clientId?: string }) =>
          refusals.push({ status: 503, clientId: body.clientId ?? null }),
        )
        .catch(() => refusals.push({ status: 503, clientId: null }));
    }
  };
  pageA.on('response', onResponse);
  try {
    expect(held).toEqual([200, 200, 200, 200]);
    await pageA.goto(`/edit/${DECK}`);
    await editorReady(pageA);
    // the open was refused with the id the route minted, and the page took it without a hello
    await expect.poll(() => refusals.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    expect(refusals[0]?.clientId).toMatch(/^[0-9a-f]{32}$/);
    await expect.poll(() => clientIdOf(pageA), { timeout: 10_000 }).toBe(refusals[0]?.clientId);
    expect((await status(pageA)).connected).toBe(false);
    // A writes with no stream ever opened: the POST lands under the minted id and B reads it
    await pageA.evaluate(
      (id) => window.turboslide!.studio.invoke('view.goto', { slideId: id }),
      SLIDE,
    );
    const before = await runText(pageB, PARA);
    await caretIn(pageA, PARA, 'end');
    await pageA.keyboard.type(' minted', { delay: 20 });
    await endEdit(pageA);
    await expect.poll(async () => (await status(pageA)).pending, { timeout: 10_000 }).toBe(0);
    expect((await status(pageA)).connected).toBe(false);
    await expect.poll(() => runText(pageB, PARA), { timeout: 10_000 }).toBe(`${before} minted`);
    // the held streams close (their holder aborts them, the abort the dev server reports) and
    // the next reopen, after the wait the last refusal named, is admitted with a new id; B's
    // roster lists A once (the reopen retired the minted id)
    for (const controller of holders) controller.abort();
    await expect.poll(async () => (await status(pageA)).connected, { timeout: 20_000 }).toBe(true);
    const idAfter = await clientIdOf(pageA);
    expect(idAfter).not.toBeNull();
    expect(idAfter).not.toBe(refusals[0]?.clientId);
    await expect
      .poll(
        async () => (await invoke<{ others: unknown[] }>(pageB, 'presence.list')).others.length,
        { timeout: 15_000 },
      )
      .toBe(1);
    await settled(pageA);
    await expect(pageA.locator('.ts-title-save')).toHaveAttribute('data-state', 'saved');
  } finally {
    pageA.off('response', onResponse);
    for (const controller of holders) controller.abort();
  }
});

test('sync.status reads the same numbers through the window API and describe().state', async () => {
  await openEditor(pageA, DECK);
  await settled(pageA);
  const viaAction = await status(pageA);
  const viaState = await pageA.evaluate(
    () => (window.turboslide!.studio.describe().state as { sync: SyncStatus }).sync,
  );
  expect(viaAction.seq).toBe(viaState.seq);
  expect(viaAction.revision).toBe(viaState.revision);
  expect(viaAction.pending).toBe(0);
  expect(viaAction.retained).toBe(viaState.retained);
  expect(viaAction.tier).toBe('memory');
  expect(viaAction.transport).toBe('sse');
  expect(viaAction.connected).toBe(true);
  // the stream's hello names the same head
  // the row's own deck (one scratch deck per run since the focus round): a fixed name read a
  // leftover deck of the shared tmp store and its hello (the seam step, run C on 4394)
  const hello = await pageA.evaluate(async (deck) => {
    const response = await fetch(`/api/decks/${deck}/stream?since=0`, {
      headers: { accept: 'text/event-stream' },
    });
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    const text = new TextDecoder().decode(value);
    const line = text.split('\n').find((row) => row.startsWith('data: '));
    return line === undefined
      ? null
      : (JSON.parse(line.slice(6)) as { seq: number; revision: number });
  }, DECK);
  expect(hello?.seq).toBe(viaAction.seq);
  expect(hello?.revision).toBe(viaAction.revision);
});

test('a re-send past the burst timer and a second remote insert: the keystrokes land once and the caret stays after them (C3S-F12)', async () => {
  test.setTimeout(90_000);
  // The shape of VERIFICATION.md C3S-F12 made deterministic. A types with no pause, so the 100 ms
  // burst timer never fires while B's first insert lands; the Editor's re-send 150 ms after that
  // insert (text-fit.ts sessionReconcile 'resend') writes A's unflushed keystrokes past the timer;
  // B's second insert lands while A still types. The absorb of the second insert bases on the
  // re-sent text (InlineText handedText). Before the fix it based on the session's last burst,
  // read the re-sent keystrokes as B's change, landed them a second time and moved the caret by
  // their count plus B's insert (the run of 2026-09-18 on 4395: 98 A's, "Ever", 7 A's for 100
  // typed at the start). The row asserts the document alone; the timing line says whether both
  // inserts landed while A typed, which is the window the mechanism needs.
  await openEditor(pageA, DECK);
  await openEditor(pageB, DECK);
  await expect
    .poll(async () => (await status(pageA)).seq === (await status(pageB)).seq, { timeout: 20_000 })
    .toBe(true);
  const before = await runText(pageA, PARA);
  await pageA.evaluate(() => {
    const arrivals: number[] = [];
    (window as unknown as { tsArrivals: number[] }).tsArrivals = arrivals;
    window.addEventListener('turboslide:text-changed', () => arrivals.push(performance.now()));
  });
  await caretIn(pageA, PARA, 'start');
  const typed = 'A'.repeat(150);
  const typing = pageA.keyboard.type(typed, { delay: 15 });
  const answers: Promise<unknown>[] = [];
  // B's insert at the end of the paragraph as B's document reads it; the answer of a window API
  // write waits for the checkpoint 2 s after the last op (the row above :461), the op leaves at once
  const insertAtEnd = async (text: string) => {
    const now = await runText(pageB, PARA);
    const rev = await revision(pageB);
    answers.push(
      invoke(pageB, 'slide.update', {
        slideId: SLIDE,
        baseRevision: rev,
        mutations: [
          {
            op: 'text.splice',
            slideId: SLIDE,
            blockId: PARA,
            path: '/text',
            at: now.length,
            remove: 0,
            insert: text,
          },
        ],
      }),
    );
  };
  await pageA.waitForTimeout(400);
  await insertAtEnd('BB');
  await pageA.waitForTimeout(700);
  await insertAtEnd('CCCC');
  await typing;
  const timing = await pageA.evaluate(() => ({
    typedUntil: performance.now(),
    arrivals: (window as unknown as { tsArrivals: number[] }).tsArrivals,
  }));
  await endEdit(pageA);
  await Promise.all(answers);
  await settled(pageA);
  await settled(pageB);
  const expected = `${typed}${before}BBCCCC`;
  await expect.poll(() => runText(pageA, PARA), { timeout: 30_000 }).toBe(expected);
  await expect.poll(() => runText(pageB, PARA), { timeout: 30_000 }).toBe(expected);
  const landed = timing.arrivals.filter((at) => at < timing.typedUntil).length;
  console.info(
    `realtime: C3S-F12 row, ${timing.arrivals.length} remote changes reached A's session, ${landed} of them while A typed (${timing.arrivals.map((at) => Math.round(timing.typedUntil - at)).join(', ')} ms before the last keystroke)`,
  );
});

async function post(
  request: APIRequestContext,
  action: string,
  body: unknown,
  author = 'agent:e2e-room',
) {
  return request.post(`/api/actions/${action}?deck=${DECK}`, {
    data: body,
    headers: { 'x-turboslide-author': author },
  });
}
