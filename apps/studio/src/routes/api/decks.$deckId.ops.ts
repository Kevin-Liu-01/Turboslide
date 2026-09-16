import { createFileRoute } from '@tanstack/react-router';
import { jsonResponse } from '@turboslide/agent/http/errors';
import { checkPostCaps } from '@turboslide/realtime/admission';
import { opsPostSchema } from '@turboslide/realtime/protocol';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { denialBody } from '../../server/authorize';
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
  const result = await admitOps(room, {
    post: parsed.data,
    bytes: body.bytes,
    identity,
    author: authorOf(identity),
    role: decision.role,
  });
  if (!result.ok) {
    return jsonResponse(
      {
        error: result.code,
        message: result.message,
        ...(result.head === undefined ? {} : { head: result.head }),
        // the entries since the client's base on a blob tier 409 (SPEC-5-amendments A3 item 3)
        ...(result.since === undefined ? {} : { since: result.since }),
      },
      result.status,
      result.retryAfterMs === undefined
        ? {}
        : { 'retry-after': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) },
    );
  }
  return jsonResponse({
    ok: true,
    entries: result.entries,
    rejected: result.rejected,
    head: result.head,
    revision: result.revision,
  });
}
