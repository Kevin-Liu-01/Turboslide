import { TAILOR } from './copy';
import { HOME_DECK, HOME_TAILOR_WORDS } from './deck.generated';
import type { HomeSlideId } from './deck.generated';
import { BandHead, HomeSection, Reserve } from './HomeSection';
import { HomeSheet } from './HomeSheet';

/**
 * One name on every slide (docs/DESIGN.md 8.6; docs/LANDING.md 2.7, Kevin's pick "A: Tailor with
 * a reorderable filmstrip"): the split head, then the Tailor dialog as the editor draws it, in the
 * product's words (`HOME_TAILOR_WORDS`, copied from @turboslide/chrome's TAILOR at build): the
 * title, Replace with the deck's customer, With, the count, Cancel and Apply; beside it the editor
 * in part: the filmstrip of slides 1 to 5, the slides that carry the customer's name, across the
 * top, the stage under it showing the chosen slide, and under the stage the product's snackbar
 * ("Tailored for Globex: 13 places on 6 slides" with Undo). Move Up and Move Down are glyph
 * buttons the band's chunk adds to each thumbnail, shown on its hover and focus
 * (`live/filmstrip.ts`). The filmstrip, the stage and the snackbar's row are the band's reserved
 * box: the slides are written by its chunk after `load` (4.2). Cancel is the form's reset, so it
 * empties With without a script.
 */
const THUMBS = [
  ['tailor-thumb-title', 'title'],
  ['tailor-thumb-plan', 'plan'],
  ['tailor-thumb-gets', 'gets'],
  ['tailor-thumb-ships', 'ships'],
  ['tailor-thumb-next-steps', 'next-steps'],
] as const;

export function HomeTailor() {
  const title = (id: HomeSlideId): string => HOME_DECK.slides[id].title;
  return (
    <HomeSection id="tailor">
      <BandHead id="tailor" heading={TAILOR.h2} lead={TAILOR.lead} span="split" />
      <div className="ts-tailor-body">
        <form
          className="ts-tailor-dialog pt-window"
          data-tailor=""
          autoComplete="off"
          noValidate
          aria-labelledby="ts-tailor-title"
          onSubmit={(event) => event.preventDefault()}
        >
          <h3 id="ts-tailor-title">{HOME_TAILOR_WORDS.title}</h3>
          <div className="ts-tailor-field">
            <span>{HOME_TAILOR_WORDS.from}</span>
            <span className="ts-tailor-box" data-tailor-from="">
              {HOME_DECK.customer}
            </span>
          </div>
          <label className="ts-tailor-field">
            <span>{HOME_TAILOR_WORDS.to}</span>
            <input
              className="ts-field"
              type="text"
              maxLength={24}
              placeholder={TAILOR.placeholder}
              spellCheck={false}
              data-tailor-to=""
            />
          </label>
          <p className="ts-tailor-count">
            <i className="ts-icon" data-icon="square-2-stack" />
            <span data-tailor-count="" aria-live="polite">
              {HOME_TAILOR_WORDS.countRest}
            </span>
          </p>
          <div className="ts-tailor-actions">
            <button type="reset" className="pt-ib ts-button">
              {HOME_TAILOR_WORDS.cancel}
            </button>
            <button type="submit" className="pt-ib is-solid ts-button" data-tailor-apply="">
              {HOME_TAILOR_WORDS.apply}
            </button>
          </div>
        </form>
        <Reserve band="tailor" className="ts-tailor-editor">
          <ol className="ts-home-filmstrip" data-filmstrip="" aria-label={TAILOR.filmstripLabel}>
            {THUMBS.map(([instance, id]) => (
              <li
                key={id}
                className="ts-home-thumb"
                data-thumb={id}
                tabIndex={0}
                aria-label={title(id)}
                {...(id === 'plan' ? { 'data-selected': '', 'aria-current': 'true' } : {})}
              >
                <span className="ts-home-thumb-n pt-num" data-thumb-n="" aria-hidden="true">
                  {HOME_DECK.slides[id].n}
                </span>
                <HomeSheet instance={instance} fill />
              </li>
            ))}
          </ol>
          <div className="ts-tailor-stage" data-stage="">
            <HomeSheet instance="tailor-stage" fill label={title('plan')} />
          </div>
          <div className="ts-home-snackbar" data-snackbar="">
            <span data-snackbar-text="" aria-live="polite" />
            <button
              type="button"
              className="ts-text-button"
              data-snackbar-undo=""
              data-undo="tailor"
            >
              {HOME_TAILOR_WORDS.undo}
            </button>
          </div>
        </Reserve>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce="" />
    </HomeSection>
  );
}
