import { homeAsset } from './assets';
import { HOME_SLIDESHOW_KEYS } from './chrome.generated';
import { PRESENT } from './copy';
import { HOME_DECK } from './deck.generated';
import { DIAGRAMS_ROUND, FIGURES_ROUND } from './design-copy';
import { Diagram } from './HomeDiagram';
import { BandHead, HomeSection, Reserve } from './HomeSection';
import { HomeSheet } from './HomeSheet';

/**
 * Present from the browser (docs/LANDING.md 2.11, Kevin's pick "A: Present from the browser"): the
 * h2, the lead and the two buttons in the left 5 of 12 columns (Present with the editor's play
 * glyph and View > Slideshow's key chips, Print This Deck with the printer glyph; DESIGN.md 8.10),
 * and under them the editor to presenter view to show diagram (`HomeDiagram.tsx`); in the right 7 the chosen slide
 * (slide 3 at rest, the band's reserved box, written by its chunk after `load`), unframed, and
 * under it the ruled list of the deck's nine titles, the chosen row in ink at weight 500 with
 * `aria-current` (no blue at rest). The band reserves the show's height (the 1,024 by 576 stage and
 * its 56 px bar), so opening the show moves nothing outside the band. Present carries Google's
 * Slideshow keys in `aria-keyshortcuts`; the show and the print are the live module's (L3, push 5).
 * The empty print container at the end of the band is filled on `beforeprint` (l3.md R7). Under
 * the band, the product's presenter view of the page deck as `scripts/home/capture.ts` captured it
 * from the node-server build (DESIGN.md 8.10), one picture per appearance at 1x and 2x.
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
              data-present=""
              aria-keyshortcuts="Meta+Enter Control+F5"
            >
              <i className="ts-icon" data-icon="play" />
              {PRESENT.present}
              <span
                className="ts-present-keys"
                data-shortcut-other={HOME_SLIDESHOW_KEYS.other}
                aria-hidden="true"
              >
                {HOME_SLIDESHOW_KEYS.mac.map((key) => (
                  <kbd key={key} className="pt-kbd">
                    {key}
                  </kbd>
                ))}
              </span>
            </button>
            <button type="button" className="pt-ib ts-button" data-print="">
              <i className="ts-icon" data-icon="printer" />
              {PRESENT.print}
            </button>
          </div>
          <Diagram id="present" label={DIAGRAMS_ROUND.present.label} />
        </BandHead>
        <div className="ts-present-slide">
          <Reserve band="present" className="ts-present-reserve">
            <HomeSheet instance="present" fill className="ts-present-sheet" />
          </Reserve>
          <ol className="ts-home-slide-list" data-slide-list="" aria-label={PRESENT.listLabel}>
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
      <figure className="ts-present-figure" data-figure="presenter">
        <div className="pt-window ts-figure-frame">
          {(['light', 'dark'] as const).map((theme) => {
            const x1 = homeAsset('presenter', theme, 'x1');
            const x2 = homeAsset('presenter', theme, 'x2');
            return (
              <img
                key={theme}
                className={`ts-only-${theme}`}
                src={x1.path}
                srcSet={`${x1.path} 1x, ${x2.path} 2x`}
                width={x1.width ?? undefined}
                height={x1.height ?? undefined}
                loading="lazy"
                decoding="async"
                alt={FIGURES_ROUND.presenter.alt}
              />
            );
          })}
        </div>
        <figcaption className="ts-caption">{FIGURES_ROUND.presenter.caption}</figcaption>
      </figure>
      <p className="ts-sr" aria-live="polite" data-announce="" />
    </HomeSection>
  );
}
