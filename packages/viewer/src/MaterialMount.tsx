import { useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

import { mountMaterial } from '@turboslide/materials/mount';
import type { MaterialHandle } from '@turboslide/materials/mount';
import type { MaterialRecipe } from '@turboslide/schema/blocks/material';

import { MATERIAL_PLAY_EVENT } from './dither';

/**
 * The live material preview in the stage (SPEC 5.3: "materials mount on
 * [data-type="material"][data-live]"; SPEC 5.4: the main-thread mount with
 * setMinPixelRatio(2) and the 3200 by 1800 pixel cap). After every commit of
 * the slide body it reads the `data-recipe` roots the renderer wrote (the
 * material block's figure, and the picture image of an opener or a mood slide
 * whose asset is a material) and mounts the shader over each frozen frame:
 * into the block's `.material` box, whose CSS lays the canvas over the frame,
 * and for a picture into a wrapper placed exactly where the image sits. Every
 * mount is disposed before the next body or on unmount. A mount that fails
 * (no WebGL, an unknown material) is reported once and the frozen frame stays
 * visible, which is the frame contract: the picture is the frame.
 *
 * Round three (gslides-parity SPEC-3 0.38, 10.8): a material picture with a `dither` shows the
 * dithered frozen frame and the shader does not play under it, because dithering a moving frame
 * per animation frame through the integer pipeline is out of budget and would not match the
 * export. The Material section's Play (`setMaterialPlay` in dither.ts) names one block whose
 * shader plays undithered for a look; any new body (an edit) stops it.
 */
export type MaterialMountProps = {
  /** the slide body the renderer's HTML was set on */
  body: RefObject<HTMLElement | null>;
  /** the rendered HTML; a change remounts */
  html: string;
  /** off in view mode; the frozen frames stand alone */
  enabled?: boolean;
  /** playback speed; 0 freezes every mount at its anchor */
  speed?: number;
  onError?: (error: unknown) => void;
};

/** The recipe a root carries, or null when the attribute does not parse. */
export function readRecipe(element: Element): MaterialRecipe | null {
  const raw = element.getAttribute('data-recipe');
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.materialId !== 'string') return null;
    return record as MaterialRecipe;
  } catch {
    return null;
  }
}

/** The element the shader mounts into for a recipe root: the block's box, or a wrapper over a picture. */
export function hostFor(root: Element): { host: HTMLElement; created: boolean } | null {
  if (root instanceof HTMLImageElement) {
    const parent = root.parentElement;
    if (parent === null) return null;
    const host = root.ownerDocument.createElement('div');
    host.className = 'ts-material-live';
    host.setAttribute('aria-hidden', 'true');
    const style = getComputedStyle(root);
    host.style.position = style.position === 'static' ? 'absolute' : style.position;
    host.style.inset = style.inset;
    host.style.width = style.width;
    host.style.height = style.height;
    host.style.zIndex = style.zIndex;
    host.style.overflow = 'hidden';
    root.insertAdjacentElement('afterend', host);
    return { host, created: true };
  }
  const box = root.querySelector<HTMLElement>('.material');
  if (box === null) return null;
  return { host: box, created: false };
}

/**
 * True when a recipe root sits under a dithered picture (SPEC-3 10.8): the shader stays frozen
 * unless the block is the one Play named.
 */
export function ditheredRoot(root: Element, playing: string | null): boolean {
  const dithered = root.closest('[data-dither][data-dither-key]');
  if (dithered === null) return false;
  return dithered.getAttribute('data-block') !== playing;
}

export function MaterialMount({
  body,
  html,
  enabled = true,
  speed = 1,
  onError,
}: MaterialMountProps) {
  /* the block whose shader plays undithered (Play in the Material section); every new body stops it */
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => {
    const onPlay = (event: Event) => {
      const detail = (event as CustomEvent<{ blockId: string | null }>).detail;
      setPlaying(detail?.blockId ?? null);
    };
    window.addEventListener(MATERIAL_PLAY_EVENT, onPlay);
    return () => window.removeEventListener(MATERIAL_PLAY_EVENT, onPlay);
  }, []);
  useEffect(() => {
    setPlaying(null);
  }, [html]);

  useLayoutEffect(() => {
    const root = body.current;
    if (!root || !enabled) return;
    let alive = true;
    const handles: MaterialHandle[] = [];
    const created: HTMLElement[] = [];
    const roots = [...root.querySelectorAll('[data-recipe]')];
    for (const element of roots) {
      if (ditheredRoot(element, playing)) continue;
      const recipe = readRecipe(element);
      const target = hostFor(element);
      if (recipe === null || target === null) continue;
      if (target.created) created.push(target.host);
      mountMaterial(target.host, recipe, { speed, frame: recipe.anchor ?? 0 })
        .then((handle) => {
          if (!alive) {
            handle.dispose();
            return;
          }
          handles.push(handle);
        })
        .catch((error: unknown) => {
          if (alive) onError?.(error);
        });
    }
    return () => {
      alive = false;
      for (const handle of handles) handle.dispose();
      for (const host of created) host.remove();
    };
  }, [body, html, enabled, speed, onError, playing]);
  return null;
}
