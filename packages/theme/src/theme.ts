// The themes' CSS as strings, for Node callers: the renderer inlines sheetCss(id) and
// stageCss(id) into the HTML it builds (SPEC 5.2), the standalone build inlines them once. The
// browser imports the .css files through the package exports instead. Everything that is pure
// (the ids, the specs, the tokens per theme, the frame variables, the frame markup, the root
// attributes) lives in themes.ts and is re-exported here, so `@turboslide/theme/theme` stays the
// one subpath a Node caller needs (gslides-parity SPEC-5 9.3; R03 5.1).
import { readFileSync } from 'node:fs';
import type { ThemeId } from '@turboslide/schema/deck';
import { DEFAULT_THEME_ID } from './themes.ts';

export * from './themes.ts';

/** The one theme of rounds one to four; `THEME_IDS` lists both since round five (SPEC-5 0.45). */
export const THEME_ID: ThemeId = DEFAULT_THEME_ID;

export const SHEET_CSS_URL = new URL('./gt-ink-paper/sheet.css', import.meta.url);
export const STAGE_CSS_URL = new URL('./gt-ink-paper/stage.css', import.meta.url);
export const PLATE_SHEET_CSS_URL = new URL('./ts-plate/sheet.css', import.meta.url);
export const PLATE_STAGE_CSS_URL = new URL('./ts-plate/stage.css', import.meta.url);

/**
 * The stylesheet files per theme (gslides-parity SPEC-5 9.3; R03 5.1): the GT theme reads its
 * own two files; the Plate theme reads the GT files first and its own rules, keyed on
 * `[data-sheet='ts-plate']`, after them, so every GT rule an escape block relies on holds and the
 * Plate rules win where they differ.
 */
function cssUrls(id: ThemeId): { sheet: URL[]; stage: URL[] } {
  if (id === 'ts-plate')
    return {
      sheet: [SHEET_CSS_URL, PLATE_SHEET_CSS_URL],
      stage: [STAGE_CSS_URL, PLATE_STAGE_CSS_URL],
    };
  return { sheet: [SHEET_CSS_URL], stage: [STAGE_CSS_URL] };
}

const sheetCache = new Map<ThemeId, string>();
const stageCache = new Map<ThemeId, string>();

function readJoined(urls: URL[]): string {
  return urls.map((url) => readFileSync(url, 'utf8')).join('\n');
}

/** head:11-176 under .ts-sheet, for the theme (the Plate rules after the GT sheet on `ts-plate`). */
export function sheetCss(id: ThemeId = DEFAULT_THEME_ID): string {
  let css = sheetCache.get(id);
  if (css === undefined) {
    css = readJoined(cssUrls(id).sheet);
    sheetCache.set(id, css);
  }
  return css;
}

/** head:249-258 under .ts-sheet, for the theme (the Plate rules after the GT stage on `ts-plate`). */
export function stageCss(id: ThemeId = DEFAULT_THEME_ID): string {
  let css = stageCache.get(id);
  if (css === undefined) {
    css = readJoined(cssUrls(id).stage);
    stageCache.set(id, css);
  }
  return css;
}

/**
 * Both files, sheet first, as one stylesheet: the theme's own CSS. The override stylesheet of an
 * edited deck is `themeCss(deck)` in `@turboslide/render/theme-css`, loaded after this one.
 */
export function themeCss(id: ThemeId = DEFAULT_THEME_ID): string {
  return `${sheetCss(id)}\n${stageCss(id)}`;
}
