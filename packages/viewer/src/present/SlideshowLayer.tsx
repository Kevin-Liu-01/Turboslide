import type { BlankSlide } from './presentModel';
import { PRESENT_TEXT } from './strings';

import './SlideshowLayer.css';

/**
 * The two layers a show draws over the sheet (gslides-parity SPEC 9.2): the blank black or white
 * slide (B or . and W or ,; any key or a click returns) and the laser pointer, a 12 px ink dot with
 * a paper ring that follows the pointer (the chrome has no red). Both are fixed to the viewport so
 * they cover whatever is around the sheet; the dot never takes the pointer.
 */
export function BlankLayer({ blank, onDismiss }: { blank: BlankSlide; onDismiss: () => void }) {
  return (
    <div
      className="ts-present-blank"
      data-blank={blank}
      data-control="present.blank"
      role="img"
      aria-label={PRESENT_TEXT.blankSlide(blank)}
      onClick={onDismiss}
    />
  );
}

export function LaserPointer({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="ts-present-laser"
      data-control="present.laserDot"
      aria-hidden="true"
      style={{ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)` }}
    />
  );
}
