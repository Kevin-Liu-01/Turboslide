import { createFileRoute } from '@tanstack/react-router';
import { handleActionRequest } from '@turboslide/agent/http/dispatch';
import { errorResponse, refuse } from '@turboslide/agent/http/errors';

import { DEFAULT_DECK, deckDispatcher } from '../../server/actions';
import { HTTP_DEFAULT_AUTHOR, requireAgentAuth } from '../../server/auth';
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
  const url = new URL(request.url);
  const deckId = url.searchParams.get('deck') || DEFAULT_DECK;
  let dispatcher;
  try {
    dispatcher = deckDispatcher(deckId).dispatcher;
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
