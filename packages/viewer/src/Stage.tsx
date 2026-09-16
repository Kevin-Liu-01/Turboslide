import { useMemo } from 'react';

import { Frame } from './Frame';
import { isPictureKind } from './model';
import type { ViewerSlide } from './model';
import { Sheet } from './Sheet';
import { SlideView } from './SlideView';
import type { Theme } from './theme';

import './Stage.css';

export type StageProps = {
  /** the active slide; undefined while the deck is empty */
  slide: ViewerSlide | undefined;
  /** 0-based position of the active slide and the deck's length, for the counter */
  index: number;
  total: number;
  /** the stage box, measured by the shell's ResizeObserver */
  stageSize: { width: number; height: number };
  /** the shell's mode: the picture backdrop and the sheet show in slide mode only */
  mode: 'slide' | 'grid' | 'book';
  present: boolean;
  narrow: boolean;
  theme: Theme;
  dir: 'next' | 'prev';
  onStep?: (delta: number) => void;
  /** the deck's page in sheet pixels (gslides-parity SPEC-5 6.1); 1600 by 900 when absent */
  page?: { width: number; height: number };
};

/**
 * The stage in slide mode (SPEC 5.5): the theme's .ts-sheet root over the
 * whole stage box carrying the tokens and the theme attribute, the backdrop
 * for full-picture slides (head:249-254), the fitted .sheet with the frame
 * (rails, crosses, wordmark, counter) and the rendered slide. The grid and
 * the book are siblings the shell renders over the stage while their mode is
 * up; the sheet hides then, so the fixed stage keeps its fit.
 */
export function Stage({
  slide,
  index,
  total,
  stageSize,
  mode,
  present,
  narrow,
  theme,
  dir,
  onStep,
  page,
}: StageProps) {
  const picture = slide && isPictureKind(slide.kind) ? slide.picture : undefined;
  const isPicture = Boolean(picture) && mode === 'slide';
  const backdropSrc = useMemo(
    () => (picture ? (theme === 'dark' ? picture.dark : picture.light) : undefined),
    [picture, theme],
  );
  /* present mode: the sheet alone on the show's surround (gslides-parity SPEC 9.2) */
  const classes = ['ts-stagewrap', 'ts-sheet'];
  if (isPicture) classes.push('is-picture');
  if (present) classes.push('is-present');
  return (
    <div className={classes.join(' ')} data-theme={theme} data-present={present ? '' : undefined}>
      <div className="backdrop" aria-hidden="true">
        {backdropSrc ? <img src={backdropSrc} alt="" /> : null}
      </div>
      <Sheet
        stageSize={stageSize}
        present={present}
        narrow={narrow}
        dir={dir}
        onStep={onStep}
        hidden={mode !== 'slide'}
        page={page}
      >
        <Frame index={index} total={total} />
        {slide ? <SlideView slideId={slide.id} html={slide.html} theme={theme} /> : null}
      </Sheet>
    </div>
  );
}
