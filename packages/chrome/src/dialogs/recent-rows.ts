// This browser's own decks in the Open and Import slides dialogs (docs/archive/rounds/POLISH.md item 75; B5's
// R29 to B1, landed by the ship step's third attempt): the Recent mirror's rows draw the moment
// a dialog opens, and the store's listing replaces them when it lands, with any mirror row the
// listing does not hold yet (a deck made a moment ago on the blob tier) folded in above it.
// Pure functions over `DeckHeadRow`, so the dialogs and their tests read one rule.
import type { DeckHeadRow } from '../editor-shell';

/** Newest first, the order both dialogs draw. */
export function newestFirst(rows: ReadonlyArray<DeckHeadRow>): DeckHeadRow[] {
  return [...rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/**
 * The rows a dialog draws before the listing lands: the mirror's, newest first, or null (the
 * loading state) when there is no mirror or it holds nothing. `except` leaves one deck out
 * (Import slides never lists the deck it imports into).
 */
export function recentRowsOf(
  recentDecks: (() => ReadonlyArray<DeckHeadRow>) | undefined,
  except?: string,
): DeckHeadRow[] | null {
  if (recentDecks === undefined) return null;
  let rows: ReadonlyArray<DeckHeadRow>;
  try {
    rows = recentDecks();
  } catch {
    return null;
  }
  const kept = newestFirst(rows.filter((row) => row.id !== except));
  return kept.length > 0 ? kept : null;
}

/**
 * The listing once it lands, with the mirror's rows the listing does not hold folded in above it
 * (the listing's facts win for a deck both hold), newest first within each part. The example
 * deck the listing marks (`example`) comes last when `example` is asked for (Import slides offers
 * it to every browser) and is left out otherwise (File > Open lists the viewer's own decks); a
 * mirror row of the same deck then stands as one of the viewer's own.
 */
export function withRecent(
  listed: ReadonlyArray<DeckHeadRow>,
  recentDecks: (() => ReadonlyArray<DeckHeadRow>) | undefined,
  except?: string,
  options: { example?: boolean } = {},
): DeckHeadRow[] {
  const kept = listed.filter((row) => row.id !== except);
  const rows = newestFirst(kept.filter((row) => row.example !== true));
  const examples = options.example === true ? kept.filter((row) => row.example === true) : [];
  const ids = new Set([...rows, ...examples].map((row) => row.id));
  const mine = (recentRowsOf(recentDecks, except) ?? []).filter((row) => !ids.has(row.id));
  return [...mine, ...rows, ...examples];
}
