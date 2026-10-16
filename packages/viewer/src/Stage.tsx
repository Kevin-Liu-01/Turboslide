import { useMemo } from 'react';

import type { ShaderPalette } from '@turboslide/materials/presets';
import type { FrameBand } from '@turboslide/render/stage';
import { bandForSlide } from '@turboslide/render/stage';

import { Frame } from './Frame';
import { isPictureKind } from './model';
import type { ViewerSlide } from './model';
import { ShaderLayer } from './present/ShaderLayer';
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
  /** the brand kit's frame band (docs/archive/rounds/PRODUCT.md 4.1): the footer logo, the footer text and the counter's format */
  band?: FrameBand;
  /** the deck's shader palette (ViewerDeck.palette), for the live shader the ShaderLayer plays */
  palette?: ShaderPalette | undefined;
};

/**
 * The stage in slide mode (SPEC 5.5): the theme's .ts-sheet root over the
 * whole stage box carrying the tokens and the theme attribute, the backdrop
 * for full-picture slides (head:249-254), the fitted .sheet with the frame
 * (rails, crosses, wordmark, counter) and the rendered slide. The grid and
 * the book are siblings the shell renders over the stage while their mode is
 * up; the sheet hides then, so the fixed stage keeps its fit. In slide mode the ShaderLayer
 * plays the slide's largest shader under its Playback and the viewer's settings (the shader
 * design 3.3).
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
  band,
  palette,
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
      >
        {/* the counter follows Insert > Slide numbers through the slide's `counter` (the viewer
            deck builder reads render/deck.ts slideCounter), as the editor stage does */}
        <Frame
          index={index}
          total={total}
          counter={slide?.counter ?? true}
          {...(band === undefined ? {} : { band: bandForSlide(band, slide) })}
        />
        {slide ? (
          <SlideView
            slideId={slide.id}
            html={slide.html}
            theme={theme}
            {...(mode === 'slide'
              ? {
                  layer: (body) => (
                    <ShaderLayer
                      body={body}
                      html={slide.html}
                      play={slide.play}
                      palette={palette}
                    />
                  ),
                }
              : {})}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
