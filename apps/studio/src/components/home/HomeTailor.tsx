import { TAILOR } from './copy';
import { HOME_DECK, HOME_TAILOR_WORDS } from './deck.generated';
import type { HomeSlideId } from './deck.generated';
import { BandHead, HomeSection } from './HomeSection';
import { HomeSheet } from './HomeSheet';

/**
 * One customer on every slide (docs/LANDING.md 2.5, band 3): the Tailor dialog as ruled rows
 * (Replace, With, the count and Apply, the example kits), then the editor in part: a filmstrip of
 * slides 2 to 5 as framed 144 by 81 thumbnails and, beside it, a stage of 856 by 481 showing the
 * chosen slide unframed, with a row reserved under it for the snackbar. At rest the dialog holds
 * the deck's customer and the count of the CLI's recorded answer; the kits show GT pressed; the
 * stage shows slide 2. Tailor, the kits and the filmstrip are the live module's (L2, push 3);
 * the dialog's own words are the product's (`HOME_TAILOR_WORDS`, copied from @turboslide/chrome's
 * TAILOR). Hooks: integrator.md 4.1 and l2.md Q3.
 */
const THUMBS = [
  ['tailor-thumb-plan', 'plan'],
  ['tailor-thumb-gets', 'gets'],
  ['tailor-thumb-ships', 'ships'],
  ['tailor-thumb-next-steps', 'next-steps'],
] as const;

const KITS = [
  { id: 'gt', pressed: true },
  { id: 'kestrel', pressed: false },
  { id: 'fenwick', pressed: false },
] as const;

export function HomeTailor() {
  const title = (id: HomeSlideId): string => HOME_DECK.slides[id].title;
  return (
    <HomeSection id="tailor">
      <div className="ts-tailor-top">
        <BandHead id="tailor" heading={TAILOR.h2} lead={TAILOR.lead} span={5} />
        <form
          className="ts-home-rows ts-tailor-dialog"
          data-tailor
          autoComplete="off"
          noValidate
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="ts-row">
            <span className="ts-row-key">{HOME_TAILOR_WORDS.from}</span>
            <span className="ts-row-value ts-strong" data-tailor-from>
              {HOME_DECK.customer}
            </span>
          </div>
          <div className="ts-row">
            <label className="ts-row-key" htmlFor="ts-tailor-to">
              {HOME_TAILOR_WORDS.to}
            </label>
            <input
              id="ts-tailor-to"
              className="ts-field"
              type="text"
              maxLength={24}
              placeholder={TAILOR.placeholder}
              spellCheck={false}
              data-tailor-to
            />
          </div>
          <div className="ts-row ts-row-foot">
            <span className="ts-row-key ts-count" data-tailor-count aria-live="polite">
              {HOME_TAILOR_WORDS.countRest}
            </span>
            <button type="submit" className="pt-ib is-solid ts-button" data-tailor-apply>
              {HOME_TAILOR_WORDS.apply}
            </button>
          </div>
          <div className="ts-row">
            <span className="ts-row-key">{TAILOR.examplesKey}</span>
            <span className="ts-kits" role="group" aria-label={TAILOR.examplesKey}>
              {KITS.map((kit) => (
                <button
                  key={kit.id}
                  type="button"
                  className="ts-kit"
                  data-kit={kit.id}
                  aria-pressed={kit.pressed}
                  data-tip={TAILOR.kits[kit.id].tip}
                >
                  <span className="ts-kit-swatch" aria-hidden="true">
                    <i />
                  </span>
                  {TAILOR.kits[kit.id].name}
                </button>
              ))}
            </span>
          </div>
        </form>
      </div>
      <div className="ts-tailor-editor">
        <ol className="ts-filmstrip" data-filmstrip aria-label={TAILOR.filmstripLabel}>
          {THUMBS.map(([instance, id]) => (
            <li
              key={id}
              className="ts-thumb"
              data-thumb={id}
              tabIndex={0}
              aria-label={title(id)}
              {...(id === 'plan' ? { 'data-selected': '' } : {})}
            >
              <span className="ts-thumb-n" data-thumb-n aria-hidden="true">
                {HOME_DECK.slides[id].n}
              </span>
              <HomeSheet instance={instance} />
              <span className="ts-thumb-moves">
                <button type="button" className="ts-text-button" data-thumb-move="up" tabIndex={-1}>
                  {TAILOR.moveUp}
                </button>
                <button
                  type="button"
                  className="ts-text-button"
                  data-thumb-move="down"
                  tabIndex={-1}
                >
                  {TAILOR.moveDown}
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="ts-tailor-stage" data-stage>
          <HomeSheet instance="tailor-stage" label={title('plan')} />
          <div className="ts-snackbar" data-snackbar>
            <span data-snackbar-text aria-live="polite" />
            <button type="button" className="ts-text-button" data-snackbar-undo data-undo="tailor">
              {HOME_TAILOR_WORDS.undo}
            </button>
          </div>
        </div>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce />
    </HomeSection>
  );
}
