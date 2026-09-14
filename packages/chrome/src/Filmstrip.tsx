import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent, RefObject } from 'react';
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import { applyLayout, appliedLabel } from '@turboslide/schema/apply-layout';
import type { Slide } from '@turboslide/schema/deck';
import type { LayoutId } from '@turboslide/schema/layouts';
import { derivedLayout, isLayoutId } from '@turboslide/schema/layouts';
import { clipboardStore, pastedSlideInserts } from '@turboslide/viewer/clipboard';
import type { ClipboardPayload } from '@turboslide/viewer/clipboard';
import { useNearWindow } from '@turboslide/viewer/GridView';
import { useTheme } from '@turboslide/viewer/theme';
import { ContextMenu } from './ContextMenu';
import type { EditorDispatch } from './dispatch';
import { GtMark } from './GtMark';
import { cn } from './lib/cn';
import { detectPlatform } from './menus/keys.ts';
import type { MenuContext, MenuItem } from './menus/model.ts';
import { DEFAULT_MENU_CONTEXT } from './menus/model.ts';
import { FILMSTRIP, SNACKBARS } from './menus/strings.ts';
import { CommentCountChip, FilmstripMarks } from './presence/FilmstripMarks';
import { usePtShell } from './shell-context';
import type { ShellItem, ShellSection } from './shell-data';
import { Thumb } from './Thumb';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';
import type { FilmstripHandle, SidebarEdit, SidebarProps } from './Sidebar';

import './Filmstrip.css';

// The editor's filmstrip (gslides-parity SPEC 4.1, 4.2, 4.5), moved out of Sidebar.tsx in round
// four (gslides-parity SPEC-4 0.44 and 3.12, PP 7 row 7; MILESTONES-4 B4 item 2) with the follow
// helper the tree shares. The cards are clone first (SPEC-4 0.30): a card is the renderer's HTML
// for its slide at the local commit and never asks the render route for a capture, and one
// IntersectionObserver over the list decides which cards hold a clone (0.41). Sidebar.tsx picks
// this component for the editor and keeps the viewer's tree.

/** the distance a followed row keeps from the list's edges */
export const FOLLOW_MARGIN = 8;
/** Smooth unless the reader asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
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
export function makeFollow(listRef: RefObject<HTMLElement | null>, ready: RefObject<boolean>) {
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

/** The card's handlers, one stable object per filmstrip mount so a memoized card never holds a stale closure. */
type FilmCardHandlers = {
  onPick: (item: ShellItem, event: MouseEvent<HTMLElement>) => void;
  onOpenGrid: () => void;
  onMenu: (item: ShellItem, point: { x: number; y: number }, anchor: HTMLElement) => void;
  onDragStart: (item: ShellItem, event: DragEvent<HTMLElement>) => void;
  onDragOver: (item: ShellItem, event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

type FilmCardProps = {
  item: ShellItem;
  facts: CardFacts;
  current: boolean;
  selected: boolean;
  theme: 'light' | 'dark';
  dragging: boolean;
  drop: 'before' | 'after' | null;
  refused: boolean;
  /** the shared window's decision (SPEC-4 0.41): the clone mounts while true */
  near: boolean;
  handlers: FilmCardHandlers;
  /** the shared window's ref callback for this card */
  track: (el: HTMLElement | null) => void;
  follow?: (el: HTMLElement | null) => void;
};

/** The current slide's card carries the name the route transition of SPEC-4 0.40 animates. */
const CURRENT_CARD_STYLE: CSSProperties = { viewTransitionName: 'ts-card-current' };

/**
 * Two cards render the same pixels when these agree; the handlers object is stable for the mount
 * and the item's fields are compared by value, because the shell rebuilds its item objects on
 * every write (a write re-renders the cards whose slide changed, not 85; SPEC-4 0.41).
 */
function sameCard(prev: FilmCardProps, next: FilmCardProps): boolean {
  return (
    prev.item.id === next.item.id &&
    prev.item.n === next.item.n &&
    prev.item.title === next.item.title &&
    prev.item.html === next.item.html &&
    prev.item.kind === next.item.kind &&
    prev.item.shot?.light === next.item.shot?.light &&
    prev.item.shot?.dark === next.item.shot?.dark &&
    prev.facts.skip === next.facts.skip &&
    prev.facts.template === next.facts.template &&
    prev.facts.kind === next.facts.kind &&
    prev.facts.pictureLayout === next.facts.pictureLayout &&
    prev.current === next.current &&
    prev.selected === next.selected &&
    prev.theme === next.theme &&
    prev.dragging === next.dragging &&
    prev.drop === next.drop &&
    prev.refused === next.refused &&
    prev.near === next.near &&
    prev.handlers === next.handlers &&
    prev.track === next.track &&
    prev.follow === next.follow
  );
}

/**
 * One card (SPEC 4.1): the number in a 28 px gutter in tabular figures, the 16:9 thumbnail in a
 * --pt-edge frame, the current card ringed in ink at 2 px, a skipped card at 40 percent with the
 * eye-slash glyph; the title is the tooltip. No title under the card, no kind glyph, no lint
 * badge, no lease dot, no row menu. The thumbnail is clone first and capture never (gslides-parity
 * SPEC-4 0.30, reversing SPEC 5.5 for the editor on R04's measurements): the renderer's HTML for
 * the slide at the local commit, so an edit shows on its card at the next frame and the card asks
 * the render route for nothing; the clone mounts while the shared window says the card is near
 * (0.41) and the plate stands otherwise.
 */
const FilmCard = memo(function FilmCardBase({
  item,
  facts,
  current,
  selected,
  theme,
  dragging,
  drop,
  refused,
  near,
  handlers,
  track,
  follow,
}: FilmCardProps) {
  const n = item.n ? String(Number(item.n)) : '';
  const name = `Slide ${n}${facts.skip ? ', skipped' : ''}`;
  const tip = tipProps({
    name: item.title,
    ...(facts.skip ? { doc: FILMSTRIP.skipped } : {}),
  });
  const { onPick, onOpenGrid, onMenu, onDragStart, onDragOver, onDrop, onDragEnd } = handlers;
  /* one ref callback for the observer and the follow, stable while neither changes, so the follow
     still fires when the card mounts or becomes current and never on an unrelated render */
  const ref = useMemo(
    () => (el: HTMLElement | null) => {
      track(el);
      follow?.(el);
    },
    [track, follow],
  );
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
      data-near={near ? '' : undefined}
      style={current ? CURRENT_CARD_STYLE : undefined}
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
      ref={ref}
      {...tip}
    >
      <span className="ts-card-n">
        {n}
        <CommentCountChip slideId={item.id} />
      </span>
      <span className="ts-card-frame">
        <Thumb
          html={item.html}
          theme={theme}
          frame={false}
          fallbackText={n}
          capture="never"
          near={near}
        />
        <FilmstripMarks
          slideId={item.id}
          picture={facts.kind === 'opener' || facts.kind === 'mood' || facts.kind === 'closing'}
        />
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
}, sameCard);

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
export function Filmstrip({
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
  /* one observer over the list decides which cards hold a clone (SPEC-4 0.41) */
  const window_ = useNearWindow(listRef);

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

  /* the handle the shell reads for Edit > Select all and Select none (SPEC-2 8.6, 0.61) */
  const orderRef = useRef(order);
  orderRef.current = order;
  const registerRef = useRef(edit.registerHandle);
  registerRef.current = edit.registerHandle;
  useEffect(() => {
    const handle: FilmstripHandle = {
      selectAll: () => setSelection([...orderRef.current]),
      selectNone: () => setSelection(active ? [active] : []),
      selected: () => [...selectedRef.current],
    };
    registerRef.current?.(handle);
    return () => registerRef.current?.(null);
    // setSelection reads refs; the handle is stable for the mount
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

  /**
   * Removes the cards; `quiet` for Cut (SPEC-2 0.30, R08 A24: Google's Cut shows no snackbar and
   * Undo stays on Cmd+Z), the snackbar with Undo for Delete.
   */
  const removeSlides = (ids: string[], quiet = false) => {
    const ordered = order.filter((id) => ids.includes(id));
    if (ordered.length === 0) return;
    for (const id of ordered) void dispatch('slide.remove', { slideId: id }).catch(() => undefined);
    const count = ordered.length;
    if (quiet) return;
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
        void copySlides(ids).then(() => removeSlides(ids, true));
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

  /* the cards' handlers read this render's closures through one stable object, so a memoized
     card (SPEC-4 0.41) calls the current onPick, never the one of the render it was drawn in */
  const latestHandlers = useRef<FilmCardHandlers>({
    onPick,
    onOpenGrid: openGrid,
    onMenu: openMenu,
    onDragStart,
    onDragOver: onDragOverCard,
    onDrop,
    onDragEnd,
  });
  latestHandlers.current = {
    onPick,
    onOpenGrid: openGrid,
    onMenu: openMenu,
    onDragStart,
    onDragOver: onDragOverCard,
    onDrop,
    onDragEnd,
  };
  const [handlers] = useState<FilmCardHandlers>(() => ({
    onPick: (item, event) => latestHandlers.current.onPick(item, event),
    onOpenGrid: () => latestHandlers.current.onOpenGrid(),
    onMenu: (item, point, anchor) => latestHandlers.current.onMenu(item, point, anchor),
    onDragStart: (item, event) => latestHandlers.current.onDragStart(item, event),
    onDragOver: (item, event) => latestHandlers.current.onDragOver(item, event),
    onDrop: (event) => latestHandlers.current.onDrop(event),
    onDragEnd: () => latestHandlers.current.onDragEnd(),
  }));

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
                near={window_.isNear(item.id)}
                handlers={handlers}
                track={window_.track(item.id)}
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
