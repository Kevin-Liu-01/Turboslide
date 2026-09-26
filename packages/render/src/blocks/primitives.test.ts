// The preset branch of renderShape (docs/VECTOR.md 2.3, 6.3): a multi path preset renders one
// `<path>` per geometry path with the fill modes and the stroke flags, the shade overlays over the
// block's fill, `data-adjust` as written, and the label layer at the ECMA text rectangle.
import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import { shapePath } from '@turboslide/schema/shapes';

import type { BlockContext } from './context.ts';
import { renderBlock } from './render-block.ts';
import { shadeOverlay } from './primitives.ts';

function context(): BlockContext {
  return {
    slideId: 'shapes',
    theme: 'light',
    blockAttrs: true,
    gtWord: true,
    image: () => undefined,
    assetUrl: (path) => path,
    slotWidth: 731.5,
    rasters: [],
    warnings: [],
    rasterCount: 0,
  };
}

const shape = (fields: Record<string, unknown>): Block =>
  ({
    id: 's',
    type: 'shape',
    pos: { x: 0, y: 0, w: 240, h: 160, z: 0 },
    ...fields,
  }) as Block;

const paths = (html: string) => html.match(/<path [^>]*\/>/g) ?? [];

describe('a preset on the sheet', () => {
  it('draws one path per geometry path with the fill modes and the stroke flags: the can', () => {
    const html = renderBlock(shape({ shape: 'can', fill: 'plate', stroke: 'ink' }), context());
    expect(html).toContain('data-shape="can"');
    const drawn = paths(html);
    /* three geometry paths, and the lighten face carries the paper overlay after its base */
    expect(drawn).toHaveLength(4);
    expect(drawn[0]).toContain('fill="var(--plate)"');
    expect(drawn[0]).toContain('stroke="none"');
    expect(drawn[1]).toContain('fill="var(--plate)"');
    expect(drawn[1]).toContain('stroke="none"');
    expect(drawn[2]).toContain(
      'fill="var(--paper)" fill-opacity="0.3" stroke="none" data-shade="lighten"',
    );
    expect(drawn[3]).toContain('fill="none"');
    expect(drawn[3]).toContain('stroke="var(--ink)"');
    /* every path at the box less the stroke, translated by half of it */
    for (const path of drawn) expect(path).toContain('transform="translate(0.5 0.5)"');
    expect(drawn[1]).toContain(`d="${shapePath('can', 239, 159).split(' Z ')[1]}`);
  });

  it('shades nothing on a shape with no fill and lays ink over a darkenLess face', () => {
    const bare = renderBlock(shape({ shape: 'can' }), context());
    expect(paths(bare)).toHaveLength(3);
    expect(bare).not.toContain('data-shade');
    const curved = renderBlock(
      shape({
        shape: 'curvedRightArrow',
        fill: 'plate',
        stroke: 'ink',
        pos: { x: 0, y: 0, w: 240, h: 240, z: 0 },
      }),
      context(),
    );
    const drawn = paths(curved);
    expect(drawn).toHaveLength(4);
    expect(drawn[2]).toContain(
      'fill="var(--ink)" fill-opacity="0.15" stroke="none" data-shade="darkenLess"',
    );
    expect(shadeOverlay('lighten')).toEqual({ token: 'paper', opacity: 0.3 });
    expect(shadeOverlay('darken')).toEqual({ token: 'ink', opacity: 0.3 });
    expect(shadeOverlay('norm')).toBeUndefined();
    expect(shadeOverlay('none')).toBeUndefined();
  });

  it('draws a single path preset as the interpreter’s path at the box less the stroke, with data-adjust as written', () => {
    const hexagon = renderBlock(
      shape({ shape: 'hexagon', fill: 'plate', stroke: 'ink' }),
      context(),
    );
    const drawn = paths(hexagon);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toContain(`d="${shapePath('hexagon', 239, 159)}"`);
    expect(drawn[0]).toContain('fill="var(--plate)" stroke="var(--ink)" stroke-width="1"');
    expect(hexagon).not.toContain('data-adjust');
    const star = renderBlock(
      shape({
        shape: 'star5',
        fill: 'plate',
        adjust: [30000, 105146, 110557],
        pos: { x: 0, y: 0, w: 300, h: 300, z: 0 },
      }),
      context(),
    );
    expect(star).toContain('data-adjust="30000,105146,110557"');
    expect(paths(star)[0]).toContain(
      `d="${shapePath('star5', 299, 299, [30000, 105146, 110557])}"`,
    );
  });

  it('keeps the legacy kinds byte for byte and a line kind on its own branch', () => {
    const rounded = renderBlock(shape({ shape: 'rounded' }), context());
    expect(rounded).toContain('<rect x="0.5" y="0.5" width="239" height="159" rx="8" ry="8"');
    const line = renderBlock(shape({ shape: 'line' }), context());
    expect(line).toContain('<line ');
    expect(line).not.toContain('<path');
  });

  it('places the label layer at the preset’s text rectangle: a rounded rectangle steps in, a right arrow sits in the shaft', () => {
    const rounded = renderBlock(
      shape({ shape: 'roundRect', fill: 'plate', text: 'Next step' }),
      context(),
    );
    expect(rounded).toContain('class="shape-text"');
    expect(rounded).toContain('left:7.811px;top:7.811px;width:224.379px;height:144.379px');
    const arrow = renderBlock(shape({ shape: 'rightArrow', fill: 'plate', text: 'Go' }), context());
    expect(arrow).toContain('left:0px;top:40px;width:200px;height:80px');
    const rect = renderBlock(shape({ shape: 'rect', fill: 'plate', text: 'Box' }), context());
    expect(rect).toContain('left:0px;top:0px;width:240px;height:160px');
    /* the Corner field at 50 percent: the radius is 80 and the inset 23.43 */
    const wide = renderBlock(
      shape({ shape: 'roundRect', fill: 'plate', text: 'Next step', adjust: [50000] }),
      context(),
    );
    expect(wide).toContain('left:23.431px;top:23.431px');
  });
});
