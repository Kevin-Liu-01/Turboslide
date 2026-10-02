import { expect, request, test } from '@playwright/test';
import type { Browser, BrowserContext, Page, Request as PwRequest } from '@playwright/test';

import {
  Scratch,
  TYPE_DELAY,
  agentHeaders,
  clickCard,
  coverage,
  ctl,
  editing,
  extraHTTPHeaders,
  headingRun,
  invoke,
  isLocalBase,
  menuPath,
  newDeck,
  ownerContext,
  placeBlock,
  runsOfBlock,
  slideJson,
  slideOrder,
  state,
  teardownAll,
  title,
  waitEditor,
} from './lib';

// The two browser spec of the realtime round (docs/REALTIME.md section 2, the rows whose driver is
// core/realtime.spec.ts; 5.1 R5; 5.4 the gates). A and B are two browsers of two people on one
// deck made from /new: A is the owner, B a second anonymous principal admitted by the editor link
// the window API mints through `share.setGeneralAccess` (the way audit-people.md's drive joined),
// both on slide 1. Every bound is measured from the keystroke, the click, the release or the mint
// in the other browser and read in the DOM at 30 to 50 ms samples: the words on the stage, the
// remote caret (`.ts-remote-caret[data-client]` with `data-offset`, `data-kept`, `is-dim`), the
// remote outline (`.ts-remote-outline[data-client][data-block]`, `data-inside`), the drag ghost
// (`.ts-remote-drag[data-client][data-block][data-state="moving"]`), the flags
// (`.ts-flag[data-client]`, `data-state="moving"`), the pointer (`.ts-remote-pointer-group`), the
// chips (`presence.chip.<clientId>`), the roster (`presence.roster.<clientId>`,
// `data-menu-item`), the following plate (`presence.following`), the window API
// (`describe().state`, `slide.get`, `version.list`) and the ops POSTs on the wire (the body's
// op, offset and the answer's status; never a cookie or a header). The hooks are the lanes' as
// build/r2.md and build/r3.md name them.
//
// Two origins (REALTIME.md 5.4 item 1, the two process run over one tmp overlay on the redis
// tier): `REALTIME_BASES=<originA>,<originB>` opens A's context on the first and B's on the
// second, so every request of A and B is answered by a different process; `PLAYWRIGHT_SECOND_BASE_URL`
// names B's origin alone (build/r1.md R1-R5a). Unset, both open on the one base. The instance that
// answers each origin is read from `sync.status` through the agent surface (`storeCalls.instance`,
// present when the action's output accepts it; the bearer of ~/.config/turboslide/hosts.json on
// a deployment, none on localhost) and recorded beside the origin; the join row asserts two
// instances on the two origin run and records them on one.
//
// Every test makes its own deck, tears it down in afterEach and in a finally (File > Move to
// trash, Delete forever, a 404 on /edit/<id>) and closes B's context the way a tab closes (a
// navigation to about:blank first, so the leave beacon lands). A row whose control a lane has
// not landed (Follow in the default view, the View rows) is not driven with the control's id,
// never passed (docs/PRODUCT.md 8.1); a bound missed is a failed row with its measured
// milliseconds in the reason. Retries stay 0, one worker, 1440 by 900.
//
// The Cloudflare phase (docs/CLOUDFLARE.md 2.1, 2.3, 5.4): on the `do` tier the two origins are
// two app instances in front of one Durable Object, so `statusOf` also reads the object's colo
// from `sync.status` (`colo`, R1's field; "unnamed" until it lands) and the join row records one
// colo across both reads. The setup row `setup.do.two-instances` (the `setup` feature, the do
// tier's) runs here: A and B type five words each into two blocks through the two instances, the
// documents are byte equal at the live revision within 3 s, `sync.covered` and `sync.seq` agree
// across both tabs (R2's two fields on `describe().state.sync`; a field absent fails the row with
// its name, never passes it) and one colo answers both; on one origin or on another tier the row
// is not driven with the reason. The gate passes B's origin as PLAYWRIGHT_SECOND_BASE_URL and
// REALTIME_BASES from `--second-base`.
//
// PLAYWRIGHT_BASE_URL=<origin> [REALTIME_BASES=<originA>,<originB>] node_modules/.bin/playwright test apps/studio/e2e/core/realtime.spec.ts

const END_OF_TEXT = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End';
const A_BASE = (process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4321').replace(/\/$/, '');
const BASES = (process.env['REALTIME_BASES'] ?? '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter((s) => s !== '');
const B_BASE = (BASES[1] ?? process.env['PLAYWRIGHT_SECOND_BASE_URL'] ?? A_BASE).replace(/\/$/, '');
const TWO_ORIGINS = B_BASE !== A_BASE;
const SAMPLE_MS = 40;

// ---------------------------------------------------------------------------------------------
// the two people and their teardown

type Person = { context: BrowserContext; page: Page };
let scratch = new Scratch();
let owner: Person | null = null;
const others: Person[] = [];
let deck = '';
let linkPath: string | null = null;

/** Tears the test's deck down and closes every context; idempotent, run in a finally and in afterEach. */
async function cleanUp(): Promise<void> {
  try {
    for (const b of others.splice(0)) await leaveB(b);
    if (owner && !owner.page.isClosed()) {
      await owner.context.setOffline(false).catch(() => undefined);
      await teardownAll(owner.page, scratch);
    }
  } finally {
    if (owner) await owner.context.close().catch(() => undefined);
    owner = null;
    deck = '';
    linkPath = null;
    scratch = new Scratch();
  }
}
test.afterEach(async () => {
  test.setTimeout(180_000);
  await cleanUp();
});

/** A second person's context on an origin: no cookie of A's, the preview header, the HMR socket mocked on a local base. */
async function contextAt(browser: Browser, baseURL: string): Promise<Person> {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  /* the HMR socket of a dev server alone: the room's socket to the Worker (docs/CLOUDFLARE.md 3.6.3,
     `/rooms/<id>` on the room host) must reach it, or no tab connects on the do tier (the
     integrator's two process run of 2026-10-01) */
  if (isLocalBase(baseURL))
    await context.routeWebSocket(
      (url) => !url.pathname.startsWith('/rooms/'),
      () => undefined,
    );
  const page = await context.newPage();
  return { context, page };
}
/** B's tab closes the way a tab closes: about:blank first (pagehide, the leave beacon), then the context. */
async function leaveB(b: Person): Promise<void> {
  try {
    if (!b.page.isClosed() && /^https?:/.test(b.page.url())) {
      b.page.once('dialog', (dialog) => void dialog.accept().catch(() => undefined));
      await b.page.goto('about:blank', { timeout: 10_000 }).catch(() => undefined);
    }
  } finally {
    await b.context.close().catch(() => undefined);
  }
}
/** A on a fresh deck from /new with its title typed; the editor link minted; returns A's page. */
async function openA(browser: Browser, name: string): Promise<Page> {
  owner = await ownerContext(browser);
  deck = await newDeck(owner.page, scratch, name);
  await connected(owner.page);
  const got = await invoke<{ record?: { revision: number }; revision?: number }>(
    owner.page,
    'share.get',
    { id: deck },
  );
  const set = await invoke<{ url?: string }>(owner.page, 'share.setGeneralAccess', {
    id: deck,
    mode: 'link',
    role: 'editor',
    baseRevision: got.record?.revision ?? got.revision ?? 0,
  });
  linkPath = shareLinkPath(set.url);
  test.info().annotations.push({
    type: 'origins',
    description: `A on ${A_BASE}, B on ${B_BASE}${TWO_ORIGINS ? ' (two origins)' : ' (one origin)'}; the editor link ${linkPath === null ? 'was not minted' : 'minted'}`,
  });
  return owner.page;
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
/**
 * B, a second anonymous person, on the deck through the editor link on B's origin; returns B's
 * page once its stream is connected and its toolbar reads editing. `ready` is when B's editor
 * was ready (the join row's clock).
 */
async function joinB(browser: Browser): Promise<{ page: Page; ready: number; person: Person }> {
  expect(linkPath, 'the editor link was minted by share.setGeneralAccess').not.toBeNull();
  const person = await contextAt(browser, B_BASE);
  others.push(person);
  const B = person.page;
  await B.goto(`${B_BASE}${linkPath}`);
  await B.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 30_000 });
  await waitEditor(B);
  const ready = Date.now();
  await connected(B);
  await dismissPrompt(B);
  await expect(B.locator('.pt-viewer:not(.ts-skeleton)').first()).toHaveAttribute(
    'data-edit-mode',
    'editing',
    { timeout: 10_000 },
  );
  return { page: B, ready, person };
}

// ---------------------------------------------------------------------------------------------
// the page's facts

type Facts = {
  revision: number;
  serverRevision: number;
  slideId: string;
  sync: {
    seq: number;
    pending: number;
    retained: number;
    connected: boolean;
    tier: string;
    /** the last hello's covered seq (R2's field on the do tier, docs/CLOUDFLARE.md 2.3); absent until it lands */
    covered?: number | null;
    /** the object's colo from the hello (R2's field on the do tier); absent until it lands */
    colo?: string | null;
    /** the object's facts from the `room` frame (build/r2.md R2-C10): the colo and the object id's head */
    room?: { colo?: string | null; object?: string | null } | null;
  };
  presence: {
    clientId: string | null;
    following?: string | null;
    others: { clientId: string; slideId?: string; selection?: { blockIds: string[] } }[];
  };
  settings?: Record<string, unknown>;
};
const facts = (p: Page): Promise<Facts> => state(p) as unknown as Promise<Facts>;
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
/** The tab's own client id once the hello bound it. */
async function clientIdOf(p: Page): Promise<string> {
  await expect
    .poll(async () => (await facts(p)).presence?.clientId ?? '', { timeout: 15_000 })
    .toMatch(/^[A-Za-z0-9_-]{4,}$/);
  return (await facts(p)).presence.clientId ?? '';
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
    return (clone.textContent ?? '').replace(/ /g, ' ');
  }, run);
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
  return (find(slide) ?? '').replace(/ /g, ' ').replace(/<[^>]+>/g, '');
}
/** The heading of the first slide through the window API (the cover's field, or its heading block once converted). */
async function headingOf(p: Page): Promise<string> {
  const first = (await slideOrder(p))[0]!;
  const slide = await slideJson(p, first);
  if (slide['kind'] === 'title') return String(slide['heading'] ?? '').replace(/ /g, ' ');
  const grammar = slide['grammar'] as { slots?: { main?: string[] } } | undefined;
  const id = grammar?.slots?.main?.[1] ?? 'heading';
  const main = ((slide['slots'] as { main?: { id: string; text?: unknown }[] } | undefined)?.main ??
    []) as { id: string; text?: unknown }[];
  const block = main.find((b) => b.id === id);
  return String(block?.text ?? '').replace(/ /g, ' ');
}
/** The document as one canonical string: the title, the slide order and every slide. */
async function documentOf(p: Page): Promise<{ revision: number; canon: string }> {
  const info = await invoke<{ id: string; title: string; revision: number }>(p, 'deck.info');
  const order = await slideOrder(p);
  const slides: Record<string, unknown> = {};
  for (const id of order) slides[id] = await slideJson(p, id);
  return { revision: info.revision, canon: JSON.stringify({ title: info.title, order, slides }) };
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
const countIn = (text: string | null, token: string): number =>
  (text ?? '').split(token).length - 1;

/**
 * Opens a text session on a run by double click and puts the caret at the end (the sync spec's
 * reading: a selected block's handles can cover the run, so a selection is cleared first and a
 * double click that opened nothing is made once more from the element).
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
/** Two bursts within 200 ms of each other: B's starts 0 to 150 ms after A's. */
async function together(a: () => Promise<void>, b: () => Promise<void>): Promise<void> {
  await Promise.all([
    a(),
    (async () => {
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 150)));
      await b();
    })(),
  ]);
}
/** A body block placed by A as the row's setup write; B waits for it; the heading's handles are cleared. */
async function bodyBlock(
  A: Page,
  B: Page,
  id: string,
  text: string,
  pos = { x: 160, y: 520, w: 1280, h: 160 },
): Promise<{ slideId: string; run: string }> {
  const slideId = (await slideOrder(A))[0]!;
  await placeBlock(A, slideId, { id, type: 'text', text, pos });
  await expect
    .poll(async () => (await runsOfBlock(B, id)).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const run = (await runsOfBlock(A, id))[0]!;
  await Promise.all([quiet(A), quiet(B)]);
  await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);
  return { slideId, run };
}
/** Selects a block as an object with one click (A1 rule 1); Escape closes a session that click opened. */
async function selectBlock(p: Page, blockId: string): Promise<void> {
  const el = p.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`).first();
  await el.click();
  await p.waitForTimeout(120);
  if (await editing(p)) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(120);
  }
}

/**
 * Samples a page every `every` ms with `read` until stopped; the samples carry their time. The
 * rows' bounds are read from the samples: the first sample at or after a moment whose reading
 * holds is the arrival, and the sampling pace is the reading's resolution (40 ms here).
 */
function sampler<T>(p: Page, read: (p: Page) => Promise<T>, every = SAMPLE_MS) {
  const samples: { at: number; value: T }[] = [];
  let stop = false;
  const run = (async () => {
    while (!stop) {
      const t = Date.now();
      try {
        const value = await read(p);
        samples.push({ at: Date.now(), value });
      } catch {
        // a sample lost to a navigation is a gap, not a reading
      }
      const wait = every - (Date.now() - t);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  })();
  return {
    samples,
    async stop(): Promise<{ at: number; value: T }[]> {
      stop = true;
      await run;
      return samples;
    },
    /** The first sample at or after `since` for which `holds` is true, or null. */
    firstAfter(since: number, holds: (value: T) => boolean): { at: number; value: T } | null {
      return samples.find((s) => s.at >= since && holds(s.value)) ?? null;
    },
  };
}
/** The remote presence drawings of a page for one client, as the rows read them. */
type Drawings = {
  caret: { offset: string | null; x: number; dim: boolean; kept: boolean } | null;
  outlines: { block: string | null; inside: boolean; x: number }[];
  flags: { text: string; state: string | null }[];
  drag: { block: string | null; x: number; y: number; state: string | null } | null;
  pointer: { x: number; y: number } | null;
  chip: boolean;
};
async function drawingsOf(p: Page, clientId: string): Promise<Drawings> {
  return p.evaluate((id) => {
    const r = (el: Element) => el.getBoundingClientRect();
    const caretEl = document.querySelector(`.ts-remote-caret[data-client="${id}"]`);
    const dragEl = document.querySelector(`.ts-remote-drag[data-client="${id}"]`);
    const pointerEl = document.querySelector(`.ts-remote-pointer-group[data-client="${id}"]`);
    return {
      caret: caretEl
        ? {
            offset: caretEl.getAttribute('data-offset'),
            x: Math.round(r(caretEl).x * 10) / 10,
            dim: caretEl.classList.contains('is-dim'),
            kept: caretEl.getAttribute('data-kept') === 'true',
          }
        : null,
      outlines: [...document.querySelectorAll(`.ts-remote-outline[data-client="${id}"]`)].map(
        (el) => ({
          block:
            el.getAttribute('data-block') ??
            el.closest('[data-block]')?.getAttribute('data-block') ??
            null,
          inside: el.getAttribute('data-inside') === 'true',
          x: Math.round(r(el).x),
        }),
      ),
      flags: [...document.querySelectorAll(`.ts-flag[data-client="${id}"]`)].map((el) => ({
        text: (el.textContent ?? '').trim(),
        state: el.getAttribute('data-state'),
      })),
      drag: dragEl
        ? {
            block: dragEl.getAttribute('data-block'),
            x: Math.round(r(dragEl).x),
            y: Math.round(r(dragEl).y),
            state: dragEl.getAttribute('data-state'),
          }
        : null,
      pointer: pointerEl ? { x: Math.round(r(pointerEl).x), y: Math.round(r(pointerEl).y) } : null,
      chip: document.querySelector(`[data-control="presence.chip.${id}"]`) !== null,
    };
  }, clientId);
}

/**
 * The instance that answers an origin's `sync.status` (`storeCalls.instance`, docs/SYNC.md 6.3;
 * build/r1.md R1-R5c), or the reason it could not be read. Through the spec's own request
 * context with the bearer where one exists (none on localhost).
 */
/**
 * The instance, the tier and the object's colo an origin's `sync.status` names (the Cloudflare
 * phase, docs/CLOUDFLARE.md 2.1: `colo` is R1's field on the do tier, "unnamed" until it lands),
 * or the reason they could not be read.
 */
async function statusOf(base: string): Promise<{ instance: string; tier: string; colo: string }> {
  const headers = agentHeaders(base);
  if (headers === null) return { instance: 'no bearer', tier: 'unread', colo: 'unread' };
  const api = await request.newContext();
  try {
    const res = await api.post(`${base}/api/actions/sync.status?deck=${encodeURIComponent(deck)}`, {
      headers,
      data: {},
      timeout: 20_000,
      maxRedirects: 0,
    });
    if (res.status() !== 200)
      return { instance: `status ${res.status()}`, tier: 'unread', colo: 'unread' };
    const body = (await res.json().catch(() => null)) as {
      tier?: string;
      colo?: string | null;
      room?: { colo?: string | null } | null;
      storeCalls?: { instance?: string };
    } | null;
    /* the colo: `room.colo` (R2-C10's object facts, build/r2.md) or `colo` (this lane's CF-R1b); "unnamed" until either lands */
    const colo = body?.room?.colo ?? body?.colo ?? null;
    return {
      instance: body?.storeCalls?.instance ?? 'no storeCalls.instance in the answer',
      tier: body?.tier ?? 'unnamed',
      colo: typeof colo === 'string' && colo !== '' ? colo : 'unnamed',
    };
  } catch (error) {
    return { instance: `error ${String(error).slice(0, 80)}`, tier: 'unread', colo: 'unread' };
  } finally {
    await api.dispose().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------
// the wire: every ops POST of a page with its splice offsets and its answer (the reconnect row)

type WireRow = {
  at: number;
  /** where the ops rode: the Vercel ops route, the Worker's HTTP belt, or the socket (the do tier) */
  via: 'http' | 'belt' | 'socket';
  opIds: string[];
  splices: { at?: number; insertLength?: number }[];
  status: number | string | null;
};
/** The splices and op ids of an ops body (the POST's JSON or the socket frame's). */
function opsOf(body: unknown): Pick<WireRow, 'opIds' | 'splices'> {
  const parsed = (body ?? {}) as {
    entries?: { opId: string; mutations?: Record<string, unknown>[] }[];
  };
  return {
    opIds: (parsed.entries ?? []).map((e) => e.opId),
    splices: (parsed.entries ?? []).flatMap((e) =>
      (e.mutations ?? [])
        .filter((m) => m['op'] === 'text.splice')
        .map((m) => ({
          ...(typeof m['at'] === 'number' ? { at: m['at'] } : {}),
          ...(typeof m['insert'] === 'string' ? { insertLength: m['insert'].length } : {}),
        })),
    ),
  };
}
/**
 * Every ops post of a page with its splice offsets and its answer: the Vercel ops route's POST
 * (the memory, redis and blob tiers), and on the do tier (docs/CLOUDFLARE.md 3.6.3; build/r2.md
 * R2-C8) the Worker's HTTP belt POST (`/rooms/<id>/ops` on the room host, while the socket is
 * down) and the socket frames `{ t: 'ops', req, ... }` answered by `{ t: 'ack', req, ok }`.
 */
function wireOf(p: Page, sink: WireRow[]): void {
  p.on('request', (req: PwRequest) => {
    if (req.method() !== 'POST') return;
    const url = req.url();
    const via = /\/api\/decks\/[^/?]+\/ops(\?|$)/.test(url)
      ? 'http'
      : /\/rooms\/[^/?]+\/ops(\?|$)/.test(url)
        ? 'belt'
        : null;
    if (via === null) return;
    const row: WireRow = { at: Date.now(), via, opIds: [], splices: [], status: null };
    try {
      Object.assign(row, opsOf(JSON.parse(req.postData() ?? '{}')));
    } catch {
      // not json
    }
    sink.push(row);
    req
      .response()
      .then((res) => {
        row.status = res ? res.status() : 'no response';
      })
      .catch((error: unknown) => {
        row.status = `failed: ${String(error).slice(0, 60)}`;
      });
  });
  p.on('websocket', (ws) => {
    if (!/\/rooms\/[^/?]+/.test(ws.url())) return;
    const open = new Map<string, WireRow>();
    ws.on('framesent', (frame) => {
      try {
        const payload =
          typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8');
        if (payload === 'ping') return;
        const parsed = JSON.parse(payload) as { t?: string; req?: string | number };
        if (parsed.t !== 'ops') return;
        const row: WireRow = {
          at: Date.now(),
          via: 'socket',
          opIds: [],
          splices: [],
          status: null,
        };
        Object.assign(row, opsOf(parsed));
        sink.push(row);
        if (parsed.req !== undefined) open.set(String(parsed.req), row);
      } catch {
        // not json
      }
    });
    ws.on('framereceived', (frame) => {
      try {
        const payload =
          typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8');
        if (payload === 'pong') return;
        const parsed = JSON.parse(payload) as {
          t?: string;
          req?: string | number;
          ok?: boolean;
          status?: number;
        };
        if (parsed.t !== 'ack' || parsed.req === undefined) return;
        const row = open.get(String(parsed.req));
        if (!row) return;
        row.status = parsed.ok === false ? (parsed.status ?? 'refused') : 200;
        open.delete(String(parsed.req));
      } catch {
        // not json
      }
    });
    ws.on('close', () => {
      for (const row of open.values()) if (row.status === null) row.status = 'socket closed';
      open.clear();
    });
  });
}

// ---------------------------------------------------------------------------------------------
// the rows

test(title('realtime.keystroke.within-300ms'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Realtime keystroke');
    const { page: B } = await joinB(browser);
    const { slideId, run } = await bodyBlock(A, B, 'rt-keys', 'start');
    const tier = (await facts(A)).sync.tier;
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const typedAt: number[] = [];
    const bText = sampler(B, (p) => runText(p, run));
    await openRun(A, run);
    for (const letter of letters) {
      const started = Date.now();
      await A.keyboard.type(letter);
      typedAt.push(Date.now());
      const wait = 1000 - (Date.now() - started);
      if (wait > 0) await A.waitForTimeout(wait);
    }
    await closeRun(A);
    /* every letter has 3 s to reach B before the samples are judged */
    await expect
      .poll(
        async () => {
          const text = await runText(B, run);
          return letters.every((l) => countIn(text, l) === 1);
        },
        { timeout: 3000 },
      )
      .toBe(true)
      .catch(() => undefined);
    const samples = await bText.stop();
    const arrivals = letters.map((l, i) => {
      const seen = samples.find((s) => s.at >= typedAt[i]! && (s.value ?? '').includes(l));
      return { letter: l, ms: seen === null || seen === undefined ? null : seen.at - typedAt[i]! };
    });
    await quiet(A);
    const [a, b] = await Promise.all([
      blockText(A, slideId, 'rt-keys'),
      blockText(B, slideId, 'rt-keys'),
    ]);
    const measured = arrivals.filter((x) => x.ms !== null).map((x) => x.ms!);
    test.info().annotations.push({
      type: 'measure',
      description: `tier ${tier}; ${arrivals.map((x) => `${x.letter} ${x.ms ?? 'not seen'}`).join(', ')} ms from the keystroke (sampled every ${SAMPLE_MS} ms); mean ${measured.length ? Math.round(measured.reduce((n, m) => n + m, 0) / measured.length) : 'none'}, max ${measured.length ? Math.max(...measured) : 'none'}; A "${a}", B "${b}"`,
    });
    test.info().annotations.push({
      type: 'cross region',
      description:
        "not driven here: the 800 ms across regions bound is the verifier's hand row from a browser in Europe (docs/REALTIME.md section 2)",
    });
    for (const l of letters) {
      expect(countIn(a, l), `${l} once in A`).toBe(1);
      expect(countIn(b, l), `${l} once in B`).toBe(1);
    }
    const late = arrivals.filter((x) => x.ms === null || x.ms > 300);
    expect(
      late,
      `ten of ten within 300 ms of the keystroke in one region (${late.map((x) => `${x.letter} ${x.ms ?? 'not seen'} ms`).join(', ')})`,
    ).toEqual([]);
  } finally {
    await cleanUp();
  }
});

test(title('realtime.caret.within-300ms'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Realtime caret');
    const { page: B } = await joinB(browser);
    const { run } = await bodyBlock(A, B, 'rt-caret', 'Caret block');
    const bId = await clientIdOf(B);
    /* A has the block open; B opens it and types ten characters 700 ms apart */
    await openRun(A, run);
    await openRun(B, run);
    const draw = sampler(A, (p) => drawingsOf(p, bId));
    const typedAt: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const started = Date.now();
      await B.keyboard.type(String.fromCharCode(97 + i));
      typedAt.push(Date.now());
      const wait = 700 - (Date.now() - started);
      if (wait > 0) await B.waitForTimeout(wait);
    }
    await A.waitForTimeout(1200);
    const samples = await draw.stop();
    /* the caret's place: data-offset (R2's hook), else its x on the stage */
    const place = (d: Drawings) =>
      d.caret === null ? null : (d.caret.offset ?? String(d.caret.x));
    const first = samples.find((s) => s.at >= typedAt[0]! && s.value.caret !== null);
    const appeared = first ? first.at - typedAt[0]! : null;
    const moves = typedAt.slice(1).map((t, i) => {
      const before = [...samples].reverse().find((s) => s.at <= t);
      const was = before ? place(before.value) : null;
      const moved = samples.find(
        (s) => s.at >= t && s.value.caret !== null && place(s.value) !== was,
      );
      return { keystroke: i + 2, ms: moved ? moved.at - t : null };
    });
    const flag = samples.find((s) => s.value.flags.length > 0)?.value.flags[0] ?? null;
    await Promise.all([closeRun(A), closeRun(B)]);
    test.info().annotations.push({
      type: 'measure',
      description: `B's caret in A ${appeared ?? 'never'} ms after B's first keystroke; moved ${moves.map((m) => `${m.ms ?? 'never'}`).join(', ')} ms after keystrokes 2 to 10; the flag ${flag ? `"${flag.text}"` : 'not drawn'}; data-offset ${first?.value.caret?.offset ?? 'absent'}`,
    });
    expect(
      appeared,
      "B's caret and flag drawn in A within 300 ms of the first keystroke",
    ).not.toBeNull();
    expect(appeared!).toBeLessThanOrEqual(300);
    expect(flag, "B's name flag beside the caret").not.toBeNull();
    const late = moves.filter((m) => m.ms === null || m.ms > 300);
    expect(
      late,
      `the caret moves within 300 ms of each later keystroke (${late.map((m) => `keystroke ${m.keystroke} ${m.ms ?? 'never'} ms`).join(', ')})`,
    ).toEqual([]);
  } finally {
    await cleanUp();
  }
});

test(title('realtime.caret.offset-after-merge'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Realtime caret merge');
    const { page: B } = await joinB(browser);
    const { slideId, run } = await bodyBlock(A, B, 'rt-merge', 'Merge');
    const aId = await clientIdOf(A);
    const bId = await clientIdOf(B);
    const failures: string[] = [];
    const readings: string[] = [];
    for (let round = 1; round <= 3; round += 1) {
      const wa = ` ma${round}`;
      const wb = ` mb${round}`;
      await openRun(A, run);
      await openRun(B, run);
      await together(
        () => typeHuman(A, wa),
        () => typeHuman(B, wb),
      );
      /* both words in both sessions, then the carets as each draws the other's */
      const merged = await expect
        .poll(
          async () => {
            const [a, b] = await Promise.all([runText(A, run), runText(B, run)]);
            return [a, b].every((t) => t !== null && t.includes(wa) && t.includes(wb));
          },
          { timeout: 5000 },
        )
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      await A.waitForTimeout(400);
      const [inA, inB, textA, textB] = await Promise.all([
        drawingsOf(A, bId),
        drawingsOf(B, aId),
        runText(A, run),
        runText(B, run),
      ]);
      const endOf = (text: string | null, word: string) => {
        const i = (text ?? '').indexOf(word);
        return i < 0 ? null : i + word.length;
      };
      const wantB = endOf(textA, wb);
      const wantA = endOf(textB, wa);
      const offB =
        inA.caret?.offset === null || inA.caret === null ? null : Number(inA.caret.offset);
      const offA =
        inB.caret?.offset === null || inB.caret === null ? null : Number(inB.caret.offset);
      await Promise.all([closeRun(A), closeRun(B)]);
      await A.waitForTimeout(300);
      const [afterA, afterB] = await Promise.all([drawingsOf(A, bId), drawingsOf(B, aId)]);
      readings.push(
        `round ${round}: merged ${merged}; A draws B's caret at offset ${offB ?? 'none'} (B's word ends at ${wantB}), B draws A's at ${offA ?? 'none'} (A's word ends at ${wantA}); after Escape A ${afterA.caret ? `offset ${afterA.caret.offset}` : 'no caret'}, B ${afterB.caret ? `offset ${afterB.caret.offset}` : 'no caret'}`,
      );
      if (!merged)
        failures.push(`round ${round}: the two words did not merge in both sessions within 5 s`);
      /* "after the other's own last character": at or past the end of the other's word and never
         0. A caret that stood where the other's text was inserted is pushed past it (the first
         run read A's caret at 13 in B after A's word ended at 9 and B's at 13), which is after
         A's last character; a caret at 0 or inside the other's word is the defect */
      const after = (offset: number | null, want: number | null) =>
        offset !== null && !Number.isNaN(offset) && offset > 0 && want !== null && offset >= want;
      if (!after(offB, wantB))
        failures.push(
          `round ${round}: A draws B's caret at ${offB ?? 'none'}, not after B's word (which ends at ${wantB})`,
        );
      if (!after(offA, wantA))
        failures.push(
          `round ${round}: B draws A's caret at ${offA ?? 'none'}, not after A's word (which ends at ${wantA})`,
        );
      await Promise.all([quiet(A), quiet(B)]);
    }
    test.info().annotations.push({ type: 'measure', description: readings.join(' | ') });
    const [a, b] = await Promise.all([
      blockText(A, slideId, 'rt-merge'),
      blockText(B, slideId, 'rt-merge'),
    ]);
    expect(a).toBe(b);
    expect(
      failures,
      "each browser draws the other's caret after the other's last character, three rounds",
    ).toEqual([]);
  } finally {
    await cleanUp();
  }
});

test(title('realtime.selection.outline-within-300ms'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Realtime outline');
    const { page: B } = await joinB(browser);
    await bodyBlock(A, B, 'rt-sel-x', 'Block X', { x: 160, y: 420, w: 600, h: 140 });
    await bodyBlock(A, B, 'rt-sel-y', 'Block Y', { x: 840, y: 420, w: 600, h: 140 });
    const bId = await clientIdOf(B);
    const draw = sampler(A, (p) => drawingsOf(p, bId));
    const clicks: { block: string; at: number }[] = [];
    for (let i = 0; i < 8; i += 1) {
      const block = i % 2 === 0 ? 'rt-sel-x' : 'rt-sel-y';
      await selectBlock(B, block);
      clicks.push({ block, at: Date.now() });
      await B.waitForTimeout(900);
    }
    await A.waitForTimeout(1000);
    const samples = await draw.stop();
    const arrivals = clicks.map((c) => {
      const seen = samples.find(
        (s) => s.at >= c.at && s.value.outlines.some((o) => o.block === c.block),
      );
      return { block: c.block, ms: seen ? seen.at - c.at : null };
    });
    const flagged = samples.some((s) => s.value.flags.length > 0);
    /* a block both hold: A selects Y while B holds it; the remote outline is drawn inside the own ring */
    await selectBlock(A, 'rt-sel-y');
    const inside = await expect
      .poll(
        async () => (await drawingsOf(A, bId)).outlines.find((o) => o.block === 'rt-sel-y') ?? null,
        { timeout: 2000 },
      )
      .toMatchObject({ inside: true })
      .then(() => true)
      .catch(() => false);
    const held = (await drawingsOf(A, bId)).outlines.find((o) => o.block === 'rt-sel-y') ?? null;
    await A.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'measure',
      description: `the outline in A ${arrivals.map((x) => `${x.block} ${x.ms ?? 'never'}`).join(', ')} ms after B's clicks; a flag drawn ${flagged}; with A on Y too: ${held ? `outline ${held.inside ? 'inside the own ring' : 'not inside'}` : 'no outline for B'}`,
    });
    const late = arrivals.filter((x) => x.ms === null || x.ms > 300);
    expect(
      late,
      `the outline follows B's clicks within 300 ms, eight of eight (${late.map((x) => `${x.block} ${x.ms ?? 'never'} ms`).join(', ')})`,
    ).toEqual([]);
    expect(flagged, "B's flag on the outline").toBe(true);
    expect(inside, 'a block both hold shows the remote outline inside the own ring').toBe(true);
  } finally {
    await cleanUp();
  }
});

test(title('realtime.block.drag-live'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Realtime drag');
    const { page: B } = await joinB(browser);
    const { slideId } = await bodyBlock(A, B, 'rt-drag', 'Move me', {
      x: 200,
      y: 400,
      w: 480,
      h: 120,
    });
    const bId = await clientIdOf(B);
    /* A holds the block selected while B drags it 160 px */
    await selectBlock(A, 'rt-drag');
    const before = await posOf(A, slideId, 'rt-drag');
    const el = B.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="rt-drag"]').first();
    await selectBlock(B, 'rt-drag');
    const box = (await el.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const draw = sampler(A, (p) => drawingsOf(p, bId), 30);
    await B.mouse.move(cx, cy);
    await B.mouse.down();
    const dragStart = Date.now();
    for (let i = 1; i <= 12; i += 1) {
      await B.mouse.move(cx + (160 * i) / 12, cy, { steps: 1 });
      await B.waitForTimeout(50);
    }
    await B.waitForTimeout(300);
    await B.mouse.up();
    const released = Date.now();
    let landedMs: number | null = null;
    await expect
      .poll(
        async () => {
          const now = await posOf(A, slideId, 'rt-drag');
          if (now !== null && now !== before && landedMs === null) landedMs = Date.now() - released;
          return now;
        },
        { timeout: 5000 },
      )
      .not.toBe(before)
      .catch(() => undefined);
    await A.waitForTimeout(400);
    const samples = await draw.stop();
    const during = samples.filter((s) => s.at >= dragStart && s.at <= released);
    const ghostXs = [
      ...new Set(during.filter((s) => s.value.drag !== null).map((s) => s.value.drag!.x)),
    ];
    const movingFlag = during.some((s) =>
      s.value.flags.some((f) => f.state === 'moving' || /moving/.test(f.text)),
    );
    const ghostStates = [
      ...new Set(during.filter((s) => s.value.drag !== null).map((s) => s.value.drag!.state)),
    ];
    const after = await posOf(A, slideId, 'rt-drag');
    test.info().annotations.push({
      type: 'measure',
      description: `the drag ghost in A took ${ghostXs.length} distinct x positions over ${during.length} samples during the ${released - dragStart} ms drag (data-state ${ghostStates.join(', ') || 'none'}); a "moving" flag ${movingFlag}; A's document moved ${landedMs ?? 'never within 5 s'} ms after the release (before ${before}, after ${after})`,
    });
    expect(
      ghostXs.length,
      "A sees the block's box follow while the drag runs (at least three positions at 80 ms steps)",
    ).toBeGreaterThanOrEqual(3);
    expect(movingFlag, 'a "moving" word on B\'s flag').toBe(true);
    expect(landedMs, "A's selection reads the new position after the release").not.toBeNull();
    expect(landedMs!, 'no jump later than 300 ms after the release').toBeLessThanOrEqual(300);
    await A.keyboard.press('Escape');
  } finally {
    await cleanUp();
  }
});

test(title('realtime.title.two-typers'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Realtime title');
    const { page: B } = await joinB(browser);
    const run = await headingRun(A);
    await expect.poll(() => runText(B, run), { timeout: 15_000 }).not.toBeNull();
    const failures: string[] = [];
    const readings: string[] = [];
    const all: string[] = [];
    const aText = sampler(A, (p) => runText(p, run));
    const bText = sampler(B, (p) => runText(p, run));
    const typedEnd = new Map<string, number>();
    const typeWord = async (p: Page, word: string) => {
      await typeHuman(p, word);
      typedEnd.set(word, Date.now());
    };
    for (let round = 1; round <= 3; round += 1) {
      const pair1 = [` ta${round}`, ` tb${round}`] as const;
      const pair2 = [` ua${round}`, ` ub${round}`] as const;
      all.push(...pair1, ...pair2);
      await openRun(A, run);
      await openRun(B, run);
      await together(
        () => typeWord(A, pair1[0]),
        () => typeWord(B, pair1[1]),
      );
      await A.waitForTimeout(700);
      await together(
        () => typeWord(A, pair2[0]),
        () => typeWord(B, pair2[1]),
      );
      await Promise.all([closeRun(A), closeRun(B)]);
      const escapeAt = Date.now();
      const four = [...pair1, ...pair2];
      const settledBoth = await expect
        .poll(
          async () => {
            const [a, b] = await Promise.all([headingOf(A), headingOf(B)]);
            return four.every((w) => countIn(a, w) === 1 && countIn(b, w) === 1);
          },
          { timeout: 3000 },
        )
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      const settledAt = Date.now();
      /* the other's word in each browser from its last keystroke, read from the samples */
      const seen = (s: ReturnType<typeof sampler<string | null>>, word: string) => {
        const end = typedEnd.get(word)!;
        const hit = s.firstAfter(end, (t) => (t ?? '').includes(word));
        return hit ? hit.at - end : null;
      };
      const inA = [pair1[1], pair2[1]].map((w) => ({ word: w, ms: seen(aText, w) }));
      const inB = [pair1[0], pair2[0]].map((w) => ({ word: w, ms: seen(bText, w) }));
      const bothIn = settledBoth ? settledAt - escapeAt : null;
      readings.push(
        `round ${round}: both words in both browsers ${bothIn ?? 'not within 3000'} ms after the later Escape; B's words in A ${inA.map((x) => `${x.word.trim()} ${x.ms ?? 'never'}`).join(', ')} ms after B's keystrokes; A's words in B ${inB.map((x) => `${x.word.trim()} ${x.ms ?? 'never'}`).join(', ')} ms`,
      );
      if (bothIn === null || bothIn > 500)
        failures.push(
          `round ${round}: both words in both browsers ${bothIn ?? 'not within 3000'} ms after Escape (bound 500)`,
        );
      for (const x of [...inA, ...inB])
        if (x.ms === null || x.ms > 500)
          failures.push(
            `round ${round}: ${x.word.trim()} shown in the other browser ${x.ms ?? 'never'} ms after its keystrokes (bound 500)`,
          );
      await Promise.all([quiet(A), quiet(B)]);
    }
    await Promise.all([aText.stop(), bText.stop()]);
    test.info().annotations.push({ type: 'measure', description: readings.join(' | ') });
    const a = await headingOf(A);
    expect(a).toBe(await headingOf(B));
    for (const w of all) expect(countIn(a, w), `${w} once, no word lost`).toBe(1);
    expect(failures, 'both words within 500 ms, three rounds').toEqual([]);
  } finally {
    await cleanUp();
  }
});

test(title('realtime.join.chip-within-1s'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Realtime join');
    const aId = await clientIdOf(A);
    const rounds: string[] = [];
    const failures: string[] = [];
    const statuses = { a: await statusOf(A_BASE), b: await statusOf(B_BASE) };
    const instances = { a: statuses.a.instance, b: statuses.b.instance };
    for (let round = 1; round <= 3; round += 1) {
      const { page: B, ready, person } = await joinB(browser);
      const bId = await clientIdOf(B);
      let inA: number | null = null;
      let inB: number | null = null;
      await Promise.all([
        expect
          .poll(() => A.locator(`[data-control="presence.chip.${bId}"]`).count(), {
            timeout: 10_000,
          })
          .toBeGreaterThan(0)
          .then(() => {
            inA = Date.now() - ready;
          })
          .catch(() => undefined),
        expect
          .poll(() => B.locator(`[data-control="presence.chip.${aId}"]`).count(), {
            timeout: 10_000,
          })
          .toBeGreaterThan(0)
          .then(() => {
            inB = Date.now() - ready;
          })
          .catch(() => undefined),
      ]);
      rounds.push(
        `round ${round}: B's chip in A ${inA ?? 'not within 10 s'} ms, A's chip in B ${inB ?? 'not within 10 s'} ms after B's editor was ready`,
      );
      if (inA === null || inA > 1000)
        failures.push(`round ${round}: B's chip in A ${inA ?? 'not within 10 s'} ms`);
      if (inB === null || inB > 1000)
        failures.push(`round ${round}: A's chip in B ${inB ?? 'not within 10 s'} ms`);
      /* B leaves and A's roster drops it before the next join */
      others.splice(others.indexOf(person), 1);
      await leaveB(person);
      await expect
        .poll(
          async () => ((await facts(A)).presence.others ?? []).some((o) => o.clientId === bId),
          {
            timeout: 40_000,
          },
        )
        .toBe(false)
        .catch(() => undefined);
    }
    test.info().annotations.push({
      type: 'measure',
      description: `${rounds.join('; ')}; instances: ${A_BASE} answered ${instances.a}, ${B_BASE} answered ${instances.b}${TWO_ORIGINS ? ' (two origins)' : " (one origin: the instance of each request is the deployment's choice and is recorded, not asserted)"}; tier ${statuses.a.tier}; the object's colo ${statuses.a.colo} and ${statuses.b.colo}${statuses.a.tier === 'do' ? ' (one object on the do tier)' : ' (no object on this tier)'}`,
    });
    /* the Cloudflare phase: on the do tier one object orders the deck, named by its colo on both origins */
    if (statuses.a.tier === 'do' && statuses.b.tier === 'do') {
      expect(statuses.a.colo, "sync.status names the object's colo on the do tier").not.toBe(
        'unnamed',
      );
      expect(statuses.b.colo, 'one object across both origins').toBe(statuses.a.colo);
    }
    expect(
      failures,
      "B's chip in A and A's in B within 1 s of B's editor being ready, three of three",
    ).toEqual([]);
    if (TWO_ORIGINS) {
      expect(instances.a, 'the first origin names its instance').toMatch(/^[0-9a-f]{8}$/);
      expect(instances.b, 'the second origin names its instance').toMatch(/^[0-9a-f]{8}$/);
      expect(instances.a, 'the two tabs on different instances').not.toBe(instances.b);
    }
  } finally {
    await cleanUp();
  }
});

/** Opens A's roster: the people button when it takes a pointer, else Shift+Tab (SPEC-3 0.42). */
async function openRoster(p: Page): Promise<string> {
  await p.keyboard.press('Escape');
  const more = ctl(p, 'presence.more');
  const takesPointer = await more
    .evaluate(
      (el) =>
        !el.classList.contains('is-empty') &&
        getComputedStyle(el).pointerEvents !== 'none' &&
        getComputedStyle(el).opacity !== '0',
    )
    .catch(() => false);
  if (takesPointer) {
    await more.click({ timeout: 5000 });
    const open = await p
      .locator('#ts-menu-roster')
      .first()
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (open) return 'presence.more';
  }
  await p.keyboard.press('Shift+Tab');
  await p.locator('#ts-menu-roster').first().waitFor({ timeout: 4000 });
  return 'Shift+Tab';
}
async function rosterRowOf(
  p: Page,
  clientId: string,
): Promise<{ item: string | null; act: string } | null> {
  const row = p.locator(`[data-control="presence.roster.${clientId}"]`).first();
  if ((await row.count()) === 0) return null;
  return {
    item: await row.getAttribute('data-menu-item'),
    act: (
      (await row
        .locator('.ts-roster-act')
        .first()
        .textContent()
        .catch(() => '')) ?? ''
    ).trim(),
  };
}
const followingOf = async (p: Page): Promise<string | null> =>
  (await facts(p)).presence.following ?? null;

test(title('realtime.follow.for-everyone'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Realtime follow');
    while ((await slideOrder(A)).length < 3) {
      const order = await slideOrder(A);
      const s = await facts(A);
      await invoke(A, 'slide.new', {
        layout: 'split',
        after: order[order.length - 1],
        baseRevision: s.revision,
      });
      await quiet(A);
    }
    const slides = await slideOrder(A);
    await clickCard(A, slides[0]!);
    const { page: B, person } = await joinB(browser);
    const aId = await clientIdOf(A);
    const bId = await clientIdOf(B);
    await expect(A.locator(`[data-control="presence.chip.${bId}"]`)).toHaveCount(1, {
      timeout: 10_000,
    });
    const advanced = (await facts(A)).settings?.['advancedTools'] === true;
    /* the roster offers Follow for B in the default view */
    const opened = await openRoster(A);
    const row = await rosterRowOf(A, bId);
    test.info().annotations.push({
      type: 'roster',
      description: `opened by ${opened}; B's row ${row ? `data-menu-item ${row.item}, act "${row.act}"` : 'absent'}; Advanced tools ${advanced}`,
    });
    if (row === null || row.item !== 'title.presence.follow') {
      await A.keyboard.press('Escape');
      test.skip(
        true,
        `not on this build: title.presence.follow is not offered in the default view for an anonymous editor (B's roster row reads ${row?.item ?? 'absent'}; docs/REALTIME.md section 7 default 5, R3 and the integrator's unpark of model.ts 794 to 799)`,
      );
    }
    await A.locator(`[data-control="presence.roster.${bId}"]`).first().click();
    await expect(ctl(A, 'presence.following')).toBeVisible({ timeout: 5000 });
    const plate = await ctl(A, 'presence.following').evaluate((el) => ({
      client: el.getAttribute('data-client'),
      text: (el.textContent ?? '').trim(),
      stop: el.querySelector('[data-control="presence.following.stop"]') !== null,
    }));
    expect(plate.text, 'the plate reads Following').toMatch(/Following/);
    expect(plate.stop, 'the plate offers Stop').toBe(true);
    /* B moves to slide 3; A's stage follows within 1 s */
    const t0 = Date.now();
    await clickCard(B, slides[2]!);
    let followedMs: number | null = null;
    await expect
      .poll(
        async () => {
          const id = (await facts(A)).slideId;
          if (id === slides[2] && followedMs === null) followedMs = Date.now() - t0;
          return id;
        },
        { timeout: 5000 },
      )
      .toBe(slides[2])
      .catch(() => undefined);
    /* the six end triggers, each after a fresh follow through the window API */
    const refollow = async () => {
      await invoke(A, 'presence.follow', { clientId: bId });
      await expect.poll(() => followingOf(A), { timeout: 3000 }).toBe(bId);
    };
    const ended = async (what: string, act: () => Promise<void>): Promise<string> => {
      await act();
      const gone = await expect
        .poll(() => followingOf(A), { timeout: 3000 })
        .toBeNull()
        .then(() => true)
        .catch(() => false);
      return `${what} ${gone ? 'ended it' : 'did not end it'}`;
    };
    const ends: string[] = [];
    ends.push(await ended("A's own click on another card", () => clickCard(A, slides[1]!)));
    await refollow();
    ends.push(
      await ended("A's own edit", async () => {
        const run = await headingRun(A);
        await openRun(A, run);
        await typeHuman(A, ' f');
        await closeRun(A);
      }),
    );
    await refollow();
    /* the comment: the shortcut first; when the card does not open (the shortcut needs the editor's
       focus, which a refollow through the window API does not give, and Insert > Comment is
       disabled while nothing is selected, since a comment anchors on a selection; a click to select
       would end the follow as the own click; the Cloudflare phase's runs 1, 2 and 4 on 4475), the
       comment goes through the window API as a slide comment on the slide the follow put A on,
       the same action (comment.add) the UI path takes and the same follow end rule
       (follow-rules.ts endsFollowOnAction); the measure says which path and whether the follow still
       stood when the comment was made */
    let followingBeforeComment: string | null = null;
    let commentPath = 'the shortcut';
    ends.push(
      await ended("A's comment", async () => {
        await A.keyboard.press('Escape');
        await A.keyboard.press('Meta+Alt+m');
        const opened = await ctl(A, 'comment.card')
          .waitFor({ timeout: 3000 })
          .then(() => true)
          .catch(() => false);
        followingBeforeComment = await followingOf(A);
        if (opened) {
          await ctl(A, 'comment.card.new.field').click({ timeout: 5000 });
          await A.keyboard.type('A comment while following', { delay: 30 });
          await ctl(A, 'comment.card.new.submit').click({ timeout: 5000 });
          await A.waitForTimeout(400);
          await A.keyboard.press('Escape');
        } else {
          commentPath = 'the window API (comment.add on the slide; the shortcut opened no card)';
          const slideId = (await facts(A)).slideId;
          await invoke(A, 'comment.add', {
            anchor: { kind: 'slide', slideId },
            body: { text: 'A comment while following', mentions: [] },
          });
        }
      }),
    );
    ends[ends.length - 1] +=
      ` (through ${commentPath}; still following before the comment: ${followingBeforeComment !== null})`;
    await refollow();
    ends.push(
      await ended('Slideshow', async () => {
        await invoke(A, 'view.present', { on: true });
        await A.waitForTimeout(500);
        await invoke(A, 'view.present', { on: false });
      }),
    );
    await refollow();
    ends.push(
      await ended('Version history', async () => {
        /* the title row's last edit word is a menu item (`data-menu-item="title.lastEdit"`, TitleRow.tsx
           290), not a data-control, so the row reads it by that hook; when it takes no click within
           5 s the panel opens through File > Version history > See version history, every step
           bounded (the Cloudflare phase's run 5 waited on `[data-control="title.lastEdit"]`, which no
           element carries, to the test's own timeout) */
        const lastEdit = A.locator('[data-menu-item="title.lastEdit"]').first();
        const clicked = await lastEdit
          .click({ timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        if (!clicked) {
          await ctl(A, 'menubar.file').click({ timeout: 5000 });
          await A.locator('#ts-menu-file').waitFor({ timeout: 8000 });
          await ctl(A, 'menu.file.versionHistory').hover({ timeout: 5000 });
          await ctl(A, 'menu.file.versionHistory.see').click({ timeout: 8000 });
        }
        await A.waitForTimeout(600);
        await A.keyboard.press('Escape');
      }),
    );
    await refollow();
    /* B's side: A's chip offers Follow for B, an editor by link */
    const openedB = await openRoster(B);
    const rowB = await rosterRowOf(B, aId);
    await B.keyboard.press('Escape');
    /* the followed person's leave ends it */
    others.splice(others.indexOf(person), 1);
    const leftAt = Date.now();
    await leaveB(person);
    const leaveEnded = await expect
      .poll(() => followingOf(A), { timeout: 5000 })
      .toBeNull()
      .then(() => true)
      .catch(() => false);
    const leaveMs = Date.now() - leftAt;
    test.info().annotations.push({
      type: 'measure',
      description: `A followed B to slide 3 ${followedMs ?? 'not within 5 s'} ms after B's click; ${ends.join('; ')}; B's leave ended it ${leaveEnded} (${leaveMs} ms); B's roster (opened by ${openedB}) offers A ${rowB ? rowB.item : 'no row'}`,
    });
    expect(followedMs, "the follower's stage is on the followed person's slide").not.toBeNull();
    expect(followedMs!, 'within 1 s of their click').toBeLessThanOrEqual(1000);
    expect(
      ends.filter((e) => /did not end/.test(e)),
      'the five own triggers end the follow',
    ).toEqual([]);
    expect(leaveEnded, "the followed person's leave ends it").toBe(true);
    expect(rowB?.item, 'B, an editor by link, is offered Follow for A').toBe(
      'title.presence.follow',
    );
  } finally {
    await cleanUp();
  }
});

test(title('realtime.reload.loses-nothing'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Realtime reload');
    const { page: B } = await joinB(browser);
    const one = await bodyBlock(A, B, 'rt-reload-a', 'A writes', {
      x: 160,
      y: 420,
      w: 600,
      h: 140,
    });
    const two = await bodyBlock(A, B, 'rt-reload-b', 'B writes', {
      x: 840,
      y: 420,
      w: 600,
      h: 140,
    });
    const wordsA = [' a1', ' a2', ' a3', ' a4', ' a5'];
    const wordsB = [' b1', ' b2', ' b3', ' b4', ' b5'];
    let lastKeyA = 0;
    let reloadMs: number | null = null;
    const typingA = (async () => {
      await openRun(A, one.run);
      for (const [i, w] of wordsA.entries()) {
        await typeHuman(A, w);
        lastKeyA = Date.now();
        if (i === 2) {
          await closeRun(A);
          const t = Date.now();
          await A.goto(`/edit/${deck}`);
          await waitEditor(A);
          await connected(A);
          await dismissPrompt(A);
          reloadMs = Date.now() - t;
          await openRun(A, one.run);
        }
        await A.waitForTimeout(500);
      }
      await closeRun(A);
    })();
    const typingB = (async () => {
      await openRun(B, two.run);
      for (const w of wordsB) {
        await typeHuman(B, w);
        await B.waitForTimeout(600);
      }
      await closeRun(B);
    })();
    await Promise.all([typingA, typingB]);
    const since = lastKeyA;
    const converged = await expect
      .poll(
        async () => {
          const [a1, a2, b1, b2] = await Promise.all([
            blockText(A, one.slideId, 'rt-reload-a'),
            blockText(A, two.slideId, 'rt-reload-b'),
            blockText(B, one.slideId, 'rt-reload-a'),
            blockText(B, two.slideId, 'rt-reload-b'),
          ]);
          return (
            wordsA.every((w) => countIn(a1, w) === 1 && countIn(b1, w) === 1) &&
            wordsB.every((w) => countIn(a2, w) === 1 && countIn(b2, w) === 1)
          );
        },
        { timeout: 3000 },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const convergedMs = Date.now() - since;
    await Promise.all([quiet(A), quiet(B)]);
    const live = Math.max((await facts(A)).serverRevision, (await facts(B)).serverRevision);
    const [da, db] = await Promise.all([documentOf(A), documentOf(B)]);
    test.info().annotations.push({
      type: 'measure',
      description: `A's reload took ${reloadMs ?? 'no reload'} ms; every word in both ${converged ? 'within' : 'not within'} 3 s of A's last keystroke (${convergedMs} ms); revisions ${da.revision}, ${db.revision} against the live ${live}`,
    });
    expect(converged, "every word in both browsers within 3 s of A's last keystroke").toBe(true);
    expect(da.canon, 'A and B read byte equal documents').toBe(db.canon);
    expect(da.revision, 'at the live revision').toBeGreaterThanOrEqual(live);
  } finally {
    await cleanUp();
  }
});

test(title('realtime.reconnect.loses-nothing'), async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    const A = await openA(browser, 'Realtime reconnect');
    const { page: B } = await joinB(browser);
    const wire: WireRow[] = [];
    wireOf(A, wire);
    const { slideId, run } = await bodyBlock(A, B, 'rt-recon', 'Start of the block');
    const recordsBefore = (await invoke<unknown[]>(A, 'version.list', {})).length;
    const offlineAt = Date.now();
    await owner!.context.setOffline(true);
    const bTyping = (async () => {
      await openRun(B, run);
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
    const firstAttempt = wire.find((w) => w.splices.length > 0);
    expect((await facts(A)).sync.pending, 'A holds its word while offline').toBeGreaterThan(0);
    await owner!.context.setOffline(false);
    const onlineAt = Date.now();
    const four = [' ob1', ' ob2', ' ob3', ' oa1'];
    const converged = await expect
      .poll(
        async () => {
          const [a, b] = await Promise.all([
            blockText(A, slideId, 'rt-recon'),
            blockText(B, slideId, 'rt-recon'),
          ]);
          return a === b && four.every((w) => countIn(a, w) === 1);
        },
        { timeout: 3000 },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const convergedMs = Date.now() - onlineAt;
    await Promise.all([quiet(A, 45_000), quiet(B)]);
    const [a, b] = await Promise.all([
      blockText(A, slideId, 'rt-recon'),
      blockText(B, slideId, 'rt-recon'),
    ]);
    const admitted = wire.filter((w) => w.status === 200 && w.splices.length > 0);
    const firstAt = firstAttempt?.splices[0]?.at ?? null;
    const resentAt = admitted[admitted.length - 1]?.splices[0]?.at ?? null;
    const carriage = `the first attempt over ${firstAttempt?.via ?? 'nothing'}, the admitted one over ${admitted[admitted.length - 1]?.via ?? 'nothing'}`;
    /* the records: one per author per contiguous run (the checkpointer), read from version.list */
    await A.waitForTimeout(2500);
    const records = (await invoke<unknown[]>(A, 'version.list', {})).length - recordsBefore;
    test.info().annotations.push({
      type: 'measure',
      description: `converged ${converged} ${convergedMs} ms after the reconnect; A's splice offset ${firstAt} on the first attempt, ${resentAt} on the admitted post (${carriage}); ${records} version record(s) for the four words (one per author per contiguous run); A "${a}"`,
    });
    expect(
      converged,
      `every word in both browsers within 3 s of the reconnect (A "${a}", B "${b}")`,
    ).toBe(true);
    for (const w of four) expect(countIn(a, w), `${w} once, no doubled word`).toBe(1);
    expect(firstAt, "A's first attempt carried a text.splice").not.toBeNull();
    expect(resentAt, "A's admitted POST carried a text.splice").not.toBeNull();
    expect(resentAt!, "A's resend at the shifted offset").toBeGreaterThan(firstAt!);
    expect(
      records,
      'one record per run: at most one per word typed, at least one',
    ).toBeGreaterThanOrEqual(1);
    expect(records).toBeLessThanOrEqual(four.length);
  } finally {
    await cleanUp();
  }
});

/** The id of the second Live pointers row on this build: `others` (REALTIME.md 5.2) or today's `collaborators`. */
async function othersRowId(p: Page): Promise<string | null> {
  await ctl(p, 'menubar.view').click();
  await p.locator('#ts-menu-view').waitFor({ timeout: 8000 });
  const parent = ctl(p, 'menu.view.livePointers');
  if ((await parent.count()) === 0) {
    await p.keyboard.press('Escape');
    return null;
  }
  await parent.hover();
  await p.waitForTimeout(300);
  const id =
    (await p.locator('[data-control="menu.view.livePointers.others"]').count()) > 0
      ? 'view.livePointers.others'
      : (await p.locator('[data-control="menu.view.livePointers.collaborators"]').count()) > 0
        ? 'view.livePointers.collaborators'
        : null;
  await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');
  return id;
}

test(title('realtime.pointer.second-browser'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Realtime pointer');
    const { page: B } = await joinB(browser);
    const bId = await clientIdOf(B);
    const othersId = await othersRowId(A);
    if (othersId === null)
      test.skip(
        true,
        'not on this build: View > Live pointers is not in the default view (view.livePointers.mine, view.livePointers.others; docs/REALTIME.md 5.2, R3 and the integrator)',
      );
    const setting = async (p: Page, key: string) => (await facts(p)).settings?.[key] === true;
    /* B: Show my pointer on; A: Show collaborator pointers on */
    if (!(await setting(B, 'pointerMine')))
      await menuPath(B, 'view', 'view.livePointers', 'view.livePointers.mine');
    await expect.poll(() => setting(B, 'pointerMine'), { timeout: 5000 }).toBe(true);
    if (!(await setting(A, 'pointerOthers')))
      await menuPath(A, 'view', 'view.livePointers', othersId!);
    await expect.poll(() => setting(A, 'pointerOthers'), { timeout: 5000 }).toBe(true);
    const sheet = (await B.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
      .first()
      .boundingBox())!;
    const draw = sampler(A, (p) => drawingsOf(p, bId), 30);
    const t0 = Date.now();
    for (let i = 0; i < 10; i += 1) {
      await B.mouse.move(
        sheet.x + sheet.width * (0.3 + i * 0.04),
        sheet.y + sheet.height * (0.4 + i * 0.03),
      );
      await B.waitForTimeout(100);
    }
    await A.waitForTimeout(800);
    const samples = await draw.stop();
    const first = samples.find((s) => s.at >= t0 && s.value.pointer !== null);
    const drawnMs = first ? first.at - t0 : null;
    const positions = new Set(
      samples
        .filter((s) => s.value.pointer !== null)
        .map((s) => `${s.value.pointer!.x},${s.value.pointer!.y}`),
    ).size;
    const flag = samples.find((s) => s.value.pointer !== null)?.value.flags.length ?? 0;
    /* with Show collaborator pointers off in A the pointer is hidden */
    await menuPath(A, 'view', 'view.livePointers', othersId!);
    await expect.poll(() => setting(A, 'pointerOthers'), { timeout: 5000 }).toBe(false);
    for (let i = 0; i < 6; i += 1) {
      await B.mouse.move(sheet.x + sheet.width * (0.6 - i * 0.03), sheet.y + sheet.height * 0.5);
      await B.waitForTimeout(100);
    }
    await A.waitForTimeout(1200);
    const hidden = (await drawingsOf(A, bId)).pointer === null;
    await menuPath(A, 'view', 'view.livePointers', othersId!);
    test.info().annotations.push({
      type: 'measure',
      description: `B's pointer drawn in A ${drawnMs ?? 'never within the sweep'} ms after the first move, ${positions} distinct positions, flags beside it ${flag}; hidden with Show collaborator pointers off ${hidden}; the second row's id ${othersId}`,
    });
    test.info().annotations.push({
      type: 'twenty first person',
      description:
        "not driven: twenty contexts are not opened on the shared machine (LIVE_POINTERS_MAX 20); the server rule is rosterEntryFor's",
    });
    expect(drawnMs, "B's pointer is drawn in A").not.toBeNull();
    expect(drawnMs!, 'within 300 ms of the move').toBeLessThanOrEqual(300);
    expect(positions, 'the pointer moves with B').toBeGreaterThanOrEqual(2);
    expect(flag, "B's flag beside the pointer").toBeGreaterThan(0);
    expect(hidden, 'hidden with Show collaborator pointers off in A').toBe(true);
  } finally {
    await cleanUp();
  }
});

test(title('realtime.caret.dims-and-leaves'), async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    const A = await openA(browser, 'Realtime dims');
    const { page: B, person } = await joinB(browser);
    const { run } = await bodyBlock(A, B, 'rt-dim', 'Dim block');
    const bId = await clientIdOf(B);
    await openRun(B, run);
    await typeHuman(B, ' x');
    await expect
      .poll(async () => (await drawingsOf(A, bId)).caret !== null, { timeout: 5000 })
      .toBe(true);
    const still = Date.now();
    let dimMs: number | null = null;
    await expect
      .poll(
        async () => {
          const d = await drawingsOf(A, bId);
          if (d.caret?.dim && dimMs === null) dimMs = Date.now() - still;
          return d.caret?.dim ?? false;
        },
        { timeout: 40_000, intervals: [500] },
      )
      .toBe(true)
      .catch(() => undefined);
    const beforeLeave = await drawingsOf(A, bId);
    others.splice(others.indexOf(person), 1);
    const leftAt = Date.now();
    await leaveB(person);
    let goneMs: number | null = null;
    await expect
      .poll(
        async () => {
          const d = await drawingsOf(A, bId);
          const gone =
            d.caret === null && d.outlines.length === 0 && d.flags.length === 0 && !d.chip;
          if (gone && goneMs === null) goneMs = Date.now() - leftAt;
          return gone;
        },
        { timeout: 10_000, intervals: [100] },
      )
      .toBe(true)
      .catch(() => undefined);
    const after = await drawingsOf(A, bId);
    test.info().annotations.push({
      type: 'measure',
      description: `B's caret dimmed in A ${dimMs ?? 'not within 40 s'} ms after B stopped (CARET_DIM_MS 30 s); before the leave caret ${beforeLeave.caret !== null}, outlines ${beforeLeave.outlines.length}, flags ${beforeLeave.flags.length}, chip ${beforeLeave.chip}; everything of B left A ${goneMs ?? 'not within 10 s'} ms after B closed (caret ${after.caret !== null}, outlines ${after.outlines.length}, flags ${after.flags.length}, chip ${after.chip})`,
    });
    expect(dimMs, "B's caret dims in A after 30 s still").not.toBeNull();
    expect(dimMs!).toBeGreaterThanOrEqual(25_000);
    expect(goneMs, "B's caret, outline, flag and chip leave A").not.toBeNull();
    expect(goneMs!, 'within 2 s of B closing its tab').toBeLessThanOrEqual(2000);
  } finally {
    await cleanUp();
  }
});

// ---------------------------------------------------------------------------------------------
// the Cloudflare phase (docs/CLOUDFLARE.md 2.3): the two instance case through one object

test(title('setup.do.two-instances'), async ({ browser }) => {
  test.setTimeout(300_000);
  test.skip(
    !TWO_ORIGINS,
    'one origin: the row needs A and B on two app instances (REALTIME_BASES or PLAYWRIGHT_SECOND_BASE_URL names the second)',
  );
  try {
    const A = await openA(browser, 'Realtime two instances');
    const { page: B } = await joinB(browser);
    const statuses = { a: await statusOf(A_BASE), b: await statusOf(B_BASE) };
    const tier = (await facts(A)).sync?.tier ?? statuses.a.tier;
    test.skip(
      tier !== 'do',
      `the tier is ${tier}, not do: the row reads one Durable Object behind two app instances`,
    );
    const one = await bodyBlock(A, B, 'rt-two-a', 'A writes', { x: 160, y: 420, w: 600, h: 140 });
    const two = await bodyBlock(A, B, 'rt-two-b', 'B writes', { x: 840, y: 420, w: 600, h: 140 });
    const wordsA = [' a1', ' a2', ' a3', ' a4', ' a5'];
    const wordsB = [' b1', ' b2', ' b3', ' b4', ' b5'];
    let lastKey = 0;
    const typing = (p: Page, run: string, words: string[], gap: number) => async () => {
      await openRun(p, run);
      for (const w of words) {
        await typeHuman(p, w);
        lastKey = Math.max(lastKey, Date.now());
        await p.waitForTimeout(gap);
      }
      await closeRun(p);
    };
    await Promise.all([typing(A, one.run, wordsA, 500)(), typing(B, two.run, wordsB, 600)()]);
    const since = lastKey;
    const converged = await expect
      .poll(
        async () => {
          const [a1, a2, b1, b2] = await Promise.all([
            blockText(A, one.slideId, 'rt-two-a'),
            blockText(A, two.slideId, 'rt-two-b'),
            blockText(B, one.slideId, 'rt-two-a'),
            blockText(B, two.slideId, 'rt-two-b'),
          ]);
          return (
            wordsA.every((w) => countIn(a1, w) === 1 && countIn(b1, w) === 1) &&
            wordsB.every((w) => countIn(a2, w) === 1 && countIn(b2, w) === 1)
          );
        },
        { timeout: 3000 },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const convergedMs = Date.now() - since;
    await Promise.all([quiet(A), quiet(B)]);
    const [fa, fb] = await Promise.all([facts(A), facts(B)]);
    const live = Math.max(fa.serverRevision, fb.serverRevision);
    const [da, db] = await Promise.all([documentOf(A), documentOf(B)]);
    const hello = {
      a: {
        seq: fa.sync?.seq ?? null,
        covered: fa.sync?.covered,
        colo: fa.sync?.room?.colo ?? fa.sync?.colo,
      },
      b: {
        seq: fb.sync?.seq ?? null,
        covered: fb.sync?.covered,
        colo: fb.sync?.room?.colo ?? fb.sync?.colo,
      },
    };
    test.info().annotations.push({
      type: 'measure',
      description: `instances ${statuses.a.instance} and ${statuses.b.instance} (${statuses.a.instance === statuses.b.instance ? 'one instance' : 'two instances'}); the object's colo ${statuses.a.colo} and ${statuses.b.colo}; every word in both ${converged ? 'within' : 'not within'} 3 s of the later last keystroke (${convergedMs} ms); revisions ${da.revision}, ${db.revision} against the live ${live}; sync.seq ${hello.a.seq} and ${hello.b.seq}, sync.covered ${hello.a.covered ?? 'absent'} and ${hello.b.covered ?? 'absent'}, sync.colo ${hello.a.colo ?? 'absent'} and ${hello.b.colo ?? 'absent'}`,
    });
    expect(statuses.a.instance, 'the two origins are two app instances').not.toBe(
      statuses.b.instance,
    );
    expect(converged, 'every word in both browsers within 3 s of the later last keystroke').toBe(
      true,
    );
    expect(da.canon, 'A and B read byte equal documents').toBe(db.canon);
    expect(da.revision, 'at the live revision').toBeGreaterThanOrEqual(live);
    expect(hello.a.seq, 'sync.seq agrees across both tabs').toBe(hello.b.seq);
    expect(
      hello.a.covered,
      'sync.covered is on describe().state.sync (R2, docs/CLOUDFLARE.md 2.3)',
    ).not.toBeUndefined();
    expect(hello.a.covered, 'sync.covered agrees across both tabs').toBe(hello.b.covered);
    expect(statuses.a.colo, "sync.status names the object's colo").not.toBe('unnamed');
    expect(statuses.b.colo, 'one object answers both origins').toBe(statuses.a.colo);
  } finally {
    await cleanUp();
  }
});

coverage(import.meta.filename, [
  'setup.do.two-instances',
  'realtime.keystroke.within-300ms',
  'realtime.caret.within-300ms',
  'realtime.caret.offset-after-merge',
  'realtime.selection.outline-within-300ms',
  'realtime.block.drag-live',
  'realtime.title.two-typers',
  'realtime.join.chip-within-1s',
  'realtime.follow.for-everyone',
  'realtime.reload.loses-nothing',
  'realtime.reconnect.loses-nothing',
  'realtime.pointer.second-browser',
  'realtime.caret.dims-and-leaves',
]);
