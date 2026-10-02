// The test harness of the Worker's rows: a ticket minted the way the function mints it (the same
// claims text, the same HMAC, through src/ticket.ts's sign helper), a socket opened through
// `SELF` with the two subprotocols and an Origin, the frames it receives, and a fake app that
// answers the seed and checkpoint routes the object calls (the global `fetch` is stubbed for the
// app origin alone; the plugin runs the Worker in the test's isolate, so the stub reaches it).
import { SELF, env } from 'cloudflare:test';
import { vi } from 'vitest';

import type { Entry, RoomEvent } from '@turboslide/realtime/channel';
import { ROOM_PROTOCOL, encodeTicket, parseDownFrame } from '@turboslide/realtime/frames';
import type { DownFrame, TicketClaims } from '@turboslide/realtime/frames';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { DeckDocument } from '@turboslide/schema/deck';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';

import { signClaims } from '../src/ticket.ts';

export const ORIGIN = env.TURBOSLIDE_APP_ORIGIN;
export const CID_A = 'a'.repeat(32);
export const CID_B = 'b'.repeat(32);
export const CID_C = 'c'.repeat(32);
export const ANON_A = 'anon_00000000-0000-4000-8000-00000000000a';
export const ANON_B = 'anon_00000000-0000-4000-8000-00000000000b';
export const SLIDE = 'content-rule';
export const BLOCK = 'p1';

export function splice(at: number, remove: number, insert: string): Mutation {
  return { op: 'text.splice', slideId: SLIDE, blockId: BLOCK, path: '/text', at, remove, insert };
}

export type MintOptions = { ttlMs?: number; secret?: string; now?: number; v?: number };

/** A ticket as the function mints it (3.3): canonical claims, HMAC-SHA256, base64url halves. */
export async function mint(
  partial: Partial<TicketClaims> & { deck: string; cid: string },
  options: MintOptions = {},
): Promise<string> {
  const now = options.now ?? Date.now();
  const claims: TicketClaims = {
    v: options.v ?? ROOM_PROTOCOL,
    id: ANON_A,
    kind: 'anonymous',
    pid: ANON_A,
    role: 'editor',
    via: 'owner',
    names: true,
    rc: true,
    label: 'Someone',
    trust: 'label',
    mark: { variant: 'initials', initials: 'S' },
    org: ORIGIN,
    iat: now,
    exp: now + (options.ttlMs ?? 600_000),
    ...partial,
  };
  const text = canonicalJson(claims);
  const mac = await signClaims(text, options.secret ?? env.TURBOSLIDE_ROOM_SECRET);
  return encodeTicket(text, mac);
}

export function bearer(): Record<string, string> {
  return {
    authorization: `Bearer ${env.TURBOSLIDE_ROOM_BEARER}`,
    'content-type': 'application/json',
  };
}

export async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return SELF.fetch(`https://rooms.test${path}`, {
    ...init,
    headers: { ...bearer(), ...(init.headers ?? {}) },
  });
}

export type Socket = {
  ws: WebSocket;
  frames: DownFrame[];
  /** the next frame matching the predicate, or the first already received and not yet taken */
  next: (pick: (frame: DownFrame) => boolean, timeoutMs?: number) => Promise<DownFrame>;
  closed: Promise<{ code: number; reason: string }>;
  send: (frame: unknown) => void;
  close: () => void;
};

/** Opens a socket through the Worker with the ticket as the second subprotocol and the Origin. */
export async function connect(
  deck: string,
  ticket: string | null,
  options: { query?: string; origin?: string | null; protocols?: string } = {},
): Promise<Socket> {
  const protocols =
    options.protocols ?? (ticket === null ? 'turboslide.v1' : `turboslide.v1, ticket.${ticket}`);
  const headers: Record<string, string> = {
    upgrade: 'websocket',
    'sec-websocket-protocol': protocols,
  };
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.origin = origin;
  const response = await SELF.fetch(`https://rooms.test/rooms/${deck}${options.query ?? ''}`, {
    headers,
  });
  if (response.status !== 101 || !response.webSocket)
    throw new Error(`upgrade answered ${response.status}`);
  const ws = response.webSocket;
  const frames: DownFrame[] = [];
  const waiters: { pick: (frame: DownFrame) => boolean; resolve: (frame: DownFrame) => void }[] =
    [];
  let resolveClosed: (value: { code: number; reason: string }) => void = () => {};
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    resolveClosed = resolve;
  });
  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    const frame = parseDownFrame(event.data);
    if (frame === null) return;
    const at = waiters.findIndex((waiter) => waiter.pick(frame));
    if (at >= 0) {
      const [waiter] = waiters.splice(at, 1);
      waiter?.resolve(frame);
      return;
    }
    frames.push(frame);
  });
  ws.addEventListener('close', (event) =>
    resolveClosed({ code: event.code, reason: event.reason }),
  );
  ws.accept();
  return {
    ws,
    frames,
    closed,
    send: (frame) => ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame)),
    close: () => ws.close(1000, 'test'),
    next: (pick, timeoutMs = 3000) =>
      new Promise<DownFrame>((resolve, reject) => {
        const at = frames.findIndex(pick);
        if (at >= 0) {
          const [frame] = frames.splice(at, 1);
          if (frame !== undefined) resolve(frame);
          return;
        }
        const waiter = { pick, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) {
            waiters.splice(i, 1);
            reject(
              new Error(
                `no frame within ${timeoutMs} ms; seen ${JSON.stringify(frames.map(kindOf))}`,
              ),
            );
          }
        }, timeoutMs);
      }),
  };
}

export function kindOf(frame: DownFrame): string {
  return frame.kind === 'event' ? `event:${frame.event.type}` : frame.kind;
}

export const isEvent =
  (type: RoomEvent['type']) =>
  (frame: DownFrame): boolean =>
    frame.kind === 'event' && frame.event.type === type;

export const isAck =
  (req: number) =>
  (frame: DownFrame): boolean =>
    frame.kind === 'ack' && frame.frame.req === req;

export function eventOf<T extends RoomEvent['type']>(
  frame: DownFrame,
  type: T,
): Extract<RoomEvent, { type: T }> {
  if (frame.kind !== 'event' || frame.event.type !== type)
    throw new Error(`expected ${type}, got ${kindOf(frame)}`);
  return frame.event as Extract<RoomEvent, { type: T }>;
}

/** An ops frame of one entry per mutation list, op ids `<cid>:<n>`. */
export function opsFrame(
  cid: string,
  req: number,
  base: number,
  from: number,
  mutationLists: Mutation[][],
) {
  return {
    t: 'ops',
    req,
    clientId: cid,
    base: { seq: base },
    entries: mutationLists.map((mutations, i) => ({
      opId: `${cid}:${from + i}`,
      kind: 'edit',
      mutations,
    })),
  };
}

export function presenceFrame(cid: string, clock: number, extra: Record<string, unknown> = {}) {
  return {
    t: 'presence',
    clientId: cid,
    clock,
    pointerOn: false,
    presenting: false,
    slideId: SLIDE,
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------------
// The fake app behind the seed and checkpoint routes

export type FakeRecord = {
  n: number;
  revision: number;
  author: Author;
  note: string;
  ops?: { fromSeq: number; toSeq: number };
  mutations: Mutation[];
  origin?: { clientId: string; opIds: string[] };
};

export type FakeApp = {
  deck: string;
  document: DeckDocument;
  revision: number;
  covered: number;
  records: FakeRecord[];
  checkpoints: { fromSeq: number; toSeq: number; entries: Entry[]; closed?: boolean }[];
  seeds: { since: number | null }[];
  /** the next checkpoint answers 409 once */
  conflictOnce: boolean;
  /** the next checkpoint answers this tier */
  tier: string;
  /** the next checkpoint fails with `failStatus` (503 unless set) this many times (the attempt is recorded first) */
  failTimes: number;
  failStatus: number;
  /** the next seed fails with `seedFailStatus` (302, a protected preview's sign in redirect, unless set) this many times */
  seedFailTimes: number;
  seedFailStatus: number;
  /** the checkpoint route answers 404 `{ gone: true }`: the deck was removed */
  gone: boolean;
  /** forgets this deck's state; the stub stays for the file so a late call of an earlier test's object meets a benign answer */
  restore: () => void;
};

const apps = new Map<string, FakeApp>();
let stubbed = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * Stubs the global fetch once per file for the app origin, routed by the deck in the path. A deck
 * no test registered (an earlier test's object posting its close checkpoint late) is answered with
 * an empty commit, never a network error.
 */
function installFakeFetch(): void {
  if (stubbed) return;
  stubbed = true;
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(`${ORIGIN}/api/decks/`)) return realFetch(input, init);
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (headers.get('authorization') !== `Bearer ${env.TURBOSLIDE_ROOM_BEARER}`)
        return json({ error: 'bearer' }, 401);
      const parsed = new URL(url);
      const match = /^\/api\/decks\/([^/]+)\/(seed|checkpoint)$/.exec(parsed.pathname);
      if (match === null) return json({ error: 'not_found' }, 404);
      const app = apps.get(decodeURIComponent(match[1] ?? ''));
      if (match[2] === 'seed') {
        if (app === undefined) return json({ error: 'not_found' }, 404);
        const since = parsed.searchParams.get('since');
        app.seeds.push({ since: since === null ? null : Number(since) });
        if (app.seedFailTimes > 0) {
          app.seedFailTimes -= 1;
          return app.seedFailStatus >= 300 && app.seedFailStatus < 400
            ? new Response(null, {
                status: app.seedFailStatus,
                headers: { location: 'https://vercel.com/sso' },
              })
            : json({ error: 'seed' }, app.seedFailStatus);
        }
        const document: DeckDocument = JSON.parse(JSON.stringify(app.document)) as DeckDocument;
        document.deck.revision = app.revision;
        return json({
          document,
          revision: app.revision,
          covered: app.covered,
          ...(since === null
            ? {}
            : { records: app.records.filter((record) => record.revision > Number(since)) }),
        });
      }
      if (app === undefined) return json({ committed: [], revision: 0, tier: 'do' });
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        fromSeq: number;
        toSeq: number;
        entries: Entry[];
        closed?: boolean;
      };
      app.checkpoints.push(body);
      if (app.gone) return json({ error: 'not_found', gone: true }, 404);
      if (app.failTimes > 0) {
        app.failTimes -= 1;
        return json({ error: 'store_busy' }, app.failStatus);
      }
      if (app.conflictOnce) {
        app.conflictOnce = false;
        return json({ conflict: true, revision: app.revision }, 409);
      }
      const committed: FakeRecord[] = [];
      const edits = body.entries.filter(
        (entry) => entry.kind === 'edit' && entry.mutations !== undefined,
      );
      if (edits.length > 0) {
        app.revision += 1;
        const mutations = edits.flatMap((entry) => entry.mutations ?? []);
        const { applyMutations } = await import('@turboslide/schema/reduce');
        app.document = applyMutations(app.document, mutations).document;
        app.document.deck.revision = app.revision;
        const record: FakeRecord = {
          n: app.records.length + 1,
          revision: app.revision,
          author: edits[edits.length - 1]?.author ?? { kind: 'agent', name: 'room' },
          note: '',
          ops: { fromSeq: body.fromSeq, toSeq: body.toSeq },
          mutations,
          origin: { clientId: edits[0]?.clientId ?? 'x', opIds: edits.map((entry) => entry.opId) },
        };
        app.records.push(record);
        committed.push(record);
        app.covered = body.toSeq;
      }
      return json({ committed, revision: app.revision, tier: app.tier });
    },
  );
}

/** The fake app of one deck: the seed and checkpoint routes over an in memory store. */
export function fakeApp(
  deck: string,
  initial: Partial<Pick<FakeApp, 'revision' | 'covered' | 'document'>> = {},
): FakeApp {
  installFakeFetch();
  const app: FakeApp = {
    deck,
    document: initial.document ?? workedDocument(),
    revision: initial.revision ?? 0,
    covered: initial.covered ?? 0,
    records: [],
    checkpoints: [],
    seeds: [],
    conflictOnce: false,
    tier: 'do',
    failTimes: 0,
    failStatus: 503,
    seedFailTimes: 0,
    seedFailStatus: 302,
    gone: false,
    restore: () => {
      apps.delete(deck);
    },
  };
  app.document.deck.revision = app.revision;
  apps.set(deck, app);
  return app;
}

export function uniqueDeck(prefix = 'deck'): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
