import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

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
import { verifySkippedNote, verifyTools } from '@turboslide/render-worker/jobs/export';
import type { VerifyOutcome } from '@turboslide/render-worker/jobs/export';
import { ACTIONS } from '@turboslide/schema/actions';
import type { DeckDocument } from '@turboslide/schema/deck';
import { NATIVE_BLOCK_TYPES } from '@turboslide/schema/export';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Theme } from '@turboslide/schema/render';
import { diskBlobClient } from '@turboslide/store/blob-disk';
import type { BlobClient } from '@turboslide/store/blob-store';

import { contentTypeOf, jsonBody } from './export-sync';
import type { SyncExportFile, SyncExportResult } from './export-sync';
import { deckDir, ensureDeckAssets, exportBlobClient, openDeckStore, stateDir } from './root';

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

type PartStore = { client: BlobClient; stored: boolean };

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
  return { jobId, revision: plan.revision, batches, batchSize: size, total: ids.length };
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
    for (const path of produced) {
      const name = path.split('/').pop() ?? path;
      const data = new Uint8Array(await readFile(path));
      const entry = await client.put(`${jobPrefix(deckId, jobId)}${name}`, data, {
        overwrite: true,
        contentType: contentTypeOf(name),
      });
      files.push({
        name,
        bytes: data.byteLength,
        sha256: createHash('sha256').update(data).digest('hex'),
        contentType: contentTypeOf(name),
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

/** A file of a batched job (the route's `?job=<id>&file=<name>` on this instance), or null. */
export async function batchedJobFile(
  deckId: string,
  jobId: string,
  name: string,
): Promise<{ data: Uint8Array<ArrayBuffer>; contentType: string } | null> {
  requireSlug(deckId);
  if (!isJobId(jobId) || !/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.')) return null;
  const { client } = await partStore();
  if ((await readPlanFrom(client, deckId, jobId)) === null) return null;
  const fetched = await client.get(`${jobPrefix(deckId, jobId)}${name}`);
  if (fetched === null) return null;
  // a copy over its own ArrayBuffer, the body type a Response takes
  return { data: new Uint8Array(fetched.bytes), contentType: contentTypeOf(name) };
}
