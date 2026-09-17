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
    await invoke(pageA, 'deck.remove', { id: DECK, baseRevision: info.revision });
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
  const before = await runText(pageA, PARA);
  // both pages have caught the stream up before either types (SPEC-3 3.6; VERIFICATION-3 finding
  // 33): a page whose stream position lags holds its first write, so the S2 no-character-lost
  // guarantee does not depend on which page opened first. openEditor already waited for the
  // connection; this pins the two positions equal so the first burst on each is transformed
  // against what the other has already landed.
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
  const hello = await pageA.evaluate(async () => {
    const response = await fetch(`/api/decks/${'e2e-realtime'}/stream?since=0`, {
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
  });
  expect(hello?.seq).toBe(viaAction.seq);
  expect(hello?.revision).toBe(viaAction.revision);
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
