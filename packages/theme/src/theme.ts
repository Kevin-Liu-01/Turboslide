// The theme's identity and its CSS as strings, for Node callers: the renderer inlines sheetCss()
// and stageCss() into the HTML it builds (SPEC 5.2), the standalone build inlines them once. The
// browser imports the .css files through the package exports instead.
import { readFileSync } from 'node:fs';

/** The one theme; a second theme is additive (SPEC 2.1, open question 6). */
export const THEME_ID = 'gt-ink-paper';

/** The root class the sheet tokens are scoped to; the theme attribute sits on the same element. */
export const SHEET_ROOT_CLASS = 'ts-sheet';
export const THEME_ATTRIBUTE = 'data-theme';

export const SHEET_CSS_URL = new URL('./gt-ink-paper/sheet.css', import.meta.url);
export const STAGE_CSS_URL = new URL('./gt-ink-paper/stage.css', import.meta.url);

let sheetCache: string | undefined;
let stageCache: string | undefined;

/** head:11-176 under .ts-sheet. */
export function sheetCss(): string {
  sheetCache ??= readFileSync(SHEET_CSS_URL, 'utf8');
  return sheetCache;
}

/** head:249-258 under .ts-sheet. */
export function stageCss(): string {
  stageCache ??= readFileSync(STAGE_CSS_URL, 'utf8');
  return stageCache;
}

/** Both files, sheet first, as one stylesheet. */
export function themeCss(): string {
  return `${sheetCss()}\n${stageCss()}`;
}

/** The class attribute of a sheet root for a theme: 'ts-sheet' plus the data-theme stamp. */
export function sheetRootAttributes(
  theme: 'light' | 'dark',
  extraClasses: ReadonlyArray<string> = [],
): string {
  const classes = [SHEET_ROOT_CLASS, ...extraClasses].join(' ');
  return `class="${classes}" ${THEME_ATTRIBUTE}="${theme}"`;
}
