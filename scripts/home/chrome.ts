// The hero frame's editor chrome (docs/DESIGN.md 8.2; DR-D4#2). D4 owns this file and the
// `chrome.generated.ts` it writes. `scripts/build-home-assets.ts --slides` calls
// `deriveEditorChrome()` and writes the text it returns, formatted, to
// apps/studio/src/components/home/chrome.generated.ts; `--check` compares that text with the file.
//
// What it writes, so the frame draws the editor's own chrome and never a mock of it:
// - the toolbar's sixteen controls with nothing selected, in the editor's order, read from the menu
//   model's `TOOLBAR_HEAD` and `TOOLBAR_TAIL_DEFAULT` (packages/chrome/src/menus/model.ts): the ones
//   the editor draws for a person who can edit at the default settings (`status: 'now'`, not parked
//   behind Advanced tools), without the far right chevron that hides the menus; each with its
//   label, its glyph name or its word, and the rule before it;
// - the title row's words and glyphs as packages/chrome/src/TitleRow.tsx draws them: the saved
//   phrase (`TITLE_ROW.saved` beside the `cloud` glyph), the comments glyph and its label from the
//   model, Slideshow with `play` and the split's `chevron-down`, Share with `lock-closed`;
// - the first screen's glyph names in one list, which icons.generated.css draws as masks.
import { TITLE_ROW } from '../../packages/chrome/src/menus/strings.ts';
import {
  TOOLBAR_HEAD,
  TOOLBAR_TAIL_DEFAULT,
  itemById,
} from '../../packages/chrome/src/menus/model.ts';
import type { ToolbarControl } from '../../packages/chrome/src/menus/model.ts';

import { iconPathsOf } from './icons.ts';

/** The control that hides the menus sits at the toolbar's far right, apart from the sixteen. */
const LEFT_OUT = new Set(['toolbar.hideMenus']);

export type ToolbarCell = {
  control: string;
  label: string;
  /** the glyph name of icons.tsx; null for a word */
  icon: string | null;
  /** the word a text control draws */
  word: string | null;
  /** a rule before the control (the model's `dividerBefore`) */
  divider: boolean;
};

function drawn(control: ToolbarControl): boolean {
  return control.status === 'now' && control.advanced !== true && !LEFT_OUT.has(control.control);
}

/** The zoom box reads its first level at rest (ToolbarHead.tsx: Fit until a zoom is chosen). */
function zoomWord(control: ToolbarControl): string {
  const first = (control.doc ?? '').split(',')[0]?.trim() ?? '';
  if (first === '') throw new Error(`${control.control} names no zoom level in its doc`);
  return first;
}

export function toolbarCells(): ToolbarCell[] {
  const cells = [...TOOLBAR_HEAD, ...TOOLBAR_TAIL_DEFAULT].filter(drawn).map((control) => {
    const text = control.text === true;
    if (!text && control.icon === undefined) throw new Error(`${control.control} has no glyph`);
    if (!text) iconPathsOf(control.icon as string);
    return {
      control: control.control,
      label: control.label,
      icon: text ? null : (control.icon as string),
      word: text ? (control.control === 'toolbar.zoom' ? zoomWord(control) : control.label) : null,
      divider: control.dividerBefore === true,
    };
  });
  if (cells.length !== 16) throw new Error(`the toolbar draws ${cells.length} controls, not 16`);
  return cells;
}

/** The title row's words and glyphs (TitleRow.tsx: the save cell, the comments glyph, the split, Share). */
export function titleRow(): {
  saved: string;
  savedIcon: string;
  comments: string;
  commentsIcon: string;
  slideshow: string;
  slideshowIcon: string;
  slideshowMore: string;
  share: string;
  shareIcon: string;
  agentIcon: string;
} {
  const comments = itemById('title.comments') as { label: string; icon?: string };
  return {
    saved: TITLE_ROW.saved,
    savedIcon: 'cloud',
    comments: comments.label,
    commentsIcon: comments.icon ?? 'chat',
    slideshow: TITLE_ROW.slideshow,
    slideshowIcon: 'play',
    slideshowMore: 'chevron-down',
    share: TITLE_ROW.share,
    shareIcon: 'lock-closed',
    /* the agent's chip in the presence slot and the terminal's head: the CLI's glyph */
    agentIcon: 'command-line',
  };
}

/** The steps' glyphs in the terminal's foot: a step done, the step playing. */
export const STEP_ICONS = { done: 'check-circle', playing: 'play' } as const;

/** Every glyph of the first screen, in the order icons.generated.css writes their masks. */
export function firstScreenIcons(): string[] {
  const row = titleRow();
  const names = [
    'pause',
    'play',
    row.savedIcon,
    row.commentsIcon,
    row.slideshowMore,
    row.shareIcon,
    row.agentIcon,
    ...toolbarCells().flatMap((cell) => (cell.icon === null ? [] : [cell.icon])),
    STEP_ICONS.done,
  ];
  const unique = [...new Set(names)];
  for (const name of unique) iconPathsOf(name);
  return unique;
}

export function deriveEditorChrome(header: string): string {
  return `${header}
//
// The hero frame's editor chrome, read from the editor at build (scripts/home/chrome.ts): the
// toolbar's sixteen controls from the menu model and the title row's words and glyphs from
// TitleRow.tsx's strings, so the frame draws the editor's own controls.

export type HomeToolbarCell = {
  control: string;
  label: string;
  /** the glyph of packages/chrome/src/icons.tsx, drawn as a mask of icons.generated.css; null for a word */
  icon: string | null;
  word: string | null;
  divider: boolean;
};

export const HOME_TOOLBAR: readonly HomeToolbarCell[] = ${JSON.stringify(toolbarCells(), null, 2)};

export const HOME_TITLE_ROW = ${JSON.stringify(titleRow(), null, 2)} as const;

export const HOME_STEP_ICONS = ${JSON.stringify(STEP_ICONS, null, 2)} as const;
`;
}
