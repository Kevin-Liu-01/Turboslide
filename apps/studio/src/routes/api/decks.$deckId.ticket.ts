import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '@turboslide/agent/http/errors';
import { CLIENT_ID_PATTERN } from '@turboslide/realtime/protocol';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { readStoredAccessFresh } from '../../server/access';
import { denialBody } from '../../server/authorize';
import {
  clientIdMatches,
  decideFor,
  ensureRealtimeTier,
  mintClientId,
  realtimeTier,
  refuseCrossSite,
  requestIdentity,
  resolveRequestIdentity,
  viewerFacts,
} from '../../server/room';
import { mintRoomTicket, roomUrlFor, ticketClaimsFor } from '../../server/room-ticket';
import { hasStoredDeck } from '../../server/root';

/**
 * GET /api/decks/:id/ticket?client=<cid> (the Cloudflare move, docs/CLOUDFLARE.md 3.3, 3.6.1):
 * the refresh of the room ticket the editor loader minted into the page, same origin with the
 * cookie: `requestIdentity`, `decideFor('read', 'stream')`, the reader's facts, the client id's
 * own MAC (`clientIdMatches`, so a tab refreshes its own id alone), then `mintRoomTicket`. The
 * answer is `{ ticket, expiresAt, tier, url }` where `tier` is the instance's selection as the
 * hand off leaves it; on another tier the answer carries `tier` alone, which the transport reads
 * as the word to switch to (3.6.3). Refused with `denialBody` as the stream route refuses. The
 * tier is read after the hand off check and the access record past the cache (the realtime pass 1
 * fix round, findings 7 and 9).
 */

export const Route = createFileRoute('/api/decks/$deckId/ticket')({
  server: {
    handlers: {
      GET: ({ request, params }) => serve(request, params.deckId),
    },
  },
});

async function serve(request: Request, deckId: string): Promise<Response> {
  if (!SLUG_PATTERN.test(deckId)) return jsonResponse({ error: 'not_found' }, 404);
  const cross = refuseCrossSite(request);
  if (cross !== null)
    return jsonResponse({ error: cross.code, message: cross.message }, cross.status);
  const url = new URL(request.url);
  const given = url.searchParams.get('client');
  if (given !== null && !CLIENT_ID_PATTERN.test(given))
    return jsonResponse({ error: 'invalid', message: 'client is a server issued client id' }, 400);
  if (!(await hasStoredDeck(deckId))) return jsonResponse({ error: 'not_found' }, 404);
  // the hand off of 3.8 first (the Worker's `/health`, cached 60 s per instance): a Worker that is
  // off, unreachable or whose objects cannot reach this app names the blob tier here, which the
  // transport switches to after its 30 s of failed opens (VERIFICATION.md realtime pass 1 finding
  // 7: the object closed every open with 4500 `seed failed` and this route kept answering `do`)
  await ensureRealtimeTier().catch(() => undefined);
  // the access record past this instance's cache (finding 9): the route answers the object's
  // `reauth` within milliseconds of an access write on another instance, and the object asks
  // once (3.3), so a cached record let a revoked viewer keep its socket. One store read per
  // ticket, which a tab asks for every 8 minutes and at a reauth
  await readStoredAccessFresh(deckId).catch(() => undefined);
  const identity = await requestIdentity(request);
  const cookieHeaders: Record<string, string> =
    identity.setCookie === undefined ? {} : { 'set-cookie': identity.setCookie };
  const decision = await decideFor(identity, deckId, 'read', 'stream');
  if (!decision.ok)
    return jsonResponse(denialBody(decision, 'read'), decision.status, cookieHeaders);
  // a tab without a client id yet (a /new deck whose first write made it, R2-C3) is minted one
  // here as the stream route mints at its open; a tab that holds one refreshes its own alone
  if (given !== null && !clientIdMatches(deckId, given, identity.identity)) {
    return jsonResponse(
      { error: 'client_unbound', message: 'The client id is not this session’s' },
      403,
      cookieHeaders,
    );
  }
  const client = given ?? mintClientId(deckId, identity.identity);
  const tier = realtimeTier();
  if (tier !== 'do') return jsonResponse({ tier }, 200, cookieHeaders);
  const reader = await viewerFacts(deckId, decision, identity.ctx, identity.identity);
  const resolved = await resolveRequestIdentity(identity);
  const minted = mintRoomTicket(
    ticketClaimsFor({
      deckId,
      clientId: client,
      identity: identity.identity,
      kind: identity.kind,
      principalId: identity.principalId,
      role: decision.role,
      reader,
      resolved,
      origin: url.origin,
    }),
  );
  return jsonResponse(
    {
      ticket: minted.ticket,
      expiresAt: minted.expiresAt,
      tier,
      url: roomUrlFor(deckId),
      clientId: client,
    },
    200,
    { ...cookieHeaders, 'cache-control': 'no-store' },
  );
}
