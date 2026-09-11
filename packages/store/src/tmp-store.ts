// The overlay and the tmp backend (the hosting round). The overlay is a decks/ folder under a
// writable root (<tmpdir>/turboslide in a Vercel function) that starts as a copy of the seed:
// the documents (deck.json, slides, versions, the sidecars, the templates) are written on the
// first call to ready(), about one megabyte; a deck's asset twins (30 MB for the GT deck) are
// written on the first call that needs them, so a cold start that only lists decks never touches
// them. The tmp backend is the overlay alone: FileStore over each deck, edits kept for the life
// of the instance, `persistent: false` so the editor shows the notice. blob-store.ts reuses the
// same overlay as its mirror.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { openFileStore } from './file-store.ts';
import type { HostedDecks, HostedOptions } from './hosted.ts';
import { assetPathWithin, factsFor } from './hosted.ts';
import type { SeedSource } from './seed.ts';
import { isAssetKey, materializeSeed, seedDeckIds } from './seed.ts';
import { createDeck, listDeckHeads } from './templates.ts';

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
  log?: (line: string) => void;
};

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
    async list() {
      await overlay.ready();
      return listDeckHeads(decksDir);
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
