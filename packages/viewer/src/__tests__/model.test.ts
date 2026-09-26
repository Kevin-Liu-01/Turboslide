import { describe, expect, it } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { LINE_KINDS, LINE_KIND_LABELS } from '@turboslide/schema/shapes';

import { blockDisplayName } from '../Selection';
import { pad2, trimTitle } from '../model';

// The chip's name for a line shape (docs/OBJECTS.md 4.2 item 5, the row `lines.chip.kind-name`;
// 6.4 names this file for `blockDisplayName`, which lives in Selection.tsx beside the selection
// model): each of the seven line kinds reads Google's word for the tool that drew it, a closed
// preset stays Shape, and the deck model's small helpers hold their shape.

const slide: Slide = {
  schemaVersion: 1,
  id: 's',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      ...LINE_KINDS.map((kind, index) => ({
        id: `l-${kind}`,
        type: 'shape' as const,
        shape: kind,
        stroke: 'ink' as const,
        width: 1.5 as const,
        pos: { x: 100, y: 100 + index * 40, w: 300, h: 8, z: index },
      })),
      {
        id: 'box',
        type: 'shape',
        shape: 'rect',
        fill: 'plate',
        pos: { x: 500, y: 100, w: 240, h: 160, z: 10 },
      },
      {
        id: 'star',
        type: 'shape',
        shape: 'star5',
        fill: 'plate',
        pos: { x: 800, y: 100, w: 240, h: 160, z: 11 },
      },
      {
        id: 'legacy-arrow',
        type: 'shape',
        shape: 'arrow',
        stroke: 'ink',
        width: 1.5,
        pos: { x: 100, y: 500, w: 300, h: 8, z: 12 },
      },
    ],
  },
};

describe('blockDisplayName for the line kinds', () => {
  it('names each of the seven line kinds as the tool that drew it', () => {
    expect(LINE_KINDS.map((kind) => blockDisplayName(slide, `l-${kind}`))).toEqual([
      'Line',
      'Arrow',
      'Elbow connector',
      'Curved connector',
      'Curve',
      'Polyline',
      'Scribble',
    ]);
    for (const kind of LINE_KINDS)
      expect(blockDisplayName(slide, `l-${kind}`)).toBe(LINE_KIND_LABELS[kind]);
  });

  it('keeps Shape for a closed preset', () => {
    expect(blockDisplayName(slide, 'box')).toBe('Shape');
    expect(blockDisplayName(slide, 'star')).toBe('Shape');
    expect(blockDisplayName(slide, 'legacy-arrow')).toBe('Arrow');
  });
});

describe('the deck model helpers', () => {
  it('pads a slide number to two digits and trims a title at a word', () => {
    expect(pad2(1)).toBe('01');
    expect(pad2(52)).toBe('52');
    expect(trimTitle('  A   title ')).toBe('A title');
    const long = Array.from({ length: 20 }, () => 'word').join(' ');
    expect(trimTitle(long).length).toBeLessThanOrEqual(72);
    expect(trimTitle(long).endsWith('...')).toBe(true);
  });
});
