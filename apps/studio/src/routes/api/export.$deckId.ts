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
import {
  batchedJobFile,
  isProducedFileName,
  cancelBatchedExport,
  exportBatch,
  isJobId,
  mergeExport,
  startBatchedExport,
} from '../../server/export-batch';
import {
  authorize,
  carriesBootstrapToken,
  denialBody,
  identityLabel,
  requestContext,
} from '../../server/authorize';
import type { AuthContext, Capability } from '../../server/authorize';
import { requireFlag } from '../../server/flags';
import { logSecurityEvent } from '../../server/log';
import { RateLimitedError, checkQuota, rateLimitedResponse, tierOf } from '../../server/ratelimit';
import { ensureDeckAssets, isHosted, workerClientOptions } from '../../server/root';
import { CANCEL_TOKEN_QUERY, verifyCancelToken } from '../../server/tokens';

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
// The batched Perfect export (gslides-parity SPEC-2 8.1; server/export-batch.ts), the http form
// of export.run's `batch` and `merge` so an agent can drive what the Download dialog drives:
// `POST ?start=1` with the export.run body answers `{ jobId, revision, batches, batchSize, total }`
// (the plan, the old jobs pruned); `POST ?batch=<i>&job=<id>` renders one batch into the job and
// answers `{ index, slides, ms }` or `{ stale: 'revision' | 'asset' }`; `POST ?merge=<id>` builds
// the file from the stored parts and answers the JSON variant's body plus `peakMb`; `POST
// ?cancel=<id>` deletes the job. A body carrying `batch: { index, of, jobId }` or `merge: { jobId }`
// (the action's fields) is the same as the query form. `GET ?job=<id>&file=<name>` serves a
// batched job's file from the part store before it asks the worker's job folder. The cancel form
// needs no bearer: the job id is unguessable and the page sends it from `pagehide` with
// `keepalive`, where it cannot carry a header (SPEC-2 0.45).
//
// Authentication (SPEC 11): TURBOSLIDE_TOKEN, when set, is required as `Authorization: Bearer
// <token>` on every request here; unset (a checkout), the route is open. The editor never fetches
// this route: its export runs through the syncExport server function of server/download.ts (the
// same runSyncExport and the same JSON answer, reached same origin under the CSRF middleware), so
// the page holds no token. The token is set on the production and preview environments of the
// `turboslide` project since 2026-09-11 (docs/hosting.md section 6, option 2), which also opens
// the agent routes to callers that send it; agents and the CLI (`turboslide deck push`) read it
// from their environment or ~/.config/turboslide/hosts.json.

const BODY_LIMIT = 1024 * 1024;

/** Why this request runs synchronously: the caller asked, or the instance is a hosted one. */
type SyncMode = 'requested' | 'hosted';

let client: WorkerClient | undefined;

function worker(): WorkerClient {
  client ??= createWorkerClient(workerClientOptions());
  return client;
}

/**
 * GET ?job=<id>&file=<name>[&as=<name>]: a produced file from the batched job's store, else this
 * instance's job folder, saved as `as` when given (the deck's title, the product round's rank 7;
 * the store holds a batched job's files under their display names already, a sync job's folder
 * holds the exporter's names).
 */
async function jobFile(
  deckId: string,
  jobId: string,
  name: string,
  saveAs: string | null,
): Promise<Response> {
  if (!/^[a-z0-9-]+$/.test(jobId)) return badRequest('job must be a job id');
  if (!isProducedFileName(name)) return badRequest('file must be a name');
  if (saveAs !== null && !isProducedFileName(saveAs)) return badRequest('as must be a name');
  try {
    const batched = await batchedJobFile(deckId, jobId, name);
    const data = batched?.data ?? (await worker().readJobFile(jobId, `export/${name}`));
    return new Response(data, {
      headers: {
        'cache-control': 'no-store',
        'content-type': contentTypeOf(name),
        'content-length': String(data.byteLength),
        'content-disposition': contentDisposition(saveAs ?? name),
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

/** A batch step's error as the route answers it: 404 for a missing deck or job, 400 for a bad input, 502 otherwise. */
function batchError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof RangeError ? 404 : error instanceof TypeError ? 400 : 502;
  return Response.json({ error: { message, status } }, { status });
}

/** authorize() for a route caller: the 6.2 body as the Response when refused, else null. */
async function refusedBy(
  ctx: AuthContext,
  deckId: string,
  capability: Capability,
  action: string,
): Promise<Response | null> {
  const decision = await authorize(ctx, deckId, capability, { action, transport: 'route' });
  if (decision.ok) return null;
  return Response.json(denialBody(decision, capability), { status: decision.status });
}

type BatchField = { index: number; of: number; jobId: string } | undefined;
type MergeField = { jobId: string } | undefined;

/**
 * The batch forms of a POST (the module comment): the query's `start`, `batch` and `job`,
 * `merge` and `cancel`, or the body's `batch` and `merge` fields. Null when the request is a
 * plain export.
 */
async function batchedPost(
  deckId: string,
  url: URL,
  fields: Record<string, unknown>,
): Promise<Response | null> {
  const query = (name: string) => url.searchParams.get(name);
  const bodyBatch = fields.batch as BatchField;
  const bodyMerge = fields.merge as MergeField;
  const cancel = query('cancel');
  if (cancel !== null) {
    if (!isJobId(cancel)) return badRequest('cancel must name a job id');
    try {
      return Response.json(await cancelBatchedExport(deckId, cancel));
    } catch (error) {
      return batchError(error);
    }
  }
  const merge = query('merge') ?? bodyMerge?.jobId;
  if (merge !== undefined) {
    if (!isJobId(merge)) return badRequest('merge must name a job id');
    try {
      return Response.json(await mergeExport(deckId, merge), {
        headers: { 'cache-control': 'no-store', 'x-turboslide-sync': 'batched' },
      });
    } catch (error) {
      return batchError(error);
    }
  }
  const batch = query('batch');
  const job = query('job');
  if (batch !== null || bodyBatch !== undefined) {
    const index = batch !== null ? Number(batch) : bodyBatch?.index;
    const jobId = job ?? bodyBatch?.jobId;
    if (index === undefined || !Number.isInteger(index) || index < 0)
      return badRequest('batch must be a non negative integer');
    if (jobId === undefined || !isJobId(jobId)) return badRequest('job must name a job id');
    try {
      return Response.json(await exportBatch(deckId, jobId, index, bodyBatch?.of), {
        headers: { 'cache-control': 'no-store', 'x-turboslide-sync': 'batched' },
      });
    } catch (error) {
      return batchError(error);
    }
  }
  if (query('start') === '1') {
    const { batch: _b, merge: _m, ...input } = fields;
    try {
      return Response.json(await startBatchedExport(deckId, input), {
        headers: { 'cache-control': 'no-store', 'x-turboslide-sync': 'batched' },
      });
    } catch (error) {
      return batchError(error);
    }
  }
  return null;
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
        // the page's pagehide cancel carries no header (SPEC-2 0.45); the cancel token minted
        // with the plan is the capability (gslides-parity SPEC-3 8.13; report 04 F9), or the
        // bearer for an agent
        const cancelId = new URL(request.url).searchParams.get('cancel');
        const cancelling = cancelId !== null;
        if (cancelling) {
          const token = new URL(request.url).searchParams.get(CANCEL_TOKEN_QUERY);
          if (!verifyCancelToken(cancelId, token) && !carriesBootstrapToken(request)) {
            logSecurityEvent({
              event: 'http.403',
              deckId: params.deckId,
              action: 'export.cancel',
              reason: 'cancel token',
              status: 403,
              transport: 'route',
            });
            return Response.json({ error: 'forbidden', capability: 'export' }, { status: 403 });
          }
        }
        const denied = cancelling ? null : unauthorized(request);
        if (denied) return denied;
        if (!SLUG_PATTERN.test(params.deckId)) return badRequest('deckId must be a slug');
        let ctx: Awaited<ReturnType<typeof requestContext>> | null = null;
        if (!cancelling) {
          ctx = await requestContext(request);
          const refused = await refusedBy(ctx, params.deckId, 'export', 'export.run');
          if (refused !== null) return refused;
          const flagged = await requireFlag('exports', {
            identity: identityLabel(ctx) ?? 'anonymous',
            deckId: params.deckId,
            action: 'export.run',
          });
          if (flagged !== null) return flagged;
        }
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
        // the day's export quota is paid once per export: by the plan (`?start=1`) and by the
        // single call path. A batch or a merge of a job the plan started (SPEC-2 8.1:
        // `?batch=<i>&job=<id>`, `?merge=<id>`, or the body's `batch` and `merge` fields)
        // continues that export and passes the capability and the kill switch above and not the
        // quota again: a 28 page deck in batches of 3 is one export of the day, not eleven
        const continuing =
          url.searchParams.has('merge') ||
          (url.searchParams.has('batch') && url.searchParams.has('job')) ||
          (typeof fields.batch === 'object' && fields.batch !== null) ||
          (typeof fields.merge === 'object' && fields.merge !== null);
        if (ctx !== null && !continuing) {
          const quota = await checkQuota('exportsPerDay', {
            identity: identityLabel(ctx) ?? 'anonymous',
            tier: tierOf(ctx),
            deckId: params.deckId,
            action: 'export.run',
            transport: 'route',
          });
          if (quota instanceof RateLimitedError) return rateLimitedResponse(quota);
        }
        // the batched export's forms (SPEC-2 8.1) answer before the single call path
        const batched = await batchedPost(params.deckId, url, fields);
        if (batched !== null) return batched;
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
        // the notes and the skipped slides need their own cells (SPEC-3 6.2, 8.2; report 04 F21)
        const caller = await requestContext(request);
        if (input.includeNotes === true) {
          const refused = await refusedBy(caller, params.deckId, 'exportNotes', 'export.run');
          if (refused !== null) return refused;
        }
        if (input.includeSkipped === true) {
          const refused = await refusedBy(caller, params.deckId, 'readSkipped', 'export.run');
          if (refused !== null) return refused;
        }
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
        const refused = await refusedBy(
          await requestContext(request),
          params.deckId,
          'export',
          'export.list',
        );
        if (refused !== null) return refused;
        const url = new URL(request.url);
        const jobId = url.searchParams.get('job');
        const file = url.searchParams.get('file');
        if (jobId && file) return jobFile(params.deckId, jobId, file, url.searchParams.get('as'));
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
