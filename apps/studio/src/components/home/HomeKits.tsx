import { KITS } from './copy';
import type { KitId } from './copy';
import { HOME_DECK } from './deck.generated';
import { BandHead, HomeSection, Reserve } from './HomeSection';

/**
 * Brand kits restyle every slide (docs/LANDING.md 2.8, Kevin's pick "C: Brand kits restyle every
 * slide, GT Kestrel Globex, type a colour"): the h2 and the lead in the left 5 of 12 columns, the
 * two ruled rows in the right 7 (the three swatches, `aria-pressed`, and the Background field
 * with its description and Undo; the status line, empty at rest), then the whole deck as a grid
 * of nine thumbnails in the band's reserved box, written by its chunk after `load` (v2.md R5).
 * The swatches' behaviour, the typed colour and the grid's slides are V2's (`live/kits.ts`).
 */
const SWATCHES: readonly { id: KitId; pressed: boolean }[] = [
  { id: 'gt', pressed: true },
  { id: 'kestrel', pressed: false },
  { id: 'globex', pressed: false },
];

export function HomeKits() {
  return (
    <HomeSection id="kits">
      <div className="ts-kits-top">
        <BandHead id="kits" heading={KITS.h2} lead={KITS.lead} span={5} />
        <div className="ts-home-rows ts-kits-rows">
          <div className="ts-row">
            <span className="ts-row-key">{KITS.kitsKey}</span>
            <span className="ts-home-kits" role="group" aria-label={KITS.kitsKey}>
              {SWATCHES.map((kit) => (
                <button
                  key={kit.id}
                  type="button"
                  className="ts-home-kit"
                  data-kit={kit.id}
                  aria-pressed={kit.pressed}
                  data-tip={KITS.kits[kit.id].tip}
                >
                  <span className="ts-home-kit-swatch" aria-hidden="true">
                    <i />
                  </span>
                  {KITS.kits[kit.id].name}
                </button>
              ))}
            </span>
          </div>
          <div className="ts-row">
            <label className="ts-row-key" htmlFor="ts-kit-color">
              {KITS.backgroundKey}
            </label>
            <input
              id="ts-kit-color"
              className="ts-field ts-kit-color"
              type="text"
              maxLength={7}
              placeholder={KITS.backgroundPlaceholder}
              spellCheck={false}
              autoComplete="off"
              aria-describedby="ts-kit-color-help"
              data-kit-color
            />
            <button type="button" className="ts-text-button" data-undo="kits">
              {KITS.undo}
            </button>
          </div>
          <p className="ts-caption" id="ts-kit-color-help">
            {KITS.backgroundHelp}
          </p>
          <p className="ts-kit-status" data-kit-status aria-live="polite" />
        </div>
      </div>
      <Reserve band="kits" className="ts-kits-reserve">
        <ol className="ts-kit-grid" data-kit-grid aria-label={KITS.gridLabel}>
          {HOME_DECK.order.map((id) => (
            <li key={id} className="ts-kit-thumb" data-thumb={id}>
              <span className="ts-home-thumb-n" data-thumb-n aria-hidden="true">
                {HOME_DECK.slides[id].n}
              </span>
              <div className="ts-home-sheet is-thumb" data-sheet={`kits-${id}`} />
            </li>
          ))}
        </ol>
      </Reserve>
      <p className="ts-sr" aria-live="polite" data-announce />
    </HomeSection>
  );
}
