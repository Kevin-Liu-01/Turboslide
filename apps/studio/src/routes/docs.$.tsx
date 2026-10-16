import { createFileRoute, notFound } from '@tanstack/react-router';

import { DocsArticle, DocsMiss, loadDocsPage } from '../components/docs/DocsArticle';
import { docsHead, slugsOf } from '../docs/paths';

/**
 * A docs page, /docs/<path> (docs/POLISH-2.md 5.2; hardening HR-PC#5): the loader finds the page
 * in the collection's frontmatter; the prerender draws the body from its chunk, and the browser
 * reads the next page's body from that page's prerendered document, so a click between pages
 * calls no server function (C23) and loads no compiled MDX. The data the browser holds for the
 * first page carries no body (the document has it), so a page's data is dropped once the reader
 * leaves it (`gcTime: 0`) and a return reads the document again; it never goes stale while the
 * page is open (the docs change with a deployment alone). A path that names no page draws the
 * docs layout with the three closest pages and answers 404.
 */
export const Route = createFileRoute('/docs/$')({
  codeSplitGroupings: [['loader', 'component', 'notFoundComponent']],
  staleTime: Infinity,
  gcTime: 0,
  loader: async ({ params }) => {
    const data = await loadDocsPage(slugsOf(params._splat));
    if (data === undefined) throw notFound();
    return data;
  },
  head: ({ loaderData }) => docsHead(loaderData),
  component: DocsPageRoute,
  notFoundComponent: DocsMiss,
});

function DocsPageRoute() {
  return <DocsArticle data={Route.useLoaderData()} />;
}
