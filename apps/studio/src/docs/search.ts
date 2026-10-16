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

/**
 * A section's text as a reader reads it, with the Markdown the structure pass kept taken out: the
 * backticks of inline code (its text stays, a placeholder such as `<slideId>` with it), a
 * component's tag and the bold marks outside code, a table's column pipes, and the backslash of
 * an escape, so a cell's `object \| null` reads "object | null".
 */
export function clean(text: string): string {
  return text
    .split('`')
    .map((run, at) =>
      at % 2 === 1
        ? run
        : run
            .replace(/<[^>]*>/g, ' ')
            .replace(/\*\*|__/g, '')
            .replace(/(^|\s)\|(?=\s|$)/g, '$1'),
    )
    .join('')
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

/** One word and another in its plural ("slide" and "slides", "match" and "matches"). */
function sameWord(a: string, b: string): boolean {
  return a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;
}

/**
 * How well one query word matches a text's words: 3 whole (or its plural), 2 a word's start, 1
 * inside one.
 */
function matchOf(word: string, inText: readonly string[]): number {
  let best = 0;
  for (const each of inText) {
    if (sameWord(each, word)) return 3;
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
 * text. A page whose title matches comes first, as its opening section, by how well its title
 * matches and then by how much of the title the query names (so "slide" finds Slides before
 * "Objects on a slide"); then the sections whose heading matches, by that match; then a page's
 * opening section before its other sections, by the text's match; then in the sidebar's order. A
 * section never ranks on its page's title alone, so the sections of one page whose title matches
 * never push another such page down. At most `limit` hits.
 */
export function rank(index: SearchIndex, query: string, limit = 12): SearchHit[] {
  const asked = words(query);
  if (asked.length === 0) return [];
  const hits: (SearchHit & { keys: number[] })[] = [];
  index.rows.forEach((row, order) => {
    const opening = row.a === '';
    const title = words(row.t);
    const heading = opening ? [] : words(row.h);
    const text = words(row.x);
    let inTitles = 0;
    let inHeadings = 0;
    let inTexts = 0;
    for (const word of asked) {
      const inTitle = matchOf(word, title);
      const inHeading = matchOf(word, heading);
      const inText = matchOf(word, text);
      if (inTitle + inHeading + inText === 0) return;
      /* a title ranks on whole words and word starts, never on a word inside another
         ("slide" inside "Turboslide") */
      inTitles += inTitle >= 2 ? inTitle : 0;
      inHeadings += inHeading;
      inTexts += inText;
    }
    /* the share of the title's words the query names, for a page's opening section alone */
    const named = title.filter((each) => asked.some((word) => matchOf(word, [each]) >= 2)).length;
    const keys = [
      opening ? inTitles : 0,
      opening && title.length > 0 ? named / title.length : 0,
      inHeadings,
      opening ? 1 : 0,
      inTexts,
      -order,
    ];
    const score = (keys[0] ?? 0) * 10 + inHeadings * 4 + inTexts;
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
