import { timingSafeEqual } from 'node:crypto';

import { createFileRoute } from '@tanstack/react-router';

import { bearerToken } from '@turboslide/agent/http/auth';
import { refuse } from '@turboslide/agent/http/errors';
import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import { ACTIONS } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import {
  VERCEL_BODY_CAP,
  attachmentOf,
  contentDisposition,
  contentTypeOf,
  exportSummary,
  headerJson,
  jsonBody,
  overBodyCap,
  runSyncExport,
} from '../../server/export-sync';
import type { SyncExportInput } from '../../server/export-sync';
import { ensureDeckAssets, isHosted, workerClientOptions } from '../../server/root';

// POST /api/export/:deckId enqueues an export job on the render worker and answers 202 with the job
// and a poll location; GET /api/export/:deckId?job=<id> returns the job record, with the
// ExportReport under `result.report` once it is done, and GET without `job` lists the deck's export
// jobs (SPEC 3.4; MILESTONES M2 item 6). The body is the export.run input of the action table
// (SPEC 7.1), validated by its Zod schema; bodies are capped at 1 MB. The worker runs over HTTP
// when TURBOSLIDE_WORKER_URL is set and in this process otherwise: as child processes where the
// CLI binary exists, in process inside a serverless function (render-worker cli.ts execMode;
// docs/hosting-chromium.md).
//
// POST with `?sync=1` (or `"sync": true` in the body) runs the export inside this request and
// answers the file: the PPTX as an attachment, or one stored zip when both themes were asked for,
// with the report's summary in the X-Turboslide-Export-Report header (server/export-sync.ts). With
// `?format=json` (or an Accept header naming application/json) the answer is the full ExportReport
// and the file list instead of the bytes. Verify runs only where LibreOffice answers; otherwise the
// report's residual says `verify: unavailable in this environment` and the summary's `verify` is
// `skipped`. Inside a function a body over 4.5 MB cannot leave (docs/hosting-diagnosis.md
// section 4), so such a result answers 413 with the JSON body, and the caller exports one theme,
// a slide subset, or asks the hosting store for a stored copy.
//
// Hosted (server/root.ts isHosted: the tmp or blob backend, so a Vercel function), every POST runs
// synchronously whether `?sync=1` was sent or not, and the answer says so in X-Turboslide-Sync
// (`requested` or `hosted`). Measured on the preview of 2026-09-11: a POST without `?sync=1`
// answered 202 and the queued job then sat `running` for 235 s, because the function is frozen once
// it has answered and the job gets CPU only while another request keeps the instance busy; its
// record also lives on that one instance, so GET ?job= from another is 404. The async job path
// stays for a checkout and for the Docker worker (TURBOSLIDE_WORKER_URL), where a queue outlives
// the request (docs/hosting-chromium.md section 4).
//
// Hosted (docs/hosting.md), the produced files get URLs: on the blob backend a stored copy under
// exports/<deckId>/<jobId>/ that any instance serves (the JSON variant lists it as `files[].url`
// with `stored: true`, and an attachment over the body cap answers 302 to it instead of 413); on
// the tmp backend GET ?job=<id>&file=<name> streams the file from this instance's job folder and
// is 404 on another instance, which the editor answers with a second sync export. The decks are
// materialized (server/root.ts ensureDecks) before any job runs, so a cold function whose first
// request is an export finds the deck.
//
// Authentication (SPEC 11): TURBOSLIDE_TOKEN, when set, is required as `Authorization: Bearer
// <token>` on every request here; unset, the route is open, because the editor's page posts the
// sync export from the browser without a header. The production URL runs without the token today;
// docs/hosting.md section 6 records that as Kevin's open decision and the three ways out of it (the
// editor's export can run through the syncExport server function of server/download.ts instead).

const BODY_LIMIT = 1024 * 1024;

/** Why this request runs synchronously: the caller asked, or the instance is a hosted one. */
type SyncMode = 'requested' | 'hosted';

let client: WorkerClient | undefined;

function worker(): WorkerClient {
  client ??= createWorkerClient(workerClientOptions());
  return client;
}

/** GET ?job=<id>&file=<name>: a produced file from this instance's job folder. */
async function jobFile(jobId: string, name: string): Promise<Response> {
  if (!/^[a-z0-9-]+$/.test(jobId)) return badRequest('job must be a job id');
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.'))
    return badRequest('file must be a name');
  try {
    const data = await worker().readJobFile(jobId, `export/${name}`);
    return new Response(data, {
      headers: {
        'cache-control': 'no-store',
        'content-type': contentTypeOf(name),
        'content-length': String(data.byteLength),
        'content-disposition': contentDisposition(name),
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RangeError ? 404 : 502;
    return Response.json(
      {
        error: {
          message:
            status === 404
              ? `${message}; the export ran on another instance or its files are gone, run it again`
              : message,
          status,
        },
      },
      { status },
    );
  }
}

function sameToken(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The M2 rule of this route: a bearer token when TURBOSLIDE_TOKEN is set, open otherwise. */
function unauthorized(request: Request): Response | null {
  const token = process.env.TURBOSLIDE_TOKEN;
  if (token === undefined || token === '') return null;
  const given = bearerToken(request);
  if (given !== undefined && sameToken(given, token)) return null;
  return refuse(
    401,
    'unauthorized',
    'bearer token required: send Authorization: Bearer <TURBOSLIDE_TOKEN>',
  );
}

function badRequest(message: string): Response {
  return Response.json({ error: { message, status: 400 } }, { status: 400 });
}

type ExportInput = SyncExportInput & { out?: string };

function wantsJson(request: Request, url: URL): boolean {
  return (
    url.searchParams.get('format') === 'json' ||
    (request.headers.get('accept') ?? '').includes('application/json')
  );
}

function inFunction(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function syncExport(
  deckId: string,
  input: SyncExportInput,
  request: Request,
  url: URL,
  mode: SyncMode,
) {
  let result;
  try {
    result = await runSyncExport(deckId, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RangeError ? 404 : 502;
    return Response.json(
      { error: { message, status } },
      { status, headers: { 'x-turboslide-sync': mode } },
    );
  }
  const summary = exportSummary(result);
  const common: Record<string, string> = {
    'cache-control': 'no-store',
    'x-turboslide-sync': mode,
    'x-turboslide-job': result.jobId,
    'x-turboslide-worker': result.worker,
    'x-turboslide-exec': result.exec,
    'x-turboslide-export-report': headerJson(summary),
  };
  if (wantsJson(request, url)) return Response.json(jsonBody(result), { headers: common });
  const attachment = attachmentOf(result);
  if (inFunction() && overBodyCap(attachment.data.byteLength)) {
    // one stored file can be fetched from where it is; several would need one zip there
    const stored = result.files.length === 1 ? result.files[0] : undefined;
    if (stored?.stored === true && stored.url !== undefined)
      return new Response(null, { status: 302, headers: { ...common, location: stored.url } });
    return Response.json(
      {
        error: {
          message: `the export is ${attachment.data.byteLength} bytes and a function answers at most ${VERCEL_BODY_CAP}; export one theme or a slide subset, or fetch the stored copy`,
          status: 413,
          code: 'response_too_large',
        },
        ...jsonBody(result),
      },
      { status: 413, headers: common },
    );
  }
  return new Response(attachment.data, {
    headers: {
      ...common,
      'content-type': attachment.contentType,
      'content-length': String(attachment.data.byteLength),
      'content-disposition': contentDisposition(attachment.name),
      'x-content-type-options': 'nosniff',
    },
  });
}

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
        if (typeof body !== 'object' || body === null || Array.isArray(body))
          return badRequest('body wants one JSON object');
        const url = new URL(request.url);
        // `sync` is the transport's flag, not an export.run field; it leaves before validation
        const { sync: syncFlag, ...fields } = body as Record<string, unknown>;
        const requested = url.searchParams.get('sync') === '1' || syncFlag === true;
        // hosted, a queued job would outlive the request that could run it (the docblock)
        const sync: SyncMode | null = requested ? 'requested' : isHosted() ? 'hosted' : null;
        const parsed = ACTIONS['export.run'].input.safeParse({ format: 'pptx', ...fields });
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return badRequest(
            `invalid export input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
          );
        }
        const input = parsed.data as ExportInput;
        // the output directory is the worker's job directory, never a caller-chosen path
        const { out: _out, ...rest } = input;
        if (sync !== null) return syncExport(params.deckId, rest, request, url, sync);
        try {
          await ensureDeckAssets(params.deckId);
          const job = await worker().submit('export', { deckId: params.deckId, ...rest });
          const location = `/api/export/${params.deckId}?job=${job.id}`;
          return Response.json(
            { job, location, worker: worker().mode, exec: worker().exec },
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
        const file = url.searchParams.get('file');
        if (jobId && file) return jobFile(jobId, file);
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
