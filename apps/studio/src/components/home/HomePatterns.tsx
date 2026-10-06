import { Fragment } from 'react';

import { PATTERNS } from './copy';
import { FIGURES_ROUND } from './design-copy';
import { FACTS_DATA } from './facts-data';
import { BandHead, HomeSection } from './HomeSection';
import { HomeSheet } from './HomeSheet';
import { HOME_PATTERN_CARDS, HOME_PATTERN_CARD_SIZE } from './pattern-cards.generated';

/** Insert > Animated pattern, the menu model's path the numbers row prints (facts-data.ts). */
const GALLERY_PATH = FACTS_DATA.numbers.find((cell) => cell.id === 'patterns')?.path ?? [];

/**
 * Animated patterns (docs/LANDING.md 2.13, Kevin's pick "B: Animated patterns, a moving shader
 * beside its still frame"): the h2 and the lead in the left 7 of 12 columns, then slide 8 twice,
 * side by side at 500 by 281 px (stacked at 358 by 201 under 720 px), each with its label 8 px
 * above it: on the left the pattern moving, drawn by the product's shader in its own chunk; on
 * the right the still frame the exporter stores, the picture the PDF and the PowerPoint file
 * carry. Both sheets are placeholders in the band's reserved box (v4.md Q6), which the band's
 * chunk fills and V4's `live/pattern.ts` dresses. Under them, the editor's Insert > Animated
 * pattern gallery (DESIGN.md 8.12): its path as crumbs and the stills its cards draw, each with
 * its name, 9 to a row at 1440, 6 under 1,024 px and one sideways row under 720 px, each `img`
 * sized so nothing moves when it loads, lazy in the markup and asked for by the band's chunk
 * (`live/pattern.ts`) once the band nears.
 */
export function HomePatterns() {
  return (
    <HomeSection id="patterns">
      <BandHead id="patterns" heading={PATTERNS.h2} lead={PATTERNS.lead} span={7} />
      <div className="ts-patterns" data-reserve="patterns">
        <div className="ts-pattern" data-pattern="moving">
          <p className="ts-pattern-label">{PATTERNS.labels.moving}</p>
          <HomeSheet instance="patterns-moving" fill />
        </div>
        <div className="ts-pattern" data-pattern="still">
          <p className="ts-pattern-label">{PATTERNS.labels.still}</p>
          <HomeSheet instance="patterns-still" fill />
        </div>
      </div>
      <div className="ts-pattern-gallery">
        <p className="ts-crumbs">
          {GALLERY_PATH.map((step, i) => (
            <Fragment key={step}>
              {i > 0 ? <i className="ts-icon" data-icon="next" /> : null}
              <span>{step}</span>
            </Fragment>
          ))}
        </p>
        <ul className="ts-pattern-cards pt-scroll-x" aria-label={FIGURES_ROUND.patterns.label}>
          {HOME_PATTERN_CARDS.map((card) => (
            <li key={card.path} className="ts-pattern-card">
              <img
                src={card.path}
                width={HOME_PATTERN_CARD_SIZE.width}
                height={HOME_PATTERN_CARD_SIZE.height}
                loading="lazy"
                decoding="async"
                alt=""
              />
              <span className="ts-pattern-card-name">{card.name}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce="" />
    </HomeSection>
  );
}
