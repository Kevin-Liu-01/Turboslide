// The snap guides of the freeform stage: while a drag or a resize snaps to a rail, the content
// box, a seam, a plate edge or another block's edge or center, the overlay draws a 1px line in
// --pt-titanium over the sheet along the line the box took (this round's directive). A guide is a
// SnapLine from the snap engine with its extent already stretched to cover the source and the
// snapped box (snap.ts guideFor). `mergeGuides` folds duplicates so two blocks on the same edge
// draw one line. The component lives in the overlay layer in CSS pixels, never inside the sheet.
import type { CSSProperties } from 'react';

import type { SnapLine } from './snap';

import './Guides.css';

export type Guide = SnapLine;

/** Guides on the same axis at the same position become one, spanning both extents. */
export function mergeGuides(guides: readonly Guide[]): Guide[] {
  const out: Guide[] = [];
  for (const guide of guides) {
    const same = out.find((g) => g.axis === guide.axis && Math.abs(g.at - guide.at) < 0.5);
    if (same) {
      same.from = Math.min(same.from, guide.from);
      same.to = Math.max(same.to, guide.to);
      continue;
    }
    out.push({ ...guide });
  }
  return out;
}

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
