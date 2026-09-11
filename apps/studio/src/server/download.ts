import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createServerFn } from '@tanstack/react-start';
import type { WorkerClient } from '@turboslide/render-worker/client';
import { ACTIONS } from '@turboslide/schema/actions';
import type { ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { deckDir } from './root';
import { buildsDir, downloadUrl, signDownloadToken } from './tokens';

/**
 * The export surface of the editor (SPEC 8; Kevin's directive: exporting from the editor with
 * Google Slides first). export.run and build.run in the browser reach these server functions:
 * startExport hands the action's validated input to the render worker facade (the same client
 * /api/export/:deckId uses: over HTTP when TURBOSLIDE_WORKER_URL is set, an in-process queue over
 * the turboslide CLI otherwise, so LibreOffice and Chromium never run in the web app, SPEC 3.3
 * item 7); pollExport reads the job back, with the worker's last log line while it runs and the
 * ExportReport plus signed one-time download URLs when it is done (tokens.ts); signDownload mints
 * a fresh URL for a file the editor wants again; runBuild runs `turboslide build` as a child
 * process into the worker's builds folder; exportCapabilities says whether Google credentials are
 * configured (TURBOSLIDE_GOOGLE_CREDENTIALS names a file) and whether produced files can be
 * streamed back (the local worker). createServerFn appears only under apps/studio/src/server.
 */

/** The environment variable the Slides exporter reads (SPEC 8.3; MILESTONES M6 acceptance). */
export const GOOGLE_CREDENTIALS_VARIABLE = 'TURBOSLIDE_GOOGLE_CREDENTIALS';

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
    client = createWorkerClient();
  }
  return client;
}

function requireDeck(deckId: string): string {
  if (!SLUG_PATTERN.test(deckId)) throw new TypeError('deckId must be a slug');
  const dir = deckDir(deckId);
  if (!existsSync(join(dir, 'deck.json'))) throw new RangeError(`No deck ${deckId} under decks/`);
  return dir;
}

export type ExportCapabilities = {
  gslides: { configured: boolean; variable: string };
  downloads: boolean;
  worker: 'local' | 'http';
};

const exportCapabilitiesFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ExportCapabilities> => {
    const path = process.env[GOOGLE_CREDENTIALS_VARIABLE];
    const configured =
      typeof path === 'string' && path !== '' && existsSync(path) && statSync(path).isFile();
    const mode = (await worker()).mode;
    return {
      gslides: { configured, variable: GOOGLE_CREDENTIALS_VARIABLE },
      downloads: mode === 'local',
      worker: mode,
    };
  },
);

/** What the Export menu can offer: Slides when credentials exist, downloads when the worker is local. */
export async function exportCapabilities(): Promise<ExportCapabilities> {
  return exportCapabilitiesFn();
}

export type ExportRunInput = {
  format: 'pptx' | 'gslides' | 'pdf';
  mode?: 'native' | 'flatten';
  theme?: ('light' | 'dark')[];
  fonts?: 'exact' | 'standard';
  headings?: 'raster';
  rasterScale?: 'auto' | 2 | 3;
  pictureScale?: 2 | 3;
  excludeShareAlike?: boolean;
  baseline?: 'libreoffice' | 'none';
  verify?: boolean;
  /** Google Slides: build and validate the requests without credentials (SPEC 8.3) */
  dryRun?: boolean;
  slideIds?: 'all' | string[];
};

export type StartExportInput = { deckId: string; input: ExportRunInput };
export type StartExportResult = { jobId: string; status: string };

const startExportFn = createServerFn({ method: 'POST' })
  .validator((raw: StartExportInput): StartExportInput => {
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
  })
  .handler(async ({ data }): Promise<StartExportResult> => {
    requireDeck(data.deckId);
    const job = await (await worker()).submit('export', { deckId: data.deckId, ...data.input });
    return { jobId: job.id, status: job.status };
  });

/** export.run, step one: the job on the worker's queue. */
export async function startExport(input: StartExportInput): Promise<StartExportResult> {
  return startExportFn({ data: input });
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
    const dir = requireDeck(data.deckId);
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
