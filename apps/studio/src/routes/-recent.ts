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
 * revision]`, the appearance as one letter. Percent encoded because a title may hold `;` or `,`.
 */
export function encodeRecentCookie(entries: ReadonlyArray<RecentEntry>): string {
  const rows = entries.map((entry) => [
    entry.id,
    entry.at,
    entry.title.slice(0, TITLE_MAX),
    entry.appearance === 'light' ? 'l' : 'd',
    entry.firstSlide,
    entry.revision,
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
        const [id, at, title, appearance, firstSlide, revision] = row as unknown[];
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

/** Forgets a deck this browser opened (Delete forever), in both copies. */
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
