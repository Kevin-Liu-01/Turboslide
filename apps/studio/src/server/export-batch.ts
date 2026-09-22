import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { waitUntil } from '@vercel/functions';

import {
  assetHashes,
  batchRecordName,
  batchSize,
  deckExportsPrefix,
  isStale,
  jobIdNow,
  jobPrefix,
  mergeParts,
  partsPrefix,
  planBatches,
  planKey,
  planPlayList,
  relocateScene,
  scenePartName,
  staleJobPaths,
  wordmarkPartName,
} from '@turboslide/export/batch';
import type { BatchExportInput, BatchRecord, ExportPlan } from '@turboslide/export/batch';
import { extractScenes } from '@turboslide/export/scene/extract';
import type { PublicJob, WorkerClient } from '@turboslide/render-worker/client';
import { verifySkippedNote, verifyTools } from '@turboslide/render-worker/jobs/export';
import type { VerifyOutcome } from '@turboslide/render-worker/jobs/export';
import { ACTIONS } from '@turboslide/schema/actions';
import type { DeckDocument } from '@turboslide/schema/deck';
import { NATIVE_BLOCK_TYPES, exportReportSchema } from '@turboslide/schema/export';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Theme } from '@turboslide/schema/render';
import { diskBlobClient } from '@turboslide/store/blob-disk';
import type { BlobClient } from '@turboslide/store/blob-store';

import {
  EXPORT_JOB_NO_REPORT,
  attachmentUrlOf,
  exportJobStatusOf,
  finishedExportJob,
  missingExportJobPoll,
  pollOfExportJob,
  progressLine,
  progressOfLog,
  queuedExportJob,
  runningExportJob,
} from './export-jobs';
import type { ExportJobDownload, ExportJobPoll, ExportJobRecord } from './export-jobs';
import { pruneExportJobs, readExportJob, writeExportJob } from './export-jobs-store';
import {
  SYNC_EXPORT_TIMEOUT_MS,
  contentTypeOf,
  deckTitleOf,
  displayNamesOf,
  jsonBody,
  runSyncExport,
  storedExportPath,
} from './export-sync';
import type { SyncExportFile, SyncExportInput, SyncExportResult } from './export-sync';
import { deckDir, ensureDeckAssets, exportBlobClient, openDeckStore, stateDir } from './root';
import { cancelTokenFor } from './tokens';

/**
 * The batched Perfect export's server side (gslides-parity SPEC-2 8.1, 0.31, 0.44, 0.45, 0.48):
 * the adapter around `@turboslide/export/batch`. The plan, the batch bookkeeping and the merge are
 * that module's pure functions; this file does the reads and writes: the deck through the hosted
 * store (the document at the plan's revision through `documentAtRevision`, so a deck edited
 * during a download still exports the revision the dialog started from), the twins on disk for
 * the renderer, the parts and the files in the part store, and the browser for one batch.
 *
 * The part store is the Blob store's client on the blob backend (`exports/<deckId>/<jobId>/`,
 * the round one prefix, so `deck.remove` and the 24 h prune cover it) and a folder of this
 * instance's derived files on the file and tmp backends (`.turboslide/exports/`), through the
 * same BlobClient shape (`@turboslide/store/blob-disk`); there the files' URLs name the export
 * route's `?job=<id>&file=<name>` form, which streams them from this instance, and the end to
 * end spec drives the whole protocol against a dev server with `TURBOSLIDE_STORE=tmp`.
 *
 * Loaded lazily: `download.ts` imports this module inside its server function handlers and the
 * export route imports it directly, because the module reaches the extractor and the browser and
 * must never join the browser's graph (the same rule as `export-sync.ts`). One browser at a time
 * per process: two batch calls that land on one instance run one after the other.
 */

export type StartBatchedExportResult = {
  jobId: string;
  /** The cancel capability (gslides-parity SPEC-3 8.13): `?cancel=<jobId>&ct=<cancelToken>` on the route. */
  cancelToken: string;
  revision: number;
  batches: string[][];
  /** the batch size in force (TURBOSLIDE_EXPORT_BATCH or 60) */
  batchSize: number;
  /** the slides the file will hold */
  total: number;
};

export type ExportBatchResult =
  { index: number; slides: number; ms: number; renderer: string } | { stale: 'revision' | 'asset' };

export type MergeExportResult = ReturnType<typeof jsonBody> & {
  /** the largest resident memory sampled during the merge, in MiB (SPEC-2 0.44) */
  peakMb: number;
  batches: number;
  jobId: string;
};

/** A job id: the batched form of plan.ts or the worker's; both are slugs of this shape. */
export function isJobId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
}

/** The part store: the Blob client on a deployment (`stored`), else this instance's folder of derived files. */
export type PartStore = { client: BlobClient; stored: boolean };

let diskStore: BlobClient | undefined;

/** The Blob client when the deployment has one, else this instance's folder of derived files. */
async function partStore(): Promise<PartStore> {
  const blob = await exportBlobClient();
  if (blob !== null) return { client: blob, stored: true };
  diskStore ??= diskBlobClient(stateDir(), {
    urlFor: (pathname) => {
      // exports/<deckId>/<jobId>/<name>: the route streams the file from this instance
      const [, deckId, jobId, ...rest] = pathname.split('/');
      return `/api/export/${deckId ?? ''}?job=${encodeURIComponent(jobId ?? '')}&file=${encodeURIComponent(rest.join('/'))}`;
    },
  });
  return { client: diskStore, stored: false };
}

/** The export.run input for a batched job: PPTX, validated by the action's schema, `out`, `batch` and `merge` removed. */
export function batchInputOf(raw: unknown): BatchExportInput {
  const parsed = ACTIONS['export.run'].input.safeParse({ format: 'pptx', ...(raw as object) });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new TypeError(
      `export.run: invalid input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const {
    out: _out,
    batch: _batch,
    merge: _merge,
    ...input
  } = parsed.data as BatchExportInput & {
    out?: string;
    batch?: unknown;
    merge?: unknown;
  };
  if ((input.format as string) !== 'pptx') {
    throw new TypeError(
      'A batched export is PPTX only: the PDF is one print of the whole document and stays a single call (SPEC-2 8.1)',
    );
  }
  return input;
}

function requireSlug(deckId: string): void {
  if (!SLUG_PATTERN.test(deckId)) throw new TypeError('deckId must be a slug');
}

async function readPlanFrom(
  client: BlobClient,
  deckId: string,
  jobId: string,
): Promise<ExportPlan | null> {
  const fetched = await client.get(planKey(deckId, jobId));
  if (fetched === null) return null;
  return JSON.parse(new TextDecoder().decode(fetched.bytes)) as ExportPlan;
}

/** The stored plan of a job, or null when the store has none (a cancelled or pruned job, or the worker's). */
export async function readPlan(deckId: string, jobId: string): Promise<ExportPlan | null> {
  requireSlug(deckId);
  if (!isJobId(jobId)) return null;
  return readPlanFrom((await partStore()).client, deckId, jobId);
}

function readAssetFrom(dir: string): (relative: string) => Promise<Uint8Array | null> {
  return async (relative) => {
    const file = join(dir, ...relative.split('/'));
    if (!existsSync(file)) return null;
    return new Uint8Array(await readFile(file));
  };
}

/** Every job under the deck's export prefix older than 24 h goes (SPEC-2 0.45). */
async function pruneOldJobs(client: BlobClient, deckId: string): Promise<number> {
  const entries = await client.list(deckExportsPrefix(deckId));
  const doomed = staleJobPaths(entries, deckId, { now: Date.now() });
  if (doomed.length > 0) await client.del(doomed);
  return doomed.length;
}

/**
 * Step one: the plan. Reads the deck at its current revision, computes the play list and the
 * batches, pins the sha256 of every twin the play list references, prunes the old jobs and
 * stores `plan.json`.
 */
export async function startBatchedExport(
  deckId: string,
  rawInput: unknown,
): Promise<StartBatchedExportResult> {
  requireSlug(deckId);
  const input = batchInputOf(rawInput);
  const store = await openDeckStore(deckId);
  const { document } = await store.read();
  await ensureDeckAssets(deckId);
  const dir = deckDir(deckId);
  const { play, ids, omitted } = planPlayList(document, input);
  if (ids.length === 0) throw new RangeError('every selected slide is skipped; nothing to export');
  const size = batchSize();
  const batches = planBatches(ids, size);
  const assets = await assetHashes(document, ids, readAssetFrom(dir));
  const jobId = jobIdNow();
  const plan: ExportPlan = {
    version: 1,
    jobId,
    deckId,
    deckTitle: document.deck.title,
    revision: document.deck.revision,
    startedAt: new Date().toISOString(),
    input,
    mode: input.mode ?? 'flatten',
    themes: input.theme ?? ['light', 'dark'],
    play,
    ids,
    omitted,
    batches,
    assets,
    ...(document.deck.defaults?.notes !== undefined
      ? { defaultNotes: document.deck.defaults.notes }
      : {}),
  };
  const { client } = await partStore();
  await pruneOldJobs(client, deckId);
  await client.put(planKey(deckId, jobId), new TextEncoder().encode(JSON.stringify(plan)), {
    overwrite: false,
    contentType: 'application/json',
  });
  return {
    jobId,
    cancelToken: cancelTokenFor(jobId),
    revision: plan.revision,
    batches,
    batchSize: size,
    total: ids.length,
  };
}

/* one browser per process: batch calls on one instance run in turn (the render worker's rule) */
let slot: Promise<unknown> = Promise.resolve();
function withBrowserSlot<T>(run: () => Promise<T>): Promise<T> {
  const next = slot.then(run, run);
  slot = next.catch(() => undefined);
  return next;
}

/**
 * Step two: one batch. Renders the batch's slides from the document at the plan's revision with
 * the play list's numbering, and stores every scene and the files it names as parts with
 * `overwrite: true`, so a rerun of a failed batch rewrites the same paths and a repeat of a
 * finished one answers the same result. `stale` when the revision cannot be read any more or an
 * asset the batch references no longer hashes as the plan recorded; the dialog restarts the job.
 */
export async function exportBatch(
  deckId: string,
  jobId: string,
  index: number,
  of?: number,
): Promise<ExportBatchResult> {
  requireSlug(deckId);
  if (!isJobId(jobId)) throw new TypeError('jobId must be a job id');
  const { client } = await partStore();
  const plan = await readPlanFrom(client, deckId, jobId);
  if (plan === null) throw new RangeError(`No export job ${jobId} for ${deckId}`);
  if (of !== undefined && of !== plan.batches.length)
    throw new TypeError(`the job has ${plan.batches.length} batch(es), not ${of}`);
  const batchIds = plan.batches[index];
  if (!Number.isInteger(index) || batchIds === undefined)
    throw new RangeError(`batch ${index} is not in the job (${plan.batches.length} batches)`);
  const store = await openDeckStore(deckId);
  let document: DeckDocument;
  try {
    document = await store.documentAtRevision(plan.revision);
  } catch {
    return { stale: 'revision' };
  }
  await ensureDeckAssets(deckId);
  const dir = deckDir(deckId);
  const hashes = await assetHashes(document, batchIds, readAssetFrom(dir));
  const stale = isStale(plan, document, hashes);
  if (stale !== null) return { stale };
  const t = performance.now();
  const prefix = partsPrefix(deckId, jobId);
  const nativeTypes =
    plan.input.headings === 'raster'
      ? NATIVE_BLOCK_TYPES.filter((type) => type !== 'heading')
      : [...NATIVE_BLOCK_TYPES];
  return withBrowserSlot(async () => {
    const work = await mkdtemp(join(tmpdir(), 'turboslide-batch-'));
    try {
      const extracted = await extractScenes({
        deckDir: dir,
        document,
        themes: plan.themes,
        mode: plan.mode,
        slideIds: batchIds,
        numbering: plan.play,
        workDir: work,
        excludeShareAlike: plan.input.excludeShareAlike,
        nativeTypes,
        rasterScale: plan.input.rasterScale ?? 'auto',
        pictureScale: plan.input.pictureScale ?? 2,
      });
      const put = async (name: string, bytes: Uint8Array): Promise<void> => {
        await client.put(`${prefix}${name}`, bytes, {
          overwrite: true,
          contentType: contentTypeOf(name),
        });
      };
      const uploaded = new Set<string>();
      for (const scene of extracted.scenes) {
        const { scene: part, uploads } = relocateScene(scene);
        for (const upload of uploads) {
          if (uploaded.has(upload.to)) continue;
          uploaded.add(upload.to);
          await put(upload.to, new Uint8Array(await readFile(upload.from)));
        }
        await put(scenePartName(part), new TextEncoder().encode(JSON.stringify(part)));
      }
      const wordmark: Theme[] = [];
      for (const theme of plan.themes) {
        const path = extracted.wordmark[theme];
        if (path === undefined || !existsSync(path)) continue;
        await put(wordmarkPartName(theme), new Uint8Array(await readFile(path)));
        wordmark.push(theme);
      }
      const ms = Math.round(performance.now() - t);
      const record: BatchRecord = {
        index,
        slides: batchIds,
        ms,
        renderer: extracted.renderer,
        warnings: extracted.warnings,
        wordmark,
      };
      await put(batchRecordName(index), new TextEncoder().encode(JSON.stringify(record)));
      return { index, slides: batchIds.length, ms, renderer: extracted.renderer };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
}

/**
 * Step three: the merge. Streams the parts to this function's disk one file at a time, builds
 * the files per theme from the scenes in play order with no browser, stores the files and the
 * reports under the job, and answers the `jsonBody` shape of the synchronous export plus the
 * merge's peak resident memory.
 */
export async function mergeExport(deckId: string, jobId: string): Promise<MergeExportResult> {
  requireSlug(deckId);
  if (!isJobId(jobId)) throw new TypeError('jobId must be a job id');
  const { client, stored } = await partStore();
  const plan = await readPlanFrom(client, deckId, jobId);
  if (plan === null) throw new RangeError(`No export job ${jobId} for ${deckId}`);
  const t = performance.now();
  const prefix = partsPrefix(deckId, jobId);
  const tmp = await mkdtemp(join(tmpdir(), `turboslide-merge-${jobId}-`));
  const partsDir = join(tmp, 'parts');
  const outDir = join(tmp, 'out');
  const log: string[] = [];
  try {
    const entries = await client.list(prefix);
    const scenes: string[] = [];
    const records: BatchRecord[] = [];
    for (const entry of entries) {
      const name = entry.pathname.slice(prefix.length);
      const fetched = await client.get(entry.pathname);
      if (fetched === null) continue;
      const file = join(partsDir, ...name.split('/'));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, fetched.bytes);
      if (name.endsWith('.scene.json') && !name.includes('/')) scenes.push(file);
      if (/^batch-\d+\.json$/.test(name))
        records.push(JSON.parse(new TextDecoder().decode(fetched.bytes)) as BatchRecord);
    }
    log.push(
      `merge: ${entries.length} part(s) streamed, ${scenes.length} scene(s), ${records.length} batch record(s)`,
    );
    for (const record of records.sort((a, b) => a.index - b.index))
      log.push(`batch ${record.index}: ${record.slides.length} slide(s) in ${record.ms} ms`);
    const merged = await mergeParts({ partsDir, scenes, records }, plan, { outDir });
    log.push(`merge: built in ${merged.ms} ms, peak ${merged.peakMb} MiB`);
    let verify: VerifyOutcome = plan.input.verify ? 'skipped' : 'not-requested';
    let verifyNote: string | undefined;
    if (plan.input.verify) {
      verifyNote = verifySkippedNote(plan.mode, await verifyTools(), 'pptx');
      verify = 'skipped';
    }
    const files: SyncExportFile[] = [];
    const produced = [...merged.files, ...(merged.zipPath ? [merged.zipPath] : [])];
    // the files are stored under the names the downloads save as (the product round, rank 7):
    // the deck's title with the appearance mark when both left this run, never the deck id
    const sources = produced.map((path) => path.split('/').pop() ?? path);
    const names = displayNamesOf(sources, {
      title: plan.deckTitle === '' ? null : plan.deckTitle,
      deckId,
      mode: plan.mode,
    });
    for (const [i, path] of produced.entries()) {
      const source = sources[i] ?? path;
      const name = names.get(source) ?? source;
      const data = new Uint8Array(await readFile(path));
      const entry = await client.put(`${jobPrefix(deckId, jobId)}${name}`, data, {
        overwrite: true,
        contentType: contentTypeOf(source),
      });
      files.push({
        name,
        source,
        bytes: data.byteLength,
        sha256: createHash('sha256').update(data).digest('hex'),
        contentType: contentTypeOf(source),
        data,
        url: entry.url,
        stored,
      });
    }
    for (const path of [merged.reportPath, ...Object.values(merged.reportPaths)]) {
      const name = path.split('/').pop() ?? path;
      await client.put(`${jobPrefix(deckId, jobId)}${name}`, new Uint8Array(await readFile(path)), {
        overwrite: true,
        contentType: 'application/json',
      });
    }
    const result: SyncExportResult = {
      jobId,
      deckId,
      title: plan.deckTitle === '' ? null : plan.deckTitle,
      report: merged.merged,
      files,
      verify,
      ...(verifyNote ? { verifyNote } : {}),
      worker: 'local',
      exec: 'batched',
      renderer: merged.renderer === '' ? null : merged.renderer,
      ms: Math.round(performance.now() - t),
      log,
    };
    return { ...jsonBody(result), peakMb: merged.peakMb, batches: plan.batches.length, jobId };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Cancel: the job's prefix goes, plan, parts and files. A job the store no longer has removes nothing. */
export async function cancelBatchedExport(
  deckId: string,
  jobId: string,
): Promise<{ jobId: string; removed: number }> {
  requireSlug(deckId);
  if (!isJobId(jobId)) throw new TypeError('jobId must be a job id');
  const { client } = await partStore();
  const entries = await client.list(jobPrefix(deckId, jobId));
  if (entries.length > 0) await client.del(entries.map((entry) => entry.pathname));
  return { jobId, removed: entries.length };
}

/**
 * A name a produced file may carry on the route: letters, digits, spaces, dots, dashes,
 * underscores and parentheses (a title's marks, plan.ts exportFileName), never a path segment or
 * a leading dot.
 */
export function isProducedFileName(name: string): boolean {
  return (
    /^[^\\/\u0000-\u001f"*:<>?|]{1,160}$/.test(name) &&
    !name.startsWith('.') &&
    name.trim() === name
  );
}

/** A file of a batched job (the route's `?job=<id>&file=<name>` on this instance), or null. */
export async function batchedJobFile(
  deckId: string,
  jobId: string,
  name: string,
): Promise<{ data: Uint8Array<ArrayBuffer>; contentType: string } | null> {
  requireSlug(deckId);
  if (!isJobId(jobId) || !isProducedFileName(name)) return null;
  const { client } = await partStore();
  if ((await readPlanFrom(client, deckId, jobId)) === null) return null;
  const fetched = await client.get(`${jobPrefix(deckId, jobId)}${name}`);
  if (fetched === null) return null;
  // a copy over its own ArrayBuffer, the body type a Response takes
  return { data: new Uint8Array(fetched.bytes), contentType: contentTypeOf(name) };
}

// ---------------------------------------------------------------------------------------------
// The editor's queued export across instances (VERIFICATION C3S-F7; export-jobs.ts says why)

/** Runs `work` after the response: inside Vercel's `waitUntil` when a request context exists, as a detached promise otherwise (a checkout). The same shape as thumbs.ts `afterResponse`. */
export function afterResponse(work: Promise<unknown>, label: string): void {
  const settled = work.catch((error: unknown) => {
    console.error(
      `turboslide export: ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  try {
    waitUntil(settled);
  } catch {
    // no request context (the dev server, a test): the promise runs on its own
  }
}

/** The worker's last log line, when it wrote one. */
function lastLineOf(job: PublicJob): string | undefined {
  return job.log[job.log.length - 1];
}

type JobResultLike = { report?: unknown };

/**
 * Stores a finished job's files where any instance can serve them and rewrites its record as
 * done (or failed, when the report is missing or a file cannot be read); the worker's own
 * instance runs it under `waitUntil` right after the job ends, and a poll on that instance that
 * meets a done job whose record is not done yet runs it too. Idempotent: a record already done
 * is answered as it is, and two runs put the same paths with `overwrite: true`. On a checkout
 * (the folder store) the files stay in the job folder, which the download route serves through
 * the signed one time URLs the poll mints; the record carries no downloads there.
 */
export async function storeFinishedExportJob(
  worker: WorkerClient,
  store: PartStore,
  record: ExportJobRecord,
  job: PublicJob,
  now: () => string = () => new Date().toISOString(),
): Promise<ExportJobRecord> {
  const current = (await readExportJob(store.client, record.jobId)) ?? record;
  if (current.status === 'done' || current.status === 'failed') return current;
  const line = lastLineOf(job);
  const finish = async (record2: ExportJobRecord): Promise<ExportJobRecord> => {
    await writeExportJob(store.client, record2);
    return record2;
  };
  if (job.status !== 'done') {
    return finish(
      finishedExportJob(
        current,
        {
          status: 'failed',
          error: job.error?.message ?? 'the export failed',
          ...(job.ms !== undefined ? { ms: job.ms } : {}),
          ...(line !== undefined ? { line } : {}),
        },
        now(),
      ),
    );
  }
  const report = exportReportSchema.safeParse((job.result as JobResultLike | undefined)?.report);
  if (!report.success) {
    return finish(
      finishedExportJob(current, { status: 'failed', error: EXPORT_JOB_NO_REPORT }, now()),
    );
  }
  let downloads: ExportJobDownload[] | undefined;
  if (store.stored) {
    downloads = [];
    try {
      // stored under the names the downloads save as (the product round, rank 7), read by the
      // exporter's own names from the worker's job folder
      const sources = report.data.files.map((file) => basename(file.path));
      const names = displayNamesOf(sources, {
        title: current.title ?? null,
        deckId: record.deckId,
        mode: report.data.mode,
      });
      for (const source of sources) {
        const name = names.get(source) ?? source;
        const data = await worker.readJobFile(job.id, `export/${source}`);
        const entry = await store.client.put(storedExportPath(record.deckId, job.id, name), data, {
          overwrite: true,
          contentType: contentTypeOf(source),
        });
        downloads.push({ name, bytes: data.byteLength, url: attachmentUrlOf(entry.url) });
      }
    } catch (error) {
      // the other run stored the files and pruned the job folder first: its record stands
      const again = await readExportJob(store.client, record.jobId);
      if (again?.status === 'done') return again;
      return finish(
        finishedExportJob(
          current,
          { status: 'failed', error: error instanceof Error ? error.message : String(error) },
          now(),
        ),
      );
    }
  }
  const done = await finish(
    finishedExportJob(
      current,
      {
        status: 'done',
        report: report.data,
        ...(downloads !== undefined ? { downloads } : {}),
        ...(job.ms !== undefined ? { ms: job.ms } : {}),
        ...(line !== undefined ? { line } : {}),
      },
      now(),
    ),
  );
  // the bytes are in the store: free the job's disk, which a function shares with the browser
  // and the next export (export-sync.ts does the same after a synchronous export)
  if (store.stored) await worker.pruneJob(job.id).catch(() => undefined);
  return done;
}

/**
 * Step one of the queued export, after `submit`: the record at queue time, the records older
 * than a day pruned, and the job followed to its end after the response (the worker's instance
 * rewrites the record with the stored files), so a poll routed anywhere reads the outcome.
 */
/** How often the follow reads the job's log for the record's progress: the blob tier's tick (pulse.ts HOSTED_POLL_MS). */
export const EXPORT_PROGRESS_TICK_MS = 2_000;

/**
 * Writes the job's progress into its record while it runs (the product round, the row
 * export.download.progress-per-slide): one read of the in process job per tick and one put when
 * the slide moved, so a poll routed to another instance reads "slide k of n" from the record.
 * The follow's own instance answers from the live log. Stops when the job ends or the signal
 * fires; a put the store refuses is skipped, never retried in a loop.
 */
export async function followExportProgress(
  worker: WorkerClient,
  store: PartStore,
  record: ExportJobRecord,
  done: Promise<unknown>,
  tickMs: number = EXPORT_PROGRESS_TICK_MS,
  workerJobId: string = record.jobId,
): Promise<void> {
  if (!store.stored) return;
  let ended = false;
  void done.finally(() => {
    ended = true;
  });
  let last = '';
  while (!ended) {
    await new Promise((resolve) => setTimeout(resolve, tickMs));
    if (ended) return;
    const job = await worker.job(workerJobId);
    if (job === null || job.status !== 'running') continue;
    const progress = progressOfLog(job.log);
    const key =
      progress === null ? '' : `${progress.slide}/${progress.total}/${progress.theme ?? ''}`;
    if (progress === null || key === last) continue;
    last = key;
    await writeExportJob(
      store.client,
      runningExportJob(record, new Date().toISOString(), {
        progress,
        ...(job.log[job.log.length - 1] !== undefined ? { line: job.log[job.log.length - 1] } : {}),
      }),
    );
  }
}

export async function followExportJob(
  worker: WorkerClient,
  job: PublicJob,
  deckId: string,
  format: 'pptx' | 'pdf',
  store?: PartStore,
  title?: string | null,
): Promise<void> {
  store ??= await partStore();
  const record = queuedExportJob(job.id, deckId, format, new Date().toISOString(), title);
  await writeExportJob(store.client, record);
  afterResponse(
    (async () => {
      await pruneExportJobs(store.client, Date.now());
      let finished: PublicJob;
      const waiting = worker.wait(job.id, SYNC_EXPORT_TIMEOUT_MS);
      void followExportProgress(
        worker,
        store,
        record,
        waiting.catch(() => undefined),
      ).catch(() => undefined);
      try {
        finished = await waiting;
      } catch (error) {
        const again = await readExportJob(store.client, job.id);
        if (again?.status === 'done' || again?.status === 'failed') return;
        await writeExportJob(
          store.client,
          finishedExportJob(
            again ?? record,
            { status: 'failed', error: error instanceof Error ? error.message : String(error) },
            new Date().toISOString(),
          ),
        );
        return;
      }
      await storeFinishedExportJob(worker, store, record, finished);
    })(),
    `job ${job.id}`,
  );
}

export type ExportPollDeps = {
  /** `authorize(export)` on the job's deck, the poll's right (download.ts `pollExportFn`) */
  authorize: (deckId: string) => Promise<void>;
  /**
   * a signed one time download URL of a job file on this instance (the checkout path): the file
   * by the exporter's name, saved as the display name when one is given
   */
  sign: (jobId: string, name: string, saveAs?: string) => string;
};

/**
 * Step two: the job's state. The job in this process answers as before (its live log line, the
 * report and the download URLs once done: the stored copies on a deployment, the signed job
 * files on a checkout); a job this process never held answers from the record another instance
 * wrote, and a job no record names answers the refusal in the product's words, never a thrown
 * error.
 */
export async function pollExportJob(
  worker: WorkerClient,
  jobId: string,
  deps: ExportPollDeps,
  store?: PartStore,
): Promise<ExportJobPoll> {
  store ??= await partStore();
  const job = await worker.job(jobId);
  if (job !== null) {
    const deckOfJob = (job.input as { deckId?: string } | undefined)?.deckId;
    if (typeof deckOfJob === 'string' && SLUG_PATTERN.test(deckOfJob))
      await deps.authorize(deckOfJob);
    const status = exportJobStatusOf(job.status);
    // where the worker is, off its own log (the product round, the row
    // export.download.progress-per-slide): the play list number of the last slide line, read
    // into the poll's line as "slide k of n" (the snackbar's words), else the last log line
    const progress = status === 'running' ? progressOfLog(job.log) : null;
    const line = progressLine(progress) ?? lastLineOf(job);
    const poll: ExportJobPoll = {
      jobId: job.id,
      status,
      ...(line !== undefined ? { line } : {}),
      ...(progress !== null ? { progress } : {}),
      ...(job.ms !== undefined ? { ms: job.ms } : {}),
    };
    if (status === 'failed') return { ...poll, error: job.error?.message ?? 'the export failed' };
    if (status !== 'done') return poll;
    const report = exportReportSchema.safeParse((job.result as JobResultLike | undefined)?.report);
    if (!report.success) return { ...poll, status: 'failed', error: EXPORT_JOB_NO_REPORT };
    if (!store.stored) {
      const record = await readExportJob(store.client, jobId);
      const sources = report.data.files.map((file) => basename(file.path));
      const names = displayNamesOf(sources, {
        title: record?.title ?? null,
        deckId: typeof deckOfJob === 'string' ? deckOfJob : report.data.deckId,
        mode: report.data.mode,
      });
      return {
        ...poll,
        report: report.data,
        downloads:
          worker.mode === 'local'
            ? report.data.files.map((file) => {
                const source = basename(file.path);
                const name = names.get(source) ?? source;
                return { name, bytes: file.bytes, url: deps.sign(job.id, source, name) };
              })
            : [],
      };
    }
    // a deployment: the stored copies, written by the follow of the job or here
    const record =
      (await readExportJob(store.client, jobId)) ??
      queuedExportJob(
        job.id,
        typeof deckOfJob === 'string' && SLUG_PATTERN.test(deckOfJob) ? deckOfJob : 'unknown-deck',
        report.data.format,
        job.createdAt,
      );
    const finished = await storeFinishedExportJob(worker, store, record, job);
    return pollOfExportJob(finished, { stored: true });
  }
  const record = await readExportJobCached(store.client, jobId);
  if (record === null) return missingExportJobPoll(jobId);
  await deps.authorize(record.deckId);
  // a record the page named over a worker job of this instance (the sync export's progress
  // record, runSyncExportWithProgress): while that job runs, the answer is its live log, so the
  // page reads "slide k of n" on the worker's own instance without the record's tick, and a
  // checkout's folder store, which the follow never writes, answers it too
  if (record.workerJobId !== undefined && record.status !== 'done' && record.status !== 'failed') {
    const live = await worker.job(record.workerJobId);
    if (live !== null && (live.status === 'running' || live.status === 'queued')) {
      const progress = live.status === 'running' ? progressOfLog(live.log) : null;
      const line = progressLine(progress) ?? lastLineOf(live);
      return {
        jobId: record.jobId,
        status: exportJobStatusOf(live.status),
        ...(line !== undefined ? { line } : {}),
        ...(progress !== null ? { progress } : {}),
      };
    }
    // the worker's job ended and the sync call is writing the record: still in progress
    if (live !== null)
      return {
        jobId: record.jobId,
        status: 'running',
        ...(record.line !== undefined ? { line: record.line } : {}),
      };
  }
  return pollOfExportJob(record, { stored: store.stored });
}

/**
 * The synchronous export with a progress record beside it (the product round fix round, the
 * row `export.download.progress-per-slide`; build/b7.md R4's second choice, the server half): the
 * editor mints `jobId` (`newSyncProgressJobId`), calls `syncExport` with it and polls
 * `pollExport` with the same id while the call runs. The record is written queued at once, then
 * running with the worker's job id as soon as the export is submitted (so the poll on this
 * instance reads the live log, and a poll routed elsewhere the record the follow writes every
 * tick), and done or failed with the call's outcome, so a late poll never reads a job that runs
 * for ever. The export itself is `runSyncExport`, unchanged.
 */
export async function runSyncExportWithProgress(
  worker: WorkerClient,
  jobId: string,
  deckId: string,
  input: SyncExportInput,
  options: { store?: PartStore; now?: () => string; tickMs?: number } = {},
): Promise<SyncExportResult> {
  const store = options.store ?? (await partStore());
  const now = options.now ?? (() => new Date().toISOString());
  const queued = queuedExportJob(jobId, deckId, input.format, now(), await deckTitleOf(deckId));
  await writeExportJob(store.client, queued);
  let record = queued;
  let end: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    end = resolve;
  });
  try {
    const result = await runSyncExport(deckId, input, {
      client: worker,
      onSubmitted: (job) => {
        record = runningExportJob(queued, now(), { workerJobId: job.id });
        void writeExportJob(store.client, record).then(() =>
          followExportProgress(worker, store, record, done, options.tickMs, job.id).catch(
            () => undefined,
          ),
        );
      },
    });
    end();
    const downloads = result.files
      .filter((file) => file.url !== undefined && file.url !== '')
      .map((file) => ({ name: file.name, bytes: file.bytes, url: file.url ?? '' }));
    const last = result.log[result.log.length - 1];
    await writeExportJob(
      store.client,
      finishedExportJob(
        record,
        {
          status: 'done',
          report: result.report,
          downloads,
          ms: result.ms,
          ...(last === undefined ? {} : { line: last }),
        },
        now(),
      ),
    );
    return result;
  } catch (error) {
    end();
    await writeExportJob(
      store.client,
      finishedExportJob(
        record,
        { status: 'failed', error: error instanceof Error ? error.message : String(error) },
        now(),
      ),
    );
    throw error;
  }
}

/** How long a running job's record answers polls on this instance before the store is read again. */
export const EXPORT_POLL_CACHE_MS = 2_000;
type RecentRecords = Map<string, { at: number; record: ExportJobRecord | null }>;
/** per store client, so two stores in one process (the tests' fakes) never read each other's records */
const recentByClient = new WeakMap<BlobClient, RecentRecords>();
function recentRecordsOf(client: BlobClient): RecentRecords {
  let recent = recentByClient.get(client);
  if (recent === undefined) {
    recent = new Map();
    recentByClient.set(client, recent);
  }
  return recent;
}

/**
 * The record for a poll on an instance that never held the job: a running record is read from
 * the store at most once per EXPORT_POLL_CACHE_MS per job (the editor polls every second; the
 * blob tier budget is one timed call per 2 s per deck), a settled record is kept for the process,
 * and a queued or missing one is asked again each time, so a job queued a moment ago on another
 * instance is found and its end is read within the poll.
 */
export async function readExportJobCached(
  client: BlobClient,
  jobId: string,
  now: () => number = () => Date.now(),
): Promise<ExportJobRecord | null> {
  const recentRecords = recentRecordsOf(client);
  const kept = recentRecords.get(jobId);
  const t = now();
  if (kept !== undefined && kept.record !== null) {
    const settled = kept.record.status === 'done' || kept.record.status === 'failed';
    // a running record is the one that costs: the follow writes its progress every tick and the
    // page polls every second, so it answers from here for a tick; a queued record moves to
    // running or done within a moment and is read each time
    if (settled || (kept.record.status === 'running' && t - kept.at < EXPORT_POLL_CACHE_MS))
      return kept.record;
  }
  const record = await readExportJob(client, jobId);
  recentRecords.set(jobId, { at: t, record });
  if (recentRecords.size > 200) {
    const oldest = [...recentRecords.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest !== undefined) recentRecords.delete(oldest[0]);
  }
  return record;
}

/** Forgets the poll cache of a store client (tests). */
export function forgetExportPollCache(client?: BlobClient): void {
  if (client !== undefined) recentByClient.delete(client);
}

/**
 * The exporter's own name of a job file the editor asks for again by its display name (the deck's
 * title): the report's file whose display name is the one asked, else the name itself when the
 * report lists it, else null. The checkout path's `signDownload` opens the file by this name.
 */
export async function jobFileSource(
  worker: WorkerClient,
  jobId: string,
  name: string,
): Promise<string | null> {
  const job = await worker.job(jobId);
  const report = exportReportSchema.safeParse((job?.result as JobResultLike | undefined)?.report);
  if (!job || !report.success) return null;
  const sources = report.data.files.map((file) => basename(file.path));
  if (sources.includes(name)) return name;
  const store = await partStore();
  const record = await readExportJob(store.client, jobId);
  const deckOfJob = (job.input as { deckId?: string } | undefined)?.deckId;
  const names = displayNamesOf(sources, {
    title: record?.title ?? null,
    deckId: typeof deckOfJob === 'string' ? deckOfJob : report.data.deckId,
    mode: report.data.mode,
  });
  for (const [source, display] of names) if (display === name) return source;
  return null;
}

/** The stored copy of a finished job's file with the deck it belongs to, for a download the editor asks for again; null on a checkout or for a name the job did not make. */
export async function storedExportDownload(
  jobId: string,
  name: string,
): Promise<{ deckId: string; download: ExportJobDownload } | null> {
  const store = await partStore();
  if (!store.stored) return null;
  const record = await readExportJob(store.client, jobId);
  const download = record?.downloads?.find((file) => file.name === name);
  return record === null || download === undefined ? null : { deckId: record.deckId, download };
}
