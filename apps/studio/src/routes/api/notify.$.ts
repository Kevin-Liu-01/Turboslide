import { createFileRoute } from '@tanstack/react-router';
import { errorResponse, jsonResponse } from '@turboslide/agent/http/errors';
import { ACTIONS } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import {
  notificationList,
  notificationMarkRead,
  notificationSettings,
} from '../../server/comments';
import type { NotificationCaller } from '../../server/comments';
import {
  decideFor,
  readJsonBody,
  redisCommands,
  refuseCrossSite,
  refuseNonJson,
  requestIdentity,
} from '../../server/room';

/**
 * /api/notify/* (gslides-parity SPEC-3 5.5, 11.3; MILESTONES-3 B2 day 5): the caller's inbox as a
 * server route the WAF sees (R20). `POST /api/notify/list`, `/markRead` and `/settings` take the
 * action's input as JSON (`settings` and the per deck level need `?deck=<id>`); the caller is
 * the session's principal or the bearer's agent. `GET /api/notify/unsubscribe?t=<token>` is the
 * one click endpoint of the digest mail (5.5 `List-Unsubscribe-Post`); its handler is B3's
 * (MILESTONES-3 B3 day 6) and answers 501 until it is bound here.
 */

const BODY_MAX_BYTES = 16 * 1024;

export const Route = createFileRoute('/api/notify/$')({
  server: {
    handlers: {
      POST: ({ request, params }) => serve(request, params._splat ?? ''),
      GET: ({ request, params }) => serveGet(request, params._splat ?? ''),
    },
  },
});

const ACTION_OF = {
  list: 'notification.list',
  markRead: 'notification.markRead',
  settings: 'notification.settings',
} as const;

async function serve(request: Request, splat: string): Promise<Response> {
  const word = splat.split('/')[0] ?? '';
  if (!(word in ACTION_OF)) return jsonResponse({ error: 'not_found' }, 404);
  const action = ACTION_OF[word as keyof typeof ACTION_OF];
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
  const identity = await requestIdentity(request);
  const cookie: Record<string, string> =
    identity.setCookie === undefined ? {} : { 'set-cookie': identity.setCookie };
  const deck = new URL(request.url).searchParams.get('deck');
  if (deck !== null && !SLUG_PATTERN.test(deck))
    return jsonResponse({ error: 'not_found' }, 404, cookie);
  let settingsCapability = false;
  if (deck !== null) {
    const decision = await decideFor(identity, deck, 'read', action);
    if (!decision.ok) return jsonResponse({ error: 'not_found' }, 404, cookie);
    const owner = await decideFor(identity, deck, 'settings', action);
    settingsCapability = owner.ok && owner.shadow === undefined;
  }
  const caller: NotificationCaller = {
    principalId: identity.principalId ?? identity.identity,
    ...(deck === null ? {} : { deckId: deck }),
    settingsCapability,
    redis: redisCommands(),
  };
  try {
    switch (action) {
      case 'notification.list':
        return jsonResponse(
          await notificationList(caller, parsed.data as Parameters<typeof notificationList>[1]),
          200,
          cookie,
        );
      case 'notification.markRead':
        return jsonResponse(
          await notificationMarkRead(
            caller,
            parsed.data as Parameters<typeof notificationMarkRead>[1],
          ),
          200,
          cookie,
        );
      case 'notification.settings':
        return jsonResponse(
          await notificationSettings(
            caller,
            parsed.data as Parameters<typeof notificationSettings>[1],
          ),
          200,
          cookie,
        );
    }
  } catch (error) {
    return errorResponse(error, action);
  }
}

async function serveGet(request: Request, splat: string): Promise<Response> {
  const word = splat.split('/')[0] ?? '';
  if (word !== 'unsubscribe') return jsonResponse({ error: 'not_found' }, 404);
  const token = new URL(request.url).searchParams.get('t');
  if (token === null || token === '')
    return jsonResponse({ error: 'invalid', message: 'the link is incomplete' }, 400);
  // B3's one click handler (the digest sender of SPEC-3 5.5) binds here at merge 2 (b2.md request)
  return jsonResponse(
    {
      error: 'not_implemented',
      message: 'Unsubscribe links are not available on this deployment yet',
    },
    501,
  );
}
