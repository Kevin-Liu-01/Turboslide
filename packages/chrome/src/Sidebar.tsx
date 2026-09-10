import type { KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';

import { LiveClone } from '@turboslide/viewer/LiveClone';
import { useTheme } from '@turboslide/viewer/theme';

import { GtMark } from './GtMark';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import { Seg } from './Seg';
import type { SegOption } from './Seg';
import { usePtShell } from './shell-context';
import type { ShellDensity, ShellItem, ShellSection, ShellThumb } from './shell-data';
import { SidebarFilter as FilterRow } from './SidebarFilter';
import { ThumbShot } from './ThumbShot';
import { ToolButton } from './ToolButton';

import './Sidebar.css';

/** What ViewerShell reads from the filter for the Escape ladder: whether it holds text, and how to clear it. */
export type SidebarFilter = { active: boolean; clear: () => void };

/** Where the reader's folds live: one key per shell holding a JSON map of section id to open or closed. */
const STORAGE_KEY = 'gt-shell-groups';

/** What the arrow keys walk, in document order: headers and rows. */
const WALK = '.pt-grp-head, .pt-orow';

/** the distance a followed row keeps from the list's edges */
const FOLLOW_MARGIN = 8;

/* queue-list for the outline, photo for the thumbnails (SPEC 6.2 density Seg) */
const DENSITY_OPTIONS: readonly SegOption<ShellDensity>[] = [
  { value: 'outline', label: 'Outline', icon: 'queue-list', title: 'Outline' },
  { value: 'thumbs', label: 'Thumbnails', icon: 'photo', title: 'Thumbnails' },
];

/** The sprite symbol a row draws for its slide kind (SPEC 6.2: a kind glyph from the sprite). */
const KIND_GLYPH: Readonly<Record<string, string>> = {
  title: 'i-star',
  opener: 'i-rectangle-stack',
  mood: 'i-photo',
  statement: 'i-chat-bubble-left-right',
  content: 'i-document-text',
  closing: 'i-check-badge',
};

function glyphOf(item: ShellItem): string {
  return KIND_GLYPH[item.kind ?? 'content'] ?? 'i-document-text';
}

/** The filter's haystack for a row: title, section, id and the slide's text (SPEC 6.2: title, section and block text). */
function haystack(section: ShellSection, item: ShellItem): string {
  const text = item.html ? item.html.replace(/<[^>]+>/g, ' ') : '';
  return `${item.title} ${section.label} ${item.id} ${item.n ?? ''} ${text}`.toLowerCase();
}

/** True for a click the browser should keep: a new tab, a new window, a drag. */
function isModified(event: MouseEvent<HTMLElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

/** Smooth unless the reader asked for less motion. */
function scrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  } catch {
    return 'auto';
  }
}

/**
 * A stable ref callback for the current row: React calls it when the row
 * mounts or when a row becomes current, never on an unrelated render, so
 * the list scrolls only when the current row changes. Scrolls the list
 * alone, only when the row is out of view, and not before the shell has
 * applied the hash (ready). The sticky header above the row is kept clear
 * of it. The first follow after landing is the deep link's: a row out of
 * view is centered in the list; every later selection moves the minimum
 * distance.
 */
function makeFollow(listRef: RefObject<HTMLElement | null>, ready: RefObject<boolean>) {
  let landed = false;
  return (el: HTMLElement | null) => {
    const list = listRef.current;
    if (!el || !list || !ready.current) return;
    const head = el.closest('.pt-grp')?.querySelector<HTMLElement>('.pt-grp-head');
    const headH = head ? head.offsetHeight : 0;
    const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const bottom = top + el.offsetHeight;
    const above = top - headH < list.scrollTop;
    const below = bottom > list.scrollTop + list.clientHeight;
    const first = !landed;
    landed = true;
    if (!above && !below) return;
    if (first) {
      list.scrollTo({
        top: Math.max(0, top - (list.clientHeight - el.offsetHeight) / 2),
        behavior: 'auto',
      });
      return;
    }
    if (above) {
      list.scrollTo({ top: Math.max(0, top - headH - FOLLOW_MARGIN), behavior: scrollBehavior() });
    } else {
      list.scrollTo({
        top: bottom - list.clientHeight + FOLLOW_MARGIN,
        behavior: scrollBehavior(),
      });
    }
  };
}

/** Space activates a row as Enter does natively; stopped so the shell does not read it as next. */
function onRowSpace(event: KeyboardEvent<HTMLElement>, act: () => void): void {
  if (event.key !== ' ') return;
  event.preventDefault();
  event.stopPropagation();
  act();
}

/** A pointer press must not park focus on the row (ListRow.tsx pressWithoutFocus). */
function pressWithoutFocus(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused !== event.currentTarget) focused.blur();
}

/** The 64x36 live clone (or the static twins once the render worker has them), in its own frame. */
function Mini({ item, theme }: { item: ShellItem; theme: 'light' | 'dark' }) {
  return (
    <span className="pt-thumb-frame is-mini">
      {item.html ? (
        <LiveClone html={item.html} theme={theme} frame={false} />
      ) : (
        <ThumbShot item={item} />
      )}
    </span>
  );
}

type RowProps = {
  section: ShellSection;
  item: ShellItem;
  active: boolean;
  shots: boolean;
  theme: 'light' | 'dark';
  href: string;
  onPick: (item: ShellItem, event: MouseEvent<HTMLElement> | null) => void;
  follow?: (el: HTMLElement | null) => void;
};

/**
 * A 28px row (SPEC 6.2): the derived number in tabular figures, the kind
 * glyph from the sprite, the title trimmed to 72 characters, a lint badge at
 * severity 2 or 3 and a lease dot when another author holds the slide; 44px
 * in thumbnail density with a 64 by 36 clone in a --pt-edge frame. The row
 * is an anchor with the slide's own hash, so a modified click keeps the
 * browser's meaning, and carries data-preview for the hover preview layer.
 */
function TreeRow({ section, item, active, shots, theme, href, onPick, follow }: RowProps) {
  const lint = item.lint && (item.lint.s3 > 0 || item.lint.s2 > 0) ? item.lint : null;
  return (
    <a
      className={cn('pt-orow', active && 'is-active')}
      href={href}
      title={item.title}
      data-preview={item.id}
      data-id={item.id}
      aria-current={active ? 'true' : undefined}
      onMouseDown={pressWithoutFocus}
      onClick={(event) => onPick(item, event)}
      onKeyDown={(event) => onRowSpace(event, () => onPick(item, null))}
      ref={follow}
    >
      {shots ? <Mini item={item} theme={theme} /> : null}
      <span className="pt-orow-n">{item.n ?? ''}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <use href={`#${glyphOf(item)}`} />
      </svg>
      <span className="pt-orow-name">{item.title}</span>
      {lint || item.leased ? (
        <span className="pt-orow-marks">
          {lint ? (
            <span
              className="pt-orow-badge"
              data-severity={lint.s3 > 0 ? '3' : '2'}
              title={`${lint.s3} must fix, ${lint.s2} should fix`}
            >
              {lint.s3 > 0 ? lint.s3 : lint.s2}
            </span>
          ) : null}
          {item.leased ? <i className="pt-orow-lease" title="Held by another author" /> : null}
        </span>
      ) : null}
      {shots ? (
        <span className="pt-orow-kind">{`${item.kind ?? 'content'} in ${section.label}`}</span>
      ) : null}
    </a>
  );
}

export type SidebarProps = {
  title: string;
  /** `85 slides`; already worded by the route */
  count: string;
  sections: readonly ShellSection[];
  thumb: ShellThumb;
  /** the hash a row's anchor carries for an item */
  hrefFor: (item: ShellItem) => string;
  /** where ViewerShell reads the filter state for the Escape ladder */
  filter?: RefObject<SidebarFilter>;
  /** the mark's link, back to the deck list; a plain span when absent */
  homeHref?: string;
  /** a node after the title: the fixture chip */
  aside?: ReactNode;
};

/**
 * Column one of the shell (SPEC 6.2; Prototemplate directive 8.5). A 52px
 * head holds the mark, the deck title, which never truncates, and the
 * density toggle; a 40px filter row holds the field and the count. The list
 * fills the rest as a scroll region of collapsible groups, one per section:
 * a 24px header with the chevron, the name and its count (painted from
 * data-count), sticky at the top of the region so the section in view is
 * always named; under it, as the section's own children, the slide rows.
 * Every group is open on a first visit; the reader's folds persist under
 * gt-shell-groups:<id>. The row that is the active slide draws the 2px ink
 * bar and ink text. The list scrolls to the active row, alone, when it is
 * out of view; a deep link's first follow centers it. Typing in the filter
 * narrows every group and opens them; Enter opens the first match; Escape
 * clears; Down moves into the list; the arrows walk headers and rows, Left
 * and Right fold and unfold a header. At or below 900px an open list is an
 * overlay with a close button, and a pick closes it. Drag to reorder and
 * the row menu are M3 (SPEC 6.2).
 */
export function Sidebar({
  title,
  count,
  sections,
  thumb,
  hrefFor,
  filter,
  homeHref,
  aside,
}: SidebarProps) {
  const shell = usePtShell();
  const theme = useTheme();
  const {
    id,
    density,
    present,
    narrow,
    sidebarOpen,
    sidebarShown,
    active,
    select,
    setSidebar,
    setDensity,
  } = shell;
  const ready = shell.ready ?? true;

  const [query, setQuery] = useState('');
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const [follow] = useState(() => makeFollow(listRef, readyRef));

  const q = query.trim().toLowerCase();
  const filtering = q.length > 0;
  const storageKey = `${STORAGE_KEY}:${id}`;

  const hidden = !(sidebarShown ?? (sidebarOpen && !present));
  const overlay = narrow && !hidden;
  const shots = density === 'thumbs' && thumb !== 'row';

  if (filter) {
    filter.current = {
      active: filtering,
      clear: () => {
        setQuery('');
        inputRef.current?.blur();
      },
    };
  }

  useMountEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved)
        setOverrides(new Map(Object.entries(JSON.parse(saved) as Record<string, boolean>)));
    } catch {
      // private mode or a stale value: the defaults hold
    }
  });

  /* the landing: the row the server marked mounted before the shell was
     ready, so its ref callback did nothing; once ready, the active row is
     brought into view if it is not */
  useLayoutEffect(() => {
    if (!ready) return;
    const row = listRef.current?.querySelector<HTMLElement>('.pt-orow.is-active');
    if (row) follow(row);
  }, [ready, follow]);

  const holdsActive = (section: ShellSection) => section.items.some((item) => item.id === active);
  const isOpen = (section: ShellSection) =>
    filtering || (overrides.get(section.id) ?? true) || holdsActive(section);

  const setOpen = (section: ShellSection, open: boolean) => {
    const next = new Map(overrides);
    next.set(section.id, open);
    setOverrides(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(next)));
    } catch {
      // private mode: the state holds for the session
    }
  };

  const onPick = (item: ShellItem, event: MouseEvent<HTMLElement> | null) => {
    if (event && isModified(event)) return;
    event?.preventDefault();
    select(item.id);
    if (narrow) setSidebar(false);
  };

  const visibleItems = (section: ShellSection): readonly ShellItem[] =>
    filtering ? section.items.filter((item) => haystack(section, item).includes(q)) : section.items;

  const firstMatch = (): ShellItem | null => {
    for (const section of sections) {
      const item = visibleItems(section)[0];
      if (item) return item;
    }
    return null;
  };

  const walk = (): HTMLElement[] => {
    const list = listRef.current;
    return list ? Array.from(list.querySelectorAll<HTMLElement>(WALK)) : [];
  };

  const onFilterKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      /* prevented so the shell's Escape ladder leaves the rest alone; the field answered */
      event.preventDefault();
      if (query) setQuery('');
      else event.currentTarget.blur();
      return;
    }
    if (event.key === 'ArrowDown') {
      const rows = walk();
      const first = rows.find((row) => !row.classList.contains('pt-grp-head')) ?? rows[0];
      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === 'Enter' && filtering) {
      const item = firstMatch();
      if (item) {
        event.preventDefault();
        onPick(item, null);
      }
    }
  };

  /* the arrows move focus between headers and rows; Up from the first
     returns to the filter; Left on a row returns to its header and closes
     an open header; Right opens a closed header and enters an open one */
  const onListKey = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const { key } = event;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      const rows = walk();
      const at = rows.indexOf(target);
      if (at < 0) return;
      event.preventDefault();
      if (key === 'ArrowUp' && at === 0) {
        inputRef.current?.focus({ preventScroll: true });
        return;
      }
      rows[at + (key === 'ArrowDown' ? 1 : -1)]?.focus();
      return;
    }
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    const box = target.closest<HTMLElement>('.pt-grp');
    const section = sections.find((entry) => entry.id === box?.dataset.group);
    if (!box || !section) return;
    const onHead = target.classList.contains('pt-grp-head');
    event.preventDefault();
    if (key === 'ArrowLeft') {
      if (onHead) setOpen(section, false);
      else box.querySelector<HTMLElement>('.pt-grp-head')?.focus();
      return;
    }
    if (!onHead) return;
    if (isOpen(section)) box.querySelector<HTMLElement>('.pt-orow')?.focus();
    else setOpen(section, true);
  };

  const rendered = sections
    .map((section) => {
      const items = visibleItems(section);
      if (items.length === 0) return null;
      const open = isOpen(section);
      return (
        <section
          className={cn('pt-grp', !open && 'is-closed')}
          key={section.id}
          data-group={section.id}
        >
          <button
            type="button"
            className="pt-grp-head"
            aria-expanded={open}
            title={open ? `Collapse ${section.label}` : `Expand ${section.label}`}
            data-count={items.length}
            onClick={() => setOpen(section, !open)}
          >
            <Icon name="chevron-down" />
            <span className="pt-grp-name">{section.label}</span>
          </button>
          {open
            ? items.map((item) => (
                <Fragment key={item.id}>
                  <TreeRow
                    section={section}
                    item={item}
                    active={item.id === active}
                    shots={shots}
                    theme={theme}
                    href={hrefFor(item)}
                    onPick={onPick}
                    follow={item.id === active ? follow : undefined}
                  />
                </Fragment>
              ))
            : null}
        </section>
      );
    })
    .filter((node) => node !== null);

  return (
    <aside
      className={cn('pt-sb', hidden && 'is-hidden', overlay && 'is-overlay')}
      aria-label={title}
      aria-hidden={hidden || undefined}
    >
      <div className="pt-sb-head">
        {homeHref ? (
          <a className="pt-sb-mark" href={homeHref} title="Every deck" aria-label="Every deck">
            <GtMark />
          </a>
        ) : (
          <span className="pt-sb-mark">
            <GtMark />
          </span>
        )}
        <b>{title}</b>
        {aside}
        {thumb === 'row' ? null : (
          <Seg
            options={DENSITY_OPTIONS}
            value={density}
            onChange={setDensity}
            label="List density"
            iconOnly
            className="is-small"
            control="sidebar.density"
          />
        )}
        {overlay ? (
          <ToolButton icon="close" title="Close the list (Esc)" onClick={() => setSidebar(false)} />
        ) : null}
      </div>
      <FilterRow
        className="pt-sb-tools"
        value={query}
        onChange={setQuery}
        onKeyDown={onFilterKey}
        placeholder="Filter"
        label="Filter slides"
        count={count}
        inputRef={inputRef}
      />
      <nav
        ref={listRef}
        className={cn('pt-tree pt-scroll', shots && 'is-shots')}
        aria-label="Slides"
        onKeyDown={onListKey}
      >
        {rendered.length > 0 ? (
          rendered
        ) : (
          <p className="pt-sb-empty">Nothing matches the filter.</p>
        )}
      </nav>
    </aside>
  );
}
