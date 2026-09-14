import type { CSSProperties } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

import { applyThemeToTree } from './theme';
import type { Theme } from './theme';

/** How long the outgoing slide stays for its fade; matches --pt-dur-fast in tokens.css. */
const OUT_MS = 120;

/**
 * The current slide's body carries the one view transition name of the stage (gslides-parity
 * SPEC-4 0.40): a route transition (the router's `defaultViewTransition`) animates it as its own
 * group; the leaving body carries none, since one name belongs to one element. Slide changes
 * keep the keyed fade below and start no document transition.
 */
const STAGE_STYLE: CSSProperties = { viewTransitionName: 'ts-stage' };

export type SlideViewProps = {
  /** the slide id: the key of the body; a change starts the slide change motion */
  slideId: string;
  /** renderSlide output (SPEC 5.2), set as innerHTML (SPEC 5.3) */
  html: string;
  theme: Theme;
};

/** One keyed body of stage content: the slide it shows and its HTML. */
type Slot = { key: string; html: string };

/**
 * The rendered slide inside the stage (SPEC 5.3: renderSlide output set as
 * innerHTML; React owns chrome, overlays and view state only). The body is a
 * keyed wrapper (.pt-slide): the wrapper that leaves stays for the outgoing
 * fade and the wrapper that arrives rises in from the side the move came
 * from (Sheet.css, directive 7.4). After every commit the theme's twins are
 * applied to the fresh markup and its dither canvases drawn (SPEC 5.3: a
 * slide re-renders when its JSON changes; then drawDither runs on every
 * canvas.dither), so the HTML string itself stays theme neutral.
 */
export function SlideView({ slideId, html, theme }: SlideViewProps) {
  const body = useRef<HTMLDivElement>(null);
  const last = useRef<Slot | null>(null);
  const [leaving, setLeaving] = useState<Slot | null>(null);
  const leaveTimer = useRef(0);

  /* the leaving slot is derived during the render that changes the key, so
     the old wrapper is never unmounted and remounted; a timer lets it go
     after the outgoing fade */
  const prev = last.current;
  if (prev && prev.key !== slideId && (!leaving || leaving.key !== prev.key)) setLeaving(prev);
  last.current = { key: slideId, html };

  useLayoutEffect(() => {
    window.clearTimeout(leaveTimer.current);
    if (!leaving) return;
    leaveTimer.current = window.setTimeout(
      () => setLeaving((cur) => (cur === leaving ? null : cur)),
      OUT_MS,
    );
    return () => window.clearTimeout(leaveTimer.current);
  }, [leaving]);

  useLayoutEffect(() => {
    const el = body.current;
    if (el) applyThemeToTree(el, theme);
  }, [slideId, html, theme]);

  return (
    <>
      {leaving ? (
        <div
          key={leaving.key}
          className="pt-slide is-leaving"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: leaving.html }}
        />
      ) : null}
      <div
        key={slideId}
        ref={body}
        className="pt-slide"
        data-slide-id={slideId}
        style={STAGE_STYLE}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
