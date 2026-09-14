import { createFileRoute } from '@tanstack/react-router';
import { jsonResponse } from '@turboslide/agent/http/errors';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import type { ActionId } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { shareGetFor, shareWriteFor } from '../../server/access';
import { readJsonBody, refuseCrossSite, refuseNonJson, requestIdentity } from '../../server/room';

/**
 * POST /api/share/<deckId>/<action> (gslides-parity SPEC-3 6.9, 11.3; MILESTONES-3 B2 day 5): the
 * share and publish actions as a server route the WAF sees (R16). `share.get` answers the record
 * shaped for the caller from the access store (6.1) with the caller's role, via and
 * capabilities. The writes run B1's record functions (apps/cli/src/records/access.ts) over the
 * access store's `load` and `save` with `ifMatch` (server/access.ts `hostedAccessHooks`); until
 * `@turboslide/cli` exports them to the studio (b2.md request R8) they answer 501 with the id.
 */

const BODY_MAX_BYTES = 64 * 1024;

const SHARE_IDS = new Set<string>([
  'share.get',
  'share.setGeneralAccess',
  'share.createLink',
  'share.revokeLink',
  'share.rotateLink',
  'share.stop',
  'share.invite',
  'share.setRole',
  'share.remove',
  'share.setExpiry',
  'share.settings',
  'share.requestAccess',
  'share.listRequests',
  'share.respond',
  'share.transferOwnership',
  'share.acceptOwnership',
  'share.declineOwnership',
  'share.claim',
  'share.emailCollaborators',
  'deck.publish',
  'deck.unpublish',
]);

export const Route = createFileRoute('/api/share/$')({
  server: {
    handlers: {
      POST: ({ request, params }) => serve(request, params._splat ?? ''),
    },
  },
});

async function serve(request: Request, splat: string): Promise<Response> {
  const [deckId = '', word = ''] = splat.split('/');
  const action = word.includes('.') ? word : `share.${word}`;
  if (!SLUG_PATTERN.test(deckId) || !SHARE_IDS.has(action) || !isActionId(action))
    return jsonResponse({ error: 'not_found' }, 404);
  const cross = refuseCrossSite(request);
  if (cross !== null)
    return jsonResponse({ error: cross.code, message: cross.message }, cross.status);
  const type = refuseNonJson(request);
  if (type !== null) return jsonResponse({ error: type.code, message: type.message }, type.status);
  const body = await readJsonBody(request, BODY_MAX_BYTES);
  if (!body.ok)
    return jsonResponse(
      { error: body.refusal.code, message: body.refusal.message },
      body.refusal.status,
    );
  const schema = ACTIONS[action as ActionId].input;
  // `share.get` and `share.listRequests` name the deck in their input; the route's path is that id
  const takesId =
    'shape' in schema &&
    typeof schema.shape === 'object' &&
    schema.shape !== null &&
    'id' in schema.shape;
  const parsed = schema.safeParse({
    ...(body.value as object),
    ...(takesId ? { id: deckId } : {}),
  });
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
  const identity = await requestIdentity(request);
  const cookie: Record<string, string> =
    identity.setCookie === undefined ? {} : { 'set-cookie': identity.setCookie };
  if (action === 'share.get') {
    const result = await shareGetFor(identity, deckId);
    if (!result.ok) return jsonResponse(result.body, result.status, cookie);
    return jsonResponse(result.value, 200, cookie);
  }
  const result = await shareWriteFor(identity, deckId, action, parsed.data);
  if (!result.ok) return jsonResponse(result.body, result.status, cookie);
  return jsonResponse(result.value, 200, cookie);
}
