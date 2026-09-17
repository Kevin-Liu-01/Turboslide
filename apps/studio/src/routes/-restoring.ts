/**
 * The restore marker (docs/FOCUS.md rank 7; build/b7.md R9, applied by the surface lane in cycle
 * 2 of the focus round): a seller who clicks Restore on /decks/trash and leaves for Recent
 * presentations inside the restore's flight time (300 to 700 ms on the blob tier) lands on a
 * /decks whose listing was read before the trash stamp lifted, and the page never refetches, so
 * the restored deck looks lost until a reload. The trash page writes the marker before the
 * restore's request and removes it when the request is refused; the home page reads a marker
 * younger than RESTORING_MAX_AGE_MS whose deck its listing does not hold, asks the router for the
 * listing again once a second, up to RESTORING_TRIES times, until the card is there or the marker
 * is stale, and removes it. sessionStorage, so the marker follows one tab and dies with it.
 * Google's Drive reflects its own restore in the client's list without a reload; this is the same
 * effect for a listing read from the store.
 */

/** the one sessionStorage key */
export const RESTORING_KEY = 'turboslide:restoring';

/** a marker older than this is stale and is removed unread */
export const RESTORING_MAX_AGE_MS = 15_000;

/** how many times the home page asks for the listing again */
export const RESTORING_TRIES = 3;

/** the pause before each listing read */
export const RESTORING_STEP_MS = 1_000;

export type RestoringMarker = { id: string; at: number };

/** The two storage calls the marker makes; `sessionStorage` in a page, a plain object in a test. */
export type MarkerStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** The tab's sessionStorage, or null where a browser refuses it (private mode, storage blocked). */
export function sessionMarkerStorage(): MarkerStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Writes the marker for a deck whose restore is about to be requested. */
export function writeRestoringMarker(
  storage: MarkerStorage | null,
  id: string,
  now: number = Date.now(),
): void {
  if (storage === null) return;
  try {
    storage.setItem(RESTORING_KEY, JSON.stringify({ id, at: now } satisfies RestoringMarker));
  } catch {
    // a refused write leaves the seller with the reload the marker would have saved
  }
}

/**
 * The marker when it is well formed and younger than the age cap; a stale or malformed marker is
 * removed and null answers.
 */
export function readRestoringMarker(
  storage: MarkerStorage | null,
  now: number = Date.now(),
  maxAgeMs: number = RESTORING_MAX_AGE_MS,
): RestoringMarker | null {
  if (storage === null) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(RESTORING_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearRestoringMarker(storage);
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { id?: unknown }).id !== 'string' ||
    typeof (parsed as { at?: unknown }).at !== 'number'
  ) {
    clearRestoringMarker(storage);
    return null;
  }
  const marker = parsed as RestoringMarker;
  if (now - marker.at > maxAgeMs || marker.at > now + maxAgeMs) {
    clearRestoringMarker(storage);
    return null;
  }
  return marker;
}

/** Removes the marker. */
export function clearRestoringMarker(storage: MarkerStorage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(RESTORING_KEY);
  } catch {
    // nothing to remove, or storage refused; the age cap retires the marker either way
  }
}

/**
 * The home page's decision after one listing read: `done` when the card is listed, the marker is
 * stale or the tries are spent (the marker is then removed), `again` when the listing is asked
 * for once more.
 */
export function restoringStep(
  marker: RestoringMarker,
  listedIds: ReadonlyArray<string>,
  tries: number,
  now: number = Date.now(),
): 'done' | 'again' {
  if (listedIds.includes(marker.id)) return 'done';
  if (now - marker.at > RESTORING_MAX_AGE_MS) return 'done';
  if (tries >= RESTORING_TRIES) return 'done';
  return 'again';
}
