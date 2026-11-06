import { useSyncExternalStore } from 'react';

import { drawAllDither } from './dither';
import {
  DECK_THEME_KEY,
  DEFAULT_THEME,
  THEME_KEY,
  isTheme,
  isThemeMessage,
  persistTheme,
  readTheme,
  setDocumentTheme,
  subscribeTheme,
  writeThemeColor,
} from './theme-state';
import type { Theme } from './theme-state';

// The document's state (the attribute, the dual key, the frames, the theme-color meta) is
// theme-state.ts, plain DOM; this module adds the twins and the dither redraw of a document that
// draws slides, and the React hook. Its names stay importable from here, where every caller found
// them.
export {
  DECK_THEME_KEY,
  DEFAULT_THEME,
  THEME_BOOT_SCRIPT,
  THEME_KEY,
  isTheme,
  isThemeMessage,
  postTheme,
  readStoredTheme,
  readTheme,
  setDocumentTheme,
  subscribeTheme,
  writeThemeColor,
} from './theme-state';
export type { Theme, ThemeMessage } from './theme-state';

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
  setDocumentTheme(theme);
  applyThemeToTree(document, theme);
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
    writeThemeColor(e.newValue);
    applyThemeToTree(document, e.newValue);
  };
  const onMessage = (e: MessageEvent) => {
    const data: unknown = e.data;
    if (!isThemeMessage(data) || e.origin !== window.location.origin) return;
    if (readTheme() === data.theme) return;
    document.documentElement.dataset.theme = data.theme;
    persistTheme(DECK_THEME_KEY, data.theme);
    writeThemeColor(data.theme);
    applyThemeToTree(document, data.theme);
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('message', onMessage);
  };
}

/**
 * The document theme for React. Hydration uses `serverTheme` (the route's
 * ?theme or dark) so the markup matches the server render; the client
 * snapshot then re-renders with the boot script's attribute before paint.
 */
export function useTheme(serverTheme: Theme = DEFAULT_THEME): Theme {
  return useSyncExternalStore(subscribeTheme, readTheme, () => serverTheme);
}
