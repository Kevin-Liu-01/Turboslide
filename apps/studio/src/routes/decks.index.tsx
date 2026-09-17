import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Link, createFileRoute, useAwaited, useNavigate, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { AppBarBrand } from '@turboslide/chrome/AppBarBrand';
import { EmptyFigure } from '@turboslide/chrome/EmptyFigure';
import { GtMark } from '@turboslide/chrome/GtMark';
import { Icon } from '@turboslide/chrome/icons';
import { Menu } from '@turboslide/chrome/Menu';
import type { MenuCloseReason } from '@turboslide/chrome/Menu';
import { DEFAULT_MENU_CONTEXT } from '@turboslide/chrome/menus/model';
import type { MenuItem } from '@turboslide/chrome/menus/model';
import { DIALOGS, HOME, SNACKBARS } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { useMountEffect } from '../components/useMountEffect';
import {
  RESTORING_STEP_MS,
  clearRestoringMarker,
  readRestoringMarker,
  restoringStep,
  sessionMarkerStorage,
} from './-restoring';
import { bundleDownloadTicket } from '../server/bundle';
import {
  copyStoredDeck,
  createNewDeck,
  listDecks,
  renameStoredDeck,
  restoreStoredDeck,
  trashStoredDeck,
} from '../server/decks';
import type { DeckCard } from '../server/decks';
import { getServerHealth } from '../server/health';
import { RouterLinkSlot } from './-link-slot';
import { parseRecentCookie, readOpened, readRecent, recordDeckOpened } from './-recent';
import type { DeckOpenFacts, RecentEntry } from './-recent';

import './decks.css';

/**
 * The home page, /decks (gslides-parity SPEC 6.2; R03 a.1 and finding 13): Google's three bands.
 * The app bar with the Turboslide lockup (the mark to this page, the word to /home; SPEC-4 0.16,
 * 1.10) and a search field that filters the list by title; "Start a new presentation" with the
 * Blank card (opens /new) and the GT brand deck card (a copy of the GT template, opened at once)
 * under a Template gallery link that scrolls to the strip; "Recent presentations" as a grid of
 * cards (a 320 by 180 thumbnail of slide 1 in the deck's appearance, the title, "Opened 2 hours
 * ago" from this browser's history or "Edited <date>") with a list view toggle, a sort control
 * and a per card menu (Open, Open in new tab, Present, Rename, Make a copy, Download, Move to
 * trash). Trash at the bottom links to /decks/trash. Every read is `deck.list` through the store
 * (server/decks.ts listDecks), the one call the Open dialog, the Import slides dialog, the CLI
 * and MCP share, so decks in the trash and unsaved drafts never appear. Recent is this browser's
 * own history first, then the store's updatedAt, so a rep sees their decks before other people's.
 *
 * The shell streams before the list (gslides-parity SPEC-4 0.29, 3.1; PP 3.1 item 3): the loader
 * awaits the server facts and the two cookies and returns the store listing as an unawaited
 * promise, which the router streams behind the document; the page renders the app bar, the strip,
 * the Recent band's head and the Recent row (this browser's own decks, drawn whole from the cookie
 * mirror of ./-recent.ts, one row of cards under "Opened on this device") at first byte, the card
 * grid's frames where the store's cards will stand, and the cards under `<Await>` when the
 * listing answers (on a fast store the listing is in the same document; on a slow one the frames
 * paint first and the cards stream in). The first twelve cards preload
 * the editor's loader when they enter the viewport (SPEC-4 0.39), the rest on intent. A refetch
 * (`router.invalidate()` after a rename, a copy or an undo) keeps the list on the page while the
 * new one loads (`StoreList` suspends on the first promise alone and takes the later ones through
 * an effect), so nothing blinks and no card exists twice. The page announces hydration (`data-hydrated`): a click on
 * the server's HTML before the handlers attach is lost (measured on the dev server), so the specs
 * wait for it. The file is decks.index.tsx, not decks.tsx: a decks.tsx would become the layout
 * route of decks.$deckId.assets.$ and run this loader for every asset request. The health call
 * stays so every build carries the server-only marker scripts/check-client-bundle.mjs looks for
 * (AGENTS.md).
 */
export const Route = createFileRoute('/decks/')({
  loader: async () => {
    const [health, cookies] = await Promise.all([getServerHealth(), readHomeCookies()]);
    // the store listing is not awaited: the router streams it behind the shell (SPEC-4 0.29)
    return { decks: listDecks(), node: health.node, prefs: cookies.prefs, recent: cookies.recent };
  },
  head: () => ({ meta: [{ title: `${HOME.recent}, Turboslide` }] }),
  component: HomePage,
});

// ---------------------------------------------------------------------------------------------
// This browser's history and settings (SPEC 6.2 "Recent"), in localStorage; private to the browser

/* the Recent record lives in ./-recent.ts since round four; re-exported for the readers of this module */
export { RECENT_KEY, readOpened, recordDeckOpened } from './-recent';

/** the view and sort the rep last chose */
const HOME_SETTINGS_KEY = 'turboslide:home';

export type HomeSort = 'opened' | 'modified' | 'title';
export type HomeView = 'grid' | 'list';

type HomeSettings = { sort: HomeSort; view: HomeView };

const DEFAULT_SETTINGS: HomeSettings = { sort: 'opened', view: 'grid' };

/** the cards that preload the editor's loader on viewport entry (SPEC-4 0.39) */
export const VIEWPORT_PRELOAD_CARDS = 12;

/** the Recent row's length: one row of the grid */
export const RECENT_ROW_CARDS = 4;

/**
 * The saved view and sort as a cookie the loader reads (gslides-parity SPEC-3 9.2 L1; research-3
 * 05 3.4 L1): `ts-home=view:list;sort:title`, same origin, one year, so the server renders the
 * rows or the cards and the order the rep chose and the first client render agrees with it (no
 * reflow of the recent band after hydration). localStorage stays the mirror. The `opened` order
 * is this browser's history; the Recent cookie of ./-recent.ts carries the newest twelve opens to
 * the server, so the band paints in its final order at first byte when the cookie is there and
 * is hidden until mounted (`data-pending`) when it is not (a browser that refuses cookies, or one
 * whose record predates round four).
 */
export const HOME_COOKIE = 'ts-home';
const HOME_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

export function parseHomeCookie(header: string | null | undefined): HomeSettings | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== HOME_COOKIE) continue;
    const value = decodeURIComponent(rest.join('='));
    const out: HomeSettings = { ...DEFAULT_SETTINGS };
    for (const field of value.split(';')) {
      const [key, raw] = field.split(':');
      if (key === 'view' && (raw === 'grid' || raw === 'list')) out.view = raw;
      if (key === 'sort' && (raw === 'opened' || raw === 'modified' || raw === 'title'))
        out.sort = raw;
    }
    return out;
  }
  return null;
}

export function homeCookieValue(settings: HomeSettings): string {
  return `${HOME_COOKIE}=${encodeURIComponent(`view:${settings.view};sort:${settings.sort}`)}; Path=/; Max-Age=${HOME_COOKIE_MAX_AGE_S}; SameSite=Lax`;
}

/**
 * The two cookies of the request: the saved settings (or null) and this browser's Recent row
 * (SPEC-4 0.29); the client keeps both beside localStorage.
 */
const readHomeCookies = createServerFn({ method: 'GET' }).handler(
  (): { prefs: HomeSettings | null; recent: RecentEntry[] } => {
    try {
      const cookie = getRequest().headers.get('cookie');
      return { prefs: parseHomeCookie(cookie), recent: parseRecentCookie(cookie) };
    } catch {
      return { prefs: null, recent: [] };
    }
  },
);

function readSettings(): HomeSettings {
  try {
    const raw = window.localStorage.getItem(HOME_SETTINGS_KEY);
    const parsed = (raw === null ? {} : JSON.parse(raw)) as Partial<HomeSettings>;
    return {
      sort:
        parsed.sort === 'modified' || parsed.sort === 'title' || parsed.sort === 'opened'
          ? parsed.sort
          : DEFAULT_SETTINGS.sort,
      view: parsed.view === 'list' ? 'list' : 'grid',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(settings: HomeSettings): void {
  try {
    window.localStorage.setItem(HOME_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // private mode: the choice lasts the page
  }
  try {
    document.cookie = homeCookieValue(settings);
  } catch {
    // a cookie the browser refuses: localStorage still carries the choice for this browser
  }
}

// ---------------------------------------------------------------------------------------------
// Dates

/** `2026-09-10 22:35` from an ISO stamp, in the reader's zone; the raw value when it is not a date. */
export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (iso === '' || Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `Sep 12, 2026`, or the time for a stamp of the same day. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (iso === '' || Number.isNaN(date.getTime())) return iso;
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** `just now`, `5 minutes ago`, `2 hours ago`, `3 days ago`, else the short date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (iso === '' || Number.isNaN(date.getTime())) return iso;
  const delta = Math.max(0, now.getTime() - date.getTime());
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) {
    const minutes = Math.floor(delta / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (delta < DAY) {
    const hours = Math.floor(delta / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (delta < 7 * DAY) {
    const days = Math.floor(delta / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return shortDate(iso, now);
}

// ---------------------------------------------------------------------------------------------
// Helpers

/** The thumbnail of a card: the render route's downsampled capture (server/thumbs.ts thumbUrl). */
export function cardThumbUrl(
  card: Pick<DeckCard, 'id' | 'firstSlide' | 'appearance' | 'revision'>,
) {
  if (card.firstSlide === null) return null;
  return `/api/render/${encodeURIComponent(card.firstSlide)}?deck=${encodeURIComponent(card.id)}&theme=${card.appearance}&w=320&r=${card.revision}`;
}

/** The facts the Recent record keeps of a card (./-recent.ts). */
export function openFactsOf(card: DeckCard): DeckOpenFacts {
  return {
    title: card.title,
    appearance: card.appearance,
    firstSlide: card.firstSlide,
    revision: card.revision,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Downloads through a one-time anchor; a same-origin URL of ours is already an attachment. */
export function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function editPath(deckId: string): string {
  return `/edit/${encodeURIComponent(deckId)}`;
}

function presentPath(deckId: string): string {
  return `/deck/${encodeURIComponent(deckId)}?present=1`;
}

/** Sorts the cards for the Recent list: this browser's opens first for "Last opened by me". */
export function sortCards(
  cards: ReadonlyArray<DeckCard>,
  sort: HomeSort,
  opened: Record<string, string>,
): DeckCard[] {
  const byModified = (a: DeckCard, b: DeckCard) => b.updatedAt.localeCompare(a.updatedAt);
  const list = [...cards];
  if (sort === 'title')
    return list.sort((a, b) => a.title.localeCompare(b.title) || byModified(a, b));
  if (sort === 'modified') return list.sort(byModified);
  return list.sort((a, b) => {
    const openedA = opened[a.id];
    const openedB = opened[b.id];
    if (openedA !== undefined && openedB !== undefined) return openedB.localeCompare(openedA);
    if (openedA !== undefined) return -1;
    if (openedB !== undefined) return 1;
    return byModified(a, b);
  });
}

/** The Recent row's entries as an opened map, so the server's order and the first render agree. */
function openedOf(recent: ReadonlyArray<RecentEntry>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of recent) out[entry.id] = entry.at;
  return out;
}

// ---------------------------------------------------------------------------------------------
// The dialog primitive of the home page and the trash (SPEC 13.3)

export type DialogProps = {
  title: string;
  /** the id the audit and the specs address, `home.copy` */
  control: string;
  children?: ReactNode;
  /** the dismissive button first, the confirming button last */
  actions: ReactNode;
  onClose: () => void;
  /** Enter outside a textarea runs the default button */
  onSubmit?: () => void;
  className?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * `role="dialog"` with `aria-labelledby`, a focus trap, Esc to cancel, Enter to run the default
 * button, and focus returned to the opener on close (SPEC 13.3; R08 B9). The scrim closes it.
 */
export function Dialog({
  title,
  control,
  children,
  actions,
  onClose,
  onSubmit,
  className,
}: DialogProps) {
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);

  useMountEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    /* the marked control first, wherever it sits, else the first focusable: a selector list
       answers in document order, so the trash dialog's Delete forever button (docs/FOCUS.md rank
       29) would lose the initial focus to the Cancel button before it */
    const first =
      root.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      root.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    if (first instanceof HTMLInputElement && first.dataset.select === 'all') first.select();
    return () => opener?.focus();
  });

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Enter' && onSubmit !== undefined) {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
      event.preventDefault();
      onSubmit();
      return;
    }
    if (event.key === 'Tab' && root.current) {
      const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div className="ts-hm-dialog-scrim" onMouseDown={onClose} data-control={`${control}.scrim`}>
      <div
        ref={root}
        className={className === undefined ? 'ts-hm-dialog' : `ts-hm-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-control={control}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="ts-hm-dialog-title">
          {title}
        </h2>
        {children}
        <div className="ts-hm-dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The card menu (SPEC 6.2): Google's per item menu, in the words of the File menu

/** The rows of a card's menu: Google's Open, Open in new tab, Rename and Remove, plus ours. */
export const CARD_MENU_ITEMS: ReadonlyArray<MenuItem> = [
  { id: 'home.card.open', label: 'Open', icon: 'document', status: 'now' },
  { id: 'home.card.openNewTab', label: 'Open in new tab', icon: 'external', status: 'now' },
  { id: 'home.card.present', label: 'Present', icon: 'present', status: 'now', turboslide: true },
  { id: 'home.card.rename', label: 'Rename', icon: 'pencil', status: 'now', dividerBefore: true },
  { id: 'home.card.copy', label: DIALOGS.makeCopy.title, status: 'now' },
  { id: 'home.card.download', label: 'Download', status: 'now', turboslide: true },
  { id: 'home.card.trash', label: 'Move to trash', status: 'now', dividerBefore: true },
];

type CardMenuState = { deckId: string; anchor: HTMLElement };

// ---------------------------------------------------------------------------------------------
// The page

/** The id a GT brand deck copy takes: unique per click, so the card works more than once. */
function gtBrandDeckId(now: Date = new Date()): string {
  return `gt-brand-${now.getTime().toString(36)}`;
}

/** The empty states of the band (SPEC-4 1.10): the figure, a title, one sentence, one action at most. */
export const HOME_EMPTY = {
  title: 'No presentations yet',
  sentence: 'Start one with the Blank presentation card above, or copy the GT brand deck.',
  action: 'New Presentation',
  noMatch: (query: string) => `No presentation matches "${query}"`,
  noMatchSentence: 'Clear the search to see every presentation again.',
} as const;

function HomePage() {
  const { decks, node, prefs: cookiePrefs, recent } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const page = useRef<HTMLElement>(null);
  const snackbar = useSnackbar();
  const [query, setQuery] = useState('');
  /* the cookie's settings on the server and on the first client render (SPEC-3 9.2 L1); the
     localStorage mirror is read after hydration and wins when the cookie was refused */
  const [settings, setSettings] = useState<HomeSettings>(cookiePrefs ?? DEFAULT_SETTINGS);
  /* this browser's opens: the cookie's row first (the server rendered the same), then the whole
     localStorage record after hydration */
  const [opened, setOpened] = useState<Record<string, string>>(() => openedOf(recent));
  /* the Recent row: the cookie's entries on the server and at hydration, localStorage's after */
  const [recentRow, setRecentRow] = useState<ReadonlyArray<RecentEntry>>(recent);
  const [mounted, setMounted] = useState(false);
  /* decks moved to the trash from this page and not yet reloaded: hidden at once, Undo shows them */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  /* a rename the store answered and the listing has not caught up with: the card shows the new
     name at once and the overlay stands until the loader's card reaches the answered revision
     (docs/FOCUS.md rank 7: the /decks listing lags the store by up to a minute on the blob tier) */
  const [renamed, setRenamed] = useState<Readonly<Record<string, RenamedCard>>>({});
  const [creating, setCreating] = useState(false);

  useMountEffect(() => {
    /* this browser's history is read after hydration, so the server's HTML and the first client
       render agree (React 418 otherwise); the settings come from the cookie already, and the
       localStorage mirror stands in when no cookie reached the server */
    if (cookiePrefs === null) setSettings(readSettings());
    setOpened((current) => ({ ...current, ...readOpened() }));
    const stored = readRecent();
    if (stored.length > 0) setRecentRow(stored);
    setMounted(true);
    page.current?.setAttribute('data-hydrated', '');
  });

  /* a restore the trash page requested moments ago (docs/FOCUS.md rank 7; build/b7.md R9,
     routes/-restoring.ts): while its marker is young and the listing does not hold the deck, the
     listing is asked for again once a second, up to three times, then the marker leaves */
  const decksRef = useRef(decks);
  decksRef.current = decks;
  useMountEffect(() => {
    const storage = sessionMarkerStorage();
    const marker = readRestoringMarker(storage);
    if (marker === null) return undefined;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const list = await decksRef.current.catch((): DeckCard[] => []);
      if (stopped) return;
      if (
        restoringStep(
          marker,
          list.map((card) => card.id),
          tries,
        ) === 'done'
      ) {
        clearRestoringMarker(storage);
        return;
      }
      tries += 1;
      await router.invalidate();
      if (stopped) return;
      timer = setTimeout(() => void tick(), RESTORING_STEP_MS);
    };
    timer = setTimeout(() => void tick(), RESTORING_STEP_MS);
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  });

  const choose = (patch: Partial<HomeSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      writeSettings(next);
      return next;
    });
  };

  const refresh = useCallback(async () => {
    await router.invalidate();
  }, [router]);

  const open = (card: DeckCard, newTab = false) => {
    recordDeckOpened(card.id, openFactsOf(card));
    setOpened((current) => ({ ...current, [card.id]: new Date().toISOString() }));
    setRecentRow(readRecent());
    if (newTab) {
      window.open(editPath(card.id), '_blank', 'noopener');
      return;
    }
    void navigate({ to: '/edit/$deckId', params: { deckId: card.id } });
  };

  const present = (card: DeckCard) => {
    recordDeckOpened(card.id, openFactsOf(card));
    window.open(presentPath(card.id), '_blank', 'noopener');
  };

  const download = async (deckId: string) => {
    try {
      const { url } = await bundleDownloadTicket({ deckId });
      triggerDownload(url);
    } catch (error) {
      snackbar.show(`Download: ${errorMessage(error)}`);
    }
  };

  const moveToTrash = async (card: DeckCard) => {
    setHidden((current) => new Set([...current, card.id]));
    try {
      /* no revision from the listing (it lags the store, rank 7): the store takes its current one */
      await trashStoredDeck({ deckId: card.id });
    } catch (error) {
      setHidden((current) => {
        const next = new Set(current);
        next.delete(card.id);
        return next;
      });
      snackbar.show(`Move to trash: ${errorMessage(error)}`);
      return;
    }
    snackbar.show(SNACKBARS.movedToTrash, {
      label: SNACKBARS.undo,
      run: () => {
        void (async () => {
          try {
            await restoreStoredDeck({ deckId: card.id });
            setHidden((current) => {
              const next = new Set(current);
              next.delete(card.id);
              return next;
            });
            await refresh();
          } catch (error) {
            snackbar.show(`Restore: ${errorMessage(error)}`);
          }
        })();
      },
    });
  };

  const rename = async (card: DeckCard, name: string) => {
    const title = name.trim();
    if (title === '' || title === card.title) return;
    try {
      /* no revision from the listing: the server function takes the store's current revision
         when none is sent (server/decks.ts renameDeckFn), so a card the list drew one revision
         behind is never refused as stale (rank 7, audit-decks rows 34 and 36) */
      const result = await renameStoredDeck({ deckId: card.id, name: title });
      if (!result.ok) {
        snackbar.show(`Rename: ${result.message}`);
        return;
      }
      setRenamed((current) => ({
        ...current,
        [card.id]: { title: result.title, revision: result.revision },
      }));
      await refresh();
    } catch (error) {
      snackbar.show(`Rename: ${errorMessage(error)}`);
    }
  };

  const createGtBrandDeck = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await createNewDeck({
        name: HOME.gtBrand,
        from: 'gt-brand',
        id: gtBrandDeckId(),
      });
      recordDeckOpened(created.deckId);
      await navigate({ to: '/edit/$deckId', params: { deckId: created.deckId } });
    } catch (error) {
      snackbar.show(`${HOME.gtBrand}: ${errorMessage(error)}`);
      setCreating(false);
    }
  };

  const now = new Date();
  const listProps: ListProps = {
    query,
    settings,
    opened,
    mounted,
    now,
    hidden,
    renamed,
    onOpen: open,
    onPresent: present,
    onDownload: (deckId) => void download(deckId),
    onTrash: (card) => void moveToTrash(card),
    onRename: (card, name) => void rename(card, name),
    onCopied: () => void refresh(),
    onError: (message) => snackbar.show(message),
  };

  return (
    <main ref={page} className="ts-home ts-home-page" data-node={node}>
      <header className="ts-appbar">
        <AppBarBrand linkComponent={RouterLinkSlot} homeTo="/decks" aboutTo="/home" />
        <label className="ts-appbar-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            placeholder={HOME.search}
            aria-label={HOME.search}
            data-control="home.search"
            autoComplete="off"
            spellCheck={false}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            {...tipProps({ name: HOME.search, doc: 'Filters the list by title.' })}
          />
        </label>
      </header>

      <section className="ts-strip" id="templates" aria-labelledby="ts-strip-heading">
        <div className="ts-strip-head">
          <h2 id="ts-strip-heading">{HOME.startNew}</h2>
          <a
            className="ts-strip-gallery"
            href="#templates"
            data-control="home.gallery"
            {...tipProps({
              name: HOME.gallery,
              doc: 'The templates a presentation can start from.',
            })}
          >
            {HOME.gallery}
          </a>
        </div>
        <ul className="ts-strip-cards">
          <li>
            <Link
              to="/new"
              className="ts-template ts-template-blank"
              data-control="home.blank"
              {...tipProps({ name: HOME.blank, doc: 'Starts an untitled presentation.' })}
            >
              <span className="ts-template-plate">
                <Icon name="plus" size={40} />
              </span>
              <span className="ts-template-label">{HOME.blank}</span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              className="ts-template"
              data-control="home.gt-brand"
              disabled={creating}
              onClick={() => void createGtBrandDeck()}
              {...tipProps({
                name: HOME.gtBrand,
                doc: 'Makes a copy of the GT brand template, 85 slides, and opens it.',
              })}
            >
              <span className="ts-template-plate ts-template-gt">
                <GtMark width={56} height={36} />
              </span>
              <span className="ts-template-label">{creating ? 'Opening' : HOME.gtBrand}</span>
            </button>
          </li>
        </ul>
      </section>

      <section
        className="ts-recent"
        aria-labelledby="ts-recent-heading"
        // the opened order is this browser's alone: without the Recent cookie the band is hidden
        // until mounted, then shown in its final order (L1); with the cookie the server rendered
        // that order already, and a sort the server knows paints once and stays
        data-pending={
          !mounted && settings.sort === 'opened' && recent.length === 0 ? '' : undefined
        }
      >
        <div className="ts-recent-head">
          <div>
            <h2 id="ts-recent-heading">{HOME.recent}</h2>
            <p className="ts-recent-lead">{HOME.listed}</p>
          </div>
          <div className="ts-recent-tools">
            <span className="ts-seg" role="group" aria-label="View">
              <button
                type="button"
                className={settings.view === 'grid' ? 'pt-ib pt-icon is-on' : 'pt-ib pt-icon'}
                aria-pressed={settings.view === 'grid'}
                data-control="home.view.grid"
                onClick={() => choose({ view: 'grid' })}
                {...tipProps({
                  name: 'Grid view',
                  doc: 'Cards with a thumbnail of the first slide.',
                })}
              >
                <Icon name="grid" />
              </button>
              <button
                type="button"
                className={settings.view === 'list' ? 'pt-ib pt-icon is-on' : 'pt-ib pt-icon'}
                aria-pressed={settings.view === 'list'}
                data-control="home.view.list"
                onClick={() => choose({ view: 'list' })}
                {...tipProps({
                  name: 'List view',
                  doc: 'Rows with the title, the last edit and the slide count.',
                })}
              >
                <Icon name="queue-list" />
              </button>
            </span>
            <label className="ts-sort">
              <span className="ts-visually-hidden">Sort by</span>
              <select
                value={settings.sort}
                data-control="home.sort"
                onChange={(event) => choose({ sort: event.target.value as HomeSort })}
                {...tipProps({ name: 'Sort by', doc: 'The order of the list.' })}
              >
                <option value="opened">{HOME.sortOpened}</option>
                <option value="modified">{HOME.sortModified}</option>
                <option value="title">{HOME.sortTitle}</option>
              </select>
            </label>
          </div>
        </div>

        {/* this browser's Recent row, whole at first byte (SPEC-4 0.29): the cookie's entries on
            the server, localStorage's after hydration; the trashed and the searched away leave it */}
        <RecentRow
          entries={recentRow.filter(
            (entry) =>
              !hidden.has(entry.id) &&
              (query.trim() === '' ||
                entry.title.toLowerCase().includes(query.trim().toLowerCase())),
          )}
          mounted={mounted}
          now={now}
          onOpen={(entry) => {
            recordDeckOpened(entry.id);
            setOpened((current) => ({ ...current, [entry.id]: new Date().toISOString() }));
          }}
        />

        {/* the store's cards stream behind the shell (SPEC-4 0.29): the card grid's frames stand
            in until they arrive; a refetch keeps the cards on the page */}
        <Suspense fallback={<GridFrame view={settings.view} />}>
          <StoreList promise={decks} {...listProps} />
        </Suspense>
      </section>

      <footer className="ts-home-tail">
        <Link
          to="/decks/trash"
          className="pt-ib is-text"
          data-control="home.trash"
          {...tipProps({
            name: HOME.trash,
            doc: 'Presentations moved to the trash; restore or delete them forever.',
          })}
        >
          <Icon name="archive" />
          <span className="pt-lb">{HOME.trash}</span>
        </Link>
      </footer>

      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// The Recent row, and the frame while the store list streams (SPEC-4 0.29; PP 3.1 item 3)

/** how many card frames fill the first row of the grid at the rail's width */
const FRAME_COLUMNS = 4;

/** The Recent row's caption (sentence case, no period): this browser's own decks, not the store's. */
export const RECENT_ROW_LABEL = 'Opened on this device';

/**
 * This browser's Recent row (SPEC-4 0.29): one row of the newest decks this browser opened, drawn
 * whole from the record of ./-recent.ts (the cookie on the server, localStorage after hydration),
 * with real links to the editor that preload its loader on viewport entry, so the row is in the
 * server's HTML and clickable before the store answers. The controls are `home.recent.<id>` so a
 * spec that addresses `home.card.<id>` finds the store's card alone. Absent when the browser has
 * opened nothing here.
 */
function RecentRow({
  entries,
  mounted,
  now,
  onOpen,
}: {
  entries: ReadonlyArray<RecentEntry>;
  mounted: boolean;
  now: Date;
  onOpen: (entry: RecentEntry) => void;
}) {
  const row = entries.slice(0, RECENT_ROW_CARDS);
  if (row.length === 0) return null;
  return (
    <div className="ts-recent-row" data-control="home.recent">
      <h3 className="ts-recent-row-title">{RECENT_ROW_LABEL}</h3>
      <ul className="ts-cards ts-cards-recent" aria-label={RECENT_ROW_LABEL}>
        {row.map((entry, index) => (
          <RecentCard
            key={entry.id}
            entry={entry}
            index={index}
            mounted={mounted}
            now={now}
            onOpen={() => onOpen(entry)}
          />
        ))}
      </ul>
    </div>
  );
}

/** One card of the Recent row: the record's facts, the thumbnail URL the store's card would carry. */
function RecentCard({
  entry,
  index,
  mounted,
  now,
  onOpen,
}: {
  entry: RecentEntry;
  index: number;
  mounted: boolean;
  now: Date;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const url = cardThumbUrl(entry);
  return (
    <li
      className="ts-hm-card ts-hm-card-recent"
      data-deck={entry.id}
      data-control={`home.recent.${entry.id}`}
    >
      <Link
        to="/edit/$deckId"
        params={{ deckId: entry.id }}
        preload={index < VIEWPORT_PRELOAD_CARDS ? 'viewport' : 'intent'}
        className="ts-hm-card-open"
        data-control={`home.recent.open.${entry.id}`}
        onClick={onOpen}
        {...tipProps({ name: entry.title, doc: 'Opens the presentation.' })}
      >
        <span className="ts-hm-card-thumb" data-theme={entry.appearance} aria-hidden="true">
          {url !== null && !failed ? (
            <img
              src={url}
              width={320}
              height={180}
              alt=""
              loading="eager"
              decoding="async"
              onError={() => setFailed(true)}
            />
          ) : (
            <span className="ts-hm-card-plate">{entry.title}</span>
          )}
        </span>
      </Link>
      <div className="ts-hm-card-body">
        <span className="ts-hm-card-title">{entry.title}</span>
        <span className="ts-hm-card-when" suppressHydrationWarning>
          {HOME.opened(mounted ? timeAgo(entry.at, now) : entry.at.slice(0, 10))}
        </span>
      </div>
    </li>
  );
}

/**
 * The card grid's frame while the store listing streams (SPEC-4 0.29): one row of empty card
 * boxes at the card's size, or the rows' head with empty rows, so the cards arrive into the same
 * height. `aria-busy` names the wait.
 */
function GridFrame({ view }: { view: HomeView }) {
  const blanks = Array.from({ length: FRAME_COLUMNS }, (_, i) => i);
  if (view === 'list') {
    return (
      <table
        className="ts-rows ts-rows-pending"
        data-control="home.pending"
        aria-busy="true"
        aria-label={`${HOME.recent}, loading`}
      >
        <thead>
          <tr>
            <th scope="col">{HOME.sortTitle}</th>
            <th scope="col">Last edit</th>
            <th scope="col">Slides</th>
            <th scope="col">
              <span className="ts-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {blanks.map((i) => (
            <tr key={`frame-${i}`} className="ts-row ts-row-frame" aria-hidden="true">
              <td className="ts-row-title">
                <span className="ts-frame-line" />
              </td>
              <td className="ts-row-when" />
              <td className="ts-row-count" />
              <td className="ts-row-more" />
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <ul
      className="ts-cards ts-cards-pending"
      data-control="home.pending"
      aria-busy="true"
      aria-label={`${HOME.recent}, loading`}
    >
      {blanks.map((i) => (
        <li key={`frame-${i}`} className="ts-hm-card ts-hm-card-frame" aria-hidden="true">
          <span className="ts-hm-card-thumb" />
          <div className="ts-hm-card-body">
            <span className="ts-frame-line" />
            <span className="ts-frame-line is-short" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
// The store's list: the grid or the rows, the card menu, the in place rename, Make a copy

/**
 * The listing as it streams and as it refreshes (SPEC-4 0.29): the component suspends on the
 * promise it mounted with (the router streams that one behind the document and React resumes
 * here when it lands), and every later promise of the loader (`router.invalidate()` after a
 * rename, a copy, an undo) resolves through an effect into the same mounted list, so the cards
 * stay on the page while the store answers and no card is ever in the document twice. A promise
 * the store refuses on a refetch leaves the list as it was; the first one's refusal is the
 * route's error, as before.
 */
export function useStreamedList<T>(promise: Promise<T>): T {
  const first = useRef(promise);
  const initial = useAwaited({ promise: first.current });
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    if (promise === first.current) return;
    let alive = true;
    promise
      .then((next) => {
        if (alive) setValue(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [promise]);
  return value;
}

function StoreList({ promise, ...props }: ListProps & { promise: Promise<DeckCard[]> }) {
  const list = useStreamedList(promise);
  return <DeckList list={list} {...props} />;
}

/** A rename the store answered: the title and the revision the card shows until the listing agrees. */
type RenamedCard = { title: string; revision: number };

/** The listing with the answered renames applied where the listing is still behind them. */
export function applyRenames(
  list: ReadonlyArray<DeckCard>,
  renamed: Readonly<Record<string, RenamedCard>>,
): DeckCard[] {
  return list.map((card) => {
    const over = renamed[card.id];
    return over !== undefined && card.revision < over.revision
      ? { ...card, title: over.title, revision: over.revision }
      : card;
  });
}

type ListProps = {
  query: string;
  settings: HomeSettings;
  opened: Record<string, string>;
  mounted: boolean;
  now: Date;
  hidden: ReadonlySet<string>;
  /** the renames the store answered, applied over the listing until it catches up (rank 7) */
  renamed: Readonly<Record<string, RenamedCard>>;
  onOpen: (card: DeckCard, newTab?: boolean) => void;
  onPresent: (card: DeckCard) => void;
  onDownload: (deckId: string) => void;
  onTrash: (card: DeckCard) => void;
  onRename: (card: DeckCard, name: string) => void;
  onCopied: (deckId: string) => void;
  onError: (message: string) => void;
};

function DeckList({
  list: listed,
  query,
  settings,
  opened,
  mounted,
  now,
  hidden,
  renamed,
  onOpen,
  onPresent,
  onDownload,
  onTrash,
  onRename,
  onCopied,
  onError,
}: ListProps & { list: ReadonlyArray<DeckCard> }) {
  const list = useMemo(() => applyRenames(listed, renamed), [listed, renamed]);
  const [menu, setMenu] = useState<CardMenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [copying, setCopying] = useState<DeckCard | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = list.filter(
      (card) =>
        !hidden.has(card.id) && (needle === '' || card.title.toLowerCase().includes(needle)),
    );
    return sortCards(filtered, settings.sort, opened);
  }, [list, hidden, query, settings.sort, opened]);

  const cardById = (deckId: string): DeckCard | undefined =>
    list.find((card) => card.id === deckId);

  const onMenuSelect = (item: MenuItem) => {
    const state = menu;
    setMenu(null);
    if (state === null) return;
    const card = cardById(state.deckId);
    if (card === undefined) return;
    switch (item.id) {
      case 'home.card.open':
        onOpen(card);
        return;
      case 'home.card.openNewTab':
        onOpen(card, true);
        return;
      case 'home.card.present':
        onPresent(card);
        return;
      case 'home.card.rename':
        setRenaming(card.id);
        return;
      case 'home.card.copy':
        setCopying(card);
        return;
      case 'home.card.download':
        onDownload(card.id);
        return;
      case 'home.card.trash':
        onTrash(card);
        return;
      default:
        return;
    }
  };

  const onMenuClose = (_reason: MenuCloseReason) => setMenu(null);

  const rename = (card: DeckCard, name: string) => {
    setRenaming(null);
    onRename(card, name);
  };

  const shown = list.filter((card) => !hidden.has(card.id));

  return (
    <>
      {visible.length === 0 ? (
        <div className="ts-home-empty-figure" data-control="home.empty">
          {shown.length === 0 ? (
            <EmptyFigure
              figure="figure"
              title={HOME_EMPTY.title}
              sentence={HOME_EMPTY.sentence}
              action={
                <Link
                  to="/new"
                  className="pt-ib is-solid"
                  data-control="home.empty.new"
                  {...tipProps({ name: HOME_EMPTY.action, doc: 'Starts a blank presentation.' })}
                >
                  {HOME_EMPTY.action}
                </Link>
              }
            />
          ) : (
            <EmptyFigure
              figure="figure"
              title={HOME_EMPTY.noMatch(query.trim())}
              sentence={HOME_EMPTY.noMatchSentence}
            />
          )}
        </div>
      ) : settings.view === 'grid' ? (
        <ul className="ts-cards" data-control="home.cards">
          {visible.map((card, index) => (
            <DeckCardView
              key={card.id}
              card={card}
              index={index}
              mounted={mounted}
              now={now}
              openedAt={opened[card.id]}
              renaming={renaming === card.id}
              menuOpen={menu?.deckId === card.id}
              onOpen={() => onOpen(card)}
              onMenu={(anchor) => setMenu({ deckId: card.id, anchor })}
              onRename={(name) => rename(card, name)}
              onCancelRename={() => setRenaming(null)}
            />
          ))}
        </ul>
      ) : (
        <table className="ts-rows" data-control="home.rows">
          <thead>
            <tr>
              <th scope="col">{HOME.sortTitle}</th>
              <th scope="col">Last edit</th>
              <th scope="col">Slides</th>
              <th scope="col">
                <span className="ts-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((card, index) => (
              <DeckRowView
                key={card.id}
                card={card}
                index={index}
                mounted={mounted}
                now={now}
                renaming={renaming === card.id}
                menuOpen={menu?.deckId === card.id}
                onOpen={() => onOpen(card)}
                onMenu={(anchor) => setMenu({ deckId: card.id, anchor })}
                onRename={(name) => rename(card, name)}
                onCancelRename={() => setRenaming(null)}
              />
            ))}
          </tbody>
        </table>
      )}

      {menu !== null ? (
        <Menu
          id="home-card-menu"
          items={CARD_MENU_ITEMS}
          context={DEFAULT_MENU_CONTEXT}
          label="Presentation actions"
          anchor={{ kind: 'element', element: menu.anchor }}
          placement="below"
          onSelect={onMenuSelect}
          onClose={onMenuClose}
          returnFocusTo={menu.anchor}
          autoFocus
        />
      ) : null}

      {copying !== null ? (
        <CopyDialog
          card={copying}
          onClose={() => setCopying(null)}
          onCopied={(deckId) => {
            setCopying(null);
            onCopied(deckId);
          }}
          onError={(message) => onError(`${DIALOGS.makeCopy.title}: ${message}`)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Cards and rows

type CardViewProps = {
  card: DeckCard;
  /** the card's place in the list: the first screen's cards preload on viewport entry (SPEC-4 0.39) */
  index: number;
  /** this browser's values (opened, the local date form) are drawn only after hydration */
  mounted: boolean;
  now: Date;
  openedAt?: string;
  renaming: boolean;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
};

/** "Opened 2 hours ago" from this browser, else "Edited <date>" from the store (SPEC 6.2). */
function whenLine(card: DeckCard, mounted: boolean, now: Date, openedAt?: string): string {
  if (openedAt !== undefined) return HOME.opened(timeAgo(openedAt, now));
  // the server renders the ISO date; the reader's zone and form take over after hydration
  return HOME.edited(mounted ? shortDate(card.updatedAt, now) : card.updatedAt.slice(0, 10));
}

/** The first screen's cards run the editor's loader as they scroll into view; the rest on intent. */
function preloadOf(index: number): 'viewport' | 'intent' {
  return index < VIEWPORT_PRELOAD_CARDS ? 'viewport' : 'intent';
}

function MoreButton({
  card,
  open,
  onMenu,
}: {
  card: DeckCard;
  open: boolean;
  onMenu: (anchor: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      className={open ? 'pt-ib pt-icon ts-hm-card-more is-on' : 'pt-ib pt-icon ts-hm-card-more'}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? 'home-card-menu' : undefined}
      data-control={`home.more.${card.id}`}
      onClick={(event) => onMenu(event.currentTarget)}
      {...tipProps({
        name: 'More actions',
        doc: `Open, present, rename, copy, download or trash ${card.title}.`,
      })}
    >
      <span aria-hidden="true" className="ts-hm-card-dots">
        ⋮
      </span>
    </button>
  );
}

function RenameField({
  card,
  onRename,
  onCancel,
}: {
  card: DeckCard;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(card.title);
  const field = useRef<HTMLInputElement>(null);
  useMountEffect(() => {
    field.current?.focus();
    field.current?.select();
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRename(value);
  };
  return (
    <form className="ts-hm-card-rename" onSubmit={submit}>
      <input
        ref={field}
        type="text"
        value={value}
        aria-label="Rename"
        data-control={`home.rename.${card.id}`}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onRename(value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
      />
    </form>
  );
}

function Thumb({ card }: { card: DeckCard }) {
  const [failed, setFailed] = useState(false);
  const url = cardThumbUrl(card);
  return (
    <span className="ts-hm-card-thumb" data-theme={card.appearance} aria-hidden="true">
      {url !== null && !failed ? (
        <img
          src={url}
          width={320}
          height={180}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="ts-hm-card-plate">{card.title}</span>
      )}
    </span>
  );
}

function DeckCardView({
  card,
  index,
  mounted,
  now,
  openedAt,
  renaming,
  menuOpen,
  onOpen,
  onMenu,
  onRename,
  onCancelRename,
}: CardViewProps) {
  return (
    <li className="ts-hm-card" data-deck={card.id} data-control={`home.card.${card.id}`}>
      <Link
        to="/edit/$deckId"
        params={{ deckId: card.id }}
        preload={preloadOf(index)}
        className="ts-hm-card-open"
        data-control={`home.open.${card.id}`}
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
        {...tipProps({ name: card.title, doc: 'Opens the presentation.' })}
      >
        <Thumb card={card} />
      </Link>
      <div className="ts-hm-card-body">
        {renaming ? (
          <RenameField card={card} onRename={onRename} onCancel={onCancelRename} />
        ) : (
          <Link
            to="/edit/$deckId"
            params={{ deckId: card.id }}
            preload={preloadOf(index)}
            className="ts-hm-card-title"
            data-control={`home.title.${card.id}`}
            {...tipProps({ name: card.title, doc: 'Opens the presentation in the editor.' })}
            onClick={(event) => {
              event.preventDefault();
              onOpen();
            }}
          >
            {card.title}
          </Link>
        )}
        <span className="ts-hm-card-when" suppressHydrationWarning>
          {whenLine(card, mounted, now, openedAt)}
        </span>
        <MoreButton card={card} open={menuOpen} onMenu={onMenu} />
      </div>
    </li>
  );
}

function DeckRowView({
  card,
  index,
  mounted,
  now,
  renaming,
  menuOpen,
  onOpen,
  onMenu,
  onRename,
  onCancelRename,
}: Omit<CardViewProps, 'openedAt'>) {
  return (
    <tr className="ts-row" data-deck={card.id} data-control={`home.card.${card.id}`}>
      <td className="ts-row-title">
        {renaming ? (
          <RenameField card={card} onRename={onRename} onCancel={onCancelRename} />
        ) : (
          <Link
            to="/edit/$deckId"
            params={{ deckId: card.id }}
            preload={preloadOf(index)}
            className="ts-hm-card-title"
            data-control={`home.title.${card.id}`}
            {...tipProps({ name: card.title, doc: 'Opens the presentation in the editor.' })}
            onClick={(event) => {
              event.preventDefault();
              onOpen();
            }}
          >
            <Icon name="deck" />
            <span>{card.title}</span>
          </Link>
        )}
      </td>
      <td className="ts-row-when" suppressHydrationWarning>
        {mounted ? shortDate(card.updatedAt, now) : card.updatedAt.slice(0, 10)}
      </td>
      <td className="ts-row-count">{card.slides}</td>
      <td className="ts-row-more">
        <MoreButton card={card} open={menuOpen} onMenu={onMenu} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------------------------
// Make a copy (SPEC 6.5, 12 "Dialogs")

function CopyDialog({
  card,
  onClose,
  onCopied,
  onError,
}: {
  card: DeckCard;
  onClose: () => void;
  onCopied: (deckId: string) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(`Copy of ${card.title}`);
  const [removeNotes, setRemoveNotes] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || name.trim() === '') return;
    setBusy(true);
    // the tab opens inside the click, before the copy's round trip, so a popup rule lets it
    // through; it is pointed at the copy once the store answers
    const tab = window.open('', '_blank');
    try {
      /* no revision from the listing (rank 7, audit-decks row 37: the copy failed three times
         on a stale card and worked on a fresh one) */
      const copy = await copyStoredDeck({
        deckId: card.id,
        name: name.trim(),
        removeNotes,
      });
      recordDeckOpened(copy.deckId, {
        title: name.trim(),
        appearance: card.appearance,
        firstSlide: card.firstSlide,
        revision: 0,
      });
      if (tab !== null) tab.location.href = editPath(copy.deckId);
      else window.location.assign(editPath(copy.deckId));
      onCopied(copy.deckId);
    } catch (error) {
      tab?.close();
      setBusy(false);
      onError(errorMessage(error));
    }
  };

  return (
    <Dialog
      title={DIALOGS.makeCopy.title}
      control="home.copy"
      onClose={onClose}
      onSubmit={() => void submit()}
      actions={
        <>
          <button
            type="button"
            className="pt-ib is-text"
            data-control="home.copy.cancel"
            onClick={onClose}
            {...tipProps({ name: DIALOGS.makeCopy.cancel, doc: 'Closes without copying.' })}
          >
            <span className="pt-lb">{DIALOGS.makeCopy.cancel}</span>
          </button>
          <button
            type="button"
            className="pt-ib is-text is-solid"
            data-control="home.copy.ok"
            disabled={busy || name.trim() === ''}
            onClick={() => void submit()}
            {...tipProps({
              name: DIALOGS.makeCopy.ok,
              doc: 'Copies the presentation and opens the copy in a new tab.',
              key: 'Enter',
            })}
          >
            <span className="pt-lb">{busy ? 'Copying' : DIALOGS.makeCopy.ok}</span>
          </button>
        </>
      }
    >
      <label className="ts-hm-dialog-field">
        <span>{DIALOGS.makeCopy.name}</span>
        <input
          type="text"
          value={name}
          data-autofocus
          data-select="all"
          data-control="home.copy.name"
          aria-label={DIALOGS.makeCopy.name}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="ts-hm-dialog-check">
        <input
          type="checkbox"
          checked={removeNotes}
          data-control="home.copy.remove-notes"
          onChange={(event) => setRemoveNotes(event.target.checked)}
        />
        <span className="ts-hm-dialog-box" aria-hidden="true" />
        <span>{DIALOGS.makeCopy.removeNotes}</span>
      </label>
    </Dialog>
  );
}
