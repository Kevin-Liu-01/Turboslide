import { useRef } from 'react';

import { rampInk } from '@turboslide/effects/ramp';

import { useMountEffect } from './lib/useMountEffect';
import { usePtShell } from './shell-context';

import './Progress.css';

/**
 * The 2px hairline under the stage, ported from
 * Prototemplate/src/components/viewer/Progress.tsx. On paged routes it fills
 * to (index + 1) / total, written as an inline transform so the server
 * render already carries it. On flow routes it follows the scroll position
 * of the scrolling box inside .pt-stagewrap, read from one passive listener
 * on the document in the capture phase (scroll events do not bubble). The
 * listener is always attached because a route can change tables with its
 * mode; it reads the key table through a ref at event time and returns at
 * once on a paged route. The rest is coalesced to one animation frame and
 * written straight to the fill's transform, so a scroll never renders React
 * (directive 7.5). A value prop overrides both.
 *
 * Round four (gslides-parity SPEC-4 0.15, 1.9): the fill's leading sixteen cells are the deck's
 * own ramp (`rampInk`, packages/effects/src/ramp.ts) behind `--ts-cell`, applied as a mask on the
 * fill's end, so the threshold map is fixed and only the length moves. The fill is therefore a
 * full width span moved with translateX (its right end is the leading edge and stays
 * unstretched) instead of scaleX, and the track clips it; the track stays the 2 px
 * --pt-hair-soft line of the port, one cell row tall.
 */
export type ProgressProps = {
  /** 0 to 1; replaces the shell-derived fraction */
  value?: number;
};

/** The leading edge: sixteen cells of the ramp, one cell row (the track is one cell tall). */
export const RAMP_EDGE_CELLS = 16;

function clamp(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

/** The fill's transform for a fraction: hidden at 0 (moved out by its whole width), in place at 1. */
export function shiftOf(fraction: number): string {
  const hidden = Math.round((1 - fraction) * 10000) / 100;
  return `translateX(-${hidden}%)`;
}

/**
 * The ramp's threshold map for the leading edge as an SVG mask (one cell per unit): a cell is
 * kept where `rampInk` is true, solid ink at the first cell and paper at the last, the deck's
 * drawDither in one row. The sheet scales it to sixteen `--ts-cell` squares (Progress.css).
 */
export function rampEdgeMask(cells: number = RAMP_EDGE_CELLS): string {
  const rects: string[] = [];
  for (let x = 0; x < cells; x += 1) {
    if (rampInk(x, 0, cells)) rects.push(`<rect x="${x}" y="0" width="1" height="1"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cells} 1" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/* the two mask layers: the solid body and the ramp at the end; built once per module */
const FILL_MASK = `linear-gradient(#000, #000), ${rampEdgeMask()}`;

export function Progress({ value }: ProgressProps) {
  const shell = usePtShell();
  const fill = useRef<HTMLElement>(null);

  const paged = shell.total > 0 && shell.index >= 0 ? (shell.index + 1) / shell.total : 0;
  /* the fraction React owns: a value, or the paged place; null while a flow route's scroll owns it */
  const fixed = value !== undefined ? clamp(value) : shell.keys === 'paged' ? clamp(paged) : null;

  /* the scroll listener reads these at event time */
  const fixedRef = useRef(fixed);
  fixedRef.current = fixed;

  useMountEffect(() => {
    let frame = 0;
    let next = 0;
    const paint = () => {
      frame = 0;
      const el = fill.current;
      if (el && fixedRef.current === null) el.style.transform = shiftOf(next);
    };
    const onScroll = (event: Event) => {
      if (fixedRef.current !== null) return;
      const box = event.target;
      if (!(box instanceof HTMLElement)) return;
      if (!box.closest('.pt-stagewrap')) return;
      const range = box.scrollHeight - box.clientHeight;
      next = range > 0 ? clamp(box.scrollTop / range) : 0;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  });

  return (
    <div className="pt-progress" aria-hidden="true">
      <i
        ref={fill}
        style={{
          maskImage: FILL_MASK,
          WebkitMaskImage: FILL_MASK,
          ...(fixed !== null ? { transform: shiftOf(fixed) } : {}),
        }}
      />
    </div>
  );
}
