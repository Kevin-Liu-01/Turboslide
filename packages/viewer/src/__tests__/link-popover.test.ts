import { describe, expect, it } from 'vitest';

import {
  lineBoundaryKey,
  POPOVER_MARGIN,
  popoverLink,
  popoverPlace,
  popoverSlideOf,
  SLIDE_LINK_POSITIONS,
} from '../InlineText';

// The link popover's pure rules (docs/archive/rounds/PRODUCT.md section 2 rank 19) and the line boundary keys
// (rank 18): what the two controls write, what an existing link preselects, which keys the
// session moves to the visual line's ends itself.

describe('popoverLink', () => {
  it('writes a slide link for a picked slide or position, else the completed address, else none', () => {
    expect(popoverLink('', 'pricing')).toBe('#s/pricing');
    expect(popoverLink('acme.com', 'next')).toBe('#next');
    expect(popoverLink('acme.com', '')).toBe('https://acme.com');
    expect(popoverLink('mailto:kevin@acme.com', '')).toBe('mailto:kevin@acme.com');
    expect(popoverLink('   ', '')).toBeNull();
  });

  it('reads the select value of an existing link back', () => {
    expect(popoverSlideOf('#s/pricing')).toBe('pricing');
    expect(popoverSlideOf('#last')).toBe('last');
    expect(popoverSlideOf('https://acme.com')).toBe('');
    expect(popoverSlideOf(null)).toBe('');
    expect(SLIDE_LINK_POSITIONS.map((row) => row.value)).toEqual([
      'next',
      'previous',
      'first',
      'last',
    ]);
  });
});

describe('lineBoundaryKey', () => {
  it('takes Home and End without a modifier and leaves the rest to the browser', () => {
    expect(lineBoundaryKey('Home', false, false)).toEqual({ direction: 'backward' });
    expect(lineBoundaryKey('End', false, false)).toEqual({ direction: 'forward' });
    expect(lineBoundaryKey('Home', true, false)).toBeNull();
    expect(lineBoundaryKey('End', false, true)).toBeNull();
    expect(lineBoundaryKey('ArrowLeft', false, false)).toBeNull();
  });
});

// The popover's place in the window (the dropdown round's last visual pass, F7, and its note on the
// phone): measured from its offset parent, the overlay over the sheet, with its drawn size, it
// keeps 8 px from both edges. Before, the stage's box stood in for the overlay's and the width was
// taken as 560 px: at 1440 the row spanned 909 to 1472, and at 390 Apply and Remove stood past the
// window's right edge.
describe('popoverPlace', () => {
  const view = { width: 1440, height: 900 };
  const inWindow = (place: { left: number }, origin: { left: number }, width: number) => ({
    left: origin.left + place.left,
    right: origin.left + place.left + width,
  });

  it('keeps a popover near the right edge 8 px inside it, measured from the overlay', () => {
    const origin = { left: 309, top: 64 };
    const place = popoverPlace({
      anchor: [600, 820, 640, 100],
      k: 1,
      width: 563,
      height: 74,
      origin,
      view,
    });
    expect(inWindow(place, origin, 563)).toEqual({
      left: 1440 - POPOVER_MARGIN - 563,
      right: 1432,
    });
  });

  it('stands a phone width popover 8 px inside both edges, under the run, past the overlay left edge', () => {
    const origin = { left: 21, top: 160 };
    const phone = { width: 390, height: 844 };
    const place = popoverPlace({
      anchor: [700, 820, 640, 100],
      k: 0.18,
      width: 374,
      height: 112,
      origin,
      view: phone,
    });
    expect(inWindow(place, origin, 374)).toEqual({ left: 8, right: 382 });
    expect(place.top).toBeCloseTo(920 * 0.18 + 6);
  });

  it('keeps the left edge when the plate is wider than the window, and goes above only with room above', () => {
    const origin = { left: 0, top: 0 };
    expect(
      popoverPlace({ anchor: [10, 10, 100, 20], k: 1, width: 2000, height: 74, origin, view }).left,
    ).toBe(8);
    /* the window ends under the run and the sheet has room above: above */
    expect(
      popoverPlace({ anchor: [10, 850, 100, 20], k: 1, width: 300, height: 74, origin, view }).top,
    ).toBe(850 - 74 - 6);
    /* no room above the run inside the sheet: below even past the window's end */
    expect(
      popoverPlace({ anchor: [10, 40, 100, 850], k: 1, width: 300, height: 74, origin, view }).top,
    ).toBe(896);
  });
});
