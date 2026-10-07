import { loader } from 'fumadocs-core/source';
import type { InferPageType } from 'fumadocs-core/source';
import { defineDocs } from 'fumadocs-mdx/macro';

import { DOCS_MARKDOWN } from './markdown';
import { DOCS_BASE } from './paths';

/**
 * The docs at /docs (docs/POLISH-2.md 5.1 to 5.3): the MDX pages under `apps/studio/content/docs`
 * with their `meta.json` order, compiled at build by fumadocs-mdx's Vite plugin and read through
 * fumadocs-core's loader, with no fumadocs-ui. The collection is asynchronous: every page's
 * frontmatter and every `meta.json` are in this module, and each page's body is a chunk of its
 * own that `preload()` fetches. The loader, the page tree and the frontmatter therefore run the
 * same in the prerender and in the browser, so a click between docs pages fetches one chunk and
 * calls no server function (C23).
 *
 * `includeProcessedMarkdown` writes each page's markdown twin at compile time with every
 * component in its markdown form (markdown.ts, C27); the twin route, Copy Page, the search index
 * and the agents' full text read it through `getText('processed')`.
 */
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    async: true,
    postprocess: { includeProcessedMarkdown: DOCS_MARKDOWN },
  },
});

export const source = loader({ source: docs.toFumadocsSource(), baseUrl: DOCS_BASE });

export type DocsPage = InferPageType<typeof source>;

/** Every page in the sidebar's order (the page tree flattened), each once. */
export function pagesInOrder(): DocsPage[] {
  const out: DocsPage[] = [];
  const seen = new Set<string>();
  const visit = (nodes: ReturnType<typeof source.getPageTree>['children']): void => {
    for (const node of nodes) {
      if (node.type === 'page') {
        const page = source.getPageByUrl(node.url);
        if (page && !seen.has(page.url)) {
          seen.add(page.url);
          out.push(page);
        }
      } else if (node.type === 'folder') {
        if (node.index) {
          const page = source.getPageByUrl(node.index.url);
          if (page && !seen.has(page.url)) {
            seen.add(page.url);
            out.push(page);
          }
        }
        visit(node.children);
      }
    }
  };
  visit(source.getPageTree().children);
  /* a page no meta.json lists still has an address: it follows the listed ones */
  for (const page of source.getPages())
    if (!seen.has(page.url)) {
      seen.add(page.url);
      out.push(page);
    }
  return out;
}

/** The page before and after one in the sidebar's order. */
export function neighbours(url: string): { previous?: DocsPage; next?: DocsPage } {
  const order = pagesInOrder();
  const at = order.findIndex((page) => page.url === url);
  if (at === -1) return {};
  const previous = order[at - 1];
  const next = order[at + 1];
  return {
    ...(previous === undefined ? {} : { previous }),
    ...(next === undefined ? {} : { next }),
  };
}

/** Levenshtein distance between two short strings. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kept = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = kept;
    }
  }
  return row[b.length] ?? 0;
}

/**
 * The three pages whose address or title is closest to a path that names no page, for the docs
 * miss (5.2): the distance of the missed path's last segment to each page's last slug and to its
 * title, the smaller of the two, ties in the sidebar's order.
 */
export function closestPages(path: string, count = 3): DocsPage[] {
  const words = path
    .toLowerCase()
    .replace(/^\/?docs\/?/, '')
    .split('/')
    .filter((part) => part !== '');
  const last = words[words.length - 1] ?? '';
  const scored = pagesInOrder().map((page, order) => {
    const slug = (page.slugs[page.slugs.length - 1] ?? 'index').toLowerCase();
    const title = page.data.title.toLowerCase();
    const prefix = page.slugs.length > 0 && words[0] === page.slugs[0] ? -1 : 0;
    const score =
      Math.min(distance(last, slug), distance(last, title), title.includes(last) ? 1 : 99) + prefix;
    return { page, score, order };
  });
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  return scored.slice(0, count).map((entry) => entry.page);
}
