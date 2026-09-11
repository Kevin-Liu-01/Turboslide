import type { ReactNode } from 'react';

import { Frame } from '@turboslide/viewer/Frame';
import { isPictureKind } from '@turboslide/viewer/model';
import type { ViewerSlide } from '@turboslide/viewer/model';
import { Sheet } from '@turboslide/viewer/Sheet';
import { SlideView } from '@turboslide/viewer/SlideView';
import type { Theme } from '@turboslide/viewer/theme';

import { cn } from './lib/cn';

import './TwinStage.css';

/**
 * The twin view (SPEC 6.8): the stage split into two sheets at half scale,
 * light on the left and dark on the right, each its own `.ts-sheet[data-theme]`
 * root, both driven by the same document, so the grammar's rule "look at both
 * themes after every edit" is a permanent view instead of a toggle. New in
 * Turboslide (no Prototemplate source); the pane is the viewer's Stage
 * (packages/viewer/src/Stage.tsx) with the theme fixed per pane and an
 * `overlay` slot for the editor's selection ring and lint boxes, rendered
 * inside each scaled stage so they follow the sheet on both sides.
 */

/** The gap between the two panes, in px. */
export const TWIN_GAP = 16;

/** The caption row under each pane, in px; TwinStage.css fixes the grid row to it. */
export const TWIN_LABEL_H = 24;

/** Light left, dark right (SPEC 6.8). */
export const TWIN_THEMES: readonly Theme[] = ['light', 'dark'];

export type StageBox = { width: number; height: number };

export type TwinStageProps = {
  /** the active slide; undefined while the deck is empty */
  slide: ViewerSlide | undefined;
  /** 0-based position of the active slide and the deck's length, for the counters */
  index: number;
  total: number;
  /** the stage box, measured by the shell's ResizeObserver */
  stageSize: StageBox;
  /** window.innerWidth at or below 900: the sheets sit under the toolbar with a 12px pad */
  narrow: boolean;
  dir: 'next' | 'prev';
  /** a click on a half of either sheet pages by one */
  onStep?: (delta: number) => void;
  /** the editor's overlay for one pane (selection ring, lint boxes; SPEC 6.4), drawn inside the scaled stage */
  overlay?: (theme: Theme) => ReactNode;
  /** the Light and Dark captions under the panes; on by default */
  labels?: boolean;
};

/** The box one pane fits its sheet into: half the stage less the gap, less the caption row. */
export function twinPaneSize(stageSize: StageBox, labels = true, gap = TWIN_GAP): StageBox {
  return {
    width: Math.max(0, Math.floor((stageSize.width - gap) / 2)),
    height: Math.max(0, stageSize.height - (labels ? TWIN_LABEL_H : 0)),
  };
}

type PaneProps = {
  theme: Theme;
  slide: ViewerSlide | undefined;
  index: number;
  total: number;
  paneSize: StageBox;
  narrow: boolean;
  dir: 'next' | 'prev';
  onStep?: (delta: number) => void;
  overlay?: (theme: Theme) => ReactNode;
  label: boolean;
};

/**
 * One pane: the theme's tokens root (`.ts-sheet[data-theme]`, SPEC 5.1) filling the pane's
 * stage box, the backdrop the theme's stage.css shows for a full-picture slide (head:249-254),
 * the fitted sheet with the frame, the slide and the overlay. The pane paints no ground of its
 * own: the stage's plate shows around both sheets and each sheet draws its own edge ring.
 */
function TwinPane({
  theme,
  slide,
  index,
  total,
  paneSize,
  narrow,
  dir,
  onStep,
  overlay,
  label,
}: PaneProps) {
  const picture = slide && isPictureKind(slide.kind) ? slide.picture : undefined;
  const backdropSrc = picture ? (theme === 'dark' ? picture.dark : picture.light) : undefined;
  return (
    <div className="ts-twin-pane" data-twin-theme={theme}>
      <div className="ts-twin-stage">
        <div className={cn('ts-twin-root ts-sheet', picture && 'is-picture')} data-theme={theme}>
          <div className="backdrop" aria-hidden="true">
            {backdropSrc ? <img src={backdropSrc} alt="" /> : null}
          </div>
          <Sheet
            stageSize={paneSize}
            present={false}
            narrow={narrow}
            dir={dir}
            onStep={onStep}
            edges={false}
          >
            <Frame index={index} total={total} />
            {slide ? <SlideView slideId={slide.id} html={slide.html} theme={theme} /> : null}
            {overlay ? overlay(theme) : null}
          </Sheet>
        </div>
      </div>
      {label ? <span className="ts-twin-label">{theme === 'light' ? 'Light' : 'Dark'}</span> : null}
    </div>
  );
}

export function TwinStage({
  slide,
  index,
  total,
  stageSize,
  narrow,
  dir,
  onStep,
  overlay,
  labels = true,
}: TwinStageProps) {
  const paneSize = twinPaneSize(stageSize, labels);
  return (
    <div
      className={cn('ts-twin', !labels && 'no-labels')}
      data-twin="on"
      role="group"
      aria-label="The slide in the light and the dark theme"
    >
      {TWIN_THEMES.map((theme) => (
        <TwinPane
          key={theme}
          theme={theme}
          slide={slide}
          index={index}
          total={total}
          paneSize={paneSize}
          narrow={narrow}
          dir={dir}
          onStep={onStep}
          overlay={overlay}
          label={labels}
        />
      ))}
    </div>
  );
}
