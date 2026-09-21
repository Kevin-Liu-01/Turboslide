// The objects lane of the focus round (docs/FOCUS.md sections 4 and 5): the kept shape presets
// draw their own geometry through the renderer, a fresh shape's empty text keeps its run without
// a prompt, a picture object drawn as a shot carries what the canvas CSS needs to fill its box, and
// block-css.ts holds those canvas rules. The legacy kinds stay byte for byte.
import { describe, expect, it } from 'vitest';

import type { Block, BlockOf } from '@turboslide/schema/blocks';
import type { Theme } from '@turboslide/schema/render';

import { BLOCK_CSS } from '../block-css.ts';
import type { BlockContext } from '../blocks/context.ts';
import { renderShot } from '../blocks/figures.ts';
import { renderShape, shapeTextRect } from '../blocks/primitives.ts';
import { renderBlock } from '../blocks/render-block.ts';

function context(theme: Theme = 'light', live = false): BlockContext {
  return {
    slideId: 'focus',
    theme,
    blockAttrs: true,
    gtWord: true,
    live,
    image: (id) => ({ src: `assets/${id}.png`, alt: id, size: [640, 400] }),
    assetUrl: (path) => path,
    slotWidth: 1326,
    rasters: [],
    warnings: [],
    rasterCount: 0,
  };
}

const pos = { x: 100, y: 100, w: 240, h: 160, z: 1 };

describe('the kept shape presets in the renderer (FOCUS.md section 4)', () => {
  it('draws roundRect as a path with four arcs of the ECMA radius, inset by half the stroke', () => {
    const block = { id: 's', type: 'shape', shape: 'roundRect', pos } as BlockOf<'shape'>;
    const html = renderShape(block, context());
    expect(html).toContain('data-shape="roundRect"');
    // the box less the 1 px stroke is 239 by 159: x1 = 159 * 16667 / 100000 = 26.5
    expect(html).toContain('d="M0,26.5 A26.5,26.5 0 0 1 26.5,0 H212.5');
    expect(html.match(/ A/g)).toHaveLength(4);
    expect(html).toContain('transform="translate(0.5 0.5)"');
  });

  it('honours the adjust value of a roundRect and writes it for the exporter', () => {
    const block = {
      id: 's',
      type: 'shape',
      shape: 'roundRect',
      adjust: [50000],
      pos,
    } as BlockOf<'shape'>;
    const html = renderShape(block, context());
    expect(html).toContain('data-adjust="50000"');
    expect(html).toContain('A79.5,79.5 0 0 1');
  });

  it('keeps the legacy rectangle, rounded and ellipse byte for byte as rect and ellipse elements', () => {
    const rounded = { id: 'r', type: 'shape', shape: 'rounded', pos } as BlockOf<'shape'>;
    expect(renderShape(rounded, context())).toContain(
      '<rect x="0.5" y="0.5" width="239" height="159" rx="8" ry="8" fill="none" stroke="var(--hair)" stroke-width="1"/>',
    );
    const rectangle = { id: 'r', type: 'shape', shape: 'rectangle', pos } as BlockOf<'shape'>;
    expect(renderShape(rectangle, context())).toContain(
      '<rect x="0.5" y="0.5" width="239" height="159" fill="none" stroke="var(--hair)" stroke-width="1"/>',
    );
    const ellipse = { id: 'e', type: 'shape', shape: 'ellipse', pos } as BlockOf<'shape'>;
    expect(renderShape(ellipse, context())).toContain(
      '<ellipse cx="120" cy="80" rx="119.5" ry="79.5" fill="none" stroke="var(--hair)" stroke-width="1"/>',
    );
  });

  it('paints the fill and the stroke a fresh shape carries with a theme token', () => {
    const block = {
      id: 's',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      pos,
    } as BlockOf<'shape'>;
    expect(renderShape(block, context())).toContain(
      'fill="var(--plate)" stroke="var(--ink)" stroke-width="1"',
    );
  });

  it('writes a stored fill the same on the editor root and the viewer root (R36, shapes.reload-and-viewer)', () => {
    /* the /deck viewer paints the shape through this renderer with `blockAttrs: true` and no live
       stage (server/decks.ts buildViewerDeck), the editor with `live: true`; a semantic token
       lands as its hex and a custom hex as itself on both, so a viewer that paints the default
       where the editor holds a colour reads a document behind the editor's, not a render */
    /* GT blue is the brand kit's Primary role since the product round (docs/PRODUCT.md 4.1;
       schema color.ts colorCss): it reads the sheet's --blue with its hex as the fallback on both
       roots, so a kit's primary recolours a blue shape everywhere */
    for (const [fill, css] of [
      ['green', '#12a37a'],
      ['blue', 'var(--blue, #2f5ce0)'],
      ['#aa3366', '#aa3366'],
      ['plate', 'var(--plate)'],
    ] as const) {
      const block = {
        id: 'shape',
        type: 'shape',
        shape: 'rectangle',
        fill,
        pos,
      } as BlockOf<'shape'>;
      const editor = renderShape(block, context('dark', true));
      const viewer = renderShape(block, context('dark', false));
      expect(editor, fill).toContain(`fill="${css}"`);
      expect(viewer, fill).toContain(`fill="${css}"`);
      expect(viewer, fill).toContain('data-block="shape"');
      expect(renderBlock(block as Block, context('dark', false)), fill).toContain(`fill="${css}"`);
    }
    const bare = { id: 'shape', type: 'shape', shape: 'rectangle', pos } as BlockOf<'shape'>;
    expect(renderShape(bare, context('dark', false))).toContain('fill="none"');
  });

  it('keeps the whole box as the text rectangle of every kind, so the layer and the PPTX insets agree', () => {
    for (const shape of ['rectangle', 'rounded', 'ellipse', 'roundRect', 'hexagon'] as const) {
      const block = { id: 'a', type: 'shape', shape, text: 'A' } as BlockOf<'shape'>;
      expect(shapeTextRect(block, 240, 160), shape).toEqual({ x: 0, y: 0, w: 240, h: 160 });
    }
  });
});

describe('a fresh shape’s empty text (FOCUS.md section 4, the row shapes.text.type-align-bold)', () => {
  it('keeps the text run, draws no prompt on the live stage and marks the layer is-empty', () => {
    const block = {
      id: 'fresh',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      text: '',
      pos,
    } as BlockOf<'shape'>;
    const html = renderShape(block, context('light', true));
    expect(html).toMatch(
      /^<div class="shape-block" data-block="fresh" data-type="shape"[^>]*><svg [^>]*data-shape="rectangle"/,
    );
    expect(html).toContain('class="shape-text is-empty"');
    expect(html).toContain('data-run="fresh/text"');
    expect(html).not.toContain('data-prompt');
    expect(html).not.toContain('Click to add text');
    // the layer spans the whole rectangle so the caret has the box to type into
    expect(html).toMatch(
      /class="shape-text is-empty" style="left:0px;top:0px;width:240px;height:160px/,
    );
  });

  it('drops the is-empty class as soon as the shape holds text, and a shape without a text field draws no layer', () => {
    const typed = {
      id: 'fresh',
      type: 'shape',
      shape: 'rectangle',
      text: 'Label',
      pos,
    } as BlockOf<'shape'>;
    const html = renderShape(typed, context('light', true));
    expect(html).toContain('class="shape-text"');
    expect(html).not.toContain('is-empty');
    expect(html).toContain('>Label</div>');
    const bare = { id: 'bare', type: 'shape', shape: 'rectangle', pos } as BlockOf<'shape'>;
    expect(renderShape(bare, context('light', true))).toMatch(/^<svg /);
  });

  it('renders the same through renderBlock', () => {
    const block = {
      id: 'fresh',
      type: 'shape',
      shape: 'ellipse',
      fill: 'plate',
      stroke: 'ink',
      text: '',
      pos,
    } as Block;
    const html = renderBlock(block, context('light', true));
    expect(html).toContain('class="shape-text is-empty"');
    expect(html).toContain('<ellipse ');
  });
});

describe('the picture object drawn as a shot (FOCUS.md rank 18, the deferred W7 of hotfix 4)', () => {
  const shot = (extra: Partial<BlockOf<'shot'>> = {}): BlockOf<'shot'> =>
    ({ id: 'pic', type: 'shot', asset: 'logo', ...extra }) as BlockOf<'shot'>;

  it('renders a positioned shot as the flow does, with no canvas sizing of its own on the block', () => {
    const html = renderShot(shot({ pos }), context());
    expect(html).toMatch(
      /^<figure class="shot-fig" data-block="pic" data-type="shot"><img class="shot"/,
    );
    expect(html).not.toContain('--shot');
    expect(renderShot(shot(), context())).toBe(html);
  });

  it('leaves a trimmed shot to its frame, which the canvas CSS sizes itself', () => {
    const html = renderShot(
      shot({ pos, trim: { left: 0, right: 0.2, top: 0, bottom: 0.1 } }),
      context(),
    );
    expect(html).toContain('class="shot-crop"');
    expect(html).toContain('aspect-ratio:');
  });

  it('holds the canvas rules for the shot figure, its image and its frame in BLOCK_CSS', () => {
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .free > .shot-fig, .ts-sheet .free > .link > .shot-fig { height: 100%; min-height: 0; grid-template-rows: minmax(0, 1fr); grid-auto-rows: auto; align-content: start; }',
    );
    // the image takes the whole row in both axes: the sheet sizes it border-box, and the fit form's
    // auto width and its two caps are off so a drag of one edge stretches it
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .free > .shot-fig > img.shot, .ts-sheet .free > .link > .shot-fig > img.shot { width: 100%; height: 100%; max-width: none; max-height: none; min-height: 0; object-fit: fill; }',
    );
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .free > .shot-fig > .shot-crop, .ts-sheet .free > .link > .shot-fig > .shot-crop { height: 100%; min-height: 0; aspect-ratio: auto !important; }',
    );
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .free > .shot-fig > .shot-crop > img.shot, .ts-sheet .free > .link > .shot-fig > .shot-crop > img.shot { object-fit: fill; }',
    );
    // the flow rules the fidelity gate depends on are unchanged
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .shot-fig { margin: 0; width: 100%; display: grid; gap: 12px; }',
    );
  });

  it('lets a click through an empty shape text layer until the session focuses it', () => {
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .shape-text.is-empty:not(:focus) { pointer-events: none; }',
    );
  });
});
