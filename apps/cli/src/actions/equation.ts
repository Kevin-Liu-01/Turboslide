// The equation lane's handlers (gslides-parity SPEC-5 8.4, 13; MILESTONES-5 B6 day 3):
// equation.insert, equation.render and equation.symbols on the checkout dispatcher, the hosted
// dispatcher and, through the editor's controller, the window transport. The module stays free of
// `node:` imports because the editor page imports this graph through store-actions.ts; the Temml
// engine is the render package's lazy chunk (`loadEquationEngine`), reached through
// `@turboslide/render/theme-css` until the `./blocks/equation` subpath lands (b6.md request R6).
//
// equation.insert is one `block.insert` (the canvas conversion first when the slide is not a
// canvas, SPEC-2 1.6) placed at the centre of the content box with the placeholder source when
// none is given, so one Undo removes it. equation.render is read only: the MathML the sheet draws,
// the parse finding when the source did not parse, and the box in sheet px. The box is an
// estimate from the MathML tree (the glyph count per row, the fraction and table depth at the
// block's size); the exact box is the renderer's, which a Chromium measure gives and this handler
// takes through `EquationLaneDeps.equationPng` when the dispatcher composition provides it.
// `out: 'png'` needs that dependency and refuses with the sentence without it.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import type { BlockOf } from '@turboslide/schema/blocks';
import type { EquationDisplay } from '@turboslide/schema/blocks/equation';
import { EQUATION_PLACEHOLDER_TEX, equationSymbolGroups } from '@turboslide/schema/blocks/equation';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Position } from '@turboslide/schema/position';
import { contentBox, deckPage } from '@turboslide/schema/render';
import {
  EQUATION_DEFAULT_SIZE,
  equationMathml,
  loadEquationEngine,
} from '@turboslide/render/theme-css';

import { blockInsert } from '../store-actions.ts';
import type { SlideResult, WriteContext } from '../store-actions.ts';
import type { LaneDeps } from './deps.ts';

type Rev = { baseRevision: number };

export type EquationInsertInput = Rev & {
  slideId: string;
  tex: string;
  pos?: Position;
  display?: EquationDisplay;
  alt?: string;
};

export type EquationRenderInput = {
  tex: string;
  display?: EquationDisplay;
  size?: number;
  out?: 'mathml' | 'png';
};

export type EquationRenderOutput = {
  mathml: string;
  box: [number, number];
  findings: { code: string; severity: number; message: string; pointer?: string }[];
  png?: string;
};

/**
 * What the composition may add for the raster (`out: 'png'`): given the block's MathML, its size
 * and colour, the 2x PNG path written under the store's folder. A checkout composition binds it
 * to the headless renderer; absent on the hosted dispatcher and in the page.
 */
export type EquationLaneDeps = LaneDeps & {
  equationPng?: (input: { mathml: string; sizePx: number; display: EquationDisplay }) => Promise<{
    path: string;
    box: [number, number];
  }>;
};

/** The default box of a new equation block: a third of the content width, centred (SPEC-5 8.2). */
export function equationDefaultPos(page: { width: number; height: number }): Position {
  const [cx, cy, cw, ch] = contentBox(page);
  const w = Math.round(cw / 3 / 8) * 8;
  const h = 120;
  return {
    x: Math.round((cx + (cw - w) / 2) / 8) * 8,
    y: Math.round((cy + (ch - h) / 2) / 8) * 8,
    w,
    h,
  };
}

/** A free block id on the slide: `eq`, `eq-2`, `eq-3` and so on. */
export function freeEquationId(taken: ReadonlySet<string>): string {
  if (!taken.has('eq')) return 'eq';
  for (let n = 2; ; n += 1) {
    const id = `eq-${n}`;
    if (!taken.has(id)) return id;
  }
}

export async function equationInsert(
  deps: LaneDeps,
  ctx: WriteContext,
  input: EquationInsertInput,
): Promise<SlideResult & { blockId: string }> {
  const { document } = await deps.store.read();
  const slide = document.slides[input.slideId];
  if (slide === undefined) throw new RangeError(`No slide "${input.slideId}"`);
  const taken = new Set(slideBlocks(slide).map(({ block }) => block.id));
  const id = freeEquationId(taken);
  const tex = input.tex.trim() === '' ? EQUATION_PLACEHOLDER_TEX : input.tex;
  const block: BlockOf<'equation'> = {
    id,
    type: 'equation',
    tex,
    pos: input.pos ?? equationDefaultPos(deckPage(document.deck)),
    ...(input.display !== undefined ? { display: input.display } : {}),
    ...(input.alt !== undefined && input.alt !== '' ? { alt: input.alt } : {}),
  };
  const result = await blockInsert(deps, ctx, {
    slideId: input.slideId,
    slot: 'main',
    block,
    baseRevision: input.baseRevision,
  });
  return { ...result, blockId: id };
}

/**
 * The box of a MathML tree in sheet px at a font size, without a browser: the widest row's glyph
 * count times 0.6 em plus 0.35 em per operator with spacing, the height 1.25 em per stacked row
 * (a fraction's numerator and denominator, a table's rows, the limits of an n-ary operator) with
 * the display math margin. The renderer's own measure replaces it when a Chromium is at hand.
 */
export function estimateEquationBox(mathml: string, sizePx: number): [number, number] {
  const text = (mathml.match(/<m[ino][^>]*>([^<]*)<\/m[ino]>/g) ?? [])
    .map((run) => run.replace(/<[^>]+>/g, ''))
    .join('');
  const glyphs = [...text.replace(/\s+/g, '')].length;
  const operators = (mathml.match(/<mo\b/g) ?? []).length;
  const fractions = (mathml.match(/<mfrac\b/g) ?? []).length;
  const rows = (mathml.match(/<mtr\b/g) ?? []).length;
  const stacked = (mathml.match(/<m(underover|over|under)\b/g) ?? []).length;
  const stackDepth = Math.max(1, 1 + fractions, rows, 1 + (stacked > 0 ? 1 : 0));
  const em = sizePx;
  const w = Math.ceil((Math.max(1, glyphs) * 0.6 + operators * 0.35) * em + em);
  const h = Math.ceil(stackDepth * 1.25 * em + 0.5 * em);
  return [w, h];
}

export async function equationRender(
  deps: EquationLaneDeps,
  input: EquationRenderInput,
): Promise<EquationRenderOutput> {
  await loadEquationEngine();
  const display = input.display ?? 'block';
  const sizePx = input.size ?? EQUATION_DEFAULT_SIZE;
  const { mathml, error } = equationMathml(input.tex, display);
  const findings: EquationRenderOutput['findings'] =
    error === undefined
      ? []
      : [{ code: 'equation', severity: 2, message: `equation/parse: ${error}`, pointer: '/tex' }];
  let box = estimateEquationBox(mathml, sizePx);
  let png: string | undefined;
  if (input.out === 'png') {
    if (deps.equationPng === undefined)
      throw new TypeError(
        'equation.render --out png needs the headless renderer, which this dispatcher does not carry; render the slide that holds the block with turboslide render slide instead',
      );
    const rendered = await deps.equationPng({ mathml, sizePx, display });
    box = rendered.box;
    png = rendered.path;
  }
  return { mathml, box, findings, ...(png !== undefined ? { png } : {}) };
}

/** The table by group, the shape the action's output schema states. */
export function equationSymbols(): ReturnType<typeof equationSymbolGroups> {
  return equationSymbolGroups();
}

/** The handlers this lane registers on a dispatcher. */
export function registerEquationActions(dispatcher: Dispatcher, deps: LaneDeps): void {
  dispatcher.register('equation.insert', (input, ctx) =>
    equationInsert(deps, ctx as WriteContext, input as EquationInsertInput),
  );
  dispatcher.register('equation.render', (input) =>
    equationRender(deps as EquationLaneDeps, input as EquationRenderInput),
  );
  dispatcher.register('equation.symbols', () => ({ groups: equationSymbols() }));
}
