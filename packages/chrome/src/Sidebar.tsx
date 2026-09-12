import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react';
import { Fragment, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { applyLayout, appliedLabel } from '@turboslide/schema/apply-layout';
import type { Deck, DeckDocument, Slide, SlideKind } from '@turboslide/schema/deck';
import type { LayoutId } from '@turboslide/schema/layouts';
import { derivedLayout, isLayoutId } from '@turboslide/schema/layouts';
import { clipboardStore, pastedSlideInserts } from '@turboslide/viewer/clipboard';
import type { ClipboardPayload, ClipboardStore } from '@turboslide/viewer/clipboard';
import { useTheme } from '@turboslide/viewer/theme';

import { ContextMenu } from './ContextMenu';
import type { EditorDispatch } from './dispatch';
import { EditorShellContext } from './editor-shell-context';
import { GtMark } from './GtMark';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import { detectPlatform } from './menus/keys.ts';
import type { MenuContext, MenuItem, MenuSetting } from './menus/model.ts';
import { DEFAULT_MENU_CONTEXT } from './menus/model.ts';
import { FILMSTRIP, SNACKBARS } from './menus/strings.ts';
import { blankSlide, freeSlideId } from './palette-data';
import { Seg } from './Seg';
import type { SegOption } from './Seg';
import { usePtShell } from './shell-context';
import type { ShellDensity, ShellItem, ShellSection, ShellThumb } from './shell-data';
import { SidebarFilter as FilterRow } from './SidebarFilter';
import { SLIDE_TEMPLATES, templateTitle } from './slide-templates';
import { Thumb } from './Thumb';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './Sidebar.css';

/** What ViewerShell reads from the filter for the Escape ladder: whether it holds text, and how to clear it. */
export type SidebarFilter = { active: boolean; clear: () => void };

/** The snackbar the filmstrip speaks through (gslides-parity SPEC 12): one sentence, one action. */
export type SidebarSnack = (text: string, action?: { label: string; run: () => void }) => void;

/**
 * Edit mode (SPEC 6.2; gslides-parity SPEC 4): the filmstrip of cards with Google's right-click
 * menu, multi-select, drag and keys, every write one action through the dispatcher with the
 * revision as baseRevision. `settings.sectionsTree` (Tools > Advanced > Show sections as a tree)
 * restores the collapsible tree whose rows drag, take Alt with the arrows and carry the row menu.
 */
export type SidebarEdit = {
  revision: number;
  dispatch: EditorDispatch;
  /** a line for the toast */
  onNotice?: (message: string) => void;
  /** the manifest, so the slide templates that need a picture asset can take one from the deck */
  deck?: Deck;
  /** the document, so the cards know skip, template and kind without asking; slide.list answers when absent */
  document?: DeckDocument;
  /** the snackbar with one action (SPEC 12); onNotice carries the text alone when absent */
  snack?: SidebarSnack;
  /** the page's history, for the Undo action of the snackbars and the menu's Undo predicate */
  undo?: () => void;
  history?: { undo: boolean; redo: boolean };
  /** the View, Tools and Snap to toggles the menu model reads (sections, sectionsTree, showIds) */
  settings?: Readonly<Partial<Record<MenuSetting, boolean | string>>>;
  /** the selected cards changed (Make a copy > Selected slides; the menu context) */
  onSelectionChange?: (slideIds: string[]) => void;
  /** a right-click item the filmstrip does not run itself (a dialog, a panel, a stub), with the selection */
  onMenuItem?: (item: MenuItem, slideIds: string[]) => void;
  /** Enter on a card moves focus to the canvas (SPEC 4.1) */
  onFocusCanvas?: () => void;
  /** the clipboard store; the module's shared one when absent */
  clipboard?: ClipboardStore;
  /** the deck id the clipboard payloads carry */
  deckId?: string;
};

/** Where the reader's folds live: one key per shell holding a JSON map of section id to open or closed. */
const STORAGE_KEY = 'gt-shell-groups';

/** What the arrow keys walk, in document order: headers and rows. */
const WALK = '.pt-grp-head, .pt-orow';

/** the distance a followed row keeps from the list's edges */
const FOLLOW_MARGIN = 8;

/** The product name in the sidebar head (Kevin, 2026-09-11: "change this to say turboslide"); the deck's name lives in the toolbar's DeckName control. */
export const PRODUCT_NAME = 'Turboslide';

/* photo for the thumbnails, queue-list for the outline (SPEC 6.2 density Seg); thumbnails are
   the default (Kevin, 2026-09-11: "the default should be images") and the choice is remembered
   per browser (ViewerShell gt-shell-density) */
const DENSITY_OPTIONS: readonly SegOption<ShellDensity>[] = [
  {
    value: 'thumbs',
    label: 'Thumbnails',
    icon: 'photo',
    title: 'Thumbnails',
    doc: 'Numbered 16:9 thumbnails with the title under each; the default.',
  },
  {
    value: 'outline',
    label: 'Outline',
    icon: 'queue-list',
    title: 'Outline',
    doc: 'One 28 px row per slide: number, kind glyph and title.',
  },
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
 * The 16:9 card in its own frame (SPEC 6.2; Kevin's screenshot of 2026-09-11: the numbered
 * thumbnail with the title under it): the render worker's static capture once it has decoded,
 * the live clone until then, the blank plate when the item has neither (M3 item 5). The frame
 * fills the row's width and keeps the sheet's aspect.
 */
function Card({ item, theme }: { item: ShellItem; theme: 'light' | 'dark' }) {
  return (
    <span className="pt-thumb-frame is-card">
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
      <span className="pt-orow-n">{item.n ?? ''}</span>
      {shots ? <Card item={item} theme={theme} /> : null}
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
              aria-label={`Menu for slide ${item.id}`}
              {...tipProps({
                name: 'Slide menu',
                doc: `Insert after, duplicate, move, render, lint or delete ${item.id}; right click opens it too.`,
              })}
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

  const insertSlide = (id: string, slide: Slide) =>
    run(`Inserted ${id}`, () =>
      edit.dispatch('slide.insert', {
        sectionId: section.id,
        after: item.id,
        slide,
        baseRevision: edit.revision,
      }),
    );

  const insertAfter = (kind: SlideKind) => {
    const id = freeSlideId(taken, `new-${kind}`);
    const slide = blankSlide(kind, id, stubDeck, section.id);
    if (slide !== null) insertSlide(id, slide);
  };

  /* the slide templates with their placeholder copy; a template whose asset the deck lacks is
     left out, as the palette leaves it out */
  const templates = SLIDE_TEMPLATES.flatMap((template) => {
    const id = freeSlideId(taken, `new-${template.id}`);
    const slide = template.make(id, edit.deck ?? stubDeck, section.id);
    return slide === null ? [] : [{ template, id, slide }];
  });

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
  const entry = (label: string, control: string, act: () => void, doc: string, key?: string) => (
    <button
      key={control}
      type="button"
      role="menuitem"
      className="pt-orow-menu-item"
      data-control={`sidebar.menu.${item.id}.${control}`}
      onClick={act}
      {...tipProps({ name: label, doc, ...(key !== undefined ? { key } : {}) })}
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
      /* the template entries make the menu tall: it scrolls inside the viewport below its anchor */
      style={{ left: menu.x, top: menu.y, maxHeight: `calc(100vh - ${menu.y + 8}px)` }}
      onKeyDown={onMenuKey}
    >
      <span className="pt-orow-menu-head">Insert after</span>
      {INSERT_KINDS.map((kind) =>
        entry(
          `${kind.label} slide`,
          `insert.${kind.kind}`,
          () => insertAfter(kind.kind),
          `Inserts a blank ${kind.label.toLowerCase()} slide after ${item.id} (slide.insert).`,
        ),
      )}
      {templates.length > 0 ? <span className="pt-orow-menu-head">Insert a template</span> : null}
      {templates.map(({ template, id, slide }) =>
        entry(
          templateTitle(template),
          `template.${template.id}`,
          () => insertSlide(id, slide),
          `${template.doc} Inserted after ${item.id} with placeholder copy.`,
        ),
      )}
      <span className="pt-orow-menu-rule" aria-hidden="true" />
      {entry(
        'Duplicate',
        'duplicate',
        duplicate,
        `Inserts a copy of ${item.id} after it under a free id (slide.get then slide.insert).`,
      )}
      {sections.length > 1 ? <span className="pt-orow-menu-head">Move to section</span> : null}
      {sections
        .filter((entrySection) => entrySection.id !== section.id)
        .map((target) =>
          entry(
            target.label,
            `move.${target.id}`,
            () => moveTo(target),
            `Moves ${item.id} to the end of ${target.label} (slide.move).`,
          ),
        )}
      <span className="pt-orow-menu-rule" aria-hidden="true" />
      {entry(
        'Render',
        'render',
        () =>
          run(`Rendered ${item.id}`, () =>
            edit.dispatch('render.slide', {
              slideIds: [item.id],
              themes: ['light', 'dark'],
              scale: 1,
            }),
          ),
        'Renders both themes of this slide through the render worker (render.slide).',
      )}
      {entry(
        'Lint this slide',
        'lint',
        () =>
          run(`Linted ${item.id}`, () =>
            edit.dispatch('lint.run', { slideIds: [item.id], layers: 'static' }),
          ),
        'Runs the static lint layer on this slide alone (lint.run).',
      )}
      {entry(
        'Copy id',
        'copyId',
        () => {
          onClose();
          navigator.clipboard
            .writeText(item.id)
            .then(() => edit.onNotice?.(`Copied ${item.id}`))
            .catch(() => edit.onNotice?.(item.id));
        },
        `Copies ${item.id} to the clipboard for the CLI and the agent surface.`,
      )}
      <span className="pt-orow-menu-rule" aria-hidden="true" />
      {entry(
        'Delete',
        'delete',
        () =>
          run(`Removed ${item.id}`, () =>
            edit.dispatch('slide.remove', { slideId: item.id, baseRevision: edit.revision }),
          ),
        `Removes ${item.id} from the deck (slide.remove); History undoes it.`,
      )}
    </div>
  );
}

export type SidebarProps = {
  /** the deck's title: the aside's accessible name (the head reads the product name) */
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
 * head holds the mark, the product name Turboslide (Kevin, 2026-09-11; the
 * deck's own name is the toolbar's DeckName control) and the density toggle,
 * thumbnails first; a 40px filter row holds the field and the count. The list
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
export function Sidebar(props: SidebarProps) {
  const { edit } = props;
  const settings = useFilmstripSettings(edit);
  if (edit !== undefined && settings?.sectionsTree !== true) {
    return (
      <Filmstrip {...props} edit={{ ...edit, ...(settings === undefined ? {} : { settings }) }} />
    );
  }
  return <TreeSidebar {...props} />;
}

/**
 * The View, Tools and Snap to toggles the filmstrip reads: the route's, else the editor shell's
 * own settings when the sidebar is drawn inside EditorShell (the shell keeps them per browser and
 * the route does not see them; integrator, docs/gslides-parity/build/integrator.md).
 */
function useFilmstripSettings(edit: SidebarEdit | undefined): SidebarEdit['settings'] | undefined {
  const shell = useContext(EditorShellContext);
  return edit?.settings ?? shell?.settings;
}

/** The collapsible tree of sections and rows: the view route's list, and the editor's under Tools > Advanced > Show sections as a tree. */
function TreeSidebar({
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
            data-count={items.length}
            onClick={() => setOpen(section, !open)}
            {...tipProps({
              name: section.label,
              doc: `${items.length} slide${items.length === 1 ? '' : 's'}; click to ${open ? 'collapse' : 'expand'} the section, left and right arrows fold it from the keyboard.`,
            })}
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
          <a
            className="pt-sb-mark"
            href={homeHref}
            aria-label="Every deck"
            {...tipProps({ name: PRODUCT_NAME, doc: 'Back to the deck list.' })}
          >
            <GtMark />
          </a>
        ) : (
          <span className="pt-sb-mark">
            <GtMark />
          </span>
        )}
        <b>{PRODUCT_NAME}</b>
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
            toggle
          />
        )}
        {overlay ? (
          <ToolButton
            icon="close"
            title="Close the list (Esc)"
            doc="Hides the overlay list; the [ key opens it again."
            onClick={() => setSidebar(false)}
          />
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

// ---------------------------------------------------------------------------------------------
// The filmstrip (gslides-parity SPEC 4.1, 4.2, 4.5)

/** What a card knows beyond its ShellItem: the parity round's facts (SPEC 7.2.1, 7.2.2). */
type CardFacts = {
  skip: boolean;
  template: LayoutId | undefined;
  kind: string;
  pictureLayout: boolean;
};

/** Where dragged cards would land: before or after a card, or first in a section. */
type FilmDrop = { id: string; half: 'before' | 'after' } | { sectionId: string };

type FilmMenu = { ids: string[]; x: number; y: number; anchor: HTMLElement; layout?: LayoutId };

/** Page Up and Page Down move this many cards. */
const PAGE_STEP = 5;
/** How long a refused drop line shakes (SPEC 4.1). */
export const DROP_SHAKE_MS = 200;

/**
 * The layout New slide inserts after a slide (SPEC 5.3, 0.27): the slide's own layout; Title and
 * body after a Title slide, and after a Section header too, since a second header would open a
 * second section (B1's rule for an opener). Title and body when the slide names no layout.
 */
export function newSlideLayout(current: {
  template: LayoutId | undefined;
  kind: string;
}): LayoutId {
  if (current.kind === 'title' || current.kind === 'opener') return 'split';
  return current.template ?? 'split';
}

/**
 * The order after a drop (pure; sidebar-filmstrip.test.tsx pins it): the dragged ids leave every
 * section and land at the target, in their deck order. Null when the drop breaks the opener rule
 * (SPEC 4.1, validator 4.4): a Section header stays first in its section, so nothing lands before
 * one and a header lands nowhere but first.
 */
export function droppedOrder(
  sections: ReadonlyArray<{ id: string; slideIds: ReadonlyArray<string> }>,
  kinds: ReadonlyMap<string, string>,
  dragged: ReadonlyArray<string>,
  at: FilmDrop,
): { id: string; slideIds: string[] }[] | null {
  const moving = sections.flatMap((section) =>
    section.slideIds.filter((id) => dragged.includes(id)),
  );
  if (moving.length === 0) return null;
  const next = sections.map((section) => ({
    id: section.id,
    slideIds: section.slideIds.filter((id) => !dragged.includes(id)),
  }));
  const target =
    'sectionId' in at
      ? next.find((section) => section.id === at.sectionId)
      : next.find((section) =>
          sections.find((row) => row.id === section.id)?.slideIds.includes(at.id),
        );
  if (!target) return null;
  let index: number;
  if ('sectionId' in at) index = 0;
  else {
    const rest = target.slideIds.indexOf(at.id);
    if (rest < 0) {
      /* the card under the pointer is one of the dragged: nothing moves */
      return null;
    }
    index = at.half === 'before' ? rest : rest + 1;
  }
  const movesOpener = moving.some((id) => kinds.get(id) === 'opener');
  if (movesOpener && index !== 0) return null;
  const first = target.slideIds[0];
  if (index === 0 && first !== undefined && kinds.get(first) === 'opener' && !movesOpener)
    return null;
  target.slideIds.splice(index, 0, ...moving);
  return next;
}

/** The one `slide.move` a single dragged card is, from the dropped order. */
function moveOf(
  order: ReadonlyArray<{ id: string; slideIds: ReadonlyArray<string> }>,
  slideId: string,
): { sectionId: string; after?: string } | null {
  for (const section of order) {
    const at = section.slideIds.indexOf(slideId);
    if (at < 0) continue;
    const after = section.slideIds[at - 1];
    return after === undefined ? { sectionId: section.id } : { sectionId: section.id, after };
  }
  return null;
}

type FilmCardProps = {
  item: ShellItem;
  facts: CardFacts;
  current: boolean;
  selected: boolean;
  theme: 'light' | 'dark';
  dragging: boolean;
  drop: 'before' | 'after' | null;
  refused: boolean;
  onPick: (item: ShellItem, event: MouseEvent<HTMLElement>) => void;
  onOpenGrid: () => void;
  onMenu: (item: ShellItem, point: { x: number; y: number }, anchor: HTMLElement) => void;
  onDragStart: (item: ShellItem, event: DragEvent<HTMLElement>) => void;
  onDragOver: (item: ShellItem, event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  follow?: (el: HTMLElement | null) => void;
};

/**
 * One card (SPEC 4.1): the number in a 28 px gutter in tabular figures, the 16:9 thumbnail in a
 * --pt-edge frame (the render worker's capture over the live clone, Thumb.tsx), the current card
 * ringed in ink at 2 px, a skipped card at 40 percent with the eye-slash glyph; the title is the
 * tooltip. No title under the card, no kind glyph, no lint badge, no lease dot, no row menu.
 */
function FilmCard({
  item,
  facts,
  current,
  selected,
  theme,
  dragging,
  drop,
  refused,
  onPick,
  onOpenGrid,
  onMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  follow,
}: FilmCardProps) {
  const n = item.n ? String(Number(item.n)) : '';
  const name = `Slide ${n}${facts.skip ? ', skipped' : ''}`;
  const tip = tipProps({
    name: item.title,
    ...(facts.skip ? { doc: FILMSTRIP.skipped } : {}),
  });
  return (
    <div
      className={cn(
        'ts-card',
        current && 'is-current',
        selected && 'is-selected',
        facts.skip && 'is-skipped',
        dragging && 'is-dragging',
        refused && 'is-refused',
      )}
      role="option"
      tabIndex={current ? 0 : -1}
      aria-selected={selected}
      aria-label={name}
      aria-current={current ? 'true' : undefined}
      data-id={item.id}
      data-control={`filmstrip.slide.${item.id}`}
      data-skip={facts.skip ? '' : undefined}
      data-drop={drop ?? undefined}
      draggable
      onClick={(event) => onPick(item, event)}
      onDoubleClick={(event) => {
        event.preventDefault();
        onOpenGrid();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(item, { x: event.clientX, y: event.clientY }, event.currentTarget);
      }}
      onDragStart={(event) => onDragStart(item, event)}
      onDragOver={(event) => onDragOver(item, event)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      ref={follow}
      {...tip}
    >
      <span className="ts-card-n">{n}</span>
      <span className="ts-card-frame">
        <Thumb shot={item.shot} html={item.html} theme={theme} frame={false} fallbackText={n} />
        {facts.skip ? (
          <span className="ts-card-skip" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <use href="#i-eye-slash" />
            </svg>
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The filmstrip (gslides-parity SPEC 4.1, 4.2, 4.5): one card per slide, passive section labels
 * when the deck has more than one section, Shift and Cmd multi-select with Shift plus the arrows
 * and Cmd A from the keyboard, drag with the drop line and the opener rule (a refused position
 * shakes for 200 ms), Google's card menu on right-click and Shift F10, the keys of SPEC 4.1 (Up,
 * Down, Page Up, Page Down, Home, End move; Cmd Up and Down move the slide; Cmd Shift Up and Down
 * to the ends; Delete with the snackbar; Enter focuses the canvas; Ctrl M inserts), and the empty
 * frame "Click + to add a slide" when the deck has no slide. The filter row, the count, the
 * density toggle, the kind glyph, the lint badge, the lease dot, the hover preview card and the
 * row menu of the tree leave the default view. Every write is one action through the dispatcher.
 */
function Filmstrip({
  title,
  sections,
  homeHref,
  aside,
  edit,
}: Omit<SidebarProps, 'edit'> & { edit: SidebarEdit }) {
  const shell = usePtShell();
  const theme = useTheme();
  const { active, select, narrow, sidebarOpen, sidebarShown, present, setSidebar, ready } = shell;
  const hidden = !(sidebarShown ?? (sidebarOpen && !present));
  const overlay = narrow && !hidden;
  const listRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(ready ?? true);
  readyRef.current = ready ?? true;
  const [follow] = useState(() => makeFollow(listRef, readyRef));

  const order = sections.flatMap((section) => section.items.map((item) => item.id));
  const items = new Map(
    sections.flatMap((section) => section.items.map((item) => [item.id, item] as const)),
  );
  const sectionOf = (id: string) =>
    sections.find((section) => section.items.some((item) => item.id === id));

  /* the selection: the current card and whatever Shift, Cmd and the keys added; a current card
     the page moved from outside the selection resets it */
  const [selected, setSelected] = useState<string[]>(active ? [active] : []);
  const anchorRef = useRef<string>(active);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onSelectionRef = useRef(edit.onSelectionChange);
  onSelectionRef.current = edit.onSelectionChange;
  const setSelection = (ids: string[]) => {
    const ordered = order.filter((id) => ids.includes(id));
    if (
      ordered.length === selectedRef.current.length &&
      ordered.every((id, i) => selectedRef.current[i] === id)
    )
      return;
    selectedRef.current = ordered;
    setSelected(ordered);
    onSelectionRef.current?.(ordered);
  };
  useEffect(() => {
    if (active && !selectedRef.current.includes(active)) {
      anchorRef.current = active;
      setSelection([active]);
    }
    // the selection follows the current card; setSelection reads refs
  }, [active]);

  /* the parity facts per card: from the document when the page passes it, else slide.list */
  const [rows, setRows] = useState<ReadonlyMap<string, { skip?: boolean; template?: string }>>(
    new Map(),
  );
  useEffect(() => {
    if (edit.document !== undefined) return;
    let cancelled = false;
    Promise.resolve(edit.dispatch('slide.list', {}))
      .then((result) => {
        if (cancelled || !Array.isArray(result)) return;
        setRows(
          new Map(
            (result as { id: string; skip?: boolean; template?: string }[]).map((row) => [
              row.id,
              row,
            ]),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [edit.revision, edit.dispatch, edit.document]);

  const factsOf = (item: ShellItem): CardFacts => {
    const record = edit.document?.slides[item.id];
    if (record) {
      return {
        skip: record.skip === true,
        template: derivedLayout(record),
        kind: record.kind,
        pictureLayout:
          record.kind === 'opener' || record.kind === 'mood' || record.kind === 'closing',
      };
    }
    const row = rows.get(item.id);
    const kind = item.kind ?? 'content';
    return {
      skip: row?.skip === true,
      template: row?.template !== undefined && isLayoutId(row.template) ? row.template : undefined,
      kind,
      pictureLayout: kind === 'opener' || kind === 'mood' || kind === 'closing',
    };
  };
  const kinds = new Map(order.map((id) => [id, factsOf(items.get(id) ?? { id, title: id }).kind]));

  const say = (text: string) => edit.onNotice?.(text);
  const snack = (text: string, undo?: boolean) => {
    if (edit.snack) {
      edit.snack(text, undo && edit.undo ? { label: SNACKBARS.undo, run: edit.undo } : undefined);
    } else say(undo ? `${text} · ${SNACKBARS.undo}` : text);
  };
  const fail = (error: unknown) => say(error instanceof Error ? error.message : String(error));

  /* the writes: each one action, the revision counted up across the writes of one tick because the
     page's reducer applies a write before the prop re-renders */
  const revision = useRef(edit.revision);
  revision.current = edit.revision;
  const dispatch = (id: string, input: Record<string, unknown>): Promise<unknown> => {
    const base = revision.current;
    revision.current = base + 1;
    return Promise.resolve(
      edit.dispatch(id as Parameters<EditorDispatch>[0], { ...input, baseRevision: base }),
    ).catch((error: unknown) => {
      fail(error);
      throw error;
    });
  };
  const read = (id: string, input: Record<string, unknown>): Promise<unknown> =>
    Promise.resolve(edit.dispatch(id as Parameters<EditorDispatch>[0], input));

  const pickOne = (id: string) => {
    anchorRef.current = id;
    setSelection([id]);
    if (id !== active) select(id);
  };

  const onPick = (item: ShellItem, event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.shiftKey) {
      const from = order.indexOf(anchorRef.current);
      const to = order.indexOf(item.id);
      const [a, b] = from <= to ? [from, to] : [to, from];
      setSelection(order.slice(Math.max(0, a), b + 1));
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      const next = selectedRef.current.includes(item.id)
        ? selectedRef.current.filter((id) => id !== item.id)
        : [...selectedRef.current, item.id];
      if (next.length > 0) setSelection(next);
      return;
    }
    pickOne(item.id);
    if (narrow) setSidebar(false);
  };

  const focusCard = (id: string) => {
    listRef.current
      ?.querySelector<HTMLElement>(`.ts-card[data-id="${id}"]`)
      ?.focus({ preventScroll: true });
  };

  const moveActive = (to: number, extend: boolean) => {
    const id = order[Math.max(0, Math.min(order.length - 1, to))];
    if (id === undefined) return;
    if (extend) {
      const from = order.indexOf(anchorRef.current);
      const at = order.indexOf(id);
      const [a, b] = from <= at ? [from, at] : [at, from];
      setSelection(order.slice(a, b + 1));
      select(id);
    } else pickOne(id);
    window.setTimeout(() => focusCard(id), 0);
  };

  // ---- the writes of SPEC 4.2

  const slidesOf = async (ids: string[]): Promise<Slide[]> => {
    const document = edit.document;
    if (document) {
      return ids.flatMap((id) => {
        const slide = document.slides[id];
        return slide ? [slide] : [];
      });
    }
    const got = await Promise.all(ids.map((id) => read('slide.get', { slideId: id })));
    return got.flatMap((row) =>
      (row as { slide?: Slide }).slide ? [(row as { slide: Slide }).slide] : [],
    );
  };

  const copySlides = async (ids: string[]): Promise<void> => {
    const slides = await slidesOf(ids);
    if (slides.length === 0) return;
    const payload: ClipboardPayload = {
      kind: 'slides',
      deckId: edit.deckId ?? edit.deck?.id ?? edit.document?.deck.id ?? '',
      slides: JSON.parse(JSON.stringify(slides)) as Slide[],
    };
    await (edit.clipboard ?? clipboardStore).write(payload);
  };

  const removeSlides = (ids: string[]) => {
    const ordered = order.filter((id) => ids.includes(id));
    if (ordered.length === 0) return;
    for (const id of ordered) void dispatch('slide.remove', { slideId: id }).catch(() => undefined);
    const count = ordered.length;
    if (edit.snack && edit.undo) {
      const undoAll = edit.undo;
      edit.snack(count === 1 ? SNACKBARS.slideDeleted : SNACKBARS.slidesDeleted(count), {
        label: SNACKBARS.undo,
        run: () => {
          for (let i = 0; i < count; i += 1) undoAll();
        },
      });
    } else snack(count === 1 ? SNACKBARS.slideDeleted : SNACKBARS.slidesDeleted(count), true);
  };

  const pasteSlides = async (afterId: string | undefined): Promise<void> => {
    const payload = await (edit.clipboard ?? clipboardStore).read();
    if (payload === null || payload.kind !== 'slides') return;
    const deckId = edit.deckId ?? edit.deck?.id ?? edit.document?.deck.id ?? '';
    if (payload.deckId !== deckId && payload.deckId !== '') {
      await dispatch('slide.import', {
        sourceDeckId: payload.deckId,
        slideIds: payload.slides.map((slide) => slide.id),
        ...(afterId !== undefined ? { after: afterId } : {}),
      }).catch(() => undefined);
      return;
    }
    const view = {
      sections: sections.map((section) => ({
        id: section.id,
        slideIds: section.items.map((item) => item.id),
      })),
    };
    for (const input of pastedSlideInserts(view, payload, afterId)) {
      void dispatch('slide.insert', input).catch(() => undefined);
    }
  };

  const newSlide = (afterId: string) => {
    const item = items.get(afterId);
    const facts = item ? factsOf(item) : undefined;
    const layout = newSlideLayout(facts ?? { template: undefined, kind: 'content' });
    void dispatch('slide.new', { layout, after: afterId }).catch(() => undefined);
  };

  const skipSlides = (ids: string[]) => {
    const facts = ids.map((id) => factsOf(items.get(id) ?? { id, title: id }));
    const skip = !facts.every((row) => row.skip);
    void dispatch('slide.skip', { slideIds: ids, skip }).catch(() => undefined);
    if (skip && ids.length > 1) snack(SNACKBARS.skipped(ids.length), true);
  };

  const applyLayoutTo = (ids: string[], layout: LayoutId) => {
    let dropped = 0;
    const document = edit.document;
    if (document) {
      for (const id of ids) {
        const slide = document.slides[id];
        const section = document.deck.sections.find((row) => row.slideIds.includes(id));
        if (!slide || !section) continue;
        dropped += applyLayout({ slide, layout, deck: document.deck, sectionId: section.id })
          .dropped.length;
      }
    }
    const run = dispatch('slide.applyLayout', { slideIds: ids, layout });
    const label = appliedLabel(layout);
    if (document) {
      if (dropped > 0)
        snack(SNACKBARS.appliedLayout(label, dropped, dropped === 1 ? 'item' : 'items'), true);
      return;
    }
    run
      .then((result) => {
        const droppedRows = (result as { dropped?: { blockIds: string[] }[] }).dropped ?? [];
        const count = droppedRows.reduce((sum, row) => sum + row.blockIds.length, 0);
        if (count > 0)
          snack(SNACKBARS.appliedLayout(label, count, count === 1 ? 'item' : 'items'), true);
      })
      .catch(() => undefined);
  };

  /** Cmd Up and Down move the selected slides one place; Shift to the beginning or the end (SPEC 4.1). */
  const moveSelected = (where: 'up' | 'down' | 'start' | 'end') => {
    const ids = order.filter((id) => selectedRef.current.includes(id));
    const first = ids[0];
    const last = ids[ids.length - 1];
    if (first === undefined || last === undefined) return;
    const view = sections.map((section) => ({
      id: section.id,
      slideIds: section.items.map((item) => item.id),
    }));
    let at: FilmDrop | null = null;
    if (where === 'start') {
      const section = view[0];
      if (section)
        at =
          section.slideIds.length > 0 && !ids.includes(section.slideIds[0] ?? '')
            ? { id: section.slideIds[0] as string, half: 'before' }
            : { sectionId: section.id };
    } else if (where === 'end') {
      const section = view[view.length - 1];
      const tail = section?.slideIds.filter((id) => !ids.includes(id)).at(-1);
      if (section)
        at = tail !== undefined ? { id: tail, half: 'after' } : { sectionId: section.id };
    } else if (where === 'up') {
      const before = order
        .slice(0, order.indexOf(first))
        .filter((id) => !ids.includes(id))
        .at(-1);
      if (before === undefined) return;
      at = { id: before, half: 'before' };
    } else {
      const after = order.slice(order.indexOf(last) + 1).find((id) => !ids.includes(id));
      if (after === undefined) return;
      at = { id: after, half: 'after' };
    }
    if (at === null) return;
    writeOrder(ids, at);
  };

  const [refused, setRefused] = useState<string | null>(null);
  const shake = (id: string) => {
    setRefused(id);
    window.setTimeout(
      () => setRefused((current) => (current === id ? null : current)),
      DROP_SHAKE_MS,
    );
  };

  /** The one write of a drop: `slide.move` for one card, `section.set` for several (one revision, one undo). */
  const writeOrder = (ids: string[], at: FilmDrop) => {
    const view = sections.map((section) => ({
      id: section.id,
      slideIds: section.items.map((item) => item.id),
    }));
    const next = droppedOrder(view, kinds, ids, at);
    if (next === null) {
      shake('id' in at ? at.id : at.sectionId);
      return;
    }
    if (
      view.every((section, i) => {
        const after = next[i];
        return after !== undefined && section.slideIds.join(',') === after.slideIds.join(',');
      })
    )
      return;
    const single = ids.length === 1 ? ids[0] : undefined;
    if (single !== undefined) {
      const target = moveOf(next, single);
      if (target)
        void dispatch('slide.move', { slideId: single, ...target }).catch(() => undefined);
      return;
    }
    const full = edit.document?.deck.sections ?? edit.deck?.sections;
    const named = next.map((section) => ({
      id: section.id,
      name:
        full?.find((row) => row.id === section.id)?.name ??
        sectionOf(section.slideIds[0] ?? '')?.label ??
        sections.find((row) => row.id === section.id)?.label ??
        section.id,
      slideIds: section.slideIds,
    }));
    void dispatch('section.set', { sections: named }).catch(() => undefined);
  };

  // ---- drag (SPEC 4.1)

  const [dragging, setDragging] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<FilmDrop | null>(null);

  const onDragStart = (item: ShellItem, event: DragEvent<HTMLElement>) => {
    const ids = selectedRef.current.includes(item.id)
      ? order.filter((id) => selectedRef.current.includes(id))
      : [item.id];
    event.dataTransfer.setData('text/plain', ids.join(','));
    event.dataTransfer.effectAllowed = 'move';
    setDragging(ids);
    setMenu(null);
  };
  const onDragOverCard = (item: ShellItem, event: DragEvent<HTMLElement>) => {
    if (!dragging || dragging.includes(item.id)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const half = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (!drop || !('id' in drop) || drop.id !== item.id || drop.half !== half)
      setDrop({ id: item.id, half });
  };
  const onDragOverSection = (section: ShellSection, event: DragEvent<HTMLElement>) => {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!drop || !('sectionId' in drop) || drop.sectionId !== section.id)
      setDrop({ sectionId: section.id });
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const ids = dragging ?? event.dataTransfer.getData('text/plain').split(',').filter(Boolean);
    const at = drop;
    setDragging(null);
    setDrop(null);
    if (ids.length === 0 || !at) return;
    writeOrder(ids, at);
  };
  const onDragEnd = () => {
    setDragging(null);
    setDrop(null);
  };

  // ---- the right-click menu (SPEC 4.2)

  const [menu, setMenu] = useState<FilmMenu | null>(null);
  const platform = detectPlatform();
  const openMenu = (item: ShellItem, point: { x: number; y: number }, anchor: HTMLElement) => {
    if (!selectedRef.current.includes(item.id)) pickOne(item.id);
    const ids = order.filter((id) => selectedRef.current.includes(id) || id === item.id);
    const anchorId = ids.includes(active) ? active : (ids[0] ?? item.id);
    const facts = factsOf(items.get(anchorId) ?? item);
    setMenu({ ids, x: point.x, y: point.y, anchor, layout: facts.template });
    /* without the document the layout of a slide with no template is derived from its record,
       read through slide.get, so the Apply layout submenu checks the right row (SPEC 5.6) */
    if (edit.document === undefined && facts.template === undefined) {
      void read('slide.get', { slideId: anchorId })
        .then((got) => {
          const slide = (got as { slide?: Slide }).slide;
          if (!slide) return;
          const layout = derivedLayout(slide);
          setMenu((current) =>
            current && current.anchor === anchor ? { ...current, layout } : current,
          );
        })
        .catch(() => undefined);
    }
  };
  const menuContext = (ids: string[]): MenuContext => {
    const anchorId = ids.includes(active) ? active : (ids[0] ?? active);
    const facts = factsOf(items.get(anchorId) ?? { id: anchorId, title: anchorId });
    const record = edit.document?.slides[anchorId];
    return {
      ...DEFAULT_MENU_CONTEXT,
      platform,
      focus: 'filmstrip',
      slide: {
        index: Math.max(0, order.indexOf(anchorId)),
        count: order.length,
        skipped: ids.every((id) => factsOf(items.get(id) ?? { id, title: id }).skip),
        freeform: record?.kind === 'content' && record.layout.type === 'freeform',
        pictureLayout: facts.pictureLayout,
      },
      selectedSlides: ids.length,
      clipboard: (edit.clipboard ?? clipboardStore).kind(),
      history: edit.history ?? DEFAULT_MENU_CONTEXT.history,
      sections: sections.length,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, ...edit.settings },
    };
  };
  const runMenuItem = (item: MenuItem, ids: string[]) => {
    const anchorId = ids.includes(active) ? active : (ids[0] ?? active);
    const last = ids[ids.length - 1] ?? anchorId;
    switch (item.id) {
      case 'edit.cut':
        void copySlides(ids).then(() => removeSlides(ids));
        return;
      case 'edit.copy':
        void copySlides(ids);
        return;
      case 'edit.paste':
        void pasteSlides(last);
        return;
      case 'slide.newSlide':
        newSlide(last);
        return;
      case 'slide.duplicateSlide':
        void dispatch('slide.duplicate', { slideIds: ids }).catch(() => undefined);
        return;
      case 'edit.delete':
      case 'slide.deleteSlide':
        removeSlides(ids);
        return;
      case 'slide.skipSlide':
        skipSlides(ids);
        return;
      case 'slide.moveSlide.up':
        moveSelected('up');
        return;
      case 'slide.moveSlide.down':
        moveSelected('down');
        return;
      case 'slide.moveSlide.toBeginning':
        moveSelected('start');
        return;
      case 'slide.moveSlide.toEnd':
        moveSelected('end');
        return;
      default:
        edit.onMenuItem?.(item, ids);
    }
  };

  // ---- keys (SPEC 4.1)

  const onListKey = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('ts-card')) return;
    const meta = event.metaKey || event.ctrlKey;
    const at = order.indexOf(active);
    const ids = order.filter((id) => selectedRef.current.includes(id));
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    /* Ctrl M on every platform, as Google prints it (SPEC 10.1) */
    if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'm') {
      stop();
      newSlide(ids[ids.length - 1] ?? active);
      return;
    }
    if ((event.key === 'F10' && event.shiftKey) || (meta && event.shiftKey && event.key === '\\')) {
      stop();
      const item = items.get(active);
      if (item) openMenu(item, centerOf(target), target);
      return;
    }
    if (meta && event.key.toLowerCase() === 'a' && !event.shiftKey) {
      stop();
      setSelection(order);
      return;
    }
    if (meta && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      stop();
      if (event.shiftKey) moveSelected(event.key === 'ArrowUp' ? 'start' : 'end');
      else moveSelected(event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
    if (meta || event.altKey) return;
    switch (event.key) {
      case 'ArrowUp':
        stop();
        moveActive(at - 1, event.shiftKey);
        return;
      case 'ArrowDown':
        stop();
        moveActive(at + 1, event.shiftKey);
        return;
      case 'PageUp':
        stop();
        moveActive(at - PAGE_STEP, event.shiftKey);
        return;
      case 'PageDown':
        stop();
        moveActive(at + PAGE_STEP, event.shiftKey);
        return;
      case 'Home':
        stop();
        moveActive(0, event.shiftKey);
        return;
      case 'End':
        stop();
        moveActive(order.length - 1, event.shiftKey);
        return;
      case 'Delete':
      case 'Backspace':
        stop();
        removeSlides(ids.length > 0 ? ids : [active]);
        return;
      case 'Enter':
        stop();
        edit.onFocusCanvas?.();
        return;
      default:
        return;
    }
  };

  const showSections = sections.length > 1 && edit.settings?.sections !== false;
  const openGrid = () => {
    if (shell.modes.includes('grid')) shell.setMode('grid');
  };

  return (
    <aside
      className={cn('pt-sb ts-filmstrip is-edit', hidden && 'is-hidden', overlay && 'is-overlay')}
      aria-label={title}
      aria-hidden={hidden || undefined}
    >
      {overlay ? (
        <div className="pt-sb-head">
          {homeHref ? (
            <a
              className="pt-sb-mark"
              href={homeHref}
              aria-label="Every presentation"
              {...tipProps({ name: 'Turboslide', doc: 'Every presentation on this Turboslide.' })}
            >
              <GtMark />
            </a>
          ) : (
            <span className="pt-sb-mark">
              <GtMark />
            </span>
          )}
          {aside}
          <ToolButton
            icon="close"
            title="Close the list (Esc)"
            doc="Hides the overlay list."
            onClick={() => setSidebar(false)}
          />
        </div>
      ) : null}
      <div
        ref={listRef}
        className="ts-film pt-scroll"
        role="listbox"
        aria-label="Slides"
        aria-multiselectable="true"
        data-control="filmstrip"
        onKeyDown={onListKey}
      >
        {order.length === 0 ? (
          <div className="ts-card is-empty" role="presentation" data-control="filmstrip.empty">
            <span className="ts-card-n" />
            <span className="ts-card-frame">
              <span className="ts-card-empty">{FILMSTRIP.empty}</span>
            </span>
          </div>
        ) : null}
        {sections.map((section) => (
          <Fragment key={section.id}>
            {showSections ? (
              <div
                className={cn(
                  'ts-film-section',
                  drop !== null &&
                    'sectionId' in drop &&
                    drop.sectionId === section.id &&
                    'is-drop',
                  refused === section.id && 'is-refused',
                )}
                role="presentation"
                data-section={section.id}
                onDragOver={(event) => onDragOverSection(section, event)}
                onDrop={onDrop}
              >
                {section.label}
              </div>
            ) : null}
            {section.items.map((item) => (
              <FilmCard
                key={item.id}
                item={item}
                facts={factsOf(item)}
                current={item.id === active}
                selected={selected.includes(item.id)}
                theme={theme}
                dragging={dragging?.includes(item.id) ?? false}
                drop={drop !== null && 'id' in drop && drop.id === item.id ? drop.half : null}
                refused={refused === item.id}
                onPick={onPick}
                onOpenGrid={openGrid}
                onMenu={openMenu}
                onDragStart={onDragStart}
                onDragOver={onDragOverCard}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                follow={item.id === active ? follow : undefined}
              />
            ))}
          </Fragment>
        ))}
      </div>
      {menu ? (
        <ContextMenu
          target="filmstripCard"
          context={menuContext(menu.ids)}
          anchor={{ x: menu.x, y: menu.y }}
          returnFocusTo={menu.anchor}
          layout={menu.layout}
          onLayout={(layout) => applyLayoutTo(menu.ids, layout)}
          onSelect={(item) => runMenuItem(item, menu.ids)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </aside>
  );
}

/** The centre of an element in client pixels, where the keyboard opens its menu. */
function centerOf(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
