import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '@turboslide/agent/http/errors';
import type { Entry } from '@turboslide/realtime/channel';
import { checkpointBodySchema } from '@turboslide/realtime/frames';
import type { CheckpointBody } from '@turboslide/realtime/frames';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { DeckStore } from '@turboslide/store/store';

import { flushCardThumb, scheduleCardThumb } from '../../server/card-thumb';
import { commitRuns, isStoreEntry } from '../../server/checkpoint';
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
 * past the foreign records (3.5) instead of the route committing them untransformed. The route
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
    return await commit(deckId, body);
  } catch (error) {
    // a deck removed while its object still held entries (the store's `No deck.json`): a 404 the
    // object reads as final, so its alarm stops retrying (VERIFICATION.md realtime pass 1 finding
    // 10: the route answered 500 and the alarm retried with backoff, one run per removed deck)
    if (error instanceof RangeError)
      return jsonResponse({ error: 'not_found', gone: true, message: error.message }, 404);
    throw error;
  }
}

async function commit(deckId: string, body: CheckpointBody): Promise<Response> {
  const room = await roomFor(deckId);
  const store = room.store;
  const synced = store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
  if (typeof synced.sync === 'function') await synced.sync(true).catch(() => undefined);
  const tier = realtimeTier();
  if (body.revision !== undefined) {
    const current = await store.revision();
    if (current !== body.revision) {
      // a write landed outside the object (a blob instance during the alias switch, a restore):
      // the object reloads at this revision and re-admits its tail transformed (3.5)
      return jsonResponse({ conflict: true, revision: current, tier }, 409);
    }
  }
  const entries: Entry[] = body.entries;
  const edits = entries.filter((entry) => entry.kind === 'edit' && !isStoreEntry(entry));
  const comments = entries.filter((entry) => entry.kind === 'comment');
  const before = edits.length > 0 ? (await store.read()).document : null;
  const result = await commitRuns(store, edits, (line) => log(`${deckId}: ${line}`));
  if (!result.ok) {
    return jsonResponse(
      { conflict: true, revision: result.revision, tier, committed: result.committed },
      409,
    );
  }
  let commentsResult: { revision: number; threadIds: string[] } | undefined;
  if (comments.length > 0) {
    try {
      commentsResult = await commentsApplierFor(deckId).apply(comments);
    } catch (error) {
      log(
        `${deckId}: comments did not land: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (result.committed.length > 0 && before !== null) {
    // the comment anchors follow their text (SPEC-3 0.52; room.ts appendShifts' sidecar half):
    // the shifts are applied to the sidecar here, since no stream entry rides the object for them
    try {
      const after = (await store.read()).document;
      const shifts = await shiftEntriesFor(room, edits, before, after);
      if (shifts.length > 0) {
        const shifted = await commentsApplierFor(deckId).apply(shifts);
        commentsResult = {
          revision: shifted.revision,
          threadIds: [...new Set([...(commentsResult?.threadIds ?? []), ...shifted.threadIds])],
        };
      }
    } catch (error) {
      log(
        `${deckId}: comment.shift did not land: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    scheduleCardThumb(deckId);
  }
  if (body.closed === true) flushCardThumb(deckId);
  const revision = await store.revision();
  return jsonResponse({
    committed: result.committed,
    skipped: result.skipped,
    revision,
    tier,
    ...(commentsResult === undefined ? {} : { comments: commentsResult }),
  });
}
