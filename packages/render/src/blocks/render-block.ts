// The block dispatcher: one renderer per catalog entry (SPEC 4.2, 5.2).
import type { Block } from '@turboslide/schema/blocks';
import { renderComposite } from './composite.ts';
import type { BlockContext } from './context.ts';
import { renderDia } from './dia.ts';
import {
  renderBoard,
  renderDetails,
  renderLogoPlates,
  renderPair,
  renderShot,
  renderTiles,
} from './figures.ts';
import { renderHtmlEscape } from './html-escape.ts';
import { renderPlain, renderRefs, renderRows, renderSay } from './lists.ts';
import { renderMaterial } from './material.ts';
import { renderDither, renderMark, renderMarkSizes, renderMatrix } from './misc.ts';
import { renderPanel } from './panel.ts';
import { renderBox, renderIcon, renderRule, renderShape, renderTextBlock } from './primitives.ts';
import { linkWrap } from './prompt.ts';
import { renderScales } from './scales.ts';
import { renderLadder, renderLang, renderSpec, renderSwatches } from './specimen.ts';
import { renderTable } from './table.ts';
import { renderCredit, renderHeading, renderParagraph } from './text-blocks.ts';

/** One block as HTML, wrapped in its link when it carries one (gslides-parity SPEC 7.2.7). */
export function renderBlock(block: Block, ctx: BlockContext): string {
  return linkWrap(renderBlockBody(block, ctx), block, ctx);
}

function renderBlockBody(block: Block, ctx: BlockContext): string {
  switch (block.type) {
    case 'heading':
      return renderHeading(block, ctx);
    case 'paragraph':
      return renderParagraph(block, ctx);
    case 'credit':
      return renderCredit(block, ctx);
    case 'rows':
      return renderRows(block, ctx);
    case 'plain':
      return renderPlain(block, ctx);
    case 'refs':
      return renderRefs(block, ctx);
    case 'say':
      return renderSay(block, ctx);
    case 'scales':
      return renderScales(block, ctx);
    case 'spec':
      return renderSpec(block, ctx);
    case 'lang':
      return renderLang(block, ctx);
    case 'ladder':
      return renderLadder(block, ctx);
    case 'swatches':
      return renderSwatches(block, ctx);
    case 'shot':
      return renderShot(block, ctx);
    case 'pair':
      return renderPair(block, ctx);
    case 'tiles':
      return renderTiles(block, ctx);
    case 'details':
      return renderDetails(block, ctx);
    case 'board':
      return renderBoard(block, ctx);
    case 'composite':
      return renderComposite(block, ctx);
    case 'panel':
      return renderPanel(block, ctx);
    case 'dia':
      return renderDia(block, ctx);
    case 'dither':
      return renderDither(block, ctx);
    case 'mark':
      return renderMark(block, ctx);
    case 'markSizes':
      return renderMarkSizes(block, ctx);
    case 'matrix':
      return renderMatrix(block, ctx);
    case 'logoPlates':
      return renderLogoPlates(block, ctx);
    case 'material':
      return renderMaterial(block, ctx);
    case 'box':
      return renderBox(block, ctx);
    case 'shape':
      return renderShape(block, ctx);
    case 'rule':
      return renderRule(block, ctx);
    case 'text':
      return renderTextBlock(block, ctx);
    case 'icon':
      return renderIcon(block, ctx);
    case 'table':
      return renderTable(block, ctx);
    case 'html':
      return renderHtmlEscape(block, ctx);
  }
}

export function renderBlocks(blocks: Block[], ctx: BlockContext): string {
  return blocks.map((block) => renderBlock(block, ctx)).join('');
}

/** Blocks the deck sets as text in a `.stack`; a lone figure-like block stands without the stack. */
export function isTextLike(block: Block): boolean {
  return (
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'credit' ||
    block.type === 'panel' ||
    block.type === 'text' ||
    block.type === 'box' ||
    block.type === 'rule'
  );
}

/** Blocks that sit in a `.shot-wrap` when they are the only block of a column (s15:3, s33:9). */
export function wantsShotWrap(block: Block): boolean {
  return block.type === 'shot' || block.type === 'mark';
}
