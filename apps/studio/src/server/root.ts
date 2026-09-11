import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkerPaths } from '@turboslide/render-worker/paths';
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
 * still read `deckDir()` directly see a folder that exists.
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
  })();
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
  })();
  return packagesReady;
}

/** The collection with its seed materialized (and uploaded once, for blob), and the package files. */
export async function ensureDecks(): Promise<HostedDecks> {
  const decks = hostedDecks();
  await Promise.all([decks.ready(), ensurePackages()]);
  return decks;
}

export async function listStoredDecks(): Promise<DeckHead[]> {
  return (await ensureDecks()).list();
}

export async function hasStoredDeck(deckId: string): Promise<boolean> {
  return (await ensureDecks()).has(deckId);
}

/** The store for a deck, synced with the backend; a RangeError when the deck is missing. */
export async function openDeckStore(deckId: string): Promise<DeckStore> {
  return (await ensureDecks()).open(deckId);
}

export async function createStoredDeck(input: CreateDeckInput): Promise<CreateDeckResult> {
  return (await ensureDecks()).create(input);
}

/**
 * A deck's twins on disk (the seed's from the bundle, the store's beyond them) before a job
 * that renders or exports the deck runs; the browser would otherwise wait on images that are
 * not there (measured on the first preview: a render hung to the 300 s job timeout, 502).
 */
export async function ensureDeckAssets(deckId: string): Promise<void> {
  await (await ensureDecks()).ensureAssets(deckId);
}

/** The local file of an asset twin, or null. */
export async function storedAssetFile(deckId: string, relative: string): Promise<string | null> {
  return (await ensureDecks()).assetFile(deckId, relative);
}

/** The URL an asset twin is served from when it is not on this instance, or null. */
export async function storedAssetUrl(deckId: string, relative: string): Promise<string | null> {
  return (await ensureDecks()).assetUrl(deckId, relative);
}
