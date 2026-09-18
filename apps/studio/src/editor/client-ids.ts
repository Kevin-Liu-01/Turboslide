// The client ids one tab has held on one deck, and the self filter over the roster (gslides-parity
// build-4/hotfix-2.md causes B1 to B3). The server issues a client id per stream open, so a reload
// or a remount gives the same tab a new id while its earlier id may still stand in a roster: a
// reload posts no leave, and on the blob tier the roster is per instance, so the leave of one
// instance never reaches the others. The tab remembers every id it was issued in sessionStorage
// (per tab, survives a reload, gone when the tab closes), hands the earlier ones to the stream
// open as `retire`, and treats a roster row with any of them as itself. Pure over a Storage-like
// object, so the test runs in Node; the controller passes `window.sessionStorage`.

/** The storage key of a deck's ids. */
export function clientIdsKey(deckId: string): string {
  return `turboslide:clients:${deckId}`;
}

/** How many ids a tab keeps; the oldest leave first. */
export const CLIENT_IDS_KEPT = 8;

/** The subset of Storage this module reads and writes. */
export type IdStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The ids the tab held on this deck, oldest first; empty without storage or on any failure. */
export function readClientIds(storage: IdStorage | null | undefined, deckId: string): string[] {
  if (storage === null || storage === undefined) return [];
  try {
    const raw = storage.getItem(clientIdsKey(deckId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is string => typeof row === 'string' && row.length > 0);
  } catch {
    return [];
  }
}

/** Records an id the stream issued; answers the list as stored (oldest first, at most CLIENT_IDS_KEPT). */
export function rememberClientId(
  storage: IdStorage | null | undefined,
  deckId: string,
  clientId: string,
): string[] {
  const known = readClientIds(storage, deckId).filter((row) => row !== clientId);
  known.push(clientId);
  const kept = known.slice(Math.max(0, known.length - CLIENT_IDS_KEPT));
  if (storage !== null && storage !== undefined) {
    try {
      storage.setItem(clientIdsKey(deckId), JSON.stringify(kept));
    } catch {
      // storage refused (quota, a sandboxed document): the in memory set still knows the id
    }
  }
  return kept;
}

/** The storage key of the tab's token. */
export const TAB_TOKEN_KEY = 'turboslide:tab';

/** The token's shape: 32 hex, as the stream route reads it (server/room.ts TAB_TOKEN_PATTERN). */
const TAB_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/**
 * The tab's token (the focus round, cycle 3 stream fix round; VERIFICATION C3S-F2): 32 hex the
 * tab mints once and keeps in its sessionStorage, so it survives a reload and dies with the tab.
 * Every stream open carries it as `tab`, and the stream route releases the tab's earlier stream
 * slots on the instance the open lands on, hello or not and whatever deck: a tab that navigated
 * three times inside five seconds left slots it could never name in `retire` (their opens were
 * aborted before a hello) and was refused at its own cap for the stream lifetime. Without
 * storage the token is minted per page, which still names this page's own earlier streams.
 */
export function tabToken(
  storage: IdStorage | null | undefined,
  random: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => {
    globalThis.crypto.getRandomValues(bytes);
  },
): string {
  try {
    const stored = storage?.getItem(TAB_TOKEN_KEY);
    if (typeof stored === 'string' && TAB_TOKEN_PATTERN.test(stored)) return stored;
  } catch {
    // storage refused: a fresh token below
  }
  const bytes = new Uint8Array(new ArrayBuffer(16));
  random(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  try {
    storage?.setItem(TAB_TOKEN_KEY, token);
  } catch {
    // storage refused (quota, a sandboxed document): the token lives with this page
  }
  return token;
}

/**
 * The roster split into this tab and the others (SPEC-3 4.2 to 4.8 draw `others` alone): a row
 * is this tab's when its client id is the current one or any earlier id of this tab, so the
 * tab's own earlier id is never drawn as a collaborator (an outline, a caret, a chip, a roster
 * row). Another tab of the same person (same principal, an id this tab never held) stays in
 * `others`, as SPEC-3 4.2 has it.
 */
export function partitionRoster<T extends { clientId: string }>(
  rows: readonly T[],
  ownClientIds: ReadonlySet<string>,
  currentClientId: string | null,
): { self: T | null; others: T[] } {
  const self =
    currentClientId === null
      ? null
      : (rows.find((row) => row.clientId === currentClientId) ?? null);
  const others = rows.filter(
    (row) => row.clientId !== currentClientId && !ownClientIds.has(row.clientId),
  );
  return { self, others };
}
