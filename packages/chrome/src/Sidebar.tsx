import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Slide, SlideKind } from '@turboslide/schema/deck';
import { useTheme } from '@turboslide/viewer/theme';

import type { EditorDispatch } from './dispatch';
import { GtMark } from './GtMark';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import { blankSlide, freeSlideId } from './palette-data';
import { Seg } from './Seg';
import type { SegOption } from './Seg';
import { usePtShell } from './shell-context';
import type { ShellDensity, ShellItem, ShellSection, ShellThumb } from './shell-data';
import { SidebarFilter as FilterRow } from './SidebarFilter';
import { Thumb } from './Thumb';
import { ToolButton } from './ToolButton';

import './Sidebar.css';

/** What ViewerShell reads from the filter for the Escape ladder: whether it holds text, and how to clear it. */
export type SidebarFilter = { active: boolean; clear: () => void };

/**
 * Edit mode for the tree (SPEC 6.2): rows drag to reorder within and across sections and the
 * drop is one slide.move; Alt with the up and down arrows moves a focused row the same way; a
 * row's menu offers Insert after, Duplicate, Move to section, Delete, Render, Lint this slide
 * and Copy id, each one action through the dispatcher with the revision as baseRevision.
 */
export type SidebarEdit = {
  revision: number;
  dispatch: EditorDispatch;
  /** a line for the toast */
  onNotice?: (message: string) => void;
};

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

/** The kinds the row menu inserts blank: the ones that need no picture asset (SPEC 4.2). */
const INSERT_KINDS: ReadonlyArray<{ kind: SlideKind; label: string }> = [
  { kind: 'content', label: 'Content' },
  { kind: 'title', label: 'Title' },
  { kind: 'statement', label: 'Statement' },
];

function glyphOf(item: ShellItem): string {
  return KIND_GLYPH[item.kind ?? 'content'] ?? 'i-document-text';
}

/** What the filter matches: the title, the section, the id, the number and the slide's text (SPEC 6.2). */
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

/**
 * The 64x36 mini in its own frame (SPEC 6.2): the render worker's static capture once it has
 * decoded, the live clone until then, the blank plate when the item has neither (M3 item 5).
 */
function Mini({ item, theme }: { item: ShellItem; theme: 'light' | 'dark' }) {
  return (
    <span className="pt-thumb-frame is-mini">
      <Thumb
        shot={item.shot}
        html={item.html}
        theme={theme}
        frame={false}
        fallbackText={item.n || item.title.charAt(0)}
      />
    </span>
  );
}

/** Where a dragged row would land: before or after the row under the pointer, or first in a section. */
type Drop = { id: string; half: 'before' | 'after' } | { sectionId: string };

type RowProps = {
  section: ShellSection;
  item: ShellItem;
  active: boolean;
  shots: boolean;
  theme: 'light' | 'dark';
  href: string;
  onPick: (item: ShellItem, event: MouseEvent<HTMLElement> | null) => void;
  follow?: (el: HTMLElement | null) => void;
  /** edit mode: the row drags, takes drops and opens its menu */
  edit?: {
    dragging: boolean;
    drop: 'before' | 'after' | null;
    onDragStart: (item: ShellItem, event: DragEvent<HTMLElement>) => void;
    onDragOver: (item: ShellItem, event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    onMenu: (item: ShellItem, section: ShellSection, anchor: HTMLElement) => void;
    menuOpen: boolean;
  };
};

/**
 * A 28px row (SPEC 6.2): the derived number in tabular figures, the kind
 * glyph from the sprite, the title trimmed to 72 characters, a lint badge at
 * severity 2 or 3 and a lease dot when another author holds the slide; 44px
 * in thumbnail density with a 64 by 36 clone in a --pt-edge frame. The row
 * is an anchor with the slide's own hash, so a modified click keeps the
 * browser's meaning, and carries data-preview for the hover preview layer.
 * In edit mode it is draggable, shows the drop line while a row is over it
 * and carries the menu button at its right end.
 */
function TreeRow({ section, item, active, shots, theme, href, onPick, follow, edit }: RowProps) {
  const lint = item.lint && (item.lint.s3 > 0 || item.lint.s2 > 0) ? item.lint : null;
  return (
    <a
      className={cn('pt-orow', active && 'is-active', edit?.dragging && 'is-dragging')}
      href={href}
      title={item.title}
      data-preview={item.id}
      data-id={item.id}
      data-drop={edit?.drop ?? undefined}
      aria-current={active ? 'true' : undefined}
      draggable={edit ? true : undefined}
      onMouseDown={pressWithoutFocus}
      onClick={(event) => onPick(item, event)}
      onKeyDown={(event) => onRowSpace(event, () => onPick(item, null))}
      onDragStart={edit ? (event) => edit.onDragStart(item, event) : undefined}
      onDragOver={edit ? (event) => edit.onDragOver(item, event) : undefined}
      onDrop={edit ? edit.onDrop : undefined}
      onDragEnd={edit ? edit.onDragEnd : undefined}
      onContextMenu={
        edit
          ? (event) => {
              event.preventDefault();
              edit.onMenu(item, section, event.currentTarget);
            }
          : undefined
      }
      ref={follow}
    >
      {shots ? <Mini item={item} theme={theme} /> : null}
      <span className="pt-orow-n">{item.n ?? ''}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <use href={`#${glyphOf(item)}`} />
      </svg>
      <span className="pt-orow-name">{item.title}</span>
      {lint || item.leased || edit ? (
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
          {edit ? (
            <button
              type="button"
              className={cn('pt-orow-more', edit.menuOpen && 'is-on')}
              title={`Slide ${item.id}: insert, duplicate, move, delete`}
              aria-label={`Menu for slide ${item.id}`}
              aria-haspopup="menu"
              aria-expanded={edit.menuOpen}
              data-control={`sidebar.menu.${item.id}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                edit.onMenu(item, section, event.currentTarget);
              }}
            >
              <span aria-hidden="true">⋯</span>
            </button>
          ) : null}
        </span>
      ) : null}
      {shots ? (
        <span className="pt-orow-kind">{`${item.kind ?? 'content'} in ${section.label}`}</span>
      ) : null}
    </a>
  );
}

type MenuState = { item: ShellItem; section: ShellSection; x: number; y: number };

type MenuProps = {
  menu: MenuState;
  sections: readonly ShellSection[];
  edit: SidebarEdit;
  onClose: () => void;
};

/**
 * The row menu (SPEC 6.2): every item is one action through the dispatcher. Insert after offers
 * the kinds a blank slide can take without a picture; Duplicate reads the slide through
 * slide.get and inserts the copy under a free id; Move to section appends to the chosen section.
 */
function RowMenu({ menu, sections, edit, onClose }: MenuProps) {
  const box = useRef<HTMLDivElement>(null);
  const { item, section } = menu;

  useEffect(() => {
    const onDown = (event: globalThis.MouseEvent) => {
      if (box.current && event.target instanceof Node && !box.current.contains(event.target))
        onClose();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const run = (label: string, work: () => Promise<unknown>) => {
    onClose();
    work()
      .then(() => edit.onNotice?.(label))
      .catch((error: unknown) =>
        edit.onNotice?.(error instanceof Error ? error.message : String(error)),
      );
  };

  const taken = new Set(sections.flatMap((entry) => entry.items.map((row) => row.id)));
  const stubDeck = {
    schemaVersion: 1 as const,
    id: 'deck',
    title: 'deck',
    theme: 'gt-ink-paper' as const,
    sections: [],
    assets: {},
    revision: edit.revision,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const insertAfter = (kind: SlideKind) => {
    const id = freeSlideId(taken, `new-${kind}`);
    const slide = blankSlide(kind, id, stubDeck, section.id);
    if (slide === null) return;
    run(`Inserted ${id}`, () =>
      edit.dispatch('slide.insert', {
        sectionId: section.id,
        after: item.id,
        slide,
        baseRevision: edit.revision,
      }),
    );
  };

  const duplicate = () => {
    const id = freeSlideId(taken, `${item.id}-copy`);
    run(`Duplicated ${item.id} as ${id}`, async () => {
      const got = (await edit.dispatch('slide.get', { slideId: item.id })) as { slide: Slide };
      const copy: Slide = { ...got.slide, id };
      if ('title' in copy && copy.title === undefined) delete copy.title;
      return edit.dispatch('slide.insert', {
        sectionId: section.id,
        after: item.id,
        slide: copy,
        baseRevision: edit.revision,
      });
    });
  };

  const moveTo = (target: ShellSection) => {
    const last = target.items[target.items.length - 1];
    run(`Moved ${item.id} to ${target.label}`, () =>
      edit.dispatch('slide.move', {
        slideId: item.id,
        sectionId: target.id,
        ...(last !== undefined && last.id !== item.id ? { after: last.id } : {}),
        baseRevision: edit.revision,
      }),
    );
  };

  const onMenuKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  /* the control suffix is unique per item (insert.<kind>, move.<sectionId>), so it is the key */
  const entry = (label: string, control: string, act: () => void, disabled = false) => (
    <button
      key={control}
      type="button"
      role="menuitem"
      className="pt-orow-menu-item"
      data-control={`sidebar.menu.${item.id}.${control}`}
      disabled={disabled}
      onClick={act}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={box}
      className="pt-orow-menu"
      role="menu"
      aria-label={`Slide ${item.id}`}
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={onMenuKey}
    >
      <span className="pt-orow-menu-head">Insert after</span>
      {INSERT_KINDS.map((kind) =>
        entry(`${kind.label} slide`, `insert.${kind.kind}`, () => insertAfter(kind.kind)),
      )}
      <span className="pt-orow-menu-rule" aria-hidden="true" />
      {entry('Duplicate', 'duplicate', duplicate)}
      {sections.length > 1 ? <span className="pt-orow-menu-head">Move to section</span> : null}
      {sections
        .filter((entrySection) => entrySection.id !== section.id)
        .map((target) => entry(target.label, `move.${target.id}`, () => moveTo(target)))}
      <span className="pt-orow-menu-rule" aria-hidden="true" />
      {entry('Render', 'render', () =>
        run(`Rendered ${item.id}`, () =>
          edit.dispatch('render.slide', {
            slideIds: [item.id],
            themes: ['light', 'dark'],
            scale: 1,
          }),
        ),
      )}
      {entry('Lint this slide', 'lint', () =>
        run(`Linted ${item.id}`, () =>
          edit.dispatch('lint.run', { slideIds: [item.id], layers: 'static' }),
        ),
      )}
      {entry('Copy id', 'copyId', () => {
        onClose();
        navigator.clipboard
          .writeText(item.id)
          .then(() => edit.onNotice?.(`Copied ${item.id}`))
          .catch(() => edit.onNotice?.(item.id));
      })}
      <span className="pt-orow-menu-rule" aria-hidden="true" />
      {entry('Delete', 'delete', () =>
        run(`Removed ${item.id}`, () =>
          edit.dispatch('slide.remove', { slideId: item.id, baseRevision: edit.revision }),
        ),
      )}
    </div>
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
  /** edit mode (SPEC 6.2): drag to reorder, the row menu, Alt arrows */
  edit?: SidebarEdit;
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
 * overlay with a close button, and a pick closes it. With `edit` (SPEC 6.2)
 * a row drags to reorder within and across sections (one slide.move on
 * drop, the drop line drawn in ink as a state), Alt with the up and down
 * arrows moves a focused row, empty sections stay listed as drop targets,
 * and every row has its menu.
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
  edit,
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
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

  /* ---- edit mode: one slide.move per drop or Alt arrow ---- */
  const move = (slideId: string, sectionId: string, after: string | undefined) => {
    if (!edit) return;
    edit
      .dispatch('slide.move', {
        slideId,
        sectionId,
        ...(after !== undefined ? { after } : {}),
        baseRevision: edit.revision,
      })
      .then(() => edit.onNotice?.(`Moved ${slideId}`))
      .catch((error: unknown) =>
        edit.onNotice?.(error instanceof Error ? error.message : String(error)),
      );
  };

  const sectionOfItem = (itemId: string): ShellSection | undefined =>
    sections.find((section) => section.items.some((item) => item.id === itemId));

  /** The slide.move target for a drop before or after a row, with the dragged row left out. */
  const targetFor = (drag: string, at: Drop): { sectionId: string; after?: string } | null => {
    if ('sectionId' in at) return { sectionId: at.sectionId };
    const section = sectionOfItem(at.id);
    if (!section) return null;
    const ids = section.items.map((item) => item.id).filter((itemId) => itemId !== drag);
    const index = ids.indexOf(at.id);
    if (index < 0) return null;
    if (at.half === 'after') return { sectionId: section.id, after: at.id };
    const previous = ids[index - 1];
    return previous === undefined
      ? { sectionId: section.id }
      : { sectionId: section.id, after: previous };
  };

  const onDragStart = (item: ShellItem, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData('text/plain', item.id);
    event.dataTransfer.effectAllowed = 'move';
    setDragId(item.id);
    setMenu(null);
  };

  const onDragOverRow = (item: ShellItem, event: DragEvent<HTMLElement>) => {
    if (!dragId || dragId === item.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const half = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (!drop || !('id' in drop) || drop.id !== item.id || drop.half !== half)
      setDrop({ id: item.id, half });
  };

  const onDragOverSection = (section: ShellSection, event: DragEvent<HTMLElement>) => {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!drop || !('sectionId' in drop) || drop.sectionId !== section.id)
      setDrop({ sectionId: section.id });
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const drag = dragId ?? event.dataTransfer.getData('text/plain');
    const at = drop;
    setDragId(null);
    setDrop(null);
    if (!drag || !at) return;
    const target = targetFor(drag, at);
    if (!target) return;
    /* a drop that leaves the order as it is writes nothing */
    const from = sectionOfItem(drag);
    if (from && from.id === target.sectionId) {
      const ids = from.items.map((item) => item.id);
      const index = ids.indexOf(drag);
      const currentAfter = index > 0 ? ids[index - 1] : undefined;
      if (currentAfter === target.after) return;
    }
    move(drag, target.sectionId, target.after);
  };

  const onDragEnd = () => {
    setDragId(null);
    setDrop(null);
  };

  /** Alt plus an arrow: the focused row one place up or down, across a section's edge. */
  const nudge = (itemId: string, direction: -1 | 1) => {
    const section = sectionOfItem(itemId);
    if (!section) return;
    const ids = section.items.map((item) => item.id);
    const index = ids.indexOf(itemId);
    const sectionIndex = sections.indexOf(section);
    if (direction < 0) {
      if (index === 0) {
        const previous = sections[sectionIndex - 1];
        if (!previous) return;
        const last = previous.items[previous.items.length - 1];
        move(itemId, previous.id, last?.id);
        return;
      }
      move(itemId, section.id, ids[index - 2]);
      return;
    }
    if (index === ids.length - 1) {
      const next = sections[sectionIndex + 1];
      if (!next) return;
      move(itemId, next.id, undefined);
      return;
    }
    move(itemId, section.id, ids[index + 1]);
  };

  const openMenu = (item: ShellItem, section: ShellSection, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    setMenu({ item, section, x: Math.min(rect.left, window.innerWidth - 232), y: rect.bottom + 2 });
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
     an open header; Right opens a closed header and enters an open one;
     Alt with Up or Down moves the row itself in edit mode */
  const onListKey = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const { key } = event;
    if (edit && event.altKey && (key === 'ArrowDown' || key === 'ArrowUp')) {
      const itemId = target.dataset.id;
      if (itemId && target.classList.contains('pt-orow')) {
        event.preventDefault();
        nudge(itemId, key === 'ArrowDown' ? 1 : -1);
        return;
      }
    }
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

  const rowEdit = (item: ShellItem) =>
    edit
      ? {
          dragging: dragId === item.id,
          drop: drop && 'id' in drop && drop.id === item.id ? drop.half : null,
          onDragStart,
          onDragOver: onDragOverRow,
          onDrop,
          onDragEnd,
          onMenu: openMenu,
          menuOpen: menu?.item.id === item.id,
        }
      : undefined;

  const rendered = sections
    .map((section) => {
      const items = visibleItems(section);
      /* an empty section stays listed in edit mode as a drop target */
      if (items.length === 0 && !(edit && !filtering)) return null;
      const open = isOpen(section);
      const dropHere = drop !== null && 'sectionId' in drop && drop.sectionId === section.id;
      return (
        <section
          className={cn('pt-grp', !open && 'is-closed', dropHere && 'is-drop')}
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
            onDragOver={edit ? (event) => onDragOverSection(section, event) : undefined}
            onDrop={edit ? onDrop : undefined}
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
                    edit={rowEdit(item)}
                  />
                </Fragment>
              ))
            : null}
          {open && edit && items.length === 0 ? (
            <p
              className="pt-grp-empty"
              onDragOver={(event) => onDragOverSection(section, event)}
              onDrop={onDrop}
            >
              No slides. Drop one here.
            </p>
          ) : null}
        </section>
      );
    })
    .filter((node) => node !== null);

  return (
    <aside
      className={cn('pt-sb', hidden && 'is-hidden', overlay && 'is-overlay', edit && 'is-edit')}
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
      {menu && edit ? (
        <RowMenu menu={menu} sections={sections} edit={edit} onClose={() => setMenu(null)} />
      ) : null}
    </aside>
  );
}
