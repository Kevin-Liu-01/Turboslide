// The dia rules over declared data (SPEC 7.7; MILESTONES M5 item 4): a diagram nested in a
// composite cell is linted as itself with the cell's width, polygons and markers count as strokes
// for the label clearance, stroked rects join the half-pixel rule, and a composite is transparent
// for the export listing.
import { describe, expect, it } from 'vitest';

import type { Deck, DeckDocument, Slide } from '../contracts.ts';
import { createContext } from '../context.ts';
import { lintStatic } from '../lint-static.ts';
import { checkDia } from './dia.ts';
import { classifyBlock } from './export-non-native.ts';

const deck: Deck = {
  schemaVersion: 1,
  id: 'fixture',
  title: 'Fixture',
  theme: 'gt-ink-paper',
  sections: [{ id: 'one', name: 'One', slideIds: ['grid'] }],
  assets: {},
  revision: 1,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
};

const slide: Slide = {
  schemaVersion: 1,
  id: 'grid',
  kind: 'content',
  layout: { type: 'stack' },
  slots: {
    main: [
      {
        id: 'group',
        type: 'composite',
        tracks: '1fr 1fr',
        gap: 48,
        cells: [
          {
            blocks: [
              {
                id: 'dia1',
                type: 'dia',
                // the viewBox names the whole slot, the cell is 639 wide: dia/fit-slot
                fit: { viewBox: [0, 0, 1326, 160] },
                alt: 'A bench',
                data: {
                  w: 1326,
                  h: 160,
                  lines: [{ x1: 0, y1: 128, x2: 639, y2: 128, stroke: 'hair' }],
                  rects: [{ x: 10, y: 10, w: 100, h: 40, fill: 'none', stroke: 'hair' }],
                  markers: [{ x: 300, y: 128.5 }],
                  texts: [
                    { x: 300, y: 118, text: 'On the marker', size: 20, anchor: 'middle' },
                    { x: 500, y: 60, text: 'Clear', size: 20 },
                  ],
                  icons: [],
                  marks: [],
                  polygons: [
                    {
                      points: [
                        [480, 30],
                        [560, 30],
                        [520, 90],
                      ],
                      fill: 'ink',
                      stroke: 'mid',
                    },
                  ],
                },
              },
            ],
          },
          { blocks: [{ id: 'p', type: 'paragraph', text: 'Right.' }] },
        ],
      },
    ],
  },
};

const document: DeckDocument = { deck, slides: { grid: slide } };

describe('dia rules over a nested declared diagram', () => {
  const findings = checkDia(createContext(document));
  const rules = findings.map((f) => f.rule);

  it('measures fit-slot against the composite cell width', () => {
    const fit = findings.find((f) => f.rule === 'dia/fit-slot');
    expect(fit?.evidence.measured).toEqual({ viewBoxWidth: 1326, slotWidth: 639 });
    expect(fit?.path).toBe('/slots/main/0/cells/0/blocks/0/fit');
    expect(fit?.fix).toEqual([
      { op: 'block.set', slideId: 'grid', blockId: 'dia1', path: '/fit', value: 'slot' },
    ]);
  });

  it('puts the integer line and the stroked rect corner on the half pixel', () => {
    const half = findings.find((f) => f.rule === 'dia/half-pixel');
    expect(half?.evidence.text).toBe('rect 0 x 10; rect 0 y 10; line 0 y 128');
    expect(half?.fix?.map((m) => (m.op === 'block.set' ? m.path : undefined))).toEqual([
      '/data/rects/0/x',
      '/data/rects/0/y',
      '/data/lines/0/y1',
      '/data/lines/0/y2',
    ]);
  });

  it('flags the label over the marker and clears the label near the polygon edge', () => {
    const clearance = findings.filter((f) => f.rule === 'dia/label-clearance');
    expect(clearance.map((f) => f.evidence.text)).toEqual(['On the marker', 'Clear']);
    expect(clearance[1]?.evidence.measured?.clearance).toBeLessThan(12);
    expect(rules.filter((r) => r === 'dia/label-clearance')).toHaveLength(2);
  });

  it('lists the nested blocks in the static run with their cell paths', () => {
    const all = lintStatic(document, { rules: ['dia/fit-slot', 'export/non-native'] });
    expect(all.some((f) => f.rule === 'dia/fit-slot' && f.blockId === 'dia1')).toBe(true);
    const listing = all.find((f) => f.rule === 'export/non-native');
    expect(listing?.proposal).toContain('dia1 (dia)');
    expect(listing?.proposal).not.toContain('group (composite)');
  });

  it('treats a composite as transparent for the export listing', () => {
    expect(
      classifyBlock(slide.kind === 'content' ? (slide.slots.main?.[0] as never) : (slide as never)),
    ).toEqual({
      blockId: 'group',
      type: 'composite',
      native: true,
      parts: [],
    });
  });
});
