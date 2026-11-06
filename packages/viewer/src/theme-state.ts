import { THEME_COLORS } from '@turboslide/theme/brand/site';

/**
 * The document's theme, plain DOM with no React and no dither, so a page that runs no React keeps
 * it too (/home's static script, apps/studio/src/components/site/home-entry.ts); theme.ts adds the
 * twins, the dither redraw and the React hook, and its importers find these names there as well.
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

/** Writes one key of the dual key; a private window keeps the attribute alone. */
export function persistTheme(key: string, value: string): void {
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

/** Posts the theme to every frame of this document. */
function broadcastTheme(theme: Theme): void {
  document.querySelectorAll('iframe').forEach((frame) => postTheme(frame.contentWindow, theme));
}

/**
 * The `theme-color` meta follows the stored theme (gslides-parity SPEC-4 1.6; research-4 report 02
 * section 2.4): one value, the theme's `--pt-paper`, no `media` attribute, so the browser's own
 * chrome follows the page and not the operating system. The studio's root route carries the meta
 * and a boot script sets it before first paint; this keeps it right after a toggle or a message.
 * A document without the meta (a test, an embed host) is left alone.
 */
export function writeThemeColor(
  theme: Theme,
  doc: Pick<Document, 'querySelector'> = document,
): void {
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

/**
 * Stamps the attribute, persists the dual key and tells every frame, for a document that draws no
 * twin and no dither (the site pages: their slides draw in frames, which the message reaches);
 * `applyTheme` of theme.ts adds the document's twins and dither canvases.
 */
export function setDocumentTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  persistTheme(THEME_KEY, theme);
  persistTheme(DECK_THEME_KEY, theme);
  writeThemeColor(theme);
  broadcastTheme(theme);
}

/** Calls back on every change of html[data-theme]. */
export function subscribeTheme(callback: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/**
 * The boot script for the document head (head.html lines 3 to 9, SPEC 3.4):
 * reads gt-theme then gt-deck-theme and stamps data-theme before first
 * paint, so the document never paints the light defaults and then flips.
 * Never consults prefers-color-scheme. Inlined as text by the studio root.
 */
export const THEME_BOOT_SCRIPT =
  "try{var t=localStorage.getItem('gt-theme');if(t!=='light'&&t!=='dark')t=localStorage.getItem('gt-deck-theme');document.documentElement.setAttribute('data-theme',t==='light'||t==='dark'?t:'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}";
