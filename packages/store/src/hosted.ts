// The hosted deck collection (the hosting round; SPEC 11 "Storage"): one object the studio asks
// for decks, whichever backend select.ts picked. `file` is the checkout's decks/ folder as it
// always was; `tmp` is the overlay seeded from the bundled decks (tmp-store.ts); `blob` is the
// overlay as a mirror of a Vercel Blob store (blob-store.ts). Every backend hands out DeckStore
// instances, so every write still goes through applyWrite (SPEC 7.1), and every backend serves
// the deck list, deck.create and the asset twins through the same six calls. Framework free: the
// studio registers the seed and the Blob client it got from Nitro through registerHostingProviders.
import { existsSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';

import type { BlobClient } from './blob-store.ts';
import { blobDecks } from './blob-store.ts';
import { loadDeckDir, openFileStore } from './file-store.ts';
import type { SeedSource } from './seed.ts';
import type { StoreKind, StoreSelection } from './select.ts';
import { NOT_PERSISTENT_NOTICE } from './select.ts';
import type { DeckStore } from './store.ts';
import {
  StaleRevisionError,
  copyDeck,
  createDeck,
  listDeckHeads,
  removeDeck,
  restoreDeck,
  trashDeck,
} from './templates.ts';
import type {
  CopyDeckInput,
  CopyDeckResult,
  CreateDeckInput,
  CreateDeckResult,
  DeckHead,
  ListDecksOptions,
  TrashState,
} from './templates.ts';
import { tmpDecks } from './tmp-store.ts';

// The deck's side records of round three (gslides-parity SPEC-3 2.2, 11.2: `HostedDecks.access`,
// `writeAccess`, the per identity index) live in access-store.ts, comments-store.ts and inbox.ts
// and are reachable through this entry as well as their own subpaths (build-3/b2.md R7 asks the
// integrator for the entries; until they land the studio imports them from here).
export * from './access-store.ts';
export * from './comments-store.ts';
export * from './inbox.ts';
export * from './migrate.ts';

/** What the deck list and the editor banner show about the store. */
export type HostingFacts = {
  store: StoreKind;
  reason: string;
  /** false when a new instance starts from the seed again */
  persistent: boolean;
  /** a Blob token is present in the environment */
  blob: boolean;
  /** where the seed came from; null in file mode */
  seed: string | null;
  /** the notice the editor shows; null when edits persist */
  notice: string | null;
  decksDir: string;
};

/**
 * The saved templates across instances (the product round fix round; docs/PRODUCT.md 4.3;
 * blob-templates.ts): `pull` brings the store's saved templates and the deployment default into
 * this instance's folder before a read of the index (one head when nothing moved), `push` sends
 * one saved template folder, or its removal, and the index after a write on this instance
 * (`change` absent: the index alone, for Use for new presentations). The file and tmp backends
 * hold their templates in one place and do nothing.
 */
export type HostedTemplates = {
  pull: () => Promise<void>;
  push: (change?: { id: string; removed?: boolean }) => Promise<void>;
};

/** The facet of a backend whose folder is the one copy: nothing to move. */
export const LOCAL_TEMPLATES: HostedTemplates = {
  async pull() {},
  async push() {},
};

export type HostedDecks = {
  readonly kind: StoreKind;
  readonly persistent: boolean;
  /** the root the studio treats as the repository root: the workspace, or the overlay */
  readonly root: string;
  /** the decks folder FileStore-shaped code reads */
  readonly decksDir: string;
  /** the seed is materialized (and, for blob, uploaded once); a no-op in file mode */
  ready: () => Promise<void>;
  /** every deck, newest first; the decks in the trash only with includeTrashed (gslides-parity SPEC 7.2.5) */
  list: (options?: ListDecksOptions) => Promise<DeckHead[]>;
  has: (deckId: string) => Promise<boolean>;
  /** the store for a deck; a RangeError when the deck is missing */
  open: (deckId: string) => Promise<DeckStore>;
  create: (input: CreateDeckInput) => Promise<CreateDeckResult>;
  /** Make a copy (gslides-parity SPEC 7.5 deck.copy): a new deck from an existing one */
  copy: (input: CopyDeckInput, baseRevision?: number) => Promise<CopyDeckResult>;
  /** Move to trash (deck.trash): writes trashedAt on the manifest at the store level */
  trash: (deckId: string, baseRevision?: number) => Promise<TrashState>;
  /** Restore from trash (deck.restore): clears trashedAt */
  restore: (deckId: string, baseRevision?: number) => Promise<TrashState>;
  /** Delete forever (deck.remove): the folder or the prefix and everything under it */
  remove: (deckId: string, baseRevision?: number) => Promise<{ id: string; removed: true }>;
  /** a deck's twins are on disk, so a render or export job that reads them finds them; a no-op in file mode */
  ensureAssets: (deckId: string) => Promise<void>;
  /** the local file of an asset twin, confined to the deck's assets folder; null when absent */
  assetFile: (deckId: string, relative: string) => Promise<string | null>;
  /** a URL the twin is served from when it is not on this instance; null when there is none */
  assetUrl: (deckId: string, relative: string) => Promise<string | null>;
  /** the saved templates across instances (HostedTemplates) */
  readonly templates: HostedTemplates;
  facts: () => HostingFacts;
};

export type BlobClientFactory = BlobClient | (() => Promise<BlobClient>);

export type HostedOptions = {
  selection: StoreSelection;
  /** the checkout's decks folder; null when the process runs outside a workspace */
  workspaceDecksDir: string | null;
  overlayRoot: string;
  seed: SeedSource | null;
  blob: BlobClientFactory | null;
  /**
   * A twin the bundle and the store do not hold, by deck id and file name (`opener-brand-dark.jpg`),
   * from wherever the deployment serves it statically (gslides-parity SPEC-4 0.35, 3.6: the seed's
   * twins leave the function bundle and stay static files of the deployment); null when the
   * source has none. The studio's root.ts fetches the seed deck's twins from the deployment's
   * own origin; a checkout passes nothing, because its twins are on disk.
   */
  fetchAsset?: (deckId: string, relative: string) => Promise<Uint8Array | null>;
  /** the clock, for tests */
  now?: () => string;
  log?: (line: string) => void;
};

/**
 * What the runtime hands the store: the bundled seed and the Blob client. The studio's Nitro
 * plugin registers them at startup (apps/studio/src/server/hosting-plugin.ts); the studio's
 * root.ts reads them, and falls back to the checkout's decks/ when nothing is registered.
 */
export type HostingProviders = {
  seed?: SeedSource | null;
  blob?: BlobClientFactory | null;
  /**
   * the runtime files of the theme, fonts and export packages a bundled server cannot resolve
   * (keys laid out like packages/: theme/src/gt-ink-paper/sheet.css); the studio materializes
   * them and names the folder in TURBOSLIDE_PACKAGES_DIR
   */
  packages?: SeedSource | null;
  /** who registered, for the facts */
  source: string;
};

const GLOBAL_KEY = '__turboslideHosting';

type Shared = typeof globalThis & { [GLOBAL_KEY]?: HostingProviders };

export function registerHostingProviders(providers: HostingProviders): void {
  (globalThis as Shared)[GLOBAL_KEY] = providers;
}

export function hostingProviders(): HostingProviders | null {
  return (globalThis as Shared)[GLOBAL_KEY] ?? null;
}

/** The absolute path of `<decksDir>/<deckId>/assets/<relative>`, or null when it escapes the folder. */
export function assetPathWithin(decksDir: string, deckId: string, relative: string): string | null {
  const base = resolve(join(decksDir, deckId, 'assets'));
  const file = resolve(join(base, normalize(relative)));
  return file.startsWith(base + sep) ? file : null;
}

export function factsFor(
  selection: StoreSelection,
  decksDir: string,
  seed: SeedSource | null,
): HostingFacts {
  return {
    store: selection.kind,
    reason: selection.reason,
    persistent: selection.persistent,
    blob: selection.blob,
    seed: seed === null ? null : seed.name,
    notice: selection.persistent ? null : NOT_PERSISTENT_NOTICE,
    decksDir,
  };
}

/** The checkout's decks/ folder: what the studio always had (SPEC 4.1). */
export function fileDecks(
  root: string,
  decksDir: string,
  selection: StoreSelection,
  options: { now?: () => string } = {},
): HostedDecks {
  const createOptions = options.now === undefined ? {} : { now: options.now };
  return {
    kind: 'file',
    persistent: true,
    root,
    decksDir,
    async ready() {},
    async list(listOptions) {
      return listDeckHeads(decksDir, listOptions);
    },
    async has(deckId) {
      return existsSync(join(decksDir, deckId, 'deck.json'));
    },
    async open(deckId) {
      const dir = join(decksDir, deckId);
      if (!existsSync(join(dir, 'deck.json')))
        throw new RangeError(`No deck ${deckId} under decks/`);
      return openFileStore({ dir, ...createOptions });
    },
    async create(input) {
      return createDeck(decksDir, input, createOptions);
    },
    async copy(input, baseRevision) {
      if (baseRevision !== undefined) checkRevision(decksDir, input.id, baseRevision);
      return copyDeck(decksDir, input, createOptions);
    },
    async trash(deckId, baseRevision) {
      return trashDeck(decksDir, deckId, {
        ...createOptions,
        ...(baseRevision !== undefined ? { baseRevision } : {}),
      });
    },
    async restore(deckId, baseRevision) {
      return restoreDeck(decksDir, deckId, baseRevision !== undefined ? { baseRevision } : {});
    },
    async remove(deckId, baseRevision) {
      return removeDeck(decksDir, deckId, baseRevision !== undefined ? { baseRevision } : {});
    },
    async ensureAssets() {},
    async assetFile(deckId, relative) {
      const file = assetPathWithin(decksDir, deckId, relative);
      return file !== null && existsSync(file) ? file : null;
    },
    async assetUrl() {
      return null;
    },
    templates: LOCAL_TEMPLATES,
    facts() {
      return factsFor(selection, decksDir, null);
    },
  };
}

/** A stale baseRevision against a deck folder is the StaleRevisionError the transports map to 409. */
export function checkRevision(decksDir: string, deckId: string, baseRevision: number): void {
  const dir = join(decksDir, deckId);
  if (!existsSync(join(dir, 'deck.json'))) throw new RangeError(`No deck ${deckId} under decks/`);
  const revision = loadDeckDir(dir).document.deck.revision;
  if (revision !== baseRevision) throw new StaleRevisionError(deckId, baseRevision, revision);
}

/** The collection for a selection; a TypeError when the backend's inputs are missing. */
export function openHostedDecks(options: HostedOptions): HostedDecks {
  const { selection } = options;
  switch (selection.kind) {
    case 'file': {
      if (options.workspaceDecksDir === null) {
        throw new TypeError(
          'The file store needs a checkout: no pnpm-workspace.yaml above the working directory and no TURBOSLIDE_ROOT; set TURBOSLIDE_STORE=tmp or blob when hosting',
        );
      }
      return fileDecks(
        resolve(options.workspaceDecksDir, '..'),
        options.workspaceDecksDir,
        selection,
        options.now === undefined ? {} : { now: options.now },
      );
    }
    case 'tmp':
      return tmpDecks(options);
    case 'blob':
      return blobDecks(options);
  }
}
