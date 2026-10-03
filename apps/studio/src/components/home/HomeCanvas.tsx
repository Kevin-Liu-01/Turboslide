import { CANVAS } from './copy';
import { BandHead, HomeSection } from './HomeSection';
import { HomeSheet } from './HomeSheet';

/**
 * Everything on a slide moves (docs/LANDING.md 2.6, band 4): slide 6, the Rosetta Stone (Kevin's
 * answer 1), at the column's width, unframed, printed through the 8 by 8 screen at 2 px cells
 * with its plate lower right (the plate, the heading, the text and the credit each an object).
 * Under it two ruled rows: Layout (Mood until the first gesture turns the slide into a canvas) with
 * Undo, and Command, whose `code` element is set in Inter, so monospace stays on the agents band's
 * one panel (SPEC-4 0.20); at rest it reads the resting sentence, and each gesture's end prints
 * its CLI line there (L2's `live/log.ts`, push 2). Hooks: integrator.md 4.1.
 */
export function HomeCanvas() {
  return (
    <HomeSection id="canvas">
      <BandHead id="canvas" heading={CANVAS.h2} lead={CANVAS.lead} span={7} />
      <HomeSheet instance="canvas" className="ts-canvas-sheet" />
      <div className="ts-rows ts-canvas-rows">
        <div className="ts-row">
          <span className="ts-row-key">{CANVAS.layoutKey}</span>
          <span className="ts-row-value ts-strong" data-layout-row>
            {CANVAS.layout.mood}
          </span>
          <button type="button" className="ts-text-button" data-undo="canvas">
            {CANVAS.undo}
          </button>
        </div>
        <div className="ts-row ts-command-row">
          <span className="ts-row-key">{CANVAS.commandKey}</span>
          <code className="ts-command" data-log>
            {CANVAS.commandRest}
          </code>
        </div>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce />
    </HomeSection>
  );
}
