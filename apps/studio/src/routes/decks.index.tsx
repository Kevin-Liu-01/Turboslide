import type { ChangeEvent, FormEvent } from 'react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Link,
  createFileRoute,
  redirect,
  useAwaited,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { AppBarBrand } from '@turboslide/chrome/AppBarBrand';
import { Dialog, DialogCheck } from '@turboslide/chrome/Dialog';
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
import { DOWNLOAD_WORDS, downloadFromPage, fileNameOf } from '@turboslide/chrome/download';

import { useMountEffect } from '../components/useMountEffect';
import {
  RESTORING_STEP_MS,
  clearRestoringMarker,
  readRestoringMarker,
  restoringStep,
  sessionMarkerStorage,
} from './-restoring';
import {
  copyStoredDeck,
  createNewDeck,
  listHomeDecks,
  readDeckCard,
  renameStoredDeck,
  restoreStoredDeck,
  trashStoredDeck,
} from '../server/decks';
import type { DeckCard } from '../server/decks';
import {
  EXPORT_POLL_MS,
  exportCapabilities,
  pollExport,
  startExport,
  syncExport,
} from '../server/download';
import { getServerHealth } from '../server/health';
import { RouterLinkSlot } from './-link-slot';
import {
  TRASH_REFUSED_EVENT,
  forgetDeckOpened,
  forgetDeckTrashed,
  parseRecentCookie,
  readOpened,
  readRecent,
  recordDeckOpened,
  recordDeckTrashed,
  takeTrashedMarker,
  updateDeckFacts,
} from './-recent';
import type { DeckOpenFacts, RecentEntry, TrashRefusedDetail } from './-recent';

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
 * trash). Trash at the bottom links to /decks/trash. The list is the viewer's (docs/NEXT.md 3.2
 * H2; server/deck-scope.ts): an anonymous visitor's cards are this browser's Recent record alone
 * and the store is not asked, a signed in person's are the decks they own and the ones shared
 * with them, and the deployment's admin may show every deck with the filter `?show=all`
 * (server/decks.ts listHomeDecks, scoped as the Open dialog's `listDecks` and the `deck.list`
 * action are), so decks in the trash, unsaved drafts and other people's decks never appear.
 * Recent is this browser's own history first, then the store's updatedAt.
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
 *
 * The product round (docs/PRODUCT.md section 2 ranks 4, 15, 16 and 26, section 3.6): the Opened on
 * this device head carries the sentence that the list is this browser's; the row drops a deck the
 * editor moved to the trash (its marker, ./-recent.ts) and any deck the listing no longer holds,
 * and the page shows Moved to trash with Undo when it lands from the editor's File > Move to
 * trash; a card reads "Edited yesterday at 2:02 PM" in the browser's locale and the list rows are
 * 32 px; the card's more button is the icon set's glyph; the card's plate is the deck's own paper
 * with the title in its ink until the capture lands, and a failed capture is asked for again
 * within the first seconds; the Make a copy dialog is the chrome's one Dialog.
 */
export const Route = createFileRoute('/decks/')({
  /* the admin's filter (docs/NEXT.md 3.2 H2, question 8): `?show=all` lists every deck the store
     holds for the deployment's admin; the server answers anyone else their own listing */
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    search.show === 'all' ? { show: 'all' } : {},
  loaderDeps: ({ search }) => ({ show: search.show }),
  /* the old Template gallery anchor (/decks#templates) lands on the gallery page (docs/PRODUCT.md 4.3) */
  beforeLoad: ({ location }) => {
    if (location.hash === 'templates' || location.hash === '#templates')
      throw redirect({ to: '/decks/templates' });
  },
  loader: async ({ deps }) => {
    const [health, cookies] = await Promise.all([getServerHealth(), readHomeCookies()]);
    // the store listing is not awaited: the router streams it behind the shell (SPEC-4 0.29)
    const listing = listHomeDecks({ data: deps.show === 'all' ? { show: 'all' } : {} });
    return {
      decks: listing.then((answer) => answer.cards),
      admin: listing.then((answer) => answer.admin),
      node: health.node,
      prefs: cookies.prefs,
      recent: cookies.recent,
      now: cookies.now,
    };
  },
  /* Back from the editor paints the cards it left (docs/POLISH.md item 89): a match younger than
     this reuses its loader data instead of streaming the listing again behind grey frames; a
     rename, a copy and an undo still refetch through `router.invalidate()` */
  staleTime: 30_000,
  head: () => ({ meta: [{ title: `${HOME.recent}, Turboslide` }] }),
  component: HomePage,
});

// ---------------------------------------------------------------------------------------------
// This browser's history and settings (SPEC 6.2 "Recent"), in localStorage; private to the browser

/* the Recent record lives in ./-recent.ts since round four; re-exported for the readers of this module */
export { RECENT_KEY, readOpened, recordDeckOpened } from './-recent';

/** the view and sort the rep last chose */
const HOME_SETTINGS_KEY = 'turboslide:home';

/** The page's search: the admin's filter (docs/NEXT.md 3.2 H2). */
type HomeSearch = { show?: 'all' };

export type HomeSort = 'opened' | 'modified' | 'title';
export type HomeView = 'grid' | 'list';

type HomeSettings = { sort: HomeSort; view: HomeView };

const DEFAULT_SETTINGS: HomeSettings = { sort: 'opened', view: 'grid' };

/** the cards that preload the editor's loader on viewport entry (SPEC-4 0.39) */
export const VIEWPORT_PRELOAD_CARDS = 12;

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
 * The two cookies of the request: the saved settings (or null) and this browser's Recent entries
 * (SPEC-4 0.29); the client keeps both beside localStorage. `now` is the request's time, so the
 * server and the first client render word "Opened 2 minutes ago" from one clock (docs/POLISH.md
 * item 112: the server drew the ISO date and hydration replaced it with the relative words).
 */
const readHomeCookies = createServerFn({ method: 'GET' }).handler(
  (): { prefs: HomeSettings | null; recent: RecentEntry[]; now: string } => {
    const now = new Date().toISOString();
    try {
      const cookie = getRequest().headers.get('cookie');
      return { prefs: parseHomeCookie(cookie), recent: parseRecentCookie(cookie), now };
    } catch {
      return { prefs: null, recent: [], now };
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

/**
 * `Edited today at 2:02 PM`, `Edited yesterday at 2:02 PM`, else `Edited Sep 12, 2026`, the time in
 * the browser's locale (docs/PRODUCT.md 3.6; audit-interface 27: the card read a calendar date
 * alone). With `by` the author's name follows: `Edited yesterday at 2:02 PM by Kevin`.
 */
export function editedLine(iso: string, now: Date = new Date(), by?: string): string {
  const date = new Date(iso);
  if (iso === '' || Number.isNaN(date.getTime())) return HOME.edited(iso);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
  const when = sameDay(date, now)
    ? `today at ${time}`
    : sameDay(date, yesterday)
      ? `yesterday at ${time}`
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  const line = HOME.edited(when);
  return by === undefined || by === '' ? line : `${line} by ${by}`;
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

/** The Recent entries as an opened map, so the server's order and the first render agree. */
function openedOf(recent: ReadonlyArray<RecentEntry>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of recent) out[entry.id] = entry.at;
  return out;
}

/**
 * A card drawn from this browser's Recent record alone (docs/POLISH.md items 75 and 76): the
 * facts the mirror kept when the deck was opened, standing in for the store's card until the
 * listing holds the deck. The slide count is the mirror's when the writer knew it, else 0, and
 * the list view's column reads it.
 */
export function cardOfRecent(entry: RecentEntry): DeckCard {
  return {
    id: entry.id,
    title: entry.title,
    slides: entry.slides ?? 0,
    sections: entry.slides === undefined ? 0 : 1,
    revision: entry.revision,
    updatedAt: entry.at,
    createdAt: entry.at,
    appearance: entry.appearance,
    firstSlide: entry.firstSlide,
  };
}

/**
 * The listing with this browser's decks folded in (items 75 and 76): a deck the listing holds is
 * the store's card; one it does not hold yet (a deck made from `/new` a moment ago, a copy, a
 * restore, while the blob tier's listing catches up) is drawn from the mirror, and once from the
 * store's own head (`readDeckCard`) when the page has asked for it. One card per deck, never two.
 */
export function foldRecent(
  list: ReadonlyArray<DeckCard>,
  recent: ReadonlyArray<RecentEntry>,
  heads: Readonly<Record<string, DeckCard>> = {},
): DeckCard[] {
  const listed = new Set(list.map((card) => card.id));
  const extra: DeckCard[] = [];
  for (const entry of recent) {
    if (listed.has(entry.id)) continue;
    listed.add(entry.id);
    extra.push(heads[entry.id] ?? cardOfRecent(entry));
  }
  return extra.length === 0 ? [...list] : [...extra, ...list];
}

// ---------------------------------------------------------------------------------------------
// The card menu (SPEC 6.2): Google's per item menu, in the words of the File menu

/** The rows of a card's menu: Google's Open, Open in new tab, Rename and Remove, plus ours. */
export const CARD_MENU_ITEMS: ReadonlyArray<MenuItem> = [
  { id: 'home.card.open', label: 'Open', icon: 'document', status: 'now' },
  { id: 'home.card.openNewTab', label: 'Open in new tab', icon: 'external', status: 'now' },
  { id: 'home.card.present', label: 'Present', icon: 'present', status: 'now', turboslide: true },
  { id: 'home.card.rename', label: 'Rename', icon: 'pencil', status: 'now', dividerBefore: true },
  {
    id: 'home.card.copy',
    label: DIALOGS.makeCopy.title,
    icon: 'document-duplicate',
    status: 'now',
  },
  {
    id: 'home.card.download',
    label: 'Download',
    icon: 'arrow-down-tray',
    status: 'now',
    turboslide: true,
  },
  {
    id: 'home.card.trash',
    label: 'Move to trash',
    icon: 'trash',
    status: 'now',
    dividerBefore: true,
  },
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
  sentence: 'Start one with the Blank presentation card above, or start from a template.',
  action: 'New Presentation',
  noMatch: (query: string) => `No presentation matches "${query}"`,
  noMatchSentence: 'Clear the search to see every presentation again.',
} as const;

function HomePage() {
  const { decks, admin, node, prefs: cookiePrefs, recent, now: serverNow } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  /* the old Template gallery anchor on a full load (docs/PRODUCT.md 4.3): the hash never reaches
     the server and the route's beforeLoad does not run again on hydration, so the page sends the
     reader on itself */
  useEffect(() => {
    if (window.location.hash === '#templates')
      void navigate({ to: '/decks/templates', replace: true });
  }, [navigate]);
  const page = useRef<HTMLElement>(null);
  const snackbar = useSnackbar();
  const [query, setQuery] = useState('');
  /* the cookie's settings on the server and on the first client render (SPEC-3 9.2 L1); the
     localStorage mirror is read after hydration and wins when the cookie was refused */
  const [settings, setSettings] = useState<HomeSettings>(cookiePrefs ?? DEFAULT_SETTINGS);
  /* this browser's opens: the cookie's row first (the server rendered the same), then the whole
     localStorage record after hydration */
  const [opened, setOpened] = useState<Record<string, string>>(() => openedOf(recent));
  /* this browser's decks: the cookie's entries on the server and at hydration, localStorage's
     after; they are the first cards of the grid until the listing holds them (item 76) */
  const [recentRow, setRecentRow] = useState<ReadonlyArray<RecentEntry>>(recent);
  /* the store's own card for a deck the listing did not hold, read once per page (item 75) */
  const [heads, setHeads] = useState<Readonly<Record<string, DeckCard>>>({});
  const [mounted, setMounted] = useState(false);
  /* decks moved to the trash from this page and not yet reloaded: hidden at once, Undo shows them */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  /* a rename the store answered and the listing has not caught up with: the card shows the new
     name at once and the overlay stands until the loader's card reaches the answered revision
     (docs/FOCUS.md rank 7: the /decks listing lags the store by up to a minute on the blob tier) */
  const [renamed, setRenamed] = useState<Readonly<Record<string, RenamedCard>>>({});
  const [creating, setCreating] = useState(false);
  /* the decks this page has asked the store about, so an unlisted deck costs one read per page */
  const asked = useRef<Set<string>>(new Set());
  const [busyDownload, setBusyDownload] = useState<string | null>(null);

  useMountEffect(() => {
    /* this browser's history is read after hydration, so the server's HTML and the first client
       render agree (React 418 otherwise); the settings come from the cookie already, and the
       localStorage mirror stands in when no cookie reached the server */
    if (cookiePrefs === null) setSettings(readSettings());
    setOpened((current) => ({ ...current, ...readOpened() }));
    const stored = readRecent();
    if (stored.length > 0) setRecentRow(stored);
    else setRecentRow((current) => current);
    setMounted(true);
    page.current?.setAttribute('data-hydrated', '');
    /* the editor's File > Move to trash (rank 16): the card is hidden, the row drops it, and the
       snackbar offers Undo, which restores the deck and its Recent entry */
    const trashed = takeTrashedMarker();
    if (trashed !== null) {
      /* the trash page of an anonymous visitor reads this browser's trash record (the Round 1 fix
         round, VERIFICATION.md "Round 1, pass 1" finding 4) */
      recordDeckTrashed(trashed.id);
      setHidden((current) => new Set([...current, trashed.id]));
      setRecentRow((current) => current.filter((entry) => entry.id !== trashed.id));
      snackbar.show(SNACKBARS.movedToTrash, {
        label: SNACKBARS.undo,
        run: () => {
          void (async () => {
            try {
              await restoreStoredDeck({ deckId: trashed.id });
              if (trashed.facts !== undefined) recordDeckOpened(trashed.id, trashed.facts);
              else recordDeckOpened(trashed.id);
              forgetDeckTrashed(trashed.id);
              setHidden((current) => {
                const next = new Set(current);
                next.delete(trashed.id);
                return next;
              });
              setRecentRow(readRecent());
              await router.invalidate();
            } catch (error) {
              snackbar.show(`Restore: ${errorMessage(error)}`);
            }
          })();
        },
      });
    }
  });

  /* the editor's Move to trash write refused after it left for this page (docs/POLISH.md item
     81): the card comes back and the list's snackbar says so */
  useEffect(() => {
    const onRefused = (event: Event) => {
      const detail = (event as CustomEvent<TrashRefusedDetail>).detail;
      if (detail === undefined) return;
      setHidden((current) => {
        const next = new Set(current);
        next.delete(detail.id);
        return next;
      });
      recordDeckOpened(detail.id);
      forgetDeckTrashed(detail.id);
      setRecentRow(readRecent());
      snackbar.show(`Move to trash: ${detail.message}`);
    };
    window.addEventListener(TRASH_REFUSED_EVENT, onRefused);
    return () => window.removeEventListener(TRASH_REFUSED_EVENT, onRefused);
  }, [snackbar]);

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

  /* the card's Download is the PowerPoint file File > Download gives (docs/POLISH.md item 85):
     the same export.run as the editor's row, the file named after the title, "Saved <name>" when
     it lands; the bundle stays under the editor's File > Download */
  const download = async (card: DeckCard) => {
    if (busyDownload !== null) return;
    setBusyDownload(card.id);
    snackbar.show(DOWNLOAD_WORDS.preparing('pptx'));
    try {
      /* the run is one appearance, the deck's own, so the file carries the title alone and no
         appearance tag (the polish round's verifier read "<title> (light).pptx" from a two
         appearance run beside a snackbar naming "<title>.pptx"); the snackbar names the file the
         browser saves: the stored copy's own name on a deployment, where the download is the
         browser's anchor and the page cannot rename it, the title's name on a checkout */
      const file = await exportPowerPoint(card.id, card.appearance);
      const name = file.name ?? fileNameOf(card.title, card.id, 'pptx');
      const saved = await downloadFromPage(file.url, { name });
      snackbar.show(DOWNLOAD_WORDS.saved(saved?.name ?? name));
    } catch (error) {
      snackbar.show(exportRefusal('pptx', error));
    } finally {
      setBusyDownload(null);
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
    recordDeckTrashed(card.id);
    snackbar.show(SNACKBARS.movedToTrash, {
      label: SNACKBARS.undo,
      run: () => {
        void (async () => {
          try {
            await restoreStoredDeck({ deckId: card.id });
            forgetDeckTrashed(card.id);
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
      /* the mirror reads the new name too (item 76), so the card the mirror draws before the
         listing catches up, the Open dialog and Import slides all read it */
      updateDeckFacts(card.id, { title: result.title, revision: result.revision });
      setRecentRow(readRecent());
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

  /* one clock for the server's HTML and the first client render (item 112), the live one after */
  const now = mounted ? new Date() : new Date(serverNow);
  /* a deck this browser opened that the listing does not hold (item 75): the store's own head
     says whether it exists (its card replaces the mirror's), is in the trash or is gone (the
     mirror forgets it); asked once per deck and page */
  const onUnlisted = useCallback((ids: ReadonlyArray<string>) => {
    for (const id of ids) {
      if (asked.current.has(id)) continue;
      asked.current.add(id);
      void readDeckCard({ deckId: id })
        .then((card) => {
          if (card === null) {
            /* missing, in the trash or no longer the caller's: the trash page asks about it once
               more and drops it unless it is this visitor's deck in the trash */
            forgetDeckOpened(id);
            recordDeckTrashed(id);
            setRecentRow((current) => current.filter((entry) => entry.id !== id));
            return;
          }
          setHeads((current) => ({ ...current, [id]: card }));
          updateDeckFacts(id, {
            title: card.title,
            revision: card.revision,
            appearance: card.appearance,
            firstSlide: card.firstSlide,
            slides: card.slides,
          });
        })
        .catch(() => undefined);
    }
  }, []);
  const visibleRecent = recentRow.filter((entry) => !hidden.has(entry.id));
  const listProps: ListProps = {
    query,
    settings,
    opened,
    mounted,
    now,
    hidden,
    renamed,
    recent: visibleRecent,
    heads,
    busyDownload,
    onOpen: open,
    onPresent: present,
    onDownload: (card) => void download(card),
    onTrash: (card) => void moveToTrash(card),
    onRename: (card, name) => void rename(card, name),
    onCopied: () => void refresh(),
    onError: (message) => snackbar.show(message),
    onUnlisted,
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
          {/* the gallery page (docs/PRODUCT.md 4.3): Your organisation's templates and Turboslide's */}
          <Link
            to="/decks/templates"
            className="ts-strip-gallery"
            data-control="home.gallery"
            {...tipProps({
              name: HOME.gallery,
              doc: 'Every template a presentation can start from, the ones saved here included.',
            })}
          >
            {HOME.gallery}
          </Link>
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
              data-control="home.template.gt-brand"
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
          </div>
          <div className="ts-recent-tools">
            {/* the deployment admin's filter (docs/NEXT.md 3.2 H2): drawn once the listing says
                the viewer may show every deck */}
            <Suspense fallback={null}>
              <AdminShowFilter
                admin={admin}
                show={search.show === 'all' ? 'all' : 'own'}
                onShow={(show) =>
                  void navigate({ to: '/decks', search: show === 'all' ? { show: 'all' } : {} })
                }
              />
            </Suspense>
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
                className="pt-select"
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

        {/* the store's cards stream behind the shell (SPEC-4 0.29): this browser's own decks
            are drawn as the first cards at first byte and the grid's frames stand in for the rest
            until the listing arrives; a refetch keeps the cards on the page; Back from the editor
            paints the listing it left (item 89) */}
        <Suspense fallback={<GridFrame view={settings.view} {...listProps} />}>
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
// The admin's filter (docs/NEXT.md 3.2 H2, question 8)

/**
 * The deployment admin's choice between their own and shared decks and every deck the store
 * holds; nothing for anyone else. It waits on the listing's own answer, so the page asks the
 * server nothing more for it.
 */
function AdminShowFilter({
  admin,
  show,
  onShow,
}: {
  admin: Promise<boolean>;
  show: 'own' | 'all';
  onShow: (show: 'own' | 'all') => void;
}) {
  const allowed = useAwaited({ promise: admin });
  if (!allowed) return null;
  return (
    <label className="ts-sort">
      <span className="ts-visually-hidden">Show</span>
      <select
        className="pt-select"
        value={show}
        data-control="home.show"
        onChange={(event) => onShow(event.target.value === 'all' ? 'all' : 'own')}
        {...tipProps({
          name: 'Show',
          doc: 'Your presentations and the ones shared with you, or every presentation here.',
        })}
      >
        <option value="own">{HOME.showOwn}</option>
        <option value="all">{HOME.showAll}</option>
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------------------------
// The frame while the store list streams (SPEC-4 0.29; PP 3.1 item 3)

/** how many card frames fill the first row of the grid at the rail's width */
const FRAME_COLUMNS = 4;

/**
 * The card grid's frame while the store listing streams (SPEC-4 0.29): this browser's own decks
 * as real cards first (the mirror's facts, in the server's HTML and clickable before the store
 * answers; docs/POLISH.md item 76), then one row of empty card boxes at the card's size, or the
 * rows' head with empty rows, so the cards arrive into the same height. `aria-busy` names the
 * wait. The recent cards keep their ids and their order in the listed grid, so the swap is in
 * place.
 */
function GridFrame({ view, ...props }: ListProps & { view: HomeView }) {
  const blanks = Array.from({ length: FRAME_COLUMNS }, (_, i) => i);
  const recentCards = foldRecent([], props.recent, props.heads).filter(
    (card) =>
      props.query.trim() === '' ||
      card.title.toLowerCase().includes(props.query.trim().toLowerCase()),
  );
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
          {recentCards.map((card, index) => (
            <DeckRowView
              key={card.id}
              card={card}
              index={index}
              mounted={props.mounted}
              now={props.now}
              openedAt={props.opened[card.id]}
              renaming={false}
              menuOpen={false}
              onOpen={() => props.onOpen(card)}
              onMenu={() => undefined}
              onRename={() => undefined}
              onCancelRename={() => undefined}
            />
          ))}
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
      {recentCards.map((card, index) => (
        <DeckCardView
          key={card.id}
          card={card}
          index={index}
          mounted={props.mounted}
          now={props.now}
          openedAt={props.opened[card.id]}
          renaming={false}
          menuOpen={false}
          plate={!(card.id in props.heads)}
          onOpen={() => props.onOpen(card)}
          onMenu={() => undefined}
          onRename={() => undefined}
          onCancelRename={() => undefined}
        />
      ))}
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

/**
 * The last listing this browser drew, kept in the module (docs/POLISH.md item 89): Back from the
 * editor mounts the page again with a new loader promise, and without this the grid would show
 * its frames until the store answered; with it the cards paint at once and the new listing
 * replaces them when it lands. Never read on the server, where the module is shared by every
 * request.
 */
let lastListing: DeckCard[] | null = null;

function rememberListing(list: ReadonlyArray<DeckCard>): void {
  if (typeof window !== 'undefined') lastListing = [...list];
}

function StoreList({ promise, ...props }: ListProps & { promise: Promise<DeckCard[]> }) {
  const kept = typeof window === 'undefined' ? null : lastListing;
  return kept === null ? (
    <StreamedStoreList promise={promise} {...props} />
  ) : (
    <KeptStoreList promise={promise} kept={kept} {...props} />
  );
}

function StreamedStoreList({ promise, ...props }: ListProps & { promise: Promise<DeckCard[]> }) {
  const list = useStreamedList(promise);
  useEffect(() => rememberListing(list), [list]);
  return <DeckList list={list} {...props} />;
}

function KeptStoreList({
  promise,
  kept,
  ...props
}: ListProps & { promise: Promise<DeckCard[]>; kept: DeckCard[] }) {
  const [list, setList] = useState<DeckCard[]>(kept);
  useEffect(() => {
    let alive = true;
    promise
      .then((next) => {
        if (!alive) return;
        rememberListing(next);
        setList(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [promise]);
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
  /** this browser's decks, folded into the grid as its first cards (items 75 and 76) */
  recent: ReadonlyArray<RecentEntry>;
  /** the store's own card for an unlisted deck the page asked about (item 75) */
  heads: Readonly<Record<string, DeckCard>>;
  /** the card whose PowerPoint file is being made (item 85) */
  busyDownload: string | null;
  onOpen: (card: DeckCard, newTab?: boolean) => void;
  onPresent: (card: DeckCard) => void;
  onDownload: (card: DeckCard) => void;
  onTrash: (card: DeckCard) => void;
  onRename: (card: DeckCard, name: string) => void;
  onCopied: (deckId: string) => void;
  onError: (message: string) => void;
  /** the decks of this browser the listing does not hold, each time it lands (item 75) */
  onUnlisted?: (ids: ReadonlyArray<string>) => void;
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
  recent,
  heads,
  busyDownload,
  onOpen,
  onPresent,
  onDownload,
  onTrash,
  onRename,
  onCopied,
  onError,
  onUnlisted,
}: ListProps & { list: ReadonlyArray<DeckCard> }) {
  const list = useMemo(
    () => foldRecent(applyRenames(listed, renamed), recent, heads),
    [listed, renamed, recent, heads],
  );
  /* the decks of this browser the listing does not hold, once the listing has landed */
  const listedIds = useMemo(() => new Set(listed.map((card) => card.id)), [listed]);
  const listedKey = listed.map((card) => card.id).join('|');
  const unlistedKey = recent
    .filter((entry) => !listed.some((card) => card.id === entry.id))
    .map((entry) => entry.id)
    .join('|');
  const onUnlistedRef = useRef(onUnlisted);
  onUnlistedRef.current = onUnlisted;
  useEffect(() => {
    if (unlistedKey !== '') onUnlistedRef.current?.(unlistedKey.split('|'));
  }, [listedKey, unlistedKey]);
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
        onDownload(card);
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
              busy={busyDownload === card.id}
              plate={!listedIds.has(card.id) && !(card.id in heads)}
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
                openedAt={opened[card.id]}
                renaming={renaming === card.id}
                menuOpen={menu?.deckId === card.id}
                busy={busyDownload === card.id}
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
  /** the card's PowerPoint file is being made (item 85) */
  busy?: boolean;
  /** the thumbnail is not asked for yet: the deck is this browser's memory alone until the listing or a head confirms it */
  plate?: boolean;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
};

/** A card's author when the listing carries one (B7's `updatedBy`, the display name of rank 4). */
type CardWithAuthor = DeckCard & { updatedBy?: string };

/** "Opened 2 hours ago" from this browser, else "Edited yesterday at 2:02 PM" from the store (3.6). */
function whenLine(card: DeckCard, mounted: boolean, now: Date, openedAt?: string): string {
  if (openedAt !== undefined) return HOME.opened(timeAgo(openedAt, now));
  // the server renders the ISO date; the reader's zone and form take over after hydration
  if (!mounted) return HOME.edited(card.updatedAt.slice(0, 10));
  return editedLine(card.updatedAt, now, (card as CardWithAuthor).updatedBy);
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
      <Icon name="ellipsis-vertical" />
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
    const el = field.current;
    if (!el) return;
    el.focus();
    el.select();
    /* the whole title selected scrolls the field to its end; the seller reads the start (item 97) */
    el.scrollLeft = 0;
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

/**
 * How many times one card asks the render route for its capture in one page life: the first ask
 * when the browser loads the lazy image, and one more each time the card comes back into view
 * after a failed ask, up to this count. There is no timed retry (docs/POLISH.md items 90 and
 * 111): the polish round's verifier read the listing asking `/api/render/<slide>` 243 times in
 * 14 s for 98 cards on the blob tier, every card that answered 404 or 204 asking again after 3 s,
 * after 6 s and once more on viewport entry, and the load took 10 s with 46 to 77 console errors.
 * A capture that is not there is the plate; the next view asks once more.
 */
export const THUMB_ASKS_PER_VIEW_MAX = 3;

/**
 * A card's thumbnail (docs/PRODUCT.md 3.6): the render route's capture of slide 1, and under it
 * from the first paint a plate in the deck's paper with the title in its ink (decks.css), so a
 * card is never a grey box. One ask per view (docs/POLISH.md items 90 and 111): the browser asks
 * once when the lazy image nears the viewport; a failed ask leaves the plate standing, and the
 * card asks once more only when it leaves the viewport and comes back (a new view), at most
 * THUMB_ASKS_PER_VIEW_MAX times in the page's life. A fresh deck's capture on save lands behind
 * the stream's close (server/card-thumb.ts), so the seller's next view of the list draws it.
 * Exported for the trash page.
 */
export function Thumb({
  card,
  eager = false,
  plate = false,
}: {
  card: Pick<DeckCard, 'id' | 'title' | 'firstSlide' | 'appearance' | 'revision'>;
  eager?: boolean;
  /** true draws the plate alone: a card this browser remembers before the listing or the store's own head confirms the deck still exists (main's cdbd0dd5; the round folds those cards into the grid) */
  plate?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /* the card left the viewport after its failed ask: the next entry is a new view */
  const wasOut = useRef(false);
  const box = useRef<HTMLSpanElement>(null);
  const base = plate ? null : cardThumbUrl(card);
  const url = base === null ? null : attempt === 0 ? base : `${base}&retry=${attempt}`;
  useEffect(() => {
    const el = box.current;
    if (
      !failed ||
      el === null ||
      attempt + 1 >= THUMB_ASKS_PER_VIEW_MAX ||
      typeof IntersectionObserver === 'undefined'
    )
      return undefined;
    wasOut.current = false;
    const observer = new IntersectionObserver((entries) => {
      const inView = entries.some((entry) => entry.isIntersecting);
      if (!inView) {
        wasOut.current = true;
        return;
      }
      if (!wasOut.current) return;
      observer.disconnect();
      setFailed(false);
      setAttempt((n) => n + 1);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [failed, attempt]);
  const capture = url !== null && !failed;
  return (
    <span
      ref={box}
      className="ts-hm-card-thumb"
      data-theme={card.appearance}
      data-thumb={capture ? 'capture' : 'plate'}
      data-loaded={capture && loaded ? '' : undefined}
      aria-hidden="true"
    >
      {/* the title plate stands under the capture from the first paint (item 90): a card is never
          a grey box while its picture loads or after a failed ask */}
      <span className="ts-hm-card-plate">{card.title}</span>
      {capture ? (
        <img
          key={url}
          src={url}
          width={320}
          height={180}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
        />
      ) : null}
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
  busy = false,
  plate = false,
  onOpen,
  onMenu,
  onRename,
  onCancelRename,
}: CardViewProps) {
  return (
    <li
      className={renaming ? 'ts-hm-card is-renaming' : 'ts-hm-card'}
      data-deck={card.id}
      data-control={`home.card.${card.id}`}
      data-busy={busy ? '' : undefined}
    >
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
      >
        <Thumb card={card} plate={plate} />
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
            onClick={(event) => {
              event.preventDefault();
              onOpen();
            }}
          >
            <span className="ts-hm-card-title-text">{card.title}</span>
          </Link>
        )}
        {renaming ? null : (
          <span className="ts-hm-card-when" suppressHydrationWarning>
            {busy ? DOWNLOAD_WORDS.preparing('pptx') : whenLine(card, mounted, now, openedAt)}
          </span>
        )}
        {renaming ? null : <MoreButton card={card} open={menuOpen} onMenu={onMenu} />}
      </div>
    </li>
  );
}

function DeckRowView({
  card,
  index,
  mounted,
  now,
  openedAt,
  renaming,
  menuOpen,
  busy = false,
  onOpen,
  onMenu,
  onRename,
  onCancelRename,
}: CardViewProps) {
  return (
    <tr
      className="ts-row"
      data-deck={card.id}
      data-control={`home.card.${card.id}`}
      data-busy={busy ? '' : undefined}
    >
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
            onClick={(event) => {
              event.preventDefault();
              onOpen();
            }}
          >
            <Icon name="deck" />
            <span className="ts-hm-card-title-text">{card.title}</span>
          </Link>
        )}
      </td>
      <td className="ts-row-when" suppressHydrationWarning>
        {openedAt !== undefined
          ? HOME.opened(timeAgo(openedAt, now))
          : mounted
            ? shortDate(card.updatedAt, now)
            : card.updatedAt.slice(0, 10)}
      </td>
      <td className="ts-row-count">{card.slides}</td>
      <td className="ts-row-more">
        <MoreButton card={card} open={menuOpen} onMenu={onMenu} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------------------------
// The card's Download (docs/POLISH.md item 85): the PowerPoint file of the whole deck

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The stored address of a PowerPoint file of the deck, and the name the store serves it under:
 * `export.run` with the Perfect mode in the deck's own appearance (one theme, so the name is the
 * title with no appearance tag, docs/POLISH.md items 85 and 86), through the same server
 * functions the editor's row and the print route use (a sync export on a deployment, a job on a
 * checkout). The address answers the file as an attachment; `downloadFromPage` saves it under
 * the title.
 */
async function exportPowerPoint(
  deckId: string,
  appearance: 'light' | 'dark',
): Promise<{ url: string; name: string | null }> {
  const input = {
    format: 'pptx' as const,
    mode: 'flatten' as const,
    theme: [appearance],
    verify: false,
  };
  const caps = await exportCapabilities();
  if (caps.sync) {
    const answer = await syncExport({ deckId, input });
    const file = answer.files.find((each) => each.name.endsWith('.pptx'));
    if (file?.url === undefined || file.url === null) throw new Error('no PowerPoint file');
    return { url: downloadAddress(file.url), name: file.name };
  }
  const job = await startExport({ deckId, input });
  for (;;) {
    const poll = await pollExport({ jobId: job.jobId });
    if (poll.status === 'failed') throw new Error(poll.error ?? 'the export failed');
    if (poll.status === 'done') {
      const file = poll.downloads?.find((each) => each.name.endsWith('.pptx'));
      if (file === undefined) throw new Error('no PowerPoint file');
      return { url: downloadAddress(file.url), name: file.name };
    }
    await sleep(EXPORT_POLL_MS);
  }
}

/** A stored copy is asked for as an attachment (Vercel Blob honours `download=1`); a route of ours already is one. */
function downloadAddress(url: string): string {
  if (url.startsWith('/')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

/**
 * The one sentence a refused export shows (docs/POLISH.md item 82): the store's and the worker's
 * words never reach the seller; the format is named and the advice is to try again.
 */
export function exportRefusal(format: 'pptx' | 'pdf', error: unknown): string {
  console.error(`turboslide download: the ${format} export was refused`, error);
  return DOWNLOAD_WORDS.notMade(format);
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
  const [copyComments, setCopyComments] = useState(false);
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
        ...(copyComments ? { copyComments: true } : {}),
      });
      recordDeckOpened(copy.deckId, {
        title: name.trim(),
        appearance: card.appearance,
        firstSlide: card.firstSlide,
        revision: 0,
        slides: card.slides,
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
      width={480}
      cancel
      cancelLabel={DIALOGS.makeCopy.cancel}
      actions={[
        {
          label: busy ? 'Copying' : DIALOGS.makeCopy.ok,
          primary: true,
          disabled: busy || name.trim() === '',
          onClick: () => void submit(),
          control: 'home.copy.ok',
          doc: 'Copies the presentation and opens the copy in a new tab',
        },
      ]}
    >
      <label className="ts-dialog-field">
        <span className="ts-dialog-field-label">{DIALOGS.makeCopy.name}</span>
        <input
          type="text"
          value={name}
          data-select="all"
          data-control="home.copy.name"
          aria-label={DIALOGS.makeCopy.name}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          {...tipProps({ name: DIALOGS.makeCopy.name, doc: 'The title of the copy' })}
        />
      </label>
      <DialogCheck
        label={DIALOGS.makeCopy.removeNotes}
        checked={removeNotes}
        onChange={setRemoveNotes}
        control="home.copy.remove-notes"
        doc="The copy carries no speaker notes"
      />
      <DialogCheck
        label={DIALOGS.makeCopy.copyComments}
        checked={copyComments}
        onChange={setCopyComments}
        control="home.copy.copy-comments"
        doc="The comment threads travel with the copy"
      />
    </Dialog>
  );
}
