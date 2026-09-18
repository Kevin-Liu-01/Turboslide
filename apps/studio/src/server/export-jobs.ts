import { JOB_MAX_AGE_MS } from '@turboslide/export/batch/plan';
import type { ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { BlobClient } from '@turboslide/store/blob-store';

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
 * Pure over a `BlobClient` so the record's life is unit tested (export-jobs.test.ts); the runtime
 * (the part store, the worker client, `waitUntil`) is server/export-batch.ts's.
 */

/** Where the records live: a folder no deck id can name (a slug carries no dot). */
export const EXPORT_JOBS_PREFIX = 'exports/.jobs/';

/** A record older than this is pruned at the next export start (SPEC-2 0.45, the batched jobs' bound). */
export const EXPORT_JOB_MAX_AGE_MS = JOB_MAX_AGE_MS;

export type ExportJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type ExportJobDownload = { name: string; bytes: number; url: string };

export type ExportJobRecord = {
  v: 1;
  jobId: string;
  deckId: string;
  format: 'pptx' | 'pdf';
  status: ExportJobStatus;
  createdAt: string;
  updatedAt: string;
  /** the worker's last log line */
  line?: string;
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
  /** the worker's last log line */
  line?: string;
  ms?: number;
  report?: ExportReport;
  error?: string;
  /** one download address per produced file; empty when the worker is remote */
  downloads?: ExportJobDownload[];
};

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
): ExportJobRecord {
  if (!isExportJobId(jobId)) throw new TypeError('jobId must be a job id');
  if (!SLUG_PATTERN.test(deckId)) throw new TypeError('deckId must be a slug');
  return { v: 1, jobId, deckId, format, status: 'queued', createdAt: now, updatedAt: now };
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
  if (typeof row.line === 'string') record.line = row.line;
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
 * Writes the record; best effort. A put the store refuses answers false and never fails the
 * export it describes: the poll on the worker's own instance answers from the job table, and a
 * poll elsewhere answers the missing record's refusal instead of a hang.
 */
export async function writeExportJob(
  client: BlobClient,
  record: ExportJobRecord,
): Promise<boolean> {
  try {
    await client.put(exportJobKey(record.jobId), new TextEncoder().encode(JSON.stringify(record)), {
      overwrite: true,
      contentType: 'application/json',
    });
    return true;
  } catch {
    return false;
  }
}

/** The record of a job, or null when the store holds none (never queued here, pruned, or another kind of job). */
export async function readExportJob(
  client: BlobClient,
  jobId: string,
): Promise<ExportJobRecord | null> {
  if (!isExportJobId(jobId)) return null;
  let fetched: { bytes: Uint8Array } | null;
  try {
    fetched = await client.get(exportJobKey(jobId));
  } catch {
    return null;
  }
  if (fetched === null) return null;
  try {
    return parseExportJob(JSON.parse(new TextDecoder().decode(fetched.bytes)));
  } catch {
    return null;
  }
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

/** Removes the records older than a day (one list of the folder); the count removed, 0 when the store refused. */
export async function pruneExportJobs(client: BlobClient, now: number): Promise<number> {
  try {
    const doomed = staleExportJobPaths(await client.list(EXPORT_JOBS_PREFIX), now);
    if (doomed.length > 0) await client.del(doomed);
    return doomed.length;
  } catch {
    return 0;
  }
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
  const poll: ExportJobPoll = {
    jobId: record.jobId,
    status: record.status,
    ...(record.line !== undefined ? { line: record.line } : {}),
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
