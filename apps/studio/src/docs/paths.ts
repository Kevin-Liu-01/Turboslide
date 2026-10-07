import { SITE } from '@turboslide/theme/brand/site';

/**
 * The docs' addresses and their heads (docs/POLISH-2.md 5.2), with no import of the content: the
 * routes' `head` functions stay in the router's main chunk, so they read only this module and the
 * loader's plain data, never source.ts and its collection.
 */

/** The base path of every docs page. */
export const DOCS_BASE = '/docs';

/** The address of a page's markdown twin: /docs/index.md for /docs, /docs/<path>.md otherwise. */
export function twinUrl(slugs: readonly string[]): string {
  return slugs.length === 0 ? `${DOCS_BASE}/index.md` : `${DOCS_BASE}/${slugs.join('/')}.md`;
}

/** The slugs a twin's splat names (`editor/slides.md`, `index.md`), or null for another path. */
export function slugsOfTwin(splat: string): string[] | null {
  if (!splat.endsWith('.md')) return null;
  const parts = splat
    .slice(0, -'.md'.length)
    .split('/')
    .filter((part) => part !== '');
  if (parts.length === 1 && parts[0] === 'index') return [];
  return parts;
}

/** The splat of a docs page's address as slugs. */
export function slugsOf(splat: string | undefined): string[] {
  return (splat ?? '').split('/').filter((part) => part !== '');
}

/** What a docs page's loader hands its component and its head: plain data, no function. */
export type DocsPageData = {
  url: string;
  slugs: string[];
  title: string;
  description: string;
  twin: string;
  /** the file under content/docs, for Edit This Page */
  file: string;
};

/** A docs page's head: the title, the description, the canonical address and the twin. */
export function docsHead(data: DocsPageData | undefined) {
  if (data === undefined) return { meta: [{ title: 'Not found | Turboslide documentation' }] };
  const url = `${SITE.origin()}${data.url}`;
  const title = `${data.title} | Turboslide documentation`;
  return {
    meta: [
      { title },
      { name: 'description', content: data.description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: data.description },
      { property: 'og:url', content: url },
      { property: 'og:type', content: 'article' },
    ],
    links: [
      { rel: 'canonical', href: url },
      { rel: 'alternate', type: 'text/markdown', href: data.twin },
    ],
  };
}
