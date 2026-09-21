import { describe, expect, it } from 'vitest';

import { lineBoundaryKey, popoverLink, popoverSlideOf, SLIDE_LINK_POSITIONS } from '../InlineText';

// The link popover's pure rules (docs/PRODUCT.md section 2 rank 19) and the line boundary keys
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
