import { useLocation } from '@tanstack/react-router';
import { Suspense, lazy, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/* the base glyphs alone, without the editor's set (hardening HR-PC#2) */
import { Icon } from '@turboslide/chrome/icons-base';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { source } from '../../docs/source';
import { SiteBar } from '../site/SiteBar';
import { SiteFooter } from '../site/SiteFooter';
import { SiteLink } from '../site/SiteLink';
import { useMountEffect } from '../useMountEffect';
import { DocsSidebar, placeOf } from './DocsSidebar';

const SearchWindow = lazy(() => import('./SearchWindow'));

/** The docs' words outside the pages (docs/SITE.md section 6). */
export const DOCS_WORDS = {
  documentation: 'Documentation',
  search: 'Search the documentation',
  contents: 'Contents',
  in: 'in',
} as const;

/** The path of a docs address without a trailing slash, the form the page tree's urls take. */
export function docsPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/**
 * The docs layout in the Workbench reference (docs/SITE.md section 6; plan E.1): the site's root
 * `.ts-site` with the docs' own class, the site's bar with the docs' slot (a hairline,
 * Documentation and the 288 px search field), then three columns across the 1280 px column: the
 * navigation (224 px), the page (the route's outlet: the article, 720 px, and its on this page
 * column, 208 px), then the site's footer. At 1024 to 1279 px the on this page column leaves and its
 * tools move under the article (docs.css); at 1023 px and under one column, where the navigation
 * becomes the Contents disclosure at the top of the page (a `<details>`, no sheet and no scrim) and
 * the search field becomes a 32 px button.
 *
 * Cmd+K, Ctrl+K and / open the search; the window and the index load on the first open.
 */
export function DocsShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const current = docsPath(location.pathname);
  const tree = source.getPageTree();
  const place = placeOf(tree, current);
  const [searching, setSearching] = useState(false);
  const [mac, setMac] = useState(true);
  const opener = useRef<HTMLElement | null>(null);
  const contents = useRef<HTMLDetailsElement>(null);

  const openSearch = (): void => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (contents.current !== null) contents.current.open = false;
    setSearching(true);
  };
  const closeSearch = (): void => {
    setSearching(false);
    opener.current?.focus();
  };

  useMountEffect(() => {
    /* the rows wait for this, as /home's wait for its own `data-hydrated` */
    document.querySelector('[data-control="docs"]')?.setAttribute('data-hydrated', '');
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const keys = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const chord =
        (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k';
      const slash =
        event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!chord && !slash) return;
      event.preventDefault();
      openSearch();
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });

  const slot = (
    <>
      <span className="site-bar-rule" aria-hidden="true" />
      <SiteLink href="/docs" control="docs.bar.documentation" className="ts-docs-crumb">
        {DOCS_WORDS.documentation}
      </SiteLink>
      <button
        type="button"
        className="ts-docs-search"
        data-control="docs.search.open"
        aria-label={DOCS_WORDS.search}
        aria-haspopup="dialog"
        onClick={openSearch}
        {...tipProps({ name: DOCS_WORDS.search, key: mac ? '⌘K' : 'Ctrl+K' })}
      >
        <Icon name="search" />
        <span className="ts-docs-search-label">{DOCS_WORDS.search}</span>
        <kbd className="pt-kbd ts-docs-search-key">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
    </>
  );

  return (
    <div className="ts-site ts-docs" id="top" data-control="docs">
      <SiteBar docs slot={slot} />
      <div className="site-wrap ts-docs-body">
        <aside className="ts-docs-side pt-scroll">
          <DocsSidebar tree={tree} current={current} />
        </aside>
        <main id="main" className="ts-docs-main">
          <details ref={contents} className="ts-docs-contents" data-control="docs.contents">
            <summary className="t-small">
              <span className="ts-docs-contents-here">
                {place === null ? (
                  DOCS_WORDS.documentation
                ) : (
                  <>
                    <b>{place.name}</b>
                    {place.group === undefined ? null : ` ${DOCS_WORDS.in} ${place.group}`}
                  </>
                )}
              </span>
              <span className="t-label">{DOCS_WORDS.contents}</span>
            </summary>
            <DocsSidebar
              tree={tree}
              current={current}
              control="docs.contents.nav"
              onNavigate={() => {
                if (contents.current !== null) contents.current.open = false;
              }}
            />
          </details>
          {children}
        </main>
      </div>
      <SiteFooter />
      {searching ? (
        <Suspense fallback={null}>
          <SearchWindow onClose={closeSearch} />
        </Suspense>
      ) : null}
    </div>
  );
}
