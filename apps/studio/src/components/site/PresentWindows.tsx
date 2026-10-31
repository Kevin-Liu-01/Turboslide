import { PRESENT_TEXT } from '@turboslide/viewer/present/strings';

import { PRESENT_SCREEN } from './copy';
import { PRESENT_DECK_TITLE, PRESENT_DECK_TOTAL, PRESENT_SLIDES } from './present-deck';
import type { PresentSlide } from './present-deck';

import toneUrl from './pictures/lighthouse-tone.webp?url';

/**
 * A slide of the landing's deck drawn small in the example theme (PresentScreen.tsx): its own
 * container, so a slide px is `100cqw / 1600` and every size is the theme's ladder (h1 88, big
 * 72, h2 44, lead 26, rows 20; packages/theme LADDER) at the 137 px margin. A title slide draws
 * its heading and lead, a rows slide its heading, lead and ruled rows on the 5 to 7 columns, a
 * statement its one line, and the lighthouse its picture, the tone the Canvas screen prints, under
 * the plate with its heading.
 */
function MiniSlide({ slide }: { slide: PresentSlide }) {
  if (slide.kind === 'mood')
    return (
      <span className="site-mini is-mood">
        <img className="site-mini-pic" src={toneUrl} alt="" width={800} height={450} />
        <span className="site-mini-plate">
          <span className="site-mini-h2">{slide.heading}</span>
        </span>
      </span>
    );
  if (slide.kind === 'rows')
    return (
      <span className="site-mini is-rows">
        <span className="site-mini-in">
          <span>
            <span className="site-mini-h2">{slide.heading}</span>
            {slide.lead === '' ? null : <span className="site-mini-p">{slide.lead}</span>}
          </span>
          <span>
            {slide.rows.map((row) => (
              <span key={row.key} className="site-mini-row">
                <span className="site-mini-key">{row.key}</span>
                <span>{row.value}</span>
              </span>
            ))}
          </span>
        </span>
      </span>
    );
  if (slide.kind === 'statement')
    return (
      <span className="site-mini is-statement">
        <span className="site-mini-in">
          <span className="site-mini-big">{slide.heading}</span>
        </span>
      </span>
    );
  return (
    <span className="site-mini is-title">
      <span className="site-mini-in">
        <span className="site-mini-h1">{slide.heading}</span>
        <span className="site-mini-lead">{slide.lead}</span>
      </span>
    </span>
  );
}

/**
 * The slideshow and presenter view of one deck, at slide `at` of PRESENT_SLIDES, drawn to the
 * product's two windows: the slideshow is the slide on the --pt-panel-ink surround a full screen
 * window draws, and presenter view is PresenterConsole.tsx's head, current slide, counter, next
 * slide and speaker notes, in the viewer's own words (PRESENT_TEXT). Both windows draw from the
 * one index, so a step moves both, as the product's two windows move together.
 */
export function PresentWindows({ at }: { at: number }) {
  const { windows } = PRESENT_SCREEN;
  const slide = PRESENT_SLIDES[at] ?? PRESENT_SLIDES[0];
  const next = PRESENT_SLIDES[at + 1];
  if (slide === undefined) return null;
  return (
    <div className="site-pr-wins">
      <div className="site-pr-win is-show">
        <span className="site-pr-label">{windows.show}</span>
        <div className="site-pr-show" aria-hidden="true">
          <MiniSlide slide={slide} />
        </div>
      </div>
      <div className="site-pr-win is-presenter">
        <span className="site-pr-label">{windows.presenter}</span>
        <div className="site-pr-console">
          <div className="site-pr-head">
            <span className="site-pr-deck">{PRESENT_DECK_TITLE}</span>
            <span className="site-pr-on">{PRESENT_TEXT.connected}</span>
          </div>
          <div className="site-pr-now" aria-hidden="true">
            <MiniSlide slide={slide} />
          </div>
          <div className="site-pr-under">
            <div className="site-pr-next">
              <span className="site-pr-counter" aria-live="polite">
                {PRESENT_TEXT.counter(at + 1, PRESENT_DECK_TOTAL)}
              </span>
              <span className="site-pr-cap">{PRESENT_TEXT.nextSlide}</span>
              <span className="site-pr-thumb" aria-hidden="true">
                {next === undefined ? null : <MiniSlide slide={next} />}
              </span>
            </div>
            <div className="site-pr-notes">
              <span className="site-pr-cap">{PRESENT_TEXT.notes}</span>
              <p>{slide.notes === '' ? PRESENT_TEXT.noNotes : slide.notes}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
