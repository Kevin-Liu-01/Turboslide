import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react';
import { Fragment, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Deck, DeckDocument, Slide, SlideKind } from '@turboslide/schema/deck';
import type { ClipboardStore } from '@turboslide/viewer/clipboard';
import { useNearWindow } from '@turboslide/viewer/GridView';
import { useTheme } from '@turboslide/viewer/theme';
import type { EditorDispatch } from './dispatch';
import { EditorShellContext } from './editor-shell-context';
import { GtMark } from './GtMark';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import type { MenuItem, MenuSetting } from './menus/model.ts';
import { blankSlide, freeSlideId } from './palette-data';
import { OutlineMarks } from './presence/FilmstripMarks';
import { Seg } from './Seg';
import type { SegOption } from './Seg';
import { usePtShell } from './shell-context';
import type { ShellDensity, ShellItem, ShellSection, ShellThumb } from './shell-data';
import { SidebarFilter as FilterRow } from './SidebarFilter';
import { SLIDE_TEMPLATES, templateTitle } from './slide-templates';
import { Thumb } from './Thumb';
import { ToolButton } from './ToolButton';
import { mergeTipProps, tipProps } from './Tooltip';
import { Filmstrip, makeFollow } from './Filmstrip';

import './Sidebar.css';

/* the pure helpers of the filmstrip stay reachable from this module (sidebar-filmstrip.test.tsx) */
export { DROP_SHAKE_MS, droppedOrder, newSlideLayout } from './Filmstrip';

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
  /**
   * The filmstrip's handle (gslides-parity SPEC-2 8.6, 0.30, 0.61): Edit > Select all with the
   * filmstrip focused selects every card, Edit > Select none clears the multi selection. Called
   * with the handle on mount and null on unmount.
   */
  registerHandle?: (handle: FilmstripHandle | null) => void;
};

/** What the filmstrip exposes to the shell and the route (SPEC-2 8.6). */
export type FilmstripHandle = {
  /** selects every card */
  selectAll: () => void;
  /** clears the multi selection back to the current card */
  selectNone: () => void;
  /** the selected card ids in deck order */
  selected: () => string[];
};

/** Where the reader's folds live: one key per shell holding a JSON map of section id to open or closed. */
const STORAGE_KEY = 'gt-shell-groups';

/** What the arrow keys walk, in document order: headers and rows. */
const WALK = '.pt-grp-head, .pt-orow';

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
function Card({ item, theme, near }: { item: ShellItem; theme: 'light' | 'dark'; near: boolean }) {
  return (
    <span className="pt-thumb-frame is-card">
      <Thumb
        shot={item.shot}
        html={item.html}
        theme={theme}
        frame={false}
        fallbackText={item.n || item.title.charAt(0)}
        near={near}
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
  /** the shared window's decision for the row's clone (SPEC-4 0.41) and its ref callback */
  near: boolean;
  track: (el: HTMLElement | null) => void;
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
function TreeRow({
  section,
  item,
  active,
  shots,
  theme,
  href,
  onPick,
  follow,
  near,
  track,
  edit,
}: RowProps) {
  const lint = item.lint && (item.lint.s3 > 0 || item.lint.s2 > 0) ? item.lint : null;
  /* one ref for the window and the follow; stable while neither changes, so the follow keeps
     firing on mount and on becoming current alone */
  const ref = useMemo(
    () => (el: HTMLElement | null) => {
      track(el);
      follow?.(el);
    },
    [track, follow],
  );
  /* the row's tooltip is the Tooltip primitive, as every control of the chrome (AGENTS.md; the
     focus round, cycle 3 fix, VERIFICATION C2-F13: the rows were the tooltip audit's one title
     only hit, `a.pt-orow` with a native title and no primitive); the row's own press and Space
     handlers run first, the primitive's after (mergeTipProps) */
  const tip = mergeTipProps(
    {
      onMouseDown: pressWithoutFocus,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => onRowSpace(event, () => onPick(item, null)),
    },
    tipProps({
      name: item.title || `Slide ${item.n ?? ''}`.trim(),
      doc: edit
        ? 'Go to this slide. Drag to move it; right click or the dots open its menu.'
        : 'Go to this slide.',
    }),
  );
  return (
    <a
      className={cn('pt-orow', active && 'is-active', edit?.dragging && 'is-dragging')}
      href={href}
      data-preview={item.id}
      data-id={item.id}
      data-drop={edit?.drop ?? undefined}
      aria-current={active ? 'true' : undefined}
      draggable={edit ? true : undefined}
      {...tip}
      onClick={(event) => onPick(item, event)}
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
      ref={ref}
    >
      <span className="pt-orow-n">{item.n ?? ''}</span>
      {shots ? <Card item={item} theme={theme} near={near} /> : null}
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <use href={`#${glyphOf(item)}`} />
      </svg>
      <span className="pt-orow-name">{item.title}</span>
      {lint || edit || true ? (
        <span className="pt-orow-marks">
          {lint ? (
            <span
              className="pt-orow-badge"
              data-severity={lint.s3 > 0 ? '3' : '2'}
              {...tipProps({
                name: 'Lint findings',
                doc: `${lint.s3} must fix, ${lint.s2} should fix.`,
              })}
            >
              {lint.s3 > 0 ? lint.s3 : lint.s2}
            </span>
          ) : null}
          <OutlineMarks slideId={item.id} />
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
  const shellState = useContext(EditorShellContext);
  if (edit !== undefined && settings?.sectionsTree !== true) {
    /* the shell reads the handle for Edit > Select all and Select none when the route passes none (SPEC-2 8.6) */
    const registerHandle = edit.registerHandle ?? shellState?.registerFilmstrip;
    return (
      <Filmstrip
        {...props}
        edit={{
          ...edit,
          ...(settings === undefined ? {} : { settings }),
          ...(registerHandle === undefined ? {} : { registerHandle }),
        }}
      />
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
  /* the viewer's sidebar takes the filmstrip's window (SPEC-4 0.41): the rows near the list hold
     a clone until their capture decodes, the rest the plate */
  const window_ = useNearWindow(listRef, { enabled: shots });

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
                    near={window_.isNear(item.id)}
                    track={window_.track(item.id)}
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
