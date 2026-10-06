import { tipProps } from '@turboslide/chrome/Tooltip';

import { MENUS } from './copy';
import { HOME_DECK } from './deck.generated';
import { BAND_CONTROLS, MENUS_ROUND } from './design-copy';
import { BandHead, HomeSection, Reserve } from './HomeSection';

/**
 * Menus and keyboard shortcuts (docs/DESIGN.md 8.4; docs/LANDING.md 2.5, Kevin's pick "C: a working
 * miniature editor whose rows change the deck"): the h2 and its sentence in the left 7 of 12 columns,
 * then the miniature editor in the band's reserved box at its final size (666 px tall at 1,024 px
 * and over; v2.md R4): its title row (the mark, the deck's title and "9 slides"), the menu bar,
 * the filmstrip, the stage, the speaker notes and the status row. The document holds the title
 * row, the notes field holding slide 2's notes and the status row's resting sentence; the menu
 * bar, the filmstrip and the stage are V2's (`live/menus.ts`), drawn from the menu model and the
 * page deck when the band's chunk arrives after `load`, each row with the model's glyph. Edit >
 * Undo is the band's Undo, and so is the glyph button at the title row's right. The mark is the
 * page's `#ts-mark` symbol.
 */
export function HomeMenus() {
  const shown = HOME_DECK.slides.plan;
  return (
    <HomeSection id="menus">
      <BandHead id="menus" heading={MENUS_ROUND.h2} lead={MENUS_ROUND.lead} span="split" />
      <Reserve band="menus" className="ts-mini">
        <div
          className="ts-mini-editor pt-window"
          role="group"
          aria-label={MENUS.editorLabel}
          data-mini-editor=""
        >
          <div className="ts-mini-title">
            <svg className="ts-mini-mark" fill="currentColor" aria-hidden="true">
              <use href="#ts-mark" />
            </svg>
            <span className="ts-mini-name" data-mini-title="">
              {HOME_DECK.title}
            </span>
            <span className="ts-mini-count" data-mini-count="">
              {MENUS.slides(HOME_DECK.order.length)}
            </span>
            <button
              type="button"
              className="pt-ib pt-icon ts-mini-undo"
              data-undo="menus"
              aria-label={BAND_CONTROLS.undo}
              {...tipProps(BAND_CONTROLS.undo)}
            >
              <i className="ts-icon" data-icon="arrow-uturn-left" />
            </button>
          </div>
          <nav className="ts-mini-menubar" data-menubar="" aria-label={MENUS.menusKey} />
          {/* the plates' layer: over the frame from 720 px, a row under the Menus key below */}
          <div className="ts-mini-plates" data-keeps-selection="" />
          <div className="ts-mini-body">
            <ol
              className="ts-mini-filmstrip"
              data-mini-filmstrip=""
              aria-label={MENUS.filmstripLabel}
            />
            <div className="ts-mini-stage" data-mini-stage="" />
          </div>
          <label className="ts-mini-notes">
            <span className="ts-sr">{MENUS.notesLabel}</span>
            <textarea
              data-mini-notes=""
              rows={1}
              spellCheck={false}
              defaultValue={shown.notes}
              aria-label={MENUS.notesLabel}
            />
          </label>
          <div className="ts-mini-status">
            <span data-mini-status="" aria-live="polite">
              {MENUS.statusRest}
            </span>
            <span className="ts-mini-readout" data-mini-readout="" />
          </div>
        </div>
      </Reserve>
      <p className="ts-sr" aria-live="polite" data-announce="" />
    </HomeSection>
  );
}
