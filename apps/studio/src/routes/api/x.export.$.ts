import { createFileRoute } from '@tanstack/react-router';
import { ACTIONS } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { authorize, identityLabel, requestContext } from '../../server/authorize';
import type { AuthContext, Capability } from '../../server/authorize';
import { requireFlag } from '../../server/flags';
import {
  RateLimitedError,
  checkQuota,
  rateLimitedResponse,
  releaseQuota,
  tierOf,
} from '../../server/ratelimit';
import { ensureDeckAssets } from '../../server/root';

// POST /api/x/export/<deckId> (gslides-parity SPEC-3 0.25, 8.3, 11.3): the synchronous export
// server function behind a prefix the WAF can see (rule R3: 12 per 10 minutes per IP, deny 15
// minutes after the log week). The body is the export.run input; the answer is the JSON form of
// the export (the report and the files' URLs, never the bytes), the same `jsonBody` the
// `syncExport` server function returns. The page sends it with its CSRF headers (start.ts widens
// the filter to /api/x/*) and its identity cookie; an agent sends the bearer. Every call runs
// authorize(export) first, exportNotes and readSkipped when the input asks for them, the
// `exports` switch, the exports per day quota and the one export at a time slot (SPEC-3 6.2, 8.2,
// 8.3, 8.12). The editor keeps the server function this round; this route is the WAF visible
// twin the page moves to when the integrator flips it (build-3/b4.md).

const BODY_LIMIT = 1024 * 1024;

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

async function denied(
  ctx: AuthContext,
  deckId: string,
  capability: Capability,
): Promise<Response | null> {
  const decision = await authorize(ctx, deckId, capability, {
    action: 'export.run',
    transport: 'route',
  });
  if (decision.ok) return null;
  const body =
    decision.code === 'forbidden'
      ? { error: 'forbidden', capability }
      : decision.code === 'unauthorized'
        ? { error: 'unauthorized' }
        : decision.code === 'gone'
          ? { error: 'gone' }
          : { error: 'not_found' };
  return json(body, decision.status);
}

export const Route = createFileRoute('/api/x/export/$')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const deckId = params._splat ?? '';
        if (!SLUG_PATTERN.test(deckId))
          return json({ error: 'invalid_input', message: 'deckId must be a slug' }, 400);
        const length = Number(request.headers.get('content-length') ?? 0);
        if (length > BODY_LIMIT) return json({ error: 'payload_too_large' }, 413);
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
        const parsed = ACTIONS['export.run'].input.safeParse({
          format: 'pptx',
          ...(body as object),
        });
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return json(
            {
              error: 'invalid_input',
              message: `invalid export input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
            },
            400,
          );
        }
        const { out: _out, ...input } = parsed.data as Record<string, unknown> & { out?: string };
        const ctx = await requestContext(request);
        for (const capability of [
          'export',
          ...(input.includeNotes === true ? (['exportNotes'] as const) : []),
          ...(input.includeSkipped === true ? (['readSkipped'] as const) : []),
        ] as const) {
          const refused = await denied(ctx, deckId, capability);
          if (refused !== null) return refused;
        }
        const identity = identityLabel(ctx) ?? 'anonymous';
        const flagged = await requireFlag('exports', { identity, deckId, action: 'export.run' });
        if (flagged !== null) return flagged;
        const quota = {
          identity,
          tier: tierOf(ctx),
          deckId,
          action: 'export.run',
          transport: 'route' as const,
        };
        const daily = await checkQuota('exportsPerDay', quota);
        if (daily instanceof RateLimitedError) return rateLimitedResponse(daily);
        const slot = await checkQuota('exportConcurrency', quota);
        if (slot instanceof RateLimitedError) return rateLimitedResponse(slot);
        try {
          await ensureDeckAssets(deckId);
          // loaded inside the handler: the export module reaches the worker client and the browser
          const { jsonBody, runSyncExport } = await import('../../server/export-sync');
          const result = await runSyncExport(deckId, input as Parameters<typeof runSyncExport>[1]);
          return json(jsonBody(result), 200, {
            'x-turboslide-sync': 'route',
            'x-turboslide-job': result.jobId,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status = error instanceof RangeError ? 404 : 502;
          return json(
            {
              error: status === 404 ? 'not_found' : 'export_failed',
              message: status === 404 ? undefined : message,
            },
            status,
          );
        } finally {
          await releaseQuota('exportConcurrency', quota);
        }
      },
    },
  },
});
