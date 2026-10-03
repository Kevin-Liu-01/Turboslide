import { CLOSE } from './copy';
import { HomeLink } from './HomeLink';
import { HomeSection, bandHeadingId } from './HomeSection';
import { HomeSheet } from './HomeSheet';

/**
 * A new presentation needs no account (docs/LANDING.md 2.10, band 8, the close): slide 8 at the
 * column's width with no frame, the page's other book end (the mark at 300 px wide on the sheet's
 * centre axis, "Turboslide", and the signature "Made in Turboslide. Set in Inter." between the
 * bottom rules), then on the centre axis the h2, the lead and the two buttons. The mark's seven
 * pieces carry `data-mark-piece` for K1 (L4, push 7).
 */
export function HomeClose() {
  return (
    <HomeSection id="close" className="ts-band-close">
      <HomeSheet instance="close" className="ts-close-sheet" />
      <div className="ts-close-text">
        <h2 id={bandHeadingId('close')} className="ts-h2">
          {CLOSE.h2}
        </h2>
        <p className="ts-lead">{CLOSE.lead}</p>
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
