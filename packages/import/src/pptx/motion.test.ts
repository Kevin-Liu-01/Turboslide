// The transition fold and the animation reading (gslides-parity SPEC-5 5.1; R01 6.6; R04 5.8):
// every ISO and p14 transition name onto Google's seven, the durations from `p14:dur` and `spd`,
// the Fly In side from the subtype bits, and the timing tree of fixture 04.
import { describe, expect, it } from 'vitest';

import { flyDirection, foldTransition } from './motion.ts';
import { parseXml } from './xml.ts';

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';

function transition(inner: string, attrs = ''): ReturnType<typeof foldTransition> {
  const { root } = parseXml(
    `<p:transition xmlns:p="${P}" xmlns:p14="${P14}" ${attrs}>${inner}</p:transition>`,
    'test',
  );
  return foldTransition(root);
}

describe('foldTransition', () => {
  it.each([
    ['<p:fade/>', 'fade', true],
    ['<p:cut/>', 'fade', true],
    ['<p:dissolve/>', 'dissolve', true],
    ['<p:randomBar/>', 'dissolve', false],
    ['<p:checker/>', 'dissolve', false],
    ['<p:blinds/>', 'dissolve', false],
    ['<p:random/>', 'dissolve', false],
    ['<p:wipe dir="l"/>', 'dissolve', false],
    ['<p:push dir="l"/>', 'slideRight', true],
    ['<p:push dir="r"/>', 'slideLeft', true],
    ['<p:cover dir="l"/>', 'slideRight', true],
    ['<p:cover dir="u"/>', 'slideRight', false],
    ['<p:push dir="d"/>', 'slideLeft', false],
    ['<p14:flip dir="l"/>', 'flip', true],
    ['<p14:switch dir="l"/>', 'flip', false],
    ['<p14:prism/>', 'cube', true],
    ['<p14:doors/>', 'cube', false],
    ['<p14:window/>', 'cube', false],
    ['<p14:gallery/>', 'gallery', true],
    ['<p14:conveyor/>', 'gallery', false],
    ['<p14:vortex/>', 'fade', false],
    ['<p:comb/>', 'dissolve', false],
    ['<p:zoom/>', 'dissolve', false],
    ['<p:newsflash/>', 'dissolve', false],
    ['<p:wedge/>', 'dissolve', false],
  ] as const)('%s folds to %s (exact %s)', (inner, kind, exact) => {
    const reading = transition(inner);
    expect(reading?.transition.kind).toBe(kind);
    expect(reading?.exact).toBe(exact);
  });

  it('reads the duration from p14:dur first, then spd (fast 500, med 750, slow 1000)', () => {
    expect(transition('<p:fade/>', 'spd="fast"')?.transition.durationMs).toBe(500);
    expect(transition('<p:fade/>', 'spd="med"')?.transition.durationMs).toBe(750);
    expect(transition('<p:fade/>', 'spd="slow"')?.transition.durationMs).toBe(1000);
    expect(transition('<p:fade/>')?.transition.durationMs).toBe(500);
    expect(transition('<p14:flip/>', 'spd="slow" p14:dur="1250"')?.transition.durationMs).toBe(
      1250,
    );
    expect(transition('<p:fade/>', 'p14:dur="20"')?.transition.durationMs).toBe(100);
    expect(transition('<p:fade/>', 'p14:dur="9000"')?.transition.durationMs).toBe(5000);
  });

  it('reports a fade through black and names the vertical direction that folded', () => {
    expect(transition('<p:fade thruBlk="1"/>')?.note).toBe('A fade through black became a fade');
    expect(transition('<p:push dir="u"/>')?.note).toContain('direction u');
  });

  it('reads an empty transition element as a fade', () => {
    expect(transition('')?.transition).toEqual({ kind: 'fade', durationMs: 500 });
  });
});

describe('flyDirection', () => {
  it('reads PowerPoint’s direction bits', () => {
    expect(flyDirection(8, false)).toBe('left');
    expect(flyDirection(2, false)).toBe('right');
    expect(flyDirection(1, false)).toBe('top');
    expect(flyDirection(4, false)).toBe('bottom');
    expect(flyDirection(0, false)).toBe('bottom');
    expect(flyDirection(9, false)).toBe('left');
  });
});
