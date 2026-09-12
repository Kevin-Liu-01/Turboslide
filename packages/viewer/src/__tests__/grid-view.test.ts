import { describe, expect, it } from 'vitest';

import { GRID_TILE_SIZES, gridMoveTarget, stepTile } from '../GridView';

// Grid view in the editor (gslides-parity SPEC 4.4): the tile ladder and the slide.move a drop stands for.
describe('grid view', () => {
  const deck = {
    sections: [
      { id: 'a', name: 'A', slideIds: ['s1', 's2', 's3'] },
      { id: 'b', name: 'B', slideIds: ['s4'] },
    ],
  };

  it('steps the tile size along the ladder and stops at the ends', () => {
    expect(GRID_TILE_SIZES).toEqual([200, 300, 400]);
    expect(stepTile(300, 1)).toBe(400);
    expect(stepTile(400, 1)).toBe(400);
    expect(stepTile(300, -1)).toBe(200);
    expect(stepTile(200, -1)).toBe(200);
  });

  it('turns a drop before or after a tile into the slide.move target, the dragged tiles left out', () => {
    expect(gridMoveTarget(deck, ['s1'], { id: 's3', half: 'after' })).toEqual({
      sectionId: 'a',
      after: 's3',
    });
    expect(gridMoveTarget(deck, ['s3'], { id: 's1', half: 'before' })).toEqual({ sectionId: 'a' });
    expect(gridMoveTarget(deck, ['s1'], { id: 's3', half: 'before' })).toEqual({
      sectionId: 'a',
      after: 's2',
    });
    expect(gridMoveTarget(deck, ['s1', 's2'], { id: 's4', half: 'before' })).toEqual({
      sectionId: 'b',
    });
    expect(gridMoveTarget(deck, ['s1'], { id: 's1', half: 'before' })).toBeNull();
    expect(gridMoveTarget(deck, ['s1'], { id: 'zzz', half: 'before' })).toBeNull();
  });
});
