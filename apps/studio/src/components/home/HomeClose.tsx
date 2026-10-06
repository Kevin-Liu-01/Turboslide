import { CLOSE } from './copy';
import { CLOSE_ROUND } from './design-copy';
import { HomeLink } from './HomeLink';
import { HomeSection, Reserve, bandHeadingId } from './HomeSection';
import { HomeSheet } from './HomeSheet';

/**
 * The close (docs/DESIGN.md 8.14; docs/LANDING.md 2.15, Kevin's pick "A: The close, the mark
 * assembles"): slide 9 at the column's width with no frame, the page's other book end (the mark at
 * 300 px wide on the sheet's centre axis, "Turboslide", and the signature "Made in Turboslide. Set
 * in Inter." between the bottom rules), then on the centre axis "Start a presentation", one line
 * and the two buttons. The slide is the band's reserved box, written by its chunk after `load` (4.2); the
 * mark's seven pieces carry `data-mark-piece` for K1 (V4).
 */
export function HomeClose() {
  return (
    <HomeSection id="close" className="ts-band-close">
      <Reserve band="close" className="ts-close-reserve">
        <HomeSheet instance="close" fill className="ts-close-sheet" />
      </Reserve>
      <div className="ts-close-text">
        <h2 id={bandHeadingId('close')} className="ts-h2">
          {CLOSE_ROUND.h2}
        </h2>
        <p className="ts-lead">{CLOSE_ROUND.lead}</p>
        <div className="ts-buttons">
          <HomeLink
            href={CLOSE.buttons.newPresentation.href}
            control="home.close.new"
            className="pt-ib is-solid ts-button"
          >
            {CLOSE.buttons.newPresentation.label}
          </HomeLink>
          <HomeLink
            href={`/deck/${CLOSE.buttons.openDeck.deckId}`}
            control="home.close.deck"
            className="pt-ib ts-button"
          >
            {CLOSE.buttons.openDeck.label}
          </HomeLink>
        </div>
      </div>
    </HomeSection>
  );
}
