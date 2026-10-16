/**
 * Whether a live block plays or holds its still in the show and the viewer: the one module of the
 * rule (the shader design 3.2, renamed for every live block by the HTML slides design 4.2, whose
 * `live-plan.ts` this is). The show's and the viewer's mount (MaterialMount in show mode, through
 * present/ShaderLayer.tsx and the editor's stage while it presents) reads `planLive`. For each
 * root of the visible slide the first line that matches decides:
 *
 * 1. Motion is reduced (the system setting or Tools > Preferences > Reduce motion): hold.
 * 2. The person's Play animated patterns preference is Off: hold.
 * 3. The root cannot run here: two-tone or dithered (a 1-bit screen of the still that a live frame
 *    cannot match), or the engine is missing (no WebGL2 for Paper): hold.
 * 4. The slide's Playback (`slidePlay`: the slide's word, else the deck's, else play) is hold: hold.
 * 5. Otherwise the largest root plays and every other root holds: one live canvas per stage, the
 *    editor's one live mount carried into the show.
 *
 * The person's settings can only hold. The preference is stamped on the root as
 * `data-hold-live` while it is Off and `data-play-live` while it is On
 * (packages/chrome/src/chrome-preferences.ts and the show's Options menu), so every surface reads
 * it without the editor's settings, as Reduce motion's `data-reduce-motion` is read. The editor's
 * mount reads On alone as leave to move the selected pattern while editing (`editorPlays`): In
 * the show only and Off hold it on its still there. The presenter console's previews are LiveClone copies and never
 * mount, so a talk runs one live canvas, in the audience window.
 */
import type { PlayMode } from '@turboslide/schema/deck';

import { motionReduced, onMotionReducedChange } from './reduce-motion';

/** Tools > Preferences > Play animated patterns, per browser: On, In the show only, Off. */
export type LivePreference = 'on' | 'show' | 'off';

/** What the rule reads off one root of the visible slide. */
export type LiveRootFacts = {
  /** two-tone or dithered: the still is a screen a live frame cannot match (line 3) */
  still: boolean;
  /** the root's engine runs in this browser (line 3) */
  engine: boolean;
  /** the root's area on the stage, in any one unit (line 5) */
  area: number;
};

/** The settings over the whole slide: lines 1, 2 and 4. */
export type LiveSettings = {
  reduced: boolean;
  preference: LivePreference;
  /** the slide's Playback, `slidePlay(deck, slide)` */
  play: PlayMode;
};

/** The rule over the roots of the visible slide, pure: `play` for at most one root, `hold` for every other. */
export function planLive(roots: ReadonlyArray<LiveRootFacts>, settings: LiveSettings): PlayMode[] {
  const held = settings.reduced || settings.preference === 'off' || settings.play === 'hold';
  let largest = -1;
  if (!held) {
    roots.forEach((root, index) => {
      if (root.still || !root.engine) return;
      if (largest === -1 || root.area > (roots[largest]?.area ?? 0)) largest = index;
    });
  }
  return roots.map((_, index) => (index === largest ? 'play' : 'hold'));
}

// ---------------------------------------------------------------------------------------------
// The page's side of the rule: the preference's attribute and the engine probe

/** Present on the root while the person's Play animated patterns preference is Off. */
export const HOLD_LIVE_ATTRIBUTE = 'data-hold-live';

/** Present on the root while the person's Play animated patterns preference is On. */
export const PLAY_LIVE_ATTRIBUTE = 'data-play-live';

/** The stored preference as one of its three words; In the show only when absent or unknown. */
export function livePreferenceOf(value: unknown): LivePreference {
  return value === 'on' || value === 'off' ? value : 'show';
}

/** Stamps the preference on the root, so every surface of the page holds under Off. */
export function stampLivePreference(value: unknown): void {
  if (typeof document === 'undefined') return;
  const preference = livePreferenceOf(value);
  document.documentElement.toggleAttribute(HOLD_LIVE_ATTRIBUTE, preference === 'off');
  document.documentElement.toggleAttribute(PLAY_LIVE_ATTRIBUTE, preference === 'on');
}

/** The preference as the page's root carries it: Off, On, else In the show only. */
export function pagePreference(): LivePreference {
  if (typeof document === 'undefined') return 'show';
  const root = document.documentElement;
  if (root.hasAttribute(HOLD_LIVE_ATTRIBUTE)) return 'off';
  return root.hasAttribute(PLAY_LIVE_ATTRIBUTE) ? 'on' : 'show';
}

/**
 * Whether the editor's selected pattern moves while editing (docs editor/objects, Tools >
 * Preferences > Play animated patterns): under On alone. In the show only and Off mount it on its
 * still, where a slider and the Still group's Play preview on it.
 */
export function editorPlays(preference: LivePreference): boolean {
  return preference === 'on';
}

/**
 * Calls `listener` when reduced motion or the preference's attribute changes (a toggle in this
 * tab, or another tab's through the storage event the boot script follows). Returns the
 * unsubscribe.
 */
export function onLiveSettingsChange(listener: () => void): () => void {
  const stops = [onMotionReducedChange(listener)];
  if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(listener);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [HOLD_LIVE_ATTRIBUTE, PLAY_LIVE_ATTRIBUTE],
    });
    stops.push(() => observer.disconnect());
  }
  return () => {
    for (const stop of stops) stop();
  };
}

/** Reduced motion and the preference as the page holds them now. */
export function pageLiveSettings(play: PlayMode): LiveSettings {
  return { reduced: motionReduced(), preference: pagePreference(), play };
}

let webgl2Answer: boolean | null = null;

/**
 * True when this browser runs Paper's engine (WebGL2). Read once per page and the probe's context
 * released: Chromium keeps at most sixteen live WebGL contexts and loses the oldest past that, so
 * a probe per read would in time take down the stage's own mount. The capturer's
 * `clientCanCapture` (shader-frame.ts) reads the same answer.
 */
export function paperEngineRuns(): boolean {
  if (typeof document === 'undefined') return false;
  if (webgl2Answer !== null) return webgl2Answer;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    webgl2Answer = gl !== null;
    (gl?.getExtension('WEBGL_lose_context') as { loseContext: () => void } | null)?.loseContext();
  } catch {
    webgl2Answer = false;
  }
  return webgl2Answer;
}
