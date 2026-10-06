// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { LIVE_SLIDE_HTML } from '../bands/live.generated';
import { HOME_DECK } from '../deck.generated';
import { HOME_SLIDE_MARKUP } from '../bands/deck.generated';
import { cloneSlide, dropPrompts } from './show';
import { baseState } from './state';
import type { HomeDeckState } from './state';
import { paintStep } from './versions';

/*
 * A shown or printed slide draws no prompt (verify-landing.md finding 2): after a restore of
 * recorded version 2, slide 5 holds the layout's empty placeholders as the recorded render draws
 * them on the editor stage, "Click to add title" and seven "Click to add text". The product's
 * Slideshow and print render with prompts off, so the show's and the print's copy of the slide
 * draws none, while the band's own slide keeps them.
 */

vi.hoisted(() => {
  // jsdom has no matchMedia; the motion module reads it when it loads
  const query = (media: string): MediaQueryList =>
    ({
      media,
      matches: false,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', { value: query, configurable: true });
});

/** The page with slide 5 drawn as recorded version 2 left it (the layout's placeholders). */
function pageWithPlaceholders(): HTMLElement {
  document.body.innerHTML = `<main><div class="ts-home-sheet">${LIVE_SLIDE_HTML.nextSteps.placeholders}</div></main>`;
  const main = document.querySelector('main');
  if (main === null) throw new Error('no main');
  return main;
}

describe('the show and the print draw no prompt', () => {
  it('reads the recorded placeholders render with its eight prompts', () => {
    const main = pageWithPlaceholders();
    const prompts = [...main.querySelectorAll('[data-prompt]')].map((el) => el.textContent);
    expect(prompts).toEqual(['Click to add title', ...Array<string>(7).fill('Click to add text')]);
  });

  it('copies slide 5 for the show without a prompt and keeps the band slide as it is', () => {
    const main = pageWithPlaceholders();
    const state: HomeDeckState = { ...baseState(HOME_DECK), agentStep: 1 };
    const copy = cloneSlide(main, state, 'next-steps');
    expect(copy.querySelector('[data-home-slides][data-slide="next-steps"]')).not.toBeNull();
    expect(copy.querySelectorAll('[data-prompt]')).toHaveLength(0);
    expect(copy.textContent ?? '').not.toMatch(/Click to add/);
    // the placeholders themselves stay, empty, as the product renders them with prompts off
    expect(copy.querySelector('[data-block="h"]')).not.toBeNull();
    expect(copy.querySelector('[data-run="rows/items/0/value"]')?.textContent).toBe('');
    // the band's own slide keeps its prompts (the editor stage's)
    expect(main.querySelector(':scope > .ts-home-sheet')?.querySelectorAll('[data-prompt]')).toHaveLength(8);
  });

  it('removes a picture plate prompt as well', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<figure><div class="pic-prompt shot" data-prompt aria-hidden="true"><span>Click to add a picture</span></div></figure>';
    dropPrompts(host);
    expect(host.innerHTML).toBe('<figure></figure>');
  });

  it('repaints slide 5 at step 1 with prompts on a band slide and without them on a copy', () => {
    const state: HomeDeckState = { ...baseState(HOME_DECK), agentStep: 1 };
    document.body.innerHTML = `<main><div class="ts-home-sheet">${HOME_SLIDE_MARKUP['next-steps']}</div><div class="ts-home-sheet" data-slide-clone="next-steps">${HOME_SLIDE_MARKUP['next-steps']}</div></main>`;
    const [band, copy] = [...document.querySelectorAll<HTMLElement>('[data-home-slides]')];
    if (band === undefined || copy === undefined) throw new Error('no slides');
    paintStep(band, state);
    paintStep(copy, state);
    expect(band.querySelectorAll('[data-prompt]')).toHaveLength(8);
    expect(copy.querySelectorAll('[data-prompt]')).toHaveLength(0);
    expect(copy.querySelector('[data-run="h/text"]')?.textContent).toBe('');
    // a second repaint leaves the copy as it is (its runs already read as wanted)
    const before = copy.innerHTML;
    paintStep(copy, state);
    expect(copy.innerHTML).toBe(before);
  });
});
