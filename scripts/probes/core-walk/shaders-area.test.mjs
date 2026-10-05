// The shaders area's readings (the Round 1 follow-up, lane D). Lane C item 2 renamed a selected
// shader's chip to the noun the Insert row and Format options use, "Animated pattern", and the
// insert step read the chip as "Shader" alone; it now takes either word, as shaders.insert.words
// does. The two rows with a 500 ms bound timed the walk's own click helper and its screenshots
// (692 to 3708 ms and 1379 to 4177 ms on production for changes drawn in a frame or two); they
// read the page's own clock now, from the pointerdown to the draw or the swap (`armWatch`). The
// slider row records the banner and Undo before its chord, so a cleared history is named.
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

describe('the rows with a time bound read the page clock', () => {
  it('shaders.panel.preset-tiles times the canvas from the pointerdown through the WebGL draws', () => {
    const body = stepBody('shaders.panel.preset-tiles');
    expect(body).toContain("await armWatch('canvas', id);");
    expect(body).toContain('ms = watch?.ms ?? null;');
    expect(body).not.toMatch(/ms = Date\.now\(\) - t0;/);
  });

  it('shaders.perf.one-context times the swap from the pointerdown that selected the block', () => {
    const body = stepBody('shaders.perf.one-context');
    expect(body).toContain("await armWatch('swap', second.id, first);");
    expect(body).toContain('const ms = watch?.ms ?? null;');
    expect(body).not.toMatch(/const ms = Date\.now\(\) - t0;/);
  });

  it('the watch reads WebGL draws with readPixels, since a copy of the canvas reads empty', () => {
    const watch = SOURCE.slice(
      SOURCE.indexOf('const armWatch ='),
      SOURCE.indexOf('const watchResult ='),
    );
    expect(watch).toContain("for (const name of ['drawArrays', 'drawElements'])");
    expect(watch).toContain('gl.readPixels(');
    expect(watch).toContain('gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null');
    expect(watch).toContain("document.addEventListener('pointerdown', onDown, { capture: true });");
  });
});

describe('shaders.panel.slider-live-undo', () => {
  it('records the banner and Undo before the chord', () => {
    const body = stepBody('shaders.panel.slider-live-undo');
    expect(body).toContain('.ts-banner[data-state="external"]');
    expect(body).toContain('[data-control="toolbar.undo"]');
  });
});
