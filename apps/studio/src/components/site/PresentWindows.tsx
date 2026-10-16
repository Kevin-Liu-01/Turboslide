import { PRESENT_TEXT } from '@turboslide/viewer/present/strings';

import { PRESENT_SCREEN } from './copy';

/**
 * Screen 04's second row (docs/SITE.md 9): the slideshow, seen by the audience, and presenter
 * view, seen by you, joined by one ink line with a 9 px marker on each window's edge, since a
 * move in either window moves both. S over the line opens presenter view; the arrows under it
 * move both. Presenter view is drawn to PresenterConsole.tsx with the viewer's own words
 * (PRESENT_TEXT): the timer, the deck's title, "Slideshow connected", the current slide with its
 * counter, the next slide and the notes column. The slides are the example deck's slides 2 and 3
 * on its #101010 ground. No script; one geometry in both appearances.
 */
export function PresentWindows() {
  const { windows } = PRESENT_SCREEN;
  return (
    <div className="site-row site-pv-row">
      <div className="site-row-text">
        <p className="t-label">{windows.label}</p>
        <p className="site-row-note t-small">{windows.note}</p>
      </div>
      <figure className="site-pv" role="img" aria-label={windows.alt}>
        <div className="site-pv-win site-pv-show" aria-hidden="true">
          <div className="site-pv-head">
            <span className="t-label">{windows.show.label}</span>
            <span className="site-pv-who t-small">{windows.show.who}</span>
          </div>
          <div className="site-pv-box">
            <div className="site-pv-slide">
              <span>{windows.slide.title}</span>
            </div>
            <div className="site-pv-link">
              <i className="site-pv-line" />
              <i className="site-pv-dot is-a" />
              <i className="site-pv-dot is-b" />
              <span className="site-pv-say is-up t-small">
                <kbd className="pt-kbd site-kbd">S</kbd>
                <span>{windows.opens}</span>
              </span>
              <span className="site-pv-say is-down t-small">
                <kbd className="pt-kbd site-kbd">←</kbd>
                <kbd className="pt-kbd site-kbd">→</kbd>
                <span>{windows.moveBoth}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="site-pv-win site-pv-pres" aria-hidden="true">
          <div className="site-pv-head">
            <span className="t-label">{windows.presenter.label}</span>
            <span className="site-pv-who t-small">{windows.presenter.who}</span>
          </div>
          <div className="site-pv-box site-pvc">
            <div className="site-pvc-head">
              <span className="site-pvc-timer">
                <span className="site-pvc-label">{PRESENT_TEXT.timer}</span>
                <b>{windows.time}</b>
              </span>
              <span className="site-pvc-title">{windows.deck}</span>
              <span className="site-pvc-on">{PRESENT_TEXT.connected}</span>
            </div>
            <div className="site-pvc-body">
              <div className="site-pvc-stage">
                <div className="site-pv-slide">
                  <span>{windows.slide.title}</span>
                </div>
                <div className="site-pvc-counter">
                  <b>{PRESENT_TEXT.counter(windows.slide.index, windows.slide.total)}</b>
                  <span>{windows.slide.title}</span>
                  <svg viewBox="0 0 10 6" width="10" height="6">
                    <path d="M0 0h10L5 6Z" />
                  </svg>
                </div>
                <div className="site-pvc-next">
                  <span className="site-pvc-label">{PRESENT_TEXT.nextSlide}</span>
                  <div className="site-pv-slide is-centre">
                    <span>{windows.next}</span>
                  </div>
                </div>
              </div>
              <div className="site-pvc-side">
                <div className="site-pvc-tab">
                  <span>{PRESENT_TEXT.notes}</span>
                </div>
                <div className="site-pvc-size">
                  <i>−</i>
                  {windows.notesSize}
                  <i>+</i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </figure>
    </div>
  );
}
