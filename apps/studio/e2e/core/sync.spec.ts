import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page, Request } from '@playwright/test';

import {
  Scratch,
  TYPE_DELAY,
  clickCard,
  coverage,
  ctl,
  editing,
  headingRun,
  invoke,
  menuPath,
  newDeck,
  otherContext,
  ownerContext,
  placeBlock,
  runsOfBlock,
  sameCookiesContext,
  selectBlock,
  slideJson,
  slideOrder,
  state,
  teardownAll,
  title,
  waitEditor,
} from './lib';

// The two browser spec of the sync and costs round (docs/SYNC.md 6.1, the rows whose driver is
// core/sync.spec.ts; 6.2 the runs): A and B are two browsers of one person (B carries A's cookies,
// the ordering audit's run 2), C is a fresh context with no cookie of A's, a viewer once the deck's
// general access is Anyone with the link, Viewer (the row's setup through the window API). Every
// test makes its own deck from /new, tears it down in afterEach and in a finally (File > Move to
// trash, Delete forever on /decks/trash, a 404 on /edit/<id>), repeats a two person exchange three
// times inside the test and passes only when every repeat passes. Typing goes at a human pace
// (60 ms between keys), the sessions open by double click (AMENDMENTS.md A1), and every
// observation is the page's: the run's text on the stage, `slide.get` through the window API,
// `describe().state`, and the ops POSTs on the wire (the body's op, path, offset and lengths, the
// answer's seqs; never a cookie or a header). On the preview the OIDC header goes on every context
// (lib.ts extraHTTPHeaders); retries stay 0, one worker, 1440 by 900 (playwright.config.ts).
//
// A row whose claim needs a lane's half that is not on the build reads a known mechanism, never a
// flake (6.2): the title rows annotate which mutation the title travelled as (`slide.set` is the
// whole value path of audit-ordering item 1, `text.splice` the field target of 3.4), the resend row
// records whether the record carries `origin` (B3, 3.2) and is not driven on that claim when it
// does not, the viewer row annotates C's role.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/sync.spec.ts

const END_OF_TEXT = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End';
const UNDO = 'Meta+z';

// ---------------------------------------------------------------------------------------------
// the three browsers of a test and their teardown

type Person = { context: BrowserContext; page: Page };
let scratch = new Scratch();
let owner: Person | null = null;
const others: BrowserContext[] = [];
let deck = '';

/** Tears the test's deck down and closes every context; idempotent, run in a finally and in afterEach. */
async function cleanUp(): Promise<void> {
  try {
    if (owner && !owner.page.isClosed()) {
      await owner.context.setOffline(false).catch(() => undefined);
      await teardownAll(owner.page, scratch);
    }
  } finally {
    for (const c of others.splice(0)) await c.close().catch(() => undefined);
    if (owner) await owner.context.close().catch(() => undefined);
    owner = null;
    deck = '';
    scratch = new Scratch();
  }
}
test.afterEach(async () => {
  test.setTimeout(180_000);
  await cleanUp();
});

/** A on a fresh deck from /new with its title typed; returns A's page. */
async function openA(browser: Browser, name: string): Promise<Page> {
  owner = await ownerContext(browser);
  deck = await newDeck(owner.page, scratch, name);
  await connected(owner.page);
  return owner.page;
}
/** B, the same person in a second browser, on the deck's editor. */
async function joinB(browser: Browser): Promise<Page> {
  const pair = await sameCookiesContext(browser, owner!.context);
  others.push(pair.context);
  await pair.page.goto(`/edit/${deck}`);
  await waitEditor(pair.page);
  await connected(pair.page);
  await dismissPrompt(pair.page);
  await expect(pair.page.locator('.pt-viewer:not(.ts-skeleton)').first()).toHaveAttribute(
    'data-edit-mode',
    'editing',
    { timeout: 10_000 },
  );
  return pair.page;
}
/** The path of a `/s/<token>` URL as an answer carries it (whatever its origin), or null. */
function shareLinkPath(url: unknown): string | null {
  if (typeof url !== 'string' || url === '') return null;
  try {
    const u = new URL(url, 'http://turboslide.invalid');
    return u.pathname.startsWith('/s/') ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}
/** A page's path for the ledger: the share token and the deck id never written. */
function pathForLedger(url: string): string {
  try {
    const p = new URL(url).pathname;
    return p.startsWith('/s/') ? '/s/<token>' : p.replace(deck, '<id>');
  } catch {
    return '(no url)';
  }
}
/**
 * C, a stranger, on the deck: with the general access set to Anyone with the link, Viewer (the
 * row's setup, made by A through the window API before C opens) C lands on the viewer floor. C
 * gets there the way a customer does (the verifier's pass 1 F9): `share.setGeneralAccess` in link
 * mode answers the link's `/s/<token>` URL once; C opens it as a navigation (the route writes the
 * grant on C's principal and redirects to `/deck/<id>`; a fetch is refused by design, s.$token.ts),
 * then opens `/edit/<id>`, where the editor page stands on the viewer floor with the studio API.
 * Under enforce the plain `/edit/<id>` never admits a stranger, so a C that skipped the exchange
 * waited 90 s for an API that never came. The path C took and the role it reads are annotated for
 * the ledger; the token is never written anywhere.
 */
async function joinC(browser: Browser, A: Page): Promise<Page> {
  const got = await invoke<{ record: { revision: number } }>(A, 'share.get', { id: deck });
  const set = await invoke<{ record: { revision: number }; url?: string }>(
    A,
    'share.setGeneralAccess',
    { id: deck, mode: 'link', role: 'viewer', baseRevision: got.record.revision },
  );
  const pair = await otherContext(browser);
  others.push(pair.context);
  const link = shareLinkPath(set.url);
  let joined = 'the plain /edit/<id> (the share.setGeneralAccess answer carried no /s/ URL)';
  if (link !== null) {
    await pair.page.goto(link);
    await pair.page.waitForURL(/\/(deck|edit)\//, { timeout: 30_000 }).catch(() => undefined);
    joined = `the /s/ link of share.setGeneralAccess, which landed on ${pathForLedger(pair.page.url())}, then /edit/<id>`;
  }
  test.info().annotations.push({ type: 'C joined through', description: joined });
  await pair.page.goto(`/edit/${deck}`);
  await pair.page.waitForFunction(() => Boolean(window.turboslide?.studio), null, {
    timeout: 90_000,
  });
  await expect(pair.page.locator('.pt-viewer:not(.ts-skeleton)').first()).toHaveAttribute(
    'data-settled',
    '',
    { timeout: 60_000 },
  );
  await connected(pair.page);
  const role = (await state(pair.page)).access?.role ?? null;
  test.info().annotations.push({ type: 'C role', description: String(role) });
  return pair.page;
}

// ---------------------------------------------------------------------------------------------
// the page's facts

type SyncState = {
  revision: number;
  serverRevision: number;
  sync: {
    seq: number;
    pending: number;
    retained: number;
    connected: boolean;
    tier: string;
    offline?: boolean;
  };
  access?: { role: string | null };
};
const facts = (p: Page): Promise<SyncState> => state(p) as unknown as Promise<SyncState>;

async function connected(p: Page, timeout = 45_000): Promise<void> {
  await expect.poll(async () => (await facts(p)).sync?.connected ?? false, { timeout }).toBe(true);
}
/** Nothing pending and nothing retained: the tab's writes are committed. */
async function quiet(p: Page, timeout = 30_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const s = await facts(p);
        return (s.sync?.pending ?? 0) + (s.sync?.retained ?? 0);
      },
      { timeout },
    )
    .toBe(0);
}
async function dismissPrompt(p: Page): Promise<void> {
  const prompt = ctl(p, 'dialog.namePrompt');
  if (await prompt.isVisible().catch(() => false)) {
    if ((await ctl(p, 'dialog.namePrompt.close').count()) > 0)
      await ctl(p, 'dialog.namePrompt.close')
        .click({ timeout: 2000 })
        .catch(() => undefined);
    else
      await ctl(p, 'dialog.namePrompt.skip')
        .click({ timeout: 2000 })
        .catch(() => undefined);
  }
  const persisted = ctl(p, 'sync.persisted');
  if (await persisted.isVisible().catch(() => false))
    await ctl(p, 'sync.persisted.apply')
      .click({ timeout: 2000 })
      .catch(() => undefined);
}
/** The text of a run on the stage, prompts removed, as a reader sees it. */
async function runText(p: Page, run: string): Promise<string | null> {
  return p.evaluate((r) => {
    const el = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${r}"]`,
    );
    if (!el) return null;
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('[data-prompt]').forEach((x) => x.remove());
    return (clone.textContent ?? '').replace(/\u00a0/g, ' ');
  }, run);
}
/** The heading of the first slide through the window API (a viewer's page has no editor stage). */
async function headingOf(p: Page): Promise<string> {
  const first = (await slideOrder(p))[0]!;
  const slide = await slideJson(p, first);
  return String(slide['heading'] ?? '').replace(/\u00a0/g, ' ');
}
/** The plain text of a block's text field through the window API. */
async function blockText(p: Page, slideId: string, blockId: string): Promise<string> {
  const slide = await slideJson(p, slideId);
  const find = (node: unknown): string | null => {
    if (Array.isArray(node)) {
      for (const x of node) {
        const r = find(x);
        if (r !== null) return r;
      }
      return null;
    }
    if (node && typeof node === 'object') {
      const n = node as Record<string, unknown>;
      if (n['id'] === blockId && typeof n['text'] === 'string') return n['text'];
      for (const v of Object.values(n)) {
        const r = find(v);
        if (r !== null) return r;
      }
    }
    return null;
  };
  return (find(slide) ?? '').replace(/\u00a0/g, ' ').replace(/<[^>]+>/g, '');
}
const countIn = (text: string | null, token: string): number =>
  (text ?? '').split(token).length - 1;

/**
 * Opens a text session on a run by double click and puts the caret at the end. A selected block's
 * handles can cover the run (the title typed by `newDeck` leaves the heading selected, and its move
 * handle sits over a body block placed under it; the integrator's probe of 2026-09-21 read
 * `button.ts-handle` under the run's centre), so a selection is cleared first while no session is
 * open, and a double click that opened nothing is made once more from the element itself.
 */
async function openRun(p: Page, run: string): Promise<void> {
  const el = p
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  await el.waitFor({ timeout: 20_000 });
  if (!(await editing(p))) await p.keyboard.press('Escape');
  const box = (await el.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await p.mouse.move(x - 120, y + 80);
  await p.mouse.move(x, y, { steps: 12 });
  await p.waitForTimeout(80);
  await p.mouse.dblclick(x, y);
  const opened = await expect
    .poll(() => editing(p), { timeout: 5000 })
    .toBe(true)
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    await p.keyboard.press('Escape');
    await el.dblclick();
    await expect.poll(() => editing(p), { timeout: 5000 }).toBe(true);
  }
  await p.keyboard.press(END_OF_TEXT);
  await p.keyboard.press('End');
}
const typeHuman = (p: Page, text: string): Promise<void> =>
  p.keyboard.type(text, { delay: TYPE_DELAY });
async function closeRun(p: Page): Promise<void> {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  await dismissPrompt(p);
}
/** Two typing bursts within 200 ms of each other: B's starts 0 to 150 ms after A's. */
async function together(a: () => Promise<void>, b: () => Promise<void>): Promise<void> {
  await Promise.all([
    a(),
    (async () => {
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 150)));
      await b();
    })(),
  ]);
}

// ---------------------------------------------------------------------------------------------
// the wire: every ops POST of a page with its body's shape and its answer

type WireRow = {
  who: string;
  at: number;
  base: number | null;
  opIds: string[];
  mutations: {
    op: string;
    path?: string;
    blockId?: string;
    at?: number;
    remove?: number;
    insertLength?: number;
  }[];
  status: number | string | null;
  ms: number | null;
  admitted: number[] | null;
  revision: string | null;
};
function wireOf(p: Page, who: string, sink: WireRow[]): void {
  p.on('request', (request: Request) => {
    if (!/\/api\/decks\/[^/?]+\/ops(\?|$)/.test(request.url()) || request.method() !== 'POST')
      return;
    const row: WireRow = {
      who,
      at: Date.now(),
      base: null,
      opIds: [],
      mutations: [],
      status: null,
      ms: null,
      admitted: null,
      revision: null,
    };
    try {
      const parsed = JSON.parse(request.postData() ?? '{}') as {
        base?: { seq?: number };
        entries?: {
          opId: string;
          mutations?: Record<string, unknown>[];
        }[];
      };
      row.base = parsed.base?.seq ?? null;
      row.opIds = (parsed.entries ?? []).map((e) => e.opId);
      row.mutations = (parsed.entries ?? []).flatMap((e) =>
        (e.mutations ?? []).map((m) => ({
          op: String(m['op']),
          ...(typeof m['path'] === 'string' ? { path: m['path'] } : {}),
          ...(typeof m['blockId'] === 'string' ? { blockId: m['blockId'] } : {}),
          ...(typeof m['at'] === 'number' ? { at: m['at'] } : {}),
          ...(typeof m['remove'] === 'number' ? { remove: m['remove'] } : {}),
          ...(typeof m['insert'] === 'string' ? { insertLength: m['insert'].length } : {}),
        })),
      );
    } catch {
      // not json
    }
    sink.push(row);
    request
      .response()
      .then(async (response) => {
        if (!response) {
          row.status = 'no response';
          return;
        }
        row.status = response.status();
        row.ms = Date.now() - row.at;
        row.revision = response.headers()['x-turboslide-revision'] ?? null;
        if (row.status === 200) {
          const body = (await response.json().catch(() => null)) as {
            entries?: { seq: number }[];
          } | null;
          row.admitted = body?.entries?.map((e) => e.seq) ?? null;
        }
      })
      .catch((error: unknown) => {
        row.status = `failed: ${String(error).slice(0, 60)}`;
        row.ms = Date.now() - row.at;
      });
  });
}
/** How the title travelled on the wire: the whole value (`slide.set`), a text run (`text.splice`), or nothing yet. */
function titleShape(wire: WireRow[]): string {
  const ops = new Set(wire.flatMap((w) => w.mutations.map((m) => m.op)));
  if (ops.has('text.splice')) return 'text.splice (the field as a text run, docs/SYNC.md 3.4)';
  if (ops.has('slide.set')) return 'slide.set (the whole value, audit-ordering item 1)';
  return `none of slide.set or text.splice (${[...ops].join(', ') || 'no ops POST'})`;
}
/** The bound of a word's arrival in the second browser by the realtime tier (docs/SYNC.md 6.1). */
const serialBound = (tier: string): number => (tier === 'blob' ? 5000 : 1000);
/**
 * The bound of two concurrent words agreeing in both browsers by the tier (the matrix row
 * `sync.block.concurrent-same-offset-order`): 3 s on the memory tier and 5 s on the blob tier,
 * the split the serial row has. The verifier's pass 1 (F11) read the blob tier's propagation at
 * 1.3 s mean and 2.9 s max on the serial row of the same origin, so one round in three fell past
 * a 3 s bound there with the words in the same order in both browsers and no repair splice.
 */
const blockBound = (tier: string): number => (tier === 'blob' ? 5000 : 3000);

// ---------------------------------------------------------------------------------------------
// the rows

test(title('sync.serial.order-and-latency'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Sync serial');
    const B = await joinB(browser);
    const wire: WireRow[] = [];
    wireOf(A, 'A', wire);
    const run = await headingRun(A);
    const tier = (await facts(A)).sync.tier;
    const bound = serialBound(tier);
    test.info().annotations.push({ type: 'tier', description: `${tier}, bound ${bound} ms` });
    const tokens: { text: string; typedAt: number; revision: number }[] = [];
    const seenInB = new Map<string, number>();
    let stop = false;
    const sampler = (async () => {
      while (!stop) {
        const t = Date.now();
        const text = await runText(B, run).catch(() => null);
        if (text !== null)
          for (const token of tokens)
            if (!seenInB.has(token.text) && text.includes(token.text)) seenInB.set(token.text, t);
        await B.waitForTimeout(Math.max(20, 100 - (Date.now() - t)));
      }
    })();
    await openRun(A, run);
    for (let i = 1; i <= 30; i += 1) {
      const started = Date.now();
      const before = (await facts(A)).revision;
      const text = ` a${String(i).padStart(2, '0')}`;
      await typeHuman(A, text);
      const typedAt = Date.now();
      /* the token is registered for B's sampler before the revision poll: the revision is the
         checkpoint's and moves seconds after the op reached B on the memory tier (the integrator's
         probe: the word in B's DOM at 470 ms, the revision at 2.5 s), so a token registered after
         the poll measured the poll, not the word */
      const token = { text, typedAt, revision: before };
      tokens.push(token);
      await expect
        .poll(async () => (await facts(A)).revision, { timeout: 10_000 })
        .toBeGreaterThan(before);
      token.revision = (await facts(A)).revision;
      const wait = 3000 - (Date.now() - started);
      if (wait > 0) await A.waitForTimeout(wait);
    }
    await closeRun(A);
    await expect.poll(() => seenInB.size, { timeout: 15_000 }).toBe(tokens.length);
    stop = true;
    await sampler;
    await quiet(A);
    const aText = await headingOf(A);
    const bText = await headingOf(B);
    const latencies = tokens.map((t) => ({
      token: t.text,
      ms: (seenInB.get(t.text) ?? Number.POSITIVE_INFINITY) - t.typedAt,
    }));
    const arrival = [...seenInB.entries()].sort((x, y) => x[1] - y[1]).map(([t]) => t);
    const expected = tokens.map((t) => t.text);
    test.info().annotations.push({
      type: 'measure',
      description: `latency mean ${Math.round(latencies.reduce((n, l) => n + l.ms, 0) / latencies.length)} ms, max ${Math.max(...latencies.map((l) => l.ms))} ms over ${tokens.length} words; POSTs ${wire.length}`,
    });
    expect(arrival, 'every word reaches B in the order it was typed').toEqual(expected);
    for (const t of tokens) {
      expect(countIn(aText, t.text), `${t.text} once in A`).toBe(1);
      expect(countIn(bText, t.text), `${t.text} once in B`).toBe(1);
    }
    const slow = latencies.filter((l) => l.ms > bound);
    expect(
      slow,
      `every word within ${bound} ms of the keystroke (${slow.map((l) => `${l.token} ${l.ms} ms`).join(', ')})`,
    ).toEqual([]);
    /* every POST answered 200 at the next revision: a single writer's base plus one */
    const posts = wire.filter((w) => w.status !== null);
    expect(posts.length).toBeGreaterThan(0);
    const wrong = posts.filter(
      (w) => w.status !== 200 || w.base === null || !w.admitted?.every((s) => s === w.base! + 1),
    );
    expect(
      wrong.map((w) => `base ${w.base} status ${w.status} admitted ${JSON.stringify(w.admitted)}`),
      'every ops POST is answered 200 at the next revision',
    ).toEqual([]);
    expect(aText).toBe(bText);
  } finally {
    await cleanUp();
  }
});

test(title('sync.title.concurrent-both-kept'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Sync title');
    const B = await joinB(browser);
    const wire: WireRow[] = [];
    wireOf(A, 'A', wire);
    wireOf(B, 'B', wire);
    const run = await headingRun(A);
    const failures: string[] = [];
    const all: string[] = [];
    for (let round = 1; round <= 3; round += 1) {
      const pair1 = [` ca${round}`, ` cb${round}`] as const;
      const pair2 = [` da${round}`, ` db${round}`] as const;
      all.push(...pair1, ...pair2);
      await openRun(A, run);
      await openRun(B, run);
      await together(
        () => typeHuman(A, pair1[0]),
        () => typeHuman(B, pair1[1]),
      );
      const bothOpen = await expect
        .poll(
          async () => {
            const [a, b] = await Promise.all([runText(A, run), runText(B, run)]);
            return [a, b].every((t) => t !== null && t.includes(pair1[0]) && t.includes(pair1[1]));
          },
          { timeout: 5000 },
        )
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      if (!bothOpen)
        failures.push(
          `round ${round}, sessions open: A "${await runText(A, run)}", B "${await runText(B, run)}"`,
        );
      await together(
        () => typeHuman(A, pair2[0]),
        () => typeHuman(B, pair2[1]),
      );
      await Promise.all([closeRun(A), closeRun(B)]);
      const four = [...pair1, ...pair2];
      const afterEscape = await expect
        .poll(
          async () => {
            const [a, b] = await Promise.all([headingOf(A), headingOf(B)]);
            return four.every((w) => countIn(a, w) === 1 && countIn(b, w) === 1);
          },
          { timeout: 5000 },
        )
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      await A.waitForTimeout(3000);
      const [a, b] = await Promise.all([headingOf(A), headingOf(B)]);
      const stays = four.every((w) => countIn(a, w) === 1 && countIn(b, w) === 1);
      if (!afterEscape || !stays)
        failures.push(
          `round ${round}, after Escape: A "${a}", B "${b}" (within 5 s ${afterEscape}, after 3 s more ${stays})`,
        );
      await Promise.all([quiet(A), quiet(B)]);
    }
    test.info().annotations.push({ type: 'title travelled as', description: titleShape(wire) });
    expect(failures, 'both words in both browsers in every round of three').toEqual([]);
    const a = await headingOf(A);
    expect(a).toBe(await headingOf(B));
    for (const w of all) expect(countIn(a, w), `${w} once`).toBe(1);
  } finally {
    await cleanUp();
  }
});

test(title('sync.title.offline-both-kept'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Sync title offline');
    const B = await joinB(browser);
    const wire: WireRow[] = [];
    wireOf(A, 'A', wire);
    wireOf(B, 'B', wire);
    const run = await headingRun(A);
    const offlineAt = Date.now();
    await owner!.context.setOffline(true);
    await openRun(B, run);
    const bTyping = (async () => {
      for (const w of [' ob1', ' ob2', ' ob3']) {
        await typeHuman(B, w);
        await B.waitForTimeout(2500);
      }
      await closeRun(B);
    })();
    const aTyping = (async () => {
      await A.waitForTimeout(3000);
      await openRun(A, run);
      await typeHuman(A, ' oa1');
      await closeRun(A);
    })();
    await Promise.all([bTyping, aTyping]);
    const remaining = 20_000 - (Date.now() - offlineAt);
    if (remaining > 0) await A.waitForTimeout(remaining);
    const aOffline = await facts(A);
    expect(aOffline.sync.pending, 'A holds its word while offline').toBeGreaterThan(0);
    await owner!.context.setOffline(false);
    const onlineAt = Date.now();
    const four = [' ob1', ' ob2', ' ob3', ' oa1'];
    const converged = await expect
      .poll(
        async () => {
          const [a, b] = await Promise.all([headingOf(A), headingOf(B)]);
          return four.every((w) => countIn(a, w) === 1 && countIn(b, w) === 1);
        },
        { timeout: 10_000 },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const [a, b] = await Promise.all([headingOf(A), headingOf(B)]);
    test.info().annotations.push({
      type: 'measure',
      description: `converged ${converged} ${Date.now() - onlineAt} ms after the reconnect; A "${a}", B "${b}"; title travelled as ${titleShape(wire)}`,
    });
    expect(
      converged,
      `all four words in both browsers within 10 s of the reconnect (A "${a}", B "${b}")`,
    ).toBe(true);
    await quiet(A);
    expect(await headingOf(A)).toBe(await headingOf(B));
  } finally {
    await cleanUp();
  }
});

/** A body block both sessions type into, placed by A as the row's setup write; B waits for it. */
async function bodyBlock(
  A: Page,
  B: Page,
  id: string,
  text: string,
): Promise<{ slideId: string; run: string }> {
  const slideId = (await slideOrder(A))[0]!;
  await placeBlock(A, slideId, {
    id,
    type: 'text',
    text,
    pos: { x: 160, y: 520, w: 1280, h: 160 },
  });
  await expect
    .poll(async () => (await runsOfBlock(B, id)).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const run = (await runsOfBlock(A, id))[0]!;
  await Promise.all([quiet(A), quiet(B)]);
  /* the heading `newDeck` typed stays selected and its handles sit over the placed block */
  await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);
  return { slideId, run };
}

test(title('sync.block.concurrent-same-offset-order'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Sync block order');
    const B = await joinB(browser);
    const wire: WireRow[] = [];
    wireOf(A, 'A', wire);
    wireOf(B, 'B', wire);
    const { slideId, run } = await bodyBlock(A, B, 'sync-order', 'end');
    const tier = (await facts(A)).sync.tier;
    const bound = blockBound(tier);
    test.info().annotations.push({ type: 'tier', description: `${tier}, bound ${bound} ms` });
    const failures: string[] = [];
    const agreed: number[] = [];
    for (let round = 1; round <= 3; round += 1) {
      const from = Date.now();
      const wa = `pa${round}`;
      const wb = `pb${round}`;
      await openRun(A, run);
      await openRun(B, run);
      await A.keyboard.press('Home');
      await B.keyboard.press('Home');
      await together(
        () => typeHuman(A, wa),
        () => typeHuman(B, wb),
      );
      const typedAt = Date.now();
      const same = await expect
        .poll(
          async () => {
            const [a, b] = await Promise.all([runText(A, run), runText(B, run)]);
            return a !== null && a === b && a.includes(wa) && a.includes(wb);
          },
          { timeout: bound },
        )
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      agreed.push(Date.now() - typedAt);
      const [a, b] = await Promise.all([runText(A, run), runText(B, run)]);
      /* a repair splice: a text.splice from a session that removes text (audit-ordering run 4 part a) */
      const repairs = wire.filter(
        (w) =>
          w.at >= from && w.mutations.some((m) => m.op === 'text.splice' && (m.remove ?? 0) > 0),
      );
      if (!same || repairs.length > 0)
        failures.push(
          `round ${round}: A "${a}", B "${b}" (same order within ${bound} ms ${same}; repair splices ${repairs.length})`,
        );
      await Promise.all([closeRun(A), closeRun(B)]);
      await Promise.all([quiet(A), quiet(B)]);
    }
    test.info().annotations.push({
      type: 'measure',
      description: `the two words agreed in both browsers ${agreed.join(', ')} ms after the bursts (bound ${bound} ms on the ${tier} tier); ops POSTs ${wire.length}; final A "${await blockText(A, slideId, 'sync-order')}"`,
    });
    expect(
      failures,
      'the two words in the same order in both browsers, no repair splice, three rounds',
    ).toEqual([]);
  } finally {
    await cleanUp();
  }
});

/** Drags a selected block from its centre by (dx, dy) in stage px: pointer down inside, move in steps, up (A1 rule 2). */
async function dragBlock(p: Page, blockId: string, dx: number, dy: number): Promise<void> {
  await selectBlock(p, blockId);
  const el = p.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`).first();
  const box = (await el.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 });
  await p.mouse.move(x + dx, y + dy, { steps: 6 });
  await p.mouse.up();
}
/** The position of a block through the window API. */
async function posOf(p: Page, slideId: string, blockId: string): Promise<string | null> {
  const slide = await slideJson(p, slideId);
  const find = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      for (const x of node) {
        const r = find(x);
        if (r !== null) return r;
      }
      return null;
    }
    if (node && typeof node === 'object') {
      const n = node as Record<string, unknown>;
      if (n['id'] === blockId && n['pos']) return n['pos'];
      for (const v of Object.values(n)) {
        const r = find(v);
        if (r !== null) return r;
      }
    }
    return null;
  };
  const pos = find(slide);
  return pos === null ? null : JSON.stringify(pos);
}

test(title('sync.structural.concurrent'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Sync structural');
    const B = await joinB(browser);
    const first = (await slideOrder(A))[0]!;
    /* part one: both drag one block within 200 ms; one position in both browsers within the
       tier's bound (3 s on the memory tier, 5 s on the blob tier, the split of the block row:
       two drags each make up to two commits, and the blob tier spaces two commits of one deck on
       one instance a second apart with the loser's second attempt behind the winner's commit
       and the 2 s pulse tick between instances, so 3 s sits inside that tier's mechanics; b1.md
       FR2, the ship step's reading of the same two positions at 3 s once in three runs) */
    const tier = (await facts(A)).sync.tier;
    const bound = blockBound(tier);
    test.info().annotations.push({ type: 'tier', description: `${tier}, bound ${bound} ms` });
    await placeBlock(A, first, {
      id: 'sync-drag',
      type: 'text',
      text: 'Move me',
      pos: { x: 200, y: 400, w: 480, h: 120 },
    });
    await expect
      .poll(async () => (await runsOfBlock(B, 'sync-drag')).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await Promise.all([quiet(A), quiet(B)]);
    const before = await posOf(A, first, 'sync-drag');
    await together(
      () => dragBlock(A, 'sync-drag', 160, 0),
      () => dragBlock(B, 'sync-drag', 0, 120),
    );
    const draggedAt = Date.now();
    let agreedMs: number | null = null;
    const onePosition = await expect
      .poll(
        async () => {
          const [a, b, sa, sb] = await Promise.all([
            posOf(A, first, 'sync-drag'),
            posOf(B, first, 'sync-drag'),
            facts(A),
            facts(B),
          ]);
          const agreed =
            a !== null && a === b && a !== before && sa.sync.pending === 0 && sb.sync.pending === 0;
          if (agreed && agreedMs === null) agreedMs = Date.now() - draggedAt;
          return agreed;
        },
        { timeout: bound },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const [pa, pb] = await Promise.all([
      posOf(A, first, 'sync-drag'),
      posOf(B, first, 'sync-drag'),
    ]);
    test.info().annotations.push({
      type: 'measure',
      description: `two drags: before ${before}, A ${pa}, B ${pb}, one position within ${bound} ms ${onePosition}${agreedMs === null ? '' : ` (agreed ${agreedMs} ms after the drags)`}`,
    });
    expect(
      onePosition,
      `both browsers show one position within ${bound} ms on the ${tier} tier (A ${pa}, B ${pb})`,
    ).toBe(true);
    await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);

    /* part two: a second slide with a block; B deletes the slide while A moves the block */
    const s = await facts(A);
    await invoke(A, 'slide.new', { layout: 'split', after: first, baseRevision: s.revision });
    await expect.poll(async () => (await slideOrder(A)).length, { timeout: 15_000 }).toBe(2);
    const second = (await slideOrder(A)).find((id) => id !== first)!;
    await placeBlock(A, second, {
      id: 'sync-doomed',
      type: 'text',
      text: 'Doomed',
      pos: { x: 200, y: 400, w: 480, h: 120 },
    });
    await expect
      .poll(async () => (await slideOrder(B)).includes(second), { timeout: 15_000 })
      .toBe(true);
    /* the stage draws the current slide alone, so both browsers move to the slide before its
       block is read on the stage */
    await clickCard(A, second);
    await clickCard(B, second);
    await expect
      .poll(async () => (await runsOfBlock(B, 'sync-doomed')).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await Promise.all([quiet(A), quiet(B)]);
    await selectBlock(A, 'sync-doomed');
    /* the two gestures overlap: A holds the block mid drag while B's Delete slide lands, and
       releases once B's filmstrip has lost the slide, so A's `block.set /pos` is the write that
       meets the deleted slide. The first form of this row (B's menu and A's drag started 120 ms
       apart) hung on A's `selectBlock`, whose click waited for a block B's delete had removed,
       until the test's own timeout (the integrator's rerun on 4418, 2026-09-21). */
    const doomed = A.locator(
      `.ts-stagewrap.ts-editor .pt-slide [data-block="sync-doomed"]`,
    ).first();
    const doomedBox = (await doomed.boundingBox())!;
    const dx0 = doomedBox.x + doomedBox.width / 2;
    const dy0 = doomedBox.y + doomedBox.height / 2;
    await A.mouse.move(dx0, dy0);
    await A.mouse.down();
    await A.mouse.move(dx0 + 60, dy0, { steps: 6 });
    const deleteAt = Date.now();
    await menuPath(B, 'slide', 'slide.deleteSlide');
    await expect
      .poll(async () => !(await slideOrder(B)).includes(second), { timeout: 5000 })
      .toBe(true)
      .catch(() => undefined);
    await A.mouse.move(dx0 + 160, dy0, { steps: 6 });
    await A.mouse.up();
    const gone = await expect
      .poll(
        async () => {
          const [oa, ob] = await Promise.all([slideOrder(A), slideOrder(B)]);
          return !oa.includes(second) && !ob.includes(second);
        },
        { timeout: 5000 },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const card = A.locator('.ts-conflict');
    const cardShown = await card
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    const sentence = cardShown
      ? ((await card.first().textContent()) ?? '').replace(/\s+/g, ' ').trim()
      : '';
    test.info().annotations.push({
      type: 'measure',
      description: `slide gone in both within 5 s ${gone} (${Date.now() - deleteAt} ms); A's reject card ${cardShown ? `"${sentence.slice(0, 160)}"` : 'none'}`,
    });
    expect(gone, 'both browsers show the slide gone within 5 s').toBe(true);
    expect(cardShown, "the loser's reject card is shown").toBe(true);
    expect(sentence.length, "the card carries the reducer's sentence").toBeGreaterThan(0);
    if ((await ctl(A, 'conflict.discard').count()) > 0)
      await ctl(A, 'conflict.discard')
        .click()
        .catch(() => undefined);
  } finally {
    await cleanUp();
  }
});

test(title('sync.block.offline-replay-converges'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Sync block offline');
    const B = await joinB(browser);
    const wire: WireRow[] = [];
    wireOf(A, 'A', wire);
    const { slideId, run } = await bodyBlock(A, B, 'sync-offline', 'Start of the block');
    const offlineAt = Date.now();
    await owner!.context.setOffline(true);
    await openRun(B, run);
    const bTyping = (async () => {
      for (const w of [' ob1', ' ob2', ' ob3']) {
        await typeHuman(B, w);
        await B.waitForTimeout(2500);
      }
      await closeRun(B);
    })();
    const aTyping = (async () => {
      await A.waitForTimeout(3000);
      await openRun(A, run);
      await typeHuman(A, ' oa1');
      await closeRun(A);
    })();
    await Promise.all([bTyping, aTyping]);
    const remaining = 20_000 - (Date.now() - offlineAt);
    if (remaining > 0) await A.waitForTimeout(remaining);
    const firstAttempt = wire.find((w) => w.mutations.some((m) => m.op === 'text.splice'));
    await owner!.context.setOffline(false);
    const onlineAt = Date.now();
    const four = [' ob1', ' ob2', ' ob3', ' oa1'];
    const converged = await expect
      .poll(
        async () => {
          const [a, b] = await Promise.all([
            blockText(A, slideId, 'sync-offline'),
            blockText(B, slideId, 'sync-offline'),
          ]);
          return a === b && four.every((w) => countIn(a, w) === 1);
        },
        { timeout: 10_000 },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const [a, b] = await Promise.all([
      blockText(A, slideId, 'sync-offline'),
      blockText(B, slideId, 'sync-offline'),
    ]);
    const resent = wire.filter(
      (w) => w.status === 200 && w.mutations.some((m) => m.op === 'text.splice'),
    );
    const firstAt = firstAttempt?.mutations.find((m) => m.op === 'text.splice')?.at ?? null;
    const resentAt =
      resent[resent.length - 1]?.mutations.find((m) => m.op === 'text.splice')?.at ?? null;
    test.info().annotations.push({
      type: 'measure',
      description: `converged ${converged} ${Date.now() - onlineAt} ms after the reconnect; A's splice offset ${firstAt} first, ${resentAt} on the admitted POST; A "${a}"`,
    });
    expect(converged, `all four words in both browsers within 10 s (A "${a}", B "${b}")`).toBe(
      true,
    );
    expect(firstAt, "A's first attempt carried a text.splice").not.toBeNull();
    expect(resentAt, "A's admitted POST carried a text.splice").not.toBeNull();
    expect(resentAt!, "A's resend carries the offset shifted past B's words").toBeGreaterThan(
      firstAt!,
    );
  } finally {
    await cleanUp();
  }
});

test(title('sync.viewer.live-updates'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Sync viewer');
    const C = await joinC(browser, A);
    const role = (await facts(C)).access?.role ?? null;
    /* under shadow authorization (production today, and a dev server) every visitor reads owner,
       so C is never on the viewer floor and the row's claim (a viewer's stream carries the ops,
       docs/SYNC.md 3.7) cannot be driven: not driven with the reason, never passed; the enforce
       preview is where C is a viewer (6.2) */
    test.skip(
      role === 'owner',
      'C reads owner: the origin runs shadow authorization, so no viewer floor exists to drive the row on; drive it on the enforce preview',
    );
    expect(role, 'C is a viewer under Anyone with the link, Viewer').toBe('viewer');
    await C.evaluate(() => {
      (window as unknown as { __syncMarker: number }).__syncMarker = 1;
    });
    const run = await headingRun(A);
    const times: number[] = [];
    const failures: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const word = ` view${i}`;
      await openRun(A, run);
      await typeHuman(A, word);
      const typedAt = Date.now();
      await closeRun(A);
      const seen = await expect
        .poll(() => headingOf(C), { timeout: 5000 })
        .toContain(word)
        .then(() => true)
        .catch(() => false);
      times.push(Date.now() - typedAt);
      const marker = await C.evaluate(
        () => (window as unknown as { __syncMarker?: number }).__syncMarker ?? null,
      );
      if (!seen || marker !== 1)
        failures.push(
          `${word}: seen ${seen} in ${times[times.length - 1]} ms, reload ${marker !== 1}`,
        );
      await quiet(A);
    }
    test.info().annotations.push({
      type: 'measure',
      description: `C read the words in ${times.join(', ')} ms`,
    });
    expect(failures, 'C reads every word within 5 s with no reload, three of three').toEqual([]);
  } finally {
    await cleanUp();
  }
});

/** The document as one canonical string: the title, the slide order and every slide. */
async function documentOf(p: Page): Promise<{ revision: number; canon: string }> {
  const info = await invoke<{ id: string; title: string; revision: number }>(p, 'deck.info');
  const order = await slideOrder(p);
  const slides: Record<string, unknown> = {};
  for (const id of order) slides[id] = await slideJson(p, id);
  return { revision: info.revision, canon: JSON.stringify({ title: info.title, order, slides }) };
}

test(title('sync.reload.same-document'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Sync reload');
    const B = await joinB(browser);
    const C = await joinC(browser, A);
    const run = await headingRun(A);
    for (const [p, words] of [
      [A, [' ra1', ' ra2']],
      [B, [' rb1', ' rb2']],
    ] as const) {
      for (const w of words) {
        await openRun(p, run);
        await typeHuman(p, w);
        await closeRun(p);
        await quiet(p);
      }
    }
    await Promise.all([quiet(A), quiet(B)]);
    await expect.poll(() => headingOf(B), { timeout: 10_000 }).toContain(' ra2');
    await expect.poll(() => headingOf(A), { timeout: 10_000 }).toContain(' rb2');
    const live = Math.max((await facts(A)).serverRevision, (await facts(B)).serverRevision);
    const reload = async (p: Page, viewer: boolean): Promise<number> => {
      const t = Date.now();
      await p.goto(`/edit/${deck}`);
      if (viewer) {
        await p.waitForFunction(() => Boolean(window.turboslide?.studio), null, {
          timeout: 90_000,
        });
        await expect(p.locator('.pt-viewer:not(.ts-skeleton)').first()).toHaveAttribute(
          'data-settled',
          '',
          { timeout: 60_000 },
        );
      } else await waitEditor(p);
      await connected(p);
      await quiet(p);
      return Date.now() - t;
    };
    const [msA, msB, msC] = await Promise.all([
      reload(A, false),
      reload(B, false),
      reload(C, true),
    ]);
    const [da, db, dc] = await Promise.all([documentOf(A), documentOf(B), documentOf(C)]);
    test.info().annotations.push({
      type: 'measure',
      description: `reloads ${msA}, ${msB}, ${msC} ms; revisions ${da.revision}, ${db.revision}, ${dc.revision} against the live ${live}`,
    });
    expect(da.canon, 'A and B read byte equal documents').toBe(db.canon);
    expect(da.canon, 'A and C read byte equal documents').toBe(dc.canon);
    expect(da.revision, 'at the live revision').toBeGreaterThanOrEqual(live);
    expect(db.revision).toBe(da.revision);
    expect(dc.revision).toBe(da.revision);
    for (const w of [' ra1', ' ra2', ' rb1', ' rb2'])
      expect(countIn(await headingOf(A), w)).toBe(1);
    expect(
      [msA, msB, msC].every((ms) => ms <= 5000),
      `each reload within 5 s (${msA}, ${msB}, ${msC} ms)`,
    ).toBe(true);
  } finally {
    await cleanUp();
  }
});

test(title('sync.undo.after-remote'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Sync undo');
    const B = await joinB(browser);
    const { slideId, run } = await bodyBlock(A, B, 'sync-undo', 'Start');
    const failures: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const wa = ` ua${i}`;
      const wb = `ub${i} `;
      await openRun(A, run);
      await typeHuman(A, wa);
      await closeRun(A);
      await quiet(A);
      await expect
        .poll(() => blockText(B, slideId, 'sync-undo'), { timeout: 10_000 })
        .toContain(wa);
      await openRun(B, run);
      await B.keyboard.press('Home');
      await typeHuman(B, wb);
      await closeRun(B);
      await quiet(B);
      await expect
        .poll(() => blockText(A, slideId, 'sync-undo'), { timeout: 10_000 })
        .toContain(wb);
      await A.waitForTimeout(300);
      await A.keyboard.press(UNDO);
      const undone = await expect
        .poll(
          async () => {
            const [a, b] = await Promise.all([
              blockText(A, slideId, 'sync-undo'),
              blockText(B, slideId, 'sync-undo'),
            ]);
            return a === b && countIn(a, wa) === 0 && countIn(a, wb) === 1;
          },
          { timeout: 5000 },
        )
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      const [a, b] = await Promise.all([
        blockText(A, slideId, 'sync-undo'),
        blockText(B, slideId, 'sync-undo'),
      ]);
      if (!undone) failures.push(`round ${i}: A "${a}", B "${b}"`);
      await Promise.all([quiet(A), quiet(B)]);
    }
    expect(
      failures,
      "A's word alone leaves both browsers within 5 s and B's stays, three of three",
    ).toEqual([]);
  } finally {
    await cleanUp();
  }
});

test(title('sync.resend.idempotent'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Sync resend');
    const B = await joinB(browser);
    const wire: WireRow[] = [];
    wireOf(A, 'A', wire);
    const { slideId, run } = await bodyBlock(A, B, 'sync-resend', 'Start');
    const revisionBefore = (await facts(A)).serverRevision;
    /* the driver lets one POST reach the server and drops its answer: the server commits, the page reads a failure */
    let dropped = 0;
    let droppedStatus: number | null = null;
    let droppedOpIds: string[] = [];
    const pattern = /\/api\/decks\/[^/?]+\/ops(\?|$)/;
    await A.route(pattern, async (route) => {
      if (dropped > 0 || route.request().method() !== 'POST') return route.continue();
      dropped += 1;
      try {
        const body = JSON.parse(route.request().postData() ?? '{}') as {
          entries?: { opId: string }[];
        };
        droppedOpIds = (body.entries ?? []).map((e) => e.opId);
      } catch {
        // not json
      }
      const res = await route.fetch();
      droppedStatus = res.status();
      await route.abort('failed');
    });
    await openRun(A, run);
    await typeHuman(A, ' once');
    await closeRun(A);
    await expect.poll(() => dropped, { timeout: 10_000 }).toBe(1);
    await quiet(A, 45_000);
    await A.unroute(pattern);
    await expect
      .poll(() => blockText(B, slideId, 'sync-resend'), { timeout: 10_000 })
      .toContain(' once');
    await quiet(B);
    const [a, b] = await Promise.all([
      blockText(A, slideId, 'sync-resend'),
      blockText(B, slideId, 'sync-resend'),
    ]);
    const resends = wire.filter((w) => w.at > 0 && w.opIds.some((id) => droppedOpIds.includes(id)));
    const versions = await invoke<
      { n: number; revision: number; origin?: { clientId: string; opIds: string[] } }[]
    >(A, 'version.list', {});
    const after = versions.filter((v) => v.revision > revisionBefore);
    const withOrigin = after.filter((v) => v.origin !== undefined);
    test.info().annotations.push({
      type: 'measure',
      description: `dropped answer status ${droppedStatus}; POSTs carrying the dropped op ids ${resends.length}; records after ${revisionBefore}: ${after.length} (${withOrigin.length} with origin)`,
    });
    expect(droppedStatus, 'the dropped POST was committed by the server').toBe(200);
    expect(countIn(a, ' once'), 'A reads the word once').toBe(1);
    expect(countIn(b, ' once'), 'B reads the word once').toBe(1);
    expect(a).toBe(b);
    if (withOrigin.length === 0)
      test.skip(
        true,
        'not on this build: the version record carries no origin (docs/SYNC.md 3.2, B3); the word landed once in both browsers',
      );
    const naming = withOrigin.filter((v) =>
      v.origin!.opIds.some((id) => droppedOpIds.includes(id)),
    );
    expect(naming.length, "one record's origin.opIds names A's op").toBe(1);
    const dup = after.flatMap((v) => v.origin?.opIds ?? []);
    expect(new Set(dup).size, 'no op id is named by two records').toBe(dup.length);
  } finally {
    await cleanUp();
  }
});

coverage(import.meta.filename, [
  'sync.serial.order-and-latency',
  'sync.title.concurrent-both-kept',
  'sync.title.offline-both-kept',
  'sync.block.concurrent-same-offset-order',
  'sync.structural.concurrent',
  'sync.block.offline-replay-converges',
  'sync.viewer.live-updates',
  'sync.reload.same-document',
  'sync.undo.after-remote',
  'sync.resend.idempotent',
]);
