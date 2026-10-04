import { homeAsset } from '../assets';
import type { LiveContext } from './index';
import {
  appearance,
  endHeroSequence,
  loadStill,
  patternStillPath,
  settleEntrance,
  showSlide,
  shownSlides,
} from './show';
import { sourceOf } from './state';
import type { HomeDeckState } from './state';

/**
 * Print This Deck (docs/LANDING.md 2.7, 5 "Print"; row home.present.print). L3's file. The button
 * calls `window.print()`; on `beforeprint`, which Cmd or Ctrl+P fires as well, the page's print
 * container is filled with the page deck as the visitor left it, one slide to a 16 by 9 page
 * (`print.css`: `@page { size: 16in 9in; margin: 0 }`), and emptied on `afterprint`. Without the
 * live module the container stays empty and `print.css` prints the hero slide alone. The browser's
 * print is a different thing from the PDF the CLI writes, and the page does not call it a PDF.
 *
 * Slide 7's still is requested only here and by the show (LANDING.md 4.2): the button loads it
 * before it opens the print dialog, so the page it prints holds the picture.
 */

/**
 * The stills the print draws that the page may not have requested yet: slide 7's (requested only
 * by the show and the print, LANDING.md 4.2), slide 6's (requested when its band nears the
 * viewport, and in its narrow variant on a phone) and slide 8's still frame in the shown appearance
 * when the print holds slide 8 (the patterns band requests it only near the viewport), loaded
 * before the button opens the print dialog so no page prints a still missing.
 */
function loadStills(root: HTMLElement, state: HomeDeckState): Promise<void> {
  const urls: string[] = [];
  /* the printed page is 16 in wide, so it draws each still's wide variant whatever the window's
     width (the head's narrow stills hold only under 720 px), which a phone has not requested */
  for (const role of ['field-still', 'lighthouse-still'] as const) {
    try {
      urls.push(homeAsset(role, appearance(), 'wide').path);
    } catch {
      /* the build has not written the still */
    }
  }
  for (const box of root.querySelectorAll<HTMLElement>('[data-field]')) {
    const match = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(
      getComputedStyle(box).getPropertyValue('--ts-still'),
    );
    const url = match?.[1];
    if (url !== undefined && !url.startsWith('data:')) urls.push(url);
  }
  const loads = [...new Set(urls)].map((url) => loadStill(url));
  /* slide 8's still frame is a background, requested without CORS (show.ts `loadStill`) */
  const pattern = patternStillPath(appearance());
  if (pattern !== null && shownSlides(state).some((key) => sourceOf(state, key) === 'pattern'))
    loads.push(loadStill(pattern, false));
  return Promise.all(loads).then(() => undefined);
}

export function startPrint(ctx: LiveContext): void {
  const { band, root, store } = ctx;
  const button = band.querySelector<HTMLElement>('[data-print]');
  const deck = root.querySelector<HTMLElement>('[data-print-deck]');
  if (deck === null) return;

  const fill = (): void => {
    endHeroSequence();
    const state = store.get();
    /* one sheet a page: print.css sizes each child of the container to 16 by 9 inches; skipped
       slides are left out, as the product's print and downloads leave them (2.11) */
    deck.replaceChildren(...shownSlides(state).map((id) => showSlide(root, state, id)));
    settleEntrance(deck);
  };
  const empty = (): void => {
    deck.replaceChildren();
  };
  window.addEventListener('beforeprint', fill);
  window.addEventListener('afterprint', empty);

  button?.addEventListener('click', () => {
    void loadStills(root, store.get()).then(() => window.print());
  });
}
