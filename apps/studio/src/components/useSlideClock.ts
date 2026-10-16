import { useLayoutEffect, useRef, useState } from 'react';

import type { ViewerSlide } from '@turboslide/viewer/model';
import { motionReduced, onMotionReducedChange } from '@turboslide/viewer/reduce-motion';
import { createSlideClock } from '@turboslide/viewer/slide-clock';
import type { ClockEntry, SlideClock } from '@turboslide/viewer/slide-clock';

import { useMountEffect } from './useMountEffect';

/** The step facts of the slide shown: its id, the step shown and its click steps. */
export type ClockSteps = { slideId: string; step: number; steps: number };

export type SlideClockHandle = {
  /** the clock of the slide shown, or null when it has no motion */
  clock: { current: SlideClock | null };
  /** where the next slide this surface shows enters: its start, its end, or after a step */
  enter: (slideId: string, at: ClockEntry) => void;
  steps: ClockSteps;
  /** the latest steps, for listeners registered once */
  stepsRef: { current: ClockSteps };
};

/**
 * The slide clock (HTML-SLIDES-DESIGN 2.6) of the slide a surface shows: the show's, and the
 * viewer's and the embed's slide mode. It builds one clock on the stage's slide body
 * (`.ts-stage > .pt-slide[data-slide-id]` under `scope`) for each slide shown and each new render
 * of it, entered where the move asked (`enter`; a new render of the same slide keeps its step,
 * anything else starts at the start), and disposes it so the stage draws the slide as authored
 * again; a body leaving the stage keeps its last frame for its fade out. Reduce motion rebuilds it
 * at the same step with cuts. Off (`enabled` false), no clock exists.
 */
export function useSlideClock(options: {
  /** the element whose subtree holds the stage */
  scope: () => ParentNode | null;
  slide: ViewerSlide | undefined;
  enabled: boolean;
  /** the timed advance ran out */
  onAdvance: () => void;
}): SlideClockHandle {
  const clock = useRef<SlideClock | null>(null);
  const entry = useRef<{ slideId: string; at: ClockEntry } | null>(null);
  const [steps, setSteps] = useState<ClockSteps>({ slideId: '', step: 0, steps: 0 });
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const advance = useRef(options.onAdvance);
  advance.current = options.onAdvance;
  const scope = useRef(options.scope);
  scope.current = options.scope;

  const [reduced, setReduced] = useState(motionReduced);
  useMountEffect(() => onMotionReducedChange(() => setReduced(motionReduced())));

  const slideId = options.slide?.id;
  const html = options.slide?.html;
  const motion = options.enabled ? options.slide?.motion : undefined;
  useLayoutEffect(() => {
    const root = scope.current();
    if (slideId === undefined || motion === undefined || root === null) {
      /* a move to a slide without motion asks nothing of a later render */
      if (entry.current?.slideId === slideId) entry.current = null;
      const id = slideId ?? '';
      setSteps((was) =>
        was.slideId === id && was.steps === 0 ? was : { slideId: id, step: 0, steps: 0 },
      );
      return undefined;
    }
    const body = Array.from(
      root.querySelectorAll<HTMLElement>('.ts-stage > .pt-slide:not(.is-leaving)'),
    ).find((el) => el.getAttribute('data-slide-id') === slideId);
    if (body === undefined) return undefined;
    const asked = entry.current?.slideId === slideId ? entry.current.at : null;
    entry.current = null;
    const kept = stepsRef.current.slideId === slideId ? stepsRef.current.step : null;
    const made = createSlideClock(body, motion, {
      reduced,
      entry: asked ?? kept ?? 'start',
      onAdvance: () => advance.current(),
      onStep: (step, count) => setSteps({ slideId, step, steps: count }),
    });
    clock.current = made;
    return () => {
      if (body.classList.contains('is-leaving')) made.freeze();
      else made.dispose();
      if (clock.current === made) clock.current = null;
    };
  }, [slideId, html, motion, reduced]);

  return {
    clock,
    enter: (id, at) => {
      entry.current = { slideId: id, at };
    },
    steps,
    stepsRef,
  };
}
