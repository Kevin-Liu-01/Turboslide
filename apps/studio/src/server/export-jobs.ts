import { JOB_MAX_AGE_MS } from '@turboslide/export/batch/plan';
import type { ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

/**
 * The record of an editor export job where every instance reads it (the focus round, cycle 3
 * stream fix round two; VERIFICATION C3S-F7). The editor's queued export (`startExport`, then
 * `pollExport` every second, server/download.ts) ran in the function's in process queue and the
 * poll read that instance's job table, so a poll the platform routed to another instance found
 * no job, `pollExportFn` threw "No export job <id>", the page's loop stopped and no download
 * arrived (1 of 2 runs on a warm fluid compute deployment). Now the start writes this record to
 * the part store at queue time (`exports/.jobs/<jobId>.json`: the Blob store on a deployment, the
 * instance's derived files folder on a checkout), the worker's instance rewrites it when the job
 * finishes, with the produced files stored under the deck's export prefix and their download
 * addresses, and a poll that finds no job in its own process answers from the record. A poll for
 * a job no record names answers a refusal in the product's words, never a thrown error, so the
 * dialog shows the sentence and stays. The PDF path shares every function here.
 *
 * The record is an overwritten path (the start writes it queued, the worker's instance rewrites
 * it running and done), so it follows the store's proof rule since the sync and costs round
 * (docs/SYNC.md 3.5, invariant 8; audit-costs items 4 and 13): written with its immutable copy
 * first (`putWithCopy`, under the store's `.turboslide/copies/` folder beside the record) and
 * read through `provenGet` (the head's version, the body only when its md5 is that version,
 * else the copy), because the public host serves an overwritten object for up to thirty days
 * and a plain `get` on the polling instance could read the queued record long after the job
 * finished elsewhere.
 *
 * This module holds the pure half (the record shapes, the sentences, the parse, the stale paths)
 * and nothing that names the store: the editor's client reads its plain exports (download.ts
 * imports `SYNC_PROGRESS_JOB_PATTERN` into a server function's validator), so a store import
 * here reaches the browser and takes node:crypto with it (the sync round, build/b1.md R10). The
 * three functions that touch a `BlobClient` (`writeExportJob`, `readExportJob`,
 * `pruneExportJobs`) are export-jobs-store.ts's, unit tested beside these in
 * export-jobs.test.ts; the runtime (the part store, the worker client, `waitUntil`) is
 * server/export-batch.ts's.
 */

/** Where the records live: a folder no deck id can name (a slug carries no dot). */
export const EXPORT_JOBS_PREFIX = 'exports/.jobs/';

/** A record older than this is pruned at the next export start (SPEC-2 0.45, the batched jobs' bound). */
export const EXPORT_JOB_MAX_AGE_MS = JOB_MAX_AGE_MS;

export type ExportJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type ExportJobDownload = { name: string; bytes: number; url: string };

/**
 * Where a running export is (the product round, docs/PRODUCT.md section 2 ranks 8 and 21; the
 * row `export.download.progress-per-slide`): the play list number of the slide the worker
 * rendered last and the slides the file holds, read off the worker's own log lines
 * (`progressOfLog`), so the snackbar reads "slide k of n" with k moving. A two appearance
 * PowerPoint runs the count once per appearance; `theme` names which. The PDF is one print of the
 * whole document and has no per slide line, so its progress is the count alone.
 */
export type ExportProgress = { slide: number; total: number; theme?: 'light' | 'dark' };

export type ExportJobRecord = {
  v: 1;
  jobId: string;
  deckId: string;
  format: 'pptx' | 'pdf';
  status: ExportJobStatus;
  createdAt: string;
  updatedAt: string;
  /** the deck's title at queue time, for the file names the downloads take (plan.ts displayNameOf) */
  title?: string;
  /**
   * The worker's own job behind a record the page named (the sync export's progress record,
   * `syncProgressJobId`): a poll on the worker's instance reads that job live, off its log.
   */
  workerJobId?: string;
  /** the worker's last log line */
  line?: string;
  /** where the worker is, while the job runs */
  progress?: ExportProgress;
  ms?: number;
  report?: ExportReport;
  /** one address per produced file, a stored copy any instance can serve */
  downloads?: ExportJobDownload[];
  error?: string;
};

/** What the editor's poll reads (server/download.ts `ExportPoll` is this type). */
export type ExportJobPoll = {
  jobId: string;
  status: ExportJobStatus;
  /** "slide k of n" while the worker renders (progressLine), else the worker's last log line */
  line?: string;
  /** the slide the worker is on and the slides the file holds, while the job runs */
  progress?: ExportProgress;
  ms?: number;
  report?: ExportReport;
  error?: string;
  /** one download address per produced file; empty when the worker is remote */
  downloads?: ExportJobDownload[];
};

/** The head line of a PowerPoint export in the worker's log (apps/cli/src/commands/export.ts): "export: pptx flatten (perfect), 6 slide(s) x light, fonts exact -> ..." */
const PPTX_HEAD = /^export: pptx \w+.*?, (\d+) slide\(s\) x ([a-z,]+)/;
/** The head line of a PDF export: "export: pdf light, 6 slide(s) -> ..." */
const PDF_HEAD = /^export: pdf (light|dark), (\d+) slide\(s\)/;
/** One rendered slide of a PowerPoint export: "  03 content-x light 812 ms, 4 text(s), 1 raster(s)" */
const SLIDE_LINE = /^\s*(\d+) [a-z0-9-]+ (light|dark) \d+ ms,/;

/**
 * Where an export is, from the worker's log so far: null before the head line, the count with
 * no slide before the first slide line, then the last slide line's number and appearance. Pure,
 * so the poll on the worker's own instance and the record another instance reads agree.
 */
export function progressOfLog(log: readonly string[]): ExportProgress | null {
  let total: number | null = null;
  let progress: ExportProgress | null = null;
  for (const line of log) {
    const pptx = PPTX_HEAD.exec(line);
    if (pptx !== null) {
      total = Number(pptx[1]);
      progress = { slide: 0, total };
      continue;
    }
    const pdf = PDF_HEAD.exec(line);
    if (pdf !== null) {
      total = Number(pdf[2]);
      progress = { slide: 0, total, theme: pdf[1] as 'light' | 'dark' };
      continue;
    }
    if (total === null) continue;
    const slide = SLIDE_LINE.exec(line);
    if (slide !== null) {
      progress = {
        slide: Math.min(total, Number(slide[1])),
        total,
        theme: slide[2] as 'light' | 'dark',
      };
    }
  }
  return progress;
}

// The refusals the page shows, in the product's words (the dialog's error line, kept open with
// its controls; the core specs' download helper reads "could not be made" as a refusal)
export const EXPORT_JOB_MISSING =
  'The export could not be found on this server, so the file could not be made. Try the download again.';
export const EXPORT_JOB_LOST =
  'The export was interrupted before it finished, so the file could not be made. Try the download again.';
export const EXPORT_JOB_FILES_GONE =
  'The export finished on a server that no longer holds its file, so the file could not be made. Try the download again.';
export const EXPORT_JOB_NO_REPORT = 'the export job finished without an export report';

/** A job id: the worker queue's `<base36 time>-<6 hex>` or the batched form; both are slugs of this shape. */
export function isExportJobId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
}

/**
 * The id the page mints for a synchronous export's progress record (the product round fix
 * round, the row `export.download.progress-per-slide`; build/b7.md R4's second choice): the
 * editor passes it to `syncExport` and polls `pollExport` with it beside the call, and the
 * server writes the running record under it while the export runs. Its own prefix keeps it
 * apart from the worker queue's ids.
 */
export const SYNC_PROGRESS_JOB_PATTERN = /^sync-[a-z0-9]{4,24}-[a-z0-9]{4,24}$/;

export function isSyncProgressJobId(value: unknown): value is string {
  return typeof value === 'string' && SYNC_PROGRESS_JOB_PATTERN.test(value);
}

/** A fresh sync progress id: `sync-<base36 time>-<8 hex>`; the page mints one per export. */
export function newSyncProgressJobId(now: number = Date.now()): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `sync-${now.toString(36)}-${hex}`;
}

/**
 * The words of a running export for the snackbar, "slide k of n" (the row
 * `export.download.progress-per-slide`; the Download dialog's `progressSentence` reads them off
 * the poll's `line`): once the worker has rendered a slide; null before the first slide and for
 * a PDF, which is one print with no per slide line, so the estimate sentence stands there.
 */
export function progressLine(progress: ExportProgress | null | undefined): string | null {
  if (progress === undefined || progress === null) return null;
  if (progress.slide < 1 || progress.total < 1) return null;
  return `slide ${Math.min(progress.slide, progress.total)} of ${progress.total}`;
}

export function exportJobKey(jobId: string): string {
  if (!isExportJobId(jobId)) throw new TypeError('jobId must be a job id');
  return `${EXPORT_JOBS_PREFIX}${jobId}.json`;
}

/** The start time a worker queue job id carries (render-worker queue.ts `newJobId`), or null. */
export function exportJobStartedAt(jobId: string): number | null {
  const match = /^([0-9a-z]+)-[0-9a-f]{6}$/.exec(jobId);
  if (match === null) return null;
  const at = parseInt(match[1] ?? '', 36);
  return Number.isFinite(at) ? at : null;
}

/** The worker's status as the poll reports it; anything else is a failure. */
export function exportJobStatusOf(status: string): ExportJobStatus {
  return status === 'queued' || status === 'running' || status === 'done' || status === 'failed'
    ? status
    : 'failed';
}

/** The record written at queue time. */
export function queuedExportJob(
  jobId: string,
  deckId: string,
  format: 'pptx' | 'pdf',
  now: string,
  title?: string | null,
): ExportJobRecord {
  if (!isExportJobId(jobId)) throw new TypeError('jobId must be a job id');
  if (!SLUG_PATTERN.test(deckId)) throw new TypeError('deckId must be a slug');
  return {
    v: 1,
    jobId,
    deckId,
    format,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    ...(typeof title === 'string' && title !== '' ? { title } : {}),
  };
}

/** The record while the job runs: the worker's last line and where it is; the rest as queued. */
export function runningExportJob(
  record: ExportJobRecord,
  now: string,
  progress: { line?: string; progress?: ExportProgress; workerJobId?: string },
): ExportJobRecord {
  return {
    ...record,
    status: 'running',
    updatedAt: now,
    ...(progress.line !== undefined ? { line: progress.line } : {}),
    ...(progress.progress !== undefined ? { progress: progress.progress } : {}),
    ...(progress.workerJobId !== undefined ? { workerJobId: progress.workerJobId } : {}),
  };
}

export type ExportJobOutcome =
  | {
      status: 'done';
      report: ExportReport;
      downloads?: ExportJobDownload[];
      ms?: number;
      line?: string;
    }
  | { status: 'failed'; error: string; ms?: number; line?: string };

/** The record once the job ended: done with its report and the stored files, or failed with its message. */
export function finishedExportJob(
  record: ExportJobRecord,
  outcome: ExportJobOutcome,
  now: string,
): ExportJobRecord {
  const base: ExportJobRecord = {
    v: 1,
    jobId: record.jobId,
    deckId: record.deckId,
    format: record.format,
    status: outcome.status,
    createdAt: record.createdAt,
    updatedAt: now,
    ...(record.title !== undefined ? { title: record.title } : {}),
    ...(record.workerJobId !== undefined ? { workerJobId: record.workerJobId } : {}),
    ...(outcome.line !== undefined ? { line: outcome.line } : {}),
    ...(outcome.ms !== undefined ? { ms: outcome.ms } : {}),
  };
  if (outcome.status === 'failed') return { ...base, error: outcome.error };
  return {
    ...base,
    report: outcome.report,
    ...(outcome.downloads !== undefined ? { downloads: outcome.downloads } : {}),
  };
}

function isProgress(value: unknown): value is ExportProgress {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    Number.isInteger(row.slide) &&
    (row.slide as number) >= 0 &&
    Number.isInteger(row.total) &&
    (row.total as number) >= 0 &&
    (row.theme === undefined || row.theme === 'light' || row.theme === 'dark')
  );
}

function isDownload(value: unknown): value is ExportJobDownload {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.name === 'string' &&
    row.name !== '' &&
    typeof row.bytes === 'number' &&
    typeof row.url === 'string' &&
    row.url !== ''
  );
}

/** A stored record as this module wrote it; null for anything else (a truncated put, another version). */
export function parseExportJob(raw: unknown): ExportJobRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== 1) return null;
  if (!isExportJobId(row.jobId)) return null;
  if (typeof row.deckId !== 'string' || !SLUG_PATTERN.test(row.deckId)) return null;
  if (row.format !== 'pptx' && row.format !== 'pdf') return null;
  if (typeof row.status !== 'string' || exportJobStatusOf(row.status) !== row.status) return null;
  if (typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string') return null;
  const record: ExportJobRecord = {
    v: 1,
    jobId: row.jobId,
    deckId: row.deckId,
    format: row.format,
    status: row.status as ExportJobStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (typeof row.title === 'string' && row.title !== '') record.title = row.title;
  if (isExportJobId(row.workerJobId)) record.workerJobId = row.workerJobId;
  if (typeof row.line === 'string') record.line = row.line;
  if (isProgress(row.progress)) record.progress = row.progress;
  if (typeof row.ms === 'number') record.ms = row.ms;
  if (typeof row.error === 'string') record.error = row.error;
  if (row.report !== undefined) {
    const report = exportReportSchema.safeParse(row.report);
    if (!report.success) return null;
    record.report = report.data;
  }
  if (row.downloads !== undefined) {
    if (!Array.isArray(row.downloads) || !row.downloads.every(isDownload)) return null;
    record.downloads = row.downloads;
  }
  return record;
}

/**
 * The record pathnames older than `maxAgeMs`: by the store's upload time, else by the start time
 * the worker's job id carries; a record with neither is left alone.
 */
export function staleExportJobPaths(
  entries: ReadonlyArray<{ pathname: string; uploadedAt?: string }>,
  now: number,
  maxAgeMs: number = EXPORT_JOB_MAX_AGE_MS,
): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.pathname.startsWith(EXPORT_JOBS_PREFIX) || !entry.pathname.endsWith('.json'))
      continue;
    const jobId = entry.pathname.slice(EXPORT_JOBS_PREFIX.length, -'.json'.length);
    const uploaded = entry.uploadedAt === undefined ? NaN : Date.parse(entry.uploadedAt);
    const age = Number.isFinite(uploaded) ? uploaded : exportJobStartedAt(jobId);
    if (age === null) continue;
    if (now - age > maxAgeMs) out.push(entry.pathname);
  }
  return out.sort();
}

/** A stored copy is asked for as an attachment (Vercel Blob honours `download=1`); a route of ours already is one. */
export function attachmentUrlOf(url: string): string {
  if (url.startsWith('/')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

/** The poll's answer for a job no record names: a refusal the page shows, never a thrown error. */
export function missingExportJobPoll(jobId: string): ExportJobPoll {
  return { jobId, status: 'failed', error: EXPORT_JOB_MISSING };
}

/**
 * The poll's answer from a record, read on an instance that does not hold the job. `stored`
 * says whether the part store is shared (the Blob store): a queued or running record there is
 * another instance's job in progress; on a checkout's folder the one process that could run the
 * job has restarted, so the same record is a lost job.
 */
export function pollOfExportJob(
  record: ExportJobRecord,
  options: { stored: boolean },
): ExportJobPoll {
  const running = record.status !== 'done' && record.status !== 'failed';
  // the poll's line reads "slide k of n" while the worker renders (the snackbar's sentence),
  // else the worker's last log line
  const line = (running ? progressLine(record.progress) : null) ?? record.line;
  const poll: ExportJobPoll = {
    jobId: record.jobId,
    status: record.status,
    ...(line !== undefined ? { line } : {}),
    ...(record.progress !== undefined && running ? { progress: record.progress } : {}),
    ...(record.ms !== undefined ? { ms: record.ms } : {}),
  };
  switch (record.status) {
    case 'failed':
      return { ...poll, error: record.error ?? 'the export failed' };
    case 'done':
      if (record.report === undefined)
        return { ...poll, status: 'failed', error: EXPORT_JOB_NO_REPORT };
      if (record.downloads === undefined)
        return { ...poll, status: 'failed', error: EXPORT_JOB_FILES_GONE };
      return { ...poll, report: record.report, downloads: record.downloads };
    default:
      return options.stored ? poll : { ...poll, status: 'failed', error: EXPORT_JOB_LOST };
  }
}
