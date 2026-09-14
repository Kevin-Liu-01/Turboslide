import { createFileRoute } from '@tanstack/react-router';
import { errorResponse, jsonResponse } from '@turboslide/agent/http/errors';
import { ACTIONS } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { isCommentActionId, runCommentAction } from '../../server/comments';
import { commentCallerFor, readJsonBody, refuseCrossSite, refuseNonJson } from '../../server/room';

/**
 * POST /api/comments/<deckId>/<action> (gslides-parity SPEC-3 5.9, 11.3; MILESTONES-3 B2 day 5):
 * the twelve comment actions as a server route the WAF sees (R15), same origin and
 * `application/json` (8.7), the body validated by the action's own schema, `authorize()` for the
 * capability the action needs, and the stream path of server/comments.ts. `<action>` is the id
 * (`comment.add`) or its last word (`add`). The answer is the action's output; a refusal is the
 * transports' error body (SPEC 7.1).
 */

const BODY_MAX_BYTES = 64 * 1024;

export const Route = createFileRoute('/api/comments/$')({
  server: {
    handlers: {
      POST: ({ request, params }) => serve(request, params._splat ?? ''),
    },
  },
});

async function serve(request: Request, splat: string): Promise<Response> {
  const [deckId = '', word = ''] = splat.split('/');
  const action = word.startsWith('comment.') ? word : `comment.${word}`;
  if (!SLUG_PATTERN.test(deckId) || !isCommentActionId(action))
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
  const parsed = ACTIONS[action].input.safeParse(body.value ?? {});
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
  let caller;
  try {
    caller = await commentCallerFor(request, deckId, action);
  } catch (error) {
    if (error instanceof RangeError) return jsonResponse({ error: 'not_found' }, 404);
    throw error;
  }
  const cookie: Record<string, string> =
    caller.identity.setCookie === undefined ? {} : { 'set-cookie': caller.identity.setCookie };
  if (!caller.ok) return jsonResponse(caller.body, caller.status, cookie);
  try {
    const result = await runCommentAction(caller.caller, action, parsed.data);
    return jsonResponse(result, 200, cookie);
  } catch (error) {
    return errorResponse(error, action);
  }
}
