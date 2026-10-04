import type { Appearance } from '@turboslide/schema/deck';

/**
 * This browser's Recent record (gslides-parity SPEC 6.2 "Recent"; SPEC-4 0.29, 3.1; PP 3.1 item
 * 3): which decks this browser opened, when, and the facts the home page's card needs to draw
 * itself without the store (the title, the appearance, the first slide id for the thumbnail and
 * the revision the thumbnail URL carries). Moved out of routes/decks.index.tsx in round four so
 * the editor (editor/EditorRoot.tsx) records an open without importing the home page's module.
 *
 * Two copies of one record. localStorage under RECENT_KEY is the browser's own store and the
 * source of the "Opened 2 hours ago" line and the Last opened by me order; it cannot reach the
 * server. The cookie RECENT_COOKIE mirrors the same entries so the server renders the Recent row
 * into the HTML of /decks before the store list streams behind it (the shell first, SPEC-4
 * 0.29), the pattern round three used for the view and sort cookie (SPEC-3 9.2 L1). Both copies
 * are pruned to the newest RECENT_MAX entries on every write so the server's order and the
 * client's first render agree (React 418 otherwise), and the cookie is scoped to Path=/decks so
 * the editor's requests, the server functions and the thumbnails never carry it. A browser that
 * refuses storage or cookies keeps the store's order and shows no Recent row; nothing else
 * changes. Entries written before round four are ISO strings under the deck id (the time alone)
 * and still count for the order; they have no facts and no place in the row until the deck is
 * opened again.
 */

/** deck id to its record; before round four the value was the ISO time alone. */
export const RECENT_KEY = 'turboslide:opened';

/** the cookie mirror the server reads for /decks (Path=/decks) */
export const RECENT_COOKIE = 'ts-recent';

/** the newest entries kept in both copies */
export const RECENT_MAX = 12;

/** the cookie stays well under the 4 KB a browser allows per cookie */
const RECENT_COOKIE_MAX_BYTES = 3_000;
const RECENT_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;
const TITLE_MAX = 80;

/** What the home page's card draws without the store (server/decks.ts DeckCard's fields). */
export type DeckOpenFacts = {
  title: string;
  appearance: Appearance;
  /** the first slide's id, for the 320 by 180 thumbnail; null for a deck without slides */
  firstSlide: string | null;
  /** the revision the thumbnail URL carries (server/thumbs.ts) */
  revision: number;
  /** the slide count, when the writer knew it (the editor, the store's card); the list view's column */
  slides?: number;
};

export type RecentEntry = DeckOpenFacts & {
  id: string;
  /** the ISO time of the open */
  at: string;
};

type StoredEntry = DeckOpenFacts & { at: string };
type StoredMap = Record<string, string | StoredEntry>;

function isAppearance(value: unknown): value is Appearance {
  return value === 'light' || value === 'dark';
}

function storedEntryOf(value: unknown): StoredEntry | string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.at !== 'string' || typeof entry.title !== 'string') return null;
  if (!isAppearance(entry.appearance)) return null;
  if (entry.firstSlide !== null && typeof entry.firstSlide !== 'string') return null;
  if (typeof entry.revision !== 'number') return null;
  return {
    at: entry.at,
    title: entry.title,
    appearance: entry.appearance,
    firstSlide: entry.firstSlide,
    revision: entry.revision,
    ...(typeof entry.slides === 'number' && Number.isInteger(entry.slides) && entry.slides >= 0
      ? { slides: entry.slides }
      : {}),
  };
}

function readStored(): StoredMap {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: StoredMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = storedEntryOf(value);
      if (entry !== null) out[id] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

function atOf(value: string | StoredEntry): string {
  return typeof value === 'string' ? value : value.at;
}

/** The newest entries first, capped at RECENT_MAX. */
function prune(map: StoredMap): StoredMap {
  const kept = Object.entries(map)
    .sort((a, b) => atOf(b[1]).localeCompare(atOf(a[1])))
    .slice(0, RECENT_MAX);
  return Object.fromEntries(kept);
}

/** deck id to the ISO time it was last opened from this browser, for the Recent order. */
export function readOpened(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(readStored())) out[id] = atOf(value);
  return out;
}

/** The entries with facts, newest first: this browser's Recent row. */
export function readRecent(): RecentEntry[] {
  return recentOf(readStored());
}

function recentOf(map: StoredMap): RecentEntry[] {
  const out: RecentEntry[] = [];
  for (const [id, value] of Object.entries(map)) {
    if (typeof value === 'string') continue;
    out.push({ id, ...value });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * The cookie's compact form: one row per entry, `[id, at, title, appearance, firstSlide,
 * revision, slides]`, the appearance as one letter, the slide count null when unknown (the
 * polish round added it; a six column row from before still parses). Percent encoded because a
 * title may hold `;` or `,`.
 */
export function encodeRecentCookie(entries: ReadonlyArray<RecentEntry>): string {
  const rows = entries.map((entry) => [
    entry.id,
    entry.at,
    entry.title.slice(0, TITLE_MAX),
    entry.appearance === 'light' ? 'l' : 'd',
    entry.firstSlide,
    entry.revision,
    entry.slides ?? null,
  ]);
  return encodeURIComponent(JSON.stringify(rows));
}

/** The entries of a cookie header, newest first; an unreadable cookie is an empty row. */
export function parseRecentCookie(header: string | null | undefined): RecentEntry[] {
  if (!header) return [];
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== RECENT_COOKIE) continue;
    try {
      const rows: unknown = JSON.parse(decodeURIComponent(rest.join('=')));
      if (!Array.isArray(rows)) return [];
      const out: RecentEntry[] = [];
      for (const row of rows as unknown[]) {
        if (!Array.isArray(row) || row.length < 6) continue;
        const [id, at, title, appearance, firstSlide, revision, slides] = row as unknown[];
        if (typeof id !== 'string' || typeof at !== 'string' || typeof title !== 'string') continue;
        if (appearance !== 'l' && appearance !== 'd') continue;
        if (firstSlide !== null && typeof firstSlide !== 'string') continue;
        if (typeof revision !== 'number') continue;
        out.push({
          id,
          at,
          title,
          appearance: appearance === 'l' ? 'light' : 'dark',
          firstSlide,
          revision,
          ...(typeof slides === 'number' && Number.isInteger(slides) && slides >= 0
            ? { slides }
            : {}),
        });
      }
      return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT_MAX);
    } catch {
      return [];
    }
  }
  return [];
}

/** The Set-Cookie value of the mirror, newest first; the oldest entries leave until the value fits. */
export function recentCookieValue(entries: ReadonlyArray<RecentEntry>): string {
  let kept = [...entries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT_MAX);
  let encoded = encodeRecentCookie(kept);
  while (kept.length > 0 && encoded.length > RECENT_COOKIE_MAX_BYTES) {
    kept = kept.slice(0, kept.length - 1);
    encoded = encodeRecentCookie(kept);
  }
  return `${RECENT_COOKIE}=${encoded}; Path=/decks; Max-Age=${RECENT_COOKIE_MAX_AGE_S}; SameSite=Lax`;
}

function writeStored(map: StoredMap): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(map));
  } catch {
    // private mode or storage full: the list keeps the store's order
  }
  try {
    document.cookie = recentCookieValue(recentOf(map));
  } catch {
    // a cookie the browser refuses: localStorage still carries the record for this browser
  }
}

/**
 * Marks a deck as opened now, for the home page's Recent order, its "Opened ..." line and its
 * Recent row. With `facts` the entry carries what the card draws; without them (a caller that
 * knows the id alone) the entry keeps the facts it had, or the time alone.
 */
export function recordDeckOpened(
  deckId: string,
  facts?: DeckOpenFacts,
  now: Date = new Date(),
): void {
  try {
    const map = readStored();
    const at = now.toISOString();
    const previous = map[deckId];
    if (facts !== undefined) map[deckId] = { at, ...facts, title: facts.title.slice(0, TITLE_MAX) };
    else if (previous !== undefined && typeof previous !== 'string')
      map[deckId] = { ...previous, at };
    else map[deckId] = at;
    writeStored(prune(map));
  } catch {
    // private mode or storage full: the list keeps the store's order
  }
}

/**
 * Rewrites the facts of a deck this browser opened without touching its time (the polish round,
 * docs/POLISH.md item 76): a rename from the card or the editor's title field reaches the
 * mirror, so the card the mirror draws before the listing catches up reads the new name. A deck
 * the record does not hold is left alone; a rename is not an open.
 */
export function updateDeckFacts(deckId: string, patch: Partial<DeckOpenFacts>): void {
  try {
    const map = readStored();
    const previous = map[deckId];
    if (previous === undefined || typeof previous === 'string') return;
    map[deckId] = {
      ...previous,
      ...patch,
      title: (patch.title ?? previous.title).slice(0, TITLE_MAX),
    };
    writeStored(prune(map));
  } catch {
    // private mode or storage full: the listing carries the name
  }
}

/**
 * The trashed marker (docs/PRODUCT.md section 2 ranks 15 and 16; audit-seller 15, 16): File >
 * Move to trash in the editor writes the deck's id and title here before it leaves for /decks, so
 * the home page drops the deck from its Opened on this device row, shows "Moved to trash" with
 * Undo within its first seconds, and restores the deck when Undo is pressed. sessionStorage, so
 * the marker follows one tab and dies with it; the entry leaves the Recent record as well, and
 * comes back with the facts it had when Undo restores the deck.
 */
export const TRASHED_KEY = 'turboslide:trashed';

/** a marker older than this is stale and is removed unread */
export const TRASHED_MAX_AGE_MS = 15_000;

/**
 * The window event the editor raises when its Move to trash write is refused after the page has
 * left for /decks (docs/POLISH.md item 81; packages/chrome/src/EditorShell.tsx spells the same
 * name): the home page shows the sentence and keeps the card. `detail` is `{ id, message }`.
 */
export const TRASH_REFUSED_EVENT = 'turboslide:trash-refused';

export type TrashRefusedDetail = { id: string; message: string };

export type TrashedMarker = { id: string; title: string; at: number; facts?: DeckOpenFacts };

type MarkerStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function sessionStore(): MarkerStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Marks a deck as moved to the trash from the editor: the Recent entry leaves and the marker is written. */
export function markDeckTrashed(
  deckId: string,
  title: string,
  now: number = Date.now(),
  storage: MarkerStorage | null = sessionStore(),
): void {
  let facts: DeckOpenFacts | undefined;
  try {
    const entry = readStored()[deckId];
    if (entry !== undefined && typeof entry !== 'string') {
      const { at: _at, ...rest } = entry;
      facts = rest;
    }
  } catch {
    // no record to keep
  }
  forgetDeckOpened(deckId);
  recordDeckTrashed(deckId, new Date(now));
  if (storage === null) return;
  try {
    const marker: TrashedMarker = { id: deckId, title, at: now, ...(facts ? { facts } : {}) };
    storage.setItem(TRASHED_KEY, JSON.stringify(marker));
  } catch {
    // a refused write: the deck still left the Recent row
  }
}

/** The marker when it is young and well formed, removed as it is read; null otherwise. */
export function takeTrashedMarker(
  now: number = Date.now(),
  storage: MarkerStorage | null = sessionStore(),
): TrashedMarker | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(TRASHED_KEY);
    storage.removeItem(TRASHED_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const marker = parsed as Record<string, unknown>;
    if (typeof marker.id !== 'string' || typeof marker.title !== 'string') return null;
    if (typeof marker.at !== 'number' || now - marker.at > TRASHED_MAX_AGE_MS) return null;
    /* the facts ride the marker as a stored entry without its time; the same reader checks them */
    const facts =
      typeof marker.facts === 'object' && marker.facts !== null
        ? storedEntryOf({ ...(marker.facts as Record<string, unknown>), at: 'marker' })
        : null;
    return {
      id: marker.id,
      title: marker.title,
      at: marker.at,
      ...(facts !== null && typeof facts !== 'string'
        ? {
            facts: {
              title: facts.title,
              appearance: facts.appearance,
              firstSlide: facts.firstSlide,
              revision: facts.revision,
            },
          }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Forgets a deck this browser opened (Delete forever, Move to trash), in both copies. */
/**
 * Drops the trashed marker when it names a deck restored from the trash page: the marker waits
 * for the home page to read it for up to 15 s, and a restore inside that window would hide the
 * restored deck on the next visit and offer an Undo for a trash that is no more (the product
 * round's gate, the two restore rows).
 */
export function forgetTrashedMarker(
  deckId: string,
  storage: MarkerStorage | null = sessionStore(),
): void {
  if (storage === null) return;
  try {
    const raw = storage.getItem(TRASHED_KEY);
    if (raw === null) return;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && (parsed as { id?: unknown }).id === deckId)
      storage.removeItem(TRASHED_KEY);
  } catch {
    // an unreadable marker is left for the home page's own reader, which drops it
  }
}

export function forgetDeckOpened(deckId: string): void {
  try {
    const map = readStored();
    if (!(deckId in map)) return;
    delete map[deckId];
    writeStored(map);
  } catch {
    // nothing to forget
  }
}

// ---------------------------------------------------------------------------------------------
// This browser's trash record

/**
 * The decks this browser moved to the trash, or dropped from its Recent record because the store
 * no longer answered them, by id with the time (the Round 1 fix round; VERIFICATION.md "Round 1,
 * pass 1" finding 4). An anonymous visitor's /decks/trash asks the store about these ids and the
 * Recent record's and never lists the store, the way /decks draws the Recent record
 * (server/decks.ts listTrashedDecks, server/deck-scope.ts browserTrash). The page drops an id the
 * store answers as gone; Restore and Delete forever drop theirs. localStorage under
 * TRASH_RECORD_KEY, mirrored in the cookie TRASH_COOKIE (Path=/decks) so the server reads the ids
 * for the trash page's first HTML, as RECENT_COOKIE serves /decks.
 */
export const TRASH_RECORD_KEY = 'turboslide:in-trash';

/** the cookie mirror the server reads for /decks/trash (Path=/decks) */
export const TRASH_COOKIE = 'ts-trash';

/** the newest ids kept in both copies; with the Recent record's 12, server/deck-scope.ts BROWSER_TRASH_MAX */
export const TRASH_RECORD_MAX = 24;

const TRASH_COOKIE_MAX_BYTES = 2_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** deck id to the ISO time it entered the record */
type TrashRecord = Record<string, string>;

function readTrashStored(): TrashRecord {
  try {
    const raw = window.localStorage.getItem(TRASH_RECORD_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: TrashRecord = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>))
      if (SLUG.test(id) && typeof at === 'string') out[id] = at;
    return out;
  } catch {
    return {};
  }
}

/** The record's ids, newest first, capped at TRASH_RECORD_MAX. */
function trashIdsOf(map: TrashRecord): string[] {
  return Object.entries(map)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, TRASH_RECORD_MAX)
    .map(([id]) => id);
}

/** The Set-Cookie value of the mirror: the ids newest first, the oldest leaving until it fits. */
export function trashCookieValue(ids: ReadonlyArray<string>): string {
  let kept = ids.slice(0, TRASH_RECORD_MAX);
  let encoded = encodeURIComponent(JSON.stringify(kept));
  while (kept.length > 0 && encoded.length > TRASH_COOKIE_MAX_BYTES) {
    kept = kept.slice(0, kept.length - 1);
    encoded = encodeURIComponent(JSON.stringify(kept));
  }
  return `${TRASH_COOKIE}=${encoded}; Path=/decks; Max-Age=${RECENT_COOKIE_MAX_AGE_S}; SameSite=Lax`;
}

/** The ids of a cookie header's trash mirror, newest first; an unreadable cookie is none. */
export function parseTrashCookie(header: string | null | undefined): string[] {
  if (!header) return [];
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== TRASH_COOKIE) continue;
    try {
      const ids: unknown = JSON.parse(decodeURIComponent(rest.join('=')));
      if (!Array.isArray(ids)) return [];
      return ids
        .filter((id): id is string => typeof id === 'string' && SLUG.test(id))
        .slice(0, TRASH_RECORD_MAX);
    } catch {
      return [];
    }
  }
  return [];
}

function writeTrashStored(map: TrashRecord): void {
  const ids = trashIdsOf(map);
  const kept: TrashRecord = {};
  for (const id of ids) kept[id] = map[id]!;
  try {
    window.localStorage.setItem(TRASH_RECORD_KEY, JSON.stringify(kept));
  } catch {
    // private mode or storage full: the trash page reads the Recent record alone
  }
  try {
    document.cookie = trashCookieValue(ids);
  } catch {
    // a cookie the browser refuses: localStorage still carries the record for this browser
  }
}

/** Puts a deck in this browser's trash record (Move to trash, or a deck the store stopped answering). */
export function recordDeckTrashed(deckId: string, now: Date = new Date()): void {
  if (!SLUG.test(deckId)) return;
  try {
    const map = readTrashStored();
    map[deckId] = now.toISOString();
    writeTrashStored(map);
  } catch {
    // nothing recorded: the Recent record may still name the deck
  }
}

/** Takes decks out of this browser's trash record (Restore, Delete forever, Undo, a deck gone). */
export function forgetDeckTrashed(...deckIds: ReadonlyArray<string>): void {
  try {
    const map = readTrashStored();
    let changed = false;
    for (const id of deckIds)
      if (id in map) {
        delete map[id];
        changed = true;
      }
    if (changed) writeTrashStored(map);
  } catch {
    // nothing to forget
  }
}

/** The trash record's ids, newest first. */
export function readTrashRecord(): string[] {
  return trashIdsOf(readTrashStored());
}

/** The id of the editor's trashed marker when one waits for /decks, read without taking it. */
function peekTrashedMarkerId(storage: MarkerStorage | null = sessionStore()): string | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(TRASHED_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    const id =
      typeof parsed === 'object' && parsed !== null ? (parsed as { id?: unknown }).id : undefined;
    return typeof id === 'string' && SLUG.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * The ids an anonymous visitor's trash page asks the store about, in the browser: the editor's
 * trashed marker, the trash record, then the Recent record (a deck trashed through the window API
 * or the /decks card stays there until /decks reads it again); each id once.
 */
export function browserTrashIds(): string[] {
  const ids = [
    peekTrashedMarkerId(),
    ...readTrashRecord(),
    ...Object.keys(readStored()).filter((id) => SLUG.test(id)),
  ].filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

/** The same ids on the server, from the two cookie mirrors of the document request. */
export function browserTrashIdsOfCookies(header: string | null | undefined): string[] {
  return [
    ...new Set([
      ...parseTrashCookie(header),
      ...parseRecentCookie(header).map((entry) => entry.id),
    ]),
  ];
}
