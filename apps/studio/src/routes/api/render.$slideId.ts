import { timingSafeEqual } from 'node:crypto';

import { createFileRoute } from '@tanstack/react-router';

import { bearerToken } from '@turboslide/agent/http/auth';
import { refuse } from '@turboslide/agent/http/errors';
import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { authorize, authorizeMode, denialBody, requestContext } from '../../server/authorize';
import { requireFlag } from '../../server/flags';
import { logSecurityEvent } from '../../server/log';
import { ensureDeckAssets, workerClientOptions } from '../../server/root';
import { getThumbnail, isThumbWidth, thumbResponse } from '../../server/thumbs';
import { THUMB_GRANT_QUERY, verifyThumbGrant } from '../../server/tokens';

// GET /api/render/:slideId?deck=gt-brand&theme=light&scale=1[&format=json|jpg]: the facade over the
// render worker (SPEC 3.4; MILESTONES M2 item 6). With ?w=160|320|640 the response is the
// downsampled thumbnail from server/thumbs.ts (M3 item 5), cached on disk per revision; a request
// that also names a stamp (?r=) is immutable for the browser. The worker is reached over HTTP when
// TURBOSLIDE_WORKER_URL is set; otherwise the same job runs in this process through the local queue,
// which drives the turboslide CLI as a child process where the binary exists, so headless Chromium
// never runs inside the web app (SPEC 3.3 item 7), and through runCli() in this process inside a
// serverless function (render-worker cli.ts execMode; docs/hosting-chromium.md records the
// deviation). Either way the browser comes from @turboslide/headless launchBrowser, which selects
// the serverless binary when TURBOSLIDE_CHROME is `sparticuz` or the function has no other Chrome,
// and the record's `renderer` names what painted the pixels. The response is the PNG with the
// RenderRecord in the X-Turboslide-Record header and the execution mode in X-Turboslide-Exec, or
// the record as JSON.
//
// Authentication (SPEC 11): TURBOSLIDE_TOKEN, when set, is required as `Authorization: Bearer
// <token>` for the full-size render and its JSON variant. The thumbnail variant (?w=) stays open
// with the token set: the editor's sidebar embeds it as <img>, which carries no header, its result
// is cached per revision on the instance, and the work it can start is bounded to the deck's slides
// at three widths and two themes. Unset (a checkout), the whole route is open. The editor's own
// full-size renders go through the renderSlideImages server function (server/render.ts), never
// this route, so the token set on the production and preview environments of the `turboslide`
// project since 2026-09-11 (docs/hosting.md section 6, option 2) costs the page nothing.

let client: WorkerClient | undefined;

function worker(): WorkerClient {
  client ??= createWorkerClient(workerClientOptions());
  return client;
}

function sameToken(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The M2 rule of this route: a bearer token when TURBOSLIDE_TOKEN is set, except for thumbnails. */
function unauthorized(request: Request, url: URL): Response | null {
  const token = process.env.TURBOSLIDE_TOKEN;
  if (token === undefined || token === '') return null;
  if (url.searchParams.has('w')) return null;
  const given = bearerToken(request);
  if (given !== undefined && sameToken(given, token)) return null;
  return refuse(
    401,
    'unauthorized',
    'bearer token required: send Authorization: Bearer <TURBOSLIDE_TOKEN>',
  );
}

export const Route = createFileRoute('/api/render/$slideId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const denied = unauthorized(request, url);
        if (denied) return denied;
        const deckId = url.searchParams.get('deck') ?? 'gt-brand';
        const slideId = params.slideId;
        if (!SLUG_PATTERN.test(deckId) || !SLUG_PATTERN.test(slideId))
          return Response.json(
            { error: { message: 'deck and slide ids must be slugs', status: 400 } },
            { status: 400 },
          );
        const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
        const scale = url.searchParams.get('scale') === '2' ? 2 : 1;
        // JPEG at quality 92 (gslides-parity SPEC 7.6; the render worker's jpg format)
        const jpg = url.searchParams.get('format') === 'jpg';
        const w = url.searchParams.get('w');
        if (w !== null) {
          const width = Number(w);
          if (!isThumbWidth(width))
            return Response.json(
              { error: { message: 'w must be 160, 320 or 640', status: 400 } },
              { status: 400 },
            );
          // the thumbnail grant (gslides-parity SPEC-3 8.13; report 04 F6): the page's `<img>`
          // carries no header, so the loader's grant travels as `s`; without one the request
          // is refused in enforce mode and logged in shadow mode, and the renderThumbs switch
          // answers 503 with plates in the filmstrip
          const flagged = await requireFlag('renderThumbs', { deckId, action: 'render.thumb' });
          if (flagged !== null) return flagged;
          const grant = verifyThumbGrant(deckId, url.searchParams.get(THUMB_GRANT_QUERY));
          if (grant === null) {
            const ctx = await requestContext(request);
            const decision = await authorize(ctx, deckId, 'read', {
              action: 'render.thumb',
              transport: 'route',
            });
            if (!decision.ok)
              return Response.json(denialBody(decision, 'read'), { status: decision.status });
            if (
              authorizeMode() === 'enforce' &&
              ctx.principal === null &&
              ctx.agent === undefined
            ) {
              logSecurityEvent({
                event: 'http.403',
                deckId,
                action: 'render.thumb',
                reason: 'unsigned thumbnail',
                status: 403,
                transport: 'route',
              });
              return Response.json({ error: 'forbidden', capability: 'read' }, { status: 403 });
            }
          }
          try {
            const request_ = { deckId, slideId, theme, width } as const;
            const thumb = await getThumbnail(request_);
            return thumbResponse(thumb, request_, { revisionInUrl: url.searchParams.has('r') });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const status =
              error instanceof RangeError || /no deck|no slide|ENOENT/.test(message) ? 404 : 502;
            return Response.json({ error: { message, status } }, { status });
          }
        }
        const wantsJson =
          url.searchParams.get('format') === 'json' ||
          (request.headers.get('accept') ?? '').includes('application/json');
        // the full size render: authorize(read) for the bearer or the cookie (SPEC-3 6.2)
        const ctx = await requestContext(request);
        const decision = await authorize(ctx, deckId, 'read', {
          action: 'render.slide',
          transport: 'route',
        });
        if (!decision.ok)
          return Response.json(denialBody(decision, 'read'), { status: decision.status });
        try {
          // the hosted seed and the deck's twins are on disk before the job runs (server/root.ts)
          await ensureDeckAssets(deckId);
          const rendered = await worker().renderSlide({
            deckId,
            slideId,
            theme,
            scale,
            ...(jpg ? { format: 'jpg' as const } : {}),
          });
          if (wantsJson) {
            return Response.json({
              record: rendered.record,
              image: `/api/render/${slideId}?deck=${deckId}&theme=${theme}&scale=${scale}${jpg ? '&format=jpg' : ''}`,
              job: rendered.jobId,
              cached: rendered.cached,
              worker: worker().mode,
              exec: worker().exec,
            });
          }
          return new Response(rendered.png, {
            headers: {
              'content-type': jpg ? 'image/jpeg' : 'image/png',
              'content-length': String(rendered.png.byteLength),
              'cache-control': 'private, max-age=60',
              'x-turboslide-record': JSON.stringify(rendered.record),
              'x-turboslide-job': rendered.jobId,
              'x-turboslide-worker': worker().mode,
              'x-turboslide-exec': worker().exec,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status =
            error instanceof RangeError || /no deck|no slide/.test(message) ? 404 : 502;
          return Response.json({ error: { message, status } }, { status });
        }
      },
    },
  },
});
