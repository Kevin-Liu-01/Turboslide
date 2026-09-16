// The present layer's motion state (gslides-parity SPEC-5 2.2, 0.10, 1.5; build-5/b1.md "The
// show's contract"): the one place that toggles the classes of `MOTION_CLASSES` on the rendered
// nodes `data-block` (and the stamped `data-para`) name, so the show, the Motion panel's Play and
// the presenter's next preview drive one slide's schedule the same way, and `motionCss` (the
// render package) writes the rules those classes play. No React and no import of the DOM library:
// the element type is structural, so a jsdom or browser element fits it and the pure half
// (`hiddenAfter`, `stepPlay`) is unit tested in Node without a document.
//
// The state model: a unit is a whole block (`<blockId>`) or one paragraph of it
// (`<blockId>/<paragraph>`, for By paragraph effects). `hiddenAfter(schedule, k)` is the set of
// units hidden once steps 0 to k have settled (k = -1 is the mount state: the blocks of
// `hiddenAtStart`, spread over their paragraph nodes for a block whose effects address
// paragraphs). Playing step k sets `data-step="k"` on the slide root, removes `is-hidden` from
// the step's entrance units and gives them `is-entering`, gives the exit units `is-leaving` and
// the Spin units `is-emph`, hands every Play effect to the media controller, and after the step's
// `durationMs` (0 under reduced motion) drops the transient classes and applies `hiddenAfter(k)`
// exactly. Seeking and rewinding apply a state without animation. A transition puts
// `data-transition="<scope slide id>"` (and `data-reverse` when going back) on the ancestor of the
// two mounted slides, `is-entering` on the incoming root and `is-leaving` on the outgoing, and
// removes them after the duration.
import { paragraphNodes } from '@turboslide/render/motion';
import type { MotionEffect, MotionSchedule, SlideTransition } from '@turboslide/schema/motion';
import { MOTION_ATTRS, MOTION_CLASSES, effectClass } from '@turboslide/schema/motion';

const A = MOTION_ATTRS;
const C = MOTION_CLASSES;

/** The element surface the layer needs; a DOM element satisfies it, and so does a test fake. */
export type LayerElement = {
  tagName: string;
  classList: {
    add(...names: string[]): void;
    remove(...names: string[]): void;
    contains(name: string): boolean;
  };
  children: ArrayLike<LayerElement>;
  querySelector(selectors: string): LayerElement | null;
  querySelectorAll(selectors: string): ArrayLike<LayerElement>;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
};

/** The timers the layer schedules with; `window` by default, fakes in the tests. */
export type LayerTimers = {
  set(callback: () => void, ms: number): number;
  clear(id: number): void;
};

const BROWSER_TIMERS: LayerTimers = {
  set: (callback, ms) => setTimeout(callback, ms) as unknown as number,
  clear: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
};

/** A unit an effect targets: `<blockId>`, or `<blockId>/<paragraph>` under By paragraph. */
export type UnitKey = string;

export function unitKey(blockId: string, paragraph?: number): UnitKey {
  return paragraph === undefined ? blockId : `${blockId}/${paragraph}`;
}

/** The blocks whose effects address paragraphs: their hidden state lives on the paragraph nodes. */
export function paragraphBlocks(schedule: MotionSchedule): Set<string> {
  const out = new Set<string>();
  for (const step of schedule.steps)
    for (const effect of step.effects)
      if (effect.paragraph !== undefined) out.add(effect.animation.blockId);
  return out;
}

/** The paragraph count a schedule implies for a block: one past the highest index it addresses. */
export function scheduledParagraphs(schedule: MotionSchedule, blockId: string): number {
  let count = 0;
  for (const step of schedule.steps)
    for (const effect of step.effects)
      if (effect.animation.blockId === blockId && effect.paragraph !== undefined)
        count = Math.max(count, effect.paragraph + 1);
  return count;
}

/** The units of one effect: the block, or every paragraph of a block hidden at the start. */
function applyEffect(hidden: Set<UnitKey>, effect: MotionEffect, paragraphs: Set<string>): void {
  const blockId = effect.animation.blockId;
  const key = unitKey(blockId, effect.paragraph);
  switch (effectClass(effect.animation.effect)) {
    case 'entrance':
      hidden.delete(key);
      // a whole block entrance shows every paragraph of a block that also plays By paragraph
      if (effect.paragraph === undefined && paragraphs.has(blockId))
        for (const unit of [...hidden]) if (unit.startsWith(`${blockId}/`)) hidden.delete(unit);
      return;
    case 'exit':
      hidden.add(key);
      return;
    default:
      return;
  }
}

/**
 * The units hidden once steps 0 to `step` have settled; `step` -1 is the mount state. The
 * blocks of `hiddenAtStart` whose effects address paragraphs are hidden paragraph by paragraph
 * (`paragraphCount` answers how many the rendered block has; the schedule's own count is the
 * floor), so a By paragraph entrance can show them one at a time.
 */
export function hiddenAfter(
  schedule: MotionSchedule,
  step: number,
  paragraphCount: (blockId: string) => number = (blockId) => scheduledParagraphs(schedule, blockId),
): Set<UnitKey> {
  const paragraphs = paragraphBlocks(schedule);
  const hidden = new Set<UnitKey>();
  for (const blockId of schedule.hiddenAtStart) {
    if (!paragraphs.has(blockId)) {
      hidden.add(blockId);
      continue;
    }
    const count = Math.max(scheduledParagraphs(schedule, blockId), paragraphCount(blockId));
    for (let p = 0; p < count; p += 1) hidden.add(unitKey(blockId, p));
  }
  const last = Math.min(step, schedule.steps.length - 1);
  for (let k = 0; k <= last; k += 1)
    for (const effect of schedule.steps[k]?.effects ?? []) applyEffect(hidden, effect, paragraphs);
  return hidden;
}

/** What one step does when it plays: the units per class, the media calls, the step's length. */
export type StepPlay = {
  entering: UnitKey[];
  leaving: UnitKey[];
  emphasis: UnitKey[];
  media: { blockId: string; delayMs: number; durationMs: number }[];
  durationMs: number;
};

export function stepPlay(schedule: MotionSchedule, step: number): StepPlay {
  const out: StepPlay = { entering: [], leaving: [], emphasis: [], media: [], durationMs: 0 };
  const row = schedule.steps[step];
  if (row === undefined) return out;
  out.durationMs = row.durationMs;
  for (const effect of row.effects) {
    const key = unitKey(effect.animation.blockId, effect.paragraph);
    switch (effectClass(effect.animation.effect)) {
      case 'entrance':
        if (!out.entering.includes(key)) out.entering.push(key);
        break;
      case 'exit':
        if (!out.leaving.includes(key)) out.leaving.push(key);
        break;
      case 'emphasis':
        if (!out.emphasis.includes(key)) out.emphasis.push(key);
        break;
      case 'media':
        out.media.push({
          blockId: effect.animation.blockId,
          delayMs: effect.delayMs,
          durationMs: effect.durationMs,
        });
        break;
    }
  }
  return out;
}

/** True when the document asks for reduced motion (SPEC-5 0.10: every duration becomes 0, the steps stay). */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

function attr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------------------------
// The media controller seam (SPEC-5 0.17, 3.5; MILESTONES-5 "The seams every builder types
// against"): B2's `media-controller.ts` mounts the elements over the `data-media` roots and the
// step advance calls `play(blockId)`; the show and the presenter read `onState`. The type is
// structural so the show types against it before the module lands, and `noMedia()` is the
// controller of a page without one (the Motion panel's Play, a test).

export type MediaPlaybackState = {
  blockId: string;
  state: 'playing' | 'paused' | 'ended';
  positionMs: number;
  durationMs: number | null;
  title?: string;
};

export type MediaControllerLike = {
  /** the slide root was shown: mount the elements over its media roots (a DOM element; B2's `RootLike`) */
  mount(slide: object): void;
  /** the slide root leaves: unmount its elements (an audio with Stop on slide change off stays) */
  unmount(slide: object): void;
  play(blockId: string): void | Promise<void>;
  pause(blockId: string): void;
  restart(blockId: string): void | Promise<void>;
  onState(callback: (state: MediaPlaybackState) => void): () => void;
  /**
   * The show's click steps are exhausted and the person advanced: the `click` media with no Play
   * row play now (Google's "Video plays when you advance the slide", SPEC-5 3.5; R11 5.4). True
   * when one played; the show then stays on the slide for that click.
   */
  playClickMedia?(slide: object): boolean | Promise<boolean>;
  /** a click landed on a media root or its controls (R11 5.5): true when the controller took it */
  handleClick?(target: unknown): boolean;
  /** the first click after a NotAllowedError: the playing elements sound again (SPEC-5 0.21) */
  unmuteAll?(): void;
  /** the show ended: every element stops and leaves */
  destroy?(): void;
  /* the player letters of the show (gslides-parity SPEC-5 3.5, 15; VERIFICATION-5 finding 7): K
     toggles, U and O seek by ten seconds, on the playing media of the slide else its first root */
  toggle?(blockId: string): void | Promise<void>;
  seek?(blockId: string, deltaMs: number): void;
  stateOf?(blockId: string): MediaPlaybackState | null;
};

export function noMedia(): MediaControllerLike {
  return {
    mount: () => undefined,
    unmount: () => undefined,
    play: () => undefined,
    pause: () => undefined,
    restart: () => undefined,
    onState: () => () => undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// The layer over one mounted slide

export type MotionLayerOptions = {
  /** every duration is 0 and the steps stay (SPEC-5 0.10); `prefersReducedMotion()` when absent */
  reduced?: boolean;
  /** the media controller the Play effects reach */
  media?: MediaControllerLike;
  timers?: LayerTimers;
  /** called when a step settles (its transient classes dropped), with the step index */
  onSettled?: (step: number) => void;
};

export type MotionLayer = {
  readonly schedule: MotionSchedule;
  /** the step the root reads (`data-step`), -1 before mount */
  readonly step: number;
  /** stamps the paragraph nodes, hides the blocks of `hiddenAtStart`, sets `data-step="0"` */
  mount(): void;
  /** plays step k with its classes and media calls; answers the step's length in ms (0 when reduced) */
  play(step: number): number;
  /** the state after steps 0 to k without animation (k = -1: the mount state) */
  seek(step: number): void;
  /** settles the step in flight now (its transient classes dropped, its end state applied) */
  settle(): void;
  /** true while a step's animation is still running */
  readonly playing: boolean;
  /** removes every class and attribute the layer wrote */
  unmount(): void;
};

export function attachMotionLayer(
  root: LayerElement,
  schedule: MotionSchedule,
  options: MotionLayerOptions = {},
): MotionLayer {
  const timers = options.timers ?? BROWSER_TIMERS;
  const reduced = options.reduced ?? prefersReducedMotion();
  const media = options.media ?? noMedia();
  const paragraphs = paragraphBlocks(schedule);
  /** the paragraph nodes per block, stamped at mount */
  const paraNodes = new Map<string, LayerElement[]>();
  let step = -1;
  let timer: number | null = null;
  let pending: (() => void) | null = null;

  const blockRoot = (blockId: string): LayerElement | null =>
    root.querySelector(`[${A.block}="${attr(blockId)}"]`);

  const unitNode = (key: UnitKey): LayerElement | null => {
    const slash = key.indexOf('/');
    if (slash < 0) return blockRoot(key);
    const blockId = key.slice(0, slash);
    const index = Number(key.slice(slash + 1));
    const nodes = paraNodes.get(blockId);
    if (nodes !== undefined) return nodes[index] ?? null;
    const block = blockRoot(blockId);
    return block === null ? null : (paragraphNodes(block)[index] ?? null);
  };

  const paragraphCount = (blockId: string): number => {
    const nodes = paraNodes.get(blockId);
    if (nodes !== undefined) return nodes.length;
    const block = blockRoot(blockId);
    return block === null ? 0 : paragraphNodes(block).length;
  };

  /** every unit the schedule can name, so a state applies to the whole set */
  const allUnits = (): Set<UnitKey> => {
    const units = new Set<UnitKey>();
    for (const blockId of schedule.hiddenAtStart) {
      if (!paragraphs.has(blockId)) units.add(blockId);
      else {
        const count = Math.max(scheduledParagraphs(schedule, blockId), paragraphCount(blockId));
        for (let p = 0; p < count; p += 1) units.add(unitKey(blockId, p));
      }
    }
    for (const row of schedule.steps)
      for (const effect of row.effects)
        units.add(unitKey(effect.animation.blockId, effect.paragraph));
    return units;
  };

  const applyHidden = (hidden: Set<UnitKey>): void => {
    for (const key of allUnits()) {
      const node = unitNode(key);
      if (node === null) continue;
      if (hidden.has(key)) node.classList.add(C.hidden);
      else node.classList.remove(C.hidden);
    }
  };

  const clearTransient = (): void => {
    for (const key of allUnits()) {
      const node = unitNode(key);
      node?.classList.remove(C.entering, C.leaving, C.emphasis);
    }
  };

  const stamp = (): void => {
    paraNodes.clear();
    for (const blockId of paragraphs) {
      const block = blockRoot(blockId);
      if (block === null) continue;
      const nodes = paragraphNodes(block);
      nodes.forEach((node, index) => node.setAttribute(A.paragraph, String(index)));
      paraNodes.set(blockId, nodes);
    }
  };

  const settle = (): void => {
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
    if (pending !== null) {
      const run = pending;
      pending = null;
      run();
    }
  };

  const setStep = (k: number): void => {
    step = k;
    root.setAttribute(A.step, String(Math.max(0, k)));
  };

  return {
    schedule,
    get step() {
      return step;
    },
    get playing() {
      return pending !== null;
    },
    mount() {
      settle();
      stamp();
      // `data-step="0"` from the mount (the entry step's rules match once it plays); nothing
      // has played yet, so the layer's own step reads -1
      root.setAttribute(A.step, '0');
      step = -1;
      applyHidden(hiddenAfter(schedule, -1, paragraphCount));
      media.mount(root);
    },
    seek(k) {
      settle();
      clearTransient();
      const at = Math.min(k, schedule.steps.length - 1);
      applyHidden(hiddenAfter(schedule, at, paragraphCount));
      setStep(at);
    },
    play(k) {
      settle();
      const at = Math.min(k, schedule.steps.length - 1);
      if (at < 0) return 0;
      const before = hiddenAfter(schedule, at - 1, paragraphCount);
      const after = hiddenAfter(schedule, at, paragraphCount);
      const play = stepPlay(schedule, at);
      clearTransient();
      setStep(at);
      // the base state: everything hidden before the step, except the entering units, which lose
      // `is-hidden` now so their keyframes (which begin at the hidden state) can run
      for (const key of allUnits()) {
        const node = unitNode(key);
        if (node === null) continue;
        if (play.entering.includes(key)) {
          node.classList.remove(C.hidden);
          if (!reduced) node.classList.add(C.entering);
        } else if (before.has(key)) node.classList.add(C.hidden);
        else node.classList.remove(C.hidden);
      }
      if (!reduced) {
        for (const key of play.leaving) unitNode(key)?.classList.add(C.leaving);
        for (const key of play.emphasis) unitNode(key)?.classList.add(C.emphasis);
      }
      for (const row of play.media) media.play(row.blockId);
      const finish = (): void => {
        clearTransient();
        applyHidden(after);
        options.onSettled?.(at);
      };
      if (reduced || play.durationMs <= 0) {
        finish();
        return 0;
      }
      pending = finish;
      timer = timers.set(() => {
        timer = null;
        settle();
      }, play.durationMs);
      return play.durationMs;
    },
    settle,
    unmount() {
      settle();
      clearTransient();
      for (const key of allUnits()) unitNode(key)?.classList.remove(C.hidden);
      for (const nodes of paraNodes.values())
        for (const node of nodes) node.removeAttribute(A.paragraph);
      paraNodes.clear();
      root.removeAttribute(A.step);
      step = -1;
      media.unmount(root);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The transition between two mounted slides (SPEC-5 2.2)

export type TransitionOptions = {
  /** the slide id whose transition plays: the incoming slide's forward, the outgoing slide's going back */
  scopeSlideId: string;
  reverse?: boolean;
  reduced?: boolean;
  timers?: LayerTimers;
  onDone?: () => void;
};

export type TransitionRun = {
  /** the length the transition plays, 0 when nothing plays */
  readonly durationMs: number;
  /** removes the attributes and classes now and calls `onDone` once */
  cancel(): void;
};

/**
 * Plays a transition: `data-transition` (and `data-reverse`) on the ancestor of both slides,
 * `is-entering` on the incoming root and `is-leaving` on the outgoing, cleared after the
 * duration. A null transition, or reduced motion, clears at once.
 */
export function playTransition(
  container: LayerElement,
  incoming: LayerElement,
  outgoing: LayerElement | null,
  transition: SlideTransition | null,
  options: TransitionOptions,
): TransitionRun {
  const timers = options.timers ?? BROWSER_TIMERS;
  const reduced = options.reduced ?? prefersReducedMotion();
  let done = false;
  let timer: number | null = null;
  const finish = (): void => {
    if (done) return;
    done = true;
    if (timer !== null) timers.clear(timer);
    container.removeAttribute(A.transition);
    container.removeAttribute(A.reverse);
    incoming.classList.remove(C.entering);
    outgoing?.classList.remove(C.leaving);
    options.onDone?.();
  };
  if (transition === null || transition.kind === 'none' || reduced) {
    finish();
    return { durationMs: 0, cancel: finish };
  }
  container.setAttribute(A.transition, options.scopeSlideId);
  if (options.reverse === true) container.setAttribute(A.reverse, '');
  incoming.classList.add(C.entering);
  outgoing?.classList.add(C.leaving);
  timer = timers.set(finish, transition.durationMs);
  return { durationMs: transition.durationMs, cancel: finish };
}

// ---------------------------------------------------------------------------------------------
// The stylesheet slot

/** The id of the show's stylesheet element: the base rules once, then one slide's rules. */
export const MOTION_STYLE_ID = 'ts-motion-show';

/**
 * Writes `css` into the `<style id>` of a document, creating the element in `head` on the first
 * call; the text is replaced only when it changed, so a re-render costs nothing.
 */
export function setMotionStyle(doc: Document, id: string, css: string): void {
  let style = doc.getElementById(id) as HTMLStyleElement | null;
  if (style === null) {
    style = doc.createElement('style');
    style.id = id;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

// ---------------------------------------------------------------------------------------------
// The panel's preview (SPEC-5 2.1 Play and Stop): one preview runs per page; the studio's
// `motionPlay` (apps/studio/src/components/presentActions.ts) registers the running preview here
// and the Motion panel (packages/chrome) reads it, so the chrome never imports the studio and the
// Play button reads Stop while the canvas plays.

export type MotionPreviewState = {
  slideId: string;
  /** the step reached; -1 while the transition or the mount plays */
  step: number;
  steps: number;
  /** true while a step or the transition is still animating */
  running: boolean;
  /** true while the preview waits on a click step for a click or Enter */
  waiting: boolean;
};

type PreviewListener = (state: MotionPreviewState | null) => void;

let previewState: MotionPreviewState | null = null;
let previewStop: (() => void) | null = null;
let previewAdvance: (() => void) | null = null;
const previewListeners = new Set<PreviewListener>();

/** The running preview's facts, null when none plays. */
export function motionPreview(): MotionPreviewState | null {
  return previewState;
}

/** Called by the player: the state changed; `stop` and `advance` are the player's own. */
export function setMotionPreview(
  state: MotionPreviewState | null,
  controls?: { stop: () => void; advance: () => void },
): void {
  previewState = state;
  previewStop = state === null ? null : (controls?.stop ?? previewStop);
  previewAdvance = state === null ? null : (controls?.advance ?? previewAdvance);
  for (const listener of previewListeners) listener(state);
}

/** Stops the running preview, returning every object to rest; nothing when none plays. */
export function stopMotionPreview(): void {
  previewStop?.();
}

/** Continues a preview waiting on a click step (Enter, a click on the canvas, the panel). */
export function advanceMotionPreview(): void {
  previewAdvance?.();
}

/** Subscribes to the preview's state; the return value unsubscribes. */
export function subscribeMotionPreview(listener: PreviewListener): () => void {
  previewListeners.add(listener);
  return () => {
    previewListeners.delete(listener);
  };
}
