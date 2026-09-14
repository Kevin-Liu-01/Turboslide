import type { Box } from '@turboslide/schema/render';

import type { MeasuredBoxes } from '@turboslide/viewer/Gestures';

/**
 * The remote caret's geometry (gslides-parity SPEC-3 4.4; research 11 6.5): a remote `caret`
 * names a block, a Text path and a plain text offset (3.1); the chrome draws a 2 px bar in the
 * person's hue at the run's line box, positioned in sheet units times the stage scale. This
 * module measures that position from the sheet's DOM: the run element `data-run="<blockId>/<path>"`,
 * a `Range` collapsed at the plain offset inside its text nodes, and the caret rectangle read
 * against the run's own rectangle, so the answer is in sheet pixels relative to the run's
 * measured box and needs no stage origin. A run the sheet does not hold (the slide changed under
 * the caret) answers null and the chrome draws the flag at the block's box instead. Pure DOM
 * reads; `remote-caret.test.ts` runs it under jsdom with a stubbed range. The viewer's side of
 * the seam is `EditorOverlayView.body`, the sheet body the carets are measured in.
 */
export type RemoteCaret = { blockId: string; path: string; offset: number };

/** The run element of a caret inside a sheet body. */
export function runElementOf(body: ParentNode, caret: RemoteCaret): HTMLElement | null {
  const key = `${caret.blockId}/${caret.path}`;
  const direct = body.querySelector<HTMLElement>(`[data-run="${cssEscape(key)}"]`);
  if (direct) return direct;
  /* a fixed kind's field carries the block id and the path in its data-run already (heading/text) */
  return body.querySelector<HTMLElement>(`[data-block="${cssEscape(caret.blockId)}"] [data-run]`);
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/** The text node and the offset inside it that a plain offset lands on; the last node's end when past the end. */
export function textPosition(
  root: Node,
  offset: number,
  createWalker: (root: Node) => { nextNode(): Node | null } = (node) =>
    document.createTreeWalker(node, NodeFilter.SHOW_TEXT),
): { node: Node; offset: number } | null {
  const walker = createWalker(root);
  let remaining = Math.max(0, offset);
  let last: Text | null = null;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    const length = [...node.data].length;
    if (remaining <= length) {
      /* code points to UTF-16 units */
      const units = [...node.data].slice(0, remaining).join('').length;
      return { node, offset: units };
    }
    remaining -= length;
    last = node;
  }
  return last === null ? null : { node: last, offset: last.data.length };
}

/**
 * The caret's box in sheet pixels: the run's measured box plus the caret rectangle's offset
 * inside the run element, divided by the stage scale `k`. Null when the run or the range cannot
 * be measured.
 */
export function remoteCaretBox(
  body: ParentNode,
  boxes: MeasuredBoxes,
  caret: RemoteCaret,
  k: number,
): Box | null {
  const run = runElementOf(body, caret);
  if (!run || k <= 0) return null;
  const runBox = boxes.runs[`${caret.blockId}/${caret.path}`] ?? boxes.blocks[caret.blockId];
  if (!runBox) return null;
  const position = textPosition(run, caret.offset);
  const runRect = run.getBoundingClientRect();
  let rect: { left: number; top: number; height: number } | null = null;
  if (position !== null && typeof document !== 'undefined' && document.createRange) {
    const range = document.createRange();
    try {
      range.setStart(position.node, position.offset);
      range.collapse(true);
      const rects = range.getClientRects();
      const first = rects[0] ?? range.getBoundingClientRect();
      if (first && (first.height > 0 || first.width > 0))
        rect = { left: first.left, top: first.top, height: first.height };
    } catch {
      rect = null;
    }
  }
  if (rect === null) {
    /* an empty run or a range that could not be measured: the run's start */
    return [runBox[0], runBox[1], 2 / k, runBox[3]];
  }
  const line = rect.height > 0 ? rect.height : runRect.height;
  return [
    runBox[0] + (rect.left - runRect.left) / k,
    runBox[1] + (rect.top - runRect.top) / k,
    2 / k,
    line / k,
  ];
}
