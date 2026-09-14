import { CARDS, resolveText } from './copy';
import type { HomeFacts } from './facts';
import { Shot } from './Shot';
import { SpriteIcon } from './SpriteIcon';

/** A card's picture slot: a third of the rail, the whole rail under 760 px. */
const CARD_SIZES =
  '(max-width: 760px) calc(100vw - 50px), (max-width: 1168px) calc((100vw - 50px) / 3), 372px';
/** Half a card, for the two paired pictures. */
const PAIR_SIZES =
  '(max-width: 760px) calc((100vw - 51px) / 2), (max-width: 1168px) calc((100vw - 53px) / 6), 185px';

/**
 * What it does (gslides-parity SPEC-4 2.2 item 5, 0.19, 0.24; R05 6.4): the twelve cards in four
 * rows of three, the README's groups in the README's order, eight with a screenshot, one with a
 * screenshot and an icon (Charts, the Insert menu with the Chart submenu), three with a Heroicon
 * from the theme sprite; the shell card pairs `02` with `05` and the viewer card `14` with `15`,
 * so all fifteen README pictures are on the page. The grid draws one seam between cells (a 1 px
 * gap over `--pt-hair-soft` inside one `--pt-hair` border) and never two.
 */
export function HomeCards({ facts }: { facts: HomeFacts | null }) {
  return (
    <section className="ts-product-band" aria-labelledby="ts-product-h-features">
      <div className="ts-product-rail">
        <div className="ts-product-band-head">
          <h2 id="ts-product-h-features" className="ts-product-h2">
            {CARDS.heading}
          </h2>
          <p className="ts-product-lead">{CARDS.lead}</p>
        </div>
        <div className="ts-product-grid">
          {CARDS.cards.map((card) => (
            <article key={card.id} className="ts-product-card" data-card={card.id}>
              {card.shot !== undefined && card.pair !== undefined ? (
                <div className="ts-product-card-fig ts-product-card-pair">
                  <Shot name={card.shot} sizes={PAIR_SIZES} />
                  <Shot name={card.pair} sizes={PAIR_SIZES} />
                </div>
              ) : card.shot !== undefined ? (
                <div className="ts-product-card-fig">
                  <Shot name={card.shot} sizes={CARD_SIZES} />
                </div>
              ) : card.icon !== undefined ? (
                <div className="ts-product-card-fig ts-product-card-icon">
                  <SpriteIcon name={card.icon} />
                </div>
              ) : null}
              <h3 className="ts-product-h3 ts-product-card-title">
                {card.shot !== undefined && card.icon !== undefined ? (
                  <SpriteIcon name={card.icon} size={16} className="ts-product-card-title-icon" />
                ) : null}
                {card.title}
              </h3>
              <p className="ts-product-card-copy">{resolveText(card.copy, facts) ?? ''}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
