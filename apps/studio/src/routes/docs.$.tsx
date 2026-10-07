import { createFileRoute, notFound } from '@tanstack/react-router';

import { DocsArticle, DocsMiss, loadDocsPage } from '../components/docs/DocsArticle';
import { docsHead, slugsOf } from '../docs/paths';

/**
 * A docs page, /docs/<path> (docs/POLISH-2.md 5.2): the loader finds the page in the collection's
 * frontmatter and fetches its body chunk, in the prerender and in the browser alike, and calls no
 * server function (C23). The loader shares the component's chunk, which the page hydrates with, so
 * the next click fetches the next page's body chunk alone. A path that names no page draws the
 * docs layout with the three closest pages and answers 404.
 */
export const Route = createFileRoute('/docs/$')({
  codeSplitGroupings: [['loader', 'component', 'notFoundComponent']],
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
