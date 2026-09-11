import { useState } from 'react';

import { LiveClone } from '@turboslide/viewer/LiveClone';
import type { Theme } from '@turboslide/viewer/theme';

import { cn } from './lib/cn';
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
 * do; the frame draws the one line. New in Turboslide (no Prototemplate
 * source); ThumbShot.tsx is the ported capture-only component it succeeds.
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
};

export function Thumb({ shot, html, theme, frame = true, fallbackText = '' }: ThumbProps) {
  const src = shot ? (theme === 'dark' ? (shot.dark ?? shot.light) : shot.light) : undefined;
  /* the src that has decoded, and the src that failed; a new src starts over */
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ready = src !== undefined && loaded === src;
  const broken = src !== undefined && failed === src;
  const clone = !ready && html !== undefined;
  const state = ready ? 'static' : clone ? 'clone' : 'plate';
  return (
    <span className={cn('ts-thumb', ready && 'is-static')} data-thumb={state}>
      {clone ? <LiveClone html={html} theme={theme} frame={frame} /> : null}
      {state === 'plate' ? (
        <span className="ts-thumb-plate" aria-hidden="true">
          {fallbackText}
        </span>
      ) : null}
      {src !== undefined && !broken ? (
        <img
          key={src}
          className="ts-thumb-img"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
        />
      ) : null}
    </span>
  );
}
