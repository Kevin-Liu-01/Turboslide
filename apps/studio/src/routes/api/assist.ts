import { createFileRoute } from '@tanstack/react-router';

import { deckDispatcher } from '../../server/actions';
import { logAssistLine, registerAssistActions } from '../../server/assist';
import { handleAssistRequest } from '../../server/assist-route';
import type { AssistRouteDeps } from '../../server/assist-route';
import { flagOn } from '../../server/flags';
import { checkAssistQuotas, tierOf } from '../../server/ratelimit';
import {
  authorOf,
  decideFor,
  flushRoom,
  readJsonBody,
  refuseCrossSite,
  refuseNonJson,
  requestIdentity,
} from '../../server/room';
import { openDeckStore } from '../../server/root';

// POST /api/assist?deck=<id> (docs/PRODUCT.md 6.3, judge-design rejection 11 and addition 6): the
// assist's own route beside the render, export and bundle routes, so a WAF rule (R22) and a
// function duration can name it; not a `createServerFn`, because TanStack Start posts every server
// function to `/_serverFn/<id>` and firewall rule R1 counts them as one path. The body is one JSON
// object `{ action: 'assist.propose' | 'assist.accept', input }` in the action table's shapes.
//
// This file binds the runtime seams; the logic is B7's `server/assist-route.ts` (the request
// rules, `authorize()` with the request's identity, the `assist` and `readOnly` switches, the two
// assist quotas on a propose, one refusal shape and the audit line) and the handlers are B6's
// `server/assist.ts` (`registerAssistActions`: the prompt, the model call, the card's validation
// and signature), registered on the deck dispatcher when it lacks them, so the route serves the
// panel before and after the integrator's build/b6.md R3. B6 wrote a first version of this
// binding over B7's on 2026-09-19 (build/b6.md section 4 records it) and rebound it to
// `handleAssistRequest` the same night; B7 owns the file (PRODUCT.md section 7).

export const Route = createFileRoute('/api/assist')({
  server: {
    handlers: {
      GET: ({ request }) => serve(request),
      POST: ({ request }) => serve(request),
      PUT: ({ request }) => serve(request),
      DELETE: ({ request }) => serve(request),
    },
  },
});

const deps: AssistRouteDeps = {
  identity: (request) => requestIdentity(request),
  decide: (identity, deckId, capability, action) => decideFor(identity, deckId, capability, action),
  flagOn: (name) => flagOn(name),
  quotas: (ctx) => checkAssistQuotas(ctx),
  tierOf: (identity) => tierOf(identity.ctx),
  authorOf: (identity) => authorOf(identity),
  dispatch: async (deckId, action, input, author) => {
    // an accept re bases the card on the store's document: on the memory tier the tab's last
    // edits sit in the stream until the checkpointer writes them, so the room is flushed first
    // (b7.md F6's flush, the read actions route does the same)
    if (action === 'assist.accept') await flushRoom(deckId);
    const { dispatcher } = await deckDispatcher(deckId);
    if (!dispatcher.has(action)) {
      registerAssistActions(dispatcher, {
        store: await openDeckStore(deckId),
        deckId,
        log: logAssistLine,
      });
    }
    return dispatcher.dispatch(action, input, { author });
  },
  refuseCrossSite,
  refuseNonJson,
  readJsonBody,
};

function serve(request: Request): Promise<Response> {
  return handleAssistRequest(request, deps);
}
