// The DeckStore contract (SPEC 4.1, 4.4, 6.7 and 11 "Storage"): what every storage backend offers
// the CLI, the MCP server and the studio. FileStore in this package is the M2 backend over
// decks/<id> with git as history; a SqliteStore or a Postgres store with the same shape follows
// when open question 1 says shared decks are wanted. Every backend applies writes through
// applyWrite from @turboslide/schema, so the baseRevision check, the inverse mutations and the
// normalization are the reducer's, not the store's.
import type { DeckDocument } from '@turboslide/schema/deck';
import type { SlideId } from '@turboslide/schema/ids';
import type { Author, Lease, Mutation, Version, Write } from '@turboslide/schema/mutations';
import type { Issue } from '@turboslide/schema/validate';

/**
 * Leases are advisory in M2 and M3 and enforced for agent writes in M4 (SPEC 6.7). Under
 * `advisory` a write to a slide leased by another author goes through and the outcome carries a
 * warning; under `enforce` it is a conflict with the holder attached.
 */
export type LeasePolicy = 'advisory' | 'enforce';

export type WriteOptions = {
  /** Skip the lease check (SPEC 6.7 `force`). */
  force?: boolean;
};

/**
 * One entry of the version log on disk: a Version (SPEC 4.2) plus the two fields the store needs
 * to walk history, the revision the write started from and the inverse mutations. Every committed
 * write appends one entry; `version save` appends one with an empty mutation list and a note.
 * `Version.note` is '' on a write entry, so a named version is one whose note is not empty.
 */
export type VersionRecord = Version & { baseRevision: number; inverse: Mutation[] };

export type ReadResult = {
  /** The normalized document; a deck with severity 3 issues is returned as parsed. */
  document: DeckDocument;
  issues: Issue[];
  /** false when any issue has severity 3 */
  ok: boolean;
};

export type WriteOutcome =
  | {
      ok: true;
      document: DeckDocument;
      revision: number;
      entry: VersionRecord;
      /** Slide ids whose files were written or removed by this write. */
      changed: SlideId[];
      issues: Issue[];
      /** Advisory lease notices: another author holds a lease on a touched slide. */
      warnings: string[];
    }
  | {
      ok: false;
      code: 'conflict';
      message: string;
      /** The current document, so the caller's re-read is free (SPEC 7.1). */
      current: DeckDocument;
      currentRevision: number;
      /** Set when the conflict is a held lease rather than a stale baseRevision. */
      holder?: Author;
    }
  | { ok: false; code: 'invalid'; message: string; index?: number; issues: Issue[] };

export type LeaseOptions = {
  /** Defaults to 10 (SPEC 6.7). */
  minutes?: number;
  /** Take the lease even when another author holds it. */
  force?: boolean;
};

/** What the watch channel reports: the deck changed on disk, at this revision, in these files. */
export type StoreEvent = {
  type: 'change';
  /** The revision read from deck.json after the change, or null when the manifest is unreadable. */
  revision: number | null;
  /** Paths relative to the deck directory. */
  files: string[];
};

export type StoreListener = (event: StoreEvent) => void;

export type DeckStore = {
  /** The deck id, which is the directory name under decks/. */
  readonly id: string;
  /** The current normalized document with the validator's issues. */
  read: () => Promise<ReadResult>;
  /** The current revision from the manifest. */
  revision: () => Promise<number>;
  /**
   * Applies a Write atomically: a stale baseRevision returns the current document, a mutation
   * that throws or a result that fails validation returns `invalid`, and a committed write bumps
   * the revision, writes the touched files and appends a version log entry.
   */
  write: (write: Write, options?: WriteOptions) => Promise<WriteOutcome>;
  /** Appends a named version at the current revision. */
  saveVersion: (author: Author, note: string) => Promise<Version>;
  /** Every version log entry, oldest first. */
  listVersions: () => Promise<Version[]>;
  /** The same entries with baseRevision and the inverse mutations, for range resolution. */
  records: () => Promise<VersionRecord[]>;
  /** The document as it was after version n; 0 is the state before the first entry. */
  documentAt: (n: number) => Promise<DeckDocument>;
  /** The document at a revision the log reaches. */
  documentAtRevision: (revision: number) => Promise<DeckDocument>;
  /** Takes a lease on a slide for an author; a ConflictError names the holder unless forced. */
  lease: (slideId: SlideId, holder: Author, options?: LeaseOptions) => Promise<Lease>;
  /** Releases the holder's lease on a slide; undefined when there was none. */
  release: (slideId: SlideId, holder: Author) => Promise<Lease | undefined>;
  /** The unexpired leases. */
  leases: () => Promise<Lease[]>;
  /** Subscribes to changes on disk; the return value unsubscribes. */
  watch: (listener: StoreListener) => () => void;
};

/** Two authors are the same when kind, name and runId agree. */
export function sameAuthor(a: Author, b: Author): boolean {
  return a.kind === b.kind && a.name === b.name && a.runId === b.runId;
}

/** `agent:<runId>` for agents, the name for humans: how the CLI and the lease notices print one. */
export function authorLabel(author: Author): string {
  return author.kind === 'agent' ? `agent:${author.runId ?? author.name}` : author.name;
}

/** The slide ids a mutation list touches, for lease checks; whole-deck writes touch none. */
export function touchedSlides(mutations: ReadonlyArray<Mutation>): SlideId[] {
  const ids = new Set<SlideId>();
  for (const mutation of mutations) {
    switch (mutation.op) {
      case 'slide.insert':
        ids.add(mutation.slide.id);
        break;
      case 'slide.remove':
      case 'slide.move':
      case 'slide.set':
      case 'slide.replace':
      case 'block.insert':
      case 'block.remove':
      case 'block.move':
      case 'block.set':
      case 'text.replace':
        ids.add(mutation.slideId);
        break;
      case 'section.set':
      case 'asset.set':
      case 'asset.remove':
      case 'deck.set':
      case 'version.restore':
        break;
    }
  }
  return [...ids];
}
