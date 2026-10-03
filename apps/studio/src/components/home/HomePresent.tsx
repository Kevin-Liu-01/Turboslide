import { PRESENT } from './copy';
import { HOME_DECK } from './deck.generated';
import { BandHead, HomeSection } from './HomeSection';
import { HomeSheet } from './HomeSheet';

/**
 * Present from the browser (docs/LANDING.md 2.7, band 5): the h2, the lead and the two buttons in
 * the left 5 of 12 columns; in the right 7 the chosen slide (slide 3 at rest), unframed, and under
 * it the ruled list of the deck's eight titles, the chosen row in ink at weight 500 with
 * `aria-current` (no blue at rest). The band reserves the show's height (the 1,024 by 576 stage and
 * its 56 px bar), so opening the show moves nothing outside the band. Present carries Google's
 * Slideshow keys in `aria-keyshortcuts`; the show and the print are the live module's (L3, push 5).
 * The empty print container at the end of the band is filled on `beforeprint` (l3.md R7).
 */
const CHOSEN = 'gets';

export function HomePresent() {
  return (
    <HomeSection id="present" className="ts-band-present">
      <div className="ts-present">
        <BandHead id="present" heading={PRESENT.h2} lead={PRESENT.lead} span={12}>
          <div className="ts-buttons">
            <button
              type="button"
              className="pt-ib is-solid ts-button"
              data-present
              aria-keyshortcuts="Meta+Enter Control+F5"
            >
              {PRESENT.present}
            </button>
            <button type="button" className="pt-ib ts-button" data-print>
              {PRESENT.print}
            </button>
          </div>
        </BandHead>
        <div className="ts-present-slide">
          <HomeSheet instance="present" className="ts-present-sheet" />
          <ol className="ts-slide-list" data-slide-list aria-label={PRESENT.listLabel}>
            {HOME_DECK.order.map((id) => {
              const slide = HOME_DECK.slides[id];
              const chosen = id === CHOSEN;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="ts-slide-row"
                    data-slide-row={id}
                    {...(chosen ? { 'aria-current': 'true' as const } : {})}
                  >
                    <span className="ts-slide-row-n">{slide.n}</span>
                    <span className="ts-slide-row-title">{slide.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce />
    </HomeSection>
  );
}
