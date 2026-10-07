import { useLocation } from '@tanstack/react-router';
import { Suspense, lazy, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Icon } from '@turboslide/chrome/icons';
import { useLayer } from '@turboslide/chrome/Layer';
import { ThemeButton } from '@turboslide/chrome/ThemeButton';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { source } from '../../docs/source';
import { RouterLinkSlot } from '../../routes/-link-slot';
import { PageFrame } from '../home/PageFrame';
import { useMountEffect } from '../useMountEffect';
import { DocsSidebar } from './DocsSidebar';
import { PathLink } from './mdx';

const SearchWindow = lazy(() => import('./SearchWindow'));

/** The docs' words outside the pages (docs/POLISH-2.md 5.6). */
export const DOCS_WORDS = {
  documentation: 'Documentation',
  search: 'Search the documentation',
  searchShort: 'Search',
  newPresentation: 'New Presentation',
  menu: 'Menu',
} as const;

/** The path of a docs address without a trailing slash, the form the page tree's urls take. */
export function docsPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/**
 * The docs layout (docs/POLISH-2.md 5.6): the page frame of the plain pages (PageFrame.tsx: the
 * 1104 px column, its rails, the 58 px bar with the lockup) with the docs' controls in the bar's
 * slot: a hairline and Documentation, the search pill, the shared theme button and New
 * Presentation. Under the bar the sidebar and the page (the route's outlet: the article and its
 * table of contents). Under 720 px the sidebar leaves the column for a Pages button that opens it
 * as a sheet (`.pt-window` on the dialog layer), the search pill becomes an icon button and
 * Documentation leaves the bar; under 560 px New Presentation leaves it too.
 *
 * Cmd+K, Ctrl+K and / open the search; the window and the index load on the first open.
 */
export function DocsShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const current = docsPath(location.pathname);
  const tree = source.getPageTree();
  const [searching, setSearching] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [mac, setMac] = useState(true);
  const opener = useRef<HTMLElement | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  const openSearch = (): void => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSheet(false);
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

  const bar = (
    <>
      <span className="ts-docs-bar-rule" aria-hidden="true" />
      <PathLink to="/docs" className="ts-docs-bar-title" data-control="docs.bar.documentation">
        {DOCS_WORDS.documentation}
      </PathLink>
      <span className="ts-docs-bar-end">
        <button
          type="button"
          className="pt-ib ts-docs-search"
          data-control="docs.search.open"
          aria-label={DOCS_WORDS.search}
          aria-haspopup="dialog"
          onClick={openSearch}
          {...tipProps({ name: DOCS_WORDS.search, key: mac ? '⌘K' : 'Ctrl+K' })}
        >
          <Icon name="search" />
          <span className="ts-docs-search-label is-long">{DOCS_WORDS.search}</span>
          <span className="ts-docs-search-label is-short">{DOCS_WORDS.searchShort}</span>
          <kbd className="pt-kbd ts-docs-search-key">{mac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <ThemeButton className="ts-docs-theme" />
        <PathLink to="/new" className="pt-ib is-solid ts-docs-new" data-control="docs.bar.new">
          {DOCS_WORDS.newPresentation}
        </PathLink>
        <button
          ref={menuButton}
          type="button"
          className="pt-ib pt-icon ts-docs-pages"
          data-control="docs.menu"
          aria-label={DOCS_WORDS.menu}
          aria-haspopup="dialog"
          aria-expanded={sheet}
          onClick={() => setSheet((was) => !was)}
          {...tipProps({ name: DOCS_WORDS.menu, doc: 'Every page of the documentation.' })}
        >
          <Icon name="bars-3" />
        </button>
      </span>
    </>
  );

  return (
    <PageFrame className="ts-docs" control="docs" linkComponent={RouterLinkSlot} bar={bar}>
      <div className="ts-docs-body">
        <aside className="ts-docs-side pt-scroll">
          <DocsSidebar tree={tree} current={current} />
        </aside>
        {children}
      </div>
      {sheet ? (
        <PagesSheet
          onClose={(refocus) => {
            setSheet(false);
            if (refocus) menuButton.current?.focus();
          }}
        >
          <DocsSidebar
            tree={tree}
            current={current}
            control="docs.sheet.nav"
            onNavigate={() => setSheet(false)}
          />
        </PagesSheet>
      ) : null}
      {searching ? (
        <Suspense fallback={null}>
          <SearchWindow onClose={closeSearch} />
        </Suspense>
      ) : null}
    </PageFrame>
  );
}

/** The sidebar on a phone: a window under the bar on the dialog layer, over the scrim. */
function PagesSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: (refocus: boolean) => void;
}) {
  const scrim = useRef<HTMLDivElement>(null);
  useLayer(scrim, { layer: 'dialog' });
  useMountEffect(() => {
    const current = scrim.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]');
    (current ?? scrim.current?.querySelector<HTMLAnchorElement>('a'))?.focus();
  });
  return (
    <div
      ref={scrim}
      className="ts-docs-scrim is-sheet"
      data-control="docs.sheet.scrim"
      onPointerDown={(event) => {
        if (event.target === scrim.current) onClose(false);
      }}
    >
      <div
        className="ts-docs-sheet pt-window pt-scroll"
        role="dialog"
        aria-modal="true"
        aria-label="Documentation pages"
        data-control="docs.sheet"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          onClose(true);
        }}
      >
        {children}
      </div>
    </div>
  );
}
