import { tipProps } from '@turboslide/chrome/Tooltip';

import { HOME_FORMAT_PANEL } from './chrome.generated';
import { CANVAS } from './copy';
import { HOME_DECK } from './deck.generated';
import { BAND_CONTROLS, CANVAS_ROUND } from './design-copy';
import { BandHead, HomeSection, Reserve } from './HomeSection';
import { HomeSheet } from './HomeSheet';

/**
 * Everything on a slide moves (docs/DESIGN.md 8.5; docs/LANDING.md 2.6, Kevin's pick "A: the
 * dithered lighthouse slide with draggable objects"): slide 6, the Louisbourg lighthouse, printed
 * through the 8 by 8 screen at 2 px cells with its plate lower right (the plate, the heading, the
 * text and the credit each an object), and beside it the product's Format options panel as a live
 * readout in the panel's own words (`HOME_FORMAT_PANEL`, read from the editor at build): the
 * object's Size & rotation (Width, Height, Rotate) and Position (X, Y) in tabular figures, in
 * slide units; Layout (Mood until the first gesture turns the slide into a canvas); and Command,
 * where each gesture's end prints its CLI line in the code face on the panel's code surface (L2's
 * `live/log.ts`). The fields show the plate at rest and then the object the visitor touched, as a
 * drag, a resize or a turn changes it, and each section's head takes the panel's glyph
 * (`live/readout.ts`, from the landing's sprite). The panel's Undo is the band's. The slide is the
 * band's reserved box: its chunk writes it after `load` (4.2).
 */
const PLATE = HOME_DECK.slides.lighthouse.objects[0];

/** A field of the readout: its label and its value in tabular figures. */
function Field({ label, k, value }: { label: string; k: string; value: number }) {
  return (
    <div className="ts-fo-f">
      <span>{label}</span>
      <output className="pt-num" data-fo={k}>
        {Math.round(value)}
      </output>
    </div>
  );
}

export function HomeCanvas() {
  const box = PLATE?.box ?? { x: 0, y: 0, w: 0, h: 0, rot: 0 };
  return (
    <HomeSection id="canvas">
      <BandHead id="canvas" heading={CANVAS.h2} lead={CANVAS.lead} span="split" />
      <div className="ts-canvas-grid">
        <Reserve band="canvas" className="ts-canvas-reserve">
          <HomeSheet instance="canvas" fill className="ts-canvas-sheet" />
        </Reserve>
        <aside className="ts-fo pt-window" aria-label={CANVAS_ROUND.panelLabel}>
          <div className="ts-fo-head">
            <h3>{HOME_FORMAT_PANEL.title}</h3>
            <button
              type="button"
              className="pt-ib pt-icon"
              data-undo="canvas"
              aria-label={BAND_CONTROLS.undo}
              {...tipProps(BAND_CONTROLS.undo)}
            >
              <i className="ts-icon" data-icon="arrow-uturn-left" />
            </button>
          </div>
          <h4>{HOME_FORMAT_PANEL.size}</h4>
          <Field label={HOME_FORMAT_PANEL.width} k="w" value={box.w} />
          <Field label={HOME_FORMAT_PANEL.height} k="h" value={box.h} />
          <Field label={HOME_FORMAT_PANEL.rotate} k="r" value={box.rot} />
          <h4>{HOME_FORMAT_PANEL.position}</h4>
          <Field label={HOME_FORMAT_PANEL.x} k="x" value={box.x} />
          <Field label={HOME_FORMAT_PANEL.y} k="y" value={box.y} />
          <div className="ts-fo-row">
            <h4>{HOME_FORMAT_PANEL.layout}</h4>
            <output data-layout-row="">{CANVAS.layout.mood}</output>
          </div>
          <h4>{CANVAS_ROUND.command}</h4>
          <code className="ts-command" data-log="">
            {CANVAS.commandRest}
          </code>
        </aside>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce="" />
    </HomeSection>
  );
}
