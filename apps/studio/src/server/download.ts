import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createServerFn } from '@tanstack/react-start';
import { DOWNLOAD_PROGRESS } from '@turboslide/chrome/menus/strings';
import { batchSize, leftWords, secondsLeft } from '@turboslide/export/batch/plan';
import type { WorkerClient } from '@turboslide/render-worker/client';
import { ACTIONS } from '@turboslide/schema/actions';
import type { ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import type { Authorized } from './authorize';
import type {
  ExportBatchResult,
  MergeExportResult,
  StartBatchedExportResult,
} from './export-batch';
import type { jsonBody } from './export-sync';
import type { QuotaContext } from './ratelimit';
import { deckDir, ensureDeckAssets, isHosted, workerClientOptions } from './root';
import { buildsDir, downloadUrl, signDownloadToken } from './tokens';

/**
 * The query parameter of the export cancel token (server/tokens.ts CANCEL_TOKEN_QUERY, pinned
 * equal by tokens.test.ts): spelled here as well because `cancelOnPagehide` runs in the browser and
 * tokens.ts is a node module this file must not import at module level.
 */
const CANCEL_TOKEN_QUERY = 'ct';

/**
 * The export surface of the editor (SPEC 8; Kevin's directive: PPTX from the editor's toolbar,
 * docs/pptx.md; the PDF of gslides-parity SPEC 7.6 takes the same path with `format: 'pdf'` and
 * comes back as one file with an ExportReport whose slides are its pages). export.run and
 * build.run in the browser reach these server functions:
 * startExport hands the action's validated input to the render worker facade (the same client
 * /api/export/:deckId uses: over HTTP when TURBOSLIDE_WORKER_URL is set, an in-process queue over
 * the turboslide CLI otherwise, so LibreOffice and Chromium never run in the web app, SPEC 3.3
 * item 7); pollExport reads the job back, with the worker's last log line while it runs and the
 * ExportReport plus signed one-time download URLs when it is done (tokens.ts); signDownload mints
 * a fresh URL for a file the editor wants again; runBuild runs `turboslide build` as a child
 * process into the worker's builds folder; exportCapabilities says whether produced files can be
 * streamed back (the local worker) and whether the editor must export synchronously instead
 * (`sync`: a hosted studio, docs/hosting.md, where a job queued by one function invocation is
 * not visible to the next); syncExport is that synchronous export as a server function, the same
 * runSyncExport and the same answer as POST /api/export/:deckId?sync=1&format=json, reached same
 * origin under the CSRF middleware, so the route can require TURBOSLIDE_TOKEN (SPEC 11) without
 * the page holding the token (docs/hosting.md section 6). createServerFn appears only under
 * apps/studio/src/server.
 */

/** How often the editor polls a running job. */
export const EXPORT_POLL_MS = 1000;

let client: WorkerClient | undefined;

/**
 * The worker client, loaded on first use rather than imported at the top: the editor route
 * imports this module for its client stubs, and the client's graph (the export and verify jobs,
 * the headless package, playwright-core) must not enter the browser's dependency optimizer
 * (measured: the dev server failed on vite's fsevents binary through playwright-core's vite
 * import when the import was static; the production build tree-shakes it either way).
 */
async function worker(): Promise<WorkerClient> {
  if (client === undefined) {
    const { createWorkerClient } = await import('@turboslide/render-worker/client');
    client = createWorkerClient(workerClientOptions());
  }
  return client;
}

/**
 * The export rule of every export server function (gslides-parity SPEC-3 6.2, 8.2, 8.3, 8.12):
 * `authorize(export)` first, `exportNotes` when the input carries the notes and `readSkipped` when
 * it carries the skipped slides (a viewer's `includeNotes: true` is 403; report 04 F21), the
 * `exports` switch, then the exports per day quota. Returns the authorized context for the quota
 * that follows the run.
 */
async function authorizeExport(
  deckId: string,
  input: { includeNotes?: boolean; includeSkipped?: boolean },
  action: string,
  quota: 'exportsPerDay' | 'standaloneBuildsPerDay' | null = 'exportsPerDay',
): Promise<Authorized & { quota: QuotaContext }> {
  // loaded here, not at the top: the edit route imports this module for its client stubs and the
  // client transform keeps every module level import a plain function references
  const { authorizeRequest, identityLabel } = await import('./authorize');
  const { assertFlag } = await import('./flags');
  const { assertQuota, tierOf } = await import('./ratelimit');
  const authorized = await authorizeRequest(deckId, 'export', { action });
  if (input.includeNotes === true) await authorizeRequest(deckId, 'exportNotes', { action });
  if (input.includeSkipped === true) await authorizeRequest(deckId, 'readSkipped', { action });
  const identity = identityLabel(authorized.ctx) ?? 'anonymous';
  await assertFlag('exports', { identity, deckId, action });
  const context: QuotaContext = {
    identity,
    tier: tierOf(authorized.ctx),
    deckId,
    action,
    transport: 'window',
  };
  if (quota !== null) await assertQuota(quota, context);
  return { ...authorized, quota: context };
}

/** The deck's folder once the hosted seed is materialized; a RangeError when the deck is missing. */
async function requireDeck(deckId: string): Promise<string> {
  if (!SLUG_PATTERN.test(deckId)) throw new TypeError('deckId must be a slug');
  await ensureDeckAssets(deckId);
  const dir = deckDir(deckId);
  if (!existsSync(join(dir, 'deck.json'))) throw new RangeError(`No deck ${deckId} under decks/`);
  return dir;
}

export type ExportCapabilities = {
  downloads: boolean;
  worker: 'local' | 'http';
  /** the editor exports through POST /api/export/:deckId?sync=1 (a hosted studio) */
  sync: boolean;
  /**
   * The slides one synchronous call renders at most (gslides-parity SPEC-2 8.1): a longer play
   * list exports in batches through `runBatchedExport`; 60, or TURBOSLIDE_EXPORT_BATCH.
   */
  batchSize: number;
};

const exportCapabilitiesFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ExportCapabilities> => {
    const mode = (await worker()).mode;
    return { downloads: mode === 'local', worker: mode, sync: isHosted(), batchSize: batchSize() };
  },
);

/** What the Export menu can offer: downloads when the worker is local, the sync route when hosted. */
export async function exportCapabilities(): Promise<ExportCapabilities> {
  return exportCapabilitiesFn();
}

export type ExportRunInput = {
  format: 'pptx' | 'pdf';
  mode?: 'native' | 'flatten';
  theme?: ('light' | 'dark')[];
  fonts?: 'exact' | 'standard';
  headings?: 'raster';
  rasterScale?: 'auto' | 2 | 3;
  pictureScale?: 2 | 3;
  excludeShareAlike?: boolean;
  baseline?: 'libreoffice' | 'none';
  verify?: boolean;
  /** Editable text mode: embed the export faces as fntdata parts (docs/pptx.md) */
  embedFonts?: boolean;
  slideIds?: 'all' | string[];
  /** Carry the skipped slides too (gslides-parity SPEC 7.2.1) */
  includeSkipped?: boolean;
  /** Carry the speaker notes (gslides-parity SPEC 7.2.13, decision 15.2) */
  includeNotes?: boolean;
};

export type StartExportInput = { deckId: string; input: ExportRunInput };
export type StartExportResult = { jobId: string; status: string };

/** The deck id as a slug and the input through export.run's schema, with `out` removed. */
export function validateExportRun(raw: StartExportInput): StartExportInput {
  if (typeof raw.deckId !== 'string' || !SLUG_PATTERN.test(raw.deckId))
    throw new TypeError('deckId must be a slug');
  const parsed = ACTIONS['export.run'].input.safeParse(raw.input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new TypeError(
      `export.run: invalid input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  // the output directory is the worker's job directory, never a caller-chosen path
  const { out: _out, ...input } = parsed.data as ExportRunInput & { out?: string };
  return { deckId: raw.deckId, input };
}

const startExportFn = createServerFn({ method: 'POST' })
  .validator(validateExportRun)
  .handler(async ({ data }): Promise<StartExportResult> => {
    await authorizeExport(data.deckId, data.input, 'export.run');
    await requireDeck(data.deckId);
    const job = await (await worker()).submit('export', { deckId: data.deckId, ...data.input });
    return { jobId: job.id, status: job.status };
  });

/** export.run, step one: the job on the worker's queue. */
export async function startExport(input: StartExportInput): Promise<StartExportResult> {
  return startExportFn({ data: input });
}

/** The answer of a synchronous export: the report and the files' URLs, never the bytes. */
export type SyncExportAnswer = ReturnType<typeof jsonBody>;

const syncExportFn = createServerFn({ method: 'POST' })
  .validator(validateExportRun)
  .handler(async ({ data }): Promise<SyncExportAnswer> => {
    const { quota } = await authorizeExport(data.deckId, data.input, 'export.run');
    await requireDeck(data.deckId);
    // one export at a time per identity (SPEC-3 8.3 concurrency 1 / 1 / 2)
    const { assertQuota, releaseQuota } = await import('./ratelimit');
    await assertQuota('exportConcurrency', quota);
    try {
      // loaded here for the same reason worker() is: export-sync imports the worker client statically
      const { jsonBody: body, runSyncExport } = await import('./export-sync');
      return body(await runSyncExport(data.deckId, data.input));
    } finally {
      await releaseQuota('exportConcurrency', quota);
    }
  });

/**
 * export.run in one call (a hosted studio, docs/hosting.md section 6): the export runs to
 * completion inside this server function, which the deployment gives the same 800 s as the sync
 * route (`/_serverFn/**` in vite.deploy.config.ts), and the answer lists each file's URL, a stored
 * copy on the blob backend or this instance's job file on tmp. The editor can call this in place
 * of its browser fetch of POST /api/export/:deckId?sync=1&format=json, whose body is identical.
 */
export async function syncExport(input: StartExportInput): Promise<SyncExportAnswer> {
  return syncExportFn({ data: input });
}

// ---------------------------------------------------------------------------------------------
// The batched Perfect export (gslides-parity SPEC-2 8.1): four server functions over
// server/export-batch.ts, loaded inside the handlers for the reason worker() gives, and the
// client function the Download dialog calls.

const startBatchedExportFn = createServerFn({ method: 'POST' })
  .validator(validateExportRun)
  .handler(async ({ data }): Promise<StartBatchedExportResult> => {
    await authorizeExport(data.deckId, data.input, 'export.run');
    await requireDeck(data.deckId);
    const { startBatchedExport: start } = await import('./export-batch');
    return start(data.deckId, data.input);
  });

/** Step one: the plan (the revision, the batches, the pinned asset hashes) under a job id. */
export async function startBatchedExport(
  input: StartExportInput,
): Promise<StartBatchedExportResult> {
  return startBatchedExportFn({ data: input });
}

export type ExportBatchInput = { deckId: string; jobId: string; index: number };

function validateJobInput<T extends { deckId: string; jobId: string }>(raw: T): T {
  if (typeof raw.deckId !== 'string' || !SLUG_PATTERN.test(raw.deckId))
    throw new TypeError('deckId must be a slug');
  if (typeof raw.jobId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(raw.jobId))
    throw new TypeError('jobId must be a job id');
  return raw;
}

const exportBatchFn = createServerFn({ method: 'POST' })
  .validator((raw: ExportBatchInput): ExportBatchInput => {
    validateJobInput(raw);
    if (!Number.isInteger(raw.index) || raw.index < 0)
      throw new TypeError('index must be a non negative integer');
    return raw;
  })
  .handler(async ({ data }): Promise<ExportBatchResult> => {
    // the plan already paid the day's quota; a batch needs the right, not another count
    await authorizeExport(data.deckId, {}, 'export.run', null);
    await requireDeck(data.deckId);
    const { exportBatch: run } = await import('./export-batch');
    return run(data.deckId, data.jobId, data.index);
  });

/** Step two: one batch of the plan into the part store; `stale` when the job must restart. */
export async function exportBatch(input: ExportBatchInput): Promise<ExportBatchResult> {
  return exportBatchFn({ data: input });
}

export type ExportJobInput = { deckId: string; jobId: string };

const mergeExportFn = createServerFn({ method: 'POST' })
  .validator(validateJobInput<ExportJobInput>)
  .handler(async ({ data }): Promise<MergeExportResult> => {
    await authorizeExport(data.deckId, {}, 'export.run', null);
    await requireDeck(data.deckId);
    const { mergeExport: run } = await import('./export-batch');
    return run(data.deckId, data.jobId);
  });

/** Step three: the file from the stored parts, with the merge's peak memory. */
export async function mergeExport(input: ExportJobInput): Promise<MergeExportResult> {
  return mergeExportFn({ data: input });
}

const cancelBatchedExportFn = createServerFn({ method: 'POST' })
  .validator(validateJobInput<ExportJobInput>)
  .handler(async ({ data }): Promise<{ jobId: string; removed: number }> => {
    const { authorizeRequest } = await import('./authorize');
    await authorizeRequest(data.deckId, 'export', { action: 'export.cancel' });
    const { cancelBatchedExport: run } = await import('./export-batch');
    return run(data.deckId, data.jobId);
  });

/** Cancel: the job's plan, parts and files go. */
export async function cancelBatchedExport(
  input: ExportJobInput,
): Promise<{ jobId: string; removed: number }> {
  return cancelBatchedExportFn({ data: input });
}

/** What the Download dialog shows while a batched export runs (SPEC-2 8.1 item 4). */
export type BatchedExportProgress =
  | { phase: 'preparing'; slide: number; total: number; secondsLeft: number | null }
  | { phase: 'merging' }
  | { phase: 'ready' };

/** The sentence of a progress step, in the Download dialog's words. */
export function batchedProgressLabel(progress: BatchedExportProgress): string {
  switch (progress.phase) {
    case 'preparing':
      return DOWNLOAD_PROGRESS.preparing(
        progress.slide,
        progress.total,
        progress.secondsLeft === null ? 'a few minutes' : leftWords(progress.secondsLeft),
      );
    case 'merging':
      return DOWNLOAD_PROGRESS.merging;
    case 'ready':
      return DOWNLOAD_PROGRESS.ready;
  }
}

export type RunBatchedExportOptions = {
  /** stops the run; the job is cancelled on the server */
  signal?: AbortSignal;
  /** how many times a failed batch is tried again; default 1 (SPEC-2 8.1 item 4) */
  retries?: number;
  /** how many times a stale job is started again before the run fails; default 2 */
  restarts?: number;
};

export class BatchedExportCancelled extends Error {
  constructor() {
    super('The export was cancelled');
    this.name = 'BatchedExportCancelled';
  }
}

/**
 * The best effort cancel a closing page can still send (SPEC-2 0.45): the http route with
 * keepalive, carrying the cancel token minted with the plan (gslides-parity SPEC-3 8.13; report
 * 04 F9: the job id alone is no longer the capability).
 */
function cancelOnPagehide(deckId: string, jobId: string, cancelToken: string): () => void {
  if (typeof window === 'undefined') return () => {};
  const onHide = () => {
    void fetch(
      `/api/export/${encodeURIComponent(deckId)}?cancel=${encodeURIComponent(jobId)}&${CANCEL_TOKEN_QUERY}=${encodeURIComponent(cancelToken)}`,
      {
        method: 'POST',
        keepalive: true,
      },
    ).catch(() => undefined);
  };
  window.addEventListener('pagehide', onHide);
  return () => window.removeEventListener('pagehide', onHide);
}

/**
 * The client side of the batched export (SPEC-2 8.1 item 4): the plan, then the batches one at a
 * time (the render worker's one browser rule), each retried once before the run fails, the job
 * started again when a batch answers `stale` (the deck moved or a picture was replaced during
 * the download), then the merge. `onProgress` gets the slide reached with the estimate recomputed
 * after every batch, then the merge and the ready steps. Cancel through `options.signal` deletes
 * the job; `pagehide` sends the same cancel through the route with `keepalive`, and the 24 h prune
 * covers what that misses.
 */
export async function runBatchedExport(
  deckId: string,
  input: ExportRunInput,
  onProgress: (progress: BatchedExportProgress) => void,
  options: RunBatchedExportOptions = {},
): Promise<MergeExportResult> {
  const retries = options.retries ?? 1;
  const restarts = options.restarts ?? 2;
  const throwIfCancelled = () => {
    if (options.signal?.aborted) throw new BatchedExportCancelled();
  };
  for (let restart = 0; ; restart += 1) {
    throwIfCancelled();
    const started = await startBatchedExport({ deckId, input });
    const stopPagehide = cancelOnPagehide(deckId, started.jobId, started.cancelToken);
    let stale: 'revision' | 'asset' | null = null;
    try {
      const timings: { slides: number; ms: number }[] = [];
      let done = 0;
      onProgress({
        phase: 'preparing',
        slide: Math.min(1, started.total),
        total: started.total,
        secondsLeft: null,
      });
      for (let index = 0; index < started.batches.length; index += 1) {
        throwIfCancelled();
        let result: ExportBatchResult | undefined;
        let failure: unknown;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
          try {
            result = await exportBatch({ deckId, jobId: started.jobId, index });
            break;
          } catch (error) {
            failure = error;
            throwIfCancelled();
          }
        }
        if (result === undefined)
          throw failure instanceof Error ? failure : new Error(String(failure));
        if ('stale' in result) {
          stale = result.stale;
          break;
        }
        timings.push({ slides: result.slides, ms: result.ms });
        done += result.slides;
        onProgress({
          phase: 'preparing',
          slide: Math.min(done, started.total),
          total: started.total,
          secondsLeft: secondsLeft(done, started.total, timings),
        });
      }
      if (stale === null) {
        throwIfCancelled();
        onProgress({ phase: 'merging' });
        const merged = await mergeExport({ deckId, jobId: started.jobId });
        onProgress({ phase: 'ready' });
        return merged;
      }
    } catch (error) {
      if (error instanceof BatchedExportCancelled || options.signal?.aborted) {
        await cancelBatchedExport({ deckId, jobId: started.jobId }).catch(() => undefined);
        throw new BatchedExportCancelled();
      }
      throw error;
    } finally {
      stopPagehide();
    }
    // a stale job: the deck moved under the download; start again from the current revision
    await cancelBatchedExport({ deckId, jobId: started.jobId }).catch(() => undefined);
    if (restart >= restarts) {
      throw new Error(
        stale === 'asset'
          ? 'A picture of the deck changed while it was exporting; try the download again'
          : 'The deck changed while it was exporting; try the download again',
      );
    }
  }
}

export type ExportDownloadLink = { name: string; bytes: number; url: string };

export type ExportPoll = {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  /** the worker's last log line */
  line?: string;
  ms?: number;
  report?: ExportReport;
  error?: string;
  /** one signed one-time URL per produced file; empty when the worker is remote */
  downloads?: ExportDownloadLink[];
};

type ExportJobResultLike = {
  report?: unknown;
  outDir?: string;
  ms?: number;
};

function jobStatus(status: string): ExportPoll['status'] {
  return status === 'queued' || status === 'running' || status === 'done' || status === 'failed'
    ? status
    : 'failed';
}

const pollExportFn = createServerFn({ method: 'POST' })
  .validator((raw: { jobId: string }) => {
    if (typeof raw.jobId !== 'string' || !/^[a-z0-9-]+$/.test(raw.jobId))
      throw new TypeError('jobId must be a job id');
    return raw;
  })
  .handler(async ({ data }): Promise<ExportPoll> => {
    const job = await (await worker()).job(data.jobId);
    // the job names its deck; the poll needs the export right on it
    const deckOfJob = (job?.input as { deckId?: string } | undefined)?.deckId;
    if (typeof deckOfJob === 'string' && SLUG_PATTERN.test(deckOfJob)) {
      const { authorizeRequest } = await import('./authorize');
      await authorizeRequest(deckOfJob, 'export', { action: 'export.poll' });
    }
    if (!job) throw new RangeError(`No export job ${data.jobId}`);
    const status = jobStatus(job.status);
    const line = job.log[job.log.length - 1];
    const poll: ExportPoll = {
      jobId: job.id,
      status,
      ...(line !== undefined ? { line } : {}),
      ...(job.ms !== undefined ? { ms: job.ms } : {}),
    };
    if (status === 'failed') {
      poll.error = job.error?.message ?? 'the export failed';
      return poll;
    }
    if (status !== 'done') return poll;
    const result = job.result as ExportJobResultLike | undefined;
    const report = exportReportSchema.safeParse(result?.report);
    if (!report.success) {
      poll.status = 'failed';
      poll.error = 'the export job finished without an export report';
      return poll;
    }
    poll.report = report.data;
    poll.downloads =
      (await worker()).mode === 'local'
        ? report.data.files.map((file) => {
            const name = file.path.split('/').pop() ?? file.path;
            return {
              name,
              bytes: file.bytes,
              url: downloadUrl(signDownloadToken({ k: 'job', j: job.id, n: name })),
            };
          })
        : [];
    return poll;
  });

/** export.run, step two: the job's state, and the report with its download URLs once done. */
export async function pollExport(input: { jobId: string }): Promise<ExportPoll> {
  return pollExportFn({ data: input });
}

export type SignDownloadInput =
  { kind: 'job'; jobId: string; name: string } | { kind: 'build'; deckId: string; name: string };

const signDownloadFn = createServerFn({ method: 'POST' })
  .validator((raw: SignDownloadInput): SignDownloadInput => {
    if (typeof raw.name !== 'string' || raw.name === '') throw new TypeError('name is required');
    if (raw.kind === 'job') {
      if (typeof raw.jobId !== 'string' || !/^[a-z0-9-]+$/.test(raw.jobId))
        throw new TypeError('jobId must be a job id');
      return { kind: 'job', jobId: raw.jobId, name: raw.name };
    }
    // the type says build here; the value is JSON from the client, so the field is still checked
    const kind: string = raw.kind;
    if (kind !== 'build') throw new TypeError('kind must be job or build');
    if (typeof raw.deckId !== 'string' || !SLUG_PATTERN.test(raw.deckId))
      throw new TypeError('deckId must be a slug');
    return { kind: 'build', deckId: raw.deckId, name: raw.name };
  })
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { authorizeRequest } = await import('./authorize');
    if (data.kind === 'build')
      await authorizeRequest(data.deckId, 'export', { action: 'export.sign' });
    else {
      const job = await (await worker()).job(data.jobId);
      const deckOfJob = (job?.input as { deckId?: string } | undefined)?.deckId;
      if (typeof deckOfJob === 'string' && SLUG_PATTERN.test(deckOfJob))
        await authorizeRequest(deckOfJob, 'export', { action: 'export.sign' });
    }
    if ((await worker()).mode !== 'local')
      throw new RangeError('The render worker runs elsewhere; its files are not served from here');
    const token =
      data.kind === 'job'
        ? signDownloadToken({ k: 'job', j: data.jobId, n: data.name })
        : signDownloadToken({ k: 'build', d: data.deckId, n: data.name });
    return { url: downloadUrl(token) };
  });

/** A fresh one-time URL for a file an earlier run produced (a token is spent by one download). */
export async function signDownload(input: SignDownloadInput): Promise<{ url: string }> {
  return signDownloadFn({ data: input });
}

export type RunBuildInput = { deckId: string; budgetMB?: number };

export type RunBuildResult = {
  path: string;
  bytes: number;
  budgetBytes: number;
  ok: boolean;
  revision: number;
  slides: number;
  sections: number;
  assertions: { name: string; passed: boolean; detail: string }[];
  ms: number;
  download: ExportDownloadLink | null;
};

type BuildCliResult = {
  path: string;
  bytes: number;
  budgetBytes: number;
  ok: boolean;
  overBudget: boolean;
  revision: number;
  slides: number;
  sections: number;
  missing: string[];
  failed: { path: string; error: string }[];
};

const runBuildFn = createServerFn({ method: 'POST' })
  .validator((raw: RunBuildInput): RunBuildInput => {
    if (typeof raw.deckId !== 'string' || !SLUG_PATTERN.test(raw.deckId))
      throw new TypeError('deckId must be a slug');
    if (raw.budgetMB !== undefined && (typeof raw.budgetMB !== 'number' || raw.budgetMB <= 0))
      throw new TypeError('budgetMB must be a positive number');
    return raw;
  })
  .handler(async ({ data }): Promise<RunBuildResult> => {
    // a standalone file carries no notes and no skipped slides; the export right and its own quota
    await authorizeExport(data.deckId, {}, 'build.run', 'standaloneBuildsPerDay');
    const dir = await requireDeck(data.deckId);
    const outDir = buildsDir(data.deckId);
    mkdirSync(outDir, { recursive: true });
    const name = `${data.deckId}.html`;
    const out = join(outDir, name);
    const { parseJsonResult, runTurboslide } = await import('@turboslide/render-worker/cli');
    const run = await runTurboslide(
      ['build', '--deck', dir, '--out', out, '--budget', String(data.budgetMB ?? 16), '--json'],
      { env: process.env, timeoutMs: 600_000 },
    );
    const built = parseJsonResult<BuildCliResult>(run, 'build.run');
    const bytes = existsSync(out) ? statSync(out).size : built.bytes;
    return {
      path: out,
      bytes,
      budgetBytes: built.budgetBytes,
      ok: built.ok,
      revision: built.revision,
      slides: built.slides,
      sections: built.sections,
      assertions: [
        {
          name: 'budget',
          passed: !built.overBudget,
          detail: `${built.bytes} of ${built.budgetBytes} bytes`,
        },
        {
          name: 'assets',
          passed: built.missing.length === 0 && built.failed.length === 0,
          detail:
            built.missing.length + built.failed.length === 0
              ? 'every asset inlined'
              : `${built.missing.length} missing, ${built.failed.length} failed`,
        },
      ],
      ms: run.ms,
      download: existsSync(out)
        ? {
            name,
            bytes,
            url: downloadUrl(signDownloadToken({ k: 'build', d: data.deckId, n: name })),
          }
        : null,
    };
  });

/** build.run for the editor: the standalone file through the CLI, with its download URL. */
export async function runBuild(input: RunBuildInput): Promise<RunBuildResult> {
  return runBuildFn({ data: input });
}
