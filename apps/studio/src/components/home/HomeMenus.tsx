import { MARK_PATH, MARK_VIEWBOX } from '@turboslide/theme/brand';

import { MENUS } from './copy';
import { HOME_DECK } from './deck.generated';
import { BandHead, HomeSection, Reserve } from './HomeSection';

/**
 * The menus are Google's (docs/LANDING.md 2.5, Kevin's pick "C: The menus are Google's, a working
 * miniature editor whose rows change the deck"): the h2 and the lead in the left 7 of 12 columns,
 * then the miniature editor in the band's reserved box at its final size (666 px tall at 1,024 px
 * and over; v2.md R4): its title row (the mark, the deck's title and "9 slides"), the menu bar,
 * the filmstrip, the stage, the speaker notes and the status row. The document holds the title
 * row, the notes field holding slide 2's notes and the status row's resting sentence; the menu
 * bar, the filmstrip and the stage are V2's (`live/menus.ts`), drawn from the menu model and the
 * page deck when the band's chunk arrives after `load`. Edit > Undo is the band's Undo.
 */
export function HomeMenus() {
  const shown = HOME_DECK.slides.plan;
  return (
    <HomeSection id="menus">
      <BandHead id="menus" heading={MENUS.h2} lead={MENUS.lead} span={7} />
      <Reserve band="menus" className="ts-mini">
        <div
          className="ts-mini-editor pt-window"
          role="group"
          aria-label={MENUS.editorLabel}
          data-mini-editor
        >
          <div className="ts-mini-title">
            <svg
              className="ts-mini-mark"
              viewBox={MARK_VIEWBOX}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={MARK_PATH} />
            </svg>
            <span className="ts-mini-name" data-mini-title>
              {HOME_DECK.title}
            </span>
            <span className="ts-mini-count" data-mini-count>
              {MENUS.slides(HOME_DECK.order.length)}
            </span>
          </div>
          <nav className="ts-mini-menubar" data-menubar aria-label={MENUS.menusKey} />
          <div className="ts-mini-body">
            <ol
              className="ts-mini-filmstrip"
              data-mini-filmstrip
              aria-label={MENUS.filmstripLabel}
            />
            <div className="ts-mini-stage" data-mini-stage />
          </div>
          <label className="ts-mini-notes">
            <span className="ts-sr">{MENUS.notesLabel}</span>
            <textarea
              data-mini-notes
              rows={1}
              spellCheck={false}
              defaultValue={shown.notes}
              aria-label={MENUS.notesLabel}
            />
          </label>
          <div className="ts-mini-status">
            <span data-mini-status aria-live="polite">
              {MENUS.statusRest}
            </span>
            <span className="ts-mini-readout" data-mini-readout />
          </div>
        </div>
      </Reserve>
      <p className="ts-sr" aria-live="polite" data-announce />
    </HomeSection>
  );
}
