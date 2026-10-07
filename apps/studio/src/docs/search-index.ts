import type { SearchIndex, SearchRow } from './search';
import { pagesInOrder } from './source';

/** A section's text with the markup the structure pass kept (a component's tag, the bold marks) taken out. */
function clean(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The search index (docs/POLISH-2.md 5.5): one row per heading section of every page, from the
 * page's `structuredData` (fumadocs' remark-structure, over the MDX alone), so no row carries the
 * page header's words (its title row, Copy Page). The opening section takes the page's
 * description before its own text. Rows follow the sidebar's order. Served prerendered as
 * /docs/search.json (routes/docs.search[.]json.ts).
 */
export async function searchIndex(): Promise<SearchIndex> {
  const rows: SearchRow[] = [];
  for (const page of pagesInOrder()) {
    const data = await page.data.structuredData();
    const title = page.data.title;
    const opening = data.contents
      .filter((content) => content.heading === undefined)
      .map((content) => content.content);
    rows.push({
      u: page.url,
      t: title,
      h: title,
      a: '',
      x: clean([page.data.description ?? '', ...opening].join(' ')),
    });
    for (const heading of data.headings)
      rows.push({
        u: page.url,
        t: title,
        h: clean(heading.content),
        a: heading.id,
        x: clean(
          data.contents
            .filter((content) => content.heading === heading.id)
            .map((content) => content.content)
            .join(' '),
        ),
      });
  }
  return { rows };
}
