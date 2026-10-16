import { useLocation } from '@tanstack/react-router';
import { Suspense, isValidElement, use, useState } from 'react';
import type { ReactNode } from 'react';

import { SITE } from '@turboslide/theme/brand/site';

import { twinUrl } from '../../docs/paths';
import type { DocsPageData } from '../../docs/paths';
import { closestPages, neighbours, source } from '../../docs/source';
import type { DocsPage } from '../../docs/source';
import { SiteIcon } from '../site/SiteIcon';
import { useMountEffect } from '../useMountEffect';
import { CopyPage } from './CopyPage';
import { docsPath } from './DocsShell';
import { navName } from './DocsSidebar';
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

/** The page tools' words: Copy Page is a button (Title Case), the others are links. */
export const TOOL_WORDS = {
  group: 'Page tools',
  markdown: 'View as Markdown',
  edit: 'Edit this page',
  report: 'Report an issue',
  onThisPage: 'On this page',
  previous: 'Previous',
  next: 'Next',
  pager: 'Previous and next page',
} as const;

/**
 * A docs page in the Workbench reference (docs/SITE.md section 6; plan E.3): the header (the
 * title at the Title step, the description as the lead, nothing else: no tool row between the
 * lead and the body, no capital label above the title), the article's body in the MDX components,
 * then the on this page column (the numbered h2 entries with the current one in ink, then the page
 * tools: Copy Page, View as Markdown, Edit this page, Report an issue), then previous and next on
 * a hair rule. The three are one grid (docs.css): from 1280 px the column sits beside the article
 * and stays in view; under it the tools move under the article and the entries leave. The body and
 * the entries come from the page's chunk; on a first load they are in the server's HTML and
 * hydrate when the chunk arrives. The page is keyed by its address, so a move to another page
 * starts its entries over.
 */
export function DocsArticle({ data }: { data: DocsPageData }) {
  const page = source.getPage(data.slugs);
  const { previous, next } = neighbours(data.url);
  return (
    <div className="ts-docs-page" data-control="docs.page" data-page={data.url} key={data.url}>
      <article className="ts-docs-article">
        <header className="ts-docs-head">
          <h1 className="ts-docs-title t-title">{data.title}</h1>
          {data.description === '' ? null : (
            <p className="ts-docs-lead t-lead">{data.description}</p>
          )}
          {data.url === '/docs' ? <Facts /> : null}
        </header>
        {page === undefined ? null : (
          <Suspense fallback={null}>
            <Body page={page} />
          </Suspense>
        )}
      </article>
      <div className="ts-docs-aside">
        {page === undefined ? null : (
          <Suspense fallback={null}>
            <Contents page={page} />
          </Suspense>
        )}
        <PageTools data={data} />
      </div>
      {previous === undefined && next === undefined ? null : (
        <nav className="ts-docs-pager" aria-label={TOOL_WORDS.pager}>
          {previous === undefined ? (
            <span />
          ) : (
            <PathLink
              to={previous.url}
              className="ts-docs-pager-link is-previous"
              data-control="docs.previous"
            >
              <span className="t-label site-label">
                <SiteIcon name="arrow-left" />
                {TOOL_WORDS.previous}
              </span>
              <span className="ts-docs-pager-title">
                {navName(previous.url, previous.data.title)}
              </span>
            </PathLink>
          )}
          {next === undefined ? null : (
            <PathLink to={next.url} className="ts-docs-pager-link is-next" data-control="docs.next">
              <span className="t-label site-label">
                {TOOL_WORDS.next}
                <SiteIcon name="arrow-right" />
              </span>
              <span className="ts-docs-pager-title">{navName(next.url, next.data.title)}</span>
            </PathLink>
          )}
        </nav>
      )}
    </div>
  );
}

/**
 * The front page's three facts under its lead (plan E.6), counted from the page tree, never
 * typed: the written pages, the reference pages the generator writes from the action table, and
 * the Markdown copy every page has.
 */
function Facts() {
  const pages = source.getPages();
  const reference = pages.filter((page) => page.slugs[0] === 'reference' && page.slugs.length > 1);
  const written = pages.filter((page) => page.slugs[0] !== 'reference');
  return (
    <ul className="ts-docs-facts t-small" data-control="docs.facts">
      <li>
        <b className="pt-num">{written.length}</b> articles
      </li>
      <li>
        <b className="pt-num">{reference.length}</b> reference pages made from the action table
      </li>
      <li>A Markdown copy of every page</li>
    </ul>
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

/**
 * On this page: the h2 entries numbered as their sections are (docs.css counters), the grammar
 * page's h3 entries indented under them, and the entry of the section the reader is in drawn in
 * ink (`aria-current="true"`): the last h2 whose top has passed 120 px under the window's top, or
 * the last one once the page is scrolled to its end.
 */
function Contents({ page }: { page: DocsPage }) {
  const { toc } = use(page.data.load());
  const items = toc.filter((item) => item.depth <= 3);
  const [here, setHere] = useState('');
  useMountEffect(() => {
    let frame = 0;
    const read = (): void => {
      frame = 0;
      const heads = [
        ...document.querySelectorAll<HTMLElement>('.ts-docs-body-text .ts-docs-sec > h2[id]'),
      ];
      let at = heads[0]?.id ?? '';
      for (const head of heads) if (head.getBoundingClientRect().top <= 120) at = head.id;
      const end = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (end && heads.length > 0) at = heads[heads.length - 1]?.id ?? at;
      setHere(at);
    };
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  });
  if (items.length === 0) return null;
  return (
    <nav className="ts-docs-toc" aria-label={TOOL_WORDS.onThisPage} data-control="docs.toc">
      <p className="t-label">{TOOL_WORDS.onThisPage}</p>
      <ol>
        {items.map((item) => (
          <li key={item.url} data-depth={item.depth}>
            <a
              href={item.url}
              {...(item.url === `#${here}` ? { 'aria-current': 'true' as const } : {})}
            >
              <span>{breakable(item.title)}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * An action's id in the entries (`slide.setBackgroundMaterial`) may break after its group's dot
 * alone, so a long one reads "slide." over "setBackgroundMaterial" and never loses a letter or two
 * to the next line (VERIFICATION.md, polish two pass 2 finding 2).
 */
function breakable(title: ReactNode): ReactNode {
  const action = /^([a-z]+\.)([A-Za-z]+)$/.exec(plainText(title));
  if (action === null) return title;
  return (
    <>
      {action[1]}
      <wbr />
      {action[2]}
    </>
  );
}

/** The words of an entry's title, which the MDX compiler hands over as a string or an element. */
function plainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
  return '';
}

/**
 * The page tools (plan E.3; D5 of the brief: no tool row before the content): Copy Page with its
 * menu of the agents' addresses, the Markdown twin, the source file on GitHub (not for a page a
 * generator writes) and a new issue named after the page. Each carries its solid icon.
 */
function PageTools({ data }: { data: DocsPageData }) {
  return (
    <div
      className="ts-docs-tools t-small"
      role="group"
      aria-label={TOOL_WORDS.group}
      data-control="docs.tools"
    >
      <CopyPage twin={data.twin} reference={data.slugs[0] === 'reference'} />
      <a className="ts-docs-tool" href={data.twin} data-control="docs.markdown">
        <SiteIcon name="document-text" />
        {TOOL_WORDS.markdown}
      </a>
      {GENERATED_FILES.test(data.file) ? null : (
        <a
          className="ts-docs-tool"
          href={`${REPOSITORY_CONTENT}/${data.file}`}
          target="_blank"
          rel="noopener"
          data-control="docs.edit"
        >
          <SiteIcon name="pencil-square" />
          {TOOL_WORDS.edit}
        </a>
      )}
      <a
        className="ts-docs-tool"
        href={`${SITE.repository}/issues/new?title=${encodeURIComponent(`Docs: ${data.title}`)}`}
        target="_blank"
        rel="noopener"
        data-control="docs.report"
      >
        <SiteIcon name="chat-bubble-left-right" />
        {TOOL_WORDS.report}
      </a>
    </div>
  );
}

/**
 * A miss under /docs (docs/POLISH-2.md 5.2): the docs layout with a heading, one sentence and the
 * three pages whose address or title is closest to the one asked for, as index rows.
 */
export function DocsMiss() {
  const location = useLocation();
  const closest = closestPages(docsPath(location.pathname));
  return (
    <div className="ts-docs-page" data-control="docs.miss">
      <article className="ts-docs-article">
        <header className="ts-docs-head">
          <h1 className="ts-docs-title t-title">Not found</h1>
          <p className="ts-docs-lead t-lead">
            No documentation page is at this address. These pages have the closest names.
          </p>
        </header>
        <div className="ts-docs-body-text">
          <ul className="ts-docs-index">
            {closest.map((page) => (
              <li key={page.url}>
                <PathLink to={page.url} className="ts-docs-index-row" data-control="docs.miss.page">
                  <span className="ts-docs-index-title">{navName(page.url, page.data.title)}</span>
                  <span className="ts-docs-index-text">{page.data.description}</span>
                </PathLink>
              </li>
            ))}
          </ul>
        </div>
      </article>
    </div>
  );
}
