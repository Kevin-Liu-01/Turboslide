import { useSyncExternalStore } from 'react';

import { drawAllDither } from './dither';

/**
 * The deck's theme (SPEC 2.1, 6.8), ported from deck/parts/tail.html
 * (storedTheme, toggleTheme, applyTheme, the storage and message listeners)
 * and Prototemplate/src/components/viewer/ThemeButton.tsx (readTheme,
 * postTheme, applyTheme). State lives on <html data-theme>; the choice
 * persists under the dual key, gt-theme (the key the Prototemplate shell
 * reads and writes) then gt-deck-theme (the deck's older one); dark is the
 * default when neither is set, and prefers-color-scheme is never consulted.
 * A toggle propagates three ways: the attribute for this document, the
 * storage event for other same-origin documents, and { type: 'gt-theme',
 * theme } posted to every same-origin frame (and received from the page
 * around a frame, which is how Prototemplate's DeckFrame hands the embed its
 * theme on load; SPEC 5.3).
 */
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'gt-theme';
export const DECK_THEME_KEY = 'gt-deck-theme';
export const DEFAULT_THEME: Theme = 'dark';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

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
    // private mode: the attribute alone carries the choice for the session
  }
}

/** gt-theme, then gt-deck-theme, then dark (tail.html storedTheme). */
export function readStoredTheme(): Theme {
  const site = load(THEME_KEY);
  if (isTheme(site)) return site;
  const deck = load(DECK_THEME_KEY);
  if (isTheme(deck)) return deck;
  return DEFAULT_THEME;
}

/** The theme on <html>, or the default when the attribute is missing. */
export function readTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const current = document.documentElement.dataset.theme;
  return isTheme(current) ? current : DEFAULT_THEME;
}

/** The message a theme change posts to every same-origin frame (ThemeButton.tsx ThemeMessage). */
export type ThemeMessage = { type: 'gt-theme'; theme: Theme };

export function isThemeMessage(data: unknown): data is ThemeMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'theme' in data &&
    data.type === 'gt-theme' &&
    isTheme(data.theme)
  );
}

/** Posts the theme to one frame's window; a frame that left the origin never receives it. */
export function postTheme(target: Window | null | undefined, theme: Theme): void {
  if (!target) return;
  const message: ThemeMessage = { type: 'gt-theme', theme };
  try {
    target.postMessage(message, window.location.origin);
  } catch {
    // a detached frame: nothing to tell
  }
}

function broadcastTheme(theme: Theme): void {
  document.querySelectorAll('iframe').forEach((frame) => postTheme(frame.contentWindow, theme));
}

/**
 * Swaps every `img[data-light], img[data-dark]` under root to the theme's twin (tail.html
 * applyTheme) and redraws every dither canvas (SPEC 6.8: applyTheme swaps
 * twins and redraws dither canvases). Runs on every innerHTML set as well,
 * since a fresh render carries the light src.
 */
export function applyThemeToTree(root: ParentNode, theme: Theme): void {
  const dark = theme === 'dark';
  // The renderer writes only the twin that differs from src (render/blocks/context.ts).
  root.querySelectorAll<HTMLImageElement>('img[data-light], img[data-dark]').forEach((img) => {
    if (!img.dataset.light) img.dataset.light = img.getAttribute('src') ?? '';
    if (!img.dataset.dark) img.dataset.dark = img.getAttribute('src') ?? '';
    const want = dark ? img.dataset.dark : img.dataset.light;
    if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
  });
  drawAllDither(root, theme);
}

/** Stamps the attribute, persists the dual key, updates the document's twins and tells every frame. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  store(THEME_KEY, theme);
  store(DECK_THEME_KEY, theme);
  applyThemeToTree(document, theme);
  broadcastTheme(theme);
}

/** Flips the theme and returns the new one. */
export function toggleTheme(): Theme {
  const next: Theme = readTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

/**
 * The listeners a document keeps for the life of a viewer: the gt-theme
 * storage event from another same-origin document, and the gt-theme message
 * from the page around this frame (same origin only). Both land the way a
 * local toggle does, without re-posting, so two documents never echo.
 */
export function installThemeBridge(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY || !isTheme(e.newValue)) return;
    if (readTheme() === e.newValue) return;
    document.documentElement.dataset.theme = e.newValue;
    applyThemeToTree(document, e.newValue);
  };
  const onMessage = (e: MessageEvent) => {
    const data: unknown = e.data;
    if (!isThemeMessage(data) || e.origin !== window.location.origin) return;
    if (readTheme() === data.theme) return;
    document.documentElement.dataset.theme = data.theme;
    store(DECK_THEME_KEY, data.theme);
    applyThemeToTree(document, data.theme);
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('message', onMessage);
  };
}

/** Calls back on every change of html[data-theme]. */
export function subscribeTheme(callback: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/**
 * The document theme for React. Hydration uses `serverTheme` (the route's
 * ?theme or dark) so the markup matches the server render; the client
 * snapshot then re-renders with the boot script's attribute before paint.
 */
export function useTheme(serverTheme: Theme = DEFAULT_THEME): Theme {
  return useSyncExternalStore(subscribeTheme, readTheme, () => serverTheme);
}

/**
 * The boot script for the document head (head.html lines 3 to 9, SPEC 3.4):
 * reads gt-theme then gt-deck-theme and stamps data-theme before first
 * paint, so the document never paints the light defaults and then flips.
 * Never consults prefers-color-scheme. Inlined as text by the studio root.
 */
export const THEME_BOOT_SCRIPT =
  "try{var t=localStorage.getItem('gt-theme');if(t!=='light'&&t!=='dark')t=localStorage.getItem('gt-deck-theme');document.documentElement.setAttribute('data-theme',t==='light'||t==='dark'?t:'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}";
