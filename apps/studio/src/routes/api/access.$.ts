import { createFileRoute } from '@tanstack/react-router';
import { jsonResponse } from '@turboslide/agent/http/errors';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { shareGetFor } from '../../server/access';
import { authorizeMode } from '../../server/authorize';
import { refuseCrossSite, requestIdentity } from '../../server/room';

/**
 * GET /api/access/<deckId> (gslides-parity SPEC-3 6.1, 6.2, 11.3; MILESTONES-3 B2 day 5): the
 * caller's standing on a deck as a server route the WAF sees (R16): the role, how it was reached,
 * the capabilities, and the record shaped for the caller (the whole record for a share holder,
 * the owner, the general access and the own grant for anyone else). A stranger on a restricted
 * or missing deck gets one 404 (6.2), so the route never says whether a deck exists. The tab
 * re-reads it on every `access` event of the stream.
 *
 * The focus round (docs/FOCUS.md section 5 rank 1): the answer also names the deployment's
 * `TURBOSLIDE_AUTHORIZE` mode as `authorize`, `shadow` or `enforce`, so the Share dialog can say
 * which mode the deployment runs and promise nothing shadow mode does not enforce, and so a
 * driven row can record the mode it ran in. The mode is deployment wide and not a secret.
 */

export const Route = createFileRoute('/api/access/$')({
  server: {
    handlers: {
      GET: ({ request, params }) => serve(request, params._splat ?? ''),
    },
  },
});

async function serve(request: Request, splat: string): Promise<Response> {
  const deckId = splat.split('/')[0] ?? '';
  if (!SLUG_PATTERN.test(deckId)) return jsonResponse({ error: 'not_found' }, 404);
  const cross = refuseCrossSite(request);
  if (cross !== null)
    return jsonResponse({ error: cross.code, message: cross.message }, cross.status);
  const identity = await requestIdentity(request);
  const cookie: Record<string, string> =
    identity.setCookie === undefined ? {} : { 'set-cookie': identity.setCookie };
  const result = await shareGetFor(identity, deckId);
  if (!result.ok) return jsonResponse(result.body, result.status, cookie);
  return jsonResponse({ ...result.value, authorize: authorizeMode() }, 200, {
    ...cookie,
    'cache-control': 'no-store',
  });
}
