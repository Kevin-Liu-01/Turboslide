// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reorder } from './hero-stage';

/*
 * The hero frame's filmstrip takes the deck's order (docs/LANDING.md 2.2) by insertBefore alone.
 * Chromium's moveBefore left a moved thumbnail without its ::after frame in the layout when a step
 * tab reordered the strip several times in one task, so slide 1 drew no edge after Set the Title
 * (verify-landing.md finding 3). jsdom draws no frame; these tests pin the moves the strip makes.
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

const IDS = ['title', 'plan', 'gets', 'ships', 'next-steps', 'lighthouse'] as const;

function strip(): { ol: HTMLOListElement; byId: (id: string) => HTMLElement } {
  document.body.innerHTML = `<ol>${IDS.map((id) => `<li data-hero-thumb="${id}" tabindex="-1">${id}</li>`).join('')}</ol>`;
  const ol = document.querySelector('ol');
  if (ol === null) throw new Error('no strip');
  const byId = (id: string): HTMLElement => {
    const li = ol.querySelector<HTMLElement>(`[data-hero-thumb="${id}"]`);
    if (li === null) throw new Error(`no ${id}`);
    return li;
  };
  return { ol, byId };
}

const order = (ol: HTMLElement): string[] =>
  [...ol.children].map((li) => (li as HTMLElement).dataset['heroThumb'] ?? '');

const items = (ol: HTMLElement): HTMLElement[] => [...ol.children] as HTMLElement[];

afterEach(() => {
  delete (Element.prototype as { moveBefore?: unknown }).moveBefore;
});

describe('the hero filmstrip reorder', () => {
  it('takes the wanted order without moveBefore, moving only the thumbnails out of place', () => {
    const moveBefore = vi.fn();
    Object.defineProperty(Element.prototype, 'moveBefore', {
      value: moveBefore,
      configurable: true,
    });
    const { ol, byId } = strip();
    const inserted = vi.spyOn(ol, 'insertBefore');
    // a staged Restore: slide 5 leaves the order and waits after the others
    const staged = ['title', 'plan', 'gets', 'ships', 'lighthouse', 'next-steps'].map(byId);
    reorder(ol, items(ol), staged);
    expect(order(ol)).toEqual(['title', 'plan', 'gets', 'ships', 'lighthouse', 'next-steps']);
    expect(inserted).toHaveBeenCalledTimes(1);
    // New Slide: slide 5 back in its place
    const back = ['title', 'plan', 'gets', 'ships', 'next-steps', 'lighthouse'].map(byId);
    reorder(ol, items(ol), back);
    expect(order(ol)).toEqual([...IDS]);
    expect(moveBefore).not.toHaveBeenCalled();
  });

  it('moves nothing when the order holds', () => {
    const { ol } = strip();
    const inserted = vi.spyOn(ol, 'insertBefore');
    reorder(ol, items(ol), items(ol));
    expect(inserted).not.toHaveBeenCalled();
  });

  it('gives back the focus a moved thumbnail held', () => {
    const { ol, byId } = strip();
    byId('plan').focus();
    expect(document.activeElement).toBe(byId('plan'));
    const want = ['gets', 'title', 'plan', 'ships', 'next-steps', 'lighthouse'].map(byId);
    reorder(ol, items(ol), want);
    expect(order(ol)).toEqual(['gets', 'title', 'plan', 'ships', 'next-steps', 'lighthouse']);
    expect(document.activeElement).toBe(byId('plan'));
  });
});
