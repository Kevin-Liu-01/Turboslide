// The slide clock (docs: HTML-SLIDES-DESIGN 2.3, 2.6): one seekable clock per slide in the show,
// the viewer's present mode and the embed. It compiles the slide's effects to Web Animations
// (@turboslide/render/motion) on the rehearsal timeline (`scheduleOf`): every Animation is
// created paused with its start as its delay, so any moment of the slide is drawn by setting
// every Animation's time (`seek`), and a step plays by giving only that segment's Animations a
// start time on the document timeline, so transform and opacity run on the compositor. A click
// while a segment plays finishes it at once and begins the next; back shows the state after the
// previous step. A hidden tab pauses the clock and the timed advance, and showing it resumes
// from the same moment. Under reduced motion no Animation runs: each step cuts to its state
// (`stateAt`), and the steps keep their clicks. `dispose` cancels everything, so the slide body
// returns to its authored state with every block in place.
import { compileEffect, compileTransition, unitTiming } from '@turboslide/render/motion';
import type { MotionKeyframe } from '@turboslide/render/motion';
import { scheduleOf, stateAt } from '@turboslide/schema/motion-core';
import type { Schedule, SplitUnit } from '@turboslide/schema/motion-core';

import type { SlideMotion } from './model';

export type { SlideMotion } from './model';

/** Where a slide starts: its first moment, the state after its last step, or after step k. */
export type ClockEntry = 'start' | 'end' | number;

export type SlideClockOptions = {
  reduced: boolean;
  entry: ClockEntry;
  /** the timed advance ran out: the show moves to the next slide */
  onAdvance?: () => void;
  /** the step changed (0 is the state once segment 0 has played) */
  onStep?: (step: number, steps: number) => void;
  /** the document the clock listens to for a hidden tab; the global one by default */
  doc?: Document;
};

export type SlideClock = {
  readonly steps: number;
  readonly schedule: Schedule;
  /** the step shown or playing */
  step: () => number;
  /** plays the next step; false when none remains (the show moves to the next slide) */
  next: () => boolean;
  /** shows the state after the previous step; false at step 0 (the show moves to the previous slide) */
  back: () => boolean;
  /** shows the state after step k */
  go: (step: number) => void;
  /** draws the moment `ms` of the rehearsal timeline, paused */
  seek: (ms: number) => void;
  pause: () => void;
  resume: () => void;
  /** stops the clock and returns the slide body to its authored state */
  dispose: () => void;
  /**
   * stops the clock and keeps the frame drawn: for a body that is leaving the stage (its fade out),
   * so an exited block does not show again for the length of the fade
   */
  freeze: () => void;
};

/** One Animation with the segment that plays it. */
type Run = { animation: Animation; step: number; endMs: number; infinite: boolean };

const SHAPES = 'path, line, polyline, polygon, circle, ellipse, rect';

function blockElement(root: Element, id: string): HTMLElement | null {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(id)
      : id.replace(/["\\]/g, '\\$&');
  return root.querySelector<HTMLElement>(`[data-block="${escaped}"]`);
}

/** The block ids the slide body draws. */
function blocksOn(root: Element): Set<string> {
  const ids = new Set<string>();
  root.querySelectorAll('[data-block]').forEach((el) => {
    const id = el.getAttribute('data-block');
    if (id !== null) ids.add(id);
  });
  return ids;
}

/** The units of a split block, each with the index its delay counts (a line's words share theirs). */
type Units = { units: Array<{ el: HTMLElement; index: number }>; count: number; undo: () => void };

/**
 * Wraps a block's words (and, for glyphs, each word's glyphs inside a word span that does not
 * break) in inline-block spans; lines are grouped from the measured tops of the words. Only the
 * show's slide body is split, never a render, so exports keep their layout. `undo` restores the
 * text nodes.
 */
export function splitText(el: HTMLElement, by: SplitUnit): Units {
  const doc = el.ownerDocument;
  const words: HTMLElement[] = [];
  const glyphs: HTMLElement[] = [];
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (parent === null || parent.closest('svg, style, script, [data-u], [data-uw]') !== null)
        return NodeFilter.FILTER_REJECT;
      return (node.textContent ?? '').trim() === ''
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    texts.push(node as Text);
  for (const text of texts) {
    const parts = (text.textContent ?? '').split(/(\s+)/);
    const fragment = doc.createDocumentFragment();
    for (const part of parts) {
      if (part === '') continue;
      if (/^\s+$/.test(part)) {
        fragment.append(doc.createTextNode(part));
        continue;
      }
      const word = doc.createElement('span');
      word.setAttribute(by === 'glyph' ? 'data-uw' : 'data-u', '');
      word.style.display = 'inline-block';
      word.style.whiteSpace = 'nowrap';
      if (by === 'glyph') {
        for (const glyph of Array.from(part)) {
          const unit = doc.createElement('span');
          unit.setAttribute('data-u', '');
          unit.style.display = 'inline-block';
          unit.textContent = glyph;
          word.append(unit);
          glyphs.push(unit);
        }
      } else {
        word.textContent = part;
      }
      words.push(word);
      fragment.append(word);
    }
    text.replaceWith(fragment);
  }
  const undo = () => {
    const parents = new Set<Node>();
    for (const word of words) {
      const parent = word.parentNode;
      if (parent === null) continue;
      parents.add(parent);
      word.replaceWith(doc.createTextNode(word.textContent ?? ''));
    }
    parents.forEach((parent) => parent.normalize());
  };
  if (by === 'glyph')
    return {
      units: glyphs.map((unit, index) => ({ el: unit, index })),
      count: glyphs.length,
      undo,
    };
  if (by === 'word')
    return { units: words.map((word, index) => ({ el: word, index })), count: words.length, undo };
  /* lines: a word whose top differs from the last line's by more than a few px opens a line */
  let line = -1;
  let top = Number.NEGATIVE_INFINITY;
  const units = words.map((word) => {
    const at = word.offsetTop;
    if (Math.abs(at - top) > 4) {
      line += 1;
      top = at;
    }
    return { el: word, index: line };
  });
  return { units, count: line + 1, undo };
}

/** The stroke keyframes of `draw` for one shape, from its measured length. */
function strokeKeyframes(shape: SVGGeometryElement, exit: boolean): MotionKeyframe[] | null {
  let length = 0;
  try {
    length = shape.getTotalLength();
  } catch {
    return null;
  }
  if (!(length > 0)) return null;
  const dash = `${length} ${length}`;
  const frames: MotionKeyframe[] = [
    { strokeDasharray: dash, strokeDashoffset: String(length) },
    { strokeDasharray: dash, strokeDashoffset: '0' },
  ];
  return exit ? frames.reverse() : frames;
}

function timelineNow(doc: Document): number | null {
  const now = doc.timeline?.currentTime;
  return typeof now === 'number' ? now : null;
}

/**
 * Creates the clock of one slide body (the `.pt-slide` element that holds the rendered slide).
 * The body must carry block attributes (`data-block`), as the show's and the viewer's renders do.
 */
export function createSlideClock(
  body: HTMLElement,
  motion: SlideMotion,
  options: SlideClockOptions,
): SlideClock {
  const doc = options.doc ?? body.ownerDocument;
  const blocks = blocksOn(body);
  const schedule = scheduleOf(motion, {
    ...(motion.transition !== undefined ? { transition: motion.transition } : {}),
    blocks,
  });
  const steps = schedule.steps;
  const byId = new Map(motion.effects.map((effect) => [effect.id, effect]));
  const runs: Run[] = [];
  const undos: Array<() => void> = [];
  const reduced = options.reduced;
  let step = 0;
  let disposed = false;
  let paused = false;
  /* the timer that ends the playing segment, and the one of the timed advance */
  let segmentTimer = 0;
  let advanceTimer = 0;
  let timerDue: { kind: 'segment' | 'advance'; remaining: number; set: number } | null = null;
  const view = doc.defaultView;

  const animate = (
    el: Element,
    keyframes: MotionKeyframe[],
    timing: KeyframeAnimationOptions,
    runStep: number,
    endMs: number,
  ): void => {
    if (keyframes.length === 0) return;
    const animation = el.animate(keyframes as Keyframe[], timing);
    animation.pause();
    animation.currentTime = 0;
    runs.push({
      animation,
      step: runStep,
      endMs,
      infinite: timing.iterations === Number.POSITIVE_INFINITY,
    });
  };

  /* the transition: the entering body's own keyframes replace today's rise; none is a cut */
  if (motion.transition !== undefined) {
    body.style.animation = 'none';
    undos.push(() => body.style.removeProperty('animation'));
    if (!reduced) {
      const compiled = compileTransition(motion.transition);
      animate(
        body,
        compiled.keyframes,
        { duration: compiled.duration, easing: compiled.easing, fill: 'backwards' },
        0,
        compiled.duration,
      );
    }
  }

  if (!reduced) {
    const seen = new Set<string>();
    for (const scheduled of schedule.effects) {
      const effect = byId.get(scheduled.id);
      const el = blockElement(body, scheduled.block);
      if (effect === undefined || el === null) continue;
      const compiled = compileEffect(effect);
      const first = !seen.has(effect.block) && effect.role !== 'emphasis';
      if (effect.role !== 'emphasis') seen.add(effect.block);
      /* an enter's first frame hides the block before it starts; later effects hold their end only */
      const fill: FillMode = first && effect.role === 'enter' ? 'both' : 'forwards';
      const runMs = Math.max(1, scheduled.endMs - scheduled.startMs);
      const base = { easing: compiled.easing, iterations: compiled.iterations };
      if (effect.role !== 'emphasis') {
        const shown = [{ visibility: 'hidden' }, { visibility: 'visible' }];
        animate(
          el,
          effect.role === 'enter' ? shown : shown.reverse(),
          { duration: runMs, delay: scheduled.startMs, fill, easing: 'linear' },
          scheduled.step,
          scheduled.endMs,
        );
      }
      if (compiled.split !== undefined) {
        const split = splitText(el, compiled.split.by);
        undos.push(split.undo);
        const timing = unitTiming(compiled.split, compiled.duration, split.count);
        for (const unit of split.units) {
          animate(
            unit.el,
            compiled.keyframes,
            {
              ...base,
              duration: timing.unitMs,
              delay: scheduled.startMs + timing.delayOf(unit.index),
              fill: effect.role === 'enter' ? 'both' : 'forwards',
            },
            scheduled.step,
            scheduled.endMs,
          );
        }
        continue;
      }
      if (compiled.draw === true) {
        const shapes = Array.from(el.querySelectorAll<SVGGeometryElement>(SHAPES)).filter(
          (shape) => typeof shape.getTotalLength === 'function',
        );
        let drawn = false;
        for (const shape of shapes) {
          const frames = strokeKeyframes(shape, effect.role === 'exit');
          if (frames === null) continue;
          drawn = true;
          animate(
            shape,
            frames,
            { ...base, duration: compiled.duration, delay: scheduled.startMs, fill },
            scheduled.step,
            scheduled.endMs,
          );
        }
        if (drawn) continue;
      }
      animate(
        el,
        compiled.keyframes,
        { ...base, duration: compiled.duration, delay: scheduled.startMs, fill },
        scheduled.step,
        scheduled.endMs,
      );
    }
  }

  /* reduced motion: each block's visibility after the step, no Animation */
  const cutTo = (k: number): void => {
    const visible = stateAt(schedule, k);
    for (const [id, shown] of Object.entries(visible)) {
      const el = blockElement(body, id);
      if (el !== null) el.style.visibility = shown ? '' : 'hidden';
    }
  };
  if (reduced) {
    undos.push(() => {
      for (const id of Object.keys(stateAt(schedule, 0))) {
        blockElement(body, id)?.style.removeProperty('visibility');
      }
    });
  }

  const clearTimers = (): void => {
    view?.clearTimeout(segmentTimer);
    view?.clearTimeout(advanceTimer);
    timerDue = null;
  };

  const startAdvance = (delay: number): void => {
    if (motion.advance === undefined || options.onAdvance === undefined || view === null) return;
    view.clearTimeout(advanceTimer);
    timerDue = { kind: 'advance', remaining: delay, set: Date.now() };
    /* a hidden tab keeps the hold for when it shows again (resume) */
    if (paused) return;
    advanceTimer = view.setTimeout(() => {
      timerDue = null;
      if (!disposed) options.onAdvance?.();
    }, delay);
  };

  /* a segment's end: the timed advance counts from the end of the last one */
  const startSegmentEnd = (delay: number): void => {
    if (view === null) return;
    view.clearTimeout(segmentTimer);
    timerDue = { kind: 'segment', remaining: delay, set: Date.now() };
    if (paused) return;
    segmentTimer = view.setTimeout(() => {
      timerDue = null;
      if (!disposed && step === steps && motion.advance !== undefined)
        startAdvance(motion.advance.afterMs);
    }, delay);
  };

  /* the Animations a hidden tab paused, played again when it shows */
  const held: Animation[] = [];

  /**
   * The step shown at rehearsal time `ms`: a segment counts once its start has passed, so the
   * moment a click lands (the end of the previous segment) still shows the previous step.
   */
  const stepOfTime = (ms: number): number => {
    let at = 0;
    for (const segment of schedule.segments) if (segment.startMs < ms) at = segment.step;
    return at;
  };

  /**
   * Every Animation drawn at rehearsal time `ms`, paused. With `upTo`, an emphasis that repeats
   * until the slide leaves keeps running once its step (at most `upTo`) has played.
   */
  const holdAt = (ms: number, upTo: number | null): void => {
    for (const run of runs) {
      run.animation.pause();
      run.animation.currentTime = ms;
      if (upTo === null || !run.infinite || run.step > upTo) continue;
      if (paused) held.push(run.animation);
      else run.animation.play();
    }
  };

  const endOf = (k: number): number => schedule.segments[k]?.endMs ?? schedule.lengthMs;

  /** Shows the state after step k at once. */
  const showEnd = (k: number): void => {
    clearTimers();
    step = Math.max(0, Math.min(steps, k));
    if (reduced) cutTo(step);
    else holdAt(endOf(step), step);
    options.onStep?.(step, steps);
    if (step === steps && motion.advance !== undefined) startAdvance(motion.advance.afterMs);
  };

  /** Plays segment k from its start; earlier segments end, later ones wait. */
  const play = (k: number): void => {
    clearTimers();
    step = k;
    options.onStep?.(step, steps);
    if (reduced) {
      cutTo(k);
      if (k === steps && motion.advance !== undefined) startAdvance(motion.advance.afterMs);
      return;
    }
    const segment = schedule.segments[k];
    if (segment === undefined) return;
    const now = timelineNow(doc);
    for (const run of runs) {
      const animation = run.animation;
      if (run.step < k) {
        if (run.infinite && animation.playState === 'running') continue;
        animation.pause();
        animation.currentTime = Math.max(run.endMs, segment.startMs);
        if (run.infinite) animation.play();
      } else if (run.step > k) {
        animation.pause();
        animation.currentTime = segment.startMs;
      } else {
        animation.pause();
        animation.currentTime = segment.startMs;
        if (paused) held.push(animation);
        else if (now !== null) animation.startTime = now - segment.startMs;
        else animation.play();
      }
    }
    startSegmentEnd(Math.max(0, segment.endMs - segment.startMs));
  };

  /* hidden tab: the clock and its timers wait, and resume from the same moment */
  const pause = (): void => {
    if (paused) return;
    paused = true;
    for (const run of runs) {
      if (run.animation.playState === 'running') {
        run.animation.pause();
        held.push(run.animation);
      }
    }
    if (timerDue !== null) {
      const due = timerDue;
      const left = Math.max(0, due.remaining - (Date.now() - due.set));
      view?.clearTimeout(segmentTimer);
      view?.clearTimeout(advanceTimer);
      timerDue = { ...due, remaining: left };
    }
  };
  const resume = (): void => {
    if (!paused) return;
    paused = false;
    for (const animation of held.splice(0)) animation.play();
    if (timerDue !== null) {
      const due = timerDue;
      if (due.kind === 'segment') startSegmentEnd(due.remaining);
      else startAdvance(due.remaining);
    }
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') pause();
    else resume();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  /* the entry */
  if (options.entry === 'start') play(0);
  else showEnd(options.entry === 'end' ? steps : options.entry);
  if (doc.visibilityState === 'hidden') pause();

  return {
    steps,
    schedule,
    step: () => step,
    next: () => {
      if (disposed || step >= steps) return false;
      play(step + 1);
      return true;
    },
    back: () => {
      if (disposed || step <= 0) return false;
      showEnd(step - 1);
      return true;
    },
    go: (k) => {
      if (!disposed) showEnd(k);
    },
    seek: (ms) => {
      if (disposed) return;
      clearTimers();
      if (reduced) cutTo(stepOfTime(ms));
      else holdAt(ms, null);
    },
    pause,
    resume,
    freeze: () => {
      if (disposed) return;
      disposed = true;
      clearTimers();
      doc.removeEventListener('visibilitychange', onVisibility);
      for (const run of runs) run.animation.pause();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearTimers();
      doc.removeEventListener('visibilitychange', onVisibility);
      for (const run of runs) run.animation.cancel();
      runs.length = 0;
      for (const undo of undos.splice(0).reverse()) undo();
    },
  };
}

/**
 * The block ids hidden after step k, for the presenter's previews and the step view: the blocks
 * whose enter has not played, or whose exit has. Answers nothing for a slide without effects.
 */
export function hiddenAt(motion: SlideMotion | undefined, k: number): string[] {
  if (motion === undefined || motion.effects.length === 0) return [];
  const schedule = scheduleOf(
    motion,
    motion.transition !== undefined ? { transition: motion.transition } : {},
  );
  return Object.entries(stateAt(schedule, k))
    .filter(([, shown]) => !shown)
    .map(([id]) => id);
}

/** The click steps of a slide, without a page: the steps the presenter counts. */
export function stepsOf(motion: SlideMotion | undefined): number {
  if (motion === undefined || motion.effects.length === 0) return 0;
  return scheduleOf(motion).steps;
}

/** Hides the given blocks inside a rendered slide body (inline visibility), and shows the rest again. */
export function applyHidden(body: Element, hidden: ReadonlyArray<string>): void {
  const wanted = new Set(hidden);
  body.querySelectorAll<HTMLElement>('[data-block]').forEach((el) => {
    const id = el.getAttribute('data-block');
    if (id === null) return;
    if (wanted.has(id)) el.style.visibility = 'hidden';
    else if (el.style.visibility === 'hidden') el.style.removeProperty('visibility');
  });
}
