import { createServerFn } from '@tanstack/react-start';
import type { DeckDocument } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { authorSchema, writeSchema } from '@turboslide/schema/mutations';
import type { Author, Lease, Mutation, Version, Write } from '@turboslide/schema/mutations';
import { plainText } from '@turboslide/schema/text';
import { TITLE_ROW } from '@turboslide/chrome/menus/strings';
import type { Issue } from '@turboslide/schema/validate';
import { loadDeckDir } from '@turboslide/store/file-store';
import type { HostingFacts } from '@turboslide/store/hosted';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';
import { DEFAULT_BLANK_TITLE } from '@turboslide/store/templates';
import { toVersion } from '@turboslide/store/versions';
import { spriteMarkup } from '@turboslide/theme/sprite';

import { parseJsonInput } from './json';
import type { Untrusted } from './json';
import {
  createStoredDeck,
  hasStoredDeck,
  hostingFacts,
  isUnsavedDraft,
  newDraftDeckId,
  openDeckStore,
  templateDir,
} from './root';

/**
 * The editor's store functions (SPEC 6.7, 7.1; MILESTONES M3 items 3 and 4): every write from the
 * browser lands here and goes through @turboslide/store's writeDeck, the same applyWrite path the
 * CLI and the MCP server use, with the caller's baseRevision and Author. A stale baseRevision comes
 * back as a conflict outcome carrying the current document and the version records written since
 * the caller's base, so the editor can rebase pending mutations that touch other slides and show
 * both versions when they touch the same one. Versions, leases and the watch channel are the
 * store's as well; the watch channel reaches the browser as a long poll, since fs.watch lives in
 * this process. createServerFn appears only under apps/studio/src/server (SPEC 3.3 item 4).
 *
 * The boundary is JSON text: TanStack Start's serializability typing refuses `unknown`, which the
 * document types carry on purpose (`ext` on slides, blocks and assets; mutation values), so each
 * server function takes and returns a JSON string, the validator parses and checks the input with
 * the schema package, and the exported wrappers give the client the typed shapes. The bytes on the
 * wire are what they would have been.
 *
 * The store comes from server/root.ts (the hosting round): FileStore over the checkout's decks/,
 * or the hosted overlay, or the Blob mirror, whose write pushes to the store before it answers.
 *
 * The fresh presentation (gslides-parity SPEC 6.1): /new edits a draft built from the blank
 * template under an id of root.ts's draft shape that the store has not seen. `readDraftDeck`
 * hands the editor that document; the first write against revision 0 creates the deck through
 * `createStoredDeck` (the Blob backend uploads it before the write lands) and then applies the
 * write, so a visit that only looks creates nothing; a lease, a watch poll or a thumbnail warm
 * on an unsaved draft answers as an empty deck would instead of failing, so the editor shows no
 * error before the first edit.
 */

async function storeFor(deckId: string): Promise<DeckStore> {
  if (!SLUG_PATTERN.test(deckId)) throw new RangeError('deckId must be a slug');
  return openDeckStore(deckId);
}

/** The sprite the stage carries: the same markup the renderer inlines (SPEC 5.1). */
function readSprite(): string {
  return spriteMarkup();
}

function requireSlug(value: unknown, name: string): string {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a slug`);
  }
  return value;
}

function parseAuthor(value: unknown): Author {
  const parsed = authorSchema.safeParse(value);
  if (!parsed.success) throw new TypeError('author must be { kind, name, runId? }');
  return parsed.data;
}

export type EditorDeck = {
  deckId: string;
  document: DeckDocument;
  issues: Issue[];
  ok: boolean;
  sprite: string;
  versions: Version[];
  leases: Lease[];
  /** the store this studio runs on, for the banner over a store whose edits do not persist */
  hosting: HostingFacts;
  /**
   * set on the document /new edits (SPEC 6.1): the store holds nothing under `deckId` until the
   * first write; the title row reads "Not saved yet" and the address moves to /edit/<deckId> once
   * that write has landed
   */
  draft?: true;
};

const readEditorDeckFn = createServerFn({ method: 'GET' })
  .validator((input: string) => {
    const parsed = parseJsonInput<{ deckId: unknown }>(input);
    return { deckId: requireSlug(parsed.deckId, 'deckId') };
  })
  .handler(async ({ data }): Promise<string> => {
    if (!(await hasStoredDeck(data.deckId))) return JSON.stringify(null);
    const store = await storeFor(data.deckId);
    const [read, versions, leases] = await Promise.all([
      store.read(),
      store.listVersions(),
      store.leases(),
    ]);
    const result: EditorDeck = {
      deckId: data.deckId,
      document: read.document,
      issues: read.issues,
      ok: read.ok,
      sprite: readSprite(),
      versions,
      leases,
      hosting: hostingFacts(),
    };
    return JSON.stringify(result);
  });

/** The raw normalized document with the version log and the unexpired leases, for the editor's loader. */
export async function readEditorDeck(input: { deckId: string }): Promise<EditorDeck | null> {
  return JSON.parse(await readEditorDeckFn({ data: JSON.stringify(input) })) as EditorDeck | null;
}

/** The template a draft is cut from (SPEC 6.1); `deck.create --from blank` copies the same folder. */
const DRAFT_TEMPLATE = 'blank';

const readDraftDeckFn = createServerFn({ method: 'GET' }).handler(async (): Promise<string> => {
  const dir = await templateDir(DRAFT_TEMPLATE);
  const { document } = loadDeckDir(dir);
  const now = new Date();
  let deckId = newDraftDeckId(now);
  // the four characters make a collision unlikely; a saved deck under the id is skipped anyway
  while (await hasStoredDeck(deckId)) deckId = newDraftDeckId(now);
  const stamp = now.toISOString();
  const result: EditorDeck = {
    deckId,
    document: {
      deck: {
        ...document.deck,
        id: deckId,
        title: DEFAULT_BLANK_TITLE,
        revision: 0,
        createdAt: stamp,
        updatedAt: stamp,
      },
      slides: document.slides,
    },
    issues: [],
    ok: true,
    sprite: readSprite(),
    versions: [],
    leases: [],
    hosting: hostingFacts(),
    draft: true,
  };
  return JSON.stringify(result);
});

/**
 * The document /new edits (gslides-parity SPEC 6.1): the blank template (one Title slide with
 * empty heading and lead, the theme starter pictures, title "Untitled presentation") under a
 * fresh draft id at revision 0, with no version log and no leases. Nothing is written; the first
 * `writeDeck` against the id creates the deck. Two calls give two ids (two tabs, two decks).
 */
export async function readDraftDeck(): Promise<EditorDeck> {
  return JSON.parse(await readDraftDeckFn()) as EditorDeck;
}

/**
 * The auto-title (SPEC 6.3): a presentation still named "Untitled presentation" takes the title
 * slide's heading as its title the first time that heading is committed non-empty, as a second
 * `deck.set /title` in the same write, so one undo removes both. Pure: the editor's commit
 * appends what this returns to the write it is about to apply (the mutations are read as they
 * stand, before the reducer runs).
 */
export function autoTitleMutations(
  document: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
): Mutation[] {
  // TITLE_ROW.untitled is the store's DEFAULT_BLANK_TITLE; the chrome's strings module is the one
  // the browser can load (the store's templates module reaches node:fs at its top)
  if (document.deck.title !== TITLE_ROW.untitled) return [];
  if (mutations.some((mutation) => mutation.op === 'deck.set' && mutation.path === '/title'))
    return [];
  for (const mutation of mutations) {
    // the title slide's heading is a slide field, written by slide.set /heading (InlineText's
    // textCommitMutation) or by a whole slide.replace; block text never names it
    let slideId: string | undefined;
    let value: unknown;
    if (mutation.op === 'slide.set' && mutation.path === '/heading') {
      slideId = mutation.slideId;
      value = mutation.value;
    } else if (mutation.op === 'slide.replace' && mutation.slide.kind === 'title') {
      slideId = mutation.slide.id;
      value = mutation.slide.heading;
    }
    if (slideId === undefined) continue;
    const slide = document.slides[slideId];
    if (slide === undefined || slide.kind !== 'title') continue;
    const heading = typeof value === 'string' ? plainText(value).trim() : '';
    if (heading === '') continue;
    return [{ op: 'deck.set', path: '/title', value: heading }];
  }
  return [];
}

export type WriteDeckInput = {
  deckId: string;
  write: Write;
  /** skip the lease check (SPEC 6.7 force) */
  force?: boolean;
  /** send the normalized document back; the editor asks for it after a version.restore */
  returnDocument?: boolean;
};

export type WriteDeckResult =
  | {
      ok: true;
      revision: number;
      entry: VersionRecord;
      changed: string[];
      warnings: string[];
      issues: Issue[];
      document?: DeckDocument;
      /** this write created the deck in the store: the first save of a draft (SPEC 6.1) */
      created?: true;
    }
  | {
      ok: false;
      code: 'conflict';
      message: string;
      currentRevision: number;
      current: DeckDocument;
      holder?: Author;
      /** the version records after the caller's baseRevision: what changed under it */
      since: VersionRecord[];
    }
  | { ok: false; code: 'invalid'; message: string; index?: number; issues: Issue[] };

const writeDeckFn = createServerFn({ method: 'POST' })
  .validator((raw: string): WriteDeckInput => {
    const input = parseJsonInput<Untrusted<WriteDeckInput>>(raw);
    const deckId = requireSlug(input.deckId, 'deckId');
    const parsed = writeSchema.safeParse(input.write);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new TypeError(
        `write: invalid input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
      );
    }
    return {
      deckId,
      write: parsed.data,
      ...(input.force === true ? { force: true } : {}),
      ...(input.returnDocument === true ? { returnDocument: true } : {}),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    // the first save of a draft (SPEC 6.1): the deck is created from the blank template under the
    // draft's id, then the write applies against revision 0; the id shape keeps any other missing
    // deck a 404, and a write with a base above 0 names a deck that once existed, not a draft
    let created = false;
    if (data.write.baseRevision === 0 && (await isUnsavedDraft(data.deckId))) {
      await createStoredDeck({ name: DEFAULT_BLANK_TITLE, from: DRAFT_TEMPLATE, id: data.deckId });
      created = true;
    }
    const store = await storeFor(data.deckId);
    const outcome = await store.write(data.write, data.force === true ? { force: true } : {});
    let result: WriteDeckResult;
    if (outcome.ok) {
      result = {
        ok: true,
        revision: outcome.revision,
        entry: outcome.entry,
        changed: outcome.changed,
        warnings: outcome.warnings,
        issues: outcome.issues,
        ...(data.returnDocument === true ? { document: outcome.document } : {}),
        ...(created ? { created: true } : {}),
      };
    } else if (outcome.code === 'conflict') {
      const records = await store.records();
      result = {
        ok: false,
        code: 'conflict',
        message: outcome.message,
        currentRevision: outcome.currentRevision,
        current: outcome.current,
        ...(outcome.holder !== undefined ? { holder: outcome.holder } : {}),
        since: records.filter((record) => record.revision > data.write.baseRevision),
      };
    } else {
      result = outcome;
    }
    return JSON.stringify(result);
  });

/**
 * The event the page raises when a write created the deck (the first save of a draft, SPEC
 * 6.1); /new listens for it and moves the address to /edit/<deckId> without a reload.
 */
export const DECK_CREATED_EVENT = 'turboslide:deck-created';

export type DeckCreatedDetail = { deckId: string; revision: number };

/** One Write through the store: the authority behind every editor gesture and window action. */
export async function writeDeck(input: WriteDeckInput): Promise<WriteDeckResult> {
  const result = JSON.parse(await writeDeckFn({ data: JSON.stringify(input) })) as WriteDeckResult;
  if (result.ok && result.created === true && typeof window !== 'undefined') {
    const detail: DeckCreatedDetail = { deckId: input.deckId, revision: result.revision };
    window.dispatchEvent(new CustomEvent(DECK_CREATED_EVENT, { detail }));
  }
  return result;
}

const saveVersionFn = createServerFn({ method: 'POST' })
  .validator((raw: string) => {
    const input = parseJsonInput<{ deckId: unknown; author: unknown; note: unknown }>(raw);
    if (typeof input.note !== 'string' || input.note.trim() === '') {
      throw new TypeError('A named version needs a note');
    }
    return {
      deckId: requireSlug(input.deckId, 'deckId'),
      author: parseAuthor(input.author),
      note: input.note,
    };
  })
  .handler(async ({ data }): Promise<string> => {
    const store = await storeFor(data.deckId);
    return JSON.stringify(await store.saveVersion(data.author, data.note));
  });

/** version.save: a named version at the current revision. */
export async function saveVersion(input: {
  deckId: string;
  author: Author;
  note: string;
}): Promise<Version> {
  return JSON.parse(await saveVersionFn({ data: JSON.stringify(input) })) as Version;
}

const listVersionsFn = createServerFn({ method: 'GET' })
  .validator((raw: string) => {
    const input = parseJsonInput<{ deckId: unknown }>(raw);
    return { deckId: requireSlug(input.deckId, 'deckId') };
  })
  .handler(async ({ data }): Promise<string> =>
    JSON.stringify(await (await storeFor(data.deckId)).listVersions()),
  );

/** version.list: every log entry, oldest first; the server log the undo spec counts. */
export async function listVersions(input: { deckId: string }): Promise<Version[]> {
  return JSON.parse(await listVersionsFn({ data: JSON.stringify(input) })) as Version[];
}

export type LeaseSlideInput = {
  deckId: string;
  slideId: string;
  author: Author;
  minutes?: number;
  force?: boolean;
  release?: boolean;
};

const leaseSlideFn = createServerFn({ method: 'POST' })
  .validator((raw: string): LeaseSlideInput => {
    const input = parseJsonInput<Untrusted<LeaseSlideInput>>(raw);
    return {
      deckId: requireSlug(input.deckId, 'deckId'),
      slideId: requireSlug(input.slideId, 'slideId'),
      author: parseAuthor(input.author),
      ...(typeof input.minutes === 'number' ? { minutes: input.minutes } : {}),
      ...(input.force === true ? { force: true } : {}),
      ...(input.release === true ? { release: true } : {}),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    if (await isUnsavedDraft(data.deckId)) {
      // nothing exists to lease yet (SPEC 6.1): the editor's presence marker holds in name only
      // until the first write creates the deck and the next lease call reaches the store
      const minutes = data.minutes ?? 10;
      const until = new Date(Date.now() + (data.release === true ? 0 : minutes * 60_000));
      const lease: Lease = {
        slideId: data.slideId,
        holder: data.author,
        until: until.toISOString(),
      };
      return JSON.stringify(lease);
    }
    const store = await storeFor(data.deckId);
    if (data.release === true) {
      const released = await store.release(data.slideId, data.author);
      if (released === undefined) {
        throw new RangeError(`No lease held by this author on slide "${data.slideId}"`);
      }
      return JSON.stringify(released);
    }
    const lease = await store.lease(data.slideId, data.author, {
      ...(data.minutes !== undefined ? { minutes: data.minutes } : {}),
      ...(data.force !== undefined ? { force: data.force } : {}),
    });
    return JSON.stringify(lease);
  });

/** slide.lease: take, renew or release the author's advisory lease on a slide (SPEC 6.7). */
export async function leaseSlide(input: LeaseSlideInput): Promise<Lease> {
  return JSON.parse(await leaseSlideFn({ data: JSON.stringify(input) })) as Lease;
}

export type WatchDeckInput = {
  deckId: string;
  /** the revision the caller knows; the poll answers when the deck moves past it, or at the timeout */
  since: number;
  /** how long to hold the poll; 20 s by default, 25 s at most */
  timeoutMs?: number;
};

export type WatchDeckResult = {
  revision: number;
  /** the newest version log entry, with its author, for the external revision banner */
  head: Version | null;
  leases: Lease[];
  /** true when the deck moved past `since` */
  changed: boolean;
  /**
   * the version records written after `since`, oldest first, so the editor can apply an external
   * revision forward on its own document instead of reloading (MILESTONES M4 item 2)
   */
  since: VersionRecord[];
};

const WATCH_DEFAULT_MS = 20_000;
const WATCH_MAX_MS = 25_000;
/** how often a poll on an unsaved draft looks for the deck its first write creates */
const DRAFT_POLL_MS = 1000;

async function snapshot(store: DeckStore, since: number): Promise<WatchDeckResult> {
  const [revision, records, leases] = await Promise.all([
    store.revision(),
    store.records(),
    store.leases(),
  ]);
  const last = records[records.length - 1];
  return {
    revision,
    head: last === undefined ? null : toVersion(last),
    leases,
    changed: revision !== since,
    since: revision === since ? [] : records.filter((record) => record.revision > since),
  };
}

/**
 * The store's watch channel as a long poll (SPEC 6.7 "External changes arrive over the store's
 * watch channel as a new revision"; MILESTONES M4 item 2): resolves as soon as deck.json carries a
 * revision other than `since`, or with the current state at the timeout, with the version records
 * written in between so the editor applies them forward within the second. The editor loops on it.
 * Over the Blob mirror the channel is a revision poll against the store every few seconds
 * (@turboslide/store/blob-store watch), so a write from another instance arrives within that.
 */
const watchDeckFn = createServerFn({ method: 'POST' })
  .validator((raw: string): WatchDeckInput => {
    const input = parseJsonInput<Untrusted<WatchDeckInput>>(raw);
    if (typeof input.since !== 'number' || !Number.isInteger(input.since) || input.since < 0) {
      throw new TypeError('since must be a non-negative integer revision');
    }
    const timeoutMs = typeof input.timeoutMs === 'number' ? input.timeoutMs : WATCH_DEFAULT_MS;
    return {
      deckId: requireSlug(input.deckId, 'deckId'),
      since: input.since,
      timeoutMs: Math.min(WATCH_MAX_MS, Math.max(0, timeoutMs)),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    if (await isUnsavedDraft(data.deckId)) {
      // an unsaved draft (SPEC 6.1) has no store to watch: the poll holds, looking once a second
      // for the deck the first write creates, and answers as an empty deck at the timeout
      const deadline = Date.now() + (data.timeoutMs ?? WATCH_DEFAULT_MS);
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, DRAFT_POLL_MS));
        if (await hasStoredDeck(data.deckId)) break;
      }
      if (!(await hasStoredDeck(data.deckId))) {
        const empty: WatchDeckResult = {
          revision: 0,
          head: null,
          leases: [],
          changed: false,
          since: [],
        };
        return JSON.stringify(empty);
      }
    }
    const store = await storeFor(data.deckId);
    const now = await snapshot(store, data.since);
    if (now.changed) return JSON.stringify(now);
    const result = await new Promise<WatchDeckResult>((resolve, reject) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stop();
        // the deck may have gone away while the poll held (a scratch deck removed by a test):
        // the rejection becomes the route's error, never an unhandled rejection in the server
        snapshot(store, data.since).then(resolve, reject);
      };
      const stop = store.watch((event) => {
        if (event.revision !== null && event.revision !== data.since) finish();
      });
      const timer = setTimeout(finish, data.timeoutMs ?? WATCH_DEFAULT_MS);
    });
    return JSON.stringify(result);
  });

export async function watchDeck(input: WatchDeckInput): Promise<WatchDeckResult> {
  return JSON.parse(await watchDeckFn({ data: JSON.stringify(input) })) as WatchDeckResult;
}
