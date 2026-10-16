import type { RefObject } from 'react';

import type { ShaderPalette } from '@turboslide/materials/presets';
import type { PlayMode } from '@turboslide/schema/deck';

import { EDITOR_SHADER_FPS, MaterialMount } from '../MaterialMount';

/**
 * The live shader of the show and the viewer (the shader design 3.3 and 3.6; the file
 * docs/archive/rounds/FEATURES.md 5.6 planned): a thin layer over `MaterialMount` in show mode for
 * the body of the visible slide. live-plan.ts decides: the slide's Playback, then the person's
 * Reduce motion and Play animated patterns, which can only hold; under play the largest root that
 * can run plays at 30 frames per second through the frame pacer, at most 3200 by 1800 pixels, and
 * a hidden tab or a stage out of view stops drawing. Every other root draws its still. Stage.tsx
 * mounts it for the viewer, the embed and a read only show; an editor that presents passes show
 * mode to its own mount. The presenter console's previews never mount it.
 */
export type ShaderLayerProps = {
  /** the visible slide's body, which the renderer's HTML was set on */
  body: RefObject<HTMLElement | null>;
  /** the body's HTML; a change remounts */
  html: string;
  /** the slide's Playback (`slidePlay`); play when absent */
  play?: PlayMode | undefined;
  /** the deck's shader palette; the legacy palette when absent */
  palette?: ShaderPalette | undefined;
};

export function ShaderLayer({ body, html, play, palette }: ShaderLayerProps) {
  return (
    <MaterialMount
      body={body}
      html={html}
      mode="show"
      play={play ?? 'play'}
      fps={EDITOR_SHADER_FPS}
      {...(palette === undefined ? {} : { palette })}
    />
  );
}
