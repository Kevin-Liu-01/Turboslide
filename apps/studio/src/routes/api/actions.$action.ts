import { createFileRoute } from '@tanstack/react-router';
import { handleActionRequest, refuseSpoofedLocalhost } from '@turboslide/agent/http/dispatch';
import { errorResponse, jsonResponse, refuse } from '@turboslide/agent/http/errors';

import { DEFAULT_DECK, deckDispatcher } from '../../server/actions';
import { agentAuth, HTTP_DEFAULT_AUTHOR, requireAgentAuth } from '../../server/auth';
import {
  authorize,
  bootstrapAgentContext,
  capabilityForAction,
  denialBody,
  identityLabel,
} from '../../server/authorize';
import { assertFlag } from '../../server/flags';
import { refuseForeignOrigin } from '../../server/headers';
import { RateLimitedError, checkQuota, rateLimitedResponse } from '../../server/ratelimit';
import { deckDir } from '../../server/root';

// /api/actions/:action (SPEC 3.4, 7.1, 11; MILESTONES M4 item 1): POST runs one action of the
// table through the studio's dispatcher (server/actions.ts), GET returns its contract. The
// request rules live in @turboslide/agent/http/dispatch (framework free, unit tested): the bearer
// token off localhost, the 1 MB body cap, one JSON object as the input, the author from
// x-turboslide-author, ?deck= for the deck, ?force=1 to write past another author's lease, and
// the one error body with the status of the error class (409 with the current document and the
// holder). The dispatcher is built per request over the deck named, so a deck created a moment
// ago is served and a removed one is a 404; the store, the worker client and the session
// registry behind it are per process.
//
// Round three (gslides-parity SPEC-3 6.2, 8.8, 11.5 R3): the localhost rule holds only when every
// host the request names is local (TURBOSLIDE_TRUST_PROXY, server/headers.ts), and authorize()
// runs before the deck is opened, in shadow mode this round: the bootstrap bearer and a
// checkout's localhost surface act as the admin (SPEC-3 0.23) until B3's key resolver binds
// API key records (day four).

export const Route = createFileRoute('/api/actions/$action')({
  server: {
    handlers: {
      GET: ({ params, request }) => serve(request, params.action),
      POST: ({ params, request }) => serve(request, params.action),
      PUT: ({ params, request }) => serve(request, params.action),
      DELETE: ({ params, request }) => serve(request, params.action),
    },
  },
});

async function serve(request: Request, action: string): Promise<Response> {
  // the token check runs before the deck is looked up, so a probe off localhost learns nothing
  const denied = requireAgentAuth(request);
  if (denied) return denied;
  const auth = agentAuth(request);
  if (auth.ok && auth.mode === 'localhost') {
    const spoofed = refuseSpoofedLocalhost(request);
    if (spoofed !== null) return spoofed;
  }
  // a browser page may call the agent surface from the studio's own origin only (SPEC-3 8.7)
  const foreign = refuseForeignOrigin(request);
  if (foreign !== null) return foreign;
  const url = new URL(request.url);
  const deckId = url.searchParams.get('deck') || DEFAULT_DECK;
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    const capability = capabilityForAction(action);
    if (auth.ok) {
      const ctx = bootstrapAgentContext(auth.mode);
      if (capability !== null) {
        const decision = await authorize(ctx, deckId, capability, { action, transport: 'http' });
        if (!decision.ok) return jsonResponse(denialBody(decision, capability), decision.status);
      }
      if (capability !== null && capability !== 'read' && capability !== 'readComments') {
        // the read only switch and the writes per minute per deck quota (SPEC-3 8.3, 8.12)
        const identity = identityLabel(ctx) ?? 'agent:http';
        try {
          await assertFlag('readOnly', { identity, deckId, action });
        } catch (error) {
          return jsonResponse(
            { error: 'unavailable', message: error instanceof Error ? error.message : 'read only' },
            503,
            { 'retry-after': '60' },
          );
        }
        const refused = await checkQuota('writesPerMinutePerDeck', {
          identity,
          tier: 'agent',
          deckId,
          action,
          transport: 'http',
        });
        if (refused instanceof RateLimitedError) return rateLimitedResponse(refused);
      }
    }
  }
  let dispatcher;
  try {
    dispatcher = (await deckDispatcher(deckId)).dispatcher;
  } catch (error) {
    if (error instanceof RangeError) return refuse(404, 'unknown_deck', error.message, { action });
    return errorResponse(error, action);
  }
  return handleActionRequest(request, action, {
    dispatcher,
    defaultDeck: deckId,
    deckDir: (id) => deckDir(id),
    defaultAuthor: HTTP_DEFAULT_AUTHOR,
    onDispatch: (event) => {
      if (process.env.TURBOSLIDE_AGENT_LOG === '1') {
        console.error(
          `agent http: ${event.action} ${event.status} ${event.ms} ms deck=${event.deckId ?? '-'} author=${event.author.kind === 'agent' ? `agent:${event.author.runId ?? ''}` : event.author.name}${event.force ? ' force' : ''}`,
        );
      }
    },
  });
}
