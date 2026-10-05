// The shaders area's readings (the Round 1 follow-up, lane D). Lane C item 2 renamed a selected
// shader's chip to the noun the Insert row and Format options use, "Animated pattern", and the
// insert step read the chip as "Shader" alone; it now takes either word, as shaders.insert.words
// does.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(new URL('./areas/shaders.mjs', import.meta.url), 'utf8');

/** The text of one step: from its id at the head of `t.step(` to the next step. */
function stepBody(id) {
  const at = SOURCE.indexOf(`await t.step(\n    '${id}',`);
  expect(at, id).toBeGreaterThan(0);
  const next = SOURCE.indexOf('await t.step(', at + 10);
  return SOURCE.slice(at, next === -1 ? SOURCE.length : next);
}

describe('shaders.insert.selected-free-rectangle', () => {
  it('reads the chip as Shader or Animated pattern', () => {
    const body = stepBody('shaders.insert.selected-free-rectangle');
    expect(body).toContain("/^(Shader|Animated pattern)$/.test(facts.chip ?? '')");
    expect(body).not.toContain("facts.chip === 'Shader'");
  });
});
