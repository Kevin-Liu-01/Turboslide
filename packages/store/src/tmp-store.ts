// The overlay and the tmp backend (the hosting round). The overlay is a decks/ folder under a
// writable root (<tmpdir>/turboslide in a Vercel function) that starts as a copy of the seed:
// the documents (deck.json, slides, versions, the sidecars, the templates) are written on the
// first call to ready(), about one megabyte; a deck's asset twins (30 MB for the GT deck) are
// written on the first call that needs them, so a cold start that only lists decks never touches
// them. The tmp backend is the overlay alone: FileStore over each deck, edits kept for the life
// of the instance, `persistent: false` so the editor shows the notice. blob-store.ts reuses the
// same overlay as its mirror.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { loadDeckDir, openFileStore } from './file-store.ts';
import type { HostedDecks, HostedOptions } from './hosted.ts';
import { assetPathWithin, checkRevision, factsFor } from './hosted.ts';
import type { SeedSource } from './seed.ts';
import { eachLimit, isAssetKey, isSafeKey, materializeSeed, seedDeckIds } from './seed.ts';
import {
  copyDeck,
  createDeck,
  listDeckHeads,
  removeDeck,
  restoreDeck,
  trashDeck,
} from './templates.ts';

export type SeedFacts = {
  /** the seed's deck ids, templates excluded */
  decks: string[];
  documents: { written: number; skipped: number };
};

export type Overlay = {
  readonly root: string;
  readonly decksDir: string;
  /** derived files the studio writes (thumbnails, worker jobs), beside decks/ */
  readonly stateDir: string;
  readonly seed: SeedSource | null;
  /** the documents are on disk; runs once per process, later calls return the same promise */
  ready: () => Promise<SeedFacts>;
  /** one deck's twins are on disk; once per deck per process */
  ensureAssets: (deckId: string) => Promise<void>;
  /** every seed deck's twins; what deck.create from a template needs */
  ensureAllAssets: () => Promise<void>;
  seedDecks: () => Promise<string[]>;
};

export type OverlayOptions = {
  root: string;
  seed: SeedSource | null;
  /**
   * A twin the seed does not carry, by deck id and file name, from the deployment's static files
   * (gslides-parity SPEC-4 0.35; `HostedOptions.fetchAsset`): the `tmp` tier's fallback when the
   * bundle drops `gt-brand/assets/**` (build-4/b4.md R2, the integrator at merge 2). The blob
   * tier keeps its own fetch and upload in blob-store.ts and passes nothing here.
   */
  fetchAsset?: (deckId: string, relative: string) => Promise<Uint8Array | null>;
  log?: (line: string) => void;
};

/** The twin paths (`assets/<file>`) a deck's manifest names, read from the overlay's copy of deck.json. */
function twinNames(decksDir: string, deckId: string): string[] {
  const dir = join(decksDir, deckId);
  if (!existsSync(join(dir, 'deck.json'))) return [];
  try {
    const { document } = loadDeckDir(dir);
    return Object.values(document.deck.assets).flatMap((asset) =>
      Object.values(asset.twins).filter(
        (relative): relative is string => typeof relative === 'string' && isSafeKey(relative),
      ),
    );
  } catch {
    return [];
  }
}

function writeAtomic(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, path);
}

export function createOverlay(options: OverlayOptions): Overlay {
  const root = options.root;
  const decksDir = join(root, 'decks');
  const stateDir = join(root, '.turboslide');
  const log = options.log ?? (() => {});
  const seed = options.seed;
  let keysPromise: Promise<string[]> | undefined;
  let readyPromise: Promise<SeedFacts> | undefined;
  const assetPromises = new Map<string, Promise<void>>();

  const keys = (): Promise<string[]> => {
    keysPromise ??= seed === null ? Promise.resolve([]) : seed.keys();
    return keysPromise;
  };

  const seedDecks = async (): Promise<string[]> => seedDeckIds(await keys());

  const ready = (): Promise<SeedFacts> => {
    readyPromise ??= (async () => {
      const decks = await seedDecks();
      if (seed === null) return { decks, documents: { written: 0, skipped: 0 } };
      const t = performance.now();
      const result = await materializeSeed(seed, decksDir, { filter: (key) => !isAssetKey(key) });
      log(
        `seed ${seed.name}: ${result.written} document files written, ${result.skipped} present, ${Math.round(performance.now() - t)} ms`,
      );
      return { decks, documents: { written: result.written, skipped: result.skipped } };
    })();
    return readyPromise;
  };

  const ensureAssets = (deckId: string): Promise<void> => {
    let pending = assetPromises.get(deckId);
    if (pending === undefined) {
      pending = (async () => {
        await ready();
        if (seed === null || !(await seedDecks()).includes(deckId)) return;
        const t = performance.now();
        const prefix = `${deckId}/assets/`;
        const result = await materializeSeed(seed, decksDir, {
          filter: (key) => key.startsWith(prefix),
        });
        log(
          `seed ${seed.name}: ${result.written} twins of ${deckId} written (${Math.round(result.bytes / 1024)} KB), ${result.skipped} present, ${Math.round(performance.now() - t)} ms`,
        );
        // the twins the seed does not carry (the bundle drops gt-brand/assets/**, SPEC-4 0.35),
        // fetched from the static source when the runtime names one; a twin no origin answers
        // stays missing and the assets route answers 404 for it as before
        const fetchAsset = options.fetchAsset;
        if (fetchAsset === undefined) return;
        const dir = join(decksDir, deckId);
        const missing = twinNames(decksDir, deckId).filter(
          (relative) => !existsSync(join(dir, ...relative.split('/'))),
        );
        if (missing.length === 0) return;
        const t2 = performance.now();
        let fetched = 0;
        await eachLimit(missing, 8, async (relative) => {
          const bytes = await fetchAsset(deckId, relative.replace(/^assets\//, ''));
          if (bytes === null) return;
          writeAtomic(join(dir, ...relative.split('/')), bytes);
          fetched += 1;
        });
        log(
          `tmp: fetched ${fetched} of ${missing.length} missing twins of ${deckId} in ${Math.round(performance.now() - t2)} ms`,
        );
      })();
      assetPromises.set(deckId, pending);
    }
    return pending;
  };

  return {
    root,
    decksDir,
    stateDir,
    seed,
    ready,
    ensureAssets,
    async ensureAllAssets() {
      for (const deckId of await seedDecks()) await ensureAssets(deckId);
    },
    seedDecks,
  };
}

/** The tmp backend: the overlay with FileStore over each deck and no persistence promise. */
export function tmpDecks(options: HostedOptions): HostedDecks {
  const overlay = createOverlay({
    root: options.overlayRoot,
    seed: options.seed,
    ...(options.fetchAsset === undefined ? {} : { fetchAsset: options.fetchAsset }),
    ...(options.log === undefined ? {} : { log: options.log }),
  });
  const storeOptions = options.now === undefined ? {} : { now: options.now };
  const { decksDir } = overlay;
  return {
    kind: 'tmp',
    persistent: false,
    root: overlay.root,
    decksDir,
    async ready() {
      await overlay.ready();
    },
    async list(listOptions) {
      await overlay.ready();
      return listDeckHeads(decksDir, listOptions);
    },
    async has(deckId) {
      await overlay.ready();
      return existsSync(join(decksDir, deckId, 'deck.json'));
    },
    async open(deckId) {
      await overlay.ready();
      const dir = join(decksDir, deckId);
      if (!existsSync(join(dir, 'deck.json')))
        throw new RangeError(`No deck ${deckId} under decks/`);
      return openFileStore({ dir, ...storeOptions });
    },
    async create(input) {
      await overlay.ready();
      // a template names the twins of the deck it was cut from (decks/templates/gt-brand/template.json
      // `assets: ../../gt-brand/assets`), so they must be on disk before createDeck copies them
      if (input.from !== 'blank') await overlay.ensureAllAssets();
      return createDeck(decksDir, input, storeOptions);
    },
    async copy(input, baseRevision) {
      await overlay.ready();
      // the source's twins must be on disk before the copy takes the assets folder whole
      await overlay.ensureAssets(input.id);
      if (baseRevision !== undefined) checkRevision(decksDir, input.id, baseRevision);
      return copyDeck(decksDir, input, storeOptions);
    },
    async trash(deckId, baseRevision) {
      await overlay.ready();
      return trashDeck(decksDir, deckId, {
        ...storeOptions,
        ...(baseRevision !== undefined ? { baseRevision } : {}),
      });
    },
    async restore(deckId, baseRevision) {
      await overlay.ready();
      return restoreDeck(decksDir, deckId, baseRevision !== undefined ? { baseRevision } : {});
    },
    async remove(deckId, baseRevision) {
      await overlay.ready();
      return removeDeck(decksDir, deckId, baseRevision !== undefined ? { baseRevision } : {});
    },
    async ensureAssets(deckId) {
      await overlay.ensureAssets(deckId);
    },
    async assetFile(deckId, relative) {
      await overlay.ensureAssets(deckId);
      const file = assetPathWithin(decksDir, deckId, relative);
      return file !== null && existsSync(file) ? file : null;
    },
    async assetUrl() {
      return null;
    },
    facts() {
      return factsFor(options.selection, decksDir, options.seed);
    },
  };
}
