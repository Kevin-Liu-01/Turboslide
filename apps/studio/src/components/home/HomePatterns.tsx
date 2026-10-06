import { PATTERNS } from './copy';
import { BandHead, HomeSection } from './HomeSection';
import { HomeSheet } from './HomeSheet';

/**
 * Animated patterns (docs/LANDING.md 2.13, Kevin's pick "B: Animated patterns, a moving shader
 * beside its still frame"): the h2 and the lead in the left 7 of 12 columns, then slide 8 twice,
 * side by side at 500 by 281 px (stacked at 358 by 201 under 720 px), each with its label 8 px
 * above it: on the left the pattern moving, drawn by the product's shader in its own chunk; on
 * the right the still frame the exporter stores, the picture the PDF and the PowerPoint file
 * carry. Both sheets are placeholders in the band's reserved box (v4.md Q6), which the band's
 * chunk fills and V4's `live/pattern.ts` dresses.
 */
export function HomePatterns() {
  return (
    <HomeSection id="patterns">
      <BandHead id="patterns" heading={PATTERNS.h2} lead={PATTERNS.lead} span={7} />
      <div className="ts-patterns" data-reserve="patterns">
        <div className="ts-pattern" data-pattern="moving">
          <p className="ts-pattern-label">{PATTERNS.labels.moving}</p>
          <HomeSheet instance="patterns-moving" fill />
        </div>
        <div className="ts-pattern" data-pattern="still">
          <p className="ts-pattern-label">{PATTERNS.labels.still}</p>
          <HomeSheet instance="patterns-still" fill />
        </div>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce="" />
    </HomeSection>
  );
}
