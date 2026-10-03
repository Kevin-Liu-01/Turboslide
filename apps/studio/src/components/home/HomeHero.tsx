import { HERO } from './copy';
import { HomeLink } from './HomeLink';
import { SectionIcon } from './SectionIcon';
import { HERO_SIZES, Shot } from './Shot';

/**
 * The hero (docs/archive/rounds/POLISH.md 3.2 item 1; the page grammar of docs/NEXT.md 4.1.2): in the 1104 px
 * column, the page's `h1` at the ladder's hero size (3.7rem, 2.5rem under 720 px, weight 500,
 * -0.038em), the one lead and two buttons (New Presentation as a document navigation, Open the
 * Example Deck as a router `Link` to the viewer) on the left, and on the right the facts rows of
 * C's grammar: ruled key and value rows with a Heroicon in each key cell (DECK-GRAMMAR 39 and
 * 40). Under them the product's own picture of the editor with the example deck open on its Blue
 * Marble slide, the column's width in a 1 px `--pt-edge` frame, in the first screen at 1440 and
 * at 1280. No mood picture on the first screen (docs/NEXT.md question 5). Nothing animates.
 */
export function HomeHero() {
  return (
    <section className="ts-product-hero ts-seam" aria-labelledby="ts-product-h1" data-band="hero">
      <div className="ts-col">
        <div className="ts-product-hero-head">
          <div className="ts-product-hero-text">
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
          </div>
          <dl className="ts-product-facts" data-control="home.facts">
            {HERO.facts.map((fact) => (
              <div key={fact.id} className="ts-product-fact" data-fact={fact.id}>
                <dt>
                  <SectionIcon name={fact.icon} />
                  <span>{fact.key}</span>
                </dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <figure className="ts-product-shot ts-product-hero-shot">
          <Shot kind={HERO.picture.shot} alt={HERO.picture.alt} sizes={HERO_SIZES} priority />
        </figure>
      </div>
    </section>
  );
}
