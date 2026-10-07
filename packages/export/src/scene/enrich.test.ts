// The PowerPoint shadow and outline colours of a token (docs/DESIGN.md 7.5, G12): the deck's
// theme under its kit, composited on the theme's paper; General Translation's sheet without a deck.
import { describe, expect, it } from 'vitest';
import type { Deck } from '@turboslide/schema/deck';
import { colorHexFor, sceneShadow } from './enrich.ts';

function deck(theme: Deck['theme'], brand?: Deck['brand']): Pick<Deck, 'theme' | 'brand'> {
  return { theme, ...(brand === undefined ? {} : { brand }) };
}

describe('colorHexFor', () => {
  it('reads the sheet without a deck and General Translation the same', () => {
    expect(colorHexFor('ink', 'dark')).toBe('F2F2F0');
    expect(colorHexFor('ink', 'dark', deck('general-translation'))).toBe('F2F2F0');
    expect(colorHexFor('hair', 'dark', deck('gt-ink-paper'))).toBe('3B3B3A');
  });

  it('reads the deck theme and composites on its paper', () => {
    expect(colorHexFor('ink', 'dark', deck('swiss'))).toBe('F4F4F2');
    // rgba(244, 244, 242, 0.22) over #111111
    expect(colorHexFor('hair', 'dark', deck('swiss'))).toBe('434343');
    expect(colorHexFor('ink', 'light', deck('mint'))).toBe('0D271D');
  });

  it('reads the kit over the theme and leaves a hex and a semantic hue alone', () => {
    expect(
      colorHexFor('ink', 'light', deck('swiss', { colors: { light: { text: '#0b3d91' } } })),
    ).toBe('0B3D91');
    expect(colorHexFor('#aa3366', 'light', deck('swiss'))).toBe('AA3366');
    expect(colorHexFor('green', 'dark', deck('swiss'))).toBe('12A37A');
    expect(sceneShadow({ color: 'ink' }, 'dark', deck('night')).colorHex).toBe('EDF1F7');
  });

  it("reads the blue token as the deck's Primary, as the stage draws it", () => {
    expect(colorHexFor('blue', 'light')).toBe('2F5CE0');
    expect(colorHexFor('blue', 'dark', deck('general-translation'))).toBe('2F5CE0');
    expect(colorHexFor('blue', 'light', deck('mint'))).toBe('11734F');
    expect(colorHexFor('blue', 'dark', deck('mint'))).toBe('4CC59A');
    expect(sceneShadow({ color: 'blue' }, 'light', deck('mint')).colorHex).toBe('11734F');
    expect(
      colorHexFor('blue', 'light', deck('mint', { colors: { light: { primary: '#0b3d91' } } })),
    ).toBe('0B3D91');
  });
});
