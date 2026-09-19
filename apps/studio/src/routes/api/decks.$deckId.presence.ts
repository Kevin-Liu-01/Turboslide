import { createFileRoute } from '@tanstack/react-router';
import { jsonResponse } from '@turboslide/agent/http/errors';
import { PRESENCE_MAX_BYTES, presencePostSchema } from '@turboslide/realtime/protocol';
import type { PresencePost } from '@turboslide/realtime/protocol';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { denialBody } from '../../server/authorize';
import {
  CLIENT_BINDING_TTL_MS,
  PRESENCE_EXPIRY_MS,
  clientBoundTo,
  decideFor,
  leavePresence,
  presenceBudget,
  readJsonBody,
  refuseCrossSite,
  refuseNonJson,
  requestIdentity,
  roomFor,
  rosterEntryFor,
  storeRefusalOf,
} from '../../server/room';
import type { RequestIdentity } from '../../server/room';

/**
 * POST /api/decks/:id/presence (gslides-parity SPEC-3 3.3, 3.8; MILESTONES-3 B2 day 3): one
 * client's state, at most one batch per 80 ms coalesced to 15 a second. The body carries only
 * what the client owns (`clientId`, `clock`, `slideId`, `selection`, `pointer`, `follow`,
 * `pointerOn`, `presenting`); an identity field in the body is `unknown_field` (report 10 F31)
 * and the server writes the identity from the session into the roster. `?leave=1` removes the
 * entry (a closing tab's beacon) and hands the beacon's clock to the roster, so a state of the
 * same tab whose handler runs after the leave (the roster read below takes a head and a get on
 * the blob tier) never brings the row back (room.ts `leavePresence`; b4.md C3T-R2). The client
 * binding is refreshed on every state.
 */

export const Route = createFileRoute('/api/decks/$deckId/presence')({
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
  const body = await readJsonBody(request, PRESENCE_MAX_BYTES * 2);
  if (!body.ok)
    return jsonResponse(
      { error: body.refusal.code, message: body.refusal.message },
      body.refusal.status,
    );
  const parsed = presencePostSchema.safeParse(body.value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const unknown = first?.code === 'unrecognized_keys';
    return jsonResponse(
      {
        error: unknown ? 'unknown_field' : 'invalid',
        pointer: `/${first?.path.map(String).join('/') ?? ''}`,
        message: first?.message ?? 'invalid',
        ...(unknown && 'keys' in (first as { keys?: unknown })
          ? { keys: (first as { keys: string[] }).keys }
          : {}),
      },
      400,
    );
  }
  const identity = await requestIdentity(request);
  try {
    return await serveState(request, deckId, identity, parsed.data);
  } catch (error) {
    // the store refused under the route (the room's open, the shared roster's record, a fresh
    // deck's file the edge answers 403 for; VERIFICATION C3S-F4): the product's 503 with
    // `retry-after`, which the room client's next batch follows, never the framework's 500
    const busy = storeRefusalOf(error);
    if (busy !== null)
      return jsonResponse(busy.body, busy.status, { 'retry-after': String(busy.retryAfterS) });
    throw error;
  }
}

async function serveState(
  request: Request,
  deckId: string,
  identity: RequestIdentity,
  state: PresencePost,
): Promise<Response> {
  let room;
  try {
    room = await roomFor(deckId);
  } catch (error) {
    if (error instanceof RangeError) return jsonResponse({ error: 'not_found' }, 404);
    throw error;
  }
  // the binding: the channel's, or on a per instance tier the id's own signature (room.ts
  // clientBoundTo; VERIFICATION-3 finding 25: the presence POST answered 403 on the preview)
  if (!(await clientBoundTo(room, state.clientId, identity))) {
    return jsonResponse({ error: 'client_unbound', message: 'Open the stream first' }, 403);
  }
  const decision = await decideFor(identity, deckId, 'presence', 'presence');
  if (!decision.ok) return jsonResponse(denialBody(decision, 'presence'), decision.status);
  const url = new URL(request.url);
  if (url.searchParams.get('leave') === '1') {
    await leavePresence(room, state.clientId, state.clock);
    return jsonResponse({ ok: true, left: true });
  }
  if (!(await presenceBudget(room, state.clientId))) {
    return jsonResponse({ ok: true, dropped: true });
  }
  const roster = await room.channel.presence.roster(deckId);
  const entry = await rosterEntryFor(room, identity, decision.role, state, roster);
  await room.channel.presence.set(deckId, state.clientId, entry, PRESENCE_EXPIRY_MS);
  await room.channel.presence.bind(
    deckId,
    state.clientId,
    identity.identity,
    CLIENT_BINDING_TTL_MS,
  );
  return jsonResponse({ ok: true, hueSlot: entry.hueSlot, role: entry.role });
}
