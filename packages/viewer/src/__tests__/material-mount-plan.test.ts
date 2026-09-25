// The one live mount rule of the stage (docs/FEATURES.md 5.6; the fix round of ship two,
// verification F.5 items 1 and 4): the selected shader block plays and every other block draws
// its frame; with no shader selected one frameless block mounts a still and a second frameless
// block draws its plate, so two blocks whose frames are pending are one canvas, never two; a
// stage handed no selection plays every root as before the round. `raiseCanvas` puts a mount's
// canvas above the frame it covers, which Paper's own stylesheet lays under it.
import { describe, expect, it } from 'vitest';

import type { MaterialHandle } from '@turboslide/materials/mount';

import { planMounts, raiseCanvas } from '../MaterialMount';

describe('planMounts', () => {
  it('plays the selected block alone and lets every other block draw its frame or its plate', () => {
    expect(
      planMounts(
        [
          { id: 'a', hasFrame: true },
          { id: 'b', hasFrame: false },
          { id: 'c', hasFrame: false },
        ],
        ['b'],
      ),
    ).toEqual(['frame', 'play', 'frame']);
    // the selected block already has a frame: the frameless one still draws its plate
    expect(
      planMounts(
        [
          { id: 'a', hasFrame: true },
          { id: 'b', hasFrame: false },
        ],
        ['a'],
      ),
    ).toEqual(['play', 'frame']);
  });

  it('mounts one still for the first frameless block when no shader is selected', () => {
    expect(
      planMounts(
        [
          { id: 'a', hasFrame: true },
          { id: 'b', hasFrame: false },
          { id: 'c', hasFrame: false },
        ],
        [],
      ),
    ).toEqual(['frame', 'still', 'frame']);
    expect(
      planMounts(
        [
          { id: 'a', hasFrame: false },
          { id: 'b', hasFrame: false },
        ],
        ['text-1'],
      ),
    ).toEqual(['still', 'frame']);
    expect(planMounts([{ id: 'a', hasFrame: true }], null)).toEqual(['frame']);
  });

  it('plays every root when the stage passes no selection, as before the round', () => {
    expect(
      planMounts(
        [
          { id: 'a', hasFrame: true },
          { id: null, hasFrame: false },
        ],
        undefined,
      ),
    ).toEqual(['play', 'play']);
  });

  it('never holds more than one canvas while frames are pending', () => {
    const roots = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, hasFrame: false }));
    for (const selected of [[], ['s3'], ['other'], null] as const) {
      const plans = planMounts(roots, selected);
      expect(plans.filter((plan) => plan !== 'frame').length, JSON.stringify(selected)).toBe(1);
    }
  });
});

describe('raiseCanvas', () => {
  it('sets the canvas z-index above the flow and tolerates a handle without one', () => {
    const style: { zIndex: string } = { zIndex: '' };
    raiseCanvas({ canvas: () => ({ style }) } as unknown as MaterialHandle);
    expect(style.zIndex).toBe('0');
    expect(() =>
      raiseCanvas({
        canvas: () => {
          throw new Error('no canvas');
        },
      } as unknown as MaterialHandle),
    ).not.toThrow();
  });
});
