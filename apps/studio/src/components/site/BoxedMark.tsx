import { ROWS16_PATH } from '@turboslide/theme/brand';

/**
 * The mark Kevin picked for the pages (docs/SITE.md, problem L10 of the brief): the T in a box,
 * drawn the way the tab icon draws it (`apps/studio/public/icon.svg`, written by
 * scripts/build-brand.ts): the 16 px rows of `ROWS16_PATH` in ink on a paper plate with a 1 px
 * frame in the edge composite, so the plate, the frame and the ink follow the appearance through
 * the tokens (site.css `.site-mark`). 24 px in the bar and 32 px in the footer; whole pixels, so
 * `crispEdges` keeps every row sharp. The lockup's word names it, so the svg is hidden.
 */
export function BoxedMark({ size }: { size: 24 | 32 }) {
  return (
    <svg
      className="site-mark"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="site-mark-plate" width="16" height="16" />
      <rect className="site-mark-frame" x="0.5" y="0.5" width="15" height="15" />
      <path className="site-mark-ink" d={ROWS16_PATH} />
    </svg>
  );
}
