/**
 * The docs search (docs/POLISH-2.md 5.5, C26): one row per heading section of every page, written
 * at build to /docs/search.json (search-index.ts) and ranked in the browser by `rank`, with no
 * dependency. A row is short keys so the index stays small: `u` the page's address, `t` its title,
 * `h` the section's heading (the title for the page's opening section), `a` the heading's anchor
 * ('' for the opening section) and `x` the section's text.
 */
export type SearchRow = { u: string; t: string; h: string; a: string; x: string };
export type SearchIndex = { rows: SearchRow[] };

export type SearchHit = { row: SearchRow; score: number; excerpt: string };

/** The address the index answers at. */
export const SEARCH_INDEX_URL = '/docs/search.json';

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

/** How well one query word matches a text's words: 3 whole, 2 a word's start, 1 inside one. */
function matchOf(word: string, inText: readonly string[]): number {
  let best = 0;
  for (const each of inText) {
    if (each === word) return 3;
    if (each.startsWith(word)) best = Math.max(best, 2);
    else if (word.length >= 3 && each.includes(word)) best = Math.max(best, 1);
  }
  return best;
}

/** About 120 characters of the section's text around the first query word it holds. */
export function excerptOf(text: string, query: readonly string[]): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const word of query) {
    const found = lower.indexOf(word);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  if (at <= 40) return text.length > 120 ? `${text.slice(0, 118).trimEnd()}…` : text;
  const start = text.lastIndexOf(' ', at - 30) + 1;
  const slice = text.slice(start, start + 118).trimEnd();
  return `…${slice}${start + 118 < text.length ? '…' : ''}`;
}

/**
 * The hits for a query, best first: every query word must match the row's title, heading or
 * text. Rows rank by how well the page's title matches, then a page's opening section before its
 * other sections, then by the heading's match and the text's, then in the sidebar's order. At most
 * `limit` hits.
 */
export function rank(index: SearchIndex, query: string, limit = 12): SearchHit[] {
  const asked = words(query);
  if (asked.length === 0) return [];
  const hits: (SearchHit & { keys: number[] })[] = [];
  index.rows.forEach((row, order) => {
    const title = words(row.t);
    const heading = row.a === '' ? [] : words(row.h);
    const text = words(row.x);
    const keys = [0, row.a === '' ? 1 : 0, 0, 0, -order];
    for (const word of asked) {
      const inTitle = matchOf(word, title);
      const inHeading = matchOf(word, heading);
      const inText = matchOf(word, text);
      if (inTitle + inHeading + inText === 0) return;
      keys[0] = (keys[0] ?? 0) + inTitle;
      keys[2] = (keys[2] ?? 0) + inHeading;
      keys[3] = (keys[3] ?? 0) + inText;
    }
    const score = (keys[0] ?? 0) * 10 + (keys[2] ?? 0) * 4 + (keys[3] ?? 0);
    hits.push({ row, score, excerpt: excerptOf(row.x, asked), keys });
  });
  hits.sort((a, b) => {
    for (let at = 0; at < a.keys.length; at += 1) {
      const by = (b.keys[at] ?? 0) - (a.keys[at] ?? 0);
      if (by !== 0) return by;
    }
    return 0;
  });
  return hits.slice(0, limit).map(({ row, score, excerpt }) => ({ row, score, excerpt }));
}
