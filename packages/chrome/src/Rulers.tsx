import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import type { Box } from '@turboslide/viewer/Gestures';
import {
  PX_PER_INCH,
  RULER_SIZE_PX,
  rulerTicks,
  tickLength,
} from '@turboslide/viewer/rulers-model';
import type { RulerAxis, RulerUnit } from '@turboslide/viewer/rulers-model';

import { tipProps } from './Tooltip';

import './Rulers.css';

/**
 * The rulers of View > Show ruler (gslides-parity SPEC-2 6.1 row 29, 0.82, 0.108): along the top
 * and the left of the sheet in inches at the stage scale, the origin at the sheet's top left, a
 * tick every eighth of an inch, a numeral every whole inch (0 to 13 across, 0 to 7 down), the
 * selection's extent shaded, the pointer's position as a hairline on both, and a drag out of a
 * ruler that creates a guide at the drop (`onRulerDown`, the Editor writes deck.guides). Drawn
 * inside the overlay layer just outside the sheet's box, in CSS pixels, in the chrome's tokens:
 * hair ticks and titanium numerals, the shaded extent in the hair token at low alpha, the hairline
 * in ink. Each ruler is a focusable region named for the reader; the tick math is the viewer's
 * rulers-model.ts and rulers.test.tsx pins the counts.
 */
export type RulersProps = {
  /** the stage scale: sheet pixels times k are CSS pixels */
  k: number;
  /** the deck's page in sheet pixels, the rulers' length (gslides-parity SPEC-5 6.1); the default page when absent */
  page?: { width: number; height: number };
  /** the unit the numerals count in (the Preferences' units row, SPEC-5 6.1); inches when absent */
  unit?: RulerUnit;
  /** the pointer over the stage in sheet pixels, or null */
  pointer: { x: number; y: number } | null;
  /** the selection's bounding box in sheet pixels, or null */
  selection: Box | null;
  onRulerDown: (axis: RulerAxis, event: PointerEvent) => void;
};

function tickStyle(axis: RulerAxis, at: number, k: number, length: number): CSSProperties {
  return axis === 'x'
    ? { left: at * k, bottom: 0, height: length }
    : { top: at * k, right: 0, width: length };
}

/** The unit's words for the ruler tooltip (EDGE is the axis's edge). */
const UNIT_WORDS: Readonly<Record<RulerUnit, string>> = {
  in: `Inches from the slide's EDGE edge, ${PX_PER_INCH} px per inch.`,
  cm: `Centimetres from the slide's EDGE edge, ${Math.round((PX_PER_INCH / 2.54) * 100) / 100} px per centimetre.`,
  px: "Sheet pixels from the slide's EDGE edge, a numeral every hundred.",
};

function Ruler({
  axis,
  k,
  page,
  unit = 'in',
  pointer,
  selection,
  onRulerDown,
}: RulersProps & { axis: RulerAxis }) {
  const ticks = rulerTicks(axis, page, unit);
  const name = axis === 'x' ? 'Horizontal ruler' : 'Vertical ruler';
  const tip = tipProps({
    name,
    doc: `${UNIT_WORDS[unit].replace('EDGE', axis === 'x' ? 'left' : 'top')} Drag out of the ruler to add a guide.`,
  });
  const extent =
    selection === null
      ? null
      : axis === 'x'
        ? { start: selection[0] * k, size: selection[2] * k }
        : { start: selection[1] * k, size: selection[3] * k };
  const hair = pointer === null ? null : (axis === 'x' ? pointer.x : pointer.y) * k;
  return (
    <div
      className={`ts-ruler is-${axis}`}
      role="region"
      aria-label={name}
      tabIndex={-1}
      data-axis={axis}
      data-unit={unit}
      data-control={`ruler.${axis}`}
      {...tip}
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button === 0) onRulerDown(axis, e.nativeEvent);
      }}
    >
      {extent ? (
        <div
          className="ts-ruler-extent"
          style={
            axis === 'x'
              ? { left: extent.start, width: extent.size }
              : { top: extent.start, height: extent.size }
          }
          aria-hidden="true"
        />
      ) : null}
      {ticks.map((tick) => (
        <span
          key={tick.at}
          className="ts-ruler-tick"
          data-kind={tick.kind}
          style={tickStyle(axis, tick.at, k, tickLength(tick.kind))}
          aria-hidden="true"
        />
      ))}
      {ticks
        .filter((tick) => tick.kind === 'inch')
        .map((tick) => (
          <span
            key={`n${tick.at}`}
            className="ts-ruler-numeral"
            style={axis === 'x' ? { left: tick.at * k + 3 } : { top: tick.at * k + 2 }}
            aria-hidden="true"
          >
            {tick.label}
          </span>
        ))}
      {hair !== null ? (
        <span
          className="ts-ruler-hair"
          style={axis === 'x' ? { left: Math.round(hair) } : { top: Math.round(hair) }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

export function Rulers(props: RulersProps) {
  return (
    <>
      <Ruler {...props} axis="x" />
      <Ruler {...props} axis="y" />
      <div
        className="ts-ruler-corner"
        aria-hidden="true"
        style={{ width: RULER_SIZE_PX, height: RULER_SIZE_PX }}
      />
    </>
  );
}
