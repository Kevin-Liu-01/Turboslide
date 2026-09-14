// Snapshot tests per block type in both themes (SPEC 5.2: the renderer's output is snapshot-tested
// per block type in both themes).
import { describe, expect, it } from 'vitest';

import { renderBlock } from '../blocks/render-block.ts';
import type { BlockContext } from '../blocks/context.ts';
import type { Block } from '@turboslide/schema/blocks';
import type { Theme } from '@turboslide/schema/render';
import { catalog, deck } from './fixtures.ts';

function context(theme: Theme, blockAttrs = true): BlockContext {
  return {
    slideId: 'catalog',
    theme,
    blockAttrs,
    gtWord: true,
    image: (id) => {
      const asset = deck.assets[id];
      if (!asset) return undefined;
      // the stored size travels with the twins so every emitted image carries width and height
      // (gslides-parity SPEC-3 9.2 E12), as the deck resolver of slide.ts passes it
      if ('neutral' in asset.twins)
        return { src: asset.twins.neutral, alt: asset.alt, size: asset.size };
      return {
        src: theme === 'dark' ? asset.twins.dark : asset.twins.light,
        light: asset.twins.light,
        dark: asset.twins.dark,
        alt: asset.alt,
        size: asset.size,
      };
    },
    assetUrl: (path) => path,
    slotWidth: 731.5,
    rasters: [],
    warnings: [],
    rasterCount: 0,
  };
}

describe('block catalog', () => {
  const themes: Theme[] = ['light', 'dark'];
  for (const block of catalog) {
    for (const theme of themes) {
      it(`renders ${block.type} (${block.id}) in ${theme}`, () => {
        const ctx = context(theme);
        const html = renderBlock(block, ctx);
        expect(ctx.warnings).toEqual([]);
        expect({ html, rasters: ctx.rasters }).toMatchSnapshot();
      });
    }
  }

  it('covers every block type of the catalog', () => {
    const types = new Set(catalog.map((block) => block.type));
    const expected: Block['type'][] = [
      'heading',
      'paragraph',
      'credit',
      'rows',
      'plain',
      'refs',
      'say',
      'scales',
      'spec',
      'lang',
      'ladder',
      'swatches',
      'shot',
      'pair',
      'tiles',
      'details',
      'board',
      'composite',
      'panel',
      'dia',
      'dither',
      'mark',
      'markSizes',
      'matrix',
      'logoPlates',
      'material',
      'box',
      'shape',
      'rule',
      'text',
      'icon',
      'picture',
      'chart',
      'html',
    ];
    for (const type of expected) expect(types.has(type), type).toBe(true);
  });

  it('writes palette tokens as css variables, hues and custom colors as literals, typography inline', () => {
    const box = renderBlock(catalog.find((block) => block.id === 'bx') as Block, context('light'));
    expect(box).toContain('background:var(--plate)');
    expect(box).toContain('border:1px solid var(--hair)');
    expect(box).toContain('font-size:20px');
    expect(box).toContain('data-run="bx/text"');
    const blue = renderBlock(
      catalog.find((block) => block.id === 'bx2') as Block,
      context('light'),
    );
    expect(blue).toContain('background:#2f5ce0');
    expect(blue).toContain('border:0');
    expect(blue).toContain('border-radius:6px');
    expect(blue).toContain('color:var(--paper)');
    const text = renderBlock(catalog.find((block) => block.id === 'tx') as Block, context('light'));
    expect(text).toContain(
      'style="color:var(--ink-2);font-size:26px;font-weight:500;text-align:center;letter-spacing:-0.01em;line-height:1.3"',
    );
    const icon = renderBlock(
      catalog.find((block) => block.id === 'ico') as Block,
      context('light'),
    );
    expect(icon).toContain('width:48px;height:48px;color:#f0a020');
    expect(icon).toContain('<use href="#i-bolt"/>');
  });

  it('draws shapes as inline svg at the slot width with the ends and heads the exporter reads', () => {
    const arrow = renderBlock(
      catalog.find((block) => block.id === 'arr') as Block,
      context('light'),
    );
    expect(arrow).toContain('viewBox="0 0 731.5 24"');
    expect(arrow).toContain('data-shape="arrow"');
    expect(arrow).toContain('data-from="0.5,12.5" data-to="731.5,12.5" data-heads="both"');
    expect(arrow.match(/<polygon/g)?.length).toBe(2);
    expect(arrow).toContain('stroke="var(--ink)"');
    const ellipse = renderBlock(
      catalog.find((block) => block.id === 'ell') as Block,
      context('light'),
    );
    expect(ellipse).toContain(
      '<ellipse cx="365.75" cy="100" rx="365.25" ry="99.5" fill="#12a37a" stroke="var(--ink)"',
    );
    const rule = renderBlock(catalog.find((block) => block.id === 'rl') as Block, context('light'));
    expect(rule).toContain('style="width:731.5px;height:1px;background:var(--hair)"');
    expect(rule).toContain('role="separator"');
  });

  it('marks every block root with data-block and data-type', () => {
    for (const block of catalog) {
      const html = renderBlock(block, context('light'));
      expect(html).toContain(`data-block="${block.id}"`);
      expect(html).toContain(`data-type="${block.type}"`);
    }
  });

  it('omits the data attributes when blockAttrs is off', () => {
    for (const block of catalog) {
      const html = renderBlock(block, context('light', false));
      expect(html).not.toContain('data-block=');
      expect(html).not.toContain('data-run=');
      expect(html).not.toContain('data-raster=');
    }
  });

  it('draws the standalone GT as the mark in copy and never inside a panel', () => {
    const p = catalog.find((block) => block.id === 'p1');
    const html = renderBlock(p as Block, context('light'));
    expect(html).toContain('<span class="gt-word">');
    expect(html.replace(/<span class="sr">GT<\/span>/g, '')).not.toMatch(/\bGT\b/);
    const panel = renderBlock(
      { id: 'c', type: 'panel', code: 'GT is a package' },
      context('light'),
    );
    expect(panel).not.toContain('gt-word');
    expect(panel).toContain('GT is a package');
  });

  it('chooses the twin for the theme and keeps both for the runtime', () => {
    const shot = catalog.find((block) => block.id === 'fig') as Block;
    const light = renderBlock(shot, context('light'));
    const dark = renderBlock(shot, context('dark'));
    expect(light).toContain('src="assets/site-home-light.jpg"');
    expect(dark).toContain('src="assets/site-home-dark.jpg"');
    expect(dark).toContain('data-light="assets/site-home-light.jpg"');
  });

  it('sets a slot-fit diagram viewBox to the slot width', () => {
    const dia = catalog.find((block) => block.id === 'dia2') as Block;
    expect(renderBlock(dia, context('light'))).toContain('viewBox="0 0 731.5 452"');
    const declared = catalog.find((block) => block.id === 'dia1') as Block;
    expect(renderBlock(declared, context('light'))).toContain('viewBox="0 0 731.5 150"');
  });

  it('strips scripts and event handlers from an escape block and scopes its css', () => {
    const escape = catalog.find((block) => block.id === 'html') as Block;
    const html = renderBlock(escape, context('light'));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).toContain('.ts-x-catalog-html .lay {');
    expect(html).toContain('.ts-x-catalog-html .ex {');
    expect(html).not.toMatch(/(<style>|\n)\.lay \{/);
  });

  it('registers rasters with selectors the exporter can query', () => {
    const ctx = context('light');
    renderBlock(catalog.find((block) => block.id === 'list') as Block, ctx);
    expect(ctx.rasters.map((r) => r.kind)).toEqual(['icon', 'icon']);
    expect(ctx.rasters[0]?.selector).toBe('[data-slide="catalog"] [data-rid="list:1"]');
  });
});
