import { createFileRoute } from '@tanstack/react-router';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Theme } from '@turboslide/schema/render';

import { authorize, identityLabel, requestContext } from '../../server/authorize';
import { RateLimitedError, checkQuota, rateLimitedResponse, tierOf } from '../../server/ratelimit';
import { renderSlideImages } from '../../server/render';

// POST /api/x/render/<deckId> (gslides-parity SPEC-3 0.25, 8.3, 11.3): the render.slide server
// function behind a prefix the WAF can see (rule R2: 240 per minute per IP with /api/render/*).
// The body is `{ slideIds, themes?, scale?, format? }`; the answer is the records with their
// facade URLs, what the `renderSlideImages` server function returns. authorize(read) first, then
// the renders per hour quota counted per render (SPEC-3 6.2, 8.3). The page sends its CSRF
// headers and its identity cookie; an agent the bearer.

const BODY_LIMIT = 256 * 1024;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export const Route = createFileRoute('/api/x/render/$')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const deckId = params._splat ?? '';
        if (!SLUG_PATTERN.test(deckId))
          return json({ error: 'invalid_input', message: 'deckId must be a slug' }, 400);
        const text = await request.text();
        if (text.length > BODY_LIMIT) return json({ error: 'payload_too_large' }, 413);
        let body: unknown = {};
        if (text.trim() !== '') {
          try {
            body = JSON.parse(text) as unknown;
          } catch {
            return json({ error: 'invalid_input', message: 'the body is not JSON' }, 400);
          }
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body))
          return json({ error: 'invalid_input', message: 'the body wants one JSON object' }, 400);
        const { slideIds, themes, scale, format } = body as Record<string, unknown>;
        if (
          slideIds !== 'all' &&
          (!Array.isArray(slideIds) ||
            !slideIds.every((id) => typeof id === 'string' && SLUG_PATTERN.test(id)))
        )
          return json(
            { error: 'invalid_input', message: 'slideIds must be all or a list of slugs' },
            400,
          );
        if (themes !== undefined && (!Array.isArray(themes) || !themes.every(isTheme)))
          return json(
            { error: 'invalid_input', message: 'themes must name light, dark or both' },
            400,
          );
        if (scale !== undefined && scale !== 1 && scale !== 2)
          return json({ error: 'invalid_input', message: 'scale must be 1 or 2' }, 400);
        if (format !== undefined && format !== 'png' && format !== 'jpg')
          return json({ error: 'invalid_input', message: 'format must be png or jpg' }, 400);
        const ctx = await requestContext(request);
        const decision = await authorize(ctx, deckId, 'read', {
          action: 'render.slide',
          transport: 'route',
        });
        if (!decision.ok) {
          return json(
            decision.code === 'forbidden'
              ? { error: 'forbidden', capability: 'read' }
              : { error: decision.code === 'unauthorized' ? 'unauthorized' : 'not_found' },
            decision.status,
          );
        }
        const count =
          (slideIds === 'all' ? 1 : (slideIds as string[]).length) *
          ((themes as Theme[] | undefined)?.length ?? 2);
        const refused = await checkQuota(
          'rendersPerHour',
          {
            identity: identityLabel(ctx) ?? 'anonymous',
            tier: tierOf(ctx),
            deckId,
            action: 'render.slide',
            transport: 'route',
          },
          Math.max(1, count),
        );
        if (refused instanceof RateLimitedError) return rateLimitedResponse(refused);
        try {
          const result = await renderSlideImages({
            deckId,
            slideIds: slideIds as 'all' | string[],
            ...(themes !== undefined ? { themes: themes as Theme[] } : {}),
            ...(scale !== undefined ? { scale: scale as 1 | 2 } : {}),
            ...(format !== undefined ? { format: format as 'png' | 'jpg' } : {}),
          });
          return json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status = error instanceof RangeError ? 404 : 502;
          return json(
            {
              error: status === 404 ? 'not_found' : 'render_failed',
              ...(status === 404 ? {} : { message }),
            },
            status,
          );
        }
      },
    },
  },
});
