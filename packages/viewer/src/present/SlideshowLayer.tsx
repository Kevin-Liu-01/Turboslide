import type { Ref } from 'react';

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

/** The dot's place for a pointer position: the show writes it straight to the dot's style. */
export function laserTransform(x: number, y: number): string {
  return `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/**
 * The dot drawn at `x` and `y`; the show moves it afterwards through `ref` with `laserTransform`,
 * one style write a frame, so a pointer move never renders the show (the presenter audit of
 * a95d4097d, item 3).
 */
export function LaserPointer({ x, y, ref }: { x: number; y: number; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className="ts-present-laser"
      data-control="present.laserDot"
      aria-hidden="true"
      style={{ transform: laserTransform(x, y) }}
    />
  );
}
