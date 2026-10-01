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

/**
 * The run key of a caret as the sheet's `data-run` and the measured `boxes.runs` spell it,
 * `<blockId>/<pointer>` with no slash between the two: the presence state carries the path as
 * a JSON pointer (`/text`, EditorRoot.tsx's report), and the key built by plain concatenation
 * read `heading//text`, matched no run element and no run box, and every remote caret fell to
 * the block's box, which is the run's start (audit-people.md defect 4's picture, "A drew it at
 * the title's first character"; R2's memory tier run, every reading at the block's left edge).
 */
export function runKeyOf(caret: Pick<RemoteCaret, 'blockId' | 'path'>): string {
  return `${caret.blockId}/${caret.path.replace(/^\/+/, '')}`;
}

/** The run element of a caret inside a sheet body. */
export function runElementOf(body: ParentNode, caret: RemoteCaret): HTMLElement | null {
  const key = runKeyOf(caret);
  const direct = body.querySelector<HTMLElement>(`[data-run="${cssEscape(key)}"]`);
  if (direct) return direct;
  /* a fixed kind's field carries the block id and the path in its data-run already (heading/text):
     the block element itself when it is the run, else a run inside it */
  const block = cssEscape(caret.blockId);
  return body.querySelector<HTMLElement>(
    `[data-block="${block}"][data-run], [data-block="${block}"] [data-run]`,
  );
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

type CaretRect = { left: number; top: number; height: number };

const measurable = (rect: DOMRect | undefined): rect is DOMRect =>
  rect !== undefined && (rect.height > 0 || rect.width > 0);

/**
 * The caret rectangle at a text position: the collapsed `Range` at the position when the engine
 * gives it a rectangle, else the right edge of the character before it, else the left edge of
 * the character after it. Chromium gives a collapsed range at the end of a text node no client
 * rectangle at all, which is where a typing person's caret stands most of the time, so without
 * the neighbour the bar fell to the block's box and read as offset 0 (R2's memory tier run,
 * `memory/01-caret-r2-a.png`; audit-people.md defect 4, `run2/04-r1-a-both-in-title.png`).
 */
function caretRect(
  run: HTMLElement,
  position: { node: Node; offset: number },
  offset: number,
): CaretRect | null {
  if (typeof document === 'undefined' || !document.createRange) return null;
  const range = document.createRange();
  try {
    range.setStart(position.node, position.offset);
    range.collapse(true);
    const rects = range.getClientRects();
    const first = rects[0] ?? range.getBoundingClientRect();
    if (measurable(first)) return { left: first.left, top: first.top, height: first.height };
  } catch {
    /* the neighbours below */
  }
  /* the character before: the caret sits at its right edge */
  if (offset > 0) {
    const before = textPosition(run, offset - 1);
    if (before !== null) {
      try {
        range.setStart(before.node, before.offset);
        range.setEnd(position.node, position.offset);
        const rects = range.getClientRects();
        const last = rects[rects.length - 1];
        if (measurable(last)) return { left: last.right, top: last.top, height: last.height };
      } catch {
        /* the character after */
      }
    }
  }
  /* the character after: the caret sits at its left edge */
  const after = textPosition(run, offset + 1);
  if (after !== null && (after.node !== position.node || after.offset !== position.offset)) {
    try {
      range.setStart(position.node, position.offset);
      range.setEnd(after.node, after.offset);
      const rects = range.getClientRects();
      const first = rects[0];
      if (measurable(first)) return { left: first.left, top: first.top, height: first.height };
    } catch {
      /* unmeasurable */
    }
  }
  return null;
}

/**
 * The caret's box in sheet pixels: the run's measured box plus the caret rectangle's offset
 * inside the run element, divided by the stage scale `k`. Null when the run is missing, and null
 * when the run holds text but the range at the offset could not be measured (a run mid render,
 * a text node without layout): the chrome then keeps the caret's last box for a moment
 * (`RemoteCursors`, `keptCaretBox`) instead of drawing the run's start, so a late frame never
 * lands at offset 0 (docs/REALTIME.md 3.5; audit-people.md defect 4). An empty run has one place
 * for a caret, its start, and answers that.
 */
export function remoteCaretBox(
  body: ParentNode,
  boxes: MeasuredBoxes,
  caret: RemoteCaret,
  k: number,
): Box | null {
  const run = runElementOf(body, caret);
  if (!run || k <= 0) return null;
  const runBox = boxes.runs[runKeyOf(caret)] ?? boxes.blocks[caret.blockId];
  if (!runBox) return null;
  const position = textPosition(run, caret.offset);
  if (position === null) {
    /* an empty run: the run's start is the one place a caret can be */
    return [runBox[0], runBox[1], 2 / k, runBox[3]];
  }
  const runRect = run.getBoundingClientRect();
  const rect = caretRect(run, position, caret.offset);
  if (rect === null) return null;
  const line = rect.height > 0 ? rect.height : runRect.height;
  return [
    runBox[0] + (rect.left - runRect.left) / k,
    runBox[1] + (rect.top - runRect.top) / k,
    2 / k,
    line / k,
  ];
}
