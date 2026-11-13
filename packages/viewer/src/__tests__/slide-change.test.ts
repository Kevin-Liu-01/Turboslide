import { describe, expect, it } from 'vitest';

import { arrived, changePhases, nextChange, showsPicture } from '../slide-change';
import type { ShownSlide, SlideChange } from '../slide-change';

// The slide change of a stage (the slide motion round): the leaving slide holds under the
// arriving one until the arrival has entered, a move during an entrance is a cut, and a move
// into or out of a full-picture slide moves the pictures and the bodies in phases that never
// leave both layers part transparent over the same pixel.

const content = (id: string, html = `<p>${id}</p>`): ShownSlide => ({
  id,
  html,
  picture: undefined,
});
const picture = (id: string): ShownSlide => ({ id, html: `<p>${id}</p>`, picture: `/${id}.jpg` });

describe('nextChange', () => {
  it('shows the first slide with nothing leaving', () => {
    expect(nextChange(null, content('a'))).toEqual({
      current: content('a'),
      leaving: null,
      cut: false,
      seq: 0,
    });
    expect(nextChange(null, undefined)).toBeNull();
  });

  it('keeps the slide a move left under the arriving one', () => {
    const first = nextChange(null, content('a'));
    const moved = nextChange(first, content('b'));
    expect(moved).toEqual({ current: content('b'), leaving: content('a'), cut: false, seq: 1 });
  });

  it('cuts a move that comes while the slide before it is still entering', () => {
    const moved = nextChange(nextChange(null, content('a')), content('b'));
    const quick = nextChange(moved, content('c'));
    expect(quick).toEqual({ current: content('c'), leaving: null, cut: true, seq: 2 });
    /* once that slide has entered, the next move holds again */
    const later = nextChange(arrived(nextChange(quick, content('d')), 3), content('e'));
    expect(later?.cut).toBe(false);
    expect(later?.leaving?.id).toBe('d');
  });

  it('renders the same slide again in place: an edit or a theme is no move', () => {
    const first = nextChange(null, content('a'));
    expect(nextChange(first, content('a'))).toBe(first);
    const edited = nextChange(first, content('a', '<p>edited</p>'));
    expect(edited).toEqual({ ...first, current: content('a', '<p>edited</p>') });
  });
});

describe('arrived', () => {
  it('takes the leaving slide of its own move and never a later one', () => {
    const moved = nextChange(nextChange(null, content('a')), content('b')) as SlideChange;
    expect(arrived(moved, 1)?.leaving).toBeNull();
    expect(arrived(moved, 0)).toBe(moved);
  });
});

describe('changePhases', () => {
  const move = (from: ShownSlide, to: ShownSlide) =>
    nextChange(nextChange(null, from), to) as SlideChange;

  it('holds a content slide under a content slide and moves nothing else', () => {
    expect(changePhases(move(content('a'), content('b')))).toEqual({
      leavingBody: 'hold',
      leavingPicture: null,
      currentPicture: null,
    });
  });

  it('brings a picture in over the first half and uncovers it over the second', () => {
    expect(changePhases(move(content('a'), picture('p')))).toEqual({
      leavingBody: 'late',
      leavingPicture: null,
      currentPicture: 'early',
    });
  });

  it('lets a picture go over the second half under the arriving paper', () => {
    expect(changePhases(move(picture('p'), content('a')))).toEqual({
      leavingBody: 'hold',
      leavingPicture: 'late',
      currentPicture: null,
    });
  });

  it('crosses two pictures and their text over the whole change', () => {
    expect(changePhases(move(picture('p'), picture('q')))).toEqual({
      leavingBody: 'all',
      leavingPicture: 'hold',
      currentPicture: 'all',
    });
  });

  it('shows a picture still when nothing leaves (the first slide, a cut)', () => {
    expect(changePhases(nextChange(null, picture('p'))).currentPicture).toBe('still');
  });

  it('keeps the stage in its picture state while a picture slide is still leaving', () => {
    const out = move(picture('p'), content('a'));
    expect(showsPicture(out)).toBe(true);
    expect(showsPicture(arrived(out, out.seq))).toBe(false);
  });
});
