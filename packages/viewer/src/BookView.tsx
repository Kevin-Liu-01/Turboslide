import type { MouseEvent, ReactNode } from 'react';
import { Fragment, useLayoutEffect, useMemo, useRef } from 'react';

import { LiveClone } from './LiveClone';
import { pad2, trimTitle } from './model';
import type { ViewerDeck, ViewerSection } from './model';
import type { Theme } from './theme';

import './BookView.css';

/** One row of the head's meta table: `Sections` and `8`, `Updated` and `September 2026`. */
export type BookMetaEntry = { key: string; value: string };

export type BookHeadProps = {
  title: string;
  lead?: ReactNode;
  /** the rows of the ruled table at the right of the title, top to bottom */
  meta?: readonly BookMetaEntry[];
};

/** the band in the middle of the book that decides the active page (tail.html buildBook, SPEC 5.5) */
const IO_ROOT_MARGIN = '-42% 0px -42% 0px';
const IO_THRESHOLDS = [0, 0.25, 0.5, 1];

/** 1-based positions in the deck */
type PageRange = { first: number; last: number };

type Block = { section: ViewerSection; range: PageRange; ordinal: number };

function rangeText(range: PageRange): string {
  return range.last > range.first
    ? `${pad2(range.first)} to ${pad2(range.last)}`
    : pad2(range.first);
}

function dividerText(range: PageRange): string {
  return range.last > range.first
    ? `Slides ${pad2(range.first)} to ${pad2(range.last)}`
    : `Slide ${pad2(range.first)}`;
}

/**
 * The masthead of a book: the title and its lead at the left, the meta as
 * a ruled mini table at the right, top-aligned with the title, and one
 * structural rule (--pt-hair, never ink) under both. Ported from
 * Prototemplate BookView.tsx BookHead.
 */
export function BookHead({ title, lead, meta }: BookHeadProps) {
  return (
    <header className="pt-book-head">
      <div className="pt-book-title">
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      {meta && meta.length > 0 ? (
        <dl className="pt-book-meta">
          {meta.map((row, i) => (
            <div key={`${i}-${row.key}`}>
              <dt>{row.key}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}

export type BookViewProps = {
  deck: ViewerDeck;
  active: string;
  theme: Theme;
  /** true while the book is the mode; the observer selects only then */
  isMode: boolean;
  /** the shell's select: updates the hash and the active item without scrolling here */
  onSelect: (slideId: string) => void;
  /** a click on a page opens it live in slide mode (tail.html buildBook) */
  onOpen: (slideId: string) => void;
  lead?: ReactNode;
  meta?: readonly BookMetaEntry[];
  label?: string;
};

/**
 * The deck read top to bottom (SPEC 5.5): a head, a contents list, then
 * every slide as a page under its section divider, with a 128px number
 * column and 16:9 page frames holding live clones. One IntersectionObserver
 * on the scroll region marks the page in the middle band (-42% root margin)
 * active and selects it through the shell on the next animation frame,
 * which updates the hash without scrolling the book; selections from
 * anywhere else (keys, sidebar, contents) scroll the page into view. Built
 * lazily on first entry: the shell mounts this component only once the
 * mode is book. Ported from tail.html buildBook and Prototemplate BookView.tsx.
 */
export function BookView({
  deck,
  active,
  theme,
  isMode,
  onSelect,
  onOpen,
  lead,
  meta,
  label = 'Book',
}: BookViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const isModeRef = useRef(isMode);
  isModeRef.current = isMode;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  /** the id the observer just selected, so the scroll effect leaves the reader's scroll alone */
  const fromScroll = useRef<string | null>(null);
  /** the active id the scroll effect last saw; null before the first run */
  const lastActive = useRef<string | null>(null);

  const byId = useMemo(() => new Map(deck.slides.map((slide) => [slide.id, slide])), [deck]);

  const blocks = useMemo<readonly Block[]>(() => {
    const out: Block[] = [];
    for (const section of deck.sections) {
      const first = byId.get(section.slideIds[0] ?? '');
      const last = byId.get(section.slideIds[section.slideIds.length - 1] ?? '');
      if (!first || !last) continue;
      out.push({ section, range: { first: first.n, last: last.n }, ordinal: out.length + 1 });
    }
    return out;
  }, [deck, byId]);

  const scrollToPage = (id: string, behavior: ScrollBehavior) => {
    const book = root.current;
    if (!book) return;
    for (const page of book.querySelectorAll<HTMLElement>('.pt-page')) {
      if (page.dataset.id !== id) continue;
      page.scrollIntoView({ block: 'start', behavior });
      return;
    }
  };

  /* the one observer for this view (directive 7.5): it reads every page and
     hands the winner to a frame callback, so a fast scroll that fires the
     observer several times a frame selects once, on the next paint */
  useLayoutEffect(() => {
    const book = root.current;
    if (!book || typeof IntersectionObserver === 'undefined') return;
    let frame = 0;
    let pending: string | null = null;
    const commit = () => {
      frame = 0;
      const id = pending;
      pending = null;
      if (!id || id === activeRef.current || !isModeRef.current) return;
      fromScroll.current = id;
      selectRef.current(id);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (!isModeRef.current) return;
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio))
            best = entry;
        }
        if (!best) return;
        const id = (best.target as HTMLElement).dataset.id;
        if (!id || id === activeRef.current) return;
        pending = id;
        if (!frame) frame = requestAnimationFrame(commit);
      },
      { root: book, rootMargin: IO_ROOT_MARGIN, threshold: IO_THRESHOLDS },
    );
    book.querySelectorAll<HTMLElement>('.pt-page').forEach((page) => observer.observe(page));
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [deck]);

  /* when the active item changes from outside the book, bring its page to
     the top. The first run is the mount, where the jump is instant; a change
     the observer caused is left alone. */
  useLayoutEffect(() => {
    const previous = lastActive.current;
    lastActive.current = active;
    if (previous === active) return;
    if (previous === null) {
      const slide = byId.get(active);
      if (slide && slide.n > 1) scrollToPage(active, 'instant');
      return;
    }
    if (fromScroll.current === active) {
      fromScroll.current = null;
      return;
    }
    scrollToPage(active, 'auto');
  }, [active, byId]);

  const onContents = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    if (id === activeRef.current) scrollToPage(id, 'auto');
    else onSelect(id);
  };

  const onPage = (e: MouseEvent<HTMLDivElement>, id: string) => {
    if ((e.target as Element).closest('a, button, input, textarea, select')) return;
    onOpen(id);
  };

  return (
    <div ref={root} className="pt-book pt-scroll" role="region" aria-label={label}>
      <div className="pt-book-in">
        <BookHead title={deck.title} lead={lead} meta={meta} />

        <nav className="pt-book-toc" aria-label="Contents">
          {blocks.map(({ section, range }) => {
            const first = section.slideIds[0] ?? '';
            return (
              <a key={section.id} href={`#${range.first}`} onClick={(e) => onContents(e, first)}>
                <span>{section.name}</span>
                <small>{rangeText(range)}</small>
              </a>
            );
          })}
        </nav>

        {blocks.map(({ section, range, ordinal }) => (
          <Fragment key={section.id}>
            <div className="pt-book-sec">
              <small>
                <span>Section {ordinal}</span>
                <span>{dividerText(range)}</span>
              </small>
              <h2>{section.name}</h2>
            </div>
            {section.slideIds.map((id) => {
              const slide = byId.get(id);
              if (!slide) return null;
              const on = slide.id === active;
              return (
                <article
                  key={slide.id}
                  className={on ? 'pt-page is-active' : 'pt-page'}
                  data-id={slide.id}
                >
                  <div className="pt-pn" data-preview={slide.id}>
                    <b>{pad2(slide.n)}</b>
                    <span>{trimTitle(slide.title)}</span>
                  </div>
                  <div className="pt-page-frame" onClick={(e) => onPage(e, slide.id)}>
                    <LiveClone html={slide.html} theme={theme} />
                  </div>
                </article>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
