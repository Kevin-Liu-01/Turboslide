// The stage around a slide (SPEC 5.2): the frame with its two rails, two rules and four registration
// crosses (head:39-49), the wordmark (head:52-53, 463) and the counter (head:51, 464). A slide never
// draws these. The sprite is emitted once per stage so `<use href="#gt-mark">` and the icons resolve.
import { el, escapeAttr } from './html.ts';
import type { Theme } from '@turboslide/schema/render';

/** The frame markup of head.html lines 394 to 397. */
export const FRAME_HTML =
  '<div class="frame"><div class="rule top"></div><div class="rule bottom"></div><span class="cross tl"></span><span class="cross tr"></span><span class="cross bl"></span><span class="cross br"></span></div>';

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
};

/**
 * Wraps rendered slides in the sheet and the stage: `.ts-sheet.sheet[data-theme]` at 1600 by 900,
 * `.ts-stage.stage` scaled by the viewer, the frame first, the sprite, the slides, then the
 * wordmark and the counter over them. Both the `ts-` classes (SPEC 5.1, 5.5) and the deck's class
 * names are written so the theme's stage.css applies whichever selector it kept.
 */
export function renderStage(slidesHtml: string, options: StageOptions): string {
  const counter = options.counter
    ? el('div', { class: 'counter' }, escapeAttr(options.counter))
    : '<div class="counter"></div>';
  const stage = el(
    'div',
    { class: 'ts-stage stage', id: options.stageId },
    FRAME_HTML + (options.sprite ?? '') + slidesHtml + WORDMARK_HTML + counter,
  );
  return el(
    'div',
    {
      class: ['ts-sheet', 'sheet', options.present && 'ts-present', options.sheetClass]
        .filter((c): c is string => typeof c === 'string')
        .join(' '),
      'data-theme': options.theme,
    },
    stage,
  );
}
