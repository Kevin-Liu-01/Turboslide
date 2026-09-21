// The text session's two fits with the document (docs/FOCUS.md section 5 ranks 10, 11 and 13),
// as pure rules the Editor applies and text-fit.test.ts pins:
//
//   sessionReconcile: what an open session does when the document's markup of the run it edits
//     moved by a write the session did not make. A toolbar mark, a swatch or a Format menu row
//     writes `text.style` through the shell while the caret sits in the run (the session is
//     parked, InlineText blurVerdict): the plain text is the session's and the marks moved, so the
//     editable absorbs the document's markup with its unflushed keystrokes re-applied (the same
//     path a collaborator's write takes, TEXT_CHANGED_EVENT). A refused burst (the room folded
//     the local document back to the server's, audit-text row 21) leaves the document behind the
//     session's text: the session re-bases on the document and sends what the editable holds as
//     one splice from the acknowledged text, so no character is lost and none is sent twice.
//
//   liveContentHeight and growMutation: the autofit grow of a text box after a typing burst
//     (audit-text row 54: the box stored `grow` and never grew). The content height is read from
//     the live stage with the rule of render/measure-dom.ts measureFitBoxes (the lowest text rect
//     against the wrapper's top, plus the larger bottom padding), divided by the stage scale, and
//     the `pos.h` write travels in the same call as the burst's splice.
import type { Block } from '@turboslide/schema/blocks';
import type { Mutation } from '@turboslide/schema/mutations';
import { parseText } from '@turboslide/schema/text';
import type { Text as Markup } from '@turboslide/schema/text';

/** What the session does with a document that moved under it. */
export type SessionReconcile = 'none' | 'absorb' | 'resend';

/**
 * How long a re-send waits before it reads the document again: longer than one render and one
 * publish, so a document behind the session for a tick (the deck's first write publishing the
 * server's document before the queued bursts fold back) is never re-sent, and short enough that
 * a refused burst reaches the server again before the next word.
 */
export const RECONCILE_RESEND_MS = 150;

/** The plain text of a Text with one character per paragraph break (the offsets the splices use). */
function plainOf(text: Markup): string {
  return text
    .split('\n')
    .map((paragraph) =>
      parseText(paragraph)
        .map((run) => run.t)
        .join(''),
    )
    .join('\n');
}

/**
 * `expected` is the markup the session's own last write left in the document (or the markup it
 * started from), `doc` the document's markup now. Equal: nothing moved. The same plain text with
 * other marks: a mark write from outside the session, absorbed into the editable. Another plain
 * text: the document is behind or beside the session (a refused burst, or a collaborator's
 * insert the session has already absorbed), and the editable's text is re-sent from the document.
 */
export function sessionReconcile(expected: Markup, doc: Markup): SessionReconcile {
  if (doc === expected) return 'none';
  if (plainOf(doc) === plainOf(expected)) return 'absorb';
  return 'resend';
}

/**
 * The height the text inside a block needs, in sheet pixels, read from the live stage: the lowest
 * client rect of the block's text nodes (the prompt excluded) against the top of the positioned
 * wrapper (else the block), divided by the stage scale, plus the larger of the two bottom
 * paddings in CSS pixels, which the scale does not touch. Null when the block holds no text.
 */
export function liveContentHeight(
  block: HTMLElement,
  wrapper: HTMLElement | null,
  k: number,
  view: Window,
): number | null {
  if (!(k > 0)) return null;
  const target = wrapper ?? block;
  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let bottom = Number.NEGATIVE_INFINITY;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!(node.textContent ?? '').trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('.prompt') !== null) continue;
    const cs = view.getComputedStyle(parent);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const range = doc.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.bottom > bottom) bottom = rect.bottom;
    }
    /* a text rect is the inline box, the font's content area; the line box the paragraph draws
       reaches lower by the leading's half, so the paragraph element's own bottom counts too, else
       the fitted box stops a few pixels above the last line (measured: 4 sheet px on a 3 line
       caption at 24 px) */
    let line: HTMLElement | null = parent;
    while (line !== null && line !== block && view.getComputedStyle(line).display !== 'block')
      line = line.parentElement;
    if (line !== null) {
      const lineBottom = line.getBoundingClientRect().bottom;
      if (lineBottom > bottom) bottom = lineBottom;
    }
  }
  if (!Number.isFinite(bottom)) return null;
  const top = target.getBoundingClientRect().top;
  const pad = parseFloat(view.getComputedStyle(target).paddingBottom) || 0;
  const inner = parseFloat(view.getComputedStyle(block).paddingBottom) || 0;
  return Math.round((bottom - top) / k + Math.max(pad, inner));
}

/**
 * The `pos.h` write that lets a `grow` text box hold its text: the content height when it exceeds
 * the box by more than a pixel (the rule of the Editor's `withAutofit`), else null. A block with
 * no position or another autofit never grows here.
 */
export function growMutation(
  slideId: string,
  block: Block,
  contentHeight: number | null,
): Mutation | null {
  if (contentHeight === null) return null;
  if (!('autofit' in block) || block.autofit !== 'grow') return null;
  const pos = block.pos;
  if (pos === undefined || contentHeight <= pos.h + 1) return null;
  return {
    op: 'block.set',
    slideId,
    blockId: block.id,
    path: '/pos/h',
    value: Math.ceil(contentHeight),
  };
}

/**
 * The `typography.size` write that steps a `shrink` text box down the ladder when its text needs
 * more than the box (docs/PRODUCT.md section 5 "Autofit"; Google's Shrink text on overflow):
 * `fontSize` is the size the text draws at now (the block's own, else the computed size the live
 * stage reads), `stepDown` the ladder's next smaller size or undefined at the bottom. Null when
 * the text fits, when the block is not a shrink block, or when the ladder has no smaller step.
 * Each burst steps once, so a long paste settles over a few bursts and never below the floor.
 */
export function shrinkMutation(
  slideId: string,
  block: Block,
  contentHeight: number | null,
  fontSize: number | undefined,
  stepDown: (size: number) => number | undefined,
): Mutation | null {
  if (contentHeight === null || fontSize === undefined) return null;
  if (!('autofit' in block) || block.autofit !== 'shrink') return null;
  const pos = block.pos;
  if (pos === undefined || contentHeight <= pos.h + 1) return null;
  const next = stepDown(fontSize);
  if (next === undefined || next >= fontSize) return null;
  const typography =
    'typography' in block && typeof block.typography === 'object' && block.typography !== null
      ? { ...(block.typography as Record<string, unknown>) }
      : {};
  return {
    op: 'block.set',
    slideId,
    blockId: block.id,
    path: '/typography',
    value: { ...typography, size: next },
  };
}
