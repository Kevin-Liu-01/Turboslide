// Shared state of one slide's mapping: the style sheet with its consumption ledger, the asset
// registry, the id allocator, and the residual notes that end up in the report.
import type { Assets } from './assets.ts';
import type { StyleSheet } from './css.ts';
import { pxNumber } from './dom.ts';
import type { Element } from './dom.ts';
import type { BlockIdAllocator } from './ids.ts';
import type { Block, BlockType } from '@turboslide/schema/blocks';
import { importResidual, withImportResidual } from '@turboslide/schema/ext';

/** Thrown when the grammar cannot express an element; the slide falls back to an html escape. */
export class Unmapped extends Error {
  readonly reason: string;
  readonly element: Element | undefined;

  constructor(reason: string, element?: Element) {
    super(reason);
    this.reason = reason;
    this.element = element;
  }
}

export type MapContext = {
  slideId: string;
  sheet: StyleSheet;
  assets: Assets;
  ids: BlockIdAllocator;
  /** Width in sheet pixels of the slot the element sits in, when known. */
  slotWidth?: number;
  /** Inline styles nobody consumed, kept on blocks as ext.import.style and listed in the report. */
  leftoverInline: string[];
  unhandled: string[];
  /** Source classes per block, so residual rules that name them keep working. */
  sourceClasses: Map<Block, string[]>;
  /** Residual rules a matcher writes itself, scoped under SCOPE like the sheet's rules. */
  residualCss: string[];
};

export function newBlock<T extends BlockType>(
  ctx: MapContext,
  type: T,
  path: string,
  body: Omit<Extract<Block, { type: T }>, 'id' | 'type'>,
): Extract<Block, { type: T }> {
  const id = ctx.ids.allocate(type, path);
  return { id, type, ...body } as Extract<Block, { type: T }>;
}

/** Adds residual inline declarations to a block's ext.import.style. */
export function addResidualStyle(
  ctx: MapContext,
  block: Block,
  declarations: Map<string, string>,
): void {
  if (declarations.size === 0) return;
  const style = [...declarations.entries()].map(([prop, value]) => `${prop}:${value}`).join(';');
  const current = importResidual(block.ext) ?? {};
  block.ext = withImportResidual(block.ext, {
    style: current.style ? `${current.style};${style}` : style,
  });
  ctx.leftoverInline.push(`${ctx.slideId}#${block.id} style="${style}"`);
}

export function addResidualClasses(block: Block, classes: string[]): void {
  if (classes.length === 0) return;
  const current = importResidual(block.ext) ?? {};
  block.ext = withImportResidual(block.ext, {
    classes: [...new Set([...(current.classes ?? []), ...classes])],
  });
}

/** `Npx` to a number restricted to a set, or undefined when the value is not in the set. */
export function pxIn<T extends number>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  const n = pxNumber(value);
  return allowed.find((a) => a === n);
}
