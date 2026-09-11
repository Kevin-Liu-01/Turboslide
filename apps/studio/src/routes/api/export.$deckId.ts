import { createFileRoute } from '@tanstack/react-router';

import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import { ACTIONS } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

// POST /api/export/:deckId enqueues an export job on the render worker and answers 202 with the job
// and a poll location; GET /api/export/:deckId?job=<id> returns the job record, with the
// ExportReport under `result.report` once it is done, and GET without `job` lists the deck's export
// jobs (SPEC 3.4; MILESTONES M2 item 6). The body is the export.run input of the action table
// (SPEC 7.1), validated by its Zod schema; bodies are capped at 1 MB and TURBOSLIDE_TOKEN, when set,
// is required as a bearer token (SPEC 11). The worker runs over HTTP when TURBOSLIDE_WORKER_URL is
// set and in this process otherwise; either way LibreOffice and Chromium are child processes.

const BODY_LIMIT = 1024 * 1024;

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

function badRequest(message: string): Response {
  return Response.json({ error: { message, status: 400 } }, { status: 400 });
}

type ExportInput = {
  format: 'pptx' | 'gslides' | 'pdf';
  mode?: 'native' | 'flatten';
  theme?: ('light' | 'dark')[];
  fonts?: 'exact' | 'standard';
  headings?: 'raster';
  verify?: boolean;
  out?: string;
};

export const Route = createFileRoute('/api/export/$deckId')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const denied = unauthorized(request);
        if (denied) return denied;
        if (!SLUG_PATTERN.test(params.deckId)) return badRequest('deckId must be a slug');
        const length = Number(request.headers.get('content-length') ?? 0);
        if (length > BODY_LIMIT)
          return Response.json(
            { error: { message: 'body over 1 MB', status: 413 } },
            { status: 413 },
          );
        let body: unknown = {};
        const text = await request.text();
        if (text.length > BODY_LIMIT)
          return Response.json(
            { error: { message: 'body over 1 MB', status: 413 } },
            { status: 413 },
          );
        if (text.trim()) {
          try {
            body = JSON.parse(text) as unknown;
          } catch {
            return badRequest('body is not JSON');
          }
        }
        const parsed = ACTIONS['export.run'].input.safeParse({
          format: 'pptx',
          ...(body as Record<string, unknown>),
        });
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return badRequest(
            `invalid export input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
          );
        }
        const input = parsed.data as ExportInput;
        // the output directory is the worker's job directory, never a caller-chosen path
        const { out: _out, ...rest } = input;
        try {
          const job = await worker().submit('export', { deckId: params.deckId, ...rest });
          const location = `/api/export/${params.deckId}?job=${job.id}`;
          return Response.json(
            { job, location, worker: worker().mode },
            { status: 202, headers: { location } },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({ error: { message, status: 502 } }, { status: 502 });
        }
      },
      GET: async ({ params, request }) => {
        const denied = unauthorized(request);
        if (denied) return denied;
        if (!SLUG_PATTERN.test(params.deckId)) return badRequest('deckId must be a slug');
        const url = new URL(request.url);
        const jobId = url.searchParams.get('job');
        try {
          if (jobId) {
            const job = await worker().job(jobId);
            if (!job)
              return Response.json(
                { error: { message: `no job ${jobId}`, status: 404 } },
                { status: 404 },
              );
            const report =
              job.status === 'done'
                ? (job.result as { report?: unknown } | undefined)?.report
                : undefined;
            return Response.json({ job, report: report ?? null, worker: worker().mode });
          }
          const jobs = (await worker().list('export')).filter(
            (job) => (job.input as { deckId?: string } | undefined)?.deckId === params.deckId,
          );
          return Response.json({ deckId: params.deckId, jobs, worker: worker().mode });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({ error: { message, status: 502 } }, { status: 502 });
        }
      },
    },
  },
});
