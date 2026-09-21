import type { FrameBand } from '@turboslide/render/stage';
import { counterText, positionClass } from '@turboslide/render/stage';

import { pad2 } from './model';

/**
 * The edge grid every slide sheet carries (SPEC 2.1; head:38-52): two rails
 * and two rules at 56px, four 11 by 11 registration crosses where they meet,
 * the wordmark bottom left and the counter bottom right inside the bottom
 * margin. The classes are the deck's (.frame, .rule, .cross, .wordmark,
 * .counter) and the CSS is the theme's sheet.css, so a rendered slide never
 * redraws them. The renderer emits the same markup from renderStage()
 * (SPEC 5.2); the React Frame exists so the counter follows the active slide
 * in the studio without a re-render of the slide's HTML. Thumbnail and page
 * clones pass wordmark={false} counter={false} to carry the grid alone.
 *
 * The brand kit's frame band (docs/PRODUCT.md 4.1, 4.4; build/b5.md R5): with
 * `band` the footer's logo is the kit's (the default mark, a picture fitted to
 * the 18 px slot, or none), moved to its corner, the footer text sits beside
 * it and the counter reads the kit's format; the class `ts-kit-wordmark`
 * matters, because the kit's override stylesheet hides a `.wordmark` without
 * it when the kit draws the footer itself (render/theme-css.ts), so a Frame
 * that carries the band never draws the GT mark twice. Without `band`, or with
 * the GT band, the Frame renders as it always did.
 */
export type FrameProps = {
  /** the 28 by 18 mark at the bottom left, drawn from the sprite's #gt-mark */
  wordmark?: boolean;
  /** the `01 / 85` counter at the bottom right */
  counter?: boolean;
  index?: number;
  total?: number;
  /** the brand kit's frame band (frameBandOf); the GT band when absent */
  band?: FrameBand;
};

export function Frame({ wordmark = true, counter = true, index = 0, total = 0, band }: FrameProps) {
  const kit = band !== undefined && band.kit;
  const n = Math.max(0, index) + 1;
  return (
    <>
      <div className="frame" aria-hidden="true">
        <div className="rule top" />
        <div className="rule bottom" />
        <span className="cross tl" />
        <span className="cross tr" />
        <span className="cross bl" />
        <span className="cross br" />
      </div>
      {wordmark && kit && band.logo.kind !== 'none' ? (
        <div
          className={`wordmark ts-kit-wordmark ${positionClass(band.logo.position)}${band.logo.kind === 'picture' ? ' is-picture' : ''}`}
          aria-hidden="true"
          style={band.logo.kind === 'picture' ? { width: band.logo.w } : undefined}
        >
          {band.logo.kind === 'picture' ? (
            <img src={band.logo.src} width={band.logo.w} height={band.logo.h} alt="" />
          ) : (
            <svg width={28} height={18} fill="currentColor" aria-hidden="true">
              <use href="#gt-mark" />
            </svg>
          )}
        </div>
      ) : wordmark && !kit ? (
        <div className="wordmark" aria-hidden="true">
          <svg width={28} height={18} fill="currentColor" aria-hidden="true">
            <use href="#gt-mark" />
          </svg>
        </div>
      ) : null}
      {wordmark && kit && band.text !== undefined ? (
        <div className="ts-kit-footer" aria-hidden="true">
          {band.text}
        </div>
      ) : null}
      {counter ? (
        <div className="counter">
          {kit ? counterText(n, total, band.counterFormat) : `${pad2(n)} / ${pad2(total)}`}
        </div>
      ) : null}
    </>
  );
}
