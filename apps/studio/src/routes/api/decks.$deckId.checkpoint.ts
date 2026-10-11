import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '@turboslide/agent/http/errors';
import { checkpointBodySchema } from '@turboslide/realtime/frames';
import type { CheckpointBody } from '@turboslide/realtime/frames';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { DeckStore } from '@turboslide/store/store';

import { flushCardThumb, scheduleCardThumb } from '../../server/card-thumb';
import { answerCheckpoint } from '../../server/checkpoint';
import { commentsApplierFor, shiftEntriesFor } from '../../server/comments';
import { realtimeTier, roomFor } from '../../server/room';
import { roomBearerMatches } from '../../server/room-bearer';

/**
 * POST /api/decks/:id/checkpoint (the Cloudflare move, docs/CLOUDFLARE.md 3.5, 3.6.1): the deck's
 * Durable Object posts the entries above its `covered` under the room bearer, and this route runs
 * the existing commit path against the store: one Write per coalesced run (`commitRuns`, with
 * `origin: { clientId, opIds }` on every record), the comment entries to the comments applier,
 * the comment anchors shifted past the landed edits (`appendShifts`' sidecar half), the card
 * thumbnail scheduled after an edit and flushed when the object says `closed`. The body names the
 * object's `revision` when it knows one; a store at another revision is answered 409
 * `{ conflict: true, revision }` before anything is written, so the object re-admits its entries
 * past the foreign records (3.5) instead of the route committing them untransformed, unless the
 * records above that revision are the post's own first attempt, whose entries are answered from
 * the log (checkpoint.ts `planCheckpoint`, hardening HR-RT#1). The route stops between runs once
 * the object's call is gone (`request.signal`). The work itself is `answerCheckpoint`. The route
 * is tier agnostic by construction: it commits whatever the instance's tier and names it in the
 * answer, which 3.8 relies on for the rollback. The body cap is Vercel's 4.5 MB; a run is at most
 * 2,000 entries or 1 MB.
 */

export const Route = createFileRoute('/api/decks/$deckId/checkpoint')({
  server: {
    handlers: {
      POST: ({ request, params }) => serve(request, params.deckId),
    },
  },
});

function log(line: string): void {
  console.error(`turboslide checkpoint route: ${line}`);
}

async function serve(request: Request, deckId: string): Promise<Response> {
  if (!SLUG_PATTERN.test(deckId)) return jsonResponse({ error: 'not_found' }, 404);
  if (!roomBearerMatches(request)) return jsonResponse({ error: 'bearer' }, 401);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json', message: 'The body is not JSON' }, 400);
  }
  const parsed = checkpointBodySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return jsonResponse(
      {
        error: 'invalid',
        pointer: `/${first?.path.map(String).join('/') ?? ''}`,
        message: first?.message ?? 'invalid',
      },
      400,
    );
  }
  const body = parsed.data;
  try {
    return await commit(deckId, body, request.signal);
  } catch (error) {
    // a deck removed while its object still held entries (the store's `No deck.json`): a 404 the
    // object reads as final, so its alarm stops retrying (VERIFICATION.md realtime pass 1 finding
    // 10: the route answered 500 and the alarm retried with backoff, one run per removed deck)
    if (error instanceof RangeError)
      return jsonResponse({ error: 'not_found', gone: true, message: error.message }, 404);
    throw error;
  }
}

async function commit(deckId: string, body: CheckpointBody, signal: AbortSignal): Promise<Response> {
  const room = await roomFor(deckId);
  const store = room.store;
  const synced = store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
  if (typeof synced.sync === 'function') await synced.sync(true).catch(() => undefined);
  const tier = realtimeTier();
  const reply = await answerCheckpoint(
    {
      store,
      comments: commentsApplierFor(deckId),
      shifts: (edits, before, after) => shiftEntriesFor(room, edits, before, after),
      log: (line) => log(`${deckId}: ${line}`),
      signal,
    },
    body,
  );
  if (reply.status === 200) {
    if (reply.landed > 0) scheduleCardThumb(deckId);
    if (body.closed === true) flushCardThumb(deckId);
  }
  return jsonResponse({ ...reply.body, tier }, reply.status);
}
