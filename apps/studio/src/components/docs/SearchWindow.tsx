import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import { Icon } from '@turboslide/chrome/icons';
import { useLayer } from '@turboslide/chrome/Layer';

import { SEARCH_INDEX_URL, rank } from '../../docs/search';
import type { SearchHit, SearchIndex } from '../../docs/search';
import { useMountEffect } from '../useMountEffect';

/** The index, fetched on the first open and kept for the visit. */
let loading: Promise<SearchIndex> | null = null;

function loadIndex(): Promise<SearchIndex> {
  loading ??= fetch(SEARCH_INDEX_URL).then((response) => {
    if (!response.ok) throw new Error(`${SEARCH_INDEX_URL} answered ${response.status}`);
    return response.json() as Promise<SearchIndex>;
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * The search window (docs/POLISH-2.md 5.5): an 8 px window (`.pt-window`) over the scrim on the
 * dialog layer, loaded with its index on the first open (`React.lazy` in DocsShell.tsx and one
 * fetch here). The field has the focus; the hits update as the reader types; Up and Down move the
 * selection, Enter opens the selected hit (the first by default) at its heading, Escape closes and
 * puts the focus back where it was.
 */
export default function SearchWindow({ onClose }: { onClose: () => void }) {
  const scrim = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  useLayer(scrim, { layer: 'dialog' });
  useMountEffect(() => {
    field.current?.focus();
    let live = true;
    loadIndex().then(
      (loaded) => {
        if (live) setIndex(loaded);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  });
  const hits: SearchHit[] = index === null ? [] : rank(index, query);
  const open = (hit: SearchHit | undefined): void => {
    if (hit === undefined) return;
    onClose();
    void navigate({
      to: hit.row.u as '/docs',
      ...(hit.row.a === '' ? {} : { hash: hit.row.a }),
    });
  };
  const status = failed
    ? 'The search index did not load. Close the search and try again.'
    : index === null
      ? 'Loading the index.'
      : query.trim() === ''
        ? 'Type a word from the documentation.'
        : hits.length === 0
          ? 'No page matches these words.'
          : `${hits.length} ${hits.length === 1 ? 'result' : 'results'}.`;
  return (
    <div
      ref={scrim}
      className="ts-docs-scrim"
      data-control="docs.search.scrim"
      onPointerDown={(event) => {
        if (event.target === scrim.current) onClose();
      }}
    >
      <div
        className="ts-docs-search-window pt-window"
        role="dialog"
        aria-modal="true"
        aria-label="Search the documentation"
        data-control="docs.search.window"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          else if (event.key === 'ArrowDown') setAt((was) => Math.min(was + 1, hits.length - 1));
          else if (event.key === 'ArrowUp') setAt((was) => Math.max(was - 1, 0));
          else if (event.key === 'Enter') open(hits[at] ?? hits[0]);
          else return;
          event.preventDefault();
        }}
      >
        <label className="ts-docs-search-field">
          <Icon name="search" />
          <input
            ref={field}
            type="search"
            value={query}
            placeholder="Search the documentation"
            aria-label="Search the documentation"
            aria-controls="ts-docs-search-hits"
            data-control="docs.search.field"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setAt(0);
            }}
          />
        </label>
        <p className="ts-docs-search-status" role="status">
          {status}
        </p>
        {hits.length > 0 ? (
          <ul className="ts-docs-search-hits pt-scroll" id="ts-docs-search-hits">
            {hits.map((hit, index_) => (
              <li key={`${hit.row.u}#${hit.row.a}`}>
                <a
                  href={hit.row.a === '' ? hit.row.u : `${hit.row.u}#${hit.row.a}`}
                  className="ts-docs-search-hit"
                  data-control="docs.search.hit"
                  aria-current={index_ === at ? 'true' : undefined}
                  onMouseMove={() => setAt(index_)}
                  onClick={(event) => {
                    event.preventDefault();
                    open(hit);
                  }}
                >
                  <span className="ts-docs-search-head">
                    {hit.row.h}
                    {hit.row.a === '' ? null : (
                      <span className="ts-docs-search-page">{hit.row.t}</span>
                    )}
                  </span>
                  {hit.excerpt === '' ? null : (
                    <span className="ts-docs-search-text">{hit.excerpt}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
