import type { MenuClientHandler } from '@turboslide/chrome/menus/model';
import {
  compileMotion,
  countParagraphs,
  deckMediaLength,
  MOTION_BASE_CSS,
  motionCss,
} from '@turboslide/render/motion';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import type { MotionSchedule } from '@turboslide/schema/motion';
import { blockParagraphCount, motionTargets, slideHasMotion } from '@turboslide/schema/motion';
import { deckPage } from '@turboslide/schema/render';
import type { Page } from '@turboslide/schema/render';
import type { ViewerSlide } from '@turboslide/viewer/model';
import { stepCount } from '@turboslide/viewer/present/presentModel';
import {
  attachMotionLayer,
  MOTION_STYLE_ID,
  playTransition,
  prefersReducedMotion,
  setMotionPreview,
  setMotionStyle,
  stopMotionPreview,
} from '@turboslide/viewer/present/SlideshowLayer';
import type { TransitionRun } from '@turboslide/viewer/present/SlideshowLayer';

/**
 * The handlers behind the Slideshow split button (gslides-parity SPEC 9.1; MILESTONES B6 item 1).
 * The button itself is the chrome's TitleRow; the menu model names its arrow items as the client
 * handlers `presenterView` and `presentFromBeginning` and its main part as the action
 * `view.present`. The editor and the viewer hand in a `PresentHost` (the deck id, the play list's
 * first slide, a goto and a present switch) and bind `presentClientHandlers(host)` to the menu's
 * client effects. Every function here is one step of Google's flow: start from the current slide
 * in this tab and go full screen when the browser allows (Esc leaves both), start from slide 1,
 * or open Presenter view in a second window and put this tab into the show.
 */
export type PresentHost = {
  deckId: string;
  /** the first slide of the play list (skipped slides left out), or undefined for an empty deck */
  firstSlideId: () => string | undefined;
  goto: (slideId: string) => void;
  present: (on: boolean) => void;
};

export type PresentClientHandler = Extract<
  MenuClientHandler,
  'presenterView' | 'presentFromBeginning'
>;

/** The presenter window: one per deck, so a second Presenter view focuses the first. */
export function presenterWindowName(deckId: string): string {
  return `turboslide-presenter:${deckId}`;
}

export function presenterPath(deckId: string): string {
  return `/present/${encodeURIComponent(deckId)}`;
}

/** The audience form of the show, the shareable present link (SPEC 9.3). */
export function audiencePath(deckId: string): string {
  return `/deck/${encodeURIComponent(deckId)}?present=1`;
}

/** The presenter window's size when the browser opens it as a popup. */
const PRESENTER_FEATURES = 'popup=yes,width=1180,height=760';

/**
 * Full screen on the document, best effort: a refusal (no gesture, a frame without the
 * permission, a browser without the API) leaves the show in the window, as Google's
 * "Presentation display options" allows.
 */
export function requestPresentFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (document.fullscreenElement) return;
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== 'function') return;
  root.requestFullscreen().catch(() => undefined);
}

export function exitPresentFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (!document.fullscreenElement) return;
  if (typeof document.exitFullscreen !== 'function') return;
  document.exitFullscreen().catch(() => undefined);
}

export type StartSlideshowOptions = {
  /** from the current slide (the button) or from slide 1 (Start from beginning) */
  from?: 'current' | 'beginning';
  /** ask for full screen; the default, as the main button does */
  fullscreen?: boolean;
};

/** The main part of the button, and Start from beginning with `from: 'beginning'`. */
export function startSlideshow(host: PresentHost, options: StartSlideshowOptions = {}): void {
  if (options.from === 'beginning') {
    const first = host.firstSlideId();
    if (first !== undefined) host.goto(first);
  }
  host.present(true);
  if (options.fullscreen !== false) requestPresentFullscreen();
}

/** Opens `/present/<id>` in a second window (the S key, Options > Open speaker notes, the arrow item). */
export function openPresenterView(deckId: string): Window | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.open(presenterPath(deckId), presenterWindowName(deckId), PRESENTER_FEATURES);
  } catch {
    return null;
  }
}

/**
 * Presenter view from the arrow: the second window, then this tab into the show. Full screen is
 * not asked for here: the presenter window would cover it on one screen, and the presenter drags
 * the window to the other screen first (SPEC 9.1 item 3's tooltip says so).
 */
export function presenterView(host: PresentHost): void {
  openPresenterView(host.deckId);
  startSlideshow(host, { fullscreen: false });
}

export function presentFromBeginning(host: PresentHost): void {
  startSlideshow(host, { from: 'beginning' });
}

/** The two client handlers of the Slideshow arrow, keyed as the menu model names them. */
export function presentClientHandlers(host: PresentHost): Record<PresentClientHandler, () => void> {
  return {
    presenterView: () => presenterView(host),
    presentFromBeginning: () => presentFromBeginning(host),
  };
}

// ---------------------------------------------------------------------------------------------
// Round five (gslides-parity SPEC-5 2.1, 2.2; MILESTONES-5 B1 days 3 and 4): the schedules the
// show and the presenter read, and the Motion panel's Play over the editor's canvas.

/**
 * The schedule of a slide from the document alone (SPEC-5 0.4): the paragraph counts from the
 * schema (the number the renderer's nodes and the exporter's scene lines agree with) and the
 * media lengths from `deck.media`. The same arithmetic `motion.compile` answers.
 */
export function slideSchedule(document: DeckDocument, slide: Slide): MotionSchedule {
  const blocks = motionTargets(slide);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  return compileMotion(
    slide,
    blocks,
    (blockId) => {
      const block = byId.get(blockId);
      return block === undefined ? 0 : blockParagraphCount(block);
    },
    deckMediaLength(document.deck, slide),
  );
}

/** A viewer slide with its schedule attached as `motion` when the record carries motion (`motionOf` reads it). */
export function withMotion<T extends ViewerSlide>(
  viewerSlide: T,
  document: DeckDocument,
  record: Slide | undefined,
): T & { motion?: MotionSchedule } {
  if (record === undefined || !slideHasMotion(record)) return viewerSlide;
  return { ...viewerSlide, motion: slideSchedule(document, record) };
}

export type MotionPlayInput = { slideId: string; from?: number };
export type MotionPlayOutput = { slideId: string; step: number; steps: number };

export type MotionPlayDeps = {
  document: () => DeckDocument;
  /** the deck's page in sheet px; `deckPage(deck)` when absent */
  page?: Page;
};

/** The editor canvas root of a slide: the rendered `.slide[data-slide]` inside the edit stage, never the show's. */
function canvasSlideRoot(slideId: string): HTMLElement | null {
  const roots = document.querySelectorAll<HTMLElement>(
    `.pt-slide [data-slide="${slideId.replace(/"/g, '\\"')}"]`,
  );
  for (const root of roots) if (root.closest('.ts-stagewrap.is-present') === null) return root;
  return null;
}

/**
 * The Motion panel's Play (SPEC-5 2.1, `motion.play`, window only): compiles the slide's schedule
 * against the rendered nodes of the editor's canvas, loads the show's stylesheet, plays the
 * transition's incoming half then the steps on the canvas through the motion layer, waits on
 * every click step for a click on the slide, Enter, or the panel's own advance, and returns every
 * object to rest at the end, on Stop or on Esc. The state rides on the layer's preview registry,
 * which the panel reads to show Stop. Answers the step it started at and the step count.
 */
export function motionPlay(input: MotionPlayInput, deps: MotionPlayDeps): MotionPlayOutput {
  stopMotionPreview();
  const doc = deps.document();
  const slide = doc.slides[input.slideId];
  if (slide === undefined) throw new RangeError(`No slide "${input.slideId}"`);
  const root = canvasSlideRoot(input.slideId);
  if (root === null)
    throw new RangeError(`Slide "${input.slideId}" is not on the canvas; select it first`);
  const blocks = motionTargets(slide);
  const schedule = compileMotion(
    slide,
    blocks,
    (blockId) => {
      const block = root.querySelector(`[data-block="${blockId.replace(/"/g, '\\"')}"]`);
      if (block === null) return 0;
      return countParagraphs(block);
    },
    deckMediaLength(doc.deck, slide),
  );
  const steps = stepCount(schedule);
  const page = deps.page ?? deckPage(doc.deck);
  setMotionStyle(
    document,
    MOTION_STYLE_ID,
    [MOTION_BASE_CSS, motionCss(schedule, page)].filter((css) => css !== '').join('\n'),
  );
  const reduced = prefersReducedMotion();
  let step = Math.max(-1, Math.min(input.from ?? 0, steps) - 1);
  let stopped = false;
  let waitTimer = 0;
  const layer = attachMotionLayer(root, schedule, {
    reduced,
    onSettled: (settled) => {
      if (stopped) return;
      if (settled >= steps) {
        // the last step settled: a beat at rest, then the objects return to their still
        waitTimer = window.setTimeout(stop, reduced ? 0 : 400);
        return;
      }
      publish(false, true);
    },
  });
  const publish = (running: boolean, waiting: boolean): void => {
    setMotionPreview(
      { slideId: input.slideId, step: Math.max(0, step), steps, running, waiting },
      { stop, advance },
    );
  };
  const onKey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target !== null && target.closest('input, textarea, select, [contenteditable="true"]'))
      return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stop();
    } else if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (target !== null && target.closest('[data-control="motion.play"]')) return;
      event.preventDefault();
      event.stopPropagation();
      advance();
    }
  };
  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (target === null || !root.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    advance();
  };
  function stop(): void {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(waitTimer);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onClick, true);
    transitionRun?.cancel();
    layer.unmount();
    setMotionPreview(null);
  }
  function advance(): void {
    if (stopped || layer.playing) return;
    if (step >= steps) {
      stop();
      return;
    }
    step += 1;
    const duration = layer.play(step);
    publish(duration > 0, false);
    if (duration === 0) layer.settle();
  }
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onClick, true);
  layer.mount();
  if (step >= 0) layer.seek(step);
  publish(true, false);
  // the transition's incoming half on the canvas, then the entry step (R01 4: the transition
  // plays first, then the chains that hang off the slide's start)
  let transitionRun: TransitionRun | null = null;
  const container = root.parentElement ?? root;
  transitionRun = playTransition(container, root, null, step < 0 ? schedule.transition : null, {
    scopeSlideId: input.slideId,
    reduced,
    onDone: () => {
      transitionRun = null;
      if (stopped) return;
      if (step < 0) advance();
      else publish(false, step < steps);
    },
  });
  return { slideId: input.slideId, step: Math.max(0, step), steps };
}
