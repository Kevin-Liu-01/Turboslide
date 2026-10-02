// The deck's Durable Object (docs/CLOUDFLARE.md 3.1 to 3.5, 3.6.2 `src/deck-room.ts`): one object
// per deck by `idFromName(deckId)`, the order of the deck. It admits every ops frame in arrival
// order through the pure admission of @turboslide/realtime/room-core (the base window, the
// transform past what landed since the base, the reducer and the validator, the undo of a refused
// sibling, the dedupe by `(client_id, op_id)` through the month tables' unique index), writes the
// entry to SQLite before it acknowledges (one writer, one INSERT, no compare and no retry loop),
// fans it out to every socket the reader's role may see, keeps the live document in memory and in
// `doc` rows, holds the roster in memory and in each socket's attachment, and on its one alarm
// posts the uncommitted entries to the app's checkpoint route under the bearer (2 s idle, 10 s at
// most, the Worker's two variables). No `setTimeout` or `setInterval` anywhere: a standing timer
// keeps the object awake and is the most expensive line one can write (W1 finding 4); the
// heartbeat is the runtime's auto response pair, the deadlines (the join window, the ticket grace,
// the reauth grace, the liveness sweep) ride the same alarm, and the constructor does the minimum
// on a wake (two `CREATE TABLE IF NOT EXISTS`, the one `meta` row, the roster from
// `getWebSockets()`). The router (index.ts) verifies every ticket and bearer before anything
// reaches here and hands the claims in a header; the object trusts them.
import { DurableObject } from 'cloudflare:workers';

import { CAPS, checkBaseWindow, replayPlan } from '@turboslide/realtime/admission';
import type { Entry, NewEntry, RoomEvent, RosterEntry } from '@turboslide/realtime/channel';
import {
  CLOSE_CODES,
  HEARTBEAT_REQUEST,
  HEARTBEAT_RESPONSE,
  JOIN_WINDOW_MS,
  REAUTH_GRACE_MS,
  ROOM_PROTOCOL,
  TICKET_GRACE_MS,
  ackOf,
  parseUpFrame,
  roomAccessChangedSchema,
  roomExternalBodySchema,
  roomPublishBodySchema,
  roomWriteBodySchema,
  viewerFactsOfClaims,
} from '@turboslide/realtime/frames';
import type { AckFrame, AckRejected, RoomFrame, TicketClaims } from '@turboslide/realtime/frames';
import {
  LIVE_POINTERS_MAX,
  OPS_POST_MAX_BYTES,
  PRESENCE_EXPIRY_MS,
  PRESENCE_PER_SECOND,
  REPLAY_MAX_BYTES,
  REPLAY_MAX_ENTRIES,
  opsPostSchema,
  presencePostSchema,
} from '@turboslide/realtime/protocol';
import type { OpsPost, PresencePost } from '@turboslide/realtime/protocol';
import {
  betweenEntries,
  editingCount,
  filterEventForReader,
  grantHueSlot,
  landCandidate,
  landedOf,
  landedOwn,
  overEditingCeiling,
  rosterEntryForReader,
  touchedSlides,
  transformEntry,
  undoOfSplices,
} from '@turboslide/realtime/room-core';
import type { ReaderDeps, Rejected, ViewerFacts } from '@turboslide/realtime/room-core';
import { hueFor } from '@turboslide/identity/hues';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';

import { noteClosed, noteOpen } from './control.ts';
import {
  DOC_DDL,
  ENTRY_COLUMNS,
  META_DDL,
  Sql,
  addCounters,
  chunkBody,
  countersOf,
  docRowsOf,
  documentOfRows,
  entriesDdl,
  entriesTable,
  entryOfRow,
  metaOfRow,
  monthOf,
  rowOfEntry,
  zeroCounters,
} from './sql.ts';
import type { Counters, EntryRow, Meta, MetaRow } from './sql.ts';
import { verifyTicket } from './ticket.ts';

/** The headers the router stamps on what it forwards (index.ts). */
export const CLAIMS_HEADER = 'x-turboslide-claims';
export const ORIGIN_HEADER = 'x-turboslide-origin';
export const ADDRESS_HEADER = 'x-turboslide-address';
export const COLO_HEADER = 'x-turboslide-colo';
export const REALTIME_HEADER = 'x-turboslide-realtime';
export const JOIN_HEADER = 'x-turboslide-join';

/** The checkpoint route's deadline (3.6.2: every outbound fetch carries one). */
export const CHECKPOINT_TIMEOUT_MS = 25_000;
/** The seed route's deadline. */
export const SEED_TIMEOUT_MS = 25_000;
/** The entries one checkpoint run posts at most (checkpoint.ts's triggers, read as a page). */
export const CHECKPOINT_MAX_ENTRIES = 2000;
export const CHECKPOINT_MAX_BYTES = 1024 * 1024;
/** The entries kept behind `covered` before a month table may be dropped (checkpoint.ts STREAM_RETAIN_ENTRIES). */
export const RETAIN_ENTRIES = 10_000;
/** The wait a capped socket's close reason names. */
export const CAP_RETRY_AFTER_S = 5;
/** The address cap, as `CAPS.streams.ip`. */
const ADDRESS_CAP = CAPS.streams.ip;
/** The `doc` rows are rewritten once this many entries sit above the seq they reflect (the rows written line of 2.2). */
export const DOC_REFRESH_ENTRIES = 200;
/** A deadline further away than this does not arm the alarm on its own: the next message or alarm sweeps it (one row written saved per checkpoint). */
export const SWEEP_ALARM_WINDOW_MS = 60_000;

type Member = {
  cid: string;
  ws: WebSocket | null;
  claims: TicketClaims | null;
  /** the roster entry once the tab posted its presence */
  entry: RosterEntry | null;
  tab: string | undefined;
  address: string | null;
  /** the upgrade's `Origin` as the router stamped it, for the join frame's check (3.3) */
  origin: string | null;
  joinedAt: number;
  lastMessageAt: number;
  /** a reauth was sent at this time and no fresh ticket has arrived */
  reauthAt: number | null;
  /** a socket without a ticket must send `join` by this time */
  joinBy: number | null;
  /** the presence budget's fixed window */
  presenceWindow: { second: number; count: number };
};

/** What a socket's attachment holds through hibernation (3.3; at most 16,384 bytes). */
type Attachment = {
  cid: string;
  claims: TicketClaims | null;
  tab?: string;
  address: string | null;
  origin?: string | null;
  joinedAt: number;
  slideId?: string;
  hueSlot?: number;
  joinBy?: number | null;
};

type Live = { document: DeckDocument; seq: number };

type CheckpointAnswer =
  | { committed: VersionRecordLike[]; revision: number; tier: string }
  | { conflict: true; revision: number };

type VersionRecordLike = {
  n?: number;
  revision: number;
  author: Author;
  note: string;
  snapshot?: string;
  ops?: { fromSeq: number; toSeq: number };
  mutations?: Mutation[];
  origin?: { clientId: string; opIds: string[] };
};

type SeedAnswer = {
  document?: DeckDocument;
  snapshotUrl?: string;
  revision: number;
  covered: number;
  records?: VersionRecordLike[];
};

const ROLE_RANK = { viewer: 0, commenter: 1, editor: 2, owner: 3 } as const;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function applyEntries(document: DeckDocument, entries: readonly Entry[]): DeckDocument {
  let next = document;
  for (const entry of entries) {
    if (entry.kind !== 'edit' || entry.mutations === undefined) continue;
    next = applyMutations(next, entry.mutations, { now: entry.at }).document;
  }
  return next;
}

function parseClaims(header: string | null): TicketClaims | null {
  if (header === null) return null;
  try {
    return JSON.parse(header) as TicketClaims;
  } catch {
    return null;
  }
}

/** The author an entry carries from the ticket's facts (room.ts `authorOf`'s shape). */
function authorOfClaims(claims: TicketClaims): Author {
  const principalId = claims.pid ?? claims.id;
  if (claims.kind === 'agent') return { kind: 'agent', name: claims.label, principalId };
  return { kind: 'human', name: claims.label, principalId };
}

function parseIntVar(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export class DeckRoom extends DurableObject<Env> {
  private readonly db: Sql;
  private readonly counters: Counters;
  private persisted: Counters = zeroCounters();
  private meta: Meta | null;
  private live: Live | null = null;
  /** the roster and the sockets, by client id */
  private readonly members = new Map<string, Member>();
  private readonly byWs = new Map<WebSocket, string>();
  /** fixed window budgets as keys.ts shapes them (`admitOps`) */
  private readonly budgets = new Map<string, { count: number; resetAt: number }>();
  private alarmAt: number | null = null;
  private readonly alarmRead: Promise<void>;
  private checkpointing: Promise<void> | null = null;
  private seeding: Promise<void> | null = null;
  private lastEntryAt = 0;
  private editedSinceOpen = false;
  private readonly awakeSince = Date.now();
  private colo = '';
  private deckId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.counters = zeroCounters();
    this.db = new Sql(ctx.storage.sql, this.counters);
    // the minimum on a wake (3.4 item 7): the two tables, the one meta row, the roster
    this.db.run(META_DDL);
    this.db.run(DOC_DDL);
    const rows = this.db.exec<MetaRow>('SELECT * FROM meta WHERE id = 1');
    const row = rows[0];
    this.meta = row === undefined ? null : metaOfRow(row);
    if (row !== undefined) this.persisted = countersOf(row.counters);
    this.counters.wakes = 1;
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(HEARTBEAT_REQUEST, HEARTBEAT_RESPONSE),
    );
    for (const ws of ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment | null;
      if (attachment === null || typeof attachment.cid !== 'string') {
        try {
          ws.close(CLOSE_CODES.ticket, 'no attachment');
        } catch {
          // closed already
        }
        continue;
      }
      const member: Member = {
        cid: attachment.cid,
        ws,
        claims: attachment.claims,
        entry: null,
        tab: attachment.tab,
        address: attachment.address,
        origin: attachment.origin ?? null,
        joinedAt: attachment.joinedAt,
        lastMessageAt: ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? attachment.joinedAt,
        reauthAt: null,
        joinBy: attachment.joinBy ?? null,
        presenceWindow: { second: 0, count: 0 },
      };
      this.members.set(member.cid, member);
      this.byWs.set(ws, member.cid);
    }
    this.alarmRead = ctx.storage.getAlarm().then(
      (at) => {
        this.alarmAt = at;
      },
      () => undefined,
    );
    // a woken object asks every socket for its presence again, so the roster is whole within one
    // frame (3.3); the sockets rebuilt above have a claim and no entry yet
    if (this.members.size > 0) this.broadcastRaw(JSON.stringify({ type: 'resend' }));
  }

  // -------------------------------------------------------------------------------------------
  // The handlers

  override async fetch(request: Request): Promise<Response> {
    this.counters.requests += 1;
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    // /rooms/<id>/<tail>
    const deckId = parts[1] === undefined ? null : decodeURIComponent(parts[1]);
    const tail = parts[2] ?? '';
    if (deckId === null) return json({ error: 'not_found' }, 404);
    this.deckId = deckId;
    this.colo = request.headers.get(COLO_HEADER) ?? this.colo;
    try {
      if (request.headers.get(REALTIME_HEADER) === 'off') {
        await this.handOff();
        if (request.headers.get('upgrade')?.toLowerCase() === 'websocket')
          return this.refuseUpgrade(CLOSE_CODES.tier, 'realtime off');
        return json({ error: 'tier', tier: 'off' }, 503, { 'retry-after': '30' });
      }
      if (request.headers.get('upgrade')?.toLowerCase() === 'websocket')
        return this.upgrade(request, url);
      switch (tail) {
        case 'ops':
          return this.httpOps(request);
        case 'presence':
          return this.httpPresence(request, url);
        case 'write':
          return this.httpWrite(request);
        case 'flush':
          return this.httpFlush();
        case 'external':
          return this.httpExternal(request);
        case 'publish':
          return this.httpPublish(request);
        case 'roster':
          return json({ clients: this.rosterEntries() });
        case 'document':
          return this.httpDocument();
        case 'counters':
          return this.httpCounters(url);
        case 'access-changed':
          return this.httpAccessChanged(request);
        default:
          return json({ error: 'not_found' }, 404);
      }
    } catch (error) {
      this.log('error', 'request failed', {
        tail,
        error: error instanceof Error ? error.message : String(error),
      });
      return json(
        { error: 'object', message: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.counters.messages += 1;
    const now = Date.now();
    const member = this.memberOf(ws);
    if (member === undefined) {
      this.closeWs(ws, CLOSE_CODES.ticket, 'unknown socket');
      return;
    }
    member.lastMessageAt = now;
    if (typeof message !== 'string') return;
    this.sweep(now);
    const frame = parseUpFrame(message);
    if (frame === null) return;
    try {
      switch (frame.t) {
        case 'join':
          await this.handleJoin(member, frame.ticket, now);
          return;
        case 'ticket':
          await this.handleTicket(member, frame.ticket, now);
          return;
        default:
          break;
      }
      if (member.claims === null) {
        this.closeMember(member, CLOSE_CODES.ticket, 'no ticket');
        return;
      }
      switch (frame.t) {
        case 'ops': {
          this.counters.opsFrames += 1;
          const { t: _t, req, ...post } = frame;
          const answer = await this.admit(member.claims, post, message.length, now);
          this.send(member, ackOf(req, answer));
          return;
        }
        case 'presence': {
          this.counters.presenceFrames += 1;
          const { t: _t, ...state } = frame;
          const refused = this.presence(member, state, now);
          if (refused !== null) this.send(member, presenceRefusal(refused));
          return;
        }
        case 'leave':
          this.leave(member, true);
          return;
      }
    } catch (error) {
      this.log('error', 'message failed', {
        t: frame.t,
        error: error instanceof Error ? error.message : String(error),
      });
      if (frame.t === 'ops') {
        this.send(
          member,
          ackOf(frame.req, {
            ok: false,
            status: 500,
            code: 'object',
            message: 'The room could not admit the change; retry',
          }),
        );
      }
    }
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    // the server's half of the close handshake (the hibernation example calls `ws.close()` here):
    // without it the browser's close event waits on the runtime
    this.closeWs(ws, code === 1005 || code === 1006 ? 1000 : code, 'closed');
    const member = this.memberOf(ws);
    this.byWs.delete(ws);
    if (member === undefined) return;
    await this.dropMember(member, 'close');
  }

  override async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const member = this.memberOf(ws);
    this.byWs.delete(ws);
    if (member === undefined) return;
    await this.dropMember(member, 'error');
  }

  override async alarm(): Promise<void> {
    this.counters.alarms += 1;
    this.alarmAt = null;
    const now = Date.now();
    this.sweep(now);
    await this.alarmRead;
    const meta = this.meta;
    if (meta !== null && meta.head > meta.covered) {
      const idle = this.idleMs();
      const max = this.maxMs();
      const first = meta.firstUncommittedAt ?? this.lastEntryAt;
      const dueByIdle = this.lastEntryAt + idle;
      const dueByMax = first + max;
      if (now + 50 < dueByIdle && now + 50 < dueByMax) {
        await this.armAlarm(Math.min(dueByIdle, dueByMax));
      } else {
        await this.checkpoint(false);
      }
    }
    await this.armSweeps(now);
  }

  // -------------------------------------------------------------------------------------------
  // The upgrade (3.2 "A join", 3.3)

  private async upgrade(request: Request, url: URL): Promise<Response> {
    const claims = parseClaims(request.headers.get(CLAIMS_HEADER));
    const joining = request.headers.get(JOIN_HEADER) === '1';
    if (claims === null && !joining) return this.refuseUpgrade(CLOSE_CODES.ticket, 'no claims');
    const now = Date.now();
    const address = request.headers.get(ADDRESS_HEADER);
    const origin = request.headers.get(ORIGIN_HEADER);
    const tab = tabOf(url.searchParams.get('tab'));
    const since = Number(url.searchParams.get('since') ?? NaN);
    const retire = (url.searchParams.get('retire') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^[0-9a-f]{32}$/.test(id))
      .slice(0, 8);
    // the hello needs head, revision and covered: an object with no meta row reads the seed
    // route before its first hello (3.4 item 7); one with a meta row answers from it
    if (this.meta === null) {
      try {
        await this.seed();
      } catch (error) {
        this.log('error', 'seed before hello failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return this.refuseUpgrade(CLOSE_CODES.error, 'seed failed');
      }
    }
    const meta = this.meta;
    if (meta === null) return this.refuseUpgrade(CLOSE_CODES.error, 'no meta');
    const cid = claims?.cid ?? `join:${crypto.randomUUID().replace(/-/g, '')}`;
    // the tab's earlier sockets go first (4409), then the ids it names, then an older socket of
    // the same client id (3.3)
    if (tab !== undefined) {
      for (const member of [...this.members.values()]) {
        if (member.tab === tab && member.cid !== cid)
          this.closeMember(member, CLOSE_CODES.superseded, 'tab reopened');
      }
    }
    if (claims !== null) {
      for (const id of retire) {
        const member = this.members.get(id);
        if (member !== undefined && member.claims?.id === claims.id)
          this.closeMember(member, CLOSE_CODES.superseded, 'retired');
      }
    }
    const older = this.members.get(cid);
    if (older !== undefined) this.closeMember(older, CLOSE_CODES.superseded, 'newer socket');
    // the caps of CAPS.streams per identity and per address, over the open sockets (3.3)
    if (claims !== null) {
      let same = 0;
      for (const member of this.members.values())
        if (member.ws !== null && member.claims?.id === claims.id) same += 1;
      if (same >= CAPS.streams[claims.kind])
        return this.refuseUpgrade(CLOSE_CODES.capped, `retry-after: ${CAP_RETRY_AFTER_S}`);
    }
    if (address !== null) {
      let same = 0;
      for (const member of this.members.values())
        if (member.ws !== null && member.address === address) same += 1;
      if (same >= ADDRESS_CAP)
        return this.refuseUpgrade(CLOSE_CODES.capped, `retry-after: ${CAP_RETRY_AFTER_S}`);
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const tags = [`cid:${cid}`];
    if (tab !== undefined) tags.push(`tab:${tab}`);
    this.ctx.acceptWebSocket(server, tags);
    const member: Member = {
      cid,
      ws: server,
      claims,
      entry: null,
      tab,
      address,
      origin,
      joinedAt: now,
      lastMessageAt: now,
      reauthAt: null,
      joinBy: claims === null ? now + JOIN_WINDOW_MS : null,
      presenceWindow: { second: 0, count: 0 },
    };
    this.members.set(cid, member);
    this.byWs.set(server, cid);
    this.writeAttachment(member);
    const first = this.members.size === 1;
    if (first) this.ctx.waitUntil(this.noteOpenRow(now));
    if (claims !== null) {
      // one handler, no await between the cursor and the frames (3.4 item 5): hello, the
      // replay, the room frame; the joiner's own presence frame follows its first post
      this.sayHello(member, claims, Number.isFinite(since) ? since : meta.head);
    } else {
      await this.armSweeps(now);
    }
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'sec-websocket-protocol': 'turboslide.v1' },
    });
  }

  /** The refusal of an upgrade with a close code the browser reads (3.6.3): accept, close, 101. */
  private refuseUpgrade(code: number, reason: string): Response {
    this.counters.upgradesRefused += 1;
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    server.close(code, reason);
    return new Response(null, { status: 101, webSocket: client });
  }

  private sayHello(member: Member, claims: TicketClaims, since: number): void {
    const meta = this.meta;
    if (meta === null) return;
    const roster = this.rosterEntries();
    const reader = viewerFactsOfClaims(claims) as ViewerFacts;
    const deps = this.readerDeps();
    const hello: RoomEvent = {
      type: 'hello',
      seq: meta.head,
      revision: meta.revision,
      clientId: member.cid,
      role: overEditingCeiling(roster, claims.role) ? 'viewer' : claims.role,
      clients: roster.map((entry) => rosterEntryForReader(entry, reader, deps)),
      editing: editingCount(roster),
      tier: 'do',
      covered: Math.max(0, Math.min(meta.head, meta.covered)),
    };
    this.send(member, hello);
    const room: RoomFrame = {
      t: 'room',
      colo: this.colo.slice(0, 16),
      object: this.ctx.id.toString().slice(0, 8),
      idleMs: this.idleMs(),
      maxMs: this.maxMs(),
    };
    this.send(member, room);
    this.send(member, this.replayFor(since, reader, deps));
  }

  /** The replay a socket open sends first (3.4 item 5; room.ts `replayFor`): `(since, head]` paged, or `resync`. */
  private replayFor(since: number, reader: ViewerFacts, deps: ReaderDeps): RoomEvent {
    const meta = this.meta;
    if (meta === null) return { type: 'resync', revision: 0 };
    const plan = replayPlan(since, meta.head);
    if (plan.kind === 'resync') return { type: 'resync', revision: meta.revision };
    const entries: Entry[] = [];
    let bytes = 0;
    let from = plan.from;
    while (from < meta.head && entries.length < REPLAY_MAX_ENTRIES && bytes < REPLAY_MAX_BYTES) {
      const page = this.entriesAbove(from, Math.min(256, REPLAY_MAX_ENTRIES - entries.length));
      if (page.length === 0) break;
      const first = page[0];
      // a since the log does not hold (the partition dropped behind it, a position from another
      // tier): the tab reloads at the head once, never a replay with a gap
      if (first !== undefined && first.seq !== from + 1)
        return { type: 'resync', revision: meta.revision };
      for (const entry of page) {
        bytes += JSON.stringify(entry).length;
        entries.push(entry);
        from = entry.seq;
      }
    }
    return (
      filterEventForReader({ type: 'ops', entries }, reader, deps) ?? { type: 'ops', entries: [] }
    );
  }

  private async handleJoin(member: Member, ticket: string, now: number): Promise<void> {
    if (member.claims !== null) return;
    const deckId = this.deckId ?? '';
    // the join frame carries no Origin of its own: the router's stamp on the upgrade is the
    // request's and the claim must match it (3.3); a stamp of `null` is an upgrade with no
    // Origin header, which the cross site rule refuses
    if (member.origin === null) {
      this.closeMember(member, CLOSE_CODES.forbidden, 'join refused: no origin');
      return;
    }
    const verdict = await verifyTicket(ticket, this.env.TURBOSLIDE_ROOM_SECRET, {
      deck: deckId,
      origin: member.origin,
      now,
      protocol: this.protocol(),
    });
    if (!verdict.ok) {
      this.closeMember(member, CLOSE_CODES.ticket, `join refused: ${verdict.reason}`);
      return;
    }
    const older = this.members.get(verdict.claims.cid);
    if (older !== undefined && older !== member)
      this.closeMember(older, CLOSE_CODES.superseded, 'newer socket');
    this.members.delete(member.cid);
    member.cid = verdict.claims.cid;
    member.claims = verdict.claims;
    member.joinBy = null;
    this.members.set(member.cid, member);
    if (member.ws !== null) this.byWs.set(member.ws, member.cid);
    this.writeAttachment(member);
    if (this.meta === null) await this.seed();
    this.sayHello(member, verdict.claims, this.meta?.head ?? 0);
  }

  private async handleTicket(member: Member, ticket: string, now: number): Promise<void> {
    const deckId = this.deckId ?? '';
    const verdict = await verifyTicket(ticket, this.env.TURBOSLIDE_ROOM_SECRET, {
      deck: deckId,
      origin: member.claims?.org ?? null,
      now,
      protocol: this.protocol(),
    });
    if (!verdict.ok) {
      this.closeMember(member, CLOSE_CODES.ticket, `ticket refused: ${verdict.reason}`);
      return;
    }
    if (member.claims !== null && verdict.claims.cid !== member.claims.cid) {
      this.closeMember(member, CLOSE_CODES.ticket, 'ticket names another client');
      return;
    }
    // a role that fell below what the socket received closes it; the tab reopens with the new
    // role's hello (3.3)
    if (member.claims !== null && ROLE_RANK[verdict.claims.role] < ROLE_RANK[member.claims.role]) {
      this.closeMember(member, CLOSE_CODES.forbidden, 'role changed');
      return;
    }
    member.claims = verdict.claims;
    member.reauthAt = null;
    if (member.entry !== null)
      member.entry = {
        ...member.entry,
        role: verdict.claims.role,
        label: verdict.claims.label,
        trust: verdict.claims.trust,
      };
    this.writeAttachment(member);
  }

  // -------------------------------------------------------------------------------------------
  // The admission (3.3, 3.4)

  private async admit(
    claims: TicketClaims,
    post: OpsPost,
    bytes: number,
    now: number,
  ): Promise<Parameters<typeof ackOf>[1]> {
    if (bytes > OPS_POST_MAX_BYTES)
      return {
        ok: false,
        status: 400,
        code: 'too-large',
        message: `An ops post is at most ${OPS_POST_MAX_BYTES} bytes`,
      };
    if (post.clientId !== claims.cid)
      return {
        ok: false,
        status: 403,
        code: 'client_unbound',
        message: 'The client id is not this ticket’s',
      };
    const hasEdits = post.entries.some((entry) => entry.kind === 'edit');
    const hasComments = post.entries.some((entry) => entry.kind === 'comment');
    const canEdit = claims.role === 'owner' || claims.role === 'editor';
    const canComment = canEdit || claims.role === 'commenter';
    if ((hasEdits && !canEdit) || (hasComments && !canComment))
      return { ok: false, status: 403, code: 'forbidden', message: 'This role may not write here' };
    const over = this.budget(claims, post, bytes, now);
    if (over !== null)
      return {
        ok: false,
        status: 429,
        code: 'rate_limited',
        message: 'Too many operations; slow down',
        retryAfterMs: over,
      };
    await this.ensureLive();
    const meta = this.meta;
    const live = this.live;
    if (meta === null || live === null)
      return {
        ok: false,
        status: 503,
        code: 'store_busy',
        message: 'The room has no document yet; retry',
        retryAfterMs: 1000,
      };
    const head = meta.head;
    const windowCheck = checkBaseWindow(post.base.seq, head);
    if (!windowCheck.ok)
      return {
        ok: false,
        status: 409,
        code: 'resync',
        message: `base.seq ${post.base.seq} is more than the window behind the head ${head}`,
        head,
      };
    const landed =
      post.base.seq < head ? this.entriesAbove(post.base.seq, head - post.base.seq) : [];
    const landedMutations = landedOf(landed, post);
    const canReadSlide = (slideId: string): boolean => {
      const slide = live.document.slides[slideId];
      if (slide === undefined) return true;
      return canEdit || slide.skip !== true;
    };
    const stamp = new Date(now).toISOString();
    const replayed: Entry[] = [];
    const rejected: Rejected[] = [];
    const candidates: NewEntry[] = [];
    let running = live.document;
    const author = authorOfClaims(claims);
    for (const entry of post.entries) {
      // a retried POST carries the op ids of the first one: an id already in the log is answered
      // with its entry and never appended twice (3.4 item 4, the unique index)
      const already = this.findEntry(post.clientId, entry.opId);
      if (already !== undefined) {
        replayed.push(already);
        continue;
      }
      if (entry.kind === 'comment') {
        if (entry.comment === undefined) continue;
        candidates.push({
          rev: meta.revision,
          kind: 'comment',
          author,
          clientId: post.clientId,
          opId: entry.opId,
          comment: entry.comment,
          at: stamp,
        });
        continue;
      }
      const transformed = transformEntry(entry.mutations ?? [], landedMutations);
      if (transformed === null) {
        rejected.push({ opId: entry.opId, reason: 'stale' });
        continue;
      }
      const placed = landCandidate(
        running,
        { opId: entry.opId, kind: 'edit', mutations: transformed },
        canReadSlide,
      );
      if (!placed.ok) {
        rejected.push(placed.rejected);
        landedMutations.push(...landedOwn(undoOfSplices(transformed)));
        continue;
      }
      running = placed.document;
      candidates.push({
        rev: meta.revision,
        kind: 'edit',
        author,
        clientId: post.clientId,
        opId: entry.opId,
        mutations: placed.mutations,
        at: stamp,
        ...(entry.note === undefined ? {} : { note: entry.note }),
      });
    }
    if (candidates.length === 0) {
      return {
        ok: true,
        entries: replayed,
        rejected: rejected as AckRejected[],
        head,
        revision: meta.revision,
      };
    }
    // one INSERT per entry in one synchronous block, the head moved with them (3.4 item 2)
    const admitted = this.insertEntries(candidates, now);
    this.live = { document: running, seq: meta.head };
    this.editedSinceOpen = true;
    for (const entry of admitted) this.broadcast({ type: 'op', entry });
    await this.afterAppend(now);
    const entries = [...replayed, ...admitted].sort((a, b) => a.seq - b.seq);
    const between = betweenEntries(
      landed,
      post.base.seq,
      entries[0]?.seq ?? Number.POSITIVE_INFINITY,
    );
    return {
      ok: true,
      entries,
      rejected: rejected as AckRejected[],
      head: meta.head,
      revision: meta.revision,
      ...(between === undefined ? {} : { between }),
    };
  }

  /** The budgets of `admitOps` as in memory fixed windows; the wait in ms when one is over, else null. */
  private budget(claims: TicketClaims, post: OpsPost, bytes: number, now: number): number | null {
    const second = Math.floor(now / 1000);
    const minute = Math.floor(now / 60_000);
    const checks: [string, number, number, number][] = [
      [`c:${post.clientId}:ops:${second}`, post.entries.length, CAPS.opsPerSecondPerClient, 1000],
      [`q:${claims.id}:ops:${minute}`, post.entries.length, CAPS.opsPerMinute[claims.kind], 60_000],
      [`q:${claims.id}:bytes:${minute}`, bytes, CAPS.bytesPerMinute[claims.kind], 60_000],
      [`d:bytes:${minute}`, bytes, CAPS.deckBytesPerMinute, 60_000],
    ];
    for (const [key, cost, limit, windowMs] of checks) {
      let row = this.budgets.get(key);
      if (row === undefined || row.resetAt <= now) {
        row = { count: 0, resetAt: now + windowMs };
        this.budgets.set(key, row);
      }
      row.count += cost;
      if (row.count > limit) return Math.max(1, row.resetAt - now);
    }
    if (this.budgets.size > 512)
      for (const [key, row] of this.budgets) if (row.resetAt <= now) this.budgets.delete(key);
    return null;
  }

  /** Inserts candidates at head + 1.. in one synchronous transaction and moves the meta row; answers the entries with their seqs. */
  private insertEntries(candidates: readonly NewEntry[], now: number): Entry[] {
    const meta = this.meta;
    if (meta === null) throw new Error('no meta');
    const month = monthOf(now);
    const table = entriesTable(month);
    const admitted: Entry[] = [];
    this.ctx.storage.transactionSync(() => {
      if (!meta.months.includes(month)) {
        for (const ddl of entriesDdl(table)) this.db.run(ddl);
        meta.months = [...meta.months, month].sort();
      }
      for (const candidate of candidates) {
        meta.head += 1;
        const entry: Entry = { ...candidate, seq: meta.head };
        this.db.run(
          `INSERT INTO ${table} (${ENTRY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ...rowOfEntry(entry),
        );
        admitted.push(entry);
      }
      if (meta.firstUncommittedAt === null) meta.firstUncommittedAt = now;
      this.writeMeta();
    });
    this.lastEntryAt = now;
    return admitted;
  }

  /** After an append: the alarm at `now + idle`, never later than `first + max` (3.4 item 8). */
  private async afterAppend(now: number): Promise<void> {
    const meta = this.meta;
    if (meta === null) return;
    const first = meta.firstUncommittedAt ?? now;
    await this.armAlarm(Math.min(now + this.idleMs(), first + this.maxMs()));
  }

  // -------------------------------------------------------------------------------------------
  // Presence (3.2, 3.3)

  private presence(
    member: Member,
    state: PresencePost,
    now: number,
  ): 'budget' | 'invalid' | 'clock' | null {
    const claims = member.claims;
    if (claims === null) return 'invalid';
    if (state.clientId !== claims.cid) return 'invalid';
    const second = Math.floor(now / 1000);
    if (member.presenceWindow.second !== second) member.presenceWindow = { second, count: 0 };
    member.presenceWindow.count += 1;
    if (member.presenceWindow.count > PRESENCE_PER_SECOND) return 'budget';
    if (member.entry !== null && member.entry.clock > state.clock) return 'clock';
    const roster = this.rosterEntries();
    const entry = this.rosterEntryOf(claims, state, roster, member.entry);
    const slideChanged = member.entry?.slideId !== entry.slideId || member.entry === null;
    member.entry = entry;
    // the attachment is rewritten on a slide change alone, not per frame (3.3)
    if (slideChanged) this.writeAttachment(member);
    this.broadcast({
      type: 'presence',
      clientId: entry.clientId,
      clock: entry.clock,
      state: entry,
    });
    return null;
  }

  /** The roster entry of a tab from its ticket and its state (room.ts `rosterEntryFor` over the claims). */
  private rosterEntryOf(
    claims: TicketClaims,
    state: PresencePost,
    existing: readonly RosterEntry[],
    previous: RosterEntry | null,
  ): RosterEntry {
    const principalId = claims.pid ?? claims.id;
    const slot =
      previous === null
        ? grantHueSlot(principalId, existing)
        : ((previous.hueSlot + 1) as 1 | 2 | 3 | 4 | 5 | 6);
    const canEdit = claims.role === 'owner' || claims.role === 'editor';
    const joinOrder = existing.findIndex((row) => row.clientId === state.clientId);
    const amongFirst =
      joinOrder < 0 ? existing.length < LIVE_POINTERS_MAX : joinOrder < LIVE_POINTERS_MAX;
    const { pointer, drag, ...rest } = state;
    const mark = { ...claims.mark, hue: { slot, hex: hueFor(slot) } };
    return {
      ...rest,
      ...(pointer !== undefined && canEdit && amongFirst && state.pointerOn ? { pointer } : {}),
      ...(drag !== undefined && canEdit && amongFirst ? { drag } : {}),
      principalId,
      label: claims.label,
      trust: claims.trust,
      mark,
      hueSlot: slot - 1,
      kind: claims.kind === 'agent' ? 'agent' : 'human',
      role: claims.role,
    } as RosterEntry;
  }

  private rosterEntries(): RosterEntry[] {
    const out: RosterEntry[] = [];
    for (const member of this.members.values()) if (member.entry !== null) out.push(member.entry);
    return out;
  }

  /** The reader projection's host facts in the object: each member's own ticket `email` claim (3.3). */
  private readerDeps(): ReaderDeps {
    return {
      rememberedEmail: (principalId) => {
        for (const member of this.members.values()) {
          const claims = member.claims;
          if (
            claims !== null &&
            (claims.pid ?? claims.id) === principalId &&
            claims.trust === 'verified'
          )
            return claims.email;
        }
        return undefined;
      },
    };
  }

  private leave(member: Member, announce: boolean): void {
    const had = member.entry !== null;
    member.entry = null;
    if (had && announce) this.broadcast({ type: 'leave', clientId: member.cid });
  }

  // -------------------------------------------------------------------------------------------
  // The fan out (3.4 item 6)

  private broadcast(event: RoomEvent): void {
    const deps = this.readerDeps();
    for (const member of this.members.values()) {
      if (member.ws === null || member.claims === null) continue;
      const filtered = filterEventForReader(
        event,
        viewerFactsOfClaims(member.claims) as ViewerFacts,
        deps,
      );
      if (filtered === null) continue;
      this.sendRaw(member.ws, JSON.stringify(filtered));
    }
  }

  private broadcastRaw(text: string): void {
    for (const member of this.members.values())
      if (member.ws !== null) this.sendRaw(member.ws, text);
  }

  private send(
    member: Member,
    frame: RoomEvent | AckFrame | RoomFrame | { t: string; [k: string]: unknown },
  ): void {
    if (member.ws === null) return;
    this.sendRaw(member.ws, JSON.stringify(frame));
  }

  private sendRaw(ws: WebSocket, text: string): void {
    try {
      ws.send(text);
    } catch {
      // a socket the runtime closed under us; its close event follows
    }
  }

  // -------------------------------------------------------------------------------------------
  // Members and sockets

  private memberOf(ws: WebSocket): Member | undefined {
    const cid = this.byWs.get(ws);
    return cid === undefined ? undefined : this.members.get(cid);
  }

  private writeAttachment(member: Member): void {
    if (member.ws === null) return;
    const attachment: Attachment = {
      cid: member.cid,
      claims: member.claims,
      ...(member.tab === undefined ? {} : { tab: member.tab }),
      address: member.address,
      origin: member.origin,
      joinedAt: member.joinedAt,
      ...(member.entry?.slideId === undefined ? {} : { slideId: member.entry.slideId }),
      ...(member.entry === null ? {} : { hueSlot: member.entry.hueSlot }),
      joinBy: member.joinBy,
    };
    try {
      member.ws.serializeAttachment(attachment);
    } catch (error) {
      this.log('error', 'attachment not written', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private closeWs(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason.slice(0, 120));
    } catch {
      // closed already
    }
  }

  /** Closes a member's socket with a code; the roster row leaves at once and the close event finds nothing. */
  private closeMember(member: Member, code: number, reason: string): void {
    const ws = member.ws;
    member.ws = null;
    if (ws !== null) {
      this.byWs.delete(ws);
      this.closeWs(ws, code, reason);
    }
    this.members.delete(member.cid);
    this.leave(member, true);
    if (this.members.size === 0) this.ctx.waitUntil(this.lastClosed());
  }

  private async dropMember(member: Member, _why: string): Promise<void> {
    member.ws = null;
    this.members.delete(member.cid);
    this.leave(member, true);
    if (this.members.size === 0) await this.lastClosed();
  }

  /** The last socket closed (3.5, 3.6.2): the tail commits, `{ closed: true }` reaches the route, the doc rows go, the `rt_open` row goes. */
  private async lastClosed(): Promise<void> {
    const meta = this.meta;
    if (meta === null) return;
    try {
      if (meta.head > meta.covered) await this.checkpoint(true);
      else if (this.editedSinceOpen)
        await this.postCheckpoint({
          fromSeq: meta.covered + 1,
          toSeq: meta.covered,
          entries: [],
          closed: true,
        });
    } catch (error) {
      this.log('error', 'the close checkpoint failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (this.members.size > 0) return;
    this.editedSinceOpen = false;
    if ((this.meta?.head ?? 0) <= (this.meta?.covered ?? 0)) {
      // the doc rows live while the deck has a socket or an uncommitted entry (3.4 item 7)
      this.db.run('DROP TABLE IF EXISTS doc');
      this.db.run(DOC_DDL);
      this.live = null;
      if (this.meta !== null) {
        this.meta.seeded = false;
        this.writeMeta();
      }
      await this.ctx.storage.deleteAlarm().catch(() => undefined);
      this.alarmAt = null;
    }
    try {
      await noteClosed(this.env.ACCOUNTS, this.deckId ?? '');
    } catch {
      // the control table is not made yet (3.6.2): nothing to delete
    }
  }

  private async noteOpenRow(now: number): Promise<void> {
    try {
      await noteOpen(this.env.ACCOUNTS, this.deckId ?? '', now);
    } catch (error) {
      this.log('warn', 'rt_open not written', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** The deadlines read on every message and wake (3.3, 3.6.2): the join window, the ticket grace, the reauth grace, the liveness. */
  private sweep(now: number): void {
    for (const member of [...this.members.values()]) {
      if (member.ws === null) {
        if (member.entry !== null && now - member.lastMessageAt > PRESENCE_EXPIRY_MS) {
          this.members.delete(member.cid);
          this.leave(member, true);
        }
        continue;
      }
      if (member.joinBy !== null && now > member.joinBy) {
        this.closeMember(member, CLOSE_CODES.ticket, 'no join');
        continue;
      }
      if (member.reauthAt !== null && now - member.reauthAt > REAUTH_GRACE_MS) {
        this.closeMember(member, CLOSE_CODES.forbidden, 'reauth timed out');
        continue;
      }
      if (member.claims !== null && member.claims.exp + TICKET_GRACE_MS < now) {
        this.closeMember(member, CLOSE_CODES.ticket, 'ticket expired');
        continue;
      }
      const auto = this.ctx.getWebSocketAutoResponseTimestamp(member.ws)?.getTime() ?? 0;
      if (Math.max(auto, member.lastMessageAt) < now - PRESENCE_EXPIRY_MS) {
        this.closeMember(member, 1000, 'no heartbeat');
      }
    }
  }

  /** The next deadline of the sweep, as an alarm (never a timer). */
  private async armSweeps(now: number): Promise<void> {
    let next = Number.POSITIVE_INFINITY;
    for (const member of this.members.values()) {
      if (member.joinBy !== null) next = Math.min(next, member.joinBy);
      if (member.reauthAt !== null) next = Math.min(next, member.reauthAt + REAUTH_GRACE_MS);
      if (member.claims !== null) next = Math.min(next, member.claims.exp + TICKET_GRACE_MS);
    }
    // a far deadline (a ticket's expiry, minutes away) rides the next message or alarm instead
    // of its own setAlarm, which would be one row written per checkpoint
    if (Number.isFinite(next) && next - now <= SWEEP_ALARM_WINDOW_MS)
      await this.armAlarm(Math.max(next, now + 50));
  }

  private async armAlarm(at: number): Promise<void> {
    await this.alarmRead;
    if (this.alarmAt !== null && this.alarmAt <= at) return;
    this.alarmAt = at;
    await this.ctx.storage.setAlarm(at);
  }

  // -------------------------------------------------------------------------------------------
  // The live document (3.4 item 7) and the seed (3.2)

  private async ensureLive(): Promise<void> {
    if (this.live !== null) return;
    if (this.meta === null || !this.meta.seeded || this.meta.stale) {
      await this.seed();
      return;
    }
    const rows = this.db.exec<{ key: string; part: number; body: string }>(
      'SELECT key, part, body FROM doc ORDER BY key, part',
    );
    const document = documentOfRows(rows);
    if (document === null) {
      await this.seed();
      return;
    }
    const meta = this.meta;
    const above =
      meta.head > meta.docSeq ? this.entriesAbove(meta.docSeq, meta.head - meta.docSeq) : [];
    try {
      this.live = {
        document: this.atRevision(applyEntries(document, above), meta.revision),
        seq: meta.head,
      };
    } catch (error) {
      this.log('warn', 'the entries above the doc rows did not apply; seeding', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.seed();
    }
  }

  /** The document with the object's revision on its manifest (the doc rows may carry an older one). */
  private atRevision(document: DeckDocument, revision: number): DeckDocument {
    if (document.deck.revision === revision) return document;
    return { deck: { ...document.deck, revision }, slides: document.slides };
  }

  /** The store's document at the last checkpoint through the seed route (3.2): the doc rows, the meta row, the live document. */
  private async seed(): Promise<void> {
    if (this.seeding !== null) return this.seeding;
    this.seeding = (async () => {
      const deckId = this.deckId ?? '';
      // the meta row as it stands now: one row read, so a row another handler of this object
      // wrote since the constructor (or a test seeded) is the order and not the store's covered
      const row = this.db.exec<MetaRow>('SELECT * FROM meta WHERE id = 1')[0];
      if (row !== undefined && this.meta === null) {
        this.meta = metaOfRow(row);
        this.persisted = countersOf(row.counters);
      }
      const answer = await this.fetchSeed(deckId, undefined);
      const document = await this.seedDocument(answer);
      const meta: Meta = this.meta ?? {
        head: answer.covered,
        covered: answer.covered,
        revision: answer.revision,
        lastCheckpointAt: null,
        firstUncommittedAt: null,
        months: [],
        seeded: false,
        stale: false,
        docSeq: answer.covered,
      };
      // an object that already orders the deck keeps its head; the store's revision and covered
      // are taken when they are ahead (an external write), the doc rows are the store's
      if (this.meta !== null) {
        meta.revision = Math.max(meta.revision, answer.revision);
        if (answer.covered > meta.covered) meta.covered = answer.covered;
        if (meta.head < meta.covered) meta.head = meta.covered;
      }
      meta.seeded = true;
      meta.stale = false;
      // the store's document is the state at its covered seq: the entries above it are the
      // object's own and are applied over the rows on every rebuild
      meta.docSeq = Math.min(answer.covered, meta.head);
      this.meta = meta;
      this.writeDocRows(document);
      this.writeMeta();
      const above =
        meta.head > meta.docSeq ? this.entriesAbove(meta.docSeq, meta.head - meta.docSeq) : [];
      let live = document;
      try {
        live = applyEntries(document, above);
      } catch (error) {
        this.log('warn', 'the entries above the seed did not apply', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.live = { document: this.atRevision(live, meta.revision), seq: meta.head };
      this.counters.seeds += 1;
    })().finally(() => {
      this.seeding = null;
    });
    return this.seeding;
  }

  private async fetchSeed(deckId: string, since: number | undefined): Promise<SeedAnswer> {
    const url = `${this.appOrigin()}/api/decks/${encodeURIComponent(deckId)}/seed${since === undefined ? '' : `?since=${since}`}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.appHeaders(false),
      signal: AbortSignal.timeout(SEED_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`the seed route answered ${response.status}`);
    return (await response.json()) as SeedAnswer;
  }

  private async seedDocument(answer: SeedAnswer): Promise<DeckDocument> {
    if (answer.document !== undefined) return answer.document;
    if (answer.snapshotUrl !== undefined) {
      const response = await fetch(answer.snapshotUrl, {
        signal: AbortSignal.timeout(SEED_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`the snapshot answered ${response.status}`);
      return (await response.json()) as DeckDocument;
    }
    throw new Error('the seed route answered no document');
  }

  private writeDocRows(document: DeckDocument, slideIds?: Iterable<string>): void {
    const rows = docRowsOf(document, slideIds);
    this.ctx.storage.transactionSync(() => {
      for (const [key, body] of rows) {
        const parts = chunkBody(body);
        parts.forEach((part, index) => {
          this.db.run(
            'INSERT OR REPLACE INTO doc (key, part, body) VALUES (?, ?, ?)',
            key,
            index,
            part,
          );
        });
        this.db.run('DELETE FROM doc WHERE key = ? AND part >= ?', key, parts.length);
      }
      if (slideIds !== undefined) {
        // a slide the run removed leaves its rows
        for (const id of slideIds)
          if (document.slides[id] === undefined)
            this.db.run('DELETE FROM doc WHERE key = ?', `slide:${id}`);
      }
    });
  }

  private writeMeta(): void {
    const meta = this.meta;
    if (meta === null) return;
    this.db.run(
      `INSERT INTO meta (id, head, covered, revision, last_checkpoint_at, first_uncommitted_at, months, seeded, stale, counters, doc_seq)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET head = excluded.head, covered = excluded.covered, revision = excluded.revision,
         last_checkpoint_at = excluded.last_checkpoint_at, first_uncommitted_at = excluded.first_uncommitted_at,
         months = excluded.months, seeded = excluded.seeded, stale = excluded.stale, counters = excluded.counters,
         doc_seq = excluded.doc_seq`,
      meta.head,
      meta.covered,
      meta.revision,
      meta.lastCheckpointAt,
      meta.firstUncommittedAt,
      JSON.stringify(meta.months),
      meta.seeded ? 1 : 0,
      meta.stale ? 1 : 0,
      JSON.stringify(addCounters(this.persisted, this.counters)),
      meta.docSeq,
    );
  }

  // -------------------------------------------------------------------------------------------
  // The log

  /** The entries after `seq`, oldest first, at most `limit`, across the month tables. */
  private entriesAbove(seq: number, limit: number): Entry[] {
    const meta = this.meta;
    if (meta === null || limit <= 0) return [];
    const out: Entry[] = [];
    for (const month of meta.months) {
      const rows = this.db.exec<EntryRow>(
        `SELECT ${ENTRY_COLUMNS} FROM ${entriesTable(month)} WHERE seq > ? ORDER BY seq LIMIT ?`,
        seq,
        limit - out.length,
      );
      for (const row of rows) out.push(entryOfRow(row));
      if (out.length >= limit) break;
    }
    return out;
  }

  private findEntry(clientId: string, opId: string): Entry | undefined {
    const meta = this.meta;
    if (meta === null) return undefined;
    for (let i = meta.months.length - 1; i >= 0; i -= 1) {
      const month = meta.months[i];
      if (month === undefined) continue;
      const rows = this.db.exec<EntryRow>(
        `SELECT ${ENTRY_COLUMNS} FROM ${entriesTable(month)} WHERE client_id = ? AND op_id = ?`,
        clientId,
        opId,
      );
      const row = rows[0];
      if (row !== undefined) return entryOfRow(row);
    }
    return undefined;
  }

  /** Drops a month table once `covered` and the retention are past its last seq (3.4 item 4): no row deletes. */
  private compact(): void {
    const meta = this.meta;
    if (meta === null) return;
    const keep: string[] = [];
    for (const month of meta.months) {
      const rows = this.db.exec<{ last: number | null }>(
        `SELECT MAX(seq) AS last FROM ${entriesTable(month)}`,
      );
      const last = rows[0]?.last ?? null;
      if (last !== null && last <= meta.covered - RETAIN_ENTRIES && month !== monthOf(Date.now())) {
        this.db.run(`DROP TABLE IF EXISTS ${entriesTable(month)}`);
        continue;
      }
      keep.push(month);
    }
    if (keep.length !== meta.months.length) {
      meta.months = keep;
      this.writeMeta();
    }
  }

  // -------------------------------------------------------------------------------------------
  // The checkpoint (3.5) and the re-admission after a conflict

  private async checkpoint(closed: boolean): Promise<void> {
    if (this.checkpointing !== null) return this.checkpointing;
    this.checkpointing = this.checkpointOnce(closed).finally(() => {
      this.checkpointing = null;
    });
    return this.checkpointing;
  }

  private async checkpointOnce(closed: boolean): Promise<void> {
    const meta = this.meta;
    if (meta === null) return;
    if (meta.head <= meta.covered) {
      if (closed && this.editedSinceOpen)
        await this.postCheckpoint({
          fromSeq: meta.covered + 1,
          toSeq: meta.covered,
          entries: [],
          closed: true,
        });
      return;
    }
    const entries: Entry[] = [];
    let bytes = 0;
    let at = meta.covered;
    while (
      at < meta.head &&
      entries.length < CHECKPOINT_MAX_ENTRIES &&
      bytes < CHECKPOINT_MAX_BYTES
    ) {
      const page = this.entriesAbove(at, Math.min(256, CHECKPOINT_MAX_ENTRIES - entries.length));
      if (page.length === 0) break;
      for (const entry of page) {
        bytes += JSON.stringify(entry).length;
        entries.push(entry);
        at = entry.seq;
      }
    }
    if (entries.length === 0) {
      meta.covered = meta.head;
      meta.firstUncommittedAt = null;
      this.writeMeta();
      return;
    }
    const fromSeq = entries[0]?.seq ?? meta.covered + 1;
    const toSeq = entries[entries.length - 1]?.seq ?? meta.head;
    // the live document is rebuilt on the first thing that needs it (3.4 item 7): the doc rows
    // the run touched are written from it below
    await this.ensureLive();
    const answer = await this.postCheckpoint({
      fromSeq,
      toSeq,
      entries,
      ...(closed && toSeq >= meta.head ? { closed: true } : {}),
    });
    this.counters.checkpoints += 1;
    if ('conflict' in answer) {
      await this.readmit(answer.revision);
      return;
    }
    meta.revision = answer.revision;
    meta.covered = toSeq;
    meta.lastCheckpointAt = Date.now();
    meta.firstUncommittedAt = toSeq < meta.head ? this.lastEntryAt : null;
    if (this.live !== null) {
      this.live = {
        document: this.atRevision(this.live.document, answer.revision),
        seq: this.live.seq,
      };
      // the doc rows follow the head every DOC_REFRESH_ENTRIES entries or at the close, not at
      // every checkpoint: a wake applies the retained entries above the rows' seq (3.4 item 7)
      if (closed || meta.head - meta.docSeq >= DOC_REFRESH_ENTRIES) {
        this.writeDocRows(this.live.document);
        meta.docSeq = this.live.seq;
      }
    }
    this.writeMeta();
    const last = answer.committed[answer.committed.length - 1];
    this.lastRun = answer.committed;
    const lastEntry = entries[entries.length - 1];
    const event: RoomEvent = {
      type: 'checkpoint',
      revision: answer.revision,
      fromSeq,
      toSeq,
      ...(last?.snapshot === undefined ? {} : { snapshot: last.snapshot }),
      author: last?.author ?? lastEntry?.author ?? { kind: 'agent', name: 'room' },
      note: last?.note ?? '',
      ...(answer.comments === undefined ? {} : { comments: answer.comments }),
    };
    this.broadcast(event);
    this.compact();
    if (answer.tier !== 'do') {
      // the route's instance serves another tier now (3.8 item 2): the tabs reload onto it
      this.broadcast({ type: 'resync', revision: answer.revision });
      for (const member of [...this.members.values()])
        this.closeMember(member, CLOSE_CODES.tier, `tier ${answer.tier}`);
      return;
    }
    if (meta.head > meta.covered) await this.armAlarm(Date.now() + 50);
  }

  private async postCheckpoint(body: {
    fromSeq: number;
    toSeq: number;
    entries: Entry[];
    closed?: boolean;
  }): Promise<CheckpointAnswer & { comments?: { revision: number; threadIds: string[] } }> {
    const deckId = this.deckId ?? '';
    // the object's revision rides the body (3.5): a store at another revision answers 409 before
    // anything is written and the re-admission path runs
    const revision = this.meta?.revision;
    const response = await fetch(
      `${this.appOrigin()}/api/decks/${encodeURIComponent(deckId)}/checkpoint`,
      {
        method: 'POST',
        headers: this.appHeaders(true),
        body: JSON.stringify({ ...body, ...(revision === undefined ? {} : { revision }) }),
        signal: AbortSignal.timeout(CHECKPOINT_TIMEOUT_MS),
      },
    );
    if (response.status === 409) {
      const conflict = (await response.json()) as { conflict?: true; revision?: number };
      return { conflict: true, revision: conflict.revision ?? 0 };
    }
    if (!response.ok) throw new Error(`the checkpoint route answered ${response.status}`);
    return (await response.json()) as CheckpointAnswer & {
      comments?: { revision: number; threadIds: string[] };
    };
  }

  /**
   * The re-admission after a foreign record (3.5): the seed route at the new revision with the
   * records above the object's own, the entries above `covered` transformed from their original
   * mutations past the records' mutations and placed on the seed's document as new entries (the
   * rows are moved to the head by an UPDATE, so the unique index keeps the dedupe), committed at
   * once, and `{ type: 'checkpoint', external: true }` so every tab reloads at the revision.
   */
  private async readmit(revision: number): Promise<void> {
    const meta = this.meta;
    if (meta === null) return;
    const deckId = this.deckId ?? '';
    const answer = await this.fetchSeed(deckId, meta.revision);
    const document = await this.seedDocument(answer);
    const foreign = (answer.records ?? [])
      .filter((record) => record.revision > meta.revision && record.mutations !== undefined)
      .sort((a, b) => a.revision - b.revision)
      .flatMap((record) => record.mutations ?? []);
    const landed = landedOwn(foreign);
    const stale = this.entriesAbove(meta.covered, meta.head - meta.covered);
    let running = document;
    const moved: Entry[] = [];
    this.ctx.storage.transactionSync(() => {
      for (const entry of stale) {
        if (entry.kind !== 'edit' || entry.mutations === undefined) {
          meta.head += 1;
          moved.push(this.moveEntry(entry, meta.head, entry.mutations ?? null, meta.revision));
          continue;
        }
        const transformed = transformEntry(entry.mutations, landed);
        if (transformed === null) {
          this.deleteEntry(entry);
          continue;
        }
        const placed = landCandidate(
          running,
          { opId: entry.opId, kind: 'edit', mutations: transformed },
          () => true,
        );
        if (!placed.ok) {
          this.deleteEntry(entry);
          continue;
        }
        running = placed.document;
        meta.head += 1;
        moved.push(
          this.moveEntry(entry, meta.head, placed.mutations, Math.max(revision, answer.revision)),
        );
      }
      meta.covered = meta.head - moved.length;
      meta.revision = Math.max(revision, answer.revision);
      meta.stale = false;
      meta.seeded = true;
      this.writeMeta();
    });
    this.writeDocRows(document);
    meta.docSeq = meta.covered;
    this.live = { document: running, seq: meta.head };
    if (moved.length > 0) {
      const result = await this.postCheckpoint({
        fromSeq: moved[0]?.seq ?? meta.covered + 1,
        toSeq: meta.head,
        entries: moved,
      });
      if (!('conflict' in result)) {
        meta.revision = result.revision;
        meta.covered = meta.head;
        meta.firstUncommittedAt = null;
        this.live = { document: this.atRevision(running, result.revision), seq: meta.head };
        this.writeDocRows(this.live.document);
        meta.docSeq = meta.head;
        this.writeMeta();
      }
    }
    this.broadcast({
      type: 'checkpoint',
      revision: meta.revision,
      fromSeq: meta.head,
      toSeq: meta.head,
      author: { kind: 'agent', name: 'room' },
      note: '',
      external: true,
    });
  }

  private moveEntry(entry: Entry, seq: number, mutations: Mutation[] | null, rev: number): Entry {
    const month = this.monthOfSeq(entry.seq);
    if (month !== null) {
      this.db.run(
        `UPDATE ${entriesTable(month)} SET seq = ?, mutations = ?, rev = ? WHERE seq = ?`,
        seq,
        mutations === null ? null : JSON.stringify(mutations),
        rev,
        entry.seq,
      );
    }
    return { ...entry, seq, rev, ...(mutations === null ? {} : { mutations }) };
  }

  private deleteEntry(entry: Entry): void {
    const month = this.monthOfSeq(entry.seq);
    if (month !== null) this.db.run(`DELETE FROM ${entriesTable(month)} WHERE seq = ?`, entry.seq);
  }

  private monthOfSeq(seq: number): string | null {
    const meta = this.meta;
    if (meta === null) return null;
    for (const month of meta.months) {
      const rows = this.db.exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${entriesTable(month)} WHERE seq = ?`,
        seq,
      );
      if ((rows[0]?.n ?? 0) > 0) return month;
    }
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // The HTTP routes inside the object

  private async httpOps(request: Request): Promise<Response> {
    const claims = parseClaims(request.headers.get(CLAIMS_HEADER));
    if (claims === null) return json({ error: 'ticket', message: 'no claims' }, 401);
    const text = await request.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return json({ error: 'invalid_json', message: 'The body is not JSON' }, 400);
    }
    const parsed = opsPostSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return json(
        {
          error: 'invalid',
          pointer: `/${first?.path.map(String).join('/') ?? ''}`,
          message: first?.message ?? 'invalid',
        },
        400,
      );
    }
    this.counters.opsFrames += 1;
    const answer = await this.admit(claims, parsed.data, text.length, Date.now());
    if (!answer.ok) {
      return json(
        {
          error: answer.code,
          message: answer.message,
          ...(answer.head === undefined ? {} : { head: answer.head }),
        },
        answer.status,
        answer.retryAfterMs === undefined
          ? {}
          : { 'retry-after': String(Math.max(1, Math.ceil(answer.retryAfterMs / 1000))) },
      );
    }
    return json({
      ok: true,
      entries: answer.entries,
      rejected: answer.rejected,
      head: answer.head,
      revision: answer.revision,
      ...(answer.between === undefined ? {} : { between: answer.between }),
    });
  }

  private async httpPresence(request: Request, url: URL): Promise<Response> {
    const claims = parseClaims(request.headers.get(CLAIMS_HEADER));
    if (claims === null) return json({ error: 'ticket', message: 'no claims' }, 401);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return json({ error: 'invalid_json', message: 'The body is not JSON' }, 400);
    }
    const parsed = presencePostSchema.safeParse(raw);
    if (!parsed.success)
      return json({ error: 'invalid', message: parsed.error.issues[0]?.message ?? 'invalid' }, 400);
    const now = Date.now();
    let member = this.members.get(claims.cid);
    if (url.searchParams.get('leave') === '1') {
      if (member !== undefined) {
        if (member.ws !== null) this.closeMember(member, 1000, 'left');
        else {
          this.members.delete(member.cid);
          this.leave(member, true);
        }
      }
      return json({ ok: true, left: true });
    }
    if (member === undefined) {
      // the HTTP belt while the socket is down (3.6.3): a roster row without a socket, swept by expiry
      member = {
        cid: claims.cid,
        ws: null,
        claims,
        entry: null,
        tab: claims.tab,
        address: null,
        origin: claims.org,
        joinedAt: now,
        lastMessageAt: now,
        reauthAt: null,
        joinBy: null,
        presenceWindow: { second: 0, count: 0 },
      };
      this.members.set(claims.cid, member);
    }
    member.lastMessageAt = now;
    this.counters.presenceFrames += 1;
    const refused = this.presence(member, parsed.data, now);
    if (refused === 'budget') return json({ ok: true, dropped: true });
    if (refused !== null) return json({ error: 'invalid', message: refused }, 400);
    return json({ ok: true, hueSlot: member.entry?.hueSlot ?? 0, role: claims.role });
  }

  /** An agent's write forwarded under the bearer (3.2 "An agent HTTP write"): the base check, the placement, one INSERT, the fan out, the checkpoint at once. */
  private async httpWrite(request: Request): Promise<Response> {
    const parsed = roomWriteBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return json(
        { ok: false, code: 'invalid', message: parsed.error.issues[0]?.message ?? 'invalid' },
        400,
      );
    const body = parsed.data;
    await this.ensureLive();
    const meta = this.meta;
    const live = this.live;
    if (meta === null || live === null)
      return json({ ok: false, code: 'invalid', message: 'the room has no document' }, 503);
    const now = Date.now();
    if (body.baseRevision !== meta.revision) {
      const mine = new Set(touchedSlides(body.mutations));
      const changed = new Set<string>();
      for (const entry of this.entriesAbove(meta.covered, meta.head - meta.covered))
        for (const id of touchedSlides(entry.mutations ?? [])) changed.add(id);
      const overlap = [...mine].some((id) => changed.has(id));
      const deckLevel = body.mutations.some((mutation) => !('slideId' in mutation));
      if (body.strict === true || overlap || deckLevel || body.baseRevision > meta.revision) {
        return json(
          {
            ok: false,
            code: 'conflict',
            message:
              body.strict === true
                ? `baseRevision ${body.baseRevision} is stale; the document is at revision ${meta.revision}`
                : `a slide this write touches changed since revision ${body.baseRevision}; the document is at revision ${meta.revision}`,
            currentRevision: meta.revision,
          },
          409,
        );
      }
    }
    const opId = `server:${crypto.randomUUID()}`;
    const placed = landCandidate(
      live.document,
      { opId, kind: 'edit', mutations: body.mutations },
      () => true,
    );
    if (!placed.ok)
      return json(
        {
          ok: false,
          code: 'invalid',
          message:
            placed.rejected.message ?? `the write does not apply (${placed.rejected.reason})`,
        },
        400,
      );
    const candidate: NewEntry = {
      rev: meta.revision,
      kind: 'edit',
      author: body.author,
      clientId: body.clientId.slice(0, 64),
      opId,
      mutations: placed.mutations,
      at: new Date(now).toISOString(),
      ...(body.note === undefined ? {} : { note: body.note }),
    };
    const [admitted] = this.insertEntries([candidate], now);
    this.live = { document: placed.document, seq: meta.head };
    this.editedSinceOpen = true;
    if (admitted !== undefined) this.broadcast({ type: 'op', entry: admitted });
    const seq = admitted?.seq ?? meta.head;
    // the checkpoint at once (3.2): the record exists before the agent's answer
    await this.checkpoint(false);
    const record = this.lastRun.find(
      (row) => row.ops !== undefined && row.ops.fromSeq <= seq && seq <= row.ops.toSeq,
    );
    return json({
      ok: true,
      revision: this.meta?.revision ?? meta.revision,
      seq,
      ...(record === undefined ? {} : { record }),
    });
  }

  /** The records the last checkpoint run committed, for the write route's answer. */
  private lastRun: VersionRecordLike[] = [];

  private async httpFlush(): Promise<Response> {
    // an object that never opened holds nothing to commit and seeds nothing for a flush
    if (this.meta === null) return json({ ok: true, revision: 0, covered: 0, head: 0, none: true });
    await this.checkpoint(false);
    const meta = this.meta;
    return json({ ok: true, revision: meta.revision, covered: meta.covered, head: meta.head });
  }

  /** A manifest written outside the object (3.5): the revision follows, the doc rows are stale, the tabs reload. */
  private async httpExternal(request: Request): Promise<Response> {
    const parsed = roomExternalBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'invalid' }, 400);
    const meta = this.meta;
    if (meta !== null) {
      meta.revision = Math.max(meta.revision, parsed.data.revision);
      meta.stale = true;
      this.live = null;
      this.writeMeta();
    }
    this.broadcast({
      type: 'checkpoint',
      revision: parsed.data.revision,
      fromSeq: meta?.head ?? 0,
      toSeq: meta?.head ?? 0,
      author: parsed.data.author,
      note: parsed.data.note,
      external: true,
    });
    return json({ ok: true });
  }

  private async httpPublish(request: Request): Promise<Response> {
    const parsed = roomPublishBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return json({ error: 'invalid', message: parsed.error.issues[0]?.message ?? 'invalid' }, 400);
    this.broadcast(parsed.data.event);
    return json({ ok: true, sockets: this.members.size });
  }

  private async httpDocument(): Promise<Response> {
    // never the seed route for a GET (3.4 item 7): the loader reads the store itself on a 204
    if (this.live === null) {
      const meta = this.meta;
      if (meta === null || !meta.seeded || meta.stale) return new Response(null, { status: 204 });
      const rows = this.db.exec<{ key: string; part: number; body: string }>(
        'SELECT key, part, body FROM doc ORDER BY key, part',
      );
      const document = documentOfRows(rows);
      if (document === null) return new Response(null, { status: 204 });
      const above =
        meta.head > meta.docSeq ? this.entriesAbove(meta.docSeq, meta.head - meta.docSeq) : [];
      try {
        this.live = {
          document: this.atRevision(applyEntries(document, above), meta.revision),
          seq: meta.head,
        };
      } catch {
        return new Response(null, { status: 204 });
      }
    }
    const meta = this.meta;
    return json({
      document: this.live.document,
      seq: this.live.seq,
      revision: meta?.revision ?? 0,
      covered: meta?.covered ?? 0,
    });
  }

  private async httpCounters(url: URL): Promise<Response> {
    const spin = Math.min(200, Math.max(0, Number(url.searchParams.get('spin') ?? 0)));
    if (spin > 0) {
      // day 0's CPU probe (docs/CLOUDFLARE.md 1.3): burns `spin` ms inside the object
      const until = Date.now() + spin;
      let x = 0;
      while (Date.now() < until) x = (x + 1) % 7;
    }
    let probe: Record<string, number> | undefined;
    if (url.searchParams.get('probe') === 'drop') {
      // day 0's DROP TABLE probe (W1 open 1): 1,000 rows written, then the drop's own cursor
      const table = `probe_${Date.now()}`;
      this.db.run(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, body TEXT)`);
      let insertWritten = 0;
      for (let i = 0; i < 1000; i += 1)
        insertWritten += this.db.run(
          `INSERT INTO ${table} (id, body) VALUES (?, ?)`,
          i,
          'x'.repeat(100),
        );
      const cursor = this.ctx.storage.sql.exec(`DROP TABLE ${table}`);
      cursor.toArray();
      probe = {
        insertRowsWritten: insertWritten,
        dropRowsWritten: cursor.rowsWritten,
        dropRowsRead: cursor.rowsRead,
      };
      this.counters.rowsWritten += cursor.rowsWritten;
      this.counters.rowsRead += cursor.rowsRead;
    }
    const meta = this.meta;
    let sockets = 0;
    for (const member of this.members.values()) if (member.ws !== null) sockets += 1;
    return json({
      // a counters read is a bearer fetch into the object and counts as one request (R5's CF-R1a)
      countsSelf: true,
      sinceWake: { ...this.counters },
      total: addCounters(this.persisted, this.counters),
      head: meta?.head ?? 0,
      covered: meta?.covered ?? 0,
      revision: meta?.revision ?? 0,
      months: meta?.months ?? [],
      sockets,
      members: this.members.size,
      awakeSince: this.awakeSince,
      alarmAt: this.alarmAt,
      databaseSize: this.db.databaseSize,
      colo: this.colo,
      object: this.ctx.id.toString().slice(0, 8),
      ...(probe === undefined ? {} : { probe }),
      ...(spin > 0 ? { spinMs: spin } : {}),
    });
  }

  /** An access record or a link grant changed (3.3): `reauth` to the named sockets, 4403 after the grace without a fresh ticket. */
  private async httpAccessChanged(request: Request): Promise<Response> {
    const parsed = roomAccessChangedSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return json({ error: 'invalid' }, 400);
    const named = parsed.data.principalIds === undefined ? null : new Set(parsed.data.principalIds);
    const now = Date.now();
    let asked = 0;
    for (const member of this.members.values()) {
      if (member.ws === null || member.claims === null) continue;
      if (named !== null && !named.has(member.claims.pid ?? member.claims.id)) continue;
      member.reauthAt = now;
      this.send(member, { t: 'reauth' });
      asked += 1;
    }
    if (asked > 0) await this.armAlarm(now + REAUTH_GRACE_MS + 50);
    return json({ ok: true, asked });
  }

  /** The realtime flag read off: the tail commits and every socket closes with 4503 (3.8 item 1). */
  private async handOff(): Promise<void> {
    try {
      await this.checkpoint(false);
    } catch (error) {
      this.log('error', 'the hand off checkpoint failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    for (const member of [...this.members.values()])
      this.closeMember(member, CLOSE_CODES.tier, 'realtime off');
  }

  // -------------------------------------------------------------------------------------------
  // The environment

  private appOrigin(): string {
    return this.env.TURBOSLIDE_APP_ORIGIN.replace(/\/$/, '');
  }

  private appHeaders(withBody: boolean): Record<string, string> {
    const bypass = this.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    return {
      authorization: `Bearer ${this.env.TURBOSLIDE_ROOM_BEARER}`,
      ...(withBody ? { 'content-type': 'application/json' } : {}),
      ...(bypass !== undefined && bypass !== '' ? { 'x-vercel-protection-bypass': bypass } : {}),
    };
  }

  private idleMs(): number {
    return parseIntVar(this.env.TURBOSLIDE_CHECKPOINT_IDLE_MS, 2000);
  }

  private maxMs(): number {
    return parseIntVar(this.env.TURBOSLIDE_CHECKPOINT_MAX_MS, 10_000);
  }

  private protocol(): number {
    return parseIntVar(this.env.TURBOSLIDE_PROTOCOL, ROOM_PROTOCOL);
  }

  private log(
    level: 'info' | 'warn' | 'error',
    message: string,
    data: Record<string, unknown> = {},
  ): void {
    const line = JSON.stringify({ level, message, deck: this.deckId, ...data });
    if (level === 'error') console.error(line);
    else console.log(line);
  }
}

/** The presence refusal as a frame: the reason and the presence route's refusal body (R2-C4). */
function presenceRefusal(reason: 'budget' | 'invalid' | 'clock'): {
  t: 'presence-refused';
  reason: 'budget' | 'invalid' | 'clock';
  status: number;
  code: string;
  message: string;
} {
  switch (reason) {
    case 'budget':
      return {
        t: 'presence-refused',
        reason,
        status: 429,
        code: 'rate_limited',
        message: 'Too many presence states; slow down',
      };
    case 'clock':
      return {
        t: 'presence-refused',
        reason,
        status: 409,
        code: 'clock',
        message: 'An older clock than the roster holds',
      };
    default:
      return {
        t: 'presence-refused',
        reason,
        status: 400,
        code: 'invalid',
        message: 'The presence state was refused',
      };
  }
}

function tabOf(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const token = raw.trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(token) ? token : undefined;
}
