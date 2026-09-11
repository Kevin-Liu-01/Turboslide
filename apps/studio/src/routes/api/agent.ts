import { createFileRoute } from '@tanstack/react-router';
import { createDispatcher } from '@turboslide/agent/dispatch';
import { jsonResponse } from '@turboslide/agent/http/errors';
import { runtimeManifest } from '@turboslide/agent/http/manifest';

import { DEFAULT_DECK, deckDispatcher } from '../../server/actions';
import { requireAgentAuth } from '../../server/auth';
import { studioSessions } from '../../server/sessions';

// GET /api/agent (SPEC 3.4, 7.4, 7.5; MILESTONES M4 item 1): the manifest an agent reads first.
// The generated document (packages/agent/generated/manifest.json: transports, rules, execution
// rules, skills, resources) with what only this instance knows: the actions with a handler here
// and the ones declared for a later milestone, whether a token is required, the attached studio
// pages, and the window API's action list under `actions`, which the window-api spec compares
// with describe().actions in the page. ?deck= names the deck whose dispatcher is described; an
// unknown deck still answers, with the pending list saying every action waits for a deck.

export const Route = createFileRoute('/api/agent')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireAgentAuth(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const deckId = url.searchParams.get('deck') || DEFAULT_DECK;
        let dispatcher;
        let note: string | undefined;
        try {
          dispatcher = deckDispatcher(deckId, { withView: true }).dispatcher;
        } catch (error) {
          dispatcher = createDispatcher();
          note = error instanceof Error ? error.message : String(error);
        }
        const manifest = runtimeManifest({
          dispatcher,
          sessions: studioSessions().list(),
          defaultDeck: deckId,
        });
        return jsonResponse(note === undefined ? manifest : { ...manifest, note });
      },
    },
  },
});
