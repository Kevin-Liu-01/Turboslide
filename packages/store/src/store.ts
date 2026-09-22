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
 * Leases were advisory in M2 and M3 and are enforced for agent writes from M4 (SPEC 6.7). Under
 * `advisory` a write to a slide leased by another author goes through and the outcome carries a
 * warning; under `enforce` it is a conflict with the holder attached. A store opened without a
 * policy applies `enforce` to agent authors and `advisory` to humans (lease.ts leasePolicyFor).
 */
export type LeasePolicy = 'advisory' | 'enforce';

export type WriteOptions = {
  /** Skip the lease check (SPEC 6.7 `force`). */
  force?: boolean;
  /**
   * The operation stream range this write commits (gslides-parity SPEC-3 2.1, 0.3): the
   * checkpointer names the first and last `seq` of the entries it coalesced, and the record
   * carries them as `ops`. Absent on every write made outside the room.
   */
  ops?: { fromSeq: number; toSeq: number };
};

/**
 * Who made a write and which client ops it folded (docs/SYNC.md 3.2, invariant 3): the room's
 * client id and the op ids of the batch a POST carried. A record that names its origin lets any
 * instance answer a resend of the same ops with the seq the first admission made instead of
 * committing them a second time; a write from the CLI or an agent's strict write carries none.
 * The same shape lands on `Write` in `@turboslide/schema/mutations` (B1's half); the store reads
 * it off `StoreWrite` whichever lands first.
 */
export type WriteOrigin = { clientId: string; opIds: string[] };

/** A Write with the optional origin the room's channel attaches (docs/SYNC.md 3.2). */
export type StoreWrite = Write & { origin?: WriteOrigin };

/**
 * One entry of the version log on disk: a Version (SPEC 4.2) plus the two fields the store needs
 * to walk history, the revision the write started from and the inverse mutations. Every committed
 * write appends one entry; `version save` appends one with an empty mutation list and a note.
 * `Version.note` is '' on a write entry, so a named version is one whose note is not empty.
 */
export type VersionRecord = Version & {
  baseRevision: number;
  inverse: Mutation[];
  /**
   * The write's origin (docs/SYNC.md 3.2): the client id and the op ids of the batch this record
   * committed. Optional, so every record written before the round and every record of a write
   * made outside the room parses as before; the parser tolerates it one deployment before the
   * writer stores it (`versions.ts` RECORD_ORIGIN_WRITES).
   */
  origin?: WriteOrigin;
  /**
   * The Blob backend's immutable document of this entry (gslides-parity SPEC-2 8.2): the md5 of
   * the `deck.json` bytes the write pushed, naming `snapshots/<md5>.json`. Absent on the file and
   * tmp stores and on records written before the round.
   */
  snapshot?: string;
  /**
   * The operation stream range this record coalesced (gslides-parity SPEC-3 2.1, 0.3): a
   * checkpoint names the first and last `seq` of the entries it committed, so a client knows
   * which retained operations the revision covers. Absent on a record written outside the room
   * (a CLI write, an agent's strict write, a record from before the round).
   */
  ops?: { fromSeq: number; toSeq: number };
};

/** What `putAsset` answers: where the file is on this instance and where a browser can fetch it. */
export type AssetPut = {
  /** the relative path as stored, `assets/<file>` */
  relative: string;
  /** the absolute local path of the file on this instance */
  path: string;
  /** the URL a browser fetches the file from when the backend serves one; null on file and tmp */
  url: string | null;
  /** true when the file was already stored with the same bytes (a retry, a second instance) */
  existed: boolean;
};

/**
 * An asset name is in use with other bytes (gslides-parity SPEC-3 0.26, 8.5: nothing under
 * `assets/` is ever overwritten; twins, sources and frames carry a content digest in their name,
 * so a reuse of a name is a mistake and fails loudly).
 */
export class AssetExistsError extends Error {
  readonly relative: string;
  constructor(relative: string) {
    super(
      `${relative} exists with other bytes; asset files are digest named and never overwritten`,
    );
    this.name = 'AssetExistsError';
    this.relative = relative;
  }
}

const ASSET_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;

/**
 * Checks and returns an asset's relative path: `assets/<file>` (one or more segments), every
 * segment a plain file name, nothing that climbs out of the folder. A TypeError names the problem.
 */
export function assetRelative(relative: string): string {
  const parts = relative.split('/');
  if (parts[0] !== 'assets' || parts.length < 2) {
    throw new TypeError(`An asset path starts with assets/, got ${JSON.stringify(relative)}`);
  }
  for (const segment of parts.slice(1)) {
    if (!ASSET_SEGMENT.test(segment)) {
      throw new TypeError(
        `${JSON.stringify(relative)} is not an asset path: each segment is a plain file name`,
      );
    }
  }
  return relative;
}

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
      /**
       * Set when the write was not committed because a record above its base already names one
       * of its `origin.opIds` (docs/SYNC.md 3.2, invariant 3): the resend of a POST whose first
       * attempt landed. `entry` and `revision` are that record's, `document` is the current one,
       * `changed` is empty; nothing was claimed or put. The channel answers the client one entry
       * per op id at the record's seq.
       */
      replayed?: VersionRecord;
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
   * the revision, writes the touched files and appends a version log entry. A write that names
   * its origin (docs/SYNC.md 3.2) is answered with the record of its first admission when the
   * log above its base holds one (`WriteOutcome.replayed`).
   */
  write: (write: StoreWrite, options?: WriteOptions) => Promise<WriteOutcome>;
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
  /**
   * Stores one asset file under `assets/` on the backend the deck lives on (a local write on
   * `file` and `tmp`; the same plus a `put` under the deck's prefix on `blob`), so a twin
   * written by one hosted instance is served to the next and the record that names it can
   * commit afterwards (gslides-parity SPEC-3 0.39, 8.5; report 10 F49). Names are digest names
   * and never overwritten: an existing file with other bytes is an AssetExistsError, the same
   * bytes are a no-op with `existed: true`. `contentType` defaults from the extension.
   */
  putAsset: (relative: string, bytes: Uint8Array, contentType?: string) => Promise<AssetPut>;
  /** Removes an asset file everywhere the backend holds it; a missing file is not an error. */
  removeAsset: (relative: string) => Promise<void>;
};

/** Two authors are the same when kind, name and runId agree. */
export function sameAuthor(a: Author, b: Author): boolean {
  return a.kind === b.kind && a.name === b.name && a.runId === b.runId;
}

/** `agent:<runId>` for agents, the name for humans: how the CLI and the lease notices print one. */
export function authorLabel(author: Author): string {
  return author.kind === 'agent' ? `agent:${author.runId ?? author.name}` : author.name;
}

/**
 * The assistant's author name (docs/PRODUCT.md 6.1 "The mark"; audit-assist 15): every write the
 * assist makes carries `{ kind: 'agent', name: 'Assistant', runId }`, and every seller surface
 * reads an agent author as "Assistant" through `authorDisplay`; the run id stays for the
 * developer surfaces (`authorLabel`: the CLI, the lease notices, Change history's tooltip).
 */
export const ASSISTANT_NAME = 'Assistant';

/** The word a seller reads for an author: "Assistant" for every agent, the name for a person. */
export function authorDisplay(author: Author): string {
  return author.kind === 'agent' ? ASSISTANT_NAME : author.name;
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
      default: {
        // an op this switch does not name yet (gslides-parity SPEC-3 3.1 adds text.splice and
        // text.mark): every slide scoped op carries slideId, so the lease check still sees it
        const other: { slideId?: unknown } = mutation;
        if (typeof other.slideId === 'string') ids.add(other.slideId);
      }
    }
  }
  return [...ids];
}
