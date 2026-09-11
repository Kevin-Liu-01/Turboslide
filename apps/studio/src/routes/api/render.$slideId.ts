import { createFileRoute } from '@tanstack/react-router';

import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { getThumbnail, isThumbWidth, thumbResponse } from '../../server/thumbs';

// GET /api/render/:slideId?deck=gt-brand&theme=light&scale=1[&format=json]: the facade over the
// render worker (SPEC 3.4; MILESTONES M2 item 6). With ?w=160|320|640 the response is the
// downsampled thumbnail from server/thumbs.ts (M3 item 5), cached on disk per revision; a request
// that also names a stamp (?r=) is immutable for the browser. The worker is reached over HTTP when
// TURBOSLIDE_WORKER_URL is set; otherwise the same job runs in this process through the local queue,
// which drives the turboslide CLI as a child process, so headless Chromium never runs inside the
// web app (SPEC 3.3 item 7). The response is the PNG with the RenderRecord in the
// X-Turboslide-Record header, or the record as JSON. TURBOSLIDE_TOKEN, when set, is required as a
// bearer token; a deployed instance sets it (SPEC 11).

let client: WorkerClient | undefined;

function worker(): WorkerClient {
  client ??= createWorkerClient();
  return client;
}

function unauthorized(request: Request): Response | null {
  const token = process.env.TURBOSLIDE_TOKEN;
  if (!token) return null;
  return request.headers.get('authorization') === `Bearer ${token}`
    ? null
    : Response.json({ error: { message: 'bearer token required', status: 401 } }, { status: 401 });
}

export const Route = createFileRoute('/api/render/$slideId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const denied = unauthorized(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const deckId = url.searchParams.get('deck') ?? 'gt-brand';
        const slideId = params.slideId;
        if (!SLUG_PATTERN.test(deckId) || !SLUG_PATTERN.test(slideId))
          return Response.json(
            { error: { message: 'deck and slide ids must be slugs', status: 400 } },
            { status: 400 },
          );
        const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
        const scale = url.searchParams.get('scale') === '2' ? 2 : 1;
        const w = url.searchParams.get('w');
        if (w !== null) {
          const width = Number(w);
          if (!isThumbWidth(width))
            return Response.json(
              { error: { message: 'w must be 160, 320 or 640', status: 400 } },
              { status: 400 },
            );
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
        try {
          const rendered = await worker().renderSlide({ deckId, slideId, theme, scale });
          if (wantsJson) {
            return Response.json({
              record: rendered.record,
              image: `/api/render/${slideId}?deck=${deckId}&theme=${theme}&scale=${scale}`,
              job: rendered.jobId,
              cached: rendered.cached,
              worker: worker().mode,
            });
          }
          return new Response(rendered.png, {
            headers: {
              'content-type': 'image/png',
              'content-length': String(rendered.png.byteLength),
              'cache-control': 'private, max-age=60',
              'x-turboslide-record': JSON.stringify(rendered.record),
              'x-turboslide-job': rendered.jobId,
              'x-turboslide-worker': worker().mode,
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
