import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useLayoutEffect, useRef } from 'react';

import { changePhases } from './slide-change';
import type { SlideChange } from './slide-change';
import { applyThemeToTree } from './theme';
import type { Theme } from './theme';

/**
 * The current slide's body carries the one view transition name of the stage (gslides-parity
 * SPEC-4 0.40): a route transition (the router's `defaultViewTransition`) animates it as its own
 * group; the leaving body carries none, since one name belongs to one element. Slide changes
 * keep the keyed change below and start no document transition.
 */
const STAGE_STYLE: CSSProperties = { viewTransitionName: 'ts-stage' };

export type SlideViewProps = {
  /** the stage's change (useSlideChange): the slide shown and the one the last move left */
  change: SlideChange;
  /** the arrival of move `seq` has ended (useSlideChange's `entered`) */
  onEntered: (seq: number) => void;
  theme: Theme;
  /** a layer over the current body (the stage's ShaderLayer), handed the body's ref */
  layer?: (body: RefObject<HTMLDivElement | null>) => ReactNode;
};

/** The animations a body runs as it enters: its own (the CSS fade and rise, or a transition's keyframes). */
function entering(el: HTMLElement): Animation[] {
  if (typeof el.getAnimations !== 'function') return [];
  return el
    .getAnimations()
    .filter((animation) => animation.playState === 'running' || animation.pending);
}

function endOf(animation: Animation): number {
  const end = animation.effect?.getComputedTiming().endTime;
  return typeof end === 'number' && Number.isFinite(end) ? end : 0;
}

/**
 * The rendered slide inside the stage (SPEC 5.3: renderSlide output set as innerHTML; React owns
 * chrome, overlays and view state only). Each slide is a keyed wrapper (.pt-slide), opaque on its
 * own paper unless its slide is a full picture (`data-paper`, Sheet.css): on a move the wrapper the
 * move left stays, under the arriving one, and the arriving one enters (Sheet.css; a slide's own
 * transition through the slide clock). After the commit SlideView reads the arrival's
 * animations, writes their length as `--ts-change` on the sheet's root for the layers that move
 * with it (the leaving body's and the pictures' phases, slide-change.ts), and reports the end, which
 * takes the leaving wrapper away; an arrival with nothing to run (a cut, reduced motion, the
 * transition `none`) takes it away at once. After every commit the theme's twins are applied to the
 * fresh markup and its dither canvases drawn (SPEC 5.3), so the HTML string stays theme neutral.
 */
export function SlideView({ change, onEntered, theme, layer }: SlideViewProps) {
  const body = useRef<HTMLDivElement>(null);
  const { current, leaving, cut, seq } = change;
  const phases = changePhases(change);
  const holds = leaving !== null;
  const report = useRef(onEntered);
  report.current = onEntered;

  /* the arrival's end: read once the commit's layout effects have run (the slide clock, a
     sibling or a parent, starts a transition's keyframes in one of them), before the first paint */
  useLayoutEffect(() => {
    if (!holds) return undefined;
    const el = body.current;
    if (el === null) return undefined;
    let live = true;
    const done = () => {
      if (live) report.current(seq);
    };
    queueMicrotask(() => {
      if (!live) return;
      const running = entering(el);
      if (running.length === 0) {
        done();
        return;
      }
      const ms = Math.max(...running.map(endOf));
      const root = el.closest<HTMLElement>('.ts-sheet') ?? el.parentElement;
      root?.style.setProperty('--ts-change', `${Math.round(ms)}ms`);
      void Promise.all(running.map((animation) => animation.finished)).then(done, done);
    });
    return () => {
      live = false;
    };
  }, [seq, holds]);

  useLayoutEffect(() => {
    const el = body.current;
    if (el) applyThemeToTree(el, theme);
  }, [current.id, current.html, theme]);

  return (
    <>
      {leaving ? (
        <div
          key={leaving.id}
          className="pt-slide is-leaving"
          aria-hidden="true"
          data-paper={leaving.picture === undefined ? '' : undefined}
          data-out={phases.leavingBody === 'hold' ? undefined : (phases.leavingBody ?? undefined)}
          dangerouslySetInnerHTML={{ __html: leaving.html }}
        />
      ) : null}
      <div
        key={current.id}
        ref={body}
        className="pt-slide"
        data-slide-id={current.id}
        data-paper={current.picture === undefined ? '' : undefined}
        data-enter={cut ? 'cut' : undefined}
        style={STAGE_STYLE}
        dangerouslySetInnerHTML={{ __html: current.html }}
      />
      {layer?.(body)}
    </>
  );
}

/**
 * The stage-wide picture of a full-picture slide (the theme's stage.css `.backdrop`, head:249-254),
 * for the slide shown and the one leaving, each moving in its phase of the change
 * (slide-change.ts). Its own ground is transparent and each picture carries the paper under
 * itself, so a picture fades in from the stage's surround and never from a block of paper.
 */
export function SlideBackdrop({ change }: { change: SlideChange | null }) {
  const phases = changePhases(change);
  const leaving = change?.leaving?.picture;
  const current = change?.current.picture;
  return (
    <div className="backdrop" aria-hidden="true">
      {leaving !== undefined && change?.leaving ? (
        <img
          key={`${change.leaving.id} ${leaving}`}
          src={leaving}
          alt=""
          data-out={phases.leavingPicture === 'late' ? 'late' : undefined}
        />
      ) : null}
      {current !== undefined && change ? (
        <img
          key={`${change.current.id} ${current}`}
          src={current}
          alt=""
          data-in={
            phases.currentPicture === 'all' || phases.currentPicture === 'early'
              ? phases.currentPicture
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
