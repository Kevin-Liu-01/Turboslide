import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

import type { DeckGuides as DeckGuideLists } from '@turboslide/schema/deck';
import type { DraggingGuide } from '@turboslide/viewer/Editor';

import { GUIDES } from './menus/strings';
import { tipProps } from './Tooltip';

import './DeckGuides.css';

/**
 * The deck's guide lines (gslides-parity SPEC-2 6.1 row 30, 2.10, 0.108): View > Guides > Show
 * guides draws every guide of `Deck.guides` across the sheet in the overlay layer, titanium and
 * dashed, on every slide and never in a thumbnail, the presentation or a download. A guide takes
 * the pointer: a drag moves it (the Editor writes deck.guides move on the release, showing the
 * position in inches meanwhile), a right-click opens its menu (Delete guide, Edit guides greyed).
 * The viewer's Guides.tsx stays the snap lines a gesture draws; this module is the chrome's,
 * named after the deck's field. deck-guides.test.tsx pins it.
 */
export type DeckGuidesProps = {
  guides: DeckGuideLists;
  /** the stage scale */
  k: number;
  /** the guide being dragged, drawn at its live position with the inch readout */
  dragging: DraggingGuide | null;
  onGuideDown: (axis: 'x' | 'y', at: number, event: PointerEvent) => void;
  onGuideContextMenu: (axis: 'x' | 'y', at: number, event: MouseEvent) => void;
};

/** The hit thickness of a guide line in CSS pixels; the drawn rule is 1px. */
export const GUIDE_HIT_PX = 7;

function lineStyle(axis: 'x' | 'y', at: number, k: number): CSSProperties {
  return axis === 'x'
    ? { left: Math.round(at * k) - Math.floor(GUIDE_HIT_PX / 2), top: 0, height: '100%' }
    : { top: Math.round(at * k) - Math.floor(GUIDE_HIT_PX / 2), left: 0, width: '100%' };
}

export function DeckGuides({
  guides,
  k,
  dragging,
  onGuideDown,
  onGuideContextMenu,
}: DeckGuidesProps) {
  const lines: { axis: 'x' | 'y'; at: number }[] = [
    ...guides.x.map((at) => ({ axis: 'x' as const, at })),
    ...guides.y.map((at) => ({ axis: 'y' as const, at })),
  ];
  /* the guide's colour (gslides-parity SPEC-5 7.7 Edit guides): `guides.colors` keyed `x:800`,
     the titanium dash when none is stored; the CSS reads the custom property */
  const colorOf = (axis: 'x' | 'y', at: number): string | undefined =>
    guides.colors?.[`${axis}:${Math.round(at)}`];
  return (
    <>
      {lines.map((line) => {
        const live =
          dragging !== null && dragging.axis === line.axis && dragging.from === line.at
            ? dragging.at
            : line.at;
        const tip = tipProps({
          name: line.axis === 'x' ? 'Vertical guide' : 'Horizontal guide',
          doc: `At ${GUIDES.inches(live)}. Drag to move it; right-click for Delete guide.`,
        });
        return (
          <div
            key={`${line.axis}:${line.at}`}
            className="ts-deck-guide"
            role="separator"
            aria-orientation={line.axis === 'x' ? 'vertical' : 'horizontal'}
            aria-label={`${line.axis === 'x' ? 'Vertical guide' : 'Horizontal guide'} at ${GUIDES.inches(live)}`}
            tabIndex={-1}
            data-axis={line.axis}
            data-at={line.at}
            data-control={`guide.${line.axis}.${line.at}`}
            data-color={colorOf(line.axis, line.at)}
            style={{
              ...lineStyle(line.axis, live, k),
              ...(colorOf(line.axis, line.at) === undefined
                ? {}
                : { ['--ts-guide-color' as string]: `var(--pt-${colorOf(line.axis, line.at)})` }),
            }}
            {...tip}
            onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
              if (e.button === 0) onGuideDown(line.axis, line.at, e.nativeEvent);
            }}
            onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) => {
              onGuideContextMenu(line.axis, line.at, e.nativeEvent);
            }}
          />
        );
      })}
      {dragging ? (
        <>
          {dragging.from === undefined ? (
            <div
              className="ts-deck-guide is-new"
              aria-hidden="true"
              data-axis={dragging.axis}
              style={lineStyle(dragging.axis, dragging.at, k)}
            />
          ) : null}
          <span
            className="ts-guide-readout"
            role="status"
            style={
              dragging.axis === 'x'
                ? { left: Math.round(dragging.at * k) + 6, top: 6 }
                : { top: Math.round(dragging.at * k) + 6, left: 6 }
            }
          >
            {dragging.label}
          </span>
        </>
      ) : null}
    </>
  );
}
