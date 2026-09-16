// The themes as data (gslides-parity SPEC-5 0.45, 9.1, 9.3; R03 4.6, 5.1, 5.2; MILESTONES-5 B6
// day 1): `THEME_IDS`, one `ThemeSpec` per id (its tokens, its frame, its corner slot, its
// counter, its chips, its display face), `tokensFor(id)`, the frame variables `sheet.css` declares
// on the root and `themeCss(deck)` (packages/render theme-css.ts) overrides for an edited deck,
// `stageFrame(id)` (the frame markup the stage emits) and `sheetRootAttributes(id, appearance)`,
// which stamps `data-sheet` for the theme id beside `data-theme` for the appearance (the
// attribute name `data-theme` is taken by the appearance and cannot move without touching every
// stylesheet, R03 5.1). This module is pure and browser safe: the file readers `sheetCss(id)`,
// `stageCss(id)` and `themeCss(id)` live in theme.ts, which re-exports everything here.
//
// Day 1 of round five (2026-09-15): both ids answer today's GT frame, stylesheets and geometry,
// so nothing on a sheet moves (the Perfect export of the GT deck stays byte identical); the Plate
// theme's own stylesheets, frame markup and corner slot land on B6's day 6 (SPEC-5 9.3) under the
// spec `THEME_SPECS['ts-plate']` already states.
import type { ThemeId, ThemeMarkKind, ThemeTypeLevel } from '@turboslide/schema/deck';
import { THEMES } from '@turboslide/schema/deck';
import type { Theme as Appearance } from '@turboslide/schema/render';
import { COUNTER, CROSS, DISPLAY, RAIL, TOKENS, WORDMARK } from './tokens.ts';
import type { ThemeName, TokenName } from './tokens.ts';

/** The built in themes (SPEC-5 1.2 `THEMES`); the schema holds the list, this is its theme side. */
export const THEME_IDS: ReadonlyArray<ThemeId> = THEMES;

/** The theme a deck without a `theme` reading gets, and the one every round before five shipped. */
export const DEFAULT_THEME_ID: ThemeId = 'gt-ink-paper';

/** The panel labels (SPEC-5 0.45: "The working panel label is "Plate"; the label is Kevin's"). */
export const THEME_LABELS: Readonly<Record<ThemeId, string>> = {
  'gt-ink-paper': 'GT',
  'ts-plate': 'Plate',
};

/** The root class the sheet tokens are scoped to; the theme attributes sit on the same element. */
export const SHEET_ROOT_CLASS = 'ts-sheet';
/** The appearance attribute (`light` or `dark`; head:11-32). */
export const THEME_ATTRIBUTE = 'data-theme';
/** The theme id attribute (R03 5.1): the second theme's stylesheet keys its rules on it. */
export const SHEET_ATTRIBUTE = 'data-sheet';
/**
 * The opt out for a sheet root that shows a base theme without the deck's edits (the Themes
 * panel's GT and Plate tiles, SPEC-5 9.2): `themeCss(deck)` scopes its override to
 * `.ts-sheet:not([data-theme-base])`, so every other surface (the editor, the viewer, present
 * mode, the filmstrip clones, the print document, the standalone file, the SVG writer) draws the
 * edited theme with no attribute to stamp.
 */
export const THEME_BASE_ATTRIBUTE = 'data-theme-base';

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as ReadonlyArray<string>).includes(value);
}

export type FrameSide = 'left' | 'right' | 'top' | 'bottom';

/** The edge grid: rails (left, right) and rules (top, bottom) at `rail` px from the sheet edge. */
export type ThemeFrame = {
  /** the record's `frame.inset`; 56 on the GT theme (head:39-43) */
  rail: number;
  /** the rails and rules the frame draws */
  sides: ReadonlyArray<FrameSide>;
  /** the four registration crosses where the rails and rules meet */
  crosses: boolean;
  /** the 11 px cross's offset from each corner (51 on the GT theme, head:44-49) */
  crossOffset: number;
  crossSize: number;
};

/** The corner slot (R03 4.4): the GT mark, a picture, the Turboslide mark (never drawn), or empty. */
export type ThemeMarkSlot = {
  kind: ThemeMarkKind;
  left: number;
  bottom: number;
  width: number;
  height: number;
};

export type ThemeCounter = {
  show: boolean;
  side: 'left' | 'right';
  /** distance from the side's edge */
  inset: number;
  bottom: number;
  fontSize: number;
};

export type ThemeSpec = {
  id: ThemeId;
  label: string;
  /** the ten tokens per appearance; both themes carry the same values (SPEC-5 0.45) */
  tokens: Readonly<Record<ThemeName, Readonly<Record<TokenName, string>>>>;
  frame: ThemeFrame;
  mark: ThemeMarkSlot;
  counter: ThemeCounter;
  /** the two paper chips under the mark and the counter on full picture slides (SPEC 5.2) */
  chips: boolean;
  /** the display face rule: weight 500, the tracking, the cv11 and ss01 alternates (SPEC-4 1.2) */
  display: { weight: number; tracking: string; features: string };
  /**
   * The picture plates as fractions of the page (SPEC-5 9.3; R08 3c): x, y, w, h over the page's
   * width and height, so `plateBoxes(id, page)` answers the sheet box on any page. GT keeps the
   * measured boxes of `PLATE_BOXES` (packages/effects metrics.ts); Plate is the identity's window,
   * W/8, H/2, W/2, 3H/8 for the opener and the closing, mirrored for the mood plate.
   */
  plates: Readonly<Record<PlateName, PlateFraction>>;
  /** the stylesheet folder under packages/theme/src; the Plate folder holds the rules keyed on its data-sheet over the GT sheet */
  folder: string;
};

export type PlateName = 'opener' | 'mood' | 'closing';
/** A box as fractions of the page: [x / W, y / H, w / W, h / H]. */
export type PlateFraction = readonly [number, number, number, number];

/** The GT plates as the fractions of the 1600 by 900 page that PLATE_BOXES measured. */
const GT_PLATES: Readonly<Record<PlateName, PlateFraction>> = {
  opener: [137 / 1600, 500 / 900, 740 / 1600, 271 / 900],
  mood: [851 / 1600, 539 / 900, 612 / 1600, 232 / 900],
  closing: [137 / 1600, 129 / 900, 720 / 1600, 271 / 900],
};

/** The Plate theme's plates (SPEC-5 0.45): the identity's window on the sheet, 800 by 338 at 200, 450 on 16:9. */
const PLATE_PLATES: Readonly<Record<PlateName, PlateFraction>> = {
  opener: [1 / 8, 1 / 2, 1 / 2, 3 / 8],
  mood: [3 / 8, 1 / 2, 1 / 2, 3 / 8],
  closing: [1 / 8, 1 / 8, 1 / 2, 3 / 8],
};

/** The plate box of a theme on a page in sheet pixels, rounded to whole pixels. */
export function plateBoxes(
  id: ThemeId,
  page: { width: number; height: number } = { width: 1600, height: 900 },
): Record<PlateName, [number, number, number, number]> {
  const out = {} as Record<PlateName, [number, number, number, number]>;
  for (const name of ['opener', 'mood', 'closing'] as const) {
    const [fx, fy, fw, fh] = THEME_SPECS[id].plates[name];
    out[name] = [
      Math.round(fx * page.width),
      Math.round(fy * page.height),
      Math.round(fw * page.width),
      Math.round(fh * page.height),
    ];
  }
  return out;
}

const GT_FRAME: ThemeFrame = {
  rail: RAIL,
  sides: ['left', 'right', 'top', 'bottom'],
  crosses: true,
  crossOffset: CROSS.offset,
  crossSize: CROSS.size,
};

/** The GT mark at 28 by 18 in titanium (head:463; packages/render stage.ts WORDMARK_HTML). */
const GT_MARK: ThemeMarkSlot = {
  kind: 'gt',
  left: WORDMARK.left,
  bottom: WORDMARK.bottom,
  width: 28,
  height: WORDMARK.height,
};

const GT_COUNTER: ThemeCounter = {
  show: true,
  side: 'right',
  inset: COUNTER.right,
  bottom: COUNTER.bottom,
  fontSize: COUNTER.fontSize,
};

export const THEME_SPECS: Readonly<Record<ThemeId, ThemeSpec>> = {
  'gt-ink-paper': {
    id: 'gt-ink-paper',
    label: THEME_LABELS['gt-ink-paper'],
    tokens: TOKENS,
    frame: GT_FRAME,
    mark: GT_MARK,
    counter: GT_COUNTER,
    chips: true,
    display: DISPLAY,
    plates: GT_PLATES,
    folder: 'gt-ink-paper',
  },
  /**
   * Plate (SPEC-5 9.3; R03 5.2): the GT content box and the 21 layouts unchanged; the frame is
   * the mark's rail, one 1 px --hair rule at 56 px from the left edge and one from the bottom
   * edge, no crosses; the corner slot empty by default; the counter bottom right as today; no
   * chips; the same ten token values. `ts-plate/sheet.css` and `stage.css` carry the rules keyed
   * on `[data-sheet='ts-plate']` over the GT sheet; `PLATE_FRAME_HTML` is its frame.
   */
  'ts-plate': {
    id: 'ts-plate',
    label: THEME_LABELS['ts-plate'],
    tokens: TOKENS,
    frame: {
      rail: RAIL,
      sides: ['left', 'bottom'],
      crosses: false,
      crossOffset: CROSS.offset,
      crossSize: CROSS.size,
    },
    mark: { ...GT_MARK, kind: 'none' },
    counter: GT_COUNTER,
    chips: false,
    display: DISPLAY,
    plates: PLATE_PLATES,
    folder: 'ts-plate',
  },
};

/** The stylesheet folder of a theme under packages/theme/src (theme-node.ts reads it). */
export function themeFolderOf(id: ThemeId): string {
  return THEME_SPECS[id].folder;
}

export function themeSpec(id: ThemeId): ThemeSpec {
  return THEME_SPECS[id];
}

/** The ten tokens of a theme per appearance (R03 5.1 `TOKENS[id][appearance]`). */
export function tokensFor(
  id: ThemeId,
): Readonly<Record<ThemeName, Readonly<Record<TokenName, string>>>> {
  return THEME_SPECS[id].tokens;
}

/**
 * The custom properties `sheet.css` declares on `.ts-sheet` with today's values and reads in the
 * frame, wordmark and counter rules, so `themeCss(deck)` moves a rail or the corner slot by
 * redefining one variable (SPEC-5 9.1 "`sheet.css` gains the variables with today's values as
 * defaults"). `tokens.test.ts` asserts the CSS declares exactly these with `frameVariables` of
 * the GT spec. The slide box inset (57 px, stage.css) is not among them: nothing in the theme
 * mode moves the content box (R03 4.4), so the record's `frame.inset` is the rail alone.
 */
export const FRAME_VARIABLES = [
  '--rail',
  '--cross-offset',
  '--mark-left',
  '--mark-bottom',
  '--mark-height',
  '--counter-inset',
  '--counter-bottom',
] as const;
export type FrameVariable = (typeof FRAME_VARIABLES)[number];

const px = (value: number): string => `${value}px`;

/** The cross sits centred on the rail: its offset is the rail less half the cross, rounded down. */
export function crossOffsetOf(rail: number, crossSize: number = CROSS.size): number {
  return Math.round(rail - crossSize / 2);
}

export function frameVariables(spec: ThemeSpec): Readonly<Record<FrameVariable, string>> {
  return {
    '--rail': px(spec.frame.rail),
    '--cross-offset': px(spec.frame.crossOffset),
    '--mark-left': px(spec.mark.left),
    '--mark-bottom': px(spec.mark.bottom),
    '--mark-height': px(spec.mark.height),
    '--counter-inset': px(spec.counter.inset),
    '--counter-bottom': px(spec.counter.bottom),
  };
}

/**
 * The frame markup of head.html lines 394 to 397: two rules and four crosses inside `.frame`; the
 * two rails are the element's `::before` and `::after`. Byte identical to round one's
 * `FRAME_HTML` in packages/render stage.ts (theme-css.test.ts pins the two together) so the
 * stage can read `stageFrame(deck.theme)` without a pixel moving.
 */
export const GT_FRAME_HTML =
  '<div class="frame"><div class="rule top"></div><div class="rule bottom"></div><span class="cross tl"></span><span class="cross tr"></span><span class="cross bl"></span><span class="cross br"></span></div>';

/**
 * The Plate frame (SPEC-5 9.3): the bottom rule alone inside `.frame`; the left rail is the
 * element's `::before`, its `::after` (the right rail) is hidden by `ts-plate/sheet.css`, and no
 * cross is drawn. The same class grammar as the GT frame, so `sheet.css`'s rules and the frame
 * variables apply unchanged.
 */
export const PLATE_FRAME_HTML = '<div class="frame"><div class="rule bottom"></div></div>';

/** The frame the stage emits once per sheet for a theme (`renderStage` reads it). */
export function stageFrame(id: ThemeId): string {
  return id === 'ts-plate' ? PLATE_FRAME_HTML : GT_FRAME_HTML;
}

export type SheetRootOptions = {
  /** classes after `ts-sheet` (`sheet`, `is-picture`, `is-clone`) */
  classes?: ReadonlyArray<string>;
  /** a tile that shows the base theme without the deck's edits (`THEME_BASE_ATTRIBUTE`) */
  base?: boolean;
};

/**
 * The attributes of a sheet root: the root class, the appearance and the theme id, and the base
 * opt out when asked (R03 5.1 "`sheetRootAttributes(id, appearance)` stamps `data-sheet`").
 */
export function sheetRootAttributes(
  id: ThemeId,
  appearance: Appearance,
  options: SheetRootOptions = {},
): string {
  const classes = [SHEET_ROOT_CLASS, ...(options.classes ?? [])].join(' ');
  const base = options.base === true ? ` ${THEME_BASE_ATTRIBUTE}=""` : '';
  return `class="${classes}" ${THEME_ATTRIBUTE}="${appearance}" ${SHEET_ATTRIBUTE}="${id}"${base}`;
}

/**
 * The sheet selectors the type levels of `ThemeEdits.type.levels` redefine (R03 4.4: Google's
 * nine levels reduce to Turboslide's ladder), relative to the sheet root. `body` is the paragraph,
 * `small` the 15 px caption line (`.cap`), `caption` the figure caption of a pair.
 */
export const TYPE_LEVEL_SELECTORS: Readonly<Record<ThemeTypeLevel, ReadonlyArray<string>>> = {
  h1: ['h1'],
  h2: ['h2'],
  big: ['.big'],
  lead: ['.lead'],
  body: ['p'],
  small: ['.cap'],
  caption: ['.pair figcaption'],
};
