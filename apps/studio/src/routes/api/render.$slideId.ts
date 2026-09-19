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
import { getThumbnail, isThumbStamp, isThumbWidth, thumbResponse } from '../../server/thumbs';
import type { ThumbRequest } from '../../server/thumbs';
import {
  RENDER_GRANT_QUERY,
  THUMB_GRANT_QUERY,
  renderFileName,
  verifyRenderGrant,
  verifyThumbGrant,
} from '../../server/tokens';
import type { RenderGrantTarget } from '../../server/tokens';

// GET /api/render/:slideId?deck=gt-brand&theme=light&scale=1[&format=json|jpg]: the facade over the
// render worker (SPEC 3.4; MILESTONES M2 item 6). With ?w=160|320|640 the response is the
// downsampled thumbnail from server/thumbs.ts (M3 item 5): on this instance's disk and, on the
// blob tier, in the store under `decks/<id>/.thumbs/<stamp>/` shared by every instance
// (gslides-parity SPEC-4 0.31). A request that names a stamp (?r=) is immutable for the browser
// and the CDN and answers a 302 to the stored object on a public store; a request without one
// answers the newest stored thumbnail with `s-maxage=60, stale-while-revalidate=86400` and renders
// the current one after the response. The worker is reached over HTTP when
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
//
// The render grant (the return round, docs/RETURN.md 2.19; audit-surface rows 27 and 28): the
// picture urls renderSlideImages answers carry `?g=<grant>` (server/tokens.ts signRenderGrant),
// minted after authorize(read) passed for the caller and naming the deck, the slide, the theme,
// the scale and the format for ten minutes. A request whose grant verifies for exactly the
// picture it asks for is served without the bearer and without a second authorize call, and its
// picture is an attachment named `<deck id>-<slide id>.<png|jpg>`, so File > Download > JPEG
// image and PNG image download the current slide instead of opening a 401 tab. A grant never
// opens the JSON variant or a thumbnail: the target it signs is the full size picture alone.

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

/** The M2 rule of this route: a bearer token when TURBOSLIDE_TOKEN is set, except for thumbnails and a granted picture. */
function unauthorized(request: Request, url: URL, granted: boolean): Response | null {
  const token = process.env.TURBOSLIDE_TOKEN;
  if (token === undefined || token === '') return null;
  if (url.searchParams.has('w')) return null;
  if (granted) return null;
  const given = bearerToken(request);
  if (given !== undefined && sameToken(given, token)) return null;
  return refuse(
    401,
    'unauthorized',
    'bearer token required: send Authorization: Bearer <TURBOSLIDE_TOKEN>',
  );
}

/**
 * The full size picture a render grant can name, read from the request: null for a thumbnail,
 * for the JSON variant, and for ids that are not slugs (the route refuses those with 400 below).
 */
function grantTargetOf(url: URL, slideId: string): RenderGrantTarget | null {
  if (url.searchParams.has('w')) return null;
  const format = url.searchParams.get('format');
  if (format !== null && format !== 'png' && format !== 'jpg') return null;
  const deckId = url.searchParams.get('deck') ?? 'gt-brand';
  if (!SLUG_PATTERN.test(deckId) || !SLUG_PATTERN.test(slideId)) return null;
  return {
    deckId,
    slideId,
    theme: url.searchParams.get('theme') === 'dark' ? 'dark' : 'light',
    scale: url.searchParams.get('scale') === '2' ? 2 : 1,
    format: format === 'jpg' ? 'jpg' : 'png',
  };
}

export const Route = createFileRoute('/api/render/$slideId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        // the grant stands for the bearer and for authorize(read) on this one picture
        const target = grantTargetOf(url, params.slideId);
        const granted =
          target !== null && verifyRenderGrant(target, url.searchParams.get(RENDER_GRANT_QUERY));
        const denied = unauthorized(request, url, granted);
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
            const r = url.searchParams.get('r');
            const request_: ThumbRequest = {
              deckId,
              slideId,
              theme,
              width,
              r: isThumbStamp(r) ? r : null,
            };
            const thumb = await getThumbnail(request_);
            return thumbResponse(thumb, request_, { revisionInUrl: request_.r !== null });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const status =
              error instanceof RangeError || /no deck|no slide|ENOENT/.test(message) ? 404 : 502;
            return Response.json({ error: { message, status } }, { status });
          }
        }
        // a granted request is a download: the picture, never the record
        const wantsJson =
          !granted &&
          (url.searchParams.get('format') === 'json' ||
            (request.headers.get('accept') ?? '').includes('application/json'));
        if (!granted) {
          // the full size render: authorize(read) for the bearer or the cookie (SPEC-3 6.2); a
          // grant was minted after that decision passed for the caller (server/render.ts)
          const ctx = await requestContext(request);
          const decision = await authorize(ctx, deckId, 'read', {
            action: 'render.slide',
            transport: 'route',
          });
          if (!decision.ok)
            return Response.json(denialBody(decision, 'read'), { status: decision.status });
        }
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
          // the download's headers: the attachment named after the deck and the slide, not
          // cached, never sniffed (the download route's own headers)
          const download: Record<string, string> =
            granted && target !== null
              ? {
                  'content-disposition': `attachment; filename="${renderFileName(target)}"`,
                  'cache-control': 'private, no-store',
                  'x-content-type-options': 'nosniff',
                }
              : { 'cache-control': 'private, max-age=60' };
          return new Response(rendered.png, {
            headers: {
              'content-type': jpg ? 'image/jpeg' : 'image/png',
              'content-length': String(rendered.png.byteLength),
              ...download,
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
