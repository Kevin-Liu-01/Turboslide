import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { MaterialHandle, mountMaterial as mountMaterialFn } from '@turboslide/materials/mount';
import type { ShaderPalette } from '@turboslide/materials/presets';
import type { MaterialRecipe, MaterialUniforms } from '@turboslide/schema/blocks/material';
import { MATERIAL_ANCHORS } from '@turboslide/schema/blocks/material';
import type { PlayMode } from '@turboslide/schema/deck';

import { MATERIAL_PLAY_EVENT } from './dither';
import { paceHandle } from './frame-pacer';
import { onLiveSettingsChange, pageLiveSettings, paperEngineRuns, planLive } from './live-plan';
import type { LiveSettings } from './live-plan';
import { motionReduced } from './reduce-motion';

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
 *
 * The features round, ship two (docs/archive/rounds/FEATURES.md 5.6; audit-shaders 15, 17): one live mount per
 * stage. With `selected` handed in, the selected shader block plays and every other shader block
 * shows its frame until selected; with no shader selected, the first block with no frame yet
 * mounts at speed 0 so its plate is not empty (the label is gone, 5.5), and every other frameless
 * block draws its plate until its frame lands 2 to 3 s after the insert, so the stage never holds
 * two canvases while frames are pending (`planMounts`; the fix round of ship two, verification
 * F.5 item 4, `shaders.perf.one-context`). The editor caps a playing mount at 30 frames per second
 * (`fps`, paced by frame-pacer.ts: Paper at speed 0 and its public `setFrame` on each due frame)
 * and at 1x device pixels below zoom 100 (`scale`); reduced motion, the system's setting or Tools >
 * Preferences > Reduce motion (reduce-motion.ts), sets speed 0 (the anchor's still is the frame);
 * `document.hidden` and an off screen stage pause the pacer's loop, and Paper's own observers a
 * mount it does not pace. The deck's shader palette (`palette`, 5.7) reaches the presets.
 * Every live handle is registered by block id so the Shader section previews a slider through
 * `previewShaderUniforms` while it is held and writes on the release alone (5.3). Without
 * `selected` the mount behaves as before the round: every root mounts.
 *
 * Show mode (the shader design 3.3): the show and the viewer hand in `mode: 'show'` and the
 * slide's Playback (`play`), and `planShow` applies live-plan.ts: under play and the person's
 * settings the largest root that can run plays at 30 frames per second through the pacer, and
 * every other root draws its still with no mount. Hold mounts nothing, so the stills stand alone.
 * A slide change disposes the mount before the next body mounts, and the still stays painted under
 * the canvas, so a slow mount or a lost context shows the still.
 *
 * The canvas sits above the frame (the fix round of ship two, verification F.5 item 1): Paper's
 * own stylesheet lays its canvas at `z-index: -1` inside the host, which it makes a stacking
 * context, and the block's frame `<img>` stays in flow above it, so once a block had a frame the
 * live canvas was never the element a seller saw; a held slider, a preset click and View > Play
 * shaders all drew under the still. `raiseCanvas` sets the canvas's own z-index above the flow
 * when the handle lands, and the frame stays painted under it, so the first paint and a lost
 * WebGL context both show the frame instead of an empty plate (the frame contract).
 *
 * The mount survives a parent's render (the fix round of ship two, the same finding): the effect
 * used to list `onError` and `palette` by reference, and the editor root hands the mount a new
 * error arrow on every render, so every render of the root disposed the live mount and created
 * another; a held slider's look went to a disposed handle whenever a render landed mid drag, and
 * the stage paid a WebGL context per render. `onError` rides a ref and the palette is keyed by
 * its colours, so only the body, the selection, the appearance, the zoom band and the motion
 * setting remount.
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
  /**
   * The selected block ids (docs/archive/rounds/FEATURES.md 5.6): a selected shader plays, an unselected one with
   * a frame shows the frame and mounts nothing, an unselected one without a frame mounts a still.
   * Absent, every root mounts (the behaviour before the round).
   */
  selected?: ReadonlyArray<string> | null;
  /** The deck's shader palette (5.7); the legacy palette when absent. */
  palette?: ShaderPalette;
  /** The sheet's live scale (1 at zoom 100): below 1 the mount renders at 1x device pixels (5.6). */
  scale?: number;
  /** The frames per second the editor's mount is capped at (5.6); 0 leaves Paper's loop alone. */
  fps?: number;
  /**
   * `show` in the show and the viewer (the shader design 3.3): live-plan.ts decides, `selected`
   * is not read, and a held root mounts nothing. `edit` (the default) is the editor's rule above.
   */
  mode?: 'edit' | 'show';
  /** Show mode: the slide's Playback (`slidePlay`); play when absent. */
  play?: PlayMode;
};

type MountModule = { mountMaterial: typeof mountMaterialFn };

let mountModule: Promise<MountModule> | null = null;

/**
 * The Paper Shaders mount, loaded on the first `[data-recipe]` root and never before (gslides-parity
 * SPEC-4 0.44, 3.12; PP 7 row 4): `@turboslide/materials/mount` carries the shader library with
 * its GLSL sources (about 250 to 300 KB decoded), which every route paid for while no material
 * was on screen. One `import()` per page, shared by every stage; a failed load is reported through
 * `onError` and the frozen frame stays, which is the frame contract. This is one of the four
 * `import()` sites AGENTS.md allows in the browser graph.
 */
export function loadMaterialMount(): Promise<MountModule> {
  mountModule ??= import('@turboslide/materials/mount').catch((error: unknown) => {
    mountModule = null;
    throw error;
  });
  return mountModule;
}

/** The recipe a root carries plus the Speed control the renderer rides on it (render/blocks/material.ts). */
export type MountRecipe = MaterialRecipe & { speed?: number };

/** The recipe a root carries, or null when the attribute does not parse. */
export function readRecipe(element: Element): MountRecipe | null {
  const raw = element.getAttribute('data-recipe');
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.materialId !== 'string') return null;
    return record as MountRecipe;
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

/** The block id a recipe root belongs to: the figure's `data-block`, or the picture's. */
export function blockIdOfRoot(root: Element): string | null {
  const own = root.getAttribute('data-block');
  if (own !== null) return own;
  return root.closest('[data-block]')?.getAttribute('data-block') ?? null;
}

/** True when the root shows a frame already (the block's `img.material-frame`, or the picture itself). */
export function rootHasFrame(root: Element): boolean {
  if (root.tagName === 'IMG') return true;
  return root.querySelector('.material > img') !== null;
}

/** What a root does under the one live mount rule (5.6): plays, mounts a still at speed 0, or draws its frame or plate. */
export type MountPlan = 'play' | 'still' | 'frame';

/** What `planMounts` reads off a root: its block id and whether it shows a frame already. */
export type MountRootFacts = { id: string | null; hasFrame: boolean };

/**
 * The one live mount rule of 5.6 over a stage's roots, pure: with no selection handed in every
 * root plays (the behaviour before the round); otherwise the selected shader blocks play (one in
 * practice), and when none is selected the first root without a frame mounts a still, so its
 * plate is not empty, while every other root draws its frame or its plate. Two frameless blocks
 * are one canvas, never two, and a block's still gives way to the selected block's mount; the
 * frame lands through the capturer (shader-frame.ts) whether or not the block mounts.
 */
export function planMounts(
  roots: ReadonlyArray<MountRootFacts>,
  selected: ReadonlyArray<string> | null | undefined,
): MountPlan[] {
  if (selected === undefined) return roots.map(() => 'play');
  const plans: MountPlan[] = roots.map(({ id }) =>
    id !== null && selected !== null && selected.includes(id) ? 'play' : 'frame',
  );
  if (plans.includes('play')) return plans;
  const still = roots.findIndex((root) => !root.hasFrame);
  if (still !== -1) plans[still] = 'still';
  return plans;
}

/**
 * The rule of show mode over a stage's roots (live-plan.ts): the root that plays mounts, every
 * other root draws its still. The facts are read off the DOM by the caller.
 */
export function planShow(
  roots: ReadonlyArray<{ twoTone: boolean; engine: boolean; area: number }>,
  settings: LiveSettings,
): MountPlan[] {
  return planLive(
    roots.map(({ twoTone, engine, area }) => ({ still: twoTone, engine, area })),
    settings,
  ).map((plan) => (plan === 'play' ? 'play' : 'frame'));
}

/** A root's area on the page in CSS px², 0 when it is not laid out (a hidden stage). */
function areaOf(root: Element): number {
  const box = root.getBoundingClientRect();
  return Math.max(0, box.width) * Math.max(0, box.height);
}

/**
 * Places a mount's canvas above the frame it covers (the header's second paragraph): an inline
 * z-index outranks Paper's layered `z-index: -1`, and the host's `overflow: hidden` keeps it in
 * the box.
 */
export function raiseCanvas(handle: MaterialHandle): void {
  try {
    handle.canvas().style.zIndex = '0';
  } catch {
    /* a handle without a canvas (a test's fake) */
  }
}

/** The frames per second the editor's mount is capped at (5.6). */
export const EDITOR_SHADER_FPS = 30;

// ---------------------------------------------------------------------------------------------
// The registry of live mounts, by block id (the Shader section's live preview, 5.3)

const LIVE = new Map<string, MaterialHandle>();
const LIVE_LISTENERS = new Set<() => void>();

function liveChanged(): void {
  for (const listener of LIVE_LISTENERS) listener();
}

/**
 * Calls `listener` whenever a block's live mount lands or goes (a selection, the remount after a
 * write), so the Shader section's Still group can hold the new mount on the still (the shader design
 * 2.2). Returns the unsubscribe.
 */
export function onLiveShaderChange(listener: () => void): () => void {
  LIVE_LISTENERS.add(listener);
  return () => {
    LIVE_LISTENERS.delete(listener);
  };
}

/** The moment a block's live mount shows, in ms of the pattern's clock, or null when it has none. */
export function liveShaderFrame(blockId: string): number | null {
  const handle = LIVE.get(blockId);
  if (handle === undefined) return null;
  try {
    return handle.frame();
  } catch {
    return null;
  }
}

/** The live handle of a block on the stage, or null when it shows its frame. */
export function liveShaderHandle(blockId: string): MaterialHandle | null {
  return LIVE.get(blockId) ?? null;
}

/** The block ids with a live mount right now (the perf rows read one). */
export function liveShaderBlockIds(): string[] {
  return [...LIVE.keys()];
}

/**
 * Pushes uniforms to a block's live mount while a slider is held (5.3): the canvas changes during
 * the drag and nothing is written; the release writes one `block.set`. False when the block has
 * no live mount on this stage.
 */
export function previewShaderUniforms(blockId: string, uniforms: MaterialUniforms): boolean {
  const handle = LIVE.get(blockId);
  if (handle === undefined) return false;
  try {
    handle.setUniforms(uniforms);
    return true;
  } catch {
    return false;
  }
}

/** Sets the frame of a block's live mount (the Still group's scrubber, the shader design 2.2). */
export function previewShaderFrame(blockId: string, ms: number): boolean {
  const handle = LIVE.get(blockId);
  if (handle === undefined) return false;
  handle.setFrame(ms);
  return true;
}

/** Sets the playback speed of a block's live mount (the Speed control held, 5.3). */
export function previewShaderSpeed(blockId: string, speed: number): boolean {
  const handle = LIVE.get(blockId);
  if (handle === undefined) return false;
  handle.setSpeed(motionReduced() ? 0 : speed);
  return true;
}

export function MaterialMount({
  body,
  html,
  enabled = true,
  speed = 1,
  onError,
  selected,
  palette,
  scale,
  fps = EDITOR_SHADER_FPS,
  mode = 'edit',
  play = 'play',
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

  /* reduced motion (5.6): speed 0 on every mount, followed live when the system setting or Tools >
     Preferences > Reduce motion flips; the person's Play animated patterns Off (live-plan.ts) holds
     the same way, and in show mode mounts nothing */
  const [reduced, setReduced] = useState<boolean>(() => motionReduced());
  const [personHolds, setPersonHolds] = useState<boolean>(
    () => pageLiveSettings('play').preference === 'off',
  );
  useEffect(
    () =>
      onLiveSettingsChange(() => {
        setReduced(motionReduced());
        setPersonHolds(pageLiveSettings('play').preference === 'off');
      }),
    [],
  );

  const selectedKey = selected === undefined ? 'all' : (selected ?? []).join('\u0000');
  const lowRes = scale !== undefined && scale < 1;
  /* the error callback and the palette by reference and by value (the header's third paragraph):
     a parent's new arrow per render, or a palette object of the same colours, never remounts */
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const paletteKey = palette === undefined ? '' : JSON.stringify(palette);

  useLayoutEffect(() => {
    const root = body.current;
    if (!root || !enabled) return;
    const palette = paletteRef.current;
    const onError = onErrorRef.current;
    let alive = true;
    const handles: { id: string | null; handle: MaterialHandle }[] = [];
    const created: HTMLElement[] = [];
    const roots = [...root.querySelectorAll('[data-recipe]')].filter(
      (element) => !ditheredRoot(element, playing),
    );
    // one live mount per stage (5.6): the plans are decided over every root at once, so two
    // frameless blocks never mount two stills and a selected block's mount stands alone
    const plans =
      mode === 'show'
        ? planShow(
            roots.map((element) => ({
              twoTone: readRecipe(element)?.twoTone === true,
              engine: paperEngineRuns(),
              area: areaOf(element),
            })),
            { reduced, preference: personHolds ? 'off' : 'show', play },
          )
        : planMounts(
            roots.map((element) => ({
              id: blockIdOfRoot(element),
              hasFrame: rootHasFrame(element),
            })),
            selected,
          );
    const targets = roots.flatMap((element, index) => {
      const plan = plans[index] ?? 'frame';
      if (plan === 'frame') return [];
      const recipe = readRecipe(element);
      const target = hostFor(element);
      if (recipe === null || target === null) return [];
      if (target.created) created.push(target.host);
      return [{ recipe, host: target.host, plan, id: blockIdOfRoot(element) }];
    });
    if (targets.length > 0) {
      // the shader library arrives with the first material root of the page (SPEC-4 0.44)
      loadMaterialMount()
        .then(({ mountMaterial }) => {
          if (!alive) return;
          for (const { recipe, host, plan, id } of targets) {
            const own = recipe.speed ?? 1;
            /* Play animated patterns Off holds everywhere for the person (the shader design 3.1):
               in the editor the selected block still mounts, at speed 0, so a slider or the Still
               group previews on it */
            const playSpeed = reduced || personHolds || plan === 'still' ? 0 : speed * own;
            /* a playing mount is paced at `fps` (5.6): Paper mounts at speed 0 and the pacer moves
               its frame, so a Speed preview that starts it later is capped too */
            const paced = plan === 'play' && fps > 0;
            const { speed: _speed, ...clean } = recipe;
            void _speed;
            mountMaterial(host, clean, {
              speed: paced ? 0 : playSpeed,
              /* the still's moment, 5,500 ms when absent as the frame key reads it, so a mount's
                 first frame is the still (the shader design 2.4) */
              frame: recipe.anchor ?? MATERIAL_ANCHORS[1],
              ...(palette !== undefined ? { palette } : {}),
              ...(lowRes ? { minPixelRatio: 1 } : {}),
            })
              .then((mounted) => {
                if (!alive) {
                  mounted.dispose();
                  return;
                }
                // the canvas above the frame it covers (the header's second paragraph)
                raiseCanvas(mounted);
                const handle = paced ? paceHandle(mounted, { fps, speed: playSpeed }) : mounted;
                handles.push({ id, handle });
                if (id !== null) {
                  LIVE.set(id, handle);
                  liveChanged();
                }
              })
              .catch((error: unknown) => {
                if (alive) onError?.(error);
              });
          }
        })
        .catch((error: unknown) => {
          if (alive) onError?.(error);
        });
    }
    return () => {
      alive = false;
      for (const { id, handle } of handles) {
        if (id !== null && LIVE.get(id) === handle) LIVE.delete(id);
        handle.dispose();
      }
      if (handles.length > 0) liveChanged();
      for (const host of created) host.remove();
    };
    // selectedKey stands for `selected` and paletteKey for `palette`, so a new array of the same
    // ids or a palette of the same colours does not remount; onError rides its ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    body,
    html,
    enabled,
    speed,
    playing,
    selectedKey,
    paletteKey,
    lowRes,
    fps,
    reduced,
    mode,
    play,
    personHolds,
  ]);
  return null;
}
