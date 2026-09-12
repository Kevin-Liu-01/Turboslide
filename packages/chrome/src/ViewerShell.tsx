import type { ReactNode, TouchEvent } from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { resolveSlideHash, writeSlideHash } from '@turboslide/viewer/hash';
import type { SlideHashForm } from '@turboslide/viewer/hash';
import { toggleTheme } from '@turboslide/viewer/theme';

import { HelpCard } from './HelpCard';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import { PreviewLayer } from './PreviewLayer';
import type { PreviewSubject } from './PreviewLayer';
import { Progress } from './Progress';
import { ShellContext, StageContext } from './shell-context';
import type { ShellDir, ShellState, ShellTransition, StageSize, StageState } from './shell-context';
import { flattenShellItems, pagedShellItems, resolveShellKeys } from './shell-data';
import type {
  ShellDensity,
  ShellItem,
  ShellKeysProp,
  ShellMode,
  ShellSection,
  ShellThumb,
} from './shell-data';
import { Sidebar } from './Sidebar';
import type { SidebarEdit, SidebarFilter } from './Sidebar';
import { Toast, useToast } from './Toast';
import { Toolbar } from './Toolbar';
import { useShellKeys } from './useShellKeys';

import './ViewerShell.css';

/** The sidebar preference, shared by every shell: '0' hides the list. */
const SIDEBAR_KEY = 'gt-shell-sb';

/** The sidebar density preference, shared by every shell. */
const DENSITY_KEY = 'gt-shell-density';

/** The shells that have shown the first-visit hint, comma separated. */
const HINT_KEY = 'gt-shell-hint';

/** The first-visit toast (directive 7.4) and how long it holds. */
const HINT_TEXT = 'Arrow keys move. Press ? for every shortcut.';
const HINT_HOLD_MS = 5000;

/** At or below this width the sidebar is an overlay and the sheet pad shrinks. */
const NARROW_PX = 900;

/** At or below this width a first visit to a paged route opens the book when the route offers one. */
const PHONE_PX = 600;

/** A touch that starts within this many pixels of the left edge and travels SWIPE_PX opens the narrow list. */
const EDGE_PX = 24;
const SWIPE_PX = 40;

/** Motion lengths, matching the --pt-dur-* tokens in tokens.css (directive 7.4). */
const SB_MS = 220;
const ENTER_MS = 200;

/** Why the sidebar column is moving; ViewerShell.css keys the content fade on it. */
type SidebarMotion = 'open' | 'close' | 'density';

/** The transition in flight, plus whether the browser is animating it (view transitions) or CSS is (the fallback). */
type Transition = ShellTransition & { native: boolean };

/**
 * The one frame for Turboslide's viewer, ported from
 * Prototemplate/src/components/viewer/ViewerShell.tsx (SPEC 2.2, 6.1): a
 * fixed full-viewport grid of a sidebar and a main region (toolbar, stage,
 * progress line), with the help card, the toast and the preview layer
 * floating over it. The shell owns the state every child reads through
 * usePtShell() and no content rules at all: the route renders the stage
 * content (the viewer's Stage, GridView and BookView) as children, reading
 * the mode from the context.
 *
 * Landing. The server renders the defaults (the list open in thumbnail
 * density, the first item active, or the item the route read from its
 * search and hash). The mount effect applies the saved state and the hash
 * and publishes `ready`; one frame later the root gains data-settled and
 * only then do the column transitions apply, so a saved closed list is a
 * cut on load, never a 220ms animation from the server's layout.
 *
 * Motion (directive 7.4). A mode change cross-fades the stage through the
 * View Transitions API when the browser has it and through data-entering
 * otherwise. The sidebar column animates its width while the list's content
 * fades, and the list stays in the DOM for the closing duration through
 * sidebarShown. Reduced motion skips all of it.
 *
 * The grid takes the whole main region: entering it closes the sidebar
 * column without touching the saved preference, and leaving it brings the
 * column back.
 */
export type ViewerShellProps = {
  /** storage namespace: gt-shell-mode:<id>; also body[data-shell] */
  id: string;
  title: string;
  /** already worded: `85 slides` */
  count: string;
  sections: readonly ShellSection[];
  /** the item to open when the hash names none; defaults to the first item */
  active?: string;
  /** the modes the route offers; the first is the default */
  modes: readonly ShellMode[];
  /** the mode the route asked for (?mode=), ahead of the saved one */
  initialMode?: ShellMode;
  thumb: ShellThumb;
  /** the hash form the shell writes on every move, or false to leave the address alone */
  hash: SlideHashForm | false;
  /** called after every selection with the item and its 1-based number */
  onSelect?: (id: string, n: number) => void;
  /** called after every mode change, for the route's ?mode= search param */
  onModeChange?: (mode: ShellMode) => void;
  /** the route's own controls, first in the toolbar's right group */
  toolbarSlot?: ReactNode;
  /** the key table, or a function of the mode */
  keys: ShellKeysProp;
  /** the word in the digit toast and the help rows; `slide` unless the route says otherwise */
  noun?: string;
  /** the route's own words for the mode seg */
  modeLabels?: Partial<Record<ShellMode, string>>;
  /** the sidebar mark's link, back to the deck list */
  homeHref?: string;
  /** a node after the sidebar title: the fixture chip */
  headAside?: ReactNode;
  /**
   * The editor's additions (SPEC 6.1, M3). `onSearch` opens the palette from the toolbar's
   * Search pill and Cmd K (the shell's `search` flag follows it); `searchOpen` draws the pill's
   * ink frame; `toolbarStatus` is the status chip left of Search; `panel` is the inspector,
   * docked in the main region's second column under the toolbar's rule; `drawer` is the source
   * drawer, over the stage; `sidebarEdit` turns the tree's drag reorder and row menu on.
   */
  onSearch?: () => void;
  searchOpen?: boolean;
  toolbarStatus?: ReactNode;
  panel?: ReactNode;
  drawer?: ReactNode;
  sidebarEdit?: SidebarEdit;
  /** the stage content */
  children?: ReactNode;
};

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the choice holds for the session only
  }
}

function isNarrow(): boolean {
  return window.innerWidth <= NARROW_PX;
}

function isDensity(value: string | null): value is ShellDensity {
  return value === 'outline' || value === 'thumbs';
}

/** The reader has asked for no motion: every transition commits at once. */
function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ViewerShell({
  id,
  title,
  count,
  sections,
  active: initialActive,
  modes,
  initialMode,
  thumb,
  hash,
  onSelect,
  onModeChange,
  toolbarSlot,
  keys,
  noun = 'slide',
  modeLabels,
  homeHref,
  headAside,
  onSearch,
  searchOpen = false,
  toolbarStatus,
  panel,
  drawer,
  sidebarEdit,
  children,
}: ViewerShellProps) {
  const items = useMemo(() => flattenShellItems(sections), [sections]);
  const paged = useMemo(() => pagedShellItems(sections), [sections]);
  const defaultMode = modes[0] ?? 'slide';

  const [mode, setModeState] = useState<ShellMode>(
    initialMode && modes.includes(initialMode) ? initialMode : defaultMode,
  );
  const [transition, setTransition] = useState<Transition | null>(null);
  /* thumbnails first (Kevin, 2026-09-11: "the default should be images"); the saved choice applies on mount */
  const [density, setDensityState] = useState<ShellDensity>('thumbs');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  /* the List button's override while the grid is up: the column is closed there unless the reader opens it */
  const [gridList, setGridList] = useState(false);
  const [sbMotion, setSbMotion] = useState<SidebarMotion | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [present, setPresentState] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [active, setActive] = useState<string>(() => initialActive ?? items[0]?.id ?? '');
  const [dir, setDir] = useState<ShellDir>('next');
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  /* true once the mount effect has applied the saved state and the hash */
  const [booted, setBooted] = useState(false);
  /* true one frame after that: from here on the column transitions apply */
  const [settledState, setSettledState] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const filter = useRef<SidebarFilter>({ active: false, clear: () => undefined });
  const toast = useToast();
  const sayRef = useRef(toast.say);
  sayRef.current = toast.say;

  const transitionTimer = useRef(0);
  const transitionStamp = useRef(0);
  const sbTimer = useRef(0);
  /* false until the first frame after landing: a mode set while landing commits without a cross-fade */
  const settled = useRef(false);

  /* the column the reader sees: the preference, closed by the grid unless
     the reader opened it there; the narrow overlay follows the toggle alone */
  const listOpen = narrow ? sidebarOpen : mode === 'grid' ? gridList : sidebarOpen;

  /* the mount-time listeners read the latest values through these refs */
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pagedRef = useRef(paged);
  pagedRef.current = paged;
  const activeRef = useRef(active);
  activeRef.current = active;
  const narrowRef = useRef(narrow);
  narrowRef.current = narrow;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onModeRef = useRef(onModeChange);
  onModeRef.current = onModeChange;
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const modesRef = useRef(modes);
  modesRef.current = modes;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const sidebarRef = useRef(listOpen);
  sidebarRef.current = listOpen;
  const prefRef = useRef(sidebarOpen);
  prefRef.current = sidebarOpen;
  const presentRef = useRef(present);
  presentRef.current = present;
  const densityRef = useRef(density);
  densityRef.current = density;
  const hashRef = useRef(hash);
  hashRef.current = hash;

  const index = paged.findIndex((item) => item.id === active);
  const total = paged.length;
  const resolvedKeys = resolveShellKeys(keys, mode);

  const select = (next: string) => {
    if (next && !itemsRef.current.some((item) => item.id === next)) return;
    const list = pagedRef.current;
    const from = list.findIndex((item) => item.id === activeRef.current);
    const to = list.findIndex((item) => item.id === next);
    if (from >= 0 && to >= 0 && from !== to) setDir(to > from ? 'next' : 'prev');
    setActive(next);
    activeRef.current = next;
    const form = hashRef.current;
    if (form && to >= 0) writeSlideHash(form, { id: next, n: to + 1 });
    onSelectRef.current?.(next, to + 1);
  };

  const step = (delta: number) => {
    const list = pagedRef.current;
    if (list.length === 0) return;
    const at = list.findIndex((item) => item.id === activeRef.current);
    const next =
      at < 0
        ? delta > 0
          ? 0
          : list.length - 1
        : Math.max(0, Math.min(list.length - 1, at + delta));
    const target = list[next];
    if (target && target.id !== activeRef.current) select(target.id);
  };

  /* the sidebar column is moving: the content fades for the duration and the
     list stays in the DOM through a close (sidebarShown) */
  const moveSidebar = (kind: SidebarMotion) => {
    window.clearTimeout(sbTimer.current);
    if (reducedMotion()) {
      setSbMotion(null);
      return;
    }
    setSbMotion(kind);
    sbTimer.current = window.setTimeout(() => setSbMotion(null), SB_MS);
  };

  /* the slide shows one paged item, so entering it with nothing paged marked
     opens the first. The grid closes the column and hands it back on leave;
     `columnMotion` is false when present mode is about to hide the column anyway */
  const commitMode = (next: ShellMode, columnMotion = true) => {
    const from = modeRef.current;
    setModeState(next);
    modeRef.current = next;
    if (next === 'grid' && from !== 'grid') {
      setGridList(false);
      if (columnMotion && prefRef.current && !presentRef.current && !narrowRef.current)
        moveSidebar('close');
    } else if (next !== 'grid' && from === 'grid') {
      if (columnMotion && prefRef.current && !presentRef.current && !narrowRef.current)
        moveSidebar('open');
    }
    if (next === 'slide') {
      const list = pagedRef.current;
      const first = list[0];
      if (first && !list.some((item) => item.id === activeRef.current)) select(first.id);
    }
    onModeRef.current?.(next);
  };

  /**
   * The cross-fade. With the View Transitions API the browser snapshots the
   * stage, the commit runs inside its callback (flushSync, so the new view
   * is in the DOM when the new snapshot is taken) and ViewerShell.css
   * animates the two images. Without the API the commit is immediate and
   * data-entering carries the CSS fade-in for the enter duration. While
   * landing, or under reduced motion, the mode just changes.
   */
  const switchMode = (from: ShellMode, to: ShellMode) => {
    window.clearTimeout(transitionTimer.current);
    const stamp = ++transitionStamp.current;
    const done = () => {
      if (transitionStamp.current === stamp) setTransition(null);
    };
    if (!settled.current || reducedMotion()) {
      commitMode(to);
      setTransition(null);
      return;
    }
    if (typeof document.startViewTransition !== 'function') {
      setTransition({ from, to, native: false });
      commitMode(to);
      transitionTimer.current = window.setTimeout(done, ENTER_MS);
      return;
    }
    setTransition({ from, to, native: true });
    const view = document.startViewTransition(() => {
      flushSync(() => commitMode(to));
    });
    view.ready.catch(() => undefined);
    view.finished.then(done, done);
  };

  const setMode = (next: ShellMode) => {
    if (!modesRef.current.includes(next)) return;
    store(`gt-shell-mode:${id}`, next);
    const from = modeRef.current;
    if (from === next) return;
    switchMode(from, next);
  };

  const setDensity = (next: ShellDensity) => {
    if (next === densityRef.current) return;
    setDensityState(next);
    store(DENSITY_KEY, next);
    if (sidebarRef.current && !presentRef.current && !narrowRef.current) moveSidebar('density');
  };

  const setSidebar = (open: boolean) => {
    if (open === sidebarRef.current) return;
    /* inside the grid the toggle is an override for the mode's duration, not the preference */
    if (modeRef.current === 'grid' && !narrowRef.current) {
      setGridList(open);
      if (!presentRef.current) moveSidebar(open ? 'open' : 'close');
      return;
    }
    setSidebarOpen(open);
    /* the overlay at narrow widths is a passing state, not a preference */
    if (!narrowRef.current) store(SIDEBAR_KEY, open ? '1' : '0');
    if (!presentRef.current) moveSidebar(open ? 'open' : 'close');
  };

  const setPanel = (open: boolean) => setPanelOpen(open);
  const setHelp = (open: boolean) => setHelpOpen(open);

  /* presenting keeps the sheet that is up: only the grid, which has no sheet,
     hands over to the slide; the list leaves with the chrome and comes back with it */
  const setPresent = (on: boolean) => {
    if (on === presentRef.current) return;
    if (on) {
      if (modeRef.current === 'grid') {
        commitMode(
          modesRef.current.includes('slide') ? 'slide' : (modesRef.current[0] ?? 'slide'),
          false,
        );
      }
      setPanelOpen(false);
    }
    setPresentState(on);
    presentRef.current = on;
    if (sidebarRef.current && !narrowRef.current) moveSidebar(on ? 'close' : 'open');
  };

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.changedTouches[0];
    touchX.current =
      narrow && !sidebarOpen && touch && touch.clientX <= EDGE_PX ? touch.clientX : null;
  };

  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const start = touchX.current;
    touchX.current = null;
    const touch = e.changedTouches[0];
    if (start === null || !touch) return;
    if (touch.clientX - start > SWIPE_PX) setSidebar(true);
  };

  useMountEffect(() => {
    document.body.dataset.shell = id;

    /* persisted mode (unless the route asked for one; a first visit on a
       phone opens the book where the route has one), density, the hash, the
       width, the sidebar preference */
    const savedMode = load(`gt-shell-mode:${id}`);
    if (initialMode && modesRef.current.includes(initialMode)) {
      setModeState(initialMode);
      modeRef.current = initialMode;
    } else if (savedMode && modesRef.current.some((m) => m === savedMode)) {
      setModeState(savedMode as ShellMode);
      modeRef.current = savedMode as ShellMode;
    } else if (!savedMode && window.innerWidth <= PHONE_PX && modesRef.current.includes('book')) {
      setModeState('book');
      modeRef.current = 'book';
    }
    const savedDensity = load(DENSITY_KEY);
    if (isDensity(savedDensity)) setDensityState(savedDensity);
    const fromHash = resolveSlideHash(
      window.location.hash,
      itemsRef.current.map((item) => item.id),
    );
    if (fromHash) {
      setActive(fromHash);
      activeRef.current = fromHash;
    }
    const startNarrow = isNarrow();
    setNarrow(startNarrow);
    narrowRef.current = startNarrow;
    setSidebarOpen(startNarrow ? false : load(SIDEBAR_KEY) !== '0');
    setBooted(true);

    /* the first visit to a shell: the toast names the arrows and the help key */
    const seen = (load(HINT_KEY) ?? '').split(',').filter(Boolean);
    if (!seen.includes(id)) {
      store(HINT_KEY, [...seen, id].join(','));
      sayRef.current(HINT_TEXT, HINT_HOLD_MS);
    }

    const onHash = () => {
      const next = resolveSlideHash(
        window.location.hash,
        itemsRef.current.map((item) => item.id),
      );
      if (next && next !== activeRef.current) select(next);
    };
    const onFullscreen = () => setPresent(Boolean(document.fullscreenElement));
    const onResize = () => {
      const now = isNarrow();
      if (now === narrowRef.current) return;
      narrowRef.current = now;
      setNarrow(now);
      setSidebarOpen(now ? false : load(SIDEBAR_KEY) !== '0');
    };
    window.addEventListener('hashchange', onHash);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('resize', onResize);

    /* the stage box, for the fixed sheet's fit */
    const stage = stageRef.current;
    const measure = () => {
      if (!stage) return;
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      setStageSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && stage) {
      observer = new ResizeObserver(measure);
      observer.observe(stage);
    }

    return () => {
      window.clearTimeout(transitionTimer.current);
      window.clearTimeout(sbTimer.current);
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
      if (document.body.dataset.shell === id) delete document.body.dataset.shell;
    };
  });

  /* the settle: one frame after the saved state is in the DOM, so the
     column transitions can never run from the server's layout */
  useLayoutEffect(() => {
    if (!booted) return;
    const frame = requestAnimationFrame(() => {
      settled.current = true;
      setSettledState(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [booted]);

  /* the list is in the DOM while it is wanted, and for the closing duration after */
  const sidebarShown = (listOpen && !present) || sbMotion === 'close';
  const published: ShellTransition | null = useMemo(
    () => (transition ? { from: transition.from, to: transition.to } : null),
    [transition],
  );

  const state: ShellState = useMemo(
    () => ({
      id,
      modes,
      keys: resolvedKeys,
      noun,
      items,
      paged,
      mode,
      transition: published,
      density,
      sidebarOpen: listOpen,
      sidebarShown,
      panelOpen,
      helpOpen,
      present,
      narrow,
      active,
      index,
      dir,
      total,
      ready: booted,
      search: onSearch !== undefined,
      setMode,
      setDensity,
      setSidebar,
      setPanel,
      setHelp,
      setPresent,
      select,
      step,
      say: toast.say,
    }),
    // the handlers close over refs and setters only, so the state fields are the real dependencies
    [
      id,
      modes,
      resolvedKeys,
      noun,
      items,
      paged,
      mode,
      published,
      density,
      listOpen,
      sidebarShown,
      panelOpen,
      helpOpen,
      present,
      narrow,
      active,
      index,
      dir,
      total,
      booted,
      onSearch,
      toast.say,
    ],
  );

  const stage: StageState = useMemo(() => ({ stageSize }), [stageSize]);

  useShellKeys(state, {
    toggleTheme,
    /* the Escape ladder's filter rung: true when the sidebar filter had text to clear */
    clearFilter: () => {
      if (!filter.current.active) return false;
      filter.current.clear();
      return true;
    },
    /* Cmd K opens the palette when the route offers one (SPEC 6.3) */
    openSearch: () => onSearchRef.current?.(),
  });

  const overlayOpen = narrow && sidebarShown;
  /* the sidebar column: closed, or open at the density's width */
  const sb = present || narrow || !listOpen ? '0' : density;

  const resolvePreview = (previewId: string): PreviewSubject | null => {
    const item: ShellItem | undefined = itemsRef.current.find((entry) => entry.id === previewId);
    if (!item || !item.html) return null;
    return { name: item.title, html: item.html };
  };

  const hrefFor = (item: ShellItem): string => {
    const n = pagedRef.current.indexOf(item) + 1;
    return hash === 'n' && n > 0 ? `#${n}` : `#s/${encodeURIComponent(item.id)}`;
  };

  return (
    <ShellContext value={state}>
      <StageContext value={stage}>
        <div
          className={cn('pt-viewer', present && 'is-present', overlayOpen && 'sb-open')}
          data-shell={id}
          data-mode={mode}
          data-active={active}
          data-index={index}
          data-total={total}
          data-dir={dir}
          data-sb={sb}
          data-density={density}
          data-settled={settledState ? '' : undefined}
          data-sb-moving={sbMotion ?? undefined}
          data-entering={transition && !transition.native ? transition.to : undefined}
          onTouchStart={narrow ? onTouchStart : undefined}
          onTouchEnd={narrow ? onTouchEnd : undefined}
        >
          {overlayOpen ? (
            <button
              type="button"
              className="pt-sb-scrim"
              aria-label="Close the list (Esc)"
              onClick={() => setSidebar(false)}
            />
          ) : null}
          <Sidebar
            title={title}
            count={count}
            sections={sections}
            thumb={thumb}
            hrefFor={hrefFor}
            filter={filter}
            homeHref={homeHref}
            aside={headAside}
            edit={sidebarEdit}
          />
          <section className="pt-main" data-panel={panel ? '' : undefined}>
            <Toolbar
              title={title}
              slot={toolbarSlot}
              modeLabels={modeLabels}
              onSearch={onSearch}
              searchOpen={searchOpen}
              status={toolbarStatus}
            />
            <div ref={stageRef} className="pt-stagewrap">
              {children}
            </div>
            <Progress />
            {/* the source drawer, over the stage and the progress track (SPEC 6.6) */}
            {drawer}
            {/* the inspector, in the second column under the toolbar's rule (SPEC 6.1, 6.5) */}
            {panel}
          </section>
        </div>
        <HelpCard />
        <Toast message={toast.message} on={toast.on} />
        {/* the one preview layer (directive 8.6): every data-preview under the shell opens its clone here */}
        <PreviewLayer resolve={resolvePreview} />
      </StageContext>
    </ShellContext>
  );
}
