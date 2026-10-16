import { useRef } from 'react';
import type { CSSProperties } from 'react';

import { ROWS16, rowRuns } from '@turboslide/theme/brand';

import { useMountEffect } from '../useMountEffect';

/** The ink runs of the 16 px drawing and its first ink row, the row the build counts from. */
const RUNS = rowRuns(ROWS16);
const FIRST_ROW = Math.min(...RUNS.map((run) => run.y));

const REDUCED = '(prefers-reduced-motion: reduce)';

/**
 * The footer's mark (docs/SITE.md, the footer): the T in a box drawn from the 16 px rows of
 * `ROWS16` in packages/theme/src/brand.ts, one rectangle per run, on the plate and frame of
 * BoxedMark. When it first comes into view the rows build from the top, each run drawn from its
 * left end, and then the T slides out to the right and back in from the left, once (site.css,
 * `site-mark-build` and `site-mark-slide`). It plays again when the link it sits in is hovered or
 * focused, pauses while it is off screen, and under prefers-reduced-motion it never plays: the
 * finished mark is drawn, as it is without script. Every edge is a whole pixel of the 16 px grid,
 * so at 48 and 80 px (3 and 5 times) `crispEdges` keeps it sharp. The lockup's word names it.
 */
export function AnimatedMark({ size }: { size: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useMountEffect(() => {
    const svg = ref.current;
    if (svg === null) return;
    const host = svg.closest('a') ?? svg;
    const reduced = window.matchMedia(REDUCED);
    let played = false;
    const play = (): void => {
      if (reduced.matches) return;
      played = true;
      svg.removeAttribute('data-play');
      /* a style flush between the two writes, so the animations start again from the first row */
      void svg.getBoundingClientRect();
      svg.setAttribute('data-play', '');
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) return;
        svg.toggleAttribute('data-paused', !entry.isIntersecting);
        if (!played && entry.intersectionRatio >= 0.5) play();
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(svg);
    host.addEventListener('pointerenter', play);
    host.addEventListener('focus', play);
    return () => {
      observer.disconnect();
      host.removeEventListener('pointerenter', play);
      host.removeEventListener('focus', play);
    };
  });
  return (
    <svg
      ref={ref}
      className="site-mark site-mark-live"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="site-mark-plate" width="16" height="16" />
      {/* the inner square clips the T while it slides, so it never crosses the frame */}
      <svg x="1" y="1" width="14" height="14" viewBox="1 1 14 14" overflow="hidden">
        <g className="site-mark-ink site-mark-slide">
          {RUNS.map((run) => (
            <rect
              key={`${run.x}.${run.y}`}
              className="site-mark-run"
              x={run.x}
              y={run.y}
              width={run.width}
              height="1"
              style={{ '--row': run.y - FIRST_ROW } as CSSProperties}
            />
          ))}
        </g>
      </svg>
      <rect className="site-mark-frame" x="0.5" y="0.5" width="15" height="15" />
    </svg>
  );
}
