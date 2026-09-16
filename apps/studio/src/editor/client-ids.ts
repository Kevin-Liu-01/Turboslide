// The client id one tab holds on one deck, its op counter, the ids it held before, and the self
// filter over the roster (gslides-parity build-4/hotfix-2.md causes B1 to B3; SPEC-5-amendments
// A3 item 5). Round five gives a tab one client id: the id the stream last issued is kept in
// sessionStorage (per tab, survives a reload, gone when the tab closes) and asked for on every
// stream open (`?client=`), so a reload or a reconnect keeps the id and replaces the tab's own
// roster row instead of adding one; the server issues a fresh id only when the held one does not
// name this deck and this identity, and the earlier ids then ride as `retire`. The op counter is
// kept beside the id so a kept id never repeats a counter (an op id the server saw before is
// answered with its entry, never appended again). A roster row is this tab when its client id is
// the current one or any earlier id of this tab, and this person when its principal id is the
// tab's own: neither is ever drawn as a collaborator. Pure over a Storage-like object, so the test
// runs in Node; the controller passes `window.sessionStorage`.

/** The storage key of a deck's ids. */
export function clientIdsKey(deckId: string): string {
  return `turboslide:clients:${deckId}`;
}

/** The storage key of a deck's op counter. */
export function opCounterKey(deckId: string): string {
  return `turboslide:ops:${deckId}`;
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
 * The client id this tab holds on the deck (SPEC-5-amendments A3 item 5): the id the stream
 * issued last, asked for on the next open. Null before the first hello or without storage.
 */
export function heldClientId(storage: IdStorage | null | undefined, deckId: string): string | null {
  const ids = readClientIds(storage, deckId);
  return ids.length === 0 ? null : (ids[ids.length - 1] as string);
}

/**
 * The ids to retire on a stream open: every id the tab held except the one it asks to keep. With
 * a kept id the list is usually empty; it fills when the server issued a fresh id (a stranger's
 * id in storage, another deck's, a duplicated tab) and the earlier row must leave the roster.
 */
export function idsToRetire(
  storage: IdStorage | null | undefined,
  deckId: string,
  keep: string | null,
): string[] {
  return readClientIds(storage, deckId).filter((id) => id !== keep);
}

/**
 * The tab's op counter, persisted after every increment so a kept client id never repeats a
 * counter across a reload. Without storage it counts in memory from zero, as before round five.
 */
export function opCounterFor(
  storage: IdStorage | null | undefined,
  deckId: string,
): { next: () => number } {
  let counter = 0;
  if (storage !== null && storage !== undefined) {
    try {
      const raw = storage.getItem(opCounterKey(deckId));
      const parsed = raw === null ? 0 : Number(raw);
      if (Number.isInteger(parsed) && parsed >= 0) counter = parsed;
    } catch {
      // storage refused: the counter starts at zero and the server's dedup answers a repeat
    }
  }
  return {
    next: () => {
      counter += 1;
      if (storage !== null && storage !== undefined) {
        try {
          storage.setItem(opCounterKey(deckId), String(counter));
        } catch {
          // storage refused: the in memory counter still advances
        }
      }
      return counter;
    },
  };
}

/**
 * The roster split into this tab and the others (SPEC-3 4.2 to 4.8 draw `others` alone): a row
 * is this tab's when its client id is the current one or any earlier id of this tab, and this
 * person's when its principal id is the tab's own (SPEC-5-amendments A3 item 5: the self filter
 * applies by client id and by principal id on every presence surface), so neither the tab's own
 * earlier id nor the same person's other tab is ever drawn as a collaborator (an outline, a caret,
 * a chip, a roster row, a flag, a pointer, a follow target). Without a principal id from the
 * caller the self row's principal stands in (the room wrote it); with neither (no current id) the
 * rule is the client id's alone, as before round five.
 */
export function partitionRoster<T extends { clientId: string; principalId?: string }>(
  rows: readonly T[],
  ownClientIds: ReadonlySet<string>,
  currentClientId: string | null,
  ownPrincipalId: string | null = null,
): { self: T | null; others: T[] } {
  const self =
    currentClientId === null
      ? null
      : (rows.find((row) => row.clientId === currentClientId) ?? null);
  // the person is the caller's principal, else the one the room wrote on this tab's own row (a
  // page that began as a draft on /new knows no identity until its first write, while its roster
  // row carries the principal the stream bound)
  const principal = ownPrincipalId ?? self?.principalId ?? null;
  const others = rows.filter(
    (row) =>
      row.clientId !== currentClientId &&
      !ownClientIds.has(row.clientId) &&
      (principal === null || row.principalId !== principal),
  );
  return { self, others };
}
