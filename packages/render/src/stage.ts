// The stage around a slide (SPEC 5.2): the frame with its two rails, two rules and four registration
// crosses (head:39-49), the wordmark (head:52-53, 463) and the counter (head:51, 464). A slide never
// draws these. The sprite is emitted once per stage so `<use href="#gt-mark">` and the icons resolve.
import { el, escapeAttr } from './html.ts';
import type { ThemeId } from '@turboslide/schema/deck';
import type { Page, Theme } from '@turboslide/schema/render';
import { DEFAULT_PAGE } from '@turboslide/schema/render';
import {
  DEFAULT_THEME_ID,
  GT_FRAME_HTML,
  SHEET_ATTRIBUTE,
  stageFrame,
} from '@turboslide/theme/themes';

/**
 * The frame markup of head.html lines 394 to 397: the GT theme's frame, the value `stageFrame`
 * answers for `gt-ink-paper` (gslides-parity SPEC-5 9.1; B6's `@turboslide/theme/themes`, whose
 * `theme-css.test.ts` pins the two equal). The stage emits `stageFrame(themeId)` since round five.
 */
export const FRAME_HTML: string = GT_FRAME_HTML;

/** The wordmark: the mark at 28 by 18 in titanium (head:463). */
export const WORDMARK_HTML =
  '<div class="wordmark" aria-hidden="true"><svg width="28" height="18" fill="currentColor"><use href="#gt-mark"/></svg></div>';

/** `01 / 85` in tabular numerals (tail:249). */
export function counterText(n: number, total: number): string {
  const pad = (v: number): string => (v < 10 ? `0${v}` : String(v));
  return `${pad(n)} / ${pad(total)}`;
}

export type StageOptions = {
  theme: Theme;
  /** The counter text, or none for a stage without a counter. */
  counter?: string;
  /** The sprite markup (63 Heroicons plus gt-mark, head:398-462), emitted inside the stage. */
  sprite?: string;
  /** The `ts-present` class: the sheet fills the viewport with no edge (head:322-328). */
  present?: boolean;
  /** Extra classes on the sheet root. */
  sheetClass?: string;
  /** An id for the stage element (the deck's `#stage`, tail:76). */
  stageId?: string;
  /**
   * The deck's page (gslides-parity SPEC-5 6.1): the sheet root carries it as the two custom
   * properties stage.css reads (`--ts-sheet-w`, `--ts-sheet-h`) and as `data-page`, so the theme,
   * the runtimes and the standalone build size the sheet from the document. The GT sheet when
   * absent.
   */
  page?: Pick<Page, 'width' | 'height'>;
  /**
   * The deck's theme id (gslides-parity SPEC-5 9.1, 9.3; B6's request R2): the frame the stage
   * emits is `stageFrame(themeId)` and the root carries it as `data-sheet`, the attribute the
   * second theme's stylesheet keys its rules on; the GT theme when absent, whose frame is
   * `FRAME_HTML` byte for byte.
   */
  themeId?: ThemeId;
  /**
   * The deck's language tag (SPEC-5 7.1; B5's request), written as `lang` on the sheet root so
   * the browser's spelling and hyphenation read it; nothing when the deck names none.
   */
  lang?: string;
};

/** The inline style a stage root carries for its page: the two custom properties stage.css reads. */
export function sheetSizeStyle(page: Pick<Page, 'width' | 'height'>): string {
  return `--ts-sheet-w:${page.width}px;--ts-sheet-h:${page.height}px`;
}

/** The `data-page` value of a stage root: `1600x900`. */
export function pageAttr(page: Pick<Page, 'width' | 'height'>): string {
  return `${page.width}x${page.height}`;
}

/**
 * Wraps rendered slides in the sheet and the stage: `.ts-sheet.sheet[data-theme]` at the deck's
 * page (1600 by 900 when none), `.ts-stage.stage` scaled by the viewer, the frame first, the
 * sprite, the slides, then the wordmark and the counter over them. Both the `ts-` classes (SPEC
 * 5.1, 5.5) and the deck's class names are written so the theme's stage.css applies whichever
 * selector it kept. The root carries `--ts-sheet-w`, `--ts-sheet-h` and `data-page` (SPEC-5 6.1),
 * `data-sheet` with the theme id (SPEC-5 9.1) and the deck's `lang` when it names one (7.1).
 */
export function renderStage(slidesHtml: string, options: StageOptions): string {
  const page = options.page ?? DEFAULT_PAGE;
  const themeId = options.themeId ?? DEFAULT_THEME_ID;
  const counter = options.counter
    ? el('div', { class: 'counter' }, escapeAttr(options.counter))
    : '<div class="counter"></div>';
  const stage = el(
    'div',
    { class: 'ts-stage stage', id: options.stageId },
    stageFrame(themeId) + (options.sprite ?? '') + slidesHtml + WORDMARK_HTML + counter,
  );
  return el(
    'div',
    {
      class: ['ts-sheet', 'sheet', options.present && 'ts-present', options.sheetClass]
        .filter((c): c is string => typeof c === 'string')
        .join(' '),
      'data-theme': options.theme,
      [SHEET_ATTRIBUTE]: themeId,
      'data-page': pageAttr(page),
      style: sheetSizeStyle(page),
      lang: options.lang,
    },
    stage,
  );
}
