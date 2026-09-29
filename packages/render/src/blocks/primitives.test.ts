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
    /* the only path of a line is its hit path (the polish round, docs/POLISH.md item 24) */
    expect(paths(line)).toHaveLength(1);
    expect(paths(line)[0]).toContain('class="hit"');
  });

  it('gives a line kind a transparent hit stroke and no pointer on its svg, so a press inside its box off the stroke reaches the object under it (item 24)', () => {
    const line = renderBlock(shape({ shape: 'line' }), context());
    expect(line).toContain('class="shape shape-line is-line"');
    expect(line).toContain('style="pointer-events:none"');
    expect(paths(line)[0]).toBe(
      '<path class="hit" d="M0.5,80.5 L240.5,80.5" fill="none" stroke="transparent" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" pointer-events="stroke" data-hit="stroke"/>',
    );
    /* the connectors and the path kinds carry the hit path over their own run */
    const elbow = renderBlock(shape({ shape: 'elbow' }), context());
    const drawn = paths(elbow)[0]?.match(/d="([^"]+)"/)?.[1];
    expect(paths(elbow).at(-1)).toContain(`class="hit" d="${drawn}"`);
    const scribble = renderBlock(
      shape({
        shape: 'scribble',
        points: [
          [0, 0],
          [0.5, 1],
          [1, 0],
        ],
      }),
      context(),
    );
    expect(paths(scribble).at(-1)).toContain('pointer-events="stroke"');
    /* a closed and filled curve takes the pointer over its interior too */
    const filled = renderBlock(
      shape({
        shape: 'polyline',
        closed: true,
        fill: 'plate',
        points: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      }),
      context(),
    );
    expect(paths(filled).at(-1)).toContain('pointer-events="all"');
    /* a closed shape keeps its pointer: no hit path, no is-line, no inline pointer-events */
    const hexagon = renderBlock(shape({ shape: 'hexagon' }), context());
    expect(hexagon).not.toContain('class="hit"');
    expect(hexagon).not.toContain('is-line');
    expect(hexagon).not.toContain('pointer-events');
  });

  it('draws an elbow and a curve turned a quarter when the axis is vertical: they leave and arrive along y (item 33)', () => {
    const elbow = renderBlock(shape({ shape: 'elbow', axis: 'vertical' }), context());
    expect(elbow).toContain('data-axis="vertical"');
    expect(paths(elbow)[0]).toContain('d="M0.5,0.5 V80.5 H239.5 V159.5"');
    expect(elbow).toContain('data-points="0.5,0.5 0.5,80.5 239.5,80.5 239.5,159.5"');
    const curve = renderBlock(shape({ shape: 'curved', axis: 'vertical' }), context());
    expect(paths(curve)[0]).toContain('d="M0.5,0.5 C0.5,80.5 239.5,80.5 239.5,159.5"');
    /* the bend runs along y; the decorations point up at the start and down at the end */
    const headed = renderBlock(
      shape({ shape: 'elbow', axis: 'vertical', bend: 0.25, lineStart: 'fillArrow', lineEnd: 'fillArrow' }),
      context(),
    );
    expect(paths(headed)[0]).toContain('V40.5 H239.5');
    const ends = paths(headed).filter((path) => path.includes('class="line-end"'));
    expect(ends[0]).toContain('rotate(90)');
    expect(ends[1]).toContain('rotate(-90)');
    /* horizontal, the default, is the S as before, with no data-axis */
    const flat = renderBlock(shape({ shape: 'elbow' }), context());
    expect(flat).not.toContain('data-axis');
    expect(paths(flat)[0]).toContain('d="M0.5,0.5 H120.5 V159.5 H239.5"');
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
