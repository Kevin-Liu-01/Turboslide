import { SHEET_H, SHEET_W } from '@turboslide/viewer/model';

import type { StageSize } from '@turboslide/chrome/shell-context';

/**
 * The bar's row at the foot of a show: the 40 px plate 12 px up from the edge
 * (packages/viewer/src/present/PresentToolbar.css) and 4 px of clear black above it.
 */
export const SHOW_BAR_ROW = 56;

/**
 * The stage box the sheet fits while a show is up (docs/POLISH.md item 98; audit-pages item
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
