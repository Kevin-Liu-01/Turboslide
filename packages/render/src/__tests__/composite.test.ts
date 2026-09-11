// The composite block (SPEC 4.2, M5) and the declared diagram templates (MILESTONES M5 item 4):
// snapshots in both themes, the cell width arithmetic the nested blocks size themselves by, the
// figure form with a caption, and every template on the half-pixel grid.
import { describe, expect, it } from 'vitest';

import { renderBlock } from '../blocks/render-block.ts';
import type { BlockContext } from '../blocks/context.ts';
import { diagramBody } from '../blocks/dia.ts';
import {
  labelClearance,
  snapFor,
  snapHalf,
  snapStroke,
  strokeSegments,
  unitsPerPixel,
} from '../dia/snap.ts';
import {
  DIA_TEMPLATE_IDS,
  DIA_TEMPLATES,
  diaTemplateExample,
  isoPlateTemplate,
  layersTemplate,
} from '../dia/templates.ts';
import type { Block, Diagram } from '@turboslide/schema/blocks';
import { cellWidths, parseTracks, trackWidths } from '@turboslide/schema/blocks/composite';
import { diagramSchema } from '@turboslide/schema/blocks';
import type { Theme } from '@turboslide/schema/render';
import { deck } from './fixtures.ts';

function context(theme: Theme, slotWidth = 1326): BlockContext {
  return {
    slideId: 'm5',
    theme,
    blockAttrs: true,
    gtWord: true,
    image: (id) => {
      const asset = deck.assets[id];
      if (!asset) return undefined;
      if ('neutral' in asset.twins) return { src: asset.twins.neutral, alt: asset.alt };
      return {
        src: theme === 'dark' ? asset.twins.dark : asset.twins.light,
        light: asset.twins.light,
        dark: asset.twins.dark,
        alt: asset.alt,
      };
    },
    assetUrl: (path) => path,
    slotWidth,
    rasters: [],
    warnings: [],
    rasterCount: 0,
  };
}

/** The example row of slide 25: four fixed 300 px tracks spread across the 1326 px slot. */
const exampleRow: Block = {
  id: 'ex',
  type: 'composite',
  tracks: 'repeat(4, 300px)',
  justify: 'space-between',
  cells: DIA_TEMPLATE_IDS.slice(0, 4).map((id, i) => ({
    blocks: [
      {
        id: `dia${i + 1}`,
        type: 'dia',
        fit: { viewBox: [0, 0, 300, 210] },
        alt: DIA_TEMPLATES[id].label,
        data: diaTemplateExample(id, 300),
      },
    ],
  })),
};

/** The compare rig of slide 67: a figure with a caption around a two-track grid of shots. */
const rig: Block = {
  id: 'rig',
  type: 'composite',
  tracks: '1fr',
  gap: 12,
  caption: 'Compare loads two directions as same-origin iframes.',
  captionSize: 16,
  cells: [
    {
      blocks: [
        {
          id: 'grid',
          type: 'composite',
          tracks: '311px 369px',
          gap: 12,
          align: 'start',
          cells: [
            { blocks: [{ id: 'fig', type: 'shot', asset: 'site-home', fit: 'width' }] },
            {
              blocks: [
                {
                  id: 'bar',
                  type: 'composite',
                  tracks: '1fr',
                  gap: 12,
                  cells: [
                    { blocks: [{ id: 'fig2', type: 'shot', asset: 'site-home', fit: 'width' }] },
                    { blocks: [{ id: 'fig3', type: 'shot', asset: 'logo-gm', fit: 'width' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** The fixed plate of slide 83: a one-icon diagram beside a name and a sentence, spanning cells. */
const plateRow: Block = {
  id: 'row',
  type: 'composite',
  tracks: '28px 1fr',
  gap: 18,
  align: 'start',
  cells: [
    {
      blocks: [
        {
          id: 'lock',
          type: 'dia',
          fit: { viewBox: [0, 0, 24, 24] },
          alt: '',
          data: {
            w: 24,
            h: 24,
            lines: [],
            rects: [],
            markers: [],
            texts: [],
            icons: [{ name: 'lock-closed', x: 0, y: 0, size: 24, color: 'info' }],
            marks: [],
          },
          ext: { import: { classes: ['ic', 'info'] } },
        },
      ],
    },
    {
      blocks: [
        { id: 'name', type: 'heading', level: 'h2', text: 'General Translation', marginBottom: 0 },
        { id: 'p', type: 'paragraph', text: 'The legal name does not change.' },
      ],
      span: 1,
    },
  ],
};

describe('composite', () => {
  for (const theme of ['light', 'dark'] as Theme[]) {
    it(`renders the example row, the rig and the plate row in ${theme}`, () => {
      for (const block of [exampleRow, rig, plateRow]) {
        const ctx = context(theme);
        const html = renderBlock(block, ctx);
        expect(ctx.warnings).toEqual([]);
        expect({ html, rasters: ctx.rasters.map((r) => r.kind) }).toMatchSnapshot(
          `${block.id}-${theme}`,
        );
      }
    });
  }

  it('writes the tracks, gap, justify and align as the grid style and nothing else when unset', () => {
    const html = renderBlock(exampleRow, context('light'));
    expect(html).toContain(
      'style="grid-template-columns:repeat(4, 300px);gap:22px;justify-content:space-between"',
    );
    expect(renderBlock(plateRow, context('light'))).toContain(
      'style="grid-template-columns:28px 1fr;gap:18px;align-items:start"',
    );
    expect(renderBlock(plateRow, context('light'))).not.toContain('justify-content');
  });

  it('renders a captioned composite as a figure in the shot form with the caption spanning', () => {
    const html = renderBlock(rig, context('light'));
    expect(html.startsWith('<figure class="composite shot-fig"')).toBe(true);
    expect(html).toContain('<figcaption data-run="rig/caption" style="grid-column:1 / -1">');
    expect(html).toContain('same-origin iframes.</figcaption></figure>');
  });

  it('makes a lone block the grid item and wraps a spanning cell', () => {
    const html = renderBlock(plateRow, context('light'));
    expect(html).toContain('<svg class="dia ic info" data-block="lock"');
    expect(html).toContain('<div class="cell" style="grid-column:span 1">');
  });

  it('hands every cell its width so a nested slot-fit diagram takes the track', () => {
    const block: Block = {
      id: 'g',
      type: 'composite',
      tracks: '1fr 1fr',
      gap: 48,
      cells: [
        {
          blocks: [
            {
              id: 'd',
              type: 'dia',
              fit: 'slot',
              alt: '',
              data: layersTemplate({ w: 639, layers: [{ label: 'A' }] }),
            },
          ],
        },
        { blocks: [{ id: 'p', type: 'paragraph', text: 'Right.' }] },
      ],
    };
    const html = renderBlock(block, context('light', 1326));
    expect(html).toContain('viewBox="0 0 639 62.5"');
    expect(cellWidths(block, 1326)).toEqual([639, 639]);
  });
});

describe('track arithmetic', () => {
  it('parses px, fr, minmax and repeat tracks', () => {
    expect(parseTracks('repeat(4, 300px)')).toEqual(Array(4).fill({ kind: 'px', px: 300 }));
    expect(parseTracks('692px minmax(0, 1fr)')).toEqual([
      { kind: 'px', px: 692 },
      { kind: 'fr', fr: 1 },
    ]);
    expect(parseTracks('auto 1fr')[0]).toEqual({ kind: 'auto' });
  });

  it('shares the free width among fr tracks after the fixed ones and the gaps', () => {
    expect(trackWidths('692px 1fr', 1326, 72)).toEqual([692, 562]);
    expect(trackWidths('1fr 1fr', 1326, 72)).toEqual([627, 627]);
    expect(trackWidths('repeat(4, 300px)', 1326, 22)).toEqual([300, 300, 300, 300]);
    expect(trackWidths('auto 1fr', 1326)).toBeUndefined();
  });

  it('spans add tracks and gaps, and cells wrap to the next row', () => {
    const block = {
      tracks: '1fr 1fr 1fr',
      gap: 10,
      cells: [{ blocks: [], span: 2 }, { blocks: [] }, { blocks: [] }],
    };
    expect(cellWidths(block, 320)).toEqual([210, 100, 100]);
    expect(cellWidths(block, undefined)).toEqual([undefined, undefined, undefined]);
  });
});

describe('dia templates', () => {
  for (const id of DIA_TEMPLATE_IDS) {
    it(`${id}: the slide 25 example at 300 units validates and snapshots`, () => {
      const data = diaTemplateExample(id, 300);
      expect(diagramSchema.safeParse(data).success).toBe(true);
      expect(data).toMatchSnapshot();
      expect(diagramBody(data, true)).toMatchSnapshot(`${id}-svg`);
    });
  }

  it('puts every 1 px stroke on the half pixel and every label at least 12 units clear', () => {
    for (const id of DIA_TEMPLATE_IDS) {
      const data = diaTemplateExample(id, 627);
      for (const line of data.lines) {
        if ((line.width ?? 1) !== 1) continue;
        if (line.x1 === line.x2) expect(line.x1 % 1).toBe(0.5);
        if (line.y1 === line.y2) expect(line.y1 % 1).toBe(0.5);
      }
      for (const rect of data.rects) {
        if (!rect.stroke) continue;
        expect(rect.x % 1).toBe(0.5);
        expect(rect.y % 1).toBe(0.5);
      }
      data.texts.forEach((_text, i) => {
        expect(labelClearance(data, i).ok, `${id} label ${i}`).toBe(true);
      });
    }
  });

  it('draws the isometric plate with the deck faces, the mid outline and the seated mark', () => {
    const data = isoPlateTemplate({ w: 300, mark: true, title: 'An isometric plate' });
    expect(data.polygons?.map((p) => p.opacity)).toEqual([0.04, 0.15, 0.09, undefined]);
    expect(data.polygons?.[0]?.points).toEqual([
      [150, 8],
      [270, 77.28],
      [150, 146.56],
      [30, 77.28],
    ]);
    expect(data.marks[0]).toMatchObject({ x: 150, w: 84, h: 54, iso: true });
    expect(data.texts.at(-1)).toEqual({ x: 0, y: 204, text: 'An isometric plate', size: 20 });
    const svg = diagramBody(data);
    expect(svg).toContain(
      '<polygon points="150,8 270,77.28 150,146.56 30,77.28" fill="var(--ink)" fill-opacity="0.04"/>',
    );
    expect(svg).toContain('scale(1 0.5) rotate(45)');
  });

  it('tags markers and texts with their data pointers when block attributes are on', () => {
    const data = diaTemplateExample('flow', 300);
    const tagged = diagramBody(data, true);
    expect(tagged).toContain('class="marker"');
    expect(tagged).toContain('data-dia="markers/0"');
    expect(tagged).toContain('data-dia="texts/0"');
    expect(diagramBody(data, false)).not.toContain('data-dia');
  });
});

describe('the half-pixel grid', () => {
  it('snaps values and strokes', () => {
    expect(snapHalf(12.3)).toBe(12.5);
    expect(snapHalf(12.2)).toBe(12);
    expect(snapStroke(70)).toBe(70.5);
    expect(snapStroke(70.6)).toBe(70.5);
    expect(snapFor(70, 1)).toBe(70.5);
    expect(snapFor(70.3, 1.5)).toBe(70.5);
  });

  it('measures clearance against lines, stroked rects, polygons and markers', () => {
    const data: Diagram = {
      w: 300,
      h: 100,
      lines: [{ x1: 0, y1: 50.5, x2: 300, y2: 50.5, stroke: 'hair' }],
      rects: [{ x: 0.5, y: 0.5, w: 100, h: 40, fill: 'none', stroke: 'hair' }],
      markers: [{ x: 200, y: 50.5 }],
      texts: [
        { x: 0, y: 30, text: 'Near the line', size: 20 },
        { x: 0, y: 90, text: 'Clear', size: 20 },
      ],
      icons: [],
      marks: [],
      polygons: [
        {
          points: [
            [250, 60],
            [290, 60],
            [270, 95],
          ],
          fill: 'ink',
          stroke: 'mid',
        },
      ],
    };
    expect(strokeSegments(data)).toHaveLength(1 + 4 + 3);
    expect(labelClearance(data, 0).ok).toBe(false);
    expect(labelClearance(data, 1).ok).toBe(true);
    expect(unitsPerPixel('slot', data, 731.5)).toBe(1);
    expect(unitsPerPixel({ viewBox: [0, 0, 300, 100] }, data, 600)).toBe(0.5);
  });
});
