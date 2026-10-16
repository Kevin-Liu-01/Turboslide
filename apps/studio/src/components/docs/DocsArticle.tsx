import { useLocation, useRouter } from '@tanstack/react-router';
import { Suspense, isValidElement, useCallback, useState } from 'react';
import type { ReactNode } from 'react';

import { SITE } from '@turboslide/theme/brand/site';

import { twinUrl } from '../../docs/paths';
import type { DocsPageData, DocsTocEntry } from '../../docs/paths';
import { closestPages, neighbours, source } from '../../docs/source';
import type { DocsPage } from '../../docs/source';
import { Keyed } from '../site/Keyed';
import { SiteIcon } from '../site/SiteIcon';
import { useMountEffect } from '../useMountEffect';
import { CopyPage } from './CopyPage';
import { docsPath } from './DocsShell';
import { navName } from './DocsSidebar';
import { DOCS_COMPONENTS, PathLink } from './mdx';
import { revealIn } from './reveal';
import { fetchArticle, onBodyClick, onBodyKeyDown, watchTables } from './static-body';

export function pageData(page: DocsPage, toc: DocsTocEntry[] = []): DocsPageData {
  return {
    url: page.url,
    slugs: page.slugs,
    title: page.data.title,
    description: page.data.description ?? '',
    twin: twinUrl(page.slugs),
    file: page.path,
    toc,
  };
}

/**
 * The loader of /docs and /docs/$ (docs/POLISH-2.md 5.2, C23; hardening HR-PC#5, PERF-11): the
 * page is found in the frontmatter this module already holds. On the server (the prerender) the
 * page's body chunk is loaded and its on this page entries go into the data as words; the body
 * itself is drawn by the component into the document and never into the payload. In the
 * browser the body and its entries are read from the page's prerendered document, so a click
 * between docs pages fetches that file, loads no compiled MDX and calls no server function.
 * Undefined for a path that names no page.
 */
export async function loadDocsPage(slugs: string[]): Promise<DocsPageData | undefined> {
  const page = source.getPage(slugs);
  if (page === undefined) return undefined;
  if (import.meta.env.SSR) {
    const { toc } = await page.data.load();
    return pageData(
      page,
      toc
        .filter((item) => item.depth <= 3)
        .map((item) => ({ url: item.url, title: plainText(item.title), depth: item.depth })),
    );
  }
  const article = await fetchArticle(page.url);
  return { ...pageData(page, article.toc), html: article.html };
}

const REPOSITORY_CONTENT = `${SITE.repository}/edit/main/apps/studio/content/docs`;

/**
 * The key words of a page's title drawn in the site accent (Keyed.tsx), as every site page's head
 * draws its own: the front page's.
 */
const TITLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  '/docs': ['documentation'],
};

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
 * and stays in view; under it the tools move under the article and the entries leave. The body is
 * static HTML in the browser (Body below); the entries come from the loader's data. The page is
 * keyed by its address, so a move to another page starts its entries over.
 */
export function DocsArticle({ data }: { data: DocsPageData }) {
  const { previous, next } = neighbours(data.url);
  return (
    <div className="ts-docs-page" data-control="docs.page" data-page={data.url} key={data.url}>
      <article className="ts-docs-article">
        <header className="ts-docs-head">
          <h1 className="ts-docs-title t-title">
            <Keyed text={data.title} keys={TITLE_KEYS[data.url] ?? []} />
          </h1>
          {data.description === '' ? null : (
            <p className="ts-docs-lead t-lead">{data.description}</p>
          )}
          {data.url === '/docs' ? <Facts /> : null}
        </header>
        <Body data={data} />
      </article>
      <div className="ts-docs-aside">
        <Contents toc={data.toc} />
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

/** The body's tables watched while the body is in the page (the page is keyed by its address). */
const watchBody = (node: HTMLDivElement | null): (() => void) | undefined =>
  node === null ? undefined : watchTables(node);

/**
 * The article's body (hardening HR-PC#5, PERF-11). The server draws it from the page's compiled
 * MDX in the MDX components, its Suspense boundary inside the element. The browser never draws
 * it: on the first load it keeps the server's children (an element whose HTML is given is not
 * hydrated below itself), and after a move it sets the HTML the loader read from the page's
 * document. Copy, the tabs and the links to this site's pages run from the element's two
 * handlers (static-body.ts), and a table that scrolls becomes a region Tab reaches (`watchTables`).
 */
function Body({ data }: { data: DocsPageData }) {
  const router = useRouter();
  if (import.meta.env.SSR) {
    const page = source.getPage(data.slugs);
    const Content = page?.data.body;
    return (
      <div className="ts-docs-body-text">
        {Content === undefined ? null : (
          <Suspense fallback={null}>
            <Content components={DOCS_COMPONENTS} />
          </Suspense>
        )}
      </div>
    );
  }
  return (
    <div
      className="ts-docs-body-text"
      ref={watchBody}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: data.html ?? '' }}
      onClick={(event) => onBodyClick(event.nativeEvent, (href) => void router.navigate({ href }))}
      onKeyDown={(event) => onBodyKeyDown(event.nativeEvent)}
    />
  );
}

/**
 * On this page: the h2 entries numbered as their sections are (docs.css counters), the grammar
 * page's h3 entries indented under them, and the entry of the section the reader is in drawn in
 * ink (`aria-current="true"`): the last h2 whose top has passed 120 px under the window's top, or
 * the last one once the page is scrolled to its end.
 */
function Contents({ toc: items }: { toc: DocsTocEntry[] }) {
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
  /* the column scrolls on its own when its entries run past the window (a reference page has
     27): it keeps the reader's section in view (a new ref for each section) */
  const toc = useCallback(
    (nav: HTMLElement | null): void => {
      const column = nav?.closest<HTMLElement>('.ts-docs-aside');
      if (nav !== null && column !== null && column !== undefined && here !== '')
        revealIn(column, nav.querySelector(`a[href="#${CSS.escape(here)}"]`), 'nearest');
    },
    [here],
  );
  if (items.length === 0) return null;
  return (
    <nav
      className="ts-docs-toc"
      aria-label={TOOL_WORDS.onThisPage}
      data-control="docs.toc"
      ref={toc}
    >
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
