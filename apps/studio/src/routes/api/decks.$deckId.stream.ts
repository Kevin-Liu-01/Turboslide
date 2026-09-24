import { createFileRoute } from '@tanstack/react-router';
import { jsonResponse } from '@turboslide/agent/http/errors';
import type { RoomEvent } from '@turboslide/realtime/channel';
import { streamLifetimeMs, streamRetryMs } from '@turboslide/realtime/admission';
import { STREAM_HEARTBEAT_MS, sseComment, sseFrame, sseRetry } from '@turboslide/realtime/protocol';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { accessStore } from '../../server/access';
import { denialBody } from '../../server/authorize';
import {
  bindClient,
  createReaderLiveness,
  createStreamCloser,
  decideFor,
  editingCount,
  filterEventForReader,
  mintClientId,
  overEditingCeiling,
  replayFor,
  requestIdentity,
  retireCandidates,
  retireClients,
  roomFor,
  rosterEntryForReader,
  streamAddress,
  streamCounters,
  streamRefusalLine,
  tabTokenOf,
  viewerFacts,
} from '../../server/room';

/**
 * GET /api/decks/:id/stream (gslides-parity SPEC-3 3.3; MILESTONES-3 B2 day 3): the room's
 * Server-Sent Events. `authorize(read)` at open and every 60 s, the stream counters of report 10
 * F24 (per identity, per address, per instance), a server issued `clientId` bound to the session
 * (F26), the tab's earlier ids of `?retire=` removed from this instance's roster (hotfix 2 cause
 * B1) and their stream slots released before this open's cap is judged (the focus round, cycle 3
 * stream fix round, VERIFICATION.md C3-F1), `hello` with the roster filtered by role (4.8) and the
 * editing count (0.9), the replay since `Last-Event-ID` or `?since=` (or `resync` past 2,000
 * entries, F25), then every event the reader may see, a heartbeat comment every 15 s, and a close
 * at a random point between 240 and 290 s with a `retry` between 1 and 4 s so tabs never reconnect
 * together. On the catch all function rule, never `/_serverFn`.
 *
 * The slot's release (C3-F1, the ship step's probe: a stream the client had closed kept its slot
 * for 73 s on the preview, so a tab that reloaded or reconnected a few times filled its own cap of
 * four): one `close()` runs the whole cleanup, idempotently, on every way a stream ends: the
 * lifetime timer, an access recheck that refuses, the request's abort, the body's `cancel()`
 * (the runtime saw the reader go), a failed write (the controller refused the bytes) and an error
 * while the stream is being set up. Whichever the runtime reports first releases the slot; the
 * others find it released. A refusal logs one line with the cap, the identity kind and the counts
 * and answers 503 with `retry-after`, which the room client reads for its reopen.
 *
 * The runtime that reports nothing (the cycle 3 stream fix round's seam step and the verifier's
 * five probe runs, VERIFICATION C3S.3a: on the preview a closed stream's abort and cancel never
 * arrive and its heartbeats are taken, so the slot lived until the lifetime timer) gets three
 * releases it can give: the tab's token on every open (`?tab=`) releases the tab's earlier slots
 * on this instance, hello or not, this deck or another (C3S-F2); a `leave` of this stream's own
 * client id (the tab's beacon, or a later open of the same tab retiring it, on whichever instance
 * it landed) closes the stream; and a reader whose presence has not reached this instance for
 * STREAM_PRESENCE_UNSEEN_MS after the grace is gone, judged at the heartbeat with no timer and no
 * store call of its own (`createReaderLiveness`). A refused open answers the client id it minted
 * in its body, so a page whose every open is refused still posts its writes over `POST /ops`
 * (the MAC admits the id on any instance; `clientBoundTo`), and every hello names the seq the
 * last checkpoint covered (`covered`), so a tab trims what it retained while its stream was down.
 * The subscription is taken before hello and `covered` is read after it, the events queued until
 * the replay is written (the stream fix round two, T1-R5), so a checkpoint that fires while hello
 * is being built is in `covered` or on the stream and never between the two.
 */

const AUTHORIZE_RECHECK_MS = 60_000;
/** The wait a refused open names (seconds), read by the room client's reopen. */
const STREAM_REFUSAL_RETRY_AFTER_S = 5;

export const Route = createFileRoute('/api/decks/$deckId/stream')({
  server: {
    handlers: {
      GET: ({ request, params }) => serve(request, params.deckId),
    },
  },
});

function logLine(line: string): void {
  console.error(`turboslide stream: ${line}`);
}

async function serve(request: Request, deckId: string): Promise<Response> {
  if (!SLUG_PATTERN.test(deckId)) return jsonResponse({ error: 'not_found' }, 404);
  const identity = await requestIdentity(request);
  const cookieHeaders: Record<string, string> =
    identity.setCookie === undefined ? {} : { 'set-cookie': identity.setCookie };
  let room;
  try {
    room = await roomFor(deckId);
  } catch (error) {
    if (error instanceof RangeError)
      return jsonResponse({ error: 'not_found' }, 404, cookieHeaders);
    throw error;
  }
  const decision = await decideFor(identity, deckId, 'read', 'stream');
  if (!decision.ok)
    return jsonResponse(denialBody(decision, 'read'), decision.status, cookieHeaders);
  const url = new URL(request.url);
  // the id is minted before the cap is judged so the slot is counted under it, and the tab's
  // earlier ids release their slots on this instance first (C3-F1: a reload or a reconnect
  // replaces the tab's earlier stream instead of adding to its count)
  const clientId = mintClientId(room.deckId, identity.identity);
  const retiring = retireCandidates(
    room.deckId,
    url.searchParams.get('retire'),
    identity,
    clientId,
  );
  const tab = tabTokenOf(url.searchParams.get('tab'));
  const slot = streamCounters().take(identity.identity, identity.kind, streamAddress(request), {
    clientId,
    retire: retiring,
    ...(tab === undefined ? {} : { tab }),
  });
  if (!slot.ok) {
    logLine(streamRefusalLine(deckId, identity.kind, slot));
    // the id rides the refusal: it names this deck and this identity (mintClientId's MAC), so
    // the ops and presence routes admit it on any instance and the page writes while it waits
    // for a slot (C3S-F2: a page whose every open was refused had no id and read Saving)
    return jsonResponse({ error: 'too_many_streams', cap: slot.cap, clientId }, 503, {
      ...cookieHeaders,
      'retry-after': String(STREAM_REFUSAL_RETRY_AFTER_S),
    });
  }
  const reader = await viewerFacts(deckId, decision, identity.ctx, identity.identity);
  await bindClient(room, identity, clientId);
  const lastEventId = request.headers.get('last-event-id');
  const since = url.searchParams.get('since');
  const position = Number(lastEventId ?? since ?? NaN);
  const lifetime = streamLifetimeMs();
  const retry = streamRetryMs();

  /* the one close of the stream (server/room.ts createStreamCloser): idempotent, and it owns the
     slot's release whatever has been set up by the time it runs */
  const closer = createStreamCloser(() => {
    slot.release();
    void room.channel.presence.leave(deckId, clientId).catch(() => undefined);
    // the card thumbnail once when the stream closes (docs/SYNC.md 3.10; the sync round,
    // build/b3.md R4): a pending render moves to now, held at the 8 s floor when one ran inside
    // it, and nothing renders when no write waits, so a reader's close costs nothing. The
    // dynamic import keeps the renderer out of this module's graph, as write.ts imports
    // scheduleCardThumb.
    void import('../../server/card-thumb')
      .then(({ flushCardThumb }) => flushCardThumb(deckId))
      .catch(() => undefined);
  }, request.signal);
  const { close, write } = closer;
  const liveness = createReaderLiveness();

  const body = new ReadableStream<Uint8Array>({
    async start(streamController) {
      closer.attach(streamController);
      if (closer.closed()) return;
      // the channel subscription, taken below before hello; the closer's one cleanup ends it once
      // the stream is set up, and the two exits before that (a close while hello is built, an
      // error in the set up) end it here
      let unsubscribe: (() => void) | undefined;
      try {
        // the tab's earlier ids leave this instance's roster before hello lists it (hotfix 2, B1):
        // a reload posts no leave and the blob tier's roster is per instance
        await retireClients(room, url.searchParams.get('retire'), identity, clientId);
        const recheck = async (fresh = false): Promise<void> => {
          // an access event names a share write: drop this instance's cached record first so the
          // recheck reads the record that write produced, on the redis tier at once when another
          // instance wrote it (VERIFICATION-3 finding 34; hotfix B request R3). On the blob tier
          // the event is process local and the drop repeats what the writer's hooks did.
          if (fresh) (await accessStore()).drop(deckId);
          const again = await decideFor(identity, deckId, 'read', 'stream');
          if (!again.ok || again.shadow !== undefined) {
            write(sseFrame({ type: 'access', revision: 0 }));
            if (!again.ok) close();
          }
        };
        const deliver = (event: RoomEvent): void => {
          // the reader's own signals, read before the reader's filter: its presence proves it
          // lives, its leave (the tab's beacon, or a later open of the tab retiring this id on
          // any instance) ends the stream, and the store's word suspends the judgement
          if (event.type === 'presence' && event.clientId === clientId) liveness.seen();
          else if (event.type === 'store') liveness.storeOk(event.ok);
          else if (event.type === 'leave' && event.clientId === clientId) {
            close();
            return;
          }
          const filtered = filterEventForReader(event, reader);
          if (filtered === null) return;
          if (filtered.type === 'op') write(sseFrame(filtered, filtered.entry.seq));
          else if (filtered.type === 'ops') {
            const last = filtered.entries[filtered.entries.length - 1];
            write(sseFrame(filtered, last?.seq));
          } else write(sseFrame(filtered));
          if (event.type === 'access') void recheck(true);
        };
        // the subscription comes before hello, and every event it sees until the replay is
        // written waits in `queued` (the stream fix round two, build/t1.md T1-R5): before this
        // the route read `covered`, wrote hello and the replay, and subscribed after, so a
        // `checkpoint` event published in that window (the memory tier's fires 2 s after the
        // last op, about when a refused stream's reopen lands) was neither in hello's `covered`
        // nor on the stream, and the tab kept its retained ops until the next checkpoint
        // (realtime.spec.ts:546's last line read unsaved). Now `covered` is read after the
        // subscription, so an event is in `covered` and the replay, or on the stream, never
        // between; an op the replay carried already is dropped from the queue, not written twice
        let replayedTo: number | null = null;
        const queued: RoomEvent[] = [];
        // the stream names its tab's client id, so the blob tier's pulse reads this tab's roster
        // row as its own and every other row as company, exact by id (realtime/channel.ts
        // SubscribeOptions.clientId; the features round, ship one hotfix)
        unsubscribe = room.channel.subscribe(
          deckId,
          (event) => {
            if (replayedTo === null) {
              queued.push(event);
              return;
            }
            deliver(event);
          },
          { clientId },
        );
        const roster = await room.channel.presence.roster(deckId);
        const live = await room.live();
        const hello: RoomEvent = {
          type: 'hello',
          seq: live.seq,
          revision: room.revision(),
          clientId,
          role: overEditingCeiling(roster, decision.role) ? 'viewer' : decision.role,
          clients: roster.map((entry) => rosterEntryForReader(entry, reader)),
          editing: editingCount(roster),
          tier: room.tier,
          covered: Math.max(0, Math.min(live.seq, room.covered())),
        };
        write(sseRetry(retry));
        write(sseFrame(hello, live.seq));
        const replay = await replayFor(
          room,
          Number.isFinite(position) ? position : live.seq,
          reader,
        );
        let written = live.seq;
        if (replay.type === 'ops') {
          if (replay.entries.length > 0) {
            const last = replay.entries[replay.entries.length - 1];
            write(sseFrame(replay, last?.seq));
            written = Math.max(written, last?.seq ?? written);
          }
        } else {
          write(sseFrame(replay));
        }
        if (closer.closed()) {
          unsubscribe();
          return;
        }
        replayedTo = written;
        for (const event of queued) {
          if (event.type === 'op' && event.entry.seq <= written) continue;
          if (event.type === 'ops') {
            const rest = event.entries.filter((entry) => entry.seq > written);
            if (rest.length === 0) continue;
            deliver({ type: 'ops', entries: rest });
            continue;
          }
          deliver(event);
        }
        queued.length = 0;
        const heartbeat = setInterval(() => {
          // a reader gone by the presence rule releases the slot here, where the runtime gives
          // no other signal (createReaderLiveness says why)
          if (liveness.gone()) {
            close();
            return;
          }
          write(sseComment());
        }, STREAM_HEARTBEAT_MS);
        const authorizeTimer = setInterval(() => void recheck(), AUTHORIZE_RECHECK_MS);
        const life = setTimeout(close, lifetime);
        const end = unsubscribe;
        closer.onClose(() => {
          end();
          clearInterval(heartbeat);
          clearInterval(authorizeTimer);
          clearTimeout(life);
        });
      } catch (error) {
        // the set up failed (the channel, the store): the slot goes with the stream, and the
        // reader sees the error instead of a stream that never says hello
        unsubscribe?.();
        close();
        try {
          streamController.error(error);
        } catch {
          // closed already
        }
      }
    },
    cancel() {
      close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      ...cookieHeaders,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'x-turboslide-client': clientId,
    },
  });
}
