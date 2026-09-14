import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';

import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

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

import './decks.css';

/**
 * The home page, /decks (gslides-parity SPEC 6.2; R03 a.1 and finding 13): Google's three bands.
 * The app bar with the GT mark, the product name and a search field that filters the list by
 * title; "Start a new presentation" with the Blank card (opens /new) and the GT brand deck card
 * (a copy of the GT template, opened at once) under a Template gallery link that scrolls to the
 * strip; "Recent presentations" as a grid of cards (a 320 by 180 thumbnail of slide 1 in the
 * deck's appearance, the title, "Opened 2 hours ago" from this browser's history or "Edited
 * <date>") with a list view toggle, a sort control and a per card menu (Open, Open in new tab,
 * Present, Rename, Make a copy, Download, Move to trash). Trash at the bottom links to
 * /decks/trash. Every read is `deck.list` through the store (server/decks.ts listDecks), the one
 * call the Open dialog, the Import slides dialog, the CLI and MCP share, so decks in the trash and
 * unsaved drafts never appear. Recent is this browser's own history first, then the store's
 * updatedAt, so a rep sees their decks before other people's (R10 B6: there is no identity).
 *
 * The page is server rendered and announces hydration (`data-hydrated`): a click on the server's
 * HTML before the handlers attach is lost (measured on the dev server), so the specs wait for it.
 * The file is decks.index.tsx, not decks.tsx: a decks.tsx would become the layout route of
 * decks.$deckId.assets.$ and run this loader for every asset request. The bundle upload form of
 * the earlier /decks lives in File > Open's Upload tab now; the connect facts in Extensions >
 * Agent access; the health call stays so every build carries the server-only marker
 * scripts/check-client-bundle.mjs looks for (AGENTS.md).
 */
export const Route = createFileRoute('/decks/')({
  loader: async () => {
    const [decks, health, prefs] = await Promise.all([
      listDecks(),
      getServerHealth(),
      readHomePrefs(),
    ]);
    return { decks, node: health.node, prefs };
  },
  head: () => ({ meta: [{ title: `${HOME.recent}, Turboslide` }] }),
  component: HomePage,
});

// ---------------------------------------------------------------------------------------------
// This browser's history and settings (SPEC 6.2 "Recent"), in localStorage; private to the browser

/** deck id to the ISO time it was last opened from this browser. */
export const RECENT_KEY = 'turboslide:opened';

/** the view and sort the rep last chose */
const HOME_SETTINGS_KEY = 'turboslide:home';

export type HomeSort = 'opened' | 'modified' | 'title';
export type HomeView = 'grid' | 'list';

type HomeSettings = { sort: HomeSort; view: HomeView };

const DEFAULT_SETTINGS: HomeSettings = { sort: 'opened', view: 'grid' };

/**
 * The saved view and sort as a cookie the loader reads (gslides-parity SPEC-3 9.2 L1; research-3
 * 05 3.4 L1): `ts-home=view:list;sort:title`, same origin, one year, so the server renders the
 * rows or the cards and the order the rep chose and the first client render agrees with it (no
 * reflow of the recent band after hydration). localStorage stays the mirror. The `opened` order
 * is this browser's history and cannot reach the server, so with that sort the band is hidden
 * until mounted (`data-pending`) and shows once, in its final order; a hidden band never counts.
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

/** The saved settings from the request's cookie, or null; the client keeps them beside localStorage. */
const readHomePrefs = createServerFn({ method: 'GET' }).handler((): HomeSettings | null => {
  try {
    return parseHomeCookie(getRequest().headers.get('cookie'));
  } catch {
    return null;
  }
});

export function readOpened(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>))
      if (typeof at === 'string') out[id] = at;
    return out;
  } catch {
    return {};
  }
}

/** Marks a deck as opened now, for the home page's Recent order and its "Opened ..." line. */
export function recordDeckOpened(deckId: string, now: Date = new Date()): void {
  try {
    const opened = readOpened();
    opened[deckId] = now.toISOString();
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(opened));
  } catch {
    // private mode or storage full: the list keeps the store's order
  }
}

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
export function cardThumbUrl(card: DeckCard): string | null {
  if (card.firstSlide === null) return null;
  return `/api/render/${encodeURIComponent(card.firstSlide)}?deck=${encodeURIComponent(card.id)}&theme=${card.appearance}&w=320&r=${card.revision}`;
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
    const first = root.current?.querySelector<HTMLElement>('[data-autofocus], ' + FOCUSABLE);
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

function HomePage() {
  const { decks, node } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const page = useRef<HTMLElement>(null);
  const snackbar = useSnackbar();
  const [query, setQuery] = useState('');
  /* the cookie's settings on the server and on the first client render (SPEC-3 9.2 L1); the
     localStorage mirror is read after hydration and wins when the cookie was refused */
  const cookiePrefs = Route.useLoaderData().prefs;
  const [settings, setSettings] = useState<HomeSettings>(cookiePrefs ?? DEFAULT_SETTINGS);
  const [opened, setOpened] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);
  /* decks moved to the trash from this page and not yet reloaded: hidden at once, Undo shows them */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<CardMenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [copying, setCopying] = useState<DeckCard | null>(null);
  const [creating, setCreating] = useState(false);

  useMountEffect(() => {
    /* this browser's history is read after hydration, so the server's HTML and the first client
       render agree (React 418 otherwise); the settings come from the cookie already, and the
       localStorage mirror stands in when no cookie reached the server */
    if (cookiePrefs === null) setSettings(readSettings());
    setOpened(readOpened());
    setMounted(true);
    page.current?.setAttribute('data-hydrated', '');
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = decks.filter(
      (card) =>
        !hidden.has(card.id) && (needle === '' || card.title.toLowerCase().includes(needle)),
    );
    return sortCards(filtered, settings.sort, opened);
  }, [decks, hidden, query, settings.sort, opened]);

  const cardById = (deckId: string): DeckCard | undefined =>
    decks.find((card) => card.id === deckId);

  const open = (deckId: string, newTab = false) => {
    recordDeckOpened(deckId);
    if (newTab) {
      window.open(editPath(deckId), '_blank', 'noopener');
      return;
    }
    void navigate({ to: '/edit/$deckId', params: { deckId } });
  };

  const present = (deckId: string) => {
    recordDeckOpened(deckId);
    window.open(presentPath(deckId), '_blank', 'noopener');
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
      await trashStoredDeck({ deckId: card.id, baseRevision: card.revision });
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

  const onMenuSelect = (item: MenuItem) => {
    const state = menu;
    setMenu(null);
    if (state === null) return;
    const card = cardById(state.deckId);
    if (card === undefined) return;
    switch (item.id) {
      case 'home.card.open':
        open(card.id);
        return;
      case 'home.card.openNewTab':
        open(card.id, true);
        return;
      case 'home.card.present':
        present(card.id);
        return;
      case 'home.card.rename':
        setRenaming(card.id);
        return;
      case 'home.card.copy':
        setCopying(card);
        return;
      case 'home.card.download':
        void download(card.id);
        return;
      case 'home.card.trash':
        void moveToTrash(card);
        return;
      default:
        return;
    }
  };

  const onMenuClose = (_reason: MenuCloseReason) => setMenu(null);

  const rename = async (card: DeckCard, name: string) => {
    setRenaming(null);
    const title = name.trim();
    if (title === '' || title === card.title) return;
    try {
      const result = await renameStoredDeck({
        deckId: card.id,
        name: title,
        baseRevision: card.revision,
      });
      if (!result.ok) {
        snackbar.show(`Rename: ${result.message}`);
        return;
      }
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

  return (
    <main ref={page} className="ts-home ts-home-page" data-node={node}>
      <header className="ts-appbar">
        <Link
          to="/decks"
          className="ts-appbar-brand"
          {...tipProps({ name: 'Turboslide', doc: 'Your presentations.' })}
        >
          <GtMark width={30} height={19} />
          <span>Turboslide</span>
        </Link>
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
        // the opened order is this browser's alone: hidden until mounted, then shown in its final
        // order (L1); a sort the server knows paints once and stays
        data-pending={!mounted && settings.sort === 'opened' ? '' : undefined}
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

        {visible.length === 0 ? (
          <p className="ts-home-empty" data-control="home.empty">
            {decks.length === 0 || hidden.size === decks.length
              ? HOME.empty
              : `No presentation matches "${query.trim()}"`}
          </p>
        ) : settings.view === 'grid' ? (
          <ul className="ts-cards" data-control="home.cards">
            {visible.map((card) => (
              <DeckCardView
                key={card.id}
                card={card}
                mounted={mounted}
                now={now}
                openedAt={opened[card.id]}
                renaming={renaming === card.id}
                menuOpen={menu?.deckId === card.id}
                onOpen={() => open(card.id)}
                onMenu={(anchor) => setMenu({ deckId: card.id, anchor })}
                onRename={(name) => void rename(card, name)}
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
              {visible.map((card) => (
                <DeckRowView
                  key={card.id}
                  card={card}
                  mounted={mounted}
                  now={now}
                  renaming={renaming === card.id}
                  menuOpen={menu?.deckId === card.id}
                  onOpen={() => open(card.id)}
                  onMenu={(anchor) => setMenu({ deckId: card.id, anchor })}
                  onRename={(name) => void rename(card, name)}
                  onCancelRename={() => setRenaming(null)}
                />
              ))}
            </tbody>
          </table>
        )}
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
          onCopied={() => {
            setCopying(null);
            void refresh();
          }}
          onError={(message) => snackbar.show(`${DIALOGS.makeCopy.title}: ${message}`)}
        />
      ) : null}

      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// Cards and rows

type CardViewProps = {
  card: DeckCard;
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
      const copy = await copyStoredDeck({
        deckId: card.id,
        name: name.trim(),
        removeNotes,
        baseRevision: card.revision,
      });
      recordDeckOpened(copy.deckId);
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
