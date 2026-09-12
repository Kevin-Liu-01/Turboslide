import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createServerFn } from '@tanstack/react-start';
import type { WorkerClient } from '@turboslide/render-worker/client';
import { ACTIONS } from '@turboslide/schema/actions';
import type { ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import type { jsonBody } from './export-sync';
import { deckDir, ensureDeckAssets, isHosted, workerClientOptions } from './root';
import { buildsDir, downloadUrl, signDownloadToken } from './tokens';

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
};

const exportCapabilitiesFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ExportCapabilities> => {
    const mode = (await worker()).mode;
    return { downloads: mode === 'local', worker: mode, sync: isHosted() };
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
function validateExportRun(raw: StartExportInput): StartExportInput {
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
    await requireDeck(data.deckId);
    // loaded here for the same reason worker() is: export-sync imports the worker client statically
    const { jsonBody: body, runSyncExport } = await import('./export-sync');
    return body(await runSyncExport(data.deckId, data.input));
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
