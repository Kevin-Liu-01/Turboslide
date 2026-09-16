// The editor's measurer for the canvas conversion (gslides-parity SPEC-2 1.3, 0.72, 0.97; Kevin's
// directive of 2026-09-12: every slide is a canvas). The first canvas gesture on a slide that is
// not on the freeform layout renders the slide once more into a hidden 1600 by 900 sheet at scale
// 1 with the prompts of empty placeholders drawn, waits for the same readiness as a render (fonts,
// every image decoded, the dither canvases, two frames), measures every object's box relative to
// the stage element and hands the boxes to `toCanvas`. The CLI, the MCP server and the hosted
// studio measure the same way in a headless sheet page (apps/cli/src/deps/canvas.ts), so the pos
// the editor and the CLI write are identical in Chromium (SPEC-2 0.104). The stage's own
// measurement (Freeform.tsx measureBoxes, at the stage scale) keeps serving hover, selection and
// gestures: a layout box at a half pixel divided by the stage scale rounds either way, and the
// CLI must write the same pos.
//
// `measureCanvasBoxes`, `measureFitBoxes` and `awaitSheetReady` are B2's functions of
// @turboslide/render/measure-dom (merge 1c, docs/gslides-parity/build-2/b4.md request 1, swapped in
// by the integrator at merge 2): one function measures for the editor, the CLI, the fidelity
// script and the hosted studio, at 1/64 px over the `.ts-stage` origin, so the `pos` every
// transport writes agree. The same hidden sheet also measures the height a block's text needs
// (`measureFitBoxes`), what autofit and `block.autofit --apply` read (SPEC-2 0.64), so the fit
// the editor writes after a gesture equals the CLI's.
import {
  CANVAS_SELECTORS as MEASURE_SELECTORS,
  MEASURE_PRECISION,
  awaitSheetReady,
  measureCanvasBoxes as measureCanvasBoxesDom,
  measureFitBoxes as measureFitBoxesDom,
} from '@turboslide/render/measure-dom';
import type { FitBox } from '@turboslide/render/measure-dom';
import { renderSlide } from '@turboslide/render/slide';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import type { Box } from '@turboslide/schema/render';

import type { MeasuredBoxes } from './Gestures';
import { drawAllDither } from './dither';
import { DEFAULT_PAGE_SIZE, sheetSizeVars } from './model';
import type { PageSize } from './model';
import { deckPage } from '@turboslide/schema/render';
import { applyThemeToTree } from './theme';
import type { Theme } from './theme';

/** The selectors the conversion reads (SPEC-2 1.3); the renderer and the measurer change together. */
export const CANVAS_SELECTORS = {
  /** every block, positioned or not */
  block: '[data-block]',
  /** the wrapper of a positioned block, which is its `pos` */
  wrapper: '.free[data-free]',
  /** the photograph of an opener, mood or closing slide */
  picture: 'img.opener-img, img.mood-img',
  /** the plate of a picture kind */
  plate: '[data-slot="plate"]',
  /** the title slide's mark */
  titleMark: '.left-mid svg[data-raster="mark"]',
  /** the closing's mark inside the plate */
  closingMark: '[data-slot="plate"] svg.mark',
  /** the child that marks a prompted (empty) placeholder */
  prompt: '.prompt, [data-prompt]',
} as const;

/** The origin the boxes are relative to: the 1600 by 900 stage element, never the sheet root with its 1 px edge. */
export const STAGE_SELECTOR = '.ts-stage';

/** What autofit reads per block: the box drawn and the height its text needs (SPEC-2 0.64). */
export type FitMeasure = Record<string, FitBox>;

/** The class the hidden measuring root carries, so a test or a style can find it. */
export const MEASURE_ROOT_CLASS = 'ts-canvas-measure';

/**
 * The boxes the conversion needs from one rendered slide, in sheet pixels relative to `stage`
 * (the 1600 by 900 stage element) at 1/64 px (SPEC-2 1.3, measure-dom.ts MEASURE_PRECISION):
 * `blocks[id]` for every `[data-block]` (a positioned block through its `.free[data-free]`
 * wrapper), `picture`, `plate` and `mark` for the kinds' elements, and `prompted`, the ids whose
 * element holds a prompt. B2's function; the same one runs in the headless page.
 */
export function measureCanvasBoxes(root: Element, stage: Element): CanvasBoxes {
  return measureCanvasBoxesDom(root, stage, MEASURE_SELECTORS, MEASURE_PRECISION);
}

/**
 * The height every block's text needs, from the line boxes of its text nodes, plus the box's
 * bottom padding, and the largest font size its text uses: what the shrink ladder and `grow`
 * read (SPEC-2 6.2 Autofit, 0.64). B2's function.
 */
export function measureFitBoxes(root: Element, stage: Element): FitMeasure {
  return measureFitBoxesDom(root, stage, MEASURE_SELECTORS);
}

/** The readiness both measuring paths await before they read a box (SPEC-2 0.97): B2's `awaitSheetReady`. */
export { awaitSheetReady };

/** A hidden 1x sheet: the theme's tokens root, the sheet box and the stage, off screen. */
export type HiddenSheet = {
  root: HTMLElement;
  stage: HTMLElement;
  body: HTMLElement;
  dispose: () => void;
};

/**
 * Mounts the hidden sheet the conversion renders into: the theme's `.ts-sheet[data-theme]` root
 * at 1600 by 900 off the left edge of the viewport (never `visibility: hidden`, whose text nodes
 * the readiness walker would skip), the `.sheet` box and the `.ts-stage` at scale 1, exactly the
 * boxes the editor's stage draws at its own scale. The caller disposes it.
 */
/**
 * The inherited text defaults of a fresh document, declared on the hidden root so the studio's
 * body styles (13 px type) do not reach the sheet. The CLI measures the present document, whose
 * body carries the browser defaults (16 px, normal spacing); a container the theme leaves at the
 * inherited size, such as `.left-mid` around the inline mark, takes its line box from that size,
 * and the two measures differed by a pixel until the root matched it. The family and the colour
 * stay out: the renderer's `.ts-sheet` rule sets both in the studio and in the present document.
 */
export const MEASURE_ROOT_RESET =
  'font-size:medium;line-height:normal;font-weight:normal;font-style:normal;font-stretch:normal;' +
  'font-variant:normal;font-feature-settings:normal;font-kerning:auto;letter-spacing:normal;' +
  'word-spacing:normal;text-transform:none;text-indent:0;white-space:normal;text-rendering:auto;' +
  'direction:ltr;';

export function mountHiddenSheet(
  theme: Theme,
  host: HTMLElement = document.body,
  page: PageSize = DEFAULT_PAGE_SIZE,
): HiddenSheet {
  const root = document.createElement('div');
  root.className = `ts-sheet ${MEASURE_ROOT_CLASS}`;
  root.dataset['theme'] = theme;
  root.setAttribute('aria-hidden', 'true');
  const vars = Object.entries(sheetSizeVars(page))
    .map(([name, value]) => `${name}:${value};`)
    .join('');
  root.setAttribute(
    'style',
    `position:fixed;left:-${page.width * 2}px;top:0;width:${page.width}px;height:${page.height}px;overflow:hidden;pointer-events:none;${vars}` +
      MEASURE_ROOT_RESET,
  );
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  const stage = document.createElement('div');
  stage.className = 'ts-stage stage';
  const body = document.createElement('div');
  body.className = 'pt-slide';
  stage.appendChild(body);
  sheet.appendChild(stage);
  root.appendChild(sheet);
  host.appendChild(root);
  return { root, stage, body, dispose: () => root.remove() };
}

export type MeasureOptions = {
  /** the URL prefix of the deck's asset twins, `/decks/<id>/`; the deck's own when absent */
  assetBase?: string;
  /** where the hidden sheet mounts; the body when absent */
  host?: HTMLElement;
};

/** The markup of a slide as the conversion measures it: prompts drawn, block attributes on, no shader live. */
export function renderForMeasure(
  document: DeckDocument,
  slide: Slide,
  theme: Theme,
  assetBase: string,
): string {
  return renderSlide(document.deck, slide, {
    theme,
    chrome: true,
    assetBase,
    blockAttrs: true,
    gtWord: true,
    prompts: true,
  }).html;
}

async function withHiddenSheet<T>(
  document: DeckDocument,
  slide: Slide,
  theme: Theme,
  options: MeasureOptions,
  read: (root: HTMLElement, stage: HTMLElement) => T,
): Promise<T> {
  const assetBase = options.assetBase ?? `/decks/${document.deck.id}/`;
  const mounted = mountHiddenSheet(theme, options.host, deckPage(document.deck));
  try {
    mounted.body.innerHTML = renderForMeasure(document, slide, theme, assetBase);
    applyThemeToTree(mounted.body, theme);
    await awaitSheetReady(mounted.root);
    drawAllDither(mounted.body, theme);
    return read(mounted.root, mounted.stage);
  } finally {
    mounted.dispose();
  }
}

/**
 * The boxes `toCanvas` reads for a slide, measured on a hidden 1x sheet (SPEC-2 1.3): the one
 * measurer of the editor's conversion. The route binds it as the store actions' `measureCanvas`
 * on the window transport, so an agent's `block.set /pos` on a grammar slide converts through
 * the same render as a drag.
 */
export function measureForCanvas(
  document: DeckDocument,
  slide: Slide,
  theme: Theme,
  options: MeasureOptions = {},
): Promise<CanvasBoxes> {
  return withHiddenSheet(document, slide, theme, options, measureCanvasBoxes);
}

/** The fit measure of a slide's blocks on a hidden 1x sheet: what autofit reads (SPEC-2 0.64). */
export function measureForFit(
  document: DeckDocument,
  slide: Slide,
  theme: Theme,
  options: MeasureOptions = {},
): Promise<FitMeasure> {
  return withHiddenSheet(document, slide, theme, options, measureFitBoxes);
}

/** Both measures from one render, for a gesture that converts and fits in one write. */
export function measureForCanvasAndFit(
  document: DeckDocument,
  slide: Slide,
  theme: Theme,
  options: MeasureOptions = {},
): Promise<{ canvas: CanvasBoxes; fit: FitMeasure }> {
  return withHiddenSheet(document, slide, theme, options, (root, stage) => ({
    canvas: measureCanvasBoxes(root, stage),
    fit: measureFitBoxes(root, stage),
  }));
}

/** The ids the stage measures for a kind's elements that are not blocks (Freeform.tsx measureBoxes). */
export const VIRTUAL_OBJECT_IDS = ['picture', 'plate', 'mark'] as const;
export type VirtualObjectId = (typeof VIRTUAL_OBJECT_IDS)[number];

/**
 * The stage's measured boxes as the conversion's boxes, for the provisional conversion a gesture
 * previews before the hidden sheet has measured (the stage draws the same layout at its scale; the
 * final write uses `measureForCanvas`). The kinds' elements the stage measured under the virtual
 * ids `picture`, `plate` and `mark` move to their own fields, except where the slide holds a block
 * of that id (a content slide with a `mark` block).
 */
export function canvasBoxesFromMeasured(boxes: MeasuredBoxes, slide: Slide): CanvasBoxes {
  const blocks: Record<string, Box> = {};
  const out: CanvasBoxes = { blocks, prompted: [...(boxes.prompted ?? [])] };
  const virtual = virtualObjectIds(slide);
  for (const [id, box] of Object.entries(boxes.blocks)) {
    const rounded: Box = [
      Math.round(box[0]),
      Math.round(box[1]),
      Math.round(box[2]),
      Math.round(box[3]),
    ];
    if (virtual.has(id as VirtualObjectId)) {
      if (id === 'picture') out.picture = rounded;
      else if (id === 'plate') out.plate = rounded;
      else out.mark = rounded;
      continue;
    }
    blocks[id] = rounded;
  }
  return out;
}

/** The virtual object ids a slide kind draws without a block: the title's mark, a picture kind's photograph, plate and (closing) mark. */
export function virtualObjectIds(slide: Slide): ReadonlySet<VirtualObjectId> {
  switch (slide.kind) {
    case 'title':
      return new Set<VirtualObjectId>(['mark']);
    case 'opener':
    case 'mood':
      return new Set<VirtualObjectId>(['picture', 'plate']);
    case 'closing':
      return new Set<VirtualObjectId>(
        slide.mark ? ['picture', 'plate', 'mark'] : ['picture', 'plate'],
      );
    default:
      return new Set<VirtualObjectId>();
  }
}
