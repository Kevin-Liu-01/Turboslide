// A free material object's frame fills the object's box (the polish round's ship step, third
// attempt, B5's R27; the row shaders.export.pdf-frame): the figure's grid keeps a caption track
// and its 12 px gap only with a caption, so a shader with none draws its frame at the block's
// height and the PDF's embedded image keeps the box's aspect. Read by hand on the enforce preview
// of 2026-09-30: a 480 by 270 block drew its box and image at 480 by 258 with the grid's rows
// "258px 0px" and a 12 px gap, on the editor's stage and on the print document alike.
import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';

import { BLOCK_CSS } from '../block-css.ts';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';
import { contentSlide, deck } from './fixtures.ts';

const options: RenderOptions = {
  theme: 'light',
  chrome: true,
  assetBase: '',
  blockAttrs: false,
  gtWord: true,
};

const shader = (extra: Partial<Block> = {}): Block =>
  ({
    id: 'mat',
    type: 'material',
    materialId: 'paper:liquid-metal',
    asset: 'opener-brand',
    alt: 'A liquid metal frame',
    pos: { x: 646, y: 129, w: 480, h: 270, z: 1 },
    ...extra,
  }) as Block;

const figureClassOf = (html: string): string | null =>
  /<figure class="(material-fig[^"]*)"/.exec(html)?.[1] ?? null;

describe('a free material figure and its caption track', () => {
  it('carries no caption class without a caption, so the grid has one track and no gap', () => {
    const slide = contentSlide('mat-free', { type: 'freeform' }, { main: [shader()] });
    const html = renderSlide(deck, slide, options).html;
    expect(figureClassOf(html)).toBe('material-fig');
    expect(html).not.toContain('<figcaption');
  });

  it('carries the caption class with a caption, beside the 15 px size class', () => {
    const slide = contentSlide(
      'mat-cap',
      { type: 'freeform' },
      {
        main: [
          shader({ caption: 'A caption under the frame.', captionSize: 15 } as Partial<Block>),
        ],
      },
    );
    const html = renderSlide(deck, slide, options).html;
    expect(figureClassOf(html)).toBe('material-fig cap-15 has-caption');
    expect(html).toContain('<figcaption');
  });

  it('the block CSS gives a free figure one track and no gap, and the caption track with its gap only under the class', () => {
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .free > .material-fig { grid-template-rows: 1fr; gap: 0; }',
    );
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .free > .material-fig.has-caption { grid-template-rows: 1fr auto; gap: 12px; }',
    );
    expect(BLOCK_CSS).not.toContain(
      '.ts-sheet .free > .material-fig { grid-template-rows: 1fr auto; }',
    );
    /* the box still fills the figure's one track */
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .free > .material-fig > .material { aspect-ratio: auto; height: 100%; min-height: 0; }',
    );
  });
});
