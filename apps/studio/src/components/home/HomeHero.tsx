import { HERO } from './copy';
import { HomeLink } from './HomeLink';
import { HERO_SIZES, Shot } from './Shot';

/**
 * The hero (docs/POLISH.md 3.2 item 1): the page's `h1` at 56 px (40 at 390, weight 500), the
 * one lead, two buttons (New Presentation as a document navigation, Open the Example Deck as a
 * router `Link` to the viewer) and the product's own picture of the editor with the example deck
 * open on its Blue Marble slide, 1120 px wide in a 1 px `--pt-edge` frame, its top at about
 * 470 px so the product is in the first screen at 1440 and at 1280. No twin, no plate, no fact
 * paragraph and no credit line (audit-home items 2, 12, 22, 23, 25). Nothing animates.
 */
export function HomeHero() {
  return (
    <section className="ts-product-hero" aria-labelledby="ts-product-h1" data-band="hero">
      <div className="ts-product-rail">
        <h1 id="ts-product-h1" className="ts-product-h1">
          {HERO.heading}
        </h1>
        <p className="ts-product-lead">{HERO.lead}</p>
        <div className="ts-product-cta">
          <HomeLink
            href={HERO.buttons.newPresentation.href}
            control="home.hero.new"
            className="pt-ib is-solid"
          >
            {HERO.buttons.newPresentation.label}
          </HomeLink>
          <HomeLink
            href={`/deck/${HERO.buttons.openDeck.deckId}`}
            control="home.hero.deck"
            className="pt-ib"
          >
            {HERO.buttons.openDeck.label}
          </HomeLink>
        </div>
        <figure className="ts-product-shot ts-product-hero-shot">
          <Shot kind={HERO.picture.shot} alt={HERO.picture.alt} sizes={HERO_SIZES} priority />
        </figure>
      </div>
    </section>
  );
}
