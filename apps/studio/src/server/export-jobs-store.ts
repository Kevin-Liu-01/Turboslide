import { provenGet, putWithCopy } from '@turboslide/store/access-store';
import type { BlobClient } from '@turboslide/store/blob-store';

import {
  EXPORT_JOBS_PREFIX,
  exportJobKey,
  isExportJobId,
  parseExportJob,
  staleExportJobPaths,
} from './export-jobs';
import type { ExportJobRecord } from './export-jobs';

/**
 * The export job record's reads and writes against the part store, server only (the sync and
 * costs round; docs/SYNC.md 3.5, invariant 8; build/b1.md R10). They lived in export-jobs.ts,
 * whose plain exports the editor's client reads (download.ts imports `SYNC_PROGRESS_JOB_PATTERN`
 * as a value into a server function's validator), so when the proof rule brought
 * `@turboslide/store/access-store` into that module the client stub kept the import and `/new`
 * and `/edit/<id>` died on "Module node:crypto has been externalized for browser compatibility"
 * (access-store.ts reaches node:crypto, node:fs and the store's whole graph). The pure half (the
 * record shapes, the sentences, the parse, the stale paths) stays in export-jobs.ts where the
 * client can read it; the three functions that touch a client live here, imported by
 * export-batch.ts and the export route alone, which the client never names.
 *
 * Pure over a `BlobClient` so the record's life is unit tested (export-jobs.test.ts).
 */

/**
 * Writes the record with its immutable copy first (`putWithCopy`); best effort. A put the store
 * refuses answers false and never fails the export it describes: the poll on the worker's own
 * instance answers from the job table, and a poll elsewhere answers the missing record's refusal
 * instead of a hang.
 */
export async function writeExportJob(
  client: BlobClient,
  record: ExportJobRecord,
): Promise<boolean> {
  try {
    await putWithCopy(
      client,
      exportJobKey(record.jobId),
      new TextEncoder().encode(JSON.stringify(record)),
      { overwrite: true, contentType: 'application/json' },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The record of a job, read proven (`provenGet`: the head first, the body only when its md5 is
 * the head's version, else the copy under that version), or null when the store holds none
 * (never queued here, pruned, or another kind of job).
 */
export async function readExportJob(
  client: BlobClient,
  jobId: string,
): Promise<ExportJobRecord | null> {
  if (!isExportJobId(jobId)) return null;
  let fetched: { bytes: Uint8Array } | null;
  try {
    fetched = await provenGet(client, exportJobKey(jobId));
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
