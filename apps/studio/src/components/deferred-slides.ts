import type { ViewerDeck } from '@turboslide/viewer/model';

import type { DeckSlidesPayload } from '../server/decks';

/**
 * The other slides' HTML once `getDeckSlides` answers (gslides-parity SPEC-4 3.11), read against
 * the payload the loader rendered. The answer at the payload's revision is the same document; an
 * answer at a newer revision is the same deck one checkpoint later (the focus round, cycle 3 fix;
 * b3 C3-R3, VERIFICATION C2-F21: on the memory tier the room's document gains a revision 2 s after
 * the last op while its content stands, and the loader's `getDeck` and the mount's `getDeckSlides`
 * run a second or more apart, so the checkpoint of the write the viewer was opened for landed
 * between them and the viewer dropped every slide but the first, "viewer undefined" in
 * `shapes.reload-and-viewer`). The HTML is keyed by slide id, so a newer answer merges over the
 * payload's list: a slide the newer revision removed keeps its empty html, one it added is not
 * listed. An answer behind the payload is a stale read and is dropped.
 */
export function deferredSlidesOf(
  payloadRevision: number,
  answer: DeckSlidesPayload | null,
): Readonly<Record<string, string>> | null {
  if (answer === null || answer.revision < payloadRevision) return null;
  return answer.html;
}

/** The deck with the streamed HTML merged in (SPEC-4 3.11); the same object when nothing arrived. */
export function mergeDeferredSlides(
  deck: ViewerDeck,
  html: Readonly<Record<string, string>> | null,
): ViewerDeck {
  if (html === null || Object.keys(html).length === 0) return deck;
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.html === '' && html[slide.id] !== undefined
        ? { ...slide, html: html[slide.id]! }
        : slide,
    ),
  };
}
