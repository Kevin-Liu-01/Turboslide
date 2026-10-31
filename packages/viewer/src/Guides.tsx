// The snap guides of the freeform stage: while a drag or a resize snaps to a rail, the content
// box, a seam, a plate edge or another block's edge or center, the overlay draws a 1px line in
// --pt-guide over the sheet along the line the box took (Guides.css; --pt-titanium until round
// four, when the orchestrator's ruling 1 gave the guides their own colour). A guide is a SnapLine
// from the snap engine with its extent already stretched to cover the source and the snapped box
// (schema/geometry.ts guideFor). `mergeGuides` (schema/geometry.ts, re-exported here) folds
// duplicates so two blocks on the same edge draw one line. The component lives in the overlay
// layer in CSS pixels, never inside the sheet.
import type { CSSProperties } from 'react';

import { mergeGuides } from '@turboslide/schema/geometry';

import type { SnapLine } from './snap';

import './Guides.css';

export { mergeGuides } from '@turboslide/schema/geometry';

export type Guide = SnapLine;

/** The CSS placement of one guide: a 1px line at `at` from `from` to `to`, in CSS pixels. */
export function guideStyle(guide: Guide, k: number): CSSProperties {
  if (guide.axis === 'x') {
    return {
      left: Math.round(guide.at * k),
      top: guide.from * k,
      height: (guide.to - guide.from) * k,
    };
  }
  return {
    top: Math.round(guide.at * k),
    left: guide.from * k,
    width: (guide.to - guide.from) * k,
  };
}

export type GuideLinesProps = { guides: readonly Guide[]; k: number };

/** The guide lines, titanium 1px, one per merged guide. */
export function GuideLines({ guides, k }: GuideLinesProps) {
  const merged = mergeGuides(guides);
  return (
    <>
      {merged.map((guide) => (
        <div
          key={`${guide.axis}:${guide.at}`}
          className="ts-guide"
          data-axis={guide.axis}
          data-kind={guide.kind}
          style={guideStyle(guide, k)}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
