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
