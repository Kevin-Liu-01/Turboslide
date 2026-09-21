import { createFileRoute } from '@tanstack/react-router';
import { jsonResponse } from '@turboslide/agent/http/errors';
import { checkPostCaps } from '@turboslide/realtime/admission';
import { opsPostSchema } from '@turboslide/realtime/protocol';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { denialBody } from '../../server/authorize';
import { scheduleCardThumb } from '../../server/card-thumb';
import {
  OPS_BODY_MAX_BYTES,
  admitOps,
  authorOf,
  decideFor,
  readJsonBody,
  refuseCrossSite,
  refuseNonJson,
  requestIdentity,
  roomFor,
  storeRefusalOf,
} from '../../server/room';

/**
 * POST /api/decks/:id/ops (gslides-parity SPEC-3 3.3, 3.4; MILESTONES-3 B2 day 3): a client's
 * batch of operations against its `base.seq`. Same origin and `application/json` (8.7), at most
 * 64 entries and 256 kB before any transform (3.4 step 1), `authorize(write)` for edits and
 * `authorize(comment)` for comment entries, the client binding (F26), the budgets, the base
 * window (F28), the transform, the reducer and the validator, the compare and append. The answer
 * carries the admitted entries with their seq and the rejected ones with a fixed reason and
 * nothing else about the deck (F29); every admitted entry also arrives on the stream.
 */

export const Route = createFileRoute('/api/decks/$deckId/ops')({
  server: {
    handlers: {
      POST: ({ request, params }) => serve(request, params.deckId),
    },
  },
});

async function serve(request: Request, deckId: string): Promise<Response> {
  if (!SLUG_PATTERN.test(deckId)) return jsonResponse({ error: 'not_found' }, 404);
  const cross = refuseCrossSite(request);
  if (cross !== null)
    return jsonResponse({ error: cross.code, message: cross.message }, cross.status);
  const type = refuseNonJson(request);
  if (type !== null) return jsonResponse({ error: type.code, message: type.message }, type.status);
  const body = await readJsonBody(request, OPS_BODY_MAX_BYTES);
  if (!body.ok)
    return jsonResponse(
      { error: body.refusal.code, message: body.refusal.message },
      body.refusal.status,
    );
  const parsed = opsPostSchema.safeParse(body.value);
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
  const caps = checkPostCaps(parsed.data.entries.length, body.bytes);
  if (!caps.ok) return jsonResponse({ error: caps.reason, message: caps.message }, caps.status);
  const identity = await requestIdentity(request);
  let room;
  try {
    room = await roomFor(deckId);
  } catch (error) {
    if (error instanceof RangeError) return jsonResponse({ error: 'not_found' }, 404);
    // the store refused the room's open (a 429, a 5xx, the deadline, an edge answering 403 on
    // a fresh deck's file; VERIFICATION C3S-F4): the product's 503, never the framework's 500
    const busy = storeRefusalOf(error);
    if (busy !== null)
      return jsonResponse(busy.body, busy.status, { 'retry-after': String(busy.retryAfterS) });
    throw error;
  }
  const hasEdits = parsed.data.entries.some((entry) => entry.kind === 'edit');
  const hasComments = parsed.data.entries.some((entry) => entry.kind === 'comment');
  const decision = await decideFor(identity, deckId, hasEdits ? 'write' : 'comment', 'ops');
  if (!decision.ok)
    return jsonResponse(denialBody(decision, hasEdits ? 'write' : 'comment'), decision.status);
  if (hasEdits && hasComments) {
    const comment = await decideFor(identity, deckId, 'comment', 'ops');
    if (!comment.ok) return jsonResponse(denialBody(comment, 'comment'), comment.status);
  }
  let result: Awaited<ReturnType<typeof admitOps>>;
  try {
    result = await admitOps(room, {
      post: parsed.data,
      bytes: body.bytes,
      identity,
      author: authorOf(identity),
      role: decision.role,
    });
  } catch (error) {
    // the store did not answer within its deadline (packages/store blob-store.ts
    // BlobTimeoutError, the focus round's cycle 2): a transient answer the client resends after
    // `retry-after`, never the framework's 500 the client read as a refusal of the change (the
    // cycle 2 enforce preview: "A change was not applied HTTPError" on every row after a stalled
    // head; the integrator at the merge, for b7). The error's name is read, since a bundle can
    // carry two copies of the store module
    if (error instanceof Error && error.name === 'BlobTimeoutError') {
      return jsonResponse({ error: 'store_timeout', message: error.message }, 503, {
        'retry-after': '1',
      });
    }
    // every other refusal of the store under the admission (the mirror's pull on the base
    // check, the record; C3S-F4): the same transient answer, in the product's words
    const busy = storeRefusalOf(error);
    if (busy !== null)
      return jsonResponse(busy.body, busy.status, { 'retry-after': String(busy.retryAfterS) });
    throw error;
  }
  /* every write answer names the instance's document revision in `x-turboslide-revision` beside
     the request's `baseRevision` (docs/FOCUS.md rank 3, the reproduction step): a probe records
     both on every refused write, so an instance behind the client is read from the wire */
  if (!result.ok) {
    return jsonResponse(
      {
        error: result.code,
        message: result.message,
        ...(result.head === undefined ? {} : { head: result.head }),
      },
      result.status,
      {
        'x-turboslide-revision': String(result.head ?? ''),
        ...(result.retryAfterMs === undefined
          ? {}
          : { 'retry-after': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) }),
      },
    );
  }
  // the card's capture on save (server/card-thumb.ts): slide 1 renders once the edits settle
  if (hasEdits && result.entries.length > 0) scheduleCardThumb(deckId);
  return jsonResponse(
    {
      ok: true,
      entries: result.entries,
      rejected: result.rejected,
      head: result.head,
      revision: result.revision,
      // the entries between the tab's position and its own, so the answer settles the ops with
      // no stream delivery under them (VERIFICATION C3S-F8). For a writer with the write right
      // alone: the entries are the stream's unfiltered ones, and a comment only POST from a
      // commenter, whose stream strips the notes, is answered as before
      ...(result.between !== undefined && hasEdits ? { between: result.between } : {}),
    },
    200,
    { 'x-turboslide-revision': String(result.revision ?? result.head ?? '') },
  );
}
