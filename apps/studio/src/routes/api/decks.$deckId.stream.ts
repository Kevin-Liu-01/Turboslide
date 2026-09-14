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
  decideFor,
  editingCount,
  filterEventForReader,
  overEditingCeiling,
  replayFor,
  requestIdentity,
  roomFor,
  rosterEntryForReader,
  streamAddress,
  streamCounters,
  viewerFacts,
} from '../../server/room';

/**
 * GET /api/decks/:id/stream (gslides-parity SPEC-3 3.3; MILESTONES-3 B2 day 3): the room's
 * Server-Sent Events. `authorize(read)` at open and every 60 s, the stream counters of report 10
 * F24 (per identity, per address, per instance), a server issued `clientId` bound to the session
 * (F26), `hello` with the roster filtered by role (4.8) and the editing count (0.9), the replay
 * since `Last-Event-ID` or `?since=` (or `resync` past 2,000 entries, F25), then every event the
 * reader may see, a heartbeat comment every 15 s, and a close at a random point between 240 and
 * 290 s with a `retry` between 1 and 4 s so tabs never reconnect together. On the catch all
 * function rule, never `/_serverFn`.
 */

const AUTHORIZE_RECHECK_MS = 60_000;

export const Route = createFileRoute('/api/decks/$deckId/stream')({
  server: {
    handlers: {
      GET: ({ request, params }) => serve(request, params.deckId),
    },
  },
});

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
  const slot = streamCounters().take(identity.identity, identity.kind, streamAddress(request));
  if (!slot.ok) {
    return jsonResponse({ error: 'too_many_streams', cap: slot.cap }, 503, {
      ...cookieHeaders,
      'retry-after': '5',
    });
  }
  const reader = await viewerFacts(deckId, decision, identity.ctx, identity.identity);
  const clientId = await bindClient(room, identity);
  const url = new URL(request.url);
  const lastEventId = request.headers.get('last-event-id');
  const since = url.searchParams.get('since');
  const position = Number(lastEventId ?? since ?? NaN);
  const encoder = new TextEncoder();
  const lifetime = streamLifetimeMs();
  const retry = streamRetryMs();
  let cleanup: (() => void) | undefined;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (text: string): void => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          open = false;
        }
      };
      const close = (): void => {
        if (!open) return;
        open = false;
        cleanup?.();
        try {
          controller.close();
        } catch {
          // closed by the reader already
        }
      };
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
      };
      write(sseRetry(retry));
      write(sseFrame(hello, live.seq));
      const replay = await replayFor(room, Number.isFinite(position) ? position : live.seq, reader);
      if (replay.type === 'ops') {
        if (replay.entries.length > 0) {
          write(sseFrame(replay, replay.entries[replay.entries.length - 1]?.seq));
        }
      } else {
        write(sseFrame(replay));
      }
      const unsubscribe = room.channel.subscribe(deckId, (event) => {
        const filtered = filterEventForReader(event, reader);
        if (filtered === null) return;
        if (filtered.type === 'op') write(sseFrame(filtered, filtered.entry.seq));
        else if (filtered.type === 'ops') {
          const last = filtered.entries[filtered.entries.length - 1];
          write(sseFrame(filtered, last?.seq));
        } else write(sseFrame(filtered));
        if (event.type === 'access') void recheck(true);
      });
      const heartbeat = setInterval(() => write(sseComment()), STREAM_HEARTBEAT_MS);
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
      const authorizeTimer = setInterval(() => void recheck(), AUTHORIZE_RECHECK_MS);
      const life = setTimeout(close, lifetime);
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
        clearInterval(authorizeTimer);
        clearTimeout(life);
        slot.release();
        void room.channel.presence.leave(deckId, clientId).catch(() => undefined);
      };
      request.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      cleanup?.();
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
