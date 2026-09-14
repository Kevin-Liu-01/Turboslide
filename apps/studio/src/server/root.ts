import { existsSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkerPaths } from '@turboslide/render-worker/paths';
import type { Appearance } from '@turboslide/schema/deck';
import type { BlobClient } from '@turboslide/store/blob-store';
import type { vercelBlobClient } from '@turboslide/store/blob-vercel';
import type { BlobClientFactory, HostedDecks, HostingFacts } from '@turboslide/store/hosted';
import { hostingProviders, openHostedDecks } from '@turboslide/store/hosted';
import type { SeedSource } from '@turboslide/store/seed';
import { directorySeed, materializeSeed } from '@turboslide/store/seed';
import type { StoreSelection } from '@turboslide/store/select';
import { overlayRoot, selectStore } from '@turboslide/store/select';
import type { DeckStore } from '@turboslide/store/store';
import type { CreateDeckInput, CreateDeckResult, DeckHead } from '@turboslide/store/templates';
import { TEMPLATES_DIR } from '@turboslide/store/templates';

import { TOKEN_TTL_MS } from './tokens';

/**
 * Where the studio's server side finds its files (the hosting round; SPEC 11 "Storage").
 *
 * In a checkout the repository root holds decks/, the generated contracts and the derived
 * .turboslide/ folder, and the dev server may start from the root (scripts/check.mjs) or from
 * apps/studio (pnpm --filter): TURBOSLIDE_ROOT wins, else the nearest ancestor of the working
 * directory or of this module holding pnpm-workspace.yaml. Hosted (a Vercel function: no
 * workspace above /var/task, a read-only filesystem apart from /tmp), the root is the overlay
 * (@turboslide/store/select overlayRoot, /tmp/turboslide): its decks/ folder is the seed the
 * build bundled, materialized on first use, and the mirror of the Blob store when one is
 * connected; its .turboslide/ folder takes the thumbnails, the worker's jobs and the HTTP scratch
 * files. Every path helper below answers from that one decision, so the server functions that
 * still read `deckDir()` directly see a folder that exists. Hosted, the derived files under the
 * overlay are swept ahead of the collection's work and a write that meets ENOSPC is retried once
 * after a sweep (the section "Room on the temp volume" below; gslides-parity verification
 * finding 20).
 *
 * The backend itself is chosen once per process by @turboslide/store/select (TURBOSLIDE_STORE,
 * else VERCEL with or without BLOB_READ_WRITE_TOKEN, else file). The seed and the Blob client
 * come from the Nitro plugin's registration (server/hosting-plugin.ts) when the deployment build
 * is running, and from the checkout's decks/ folder otherwise, which is how `TURBOSLIDE_STORE=tmp
 * pnpm dev` exercises the hosted path locally.
 */

const WALK_DEPTH = 8;

function findWorkspace(start: string): string | null {
  let dir = start;
  for (let depth = 0; depth < WALK_DEPTH; depth += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** The checkout's root, or null when this process runs outside one (a deployed function). */
export function workspaceRoot(): string | null {
  const fromEnv = process.env.TURBOSLIDE_ROOT;
  if (fromEnv) return resolve(fromEnv);
  const fromCwd = findWorkspace(process.cwd());
  if (fromCwd !== null) return fromCwd;
  try {
    return findWorkspace(dirname(fileURLToPath(import.meta.url)));
  } catch {
    return null;
  }
}

/** The seed folders a checkout offers the hosted backends: the templates and the GT deck. */
const SEED_FOLDERS = ['templates', 'gt-brand'] as const;

type Runtime = {
  selection: StoreSelection;
  decks: HostedDecks;
  blob: BlobClientFactory | null;
  /** the runtime files of the theme, fonts and export packages, when the bundle carries them */
  packages: SeedSource | null;
};

// on globalThis so a dev server reload keeps one overlay and one selection per process
const shared = globalThis as typeof globalThis & { __turboslideRuntime?: Runtime };

function log(line: string): void {
  console.error(`turboslide hosting: ${line}`);
}

/** The @vercel/blob client for a dev server run with TURBOSLIDE_STORE=blob and a token. */
/** The shape of @turboslide/store/blob-vercel; a type import, so nothing of it is bundled here. */
type BlobVercelModule = { vercelBlobClient: typeof vercelBlobClient };

const devBlobClient: BlobClientFactory = async () => {
  // a specifier the bundlers cannot follow: in the deployment build the Nitro plugin registers
  // the client, and the browser's dependency scanner must never reach @vercel/blob from here
  const specifier = '@turboslide/store/blob-vercel';
  const mod = (await import(/* @vite-ignore */ specifier)) as BlobVercelModule;
  return mod.vercelBlobClient(process.env);
};

/**
 * The origins a hosted instance can fetch the seed deck's twins from when the bundle no longer
 * carries them (gslides-parity SPEC-4 0.35, 3.6; `SEED_PATTERN` drops `assets/**` and the twins
 * stay static files of the deployment at `/decks/gt-brand/assets/<file>`, served by the CDN):
 * `TURBOSLIDE_PUBLIC_ORIGIN` first, then the project's production URL (every deployment ships
 * the same twins), then this deployment's own URL (a preview behind deployment protection may
 * refuse the function's own fetch of it, which is why production comes first).
 */
export function seedAssetOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = [];
  const explicit = env.TURBOSLIDE_PUBLIC_ORIGIN;
  if (explicit !== undefined && explicit !== '') out.push(explicit.replace(/\/$/, ''));
  for (const name of ['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'] as const) {
    const host = env[name];
    if (host !== undefined && host !== '' && !out.includes(`https://${host}`))
      out.push(`https://${host}`);
  }
  return out;
}

/** A twin of a seed deck from the deployment's static files, or null when no origin answers it. */
async function fetchSeedAsset(deckId: string, relative: string): Promise<Uint8Array | null> {
  if (!(SEED_FOLDERS as readonly string[]).includes(deckId)) return null;
  if (relative === '' || relative.includes('..') || relative.startsWith('/')) return null;
  for (const origin of seedAssetOrigins()) {
    try {
      const response = await fetch(
        `${origin}/decks/${encodeURIComponent(deckId)}/assets/${relative.split('/').map(encodeURIComponent).join('/')}`,
      );
      if (!response.ok) continue;
      const type = response.headers.get('content-type') ?? '';
      if (type.startsWith('text/html')) continue;
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      // the next origin
    }
  }
  return null;
}

function runtime(): Runtime {
  if (shared.__turboslideRuntime !== undefined) return shared.__turboslideRuntime;
  const selection = selectStore(process.env);
  const workspace = workspaceRoot();
  const workspaceDecks = workspace === null ? null : join(workspace, 'decks');
  let seed: SeedSource | null = null;
  let blob: BlobClientFactory | null = null;
  if (selection.kind !== 'file') {
    const providers = hostingProviders();
    seed =
      providers?.seed ??
      (workspaceDecks !== null && existsSync(workspaceDecks)
        ? directorySeed(workspaceDecks, { only: SEED_FOLDERS })
        : null);
    blob = providers?.blob ?? (selection.kind === 'blob' ? devBlobClient : null);
    if (seed === null) log('no seed: the bundle carries no decks and there is no checkout');
  }
  const decks = openHostedDecks({
    selection,
    // the file store outside a workspace keeps the old behaviour: decks/ under the working directory
    workspaceDecksDir:
      workspaceDecks ?? (selection.kind === 'file' ? join(process.cwd(), 'decks') : null),
    overlayRoot: overlayRoot(process.env),
    seed,
    blob,
    ...(selection.kind === 'file' ? {} : { fetchAsset: fetchSeedAsset }),
    log,
  });
  if (selection.kind !== 'file') {
    // the render worker's local mode reads these (apps/render-worker/src/paths.ts); pointing them
    // at the overlay keeps every worker client in this process on the same decks and a writable
    // work folder without each route passing paths
    process.env.TURBOSLIDE_DECKS_DIR ??= decks.decksDir;
    process.env.TURBOSLIDE_WORKER_DIR ??= join(decks.root, '.turboslide', 'worker');
    log(`${selection.kind} store (${selection.reason}); decks at ${decks.decksDir}`);
  }
  shared.__turboslideRuntime = {
    selection,
    decks,
    blob,
    packages: selection.kind === 'file' ? null : (hostingProviders()?.packages ?? null),
  };
  return shared.__turboslideRuntime;
}

/** The backend this process runs on. */
export function storeSelection(): StoreSelection {
  return runtime().selection;
}

export function isHosted(): boolean {
  return runtime().selection.kind !== 'file';
}

/** The deck collection; call `ready()` (or the async helpers below) before reading its folder. */
export function hostedDecks(): HostedDecks {
  return runtime().decks;
}

/** The root the server treats as the repository: the workspace, or the overlay when hosted. */
export function repoRoot(): string {
  return runtime().decks.root;
}

/** The decks folder FileStore-shaped code reads (SPEC 4.1). */
export function decksDir(): string {
  return runtime().decks.decksDir;
}

/** The folder a deck lives in: decks/<id> under the root (SPEC 4.1). */
export function deckDir(deckId: string): string {
  return join(decksDir(), deckId);
}

/** The derived files folder (thumbnails, worker jobs, HTTP scratch), writable in every mode. */
export function stateDir(): string {
  return join(repoRoot(), '.turboslide');
}

/** What the deck list and the editor banner show about the store. */
export function hostingFacts(): HostingFacts {
  return runtime().decks.facts();
}

/** The paths a worker client in this process should use; undefined in a checkout (the defaults). */
export function workerPaths(): { decksDir: string; workerDir: string } | undefined {
  if (!isHosted()) return undefined;
  return { decksDir: decksDir(), workerDir: join(stateDir(), 'worker') };
}

/**
 * The options every worker client in this process is created with: the hosted decks and work
 * folders when there are any. Calling this also settles the backend, so a client created on a
 * cold function's first request (the render or export route) sees the overlay, not the bundle.
 */
export function workerClientOptions(): {
  paths?: Partial<WorkerPaths>;
  log?: (line: string) => void;
} {
  const paths = workerPaths();
  if (paths === undefined) return {};
  // hosted, every job line (the CLI's stderr included) goes to the function's log, so
  // `vercel logs` shows what a render or export did; a checkout keeps the job log in memory
  return { paths, log: (line) => log(`worker ${line}`) };
}

let blobClient: Promise<BlobClient | null> | undefined;

/**
 * The Blob client of the blob backend, for files the store does not manage (a produced export
 * that must outlive the function invocation that made it); null on the file and tmp backends.
 */
export function exportBlobClient(): Promise<BlobClient | null> {
  blobClient ??= (async () => {
    const { blob } = runtime();
    if (blob === null) return null;
    return typeof blob === 'function' ? blob() : blob;
  })().catch((error: unknown) => {
    blobClient = undefined;
    throw error;
  });
  return blobClient;
}

/** The variable the renderer and the exporter read for the folder (theme-node.ts, fonts/export.ts). */
const PACKAGES_DIR_VARIABLE = 'TURBOSLIDE_PACKAGES_DIR';

let packagesReady: Promise<void> | undefined;

/**
 * Writes the bundled package files (the theme CSS and sprite, Inter, the export faces,
 * calibration.json) under <root>/packages once per process and names the folder in
 * TURBOSLIDE_PACKAGES_DIR, so a render or export in this process finds them where the workspace
 * would have been. A no-op in a checkout or when the bundle carries no such group.
 */
function ensurePackages(): Promise<void> {
  packagesReady ??= (async () => {
    const { packages, decks } = runtime();
    if (packages === null) return;
    const dir = join(decks.root, 'packages');
    const t = performance.now();
    const result = await materializeSeed(packages, dir);
    process.env[PACKAGES_DIR_VARIABLE] ??= dir;
    log(
      `packages: ${result.written} files written, ${result.skipped} present, ${result.bytes} bytes in ${Math.round(performance.now() - t)} ms at ${dir}`,
    );
  })().catch((error: unknown) => {
    // a write that failed (a full volume) is retried by the next request, not cached for the
    // life of the instance
    packagesReady = undefined;
    throw error;
  });
  return packagesReady;
}

/**
 * The collection with its seed materialized (and uploaded once, for blob), and the package
 * files. Hosted, the derived files are swept first when a sweep is due or the volume is low, and
 * a materialization that meets ENOSPC is retried once after a sweep.
 */
export async function ensureDecks(): Promise<HostedDecks> {
  const decks = hostedDecks();
  await sweepDerivedIfDue();
  await withDiskRoom('materializing the seed', () =>
    Promise.all([decks.ready(), ensurePackages()]),
  );
  return decks;
}

export async function listStoredDecks(): Promise<DeckHead[]> {
  return withDiskRoom('listing the decks', async () => (await ensureDecks()).list());
}

export async function hasStoredDeck(deckId: string): Promise<boolean> {
  return withDiskRoom(`looking up ${deckId}`, async () => (await ensureDecks()).has(deckId));
}

/** The store for a deck, synced with the backend; a RangeError when the deck is missing. */
export async function openDeckStore(deckId: string): Promise<DeckStore> {
  return withDiskRoom(`opening ${deckId}`, async () => (await ensureDecks()).open(deckId));
}

/** deck.create over the collection; a create that meets ENOSPC is not retried, its caller is told to. */
export async function createStoredDeck(input: CreateDeckInput): Promise<CreateDeckResult> {
  return withDiskRoom('creating the deck', async () => (await ensureDecks()).create(input), {
    retry: false,
  });
}

type RawManifest = {
  sections?: { slideIds?: unknown }[];
  defaults?: { appearance?: unknown };
};

/**
 * The two facts a home page card needs beyond its head (gslides-parity SPEC 6.2): the deck's
 * appearance (SPEC 7.2.3, the theme its thumbnail is drawn in) and its first slide, read from the
 * manifest on disk without validating the deck. Call after the collection has listed (and, on
 * Blob, synced) the deck. A folder that cannot be read draws as a dark card without a thumbnail.
 */
export function deckCardFacts(deckId: string): {
  appearance: Appearance;
  firstSlide: string | null;
} {
  let appearance: Appearance = 'dark';
  let firstSlide: string | null = null;
  const manifestPath = join(decksDir(), deckId, 'deck.json');
  if (existsSync(manifestPath)) {
    try {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as RawManifest;
      // the rule of deckAppearance (SPEC 7.2.3): dark unless the manifest says light
      appearance = raw.defaults?.appearance === 'light' ? 'light' : 'dark';
      for (const section of raw.sections ?? []) {
        const ids = Array.isArray(section.slideIds) ? section.slideIds : [];
        const first = ids.find((id) => typeof id === 'string');
        if (typeof first === 'string') {
          firstSlide = first;
          break;
        }
      }
    } catch {
      // a half written manifest: the card draws without a thumbnail
    }
  }
  return { appearance, firstSlide };
}

/** The folder of a deck template (decks/templates/<id>), materialized when hosted. */
export async function templateDir(templateId: string): Promise<string> {
  return join((await ensureDecks()).decksDir, TEMPLATES_DIR, templateId);
}

// ---------------------------------------------------------------------------------------------
// The fresh presentation (gslides-parity SPEC 6.1): /new edits a draft the store has not seen,
// under an id of this shape, and the first write creates the deck under that id.

/** `untitled-<yyyymmdd>-<4 chars>`: the id a draft takes and the store gains on its first write. */
export const DRAFT_ID_PATTERN = /^untitled-\d{8}-[a-z0-9]{4}$/;

const DRAFT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A fresh draft id for the day; two tabs on /new get two ids (SPEC 6.1). */
export function newDraftDeckId(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  let tail = '';
  for (let i = 0; i < 4; i += 1) {
    tail += DRAFT_ALPHABET[Math.floor(Math.random() * DRAFT_ALPHABET.length)] ?? 'a';
  }
  return `untitled-${day}-${tail}`;
}

/** True for an id of the draft shape; with `hasStoredDeck` false it names a draft nothing has saved. */
export function isDraftDeckId(deckId: string): boolean {
  return DRAFT_ID_PATTERN.test(deckId);
}

/**
 * True when the id is a draft the store does not hold yet: the editor's server functions treat
 * such a deck as empty (no leases, no watch events, no thumbnails) until its first write creates
 * it (write.ts), so a visit that only looks and leaves creates nothing (SPEC 6.1).
 */
export async function isUnsavedDraft(deckId: string): Promise<boolean> {
  return isDraftDeckId(deckId) && !(await hasStoredDeck(deckId));
}

/**
 * A deck's twins on disk (the seed's from the bundle, the store's beyond them) before a job
 * that renders or exports the deck runs; the browser would otherwise wait on images that are
 * not there (measured on the first preview: a render hung to the 300 s job timeout, 502).
 */
export async function ensureDeckAssets(deckId: string): Promise<void> {
  await withDiskRoom(`writing the twins of ${deckId}`, async () =>
    (await ensureDecks()).ensureAssets(deckId),
  );
}

/** The local file of an asset twin, or null. */
export async function storedAssetFile(deckId: string, relative: string): Promise<string | null> {
  return withDiskRoom(`writing the twins of ${deckId}`, async () =>
    (await ensureDecks()).assetFile(deckId, relative),
  );
}

/** The URL an asset twin is served from when it is not on this instance, or null. */
export async function storedAssetUrl(deckId: string, relative: string): Promise<string | null> {
  return (await ensureDecks()).assetUrl(deckId, relative);
}

// ---------------------------------------------------------------------------------------------
// Room on the temp volume (gslides-parity verification finding 20). A function's /tmp is 525 MB
// (docs/hosting-chromium.md section 3b) and holds the inflated browser (about 205 MB), the
// overlay's decks and package files (about 43 MB with the seed's twins) and every derived file
// the studio writes: the worker's job folders (a render job keeps a copy of every image it made
// beside the cache's), its render cache per revision, the thumbnails per revision and the
// standalone builds. Nothing removed them, so one audit's worth of renders, a build and an export
// filled the volume and the next write (a Blob sync during deck.list) answered ENOSPC as a 500.
//
// The sweep runs on the hosted kinds ahead of the collection's work (ensureDecks). Every
// DERIVED_SWEEP_INTERVAL_MS it removes what nothing can ask for again: finished job folders and
// builds past the download window, and the render and thumbnail caches of a revision the deck
// has moved on from (a render always runs at the deck's current revision, so an older revision's
// cache is never read again); then it keeps the rest under DERIVED_BUDGET_BYTES, oldest first.
// When the volume's free space is under DERIVED_LOW_WATER_BYTES the budget drops to
// DERIVED_PRESSURE_BUDGET_BYTES, and when a write answers ENOSPC everything derived past a short
// grace goes and the write is retried once; a second ENOSPC is a DiskFullError (status 503) whose
// message tells the caller to retry. Nothing younger than the grace is evicted, because a job in
// flight may still read it, and a job that has not finished (no job.json yet) is never touched.
// decks/ and packages/ are never touched either: on the tmp backend they are the store itself.
// The layout swept is the one this module hands the worker clients (workerPaths) and thumbs.ts
// uses: <state>/worker/{jobs,cache,builds} and <state>/thumbs (apps/render-worker/src/paths.ts,
// server/tokens.ts buildsDir, server/thumbs.ts thumbsDir).

/** How often the routine sweep runs per process. */
export const DERIVED_SWEEP_INTERVAL_MS = 30_000;
/** The derived files stay under this between sweeps: 525 MB volume, 205 MB browser, 43 MB seed. */
export const DERIVED_BUDGET_BYTES = 160 * 1024 * 1024;
/** Under this much free space on the volume the sweep evicts down to the pressure budget. */
export const DERIVED_LOW_WATER_BYTES = 128 * 1024 * 1024;
/** What a low volume keeps: the newest few megabytes, which are the open deck's thumbnails. */
export const DERIVED_PRESSURE_BUDGET_BYTES = 32 * 1024 * 1024;
/** Nothing younger than this is evicted for room: a job in flight may still read it. */
export const DERIVED_GRACE_MS = 60_000;
/** After an ENOSPC the grace is this short: the volume is full now. */
export const DISK_FULL_GRACE_MS = 10_000;
/** Finished job folders and builds live this long: the download token and the tmp backend's job file URL do. */
export const DERIVED_KEEP_MS = TOKEN_TTL_MS;

export type DerivedKind = 'jobs' | 'cache' | 'thumbs' | 'builds';
export const DERIVED_KINDS: readonly DerivedKind[] = ['jobs', 'cache', 'thumbs', 'builds'];

export type DerivedTarget = {
  /** the state folder, <root>/.turboslide; thumbs/ lives under it */
  stateDir: string;
  /** the worker's folder; jobs/, cache/ and builds/ live under it */
  workerDir: string;
};

export type SweepOptions = {
  now?: number;
  /** evict beyond the age rules, oldest first, until the derived files fit; Infinity keeps the age rules alone */
  budgetBytes?: number;
  /** nothing younger than this is evicted */
  graceMs?: number;
  /** how long finished jobs and builds live */
  keepMs?: number;
};

export type SweepReport = {
  removed: number;
  removedBytes: number;
  kept: number;
  keptBytes: number;
  by: Record<DerivedKind, { removed: number; bytes: number }>;
};

type DerivedEntry = {
  kind: DerivedKind;
  path: string;
  /** when the entry was last written, in ms */
  mtime: number;
  bytes: number;
  /** nothing can ask for it again: an older revision, or a job or build past the download window */
  dead: boolean;
  /** the folder to remove when this was its last entry */
  parent: string | null;
};

/** The bytes of a file or a folder tree; 0 for a path that is not there. */
export function treeBytes(path: string): number {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;
  let sum = 0;
  for (const name of readdirSync(path)) sum += treeBytes(join(path, name));
  return sum;
}

function entriesOf(dir: string): { name: string; path: string; directory: boolean }[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      path: join(dir, entry.name),
      directory: entry.isDirectory(),
    }));
  } catch {
    return [];
  }
}

/** When a folder was last written: its own mtime or its newest direct child's, whichever is later. */
function newestMtime(dir: string): number {
  const own = statSync(dir, { throwIfNoEntry: false })?.mtimeMs ?? 0;
  let newest = own;
  for (const entry of entriesOf(dir)) {
    const mtime = statSync(entry.path, { throwIfNoEntry: false })?.mtimeMs ?? 0;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

/** jobs/<id>: finished when job.json is there (the queue writes it last); running folders stay. */
function jobEntries(workerDir: string, now: number, keepMs: number): DerivedEntry[] {
  const out: DerivedEntry[] = [];
  for (const job of entriesOf(join(workerDir, 'jobs'))) {
    if (!job.directory) continue;
    const record = statSync(join(job.path, 'job.json'), { throwIfNoEntry: false });
    if (!record) continue;
    out.push({
      kind: 'jobs',
      path: job.path,
      mtime: record.mtimeMs,
      bytes: treeBytes(job.path),
      dead: now - record.mtimeMs > keepMs,
      parent: null,
    });
  }
  return out;
}

const REVISION_NAME = /^\d+$/;

/**
 * <base>/<deck>/<name>: for the render cache, every revision but the deck's newest is dead and an
 * odd name ages out like a job. The thumbnail cache is keyed by stamp since round four (thumbs.ts,
 * gslides-parity SPEC-4 0.31): a numbered folder (a home card's revision) is dead below the newest
 * number as before, and a stamp folder is never dead by age, because the current stamp of a slide
 * is not knowable from the folder's name; the byte budget below evicts it oldest first.
 */
function revisionEntries(
  kind: 'cache' | 'thumbs',
  base: string,
  now: number,
  keepMs: number,
): DerivedEntry[] {
  const out: DerivedEntry[] = [];
  for (const deck of entriesOf(base)) {
    if (!deck.directory) continue;
    const revisions = entriesOf(deck.path).filter((entry) => entry.directory);
    const newest = Math.max(
      -1,
      ...revisions.filter((r) => REVISION_NAME.test(r.name)).map((r) => Number(r.name)),
    );
    for (const revision of revisions) {
      const mtime = newestMtime(revision.path);
      const numbered = REVISION_NAME.test(revision.name);
      const dead = numbered
        ? Number(revision.name) < newest
        : kind === 'thumbs'
          ? false
          : now - mtime > keepMs;
      out.push({
        kind,
        path: revision.path,
        mtime,
        bytes: treeBytes(revision.path),
        dead,
        parent: deck.path,
      });
    }
  }
  return out;
}

/** builds/<deck>/<file>: one standalone file per deck, alive for the download window. */
function buildEntries(workerDir: string, now: number, keepMs: number): DerivedEntry[] {
  const out: DerivedEntry[] = [];
  for (const deck of entriesOf(join(workerDir, 'builds'))) {
    if (!deck.directory) continue;
    for (const file of entriesOf(deck.path)) {
      const stat = statSync(file.path, { throwIfNoEntry: false });
      if (!stat) continue;
      out.push({
        kind: 'builds',
        path: file.path,
        mtime: stat.mtimeMs,
        bytes: file.directory ? treeBytes(file.path) : stat.size,
        dead: now - stat.mtimeMs > keepMs,
        parent: deck.path,
      });
    }
  }
  return out;
}

function emptyReport(): SweepReport {
  return {
    removed: 0,
    removedBytes: 0,
    kept: 0,
    keptBytes: 0,
    by: {
      jobs: { removed: 0, bytes: 0 },
      cache: { removed: 0, bytes: 0 },
      thumbs: { removed: 0, bytes: 0 },
      builds: { removed: 0, bytes: 0 },
    },
  };
}

/**
 * Removes the derived files nothing can ask for again, then evicts the rest oldest first until
 * they fit the budget. Pure over the two folders it is given (the tests drive it on a temp tree):
 * no store, no worker client, no environment.
 */
export function sweepDerived(target: DerivedTarget, options: SweepOptions = {}): SweepReport {
  const now = options.now ?? Date.now();
  const budget = options.budgetBytes ?? Infinity;
  const grace = options.graceMs ?? DERIVED_GRACE_MS;
  const keep = options.keepMs ?? DERIVED_KEEP_MS;
  const entries: DerivedEntry[] = [
    ...jobEntries(target.workerDir, now, keep),
    ...revisionEntries('cache', join(target.workerDir, 'cache'), now, keep),
    ...revisionEntries('thumbs', join(target.stateDir, 'thumbs'), now, keep),
    ...buildEntries(target.workerDir, now, keep),
  ];
  const report = emptyReport();
  const parents = new Set<string>();
  const remove = (entry: DerivedEntry): void => {
    rmSync(entry.path, { recursive: true, force: true });
    report.removed += 1;
    report.removedBytes += entry.bytes;
    report.by[entry.kind].removed += 1;
    report.by[entry.kind].bytes += entry.bytes;
    if (entry.parent !== null) parents.add(entry.parent);
  };
  const evictable = (entry: DerivedEntry): boolean => now - entry.mtime >= grace;
  let survivors: DerivedEntry[] = [];
  for (const entry of entries) {
    if (entry.dead && evictable(entry)) remove(entry);
    else survivors.push(entry);
  }
  let total = survivors.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total > budget) {
    const kept: DerivedEntry[] = [];
    for (const entry of [...survivors].sort((a, b) => a.mtime - b.mtime)) {
      if (total > budget && evictable(entry)) {
        remove(entry);
        total -= entry.bytes;
      } else kept.push(entry);
    }
    survivors = kept;
  }
  for (const parent of parents) {
    try {
      if (readdirSync(parent).length === 0) rmdirSync(parent);
    } catch {
      // gone already, or not empty after all
    }
  }
  report.kept = survivors.length;
  report.keptBytes = total;
  return report;
}

/** The derived folders of this process, or null in a checkout, where nothing is swept. */
export function derivedTarget(): DerivedTarget | null {
  if (!isHosted()) return null;
  const state = stateDir();
  return { stateDir: state, workerDir: join(state, 'worker') };
}

/** Free bytes on the volume holding `path` (or its nearest existing ancestor); null when the platform does not say. */
export async function freeBytesAt(path: string): Promise<number | null> {
  let probe = path;
  for (;;) {
    if (existsSync(probe)) break;
    const parent = dirname(probe);
    if (parent === probe) return null;
    probe = parent;
  }
  try {
    const stats = await statfs(probe);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

export type SweepReason = 'routine' | 'low-water' | 'disk-full';

function mb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1);
}

async function runSweep(target: DerivedTarget, reason: SweepReason): Promise<SweepReport> {
  const report = sweepDerived(target, {
    budgetBytes:
      reason === 'routine'
        ? DERIVED_BUDGET_BYTES
        : reason === 'low-water'
          ? DERIVED_PRESSURE_BUDGET_BYTES
          : 0,
    graceMs: reason === 'disk-full' ? DISK_FULL_GRACE_MS : DERIVED_GRACE_MS,
  });
  if (report.removed > 0 || reason !== 'routine') {
    const free = await freeBytesAt(target.stateDir);
    const kinds = DERIVED_KINDS.map((kind) => `${kind} ${report.by[kind].removed}`).join(', ');
    log(
      `sweep (${reason}): removed ${report.removed} entries, ${mb(report.removedBytes)} MB (${kinds}); kept ${report.kept} entries, ${mb(report.keptBytes)} MB${free === null ? '' : `; ${mb(free)} MB free`}`,
    );
  }
  return report;
}

// on globalThis so a dev server reload keeps one clock and one sweep in flight per process
type SweepState = { last: number; running: Promise<SweepReport> | null };
const sweepShared = globalThis as typeof globalThis & { __turboslideSweep?: SweepState };

function sweepState(): SweepState {
  sweepShared.__turboslideSweep ??= { last: 0, running: null };
  return sweepShared.__turboslideSweep;
}

/**
 * The routine sweep when one is due, or the pressure sweep when the volume is low, one at a
 * time per process; a no-op in a checkout. ensureDecks calls it ahead of the collection's work,
 * so every render, export, build and list on a hosted instance passes through it.
 */
export async function sweepDerivedIfDue(now: number = Date.now()): Promise<SweepReport | null> {
  const target = derivedTarget();
  if (target === null) return null;
  const state = sweepState();
  if (state.running !== null) return state.running;
  const free = await freeBytesAt(target.stateDir);
  const low = free !== null && free < DERIVED_LOW_WATER_BYTES;
  if (!low && now - state.last < DERIVED_SWEEP_INTERVAL_MS) return null;
  state.last = now;
  state.running = runSweep(target, low ? 'low-water' : 'routine').finally(() => {
    state.running = null;
  });
  return state.running;
}

/**
 * The error a caller gets when a write met ENOSPC and the sweep did not make room: retryable,
 * so the transports should answer it as a 503 with the seconds to wait, never as a plain 500.
 */
export class DiskFullError extends Error {
  readonly status = 503;
  readonly code = 'disk_full';
  readonly retryAfterSeconds = 5;

  constructor(what: string, options: { cause?: unknown } = {}) {
    super(
      `the server instance ran out of temp space while ${what}; its derived files were swept and the write still failed. Retry in a few seconds; another instance may answer`,
      options,
    );
    this.name = 'DiskFullError';
  }
}

/** True for the ENOSPC a file write throws; false for a DiskFullError, which has been handled. */
export function isDiskFull(error: unknown): boolean {
  return (
    error instanceof Error &&
    !(error instanceof DiskFullError) &&
    (error as NodeJS.ErrnoException).code === 'ENOSPC'
  );
}

/**
 * Runs `run`; on ENOSPC sweeps and runs it once more (unless `retry` is false, for a write that
 * must not run twice), and turns a second ENOSPC into a DiskFullError. Pure over its arguments,
 * so the tests drive it with a fake sweep.
 */
export async function retryWhenDiskFull<T>(
  what: string,
  run: () => Promise<T>,
  sweep: () => Promise<unknown>,
  options: { retry?: boolean } = {},
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isDiskFull(error)) throw error;
    await sweep();
    if (options.retry === false) throw new DiskFullError(what, { cause: error });
    try {
      return await run();
    } catch (again) {
      if (!isDiskFull(again)) throw again;
      throw new DiskFullError(what, { cause: again });
    }
  }
}

/** retryWhenDiskFull over this process's derived folders; `run` as it is in a checkout. */
function withDiskRoom<T>(
  what: string,
  run: () => Promise<T>,
  options: { retry?: boolean } = {},
): Promise<T> {
  const target = derivedTarget();
  if (target === null) return run();
  return retryWhenDiskFull(
    what,
    run,
    async () => {
      log(`disk full while ${what}: sweeping the derived files`);
      await runSweep(target, 'disk-full');
    },
    options,
  );
}
