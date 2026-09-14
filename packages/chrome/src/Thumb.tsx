import { useEffect, useRef, useState } from 'react';

import { LiveClone } from '@turboslide/viewer/LiveClone';
import type { Theme } from '@turboslide/viewer/theme';

import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import type { ShellShot } from './shell-data';

import './Thumb.css';

/**
 * A slide thumbnail for the grid tiles and the sidebar's thumbnail density
 * (SPEC 5.5, 6.2; MILESTONES M3 item 5): the static capture from the render
 * worker when the studio has one (`shot`, the light and dark twins served by
 * /api/render/:slideId at thumbnail size and cached by revision), with the
 * live clone of the slide's HTML as the fallback while the capture is
 * pending or when it fails, and the blank plate when neither exists. The
 * capture for the current theme is requested; until it has decoded the clone
 * stays up, so a theme switch shows the retinted clone and never the other
 * theme's capture. Fills whatever frame holds it, as LiveClone and ThumbShot
 * do; the frame draws the one line. The clone mounts on the client only: the
 * server renders the plate, because a clone's slide HTML can carry an `<a>`
 * inside the sidebar row's own `<a>`, which the HTML parser closes early, so
 * the hydrated tree never matched and React regenerated the whole sidebar
 * (measured 2026-09-11 on /deck/gt-brand once thumbnails became the default
 * density; the 85 clones also made the SSR page 573 KB), and at most
 * THUMB_FETCH_LIMIT captures fetch at once. New in Turboslide
 * (no Prototemplate source); ThumbShot.tsx is the ported capture-only
 * component it succeeds.
 */
export type ThumbProps = {
  /** the static captures, when the studio has them */
  shot?: ShellShot;
  /** renderSlide output (SPEC 5.2) for the live clone */
  html?: string;
  theme: Theme;
  /** the clone's edge grid; off for the 64 by 36 sidebar mini */
  frame?: boolean;
  /** the blank plate's text when neither a capture nor html exists (the slide number) */
  fallbackText?: string;
  /**
   * Whether this frame may request a capture from the render route (gslides-parity SPEC-4 0.30,
   * 3.2; MILESTONES-4 "The seams"): `when-available` (the default) fetches the static capture once
   * the row is near the viewport; `never` keeps the live clone and asks the render route for
   * nothing, which is the editor's filmstrip since round four (the clone is the renderer's HTML
   * at the local commit, so a typed heading shows on its card before any network answer).
   */
  capture?: 'never' | 'when-available';
  /**
   * The parent's window decision (SPEC-4 0.41: one IntersectionObserver over the list, both
   * ways): true mounts the clone, false unmounts it and leaves the plate or the decoded capture.
   * Absent, the frame watches its own position once and stays near from the first sighting.
   */
  near?: boolean;
};

/**
 * How many captures fetch at once across every Thumb on the page (the frames with `capture`
 * `when-available`; the filmstrip's clone first cards never take a slot). A capture is a render request
 * (/api/render/:slideId?w=) that a cold instance answers in seconds; with the sidebar's 85 cards
 * asking at once, the browser's six connections to a dev server were all held by renders and an
 * editor write waited 10 to 16 s behind them, and on the host the renders compete with the write
 * for function instances (measured 2026-09-11). Three at a time keeps the rest of the connections
 * for the editor; the queue is first come first served, so the rows near the top decode first.
 */
export const THUMB_FETCH_LIMIT = 3;
let fetching = 0;
const waiting: Array<() => void> = [];
function requestSlot(grant: () => void): void {
  if (fetching < THUMB_FETCH_LIMIT) {
    fetching += 1;
    grant();
    return;
  }
  waiting.push(grant);
}
function releaseSlot(): void {
  const next = waiting.shift();
  if (next) {
    next();
    return;
  }
  fetching = Math.max(0, fetching - 1);
}

/**
 * How far from the viewport a thumbnail starts loading: two viewports of rows ahead, so a scroll
 * meets decoded captures, and nothing further. A row past that draws the plate and asks for
 * nothing: an 85 slide deck opened fresh queued 85 captures and 85 live clones at once, and the
 * render storm stalled the dev server's one process for seconds, so the room's stream and presence
 * routes of the same page waited behind it (VERIFICATION-3 finding 32: the second person's chip
 * missed its 5 s on a full copy while a three slide copy showed it in 3 ms). Google's filmstrip
 * renders thumbnails as they scroll into view.
 */
export const THUMB_NEAR_MARGIN = '200% 0px';

export function Thumb({
  shot,
  html,
  theme,
  frame = true,
  fallbackText = '',
  capture = 'when-available',
  near: nearProp,
}: ThumbProps) {
  const src =
    capture === 'never' || shot === undefined
      ? undefined
      : theme === 'dark'
        ? (shot.dark ?? shot.light)
        : shot.light;
  /* the src that has decoded, and the src that failed; a new src starts over */
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  /* false on the server and for the hydrating render, true from the first client effect */
  const [mounted, setMounted] = useState(false);
  useMountEffect(() => setMounted(true));
  /* true once the row is within THUMB_NEAR_MARGIN of the viewport (at once where no observer
     exists); a parent that runs the shared window passes the decision as `near` instead */
  const root = useRef<HTMLSpanElement>(null);
  const [ownNear, setNear] = useState(false);
  const near = nearProp ?? ownNear;
  useEffect(() => {
    if (nearProp !== undefined) return undefined;
    const el = root.current;
    if (el === null || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: THUMB_NEAR_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nearProp]);
  /* the src holding a fetch slot: the img mounts once the slot is granted and frees it on load or error */
  const [granted, setGranted] = useState<string | null>(null);
  const slot = useRef<string | null>(null);
  useEffect(() => {
    if (src === undefined || !near) return;
    let cancelled = false;
    requestSlot(() => {
      if (cancelled) {
        releaseSlot();
        return;
      }
      slot.current = src;
      setGranted(src);
    });
    return () => {
      cancelled = true;
      if (slot.current === src) {
        slot.current = null;
        releaseSlot();
      }
    };
  }, [src, near]);
  const settle = (which: string) => {
    if (slot.current === which) {
      slot.current = null;
      releaseSlot();
    }
  };
  const ready = src !== undefined && loaded === src;
  const broken = src !== undefined && failed === src;
  const clone = mounted && near && !ready && html !== undefined;
  const state = ready ? 'static' : clone ? 'clone' : 'plate';
  return (
    <span
      ref={root}
      className={cn('ts-thumb', ready && 'is-static')}
      data-thumb={state}
      data-capture={capture}
    >
      {clone ? <LiveClone html={html} theme={theme} frame={frame} /> : null}
      {state === 'plate' ? (
        <span className="ts-thumb-plate" aria-hidden="true">
          {fallbackText}
        </span>
      ) : null}
      {src !== undefined && granted === src && !broken ? (
        <img
          key={src}
          className="ts-thumb-img"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => {
            settle(src);
            setLoaded(src);
          }}
          onError={() => {
            settle(src);
            setFailed(src);
          }}
        />
      ) : null}
    </span>
  );
}
