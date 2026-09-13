// The batched Perfect export, part one: the plan (gslides-parity SPEC-2 8.1, 0.31, 0.44, 0.45,
// 0.48). A hosted export of a deck longer than the batch size runs as per slide batches, each one
// synchronous function call whose scenes and rasters land in the store as parts, and a final
// merge that builds the file from the parts without a browser (merge.ts). This module is the
// arithmetic: the batch size and the constants it derives from, the play list and its batches,
// the asset hashes the plan pins and the staleness they detect, the job names and the 24 h
// prune. It runs in Node and in a page (no node import: the hashes and the job id use Web
// Crypto), so the Download dialog reads the types and the size from here while the server does
// the work; apps/studio/src/server/export-batch.ts is the adapter around it.
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks, slideOrder, unskippedSlideOrder } from '@turboslide/schema/deck';
import type { ExportMode } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

// ---------------------------------------------------------------------------------------------
// The batch size

/**
 * Seconds of rendering one batch may take inside one function call. The export and render
 * functions run at 800 s (apps/studio/vite.deploy.config.ts HEAVY) and the synchronous export's
 * own timeout is 780 s; a batch takes a fraction of that so a retry of one failed batch is cheap
 * and the dialog's estimate moves.
 */
export const BATCH_BUDGET_S = 240;

/**
 * Seconds one slide took at the slowest round one measurement of the hosted Perfect export: 222 s
 * for the 85 slide GT deck (gslides-parity SPEC 6.7; docs/hosting.md section 7 measured 187.9,
 * 199.8 and 203.1 s on the previews). A later measurement changes this number, not the formula.
 */
export const SECONDS_PER_SLIDE = 2.6;

/** The margin over the measured seconds per slide for a cold instance or a slow picture regeneration. */
export const MARGIN = 1.5;

/**
 * Slides per batch: `floor(240 / (2.6 * 1.5))` is 61 and is written as 60 (SPEC-2 0.44), so the
 * GT deck exports as two batches of 60 and 25. `TURBOSLIDE_EXPORT_BATCH` overrides it (the end to
 * end spec uses 3).
 */
export const EXPORT_BATCH_SIZE = 60;

export const BATCH_SIZE_VARIABLE = 'TURBOSLIDE_EXPORT_BATCH';

/** The derived size the constants give before it is rounded down to EXPORT_BATCH_SIZE. */
export function derivedBatchSize(): number {
  return Math.floor(BATCH_BUDGET_S / (SECONDS_PER_SLIDE * MARGIN));
}

/** The batch size in force: the environment's override when it is a positive integer, else 60. */
export function batchSize(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env[BATCH_SIZE_VARIABLE];
  if (raw === undefined || raw.trim() === '') return EXPORT_BATCH_SIZE;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return EXPORT_BATCH_SIZE;
  return value;
}

// ---------------------------------------------------------------------------------------------
// The input and the plan

/** export.run's input as a batched export takes it: PPTX only, `out`, `batch` and `merge` removed. */
export type BatchExportInput = {
  format: 'pptx';
  mode?: ExportMode;
  theme?: Theme[];
  fonts?: 'exact' | 'standard';
  headings?: 'raster';
  rasterScale?: 'auto' | 2 | 3;
  pictureScale?: 2 | 3;
  excludeShareAlike?: boolean;
  baseline?: 'libreoffice' | 'none';
  verify?: boolean;
  embedFonts?: boolean;
  slideIds?: 'all' | string[];
  includeSkipped?: boolean;
  includeNotes?: boolean;
};

/** One asset twin the play list references, with the sha256 of its file when the plan was made. */
export type AssetHash = {
  id: string;
  /** the twin's path inside the deck folder (`assets/<file>`) */
  file: string;
  /** sha256 hex, or `missing` when the file was not on disk */
  hash: string;
};

export type ExportPlan = {
  version: 1;
  jobId: string;
  deckId: string;
  deckTitle: string;
  /** the deck's revision the plan was made at; every batch renders the document at this revision */
  revision: number;
  startedAt: string;
  input: BatchExportInput;
  mode: ExportMode;
  themes: Theme[];
  /** the play list the counters count over (the deck without its skipped slides unless asked) */
  play: string[];
  /** the slides the file holds, in play order */
  ids: string[];
  /** the skipped slides left out */
  omitted: string[];
  /** contiguous runs of `ids`, at most the batch size each */
  batches: string[][];
  assets: AssetHash[];
  /** the deck's default speaker notes, when set (the builder writes them per slide under includeNotes) */
  defaultNotes?: string;
};

/**
 * The slides a download holds (gslides-parity SPEC 7.2.1), as export-pptx.ts `playList` computes
 * them: the deck without its skipped slides unless asked, narrowed to `slideIds` when given.
 * Repeated here so the plan carries no browser module; plan.test.ts holds the two equal.
 */
export function planPlayList(
  document: DeckDocument,
  options: { includeSkipped?: boolean; slideIds?: 'all' | readonly string[] },
): { play: string[]; ids: string[]; omitted: string[] } {
  const order = slideOrder(document.deck);
  const play = options.includeSkipped === true ? order : unskippedSlideOrder(document);
  const omitted = order.filter((id) => !play.includes(id));
  const wanted =
    options.slideIds === undefined || options.slideIds === 'all' ? null : new Set(options.slideIds);
  const ids = play.filter((id) => wanted === null || wanted.has(id));
  return { play, ids, omitted };
}

/** Contiguous runs of at most `size` ids, in order; an empty list gives no batch. */
export function planBatches(ids: readonly string[], size: number): string[][] {
  if (!Number.isInteger(size) || size < 1)
    throw new RangeError(`batch size must be a positive integer, got ${size}`);
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------------------------
// The assets a play list references

type AssetBearing = {
  type: string;
  asset?: string;
  figures?: { assets?: readonly string[] }[];
  items?: { asset?: string }[];
};

/** The asset ids the slides reference: the picture kinds' pictures and every block that names one. */
export function referencedAssets(document: DeckDocument, ids: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const slide: Slide | undefined = document.slides[id];
    if (slide === undefined) continue;
    if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
      out.add(slide.picture.asset);
    }
    for (const { block } of slideBlocks(slide)) {
      const row = block as unknown as AssetBearing;
      if (typeof row.asset === 'string' && row.asset !== '') out.add(row.asset);
      for (const figure of row.figures ?? []) for (const a of figure.assets ?? []) out.add(a);
      for (const item of row.items ?? [])
        if (typeof item.asset === 'string' && item.asset !== '') out.add(item.asset);
    }
  }
  return [...out].filter((id) => document.deck.assets[id] !== undefined).sort();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The hash of every twin file the play list references, through `readAsset(relative)` (the
 * deck folder on the server, a fixture in a test). A twin the reader does not find hashes as
 * `missing`, which a later `isStale` compares like any other value.
 */
export async function assetHashes(
  document: DeckDocument,
  ids: readonly string[],
  readAsset: (relative: string) => Promise<Uint8Array | null>,
): Promise<AssetHash[]> {
  const out: AssetHash[] = [];
  for (const id of referencedAssets(document, ids)) {
    const asset = document.deck.assets[id];
    if (asset === undefined) continue;
    const twins = [...new Set(Object.values(asset.twins))].sort();
    for (const file of twins) {
      const bytes = await readAsset(file);
      out.push({ id, file, hash: bytes === null ? 'missing' : await sha256Hex(bytes) });
    }
  }
  return out;
}

/**
 * Why a batch may not run against the plan: the deck moved past the plan's revision and the
 * revision can no longer be read (`revision`), or an asset the batch's slides reference no longer
 * hashes as the plan recorded (`asset`, a picture replaced during the download); null when the
 * batch may run. `hashes` are the current hashes of the assets the batch's slides reference.
 */
export function isStale(
  plan: ExportPlan,
  document: DeckDocument,
  hashes: ReadonlyArray<AssetHash>,
): 'revision' | 'asset' | null {
  if (document.deck.revision !== plan.revision) return 'revision';
  const pinned = new Map(plan.assets.map((row) => [`${row.id}\n${row.file}`, row.hash]));
  for (const row of hashes) {
    const recorded = pinned.get(`${row.id}\n${row.file}`);
    if (recorded === undefined || recorded !== row.hash) return 'asset';
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Names and the prune

/** A job id: `b<start time in base 36>-<8 hex>`, so the start time reads off the folder name. */
export function jobIdNow(now: number = Date.now(), random?: string): string {
  let suffix = random;
  if (suffix === undefined) {
    const bytes = new Uint8Array(4);
    globalThis.crypto.getRandomValues(bytes);
    suffix = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `b${now.toString(36)}-${suffix}`;
}

export const JOB_ID_PATTERN = /^[a-z0-9-]+$/;

/** The start time a batched job id carries, or null for another job's id. */
export function jobStartedAt(jobId: string): number | null {
  const match = /^b([0-9a-z]+)-[0-9a-f]{8}$/.exec(jobId);
  if (match === null) return null;
  const at = parseInt(match[1] ?? '', 36);
  return Number.isFinite(at) ? at : null;
}

/** `exports/<deckId>/<jobId>/`: where a job's plan, parts and files live in the store. */
export function jobPrefix(deckId: string, jobId: string): string {
  return `exports/${deckId}/${jobId}/`;
}

export function deckExportsPrefix(deckId: string): string {
  return `exports/${deckId}/`;
}

export const PLAN_FILE = 'plan.json';
export const PARTS_DIR = 'parts';

export function planKey(deckId: string, jobId: string): string {
  return `${jobPrefix(deckId, jobId)}${PLAN_FILE}`;
}

export function partsPrefix(deckId: string, jobId: string): string {
  return `${jobPrefix(deckId, jobId)}${PARTS_DIR}/`;
}

/** The part names of one slide's scene in one theme; `nn` is the play list number, two digits at least. */
export function partNames(
  n: number,
  slideId: string,
  theme: Theme,
): { scene: string; sheet: string } {
  const nn = String(n).padStart(2, '0');
  return {
    scene: `${nn}-${slideId}.${theme}.scene.json`,
    sheet: `sheets/${theme}/${nn}-${slideId}@2x.png`,
  };
}

/** The record one finished batch leaves beside its parts. */
export function batchRecordName(index: number): string {
  return `batch-${String(index).padStart(3, '0')}.json`;
}

export const JOB_MAX_AGE_MS = 24 * 60 * 60_000;

export type StoredEntry = { pathname: string; uploadedAt?: string };

/**
 * The pathnames of every job under a deck's export prefix that is older than `maxAgeMs` (SPEC-2
 * 0.45): a job's age is its newest upload, or the start time its id carries when the store
 * reports no upload times; a job with neither is left alone. The round one sync export's job
 * folders live under the same prefix and are pruned the same way.
 */
export function staleJobPaths(
  entries: ReadonlyArray<StoredEntry>,
  deckId: string,
  options: { now: number; maxAgeMs?: number },
): string[] {
  const prefix = deckExportsPrefix(deckId);
  const maxAge = options.maxAgeMs ?? JOB_MAX_AGE_MS;
  const jobs = new Map<string, { paths: string[]; newest: number | null }>();
  for (const entry of entries) {
    if (!entry.pathname.startsWith(prefix)) continue;
    const rest = entry.pathname.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) continue;
    const jobId = rest.slice(0, slash);
    const job = jobs.get(jobId) ?? { paths: [], newest: null };
    job.paths.push(entry.pathname);
    const at = entry.uploadedAt === undefined ? NaN : Date.parse(entry.uploadedAt);
    if (Number.isFinite(at)) job.newest = job.newest === null ? at : Math.max(job.newest, at);
    jobs.set(jobId, job);
  }
  const out: string[] = [];
  for (const [jobId, job] of jobs) {
    const age = job.newest ?? jobStartedAt(jobId);
    if (age === null) continue;
    if (options.now - age > maxAge) out.push(...job.paths);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------------------------
// The dialog's estimate

/**
 * The seconds left after `done` of `total` slides, from the measured batch times (SPEC-2 8.1
 * item 4: recomputed after every batch); null before the first batch has finished.
 */
export function secondsLeft(
  done: number,
  total: number,
  batchMs: ReadonlyArray<{ slides: number; ms: number }>,
): number | null {
  const slides = batchMs.reduce((n, row) => n + row.slides, 0);
  const ms = batchMs.reduce((n, row) => n + row.ms, 0);
  if (slides === 0 || ms === 0) return null;
  return Math.max(0, ((total - done) * ms) / slides / 1000);
}

/** The estimate as the sentence prints it, rounded to the half minute as SPEC 6.7 does. */
export function leftWords(seconds: number): string {
  const halves = Math.max(1, Math.round(seconds / 30));
  const minutes = halves / 2;
  if (minutes < 1) return 'half a minute';
  if (minutes === 1) return '1 minute';
  if (Number.isInteger(minutes)) return `${minutes} minutes`;
  return `${Math.floor(minutes)} and a half minutes`;
}
