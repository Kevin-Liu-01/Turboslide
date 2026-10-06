// The Theme panel's library (docs/DESIGN.md 7.6 items 2 and 3): the two slides every tile draws
// and the words of the kit row under In this presentation.
import { describe, expect, it } from 'vitest';

import { slideOrder } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { kitSummary, tileSlides } from '../ThemesPanel';

describe('the theme library', () => {
  it('draws the deck’s first title slide and first body slide', () => {
    const document = workedDocument();
    const [title, body] = tileSlides(document);
    const order = slideOrder(document.deck).map((id) => document.slides[id]);
    expect(title?.id).toBe(order.find((slide) => slide?.kind === 'title')?.id);
    expect(body?.id).toBe(order.find((slide) => slide?.kind === 'content')?.id);
  });

  it('draws the layouts’ empty placeholders for a deck without a body slide', () => {
    const document = workedDocument();
    const first = slideOrder(document.deck).find((id) => document.slides[id]?.kind === 'title')!;
    const only = {
      ...document,
      deck: {
        ...document.deck,
        sections: [{ ...document.deck.sections[0]!, slideIds: [first] }],
      },
    };
    const slides = tileSlides(only);
    expect(slides.map((slide) => slide.kind)).toEqual(['title', 'content']);
    expect(slides[1]?.id).toBe('ts-theme-body');
  });

  it('names what the kit sets, or nothing for an empty kit', () => {
    expect(kitSummary(undefined)).toBeNull();
    expect(kitSummary({})).toBeNull();
    expect(
      kitSummary({
        colors: { light: { primary: '#0b3d91' }, dark: { primary: '#5b8def', accent: '#ff5a4f' } },
        mark: { kind: 'none' },
        frame: { rails: true },
      }),
    ).toBe('2 colors, logo, frame');
    expect(kitSummary({ colors: { light: { text: '#111111' } } })).toBe('1 color');
  });
});
