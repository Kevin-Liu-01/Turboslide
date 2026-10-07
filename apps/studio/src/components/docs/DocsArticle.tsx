import { useLocation } from '@tanstack/react-router';
import { Suspense, use } from 'react';

import { SITE } from '@turboslide/theme/brand/site';

import { twinUrl } from '../../docs/paths';
import type { DocsPageData } from '../../docs/paths';
import { closestPages, neighbours, source } from '../../docs/source';
import type { DocsPage } from '../../docs/source';
import { CopyPage } from './CopyPage';
import { docsPath } from './DocsShell';
import { DOCS_COMPONENTS, PathLink } from './mdx';

export function pageData(page: DocsPage): DocsPageData {
  return {
    url: page.url,
    slugs: page.slugs,
    title: page.data.title,
    description: page.data.description ?? '',
    twin: twinUrl(page.slugs),
    file: page.path,
  };
}

/**
 * The loader of /docs and /docs/$ (docs/POLISH-2.md 5.2, C23), isomorphic: the page is found in
 * the frontmatter this module already holds and its body chunk is fetched by `preload()`, in the
 * prerender and in the browser alike, so a click between docs pages requests that page's chunk
 * and calls no server function. Undefined for a path that names no page.
 */
export async function loadDocsPage(slugs: string[]): Promise<DocsPageData | undefined> {
  const page = source.getPage(slugs);
  if (page === undefined) return undefined;
  await page.data.preload();
  return pageData(page);
}

const REPOSITORY_CONTENT = `${SITE.repository}/edit/main/apps/studio/content/docs`;

/** The pages a generator writes (the action reference, the shortcuts and the grammar): no edit link. */
const GENERATED_FILES = /^(?:reference\/|shortcuts\.mdx$|agents\/grammar\.mdx$)/;

/**
 * A docs page (docs/POLISH-2.md 5.6): the header (the title in sentence case, the description,
 * Copy Page), the article's body in the MDX components, the table of contents from 1180 px, then
 * previous and next in the sidebar's order and the repository's two links. The body and the table
 * of contents come from the page's chunk; on a first load they are in the server's HTML and
 * hydrate when the chunk arrives.
 */
export function DocsArticle({ data }: { data: DocsPageData }) {
  const page = source.getPage(data.slugs);
  const { previous, next } = neighbours(data.url);
  return (
    <div className="ts-docs-page" data-control="docs.page" data-page={data.url}>
      <article className="ts-docs-article">
        <header className="ts-docs-head">
          <h1 className="ts-docs-title">{data.title}</h1>
          {data.description === '' ? null : <p className="ts-docs-lead">{data.description}</p>}
          <CopyPage twin={data.twin} reference={data.slugs[0] === 'reference'} />
        </header>
        {page === undefined ? null : (
          <Suspense fallback={null}>
            <Body page={page} />
          </Suspense>
        )}
        <footer className="ts-docs-foot">
          {previous === undefined && next === undefined ? null : (
            <nav className="ts-docs-pager" aria-label="Previous and next">
              {previous === undefined ? (
                <span />
              ) : (
                <PathLink
                  to={previous.url}
                  className="ts-docs-pager-link pt-window"
                  data-control="docs.previous"
                >
                  <span className="ts-docs-pager-dir">Previous</span>
                  <span className="ts-docs-pager-title">{previous.data.title}</span>
                </PathLink>
              )}
              {next === undefined ? null : (
                <PathLink
                  to={next.url}
                  className="ts-docs-pager-link is-next pt-window"
                  data-control="docs.next"
                >
                  <span className="ts-docs-pager-dir">Next</span>
                  <span className="ts-docs-pager-title">{next.data.title}</span>
                </PathLink>
              )}
            </nav>
          )}
          <p className="ts-docs-repo">
            {GENERATED_FILES.test(data.file) ? null : (
              <a
                className="pt-ib"
                href={`${REPOSITORY_CONTENT}/${data.file}`}
                target="_blank"
                rel="noopener"
                data-control="docs.edit"
              >
                Edit This Page
              </a>
            )}
            <a
              className="pt-ib"
              href={`${SITE.repository}/issues/new?title=${encodeURIComponent(`Docs: ${data.title}`)}`}
              target="_blank"
              rel="noopener"
              data-control="docs.report"
            >
              Report an Issue
            </a>
          </p>
        </footer>
      </article>
      {page === undefined ? null : (
        <Suspense fallback={null}>
          <Contents page={page} />
        </Suspense>
      )}
    </div>
  );
}

function Body({ page }: { page: DocsPage }) {
  const Content = page.data.body;
  return (
    <div className="ts-docs-body-text">
      <Content components={DOCS_COMPONENTS} />
    </div>
  );
}

function Contents({ page }: { page: DocsPage }) {
  const { toc } = use(page.data.load());
  const items = toc.filter((item) => item.depth <= 3);
  if (items.length === 0) return <aside className="ts-docs-toc" />;
  return (
    <aside className="ts-docs-toc" aria-label="On this page" data-control="docs.toc">
      <p className="ts-docs-toc-head">On this page</p>
      <ul className="pt-scroll">
        {items.map((item) => (
          <li key={item.url} data-depth={item.depth}>
            <a href={item.url}>{item.title}</a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * A miss under /docs (docs/POLISH-2.md 5.2): the docs layout with a heading, one sentence and the
 * three pages whose address or title is closest to the one asked for.
 */
export function DocsMiss() {
  const location = useLocation();
  const closest = closestPages(docsPath(location.pathname));
  return (
    <div className="ts-docs-page" data-control="docs.miss">
      <article className="ts-docs-article">
        <header className="ts-docs-head">
          <h1 className="ts-docs-title">Not found</h1>
          <p className="ts-docs-lead">
            No documentation page is at this address. These pages have the closest names.
          </p>
        </header>
        <ul className="ts-docs-cards">
          {closest.map((page) => (
            <li key={page.url}>
              <PathLink
                to={page.url}
                className="ts-docs-card pt-window"
                data-control="docs.miss.page"
              >
                <span className="ts-docs-card-title">{page.data.title}</span>
                <span className="ts-docs-card-text">{page.data.description}</span>
              </PathLink>
            </li>
          ))}
        </ul>
      </article>
      <aside className="ts-docs-toc" />
    </div>
  );
}
