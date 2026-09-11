// The recipe key of a material frame (SPEC 5.4: `recipeKey = sha256(materialId, uniforms, size,
// timeMs, backend)`), the same digest packages/import/src/assets.ts writes for the imported deck:
// the JSON of the five fields in that order, hashed as written, so a key recorded in deck.json is
// reproduced from the record and a frame is never regenerated silently on another backend. Node
// only (node:crypto); the browser shows the recorded key and never computes one.
import { createHash } from 'node:crypto';

import type { Asset } from '@turboslide/schema/assets';

export type MaterialSource = Extract<Asset['source'], { kind: 'material' }>;

export type RecipeKeyInput = Pick<
  MaterialSource,
  'materialId' | 'uniforms' | 'size' | 'timeMs' | 'backend'
>;

export function recipeKey(source: RecipeKeyInput): string {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify([
      source.materialId,
      source.uniforms,
      source.size,
      source.timeMs,
      source.backend,
    ]),
  );
  return `sha256:${hash.digest('hex')}`;
}
