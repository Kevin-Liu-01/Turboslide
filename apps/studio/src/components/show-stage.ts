import { SHEET_H, SHEET_W } from '@turboslide/viewer/model';

import type { StageSize } from '@turboslide/chrome/shell-context';

/**
 * The bar's row at the foot of a show: the 40 px plate 12 px up from the edge
 * (packages/viewer/src/present/PresentToolbar.css) and 4 px of clear black above it.
 */
export const SHOW_BAR_ROW = 56;

/**
 * The stage box the sheet fits while a show is up (docs/archive/rounds/POLISH.md item 98; audit-pages item
 * 44). The shell measures the whole stage and the present fit has no pad, so on a short viewport
 * the letterbox under the sheet is thinner than the bar's row and the bar sits half in the black
 * and half over the sheet's footer mark and bottom hairline (1280 by 800: 40 px of letterbox
 * against a 52 px row). When there is a letterbox and it is thinner than the row, the box loses
 * the row and the sheet is centred in what is left, above the bar. A 16:9 screen has no
 * letterbox and keeps the whole box: the sheet runs edge to edge and the bar overlays it while
 * the pointer is near and fades as it does in Google's full screen (PresentToolbar.tsx). Pure;
 * show-stage.test.ts pins it.
 */
export function showStageSize(box: StageSize): StageSize {
  if (box.width <= 0 || box.height <= 0) return box;
  const height = Math.min((box.width * SHEET_H) / SHEET_W, box.height);
  const letterbox = Math.round((box.height - height) / 2);
  if (letterbox === 0 || letterbox >= SHOW_BAR_ROW) return box;
  return { width: box.width, height: box.height - SHOW_BAR_ROW };
}

/** The two reports of a stage's box: its ResizeObserver (a new size) and the window's resize event. */
export type StageWatch = {
  ResizeObserver?: new (callback: () => void) => {
    observe: (target: Element) => void;
    disconnect: () => void;
  };
  onResize: (listener: () => void) => () => void;
};

function windowWatch(): StageWatch {
  return {
    ...(typeof ResizeObserver === 'undefined' ? {} : { ResizeObserver }),
    onResize: (listener) => {
      window.addEventListener('resize', listener);
      return () => window.removeEventListener('resize', listener);
    },
  };
}

/**
 * The show keeps the stage's box: in the top layer its `inset: 0` would resolve against the
 * window, which on a phone without full screen is taller than the stage, and the toolbar left the
 * slide for the window's foot. Before it enters the layer the show is fixed on its stage's box in
 * the window, and it follows that box while it is open. The stage's ResizeObserver reports a new
 * size and the window's resize event a move too; one resize fires both, and the second report
 * writes nothing (the presenter audit of a95d4097d, item 5). Returns the stop.
 */
export function pinShowToStage(
  el: HTMLElement,
  stage: Element,
  watch: StageWatch = windowWatch(),
): () => void {
  let written = '';
  const fit = (): void => {
    const box = stage.getBoundingClientRect();
    const key = `${box.left} ${box.top} ${box.width} ${box.height}`;
    if (key === written) return;
    written = key;
    el.style.position = 'fixed';
    el.style.inset = 'auto';
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
  };
  fit();
  const observer = watch.ResizeObserver === undefined ? null : new watch.ResizeObserver(fit);
  observer?.observe(stage);
  const stop = watch.onResize(fit);
  return () => {
    observer?.disconnect();
    stop();
  };
}
