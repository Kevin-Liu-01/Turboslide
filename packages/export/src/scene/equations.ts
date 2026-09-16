// The scene's equation records (gslides-parity SPEC-5 1.4, 8.3): `sceneEquations` reads the
// equation blocks of a slide and answers one `SceneEquation` per block with its box, its source,
// the MathML the renderer emits, the OMML of Turboslide's transform (the size and colour baked
// into its runs) and the 2x raster id the Editable text Fallback, the SVG and the ODP writers
// place; `extractScenes` calls it and `ooxml/math.ts` reads the list. The renderer's engine is
// installed by `@turboslide/render/theme-node` at import time, and the equation API is read
// through that module (b6.md request R6: the `./blocks/equation` subpath), so a caller that reads
// scenes without the extractor still finds the engine present.
import type { BlockOf } from '@turboslide/schema/blocks';
import { isColorToken } from '@turboslide/schema/color';
import type { Color } from '@turboslide/schema/color';
import type { Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Box } from '@turboslide/schema/render';
import { equationEngine, equationMathml } from '@turboslide/render/theme-node';
import { TOKENS } from '@turboslide/theme/tokens';
import type { TokenName } from '@turboslide/theme/tokens';

import { mathmlToOmmlDetailed } from '../ooxml/math.ts';
import type { Scene, SceneEquation } from './types.ts';

/** The body size of the sheet, an equation's size when the block names none (SPEC-5 8.1). */
const BODY_SIZE_PX = 22;

/**
 * A `SceneEquation` with the two fields this lane asked the integrator to add to the type
 * (b6.md): the block's size for the shape's paragraph properties and the reason a transform gave
 * no OMML, for the residual line.
 */
export type SceneEquationRecord = SceneEquation & { sizePx: number; reason?: string };

/** The six hex digits of a block colour in the scene's appearance: a token through the theme's table, a hex as written, the four hues by name. */
export function equationColorHex(color: Color | undefined, theme: 'light' | 'dark'): string {
  const hues: Record<string, string> = {
    green: '12a37a',
    amber: 'f0a020',
    red: 'e5484d',
    blue: '2f5ce0',
  };
  if (color === undefined) return TOKENS[theme].ink.slice(1).toUpperCase();
  if (isColorToken(color)) {
    const hue = hues[color];
    if (hue !== undefined) return hue.toUpperCase();
    const value = TOKENS[theme][color as TokenName];
    if (typeof value === 'string' && value.startsWith('#')) return value.slice(1).toUpperCase();
    return TOKENS[theme].ink.slice(1).toUpperCase();
  }
  return color.slice(1, 7).toUpperCase();
}

/** The MathML of a block as the sheet draws it: the source through Temml, else the kept MathML. */
export function equationMarkup(block: BlockOf<'equation'>): { mathml: string; error?: string } {
  const tex = block.tex.trim();
  if (tex === '') return { mathml: block.mathml ?? '' };
  if (equationEngine() === null)
    return { mathml: block.mathml ?? '', error: 'the equation engine is not loaded' };
  return equationMathml(tex, block.display ?? 'block');
}

export function sceneEquations(scene: Scene, slide: Slide): SceneEquationRecord[] {
  const out: SceneEquationRecord[] = [];
  for (const { block } of slideBlocks(slide)) {
    if (block.type !== 'equation') continue;
    const equation = block as BlockOf<'equation'>;
    const sceneBlock = scene.blocks.find((b) => b.blockId === equation.id);
    const raster = scene.rasters.find((r) => r.blockId === equation.id);
    const box: Box =
      sceneBlock?.box ??
      raster?.box ??
      (equation.pos !== undefined
        ? [equation.pos.x, equation.pos.y, equation.pos.w, equation.pos.h]
        : [0, 0, 0, 0]);
    const sizePx = equation.size ?? BODY_SIZE_PX;
    const { mathml, error } = equationMarkup(equation);
    const transformed =
      mathml === '' || error !== undefined
        ? { reason: error ?? 'the block has no source and no MathML' }
        : mathmlToOmmlDetailed(mathml, {
            sizePx,
            colorHex: equationColorHex(equation.color, scene.theme),
          });
    out.push({
      blockId: equation.id,
      box,
      tex: equation.tex,
      mathml,
      sizePx,
      ...(transformed.omml !== undefined ? { omml: transformed.omml } : {}),
      ...(transformed.reason !== undefined ? { reason: transformed.reason } : {}),
      ...(equation.alt !== undefined && equation.alt !== '' ? { alt: equation.alt } : {}),
      ...(raster !== undefined ? { raster: raster.id } : {}),
    });
  }
  return out;
}
