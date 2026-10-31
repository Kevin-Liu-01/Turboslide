import { describe, expect, it } from 'vitest';

import {
  PRESENT_DECK_TITLE,
  PRESENT_DECK_TOTAL,
  PRESENT_LAST,
  PRESENT_SLIDES,
} from './present-deck';

// The Present screen's slides (present-deck.ts) are the landing deck's own: its title, its slide
// count, and the first four slides with their speaker notes, then the lighthouse as the last
// preview.

describe('the Present screen’s deck', () => {
  it('reads the deck’s title and count', () => {
    expect(PRESENT_DECK_TITLE).toBe('Onboarding plan');
    expect(PRESENT_DECK_TOTAL).toBe(8);
  });

  it('walks four slides with their notes, then previews the lighthouse', () => {
    expect(PRESENT_SLIDES.map((slide) => `${slide.id}:${slide.kind}`)).toEqual([
      'title:title',
      'plan:rows',
      'gets:rows',
      'ships:statement',
      'lighthouse:mood',
    ]);
    expect(PRESENT_LAST).toBe(3);
    for (const slide of PRESENT_SLIDES.slice(0, PRESENT_LAST + 1)) {
      expect(slide.heading, slide.id).not.toBe('');
      expect(slide.notes, slide.id).not.toBe('');
    }
    const plan = PRESENT_SLIDES[1];
    expect(plan?.kind === 'rows' ? plan.rows.length : 0).toBe(4);
    expect(PRESENT_SLIDES[4]?.heading).toBe('Cape Hatteras Light');
  });
});
