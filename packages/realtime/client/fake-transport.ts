// The test double of the room's wire (gslides-parity SPEC-3 3.3, 3.4, 16.6 `client/room-client.test.ts`):
// a small room server over a `RealtimeChannel` (the memory channel in the tests) that issues client
// ids, sends `hello` and the replay, admits ops with the transform, the reducer and the compare and
// append, writes the roster, and a transport per connection that the room client drives. The
// server's admission mirrors apps/studio/src/server/room.ts's shape without its identity and
// authorization, so a client test exercises the client and the protocol, not the studio. Two
// knobs stage the failure modes the client must survive: `kill()` closes every stream (a
// reconnect with `Last-Event-ID`), `offline` makes every POST throw. Test code and the dev only
// page harness import it; nothing in production does.
import type { DeckDocument } from '@turboslide/schema/deck';
import { NotImplementedError } from '@turboslide/schema/errors';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import { isTextOp, sameText, transformMutation } from '@turboslide/schema/transform';

import { appendWithRetry, checkBaseWindow, replayPlan } from '../src/admission.ts';
import type {
  Entry,
  NewEntry,
  RealtimeChannel,
  Role,
  RoomEvent,
  RosterEntry,
} from '../src/channel.ts';
import type { PresencePost } from '../src/protocol.ts';
import { rewritesText } from './room-client.ts';
import type { Rejected, RoomTransport, StreamHandle } from './room-client.ts';

export type FakeIdentity = {
  principalId: string;
  label: string;
  role: Role;
  author: Author;
};

export type FakeRoomServerOptions = {
  deckId: string;
  channel: RealtimeChannel;
  document: DeckDocument;
  now?: () => number;
  /** the store the checkpointer would write; the fake commits nothing, it only moves the revision */
  onCheckpoint?: (entries: Entry[]) => void;
};

type Connection = {
  clientId: string;
  identity: FakeIdentity;
  onEvent: (event: RoomEvent) => void;
  onError: (error: unknown) => void;
  unsubscribe: () => void;
};

function transformPast(
  mutations: readonly Mutation[],
  landed: readonly Mutation[],
): Mutation[] | null {
  let out = [...mutations];
  for (const against of landed) {
    const next: Mutation[] = [];
    for (const mutation of out) {
      if (rewritesText(against, mutation)) continue;
      if (isTextOp(mutation) && isTextOp(against) && sameText(mutation, against)) {
        try {
          next.push(...transformMutation(mutation, against, 'right'));
        } catch (error) {
          if (error instanceof NotImplementedError) next.push(mutation);
          else throw error;
        }
        continue;
      }
      next.push(mutation);
    }
    out = next;
    if (out.length === 0) return null;
  }
  return out;
}

export type FakeRoomServer = {
  /** a transport for one browser tab of one identity */
  transportFor: (identity: FakeIdentity) => RoomTransport & {
    /** every POST throws until set back */
    offline: (on: boolean) => void;
  };
  /** the live document (the last checkpoint plus every entry) */
  document: () => DeckDocument;
  /** commits everything since the last checkpoint: the revision moves, a `checkpoint` event goes out */
  checkpoint: () => Promise<void>;
  /** closes every open stream; the clients reconnect with their last seq */
  kill: () => void;
  /** appends an entry as another writer (an agent, the CLI) so the clients receive it */
  appendExternal: (author: Author, mutations: Mutation[]) => Promise<Entry>;
  connections: () => number;
  seq: () => number;
};

export function fakeRoomServer(options: FakeRoomServerOptions): FakeRoomServer {
  const { deckId, channel } = options;
  const now = options.now ?? (() => Date.now());
  let live = options.document;
  let liveSeq = 0;
  let covered = 0;
  const connections = new Set<Connection>();
  const roster = new Map<string, RosterEntry>();
  let nextClient = 1;

  const syncLive = async (): Promise<void> => {
    const head = await channel.head(deckId);
    while (liveSeq < head) {
      const entries = await channel.since(deckId, liveSeq, 500);
      if (entries.length === 0) break;
      for (const entry of entries) {
        if (entry.kind === 'edit' && entry.mutations !== undefined)
          live = applyMutations(live, entry.mutations, { now: entry.at }).document;
        liveSeq = entry.seq;
      }
    }
  };

  const clientIdFor = (): string => {
    const id = String(nextClient++)
      .padStart(32, '0')
      .replace(/[^0-9a-f]/g, '0');
    return id;
  };

  const rosterEntry = (identity: FakeIdentity, post: PresencePost): RosterEntry => ({
    ...post,
    principalId: identity.principalId,
    label: identity.label,
    trust: 'label',
    mark: { variant: 'initials', initials: identity.label[0] ?? 'T' },
    hueSlot: 0,
    kind: 'human',
    role: identity.role,
  });

  const server: FakeRoomServer = {
    transportFor(identity) {
      let offline = false;
      const transport: RoomTransport & { offline: (on: boolean) => void } = {
        offline(on) {
          offline = on;
        },
        open(openOptions): StreamHandle {
          const clientId = clientIdFor();
          const connection: Connection = {
            clientId,
            identity,
            onEvent: openOptions.onEvent,
            onError: openOptions.onError,
            unsubscribe: () => {},
          };
          connections.add(connection);
          void (async () => {
            await channel.presence.bind(deckId, clientId, identity.principalId, 320_000);
            await syncLive();
            const clients = await channel.presence.roster(deckId);
            connection.onEvent({
              type: 'hello',
              seq: liveSeq,
              revision: live.deck.revision,
              clientId,
              role: identity.role,
              clients,
              editing: clients.filter((row) => row.role === 'editor' || row.role === 'owner')
                .length,
              tier: channel.tier,
            });
            const plan = replayPlan(openOptions.since, liveSeq);
            if (plan.kind === 'resync')
              connection.onEvent({ type: 'resync', revision: live.deck.revision });
            else if (plan.from < liveSeq) {
              const entries = await channel.since(deckId, plan.from, liveSeq - plan.from);
              connection.onEvent({ type: 'ops', entries });
            }
            connection.unsubscribe = channel.subscribe(deckId, (event) => {
              if (!connections.has(connection)) return;
              if (event.type === 'op' && identity.role === 'viewer') return;
              connection.onEvent(event);
            });
          })();
          return {
            close() {
              connection.unsubscribe();
              connections.delete(connection);
              void channel.presence.leave(deckId, clientId).catch(() => undefined);
            },
          };
        },
        async postOps(body) {
          if (offline) throw new Error('offline');
          const owner = await channel.presence.owner(deckId, body.clientId);
          if (owner !== identity.principalId)
            return { ok: false, status: 403, code: 'client_unbound', message: 'unbound' };
          if (identity.role === 'viewer' || identity.role === 'commenter')
            return { ok: false, status: 403, code: 'forbidden', message: 'forbidden' };
          await syncLive();
          const head = liveSeq;
          const window = checkBaseWindow(body.base.seq, head);
          if (!window.ok)
            return { ok: false, status: 409, code: 'resync', message: 'resync', head };
          const landed =
            body.base.seq < head
              ? await channel.since(deckId, body.base.seq, head - body.base.seq)
              : [];
          const landedMutations = landed.flatMap((entry) => entry.mutations ?? []);
          const rejected: Rejected[] = [];
          const candidates: NewEntry[] = [];
          let running = live;
          const stamp = new Date(now()).toISOString();
          for (const entry of body.entries) {
            if (entry.kind === 'comment') {
              candidates.push({
                rev: live.deck.revision,
                kind: 'comment',
                author: identity.author,
                clientId: body.clientId,
                opId: entry.opId,
                comment: entry.comment as NewEntry['comment'],
                at: stamp,
              });
              continue;
            }
            const transformed = transformPast(entry.mutations ?? [], landedMutations);
            if (transformed === null) {
              rejected.push({ opId: entry.opId, reason: 'stale' });
              continue;
            }
            try {
              running = applyMutations(running, transformed).document;
            } catch (error) {
              rejected.push({
                opId: entry.opId,
                reason: 'invalid',
                message: error instanceof Error ? error.message : String(error),
              });
              continue;
            }
            candidates.push({
              rev: live.deck.revision,
              kind: 'edit',
              author: identity.author,
              clientId: body.clientId,
              opId: entry.opId,
              mutations: transformed,
              at: stamp,
            });
          }
          if (candidates.length === 0)
            return { ok: true, entries: [], rejected, head, revision: live.deck.revision };
          const result = await appendWithRetry(
            channel,
            deckId,
            head,
            candidates,
            (entries, more) => {
              const moreMutations = more.flatMap((entry) => entry.mutations ?? []);
              const out: NewEntry[] = [];
              for (const entry of entries) {
                if (entry.kind !== 'edit') {
                  out.push(entry);
                  continue;
                }
                const moved = transformPast(entry.mutations ?? [], moreMutations);
                if (moved === null) {
                  rejected.push({ opId: entry.opId, reason: 'stale' });
                  continue;
                }
                out.push({ ...entry, mutations: moved });
              }
              return out;
            },
          );
          if (!result.ok)
            return { ok: false, status: 409, code: 'contended', message: 'busy', head };
          await syncLive();
          return {
            ok: true,
            entries: result.entries,
            rejected,
            head: liveSeq,
            revision: live.deck.revision,
          };
        },
        async postPresence(body, presenceOptions) {
          if (offline) throw new Error('offline');
          if (presenceOptions?.leave === true) {
            roster.delete(body.clientId);
            await channel.presence.leave(deckId, body.clientId);
            return;
          }
          const entry = rosterEntry(identity, body);
          roster.set(body.clientId, entry);
          await channel.presence.set(deckId, body.clientId, entry, 120_000);
        },
      };
      return transport;
    },
    document: () => live,
    async checkpoint() {
      await syncLive();
      if (liveSeq <= covered) return;
      const entries = await channel.since(deckId, covered, liveSeq - covered);
      const from = covered + 1;
      covered = liveSeq;
      const revision = live.deck.revision + 1;
      const at = new Date(now()).toISOString();
      live = { deck: { ...live.deck, revision, updatedAt: at }, slides: live.slides };
      options.onCheckpoint?.(entries);
      await channel.publish(deckId, {
        type: 'checkpoint',
        revision,
        fromSeq: from,
        toSeq: liveSeq,
        author: entries[entries.length - 1]?.author ?? { kind: 'agent', name: 'room' },
        note: '',
      });
    },
    kill() {
      for (const connection of [...connections]) {
        connections.delete(connection);
        connection.unsubscribe();
        connection.onError(new Error('stream closed'));
      }
    },
    async appendExternal(author, mutations) {
      await syncLive();
      const result = await channel.append(deckId, liveSeq, [
        {
          rev: live.deck.revision,
          kind: 'edit',
          author,
          clientId: 'server',
          opId: `server:${crypto.randomUUID()}`,
          mutations,
          at: new Date(now()).toISOString(),
        },
      ]);
      if (!result.ok) throw new Error('external append lost the race');
      await syncLive();
      const entry = result.entries[0];
      if (entry === undefined) throw new Error('no entry');
      return entry;
    },
    connections: () => connections.size,
    seq: () => liveSeq,
  };
  return server;
}

/**
 * A reconnecting transport over a fake server: the shape a browser's EventSource gives, so a
 * `kill()` is followed by a new `open` and a fresh hello after a short pause.
 */
export function reconnectingTransport(
  server: FakeRoomServer,
  identity: FakeIdentity,
  options: { reconnectMs?: number } = {},
): RoomTransport & { offline: (on: boolean) => void; opens: () => number } {
  const inner = server.transportFor(identity);
  let opens = 0;
  return {
    offline: inner.offline,
    opens: () => opens,
    open(openOptions) {
      let handle: StreamHandle | null = null;
      let closed = false;
      let lastSeq = openOptions.since;
      const connect = (): void => {
        if (closed) return;
        opens += 1;
        handle = inner.open({
          since: lastSeq,
          onEvent: (event) => {
            if (event.type === 'op') lastSeq = Math.max(lastSeq, event.entry.seq);
            if (event.type === 'ops') {
              const last = event.entries[event.entries.length - 1];
              if (last !== undefined) lastSeq = Math.max(lastSeq, last.seq);
            }
            openOptions.onEvent(event);
          },
          onError: (error) => {
            openOptions.onError(error);
            setTimeout(connect, options.reconnectMs ?? 5);
          },
        });
      };
      connect();
      return {
        close() {
          closed = true;
          handle?.close();
        },
      };
    },
    postOps: inner.postOps,
    postPresence: inner.postPresence,
  };
}
