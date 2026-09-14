import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import { HERO } from './copy';
import { HomeLink } from './HomeLink';

/**
 * The hero (gslides-parity SPEC-4 2.3, 0.6, 0.7, 0.21, 0.22): a 640 px band, full width, the
 * still two tone twin of one captured liquid metal frame at its own cells (a 1600 by 900 picture
 * shown at that size, `image-rendering: pixelated`, cropped by the band, never scaled) behind an
 * opaque plate lower left at 740 px, the deck's own opener composition. The plate carries the
 * `h1` lockup (the 48 px solid mark and the word at 66 px as live text), the one sentence at
 * `--ts-lead`, the three buttons (New Presentation as a document navigation, Open the GT Deck as
 * a router `Link`, GitHub in a new tab) and the fact line. Nothing animates. The twin is
 * decorative (`aria-hidden`; the plate's text is the content) and follows the stored theme
 * through the two custom properties `home.tsx` sets from `SITE.twins.hero`, so the light and the
 * dark twin are both B1's files by the paths `site.ts` exports; the credit line sits under the
 * band on the page's ground, where no cell sits behind it.
 */
export function HomeHero() {
  return (
    <>
      <section className="ts-product-hero" aria-labelledby="ts-product-h1">
        <div className="ts-product-hero-twin" aria-hidden="true" data-twin="hero" />
        <div className="ts-product-rail ts-product-hero-rail">
          <div className="ts-product-plate">
            <h1 id="ts-product-h1" className="ts-product-h1">
              <TurboslideMark size={48} aria-hidden="true" className="ts-product-h1-mark" />
              <span className="ts-product-h1-word">{HERO.word}</span>
            </h1>
            <p className="ts-product-lead ts-product-hero-sentence">{HERO.sentence}</p>
            <div className="ts-product-cta">
              <HomeLink
                href={HERO.buttons.newPresentation.href}
                tip={HERO.buttons.newPresentation.tip}
                control="home.hero.new"
                className="pt-ib is-solid"
              >
                {HERO.buttons.newPresentation.label}
              </HomeLink>
              <HomeLink
                href={`/deck/${HERO.buttons.openDeck.deckId}`}
                tip={HERO.buttons.openDeck.tip}
                control="home.hero.deck"
                className="pt-ib"
              >
                {HERO.buttons.openDeck.label}
              </HomeLink>
              <HomeLink
                href={HERO.buttons.github.href}
                external
                tip={HERO.buttons.github.tip}
                control="home.hero.github"
                className="pt-ib"
              >
                {HERO.buttons.github.label}
              </HomeLink>
            </div>
            <p className="ts-product-hero-facts">{HERO.facts}</p>
          </div>
        </div>
      </section>
      <div className="ts-product-rail">
        <p className="ts-product-credit">{HERO.credit}</p>
      </div>
    </>
  );
}
