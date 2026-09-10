import { useRef } from 'react';

import { useMountEffect } from './lib/useMountEffect';
import { usePtShell } from './shell-context';

import './Progress.css';

/**
 * The 2px hairline under the stage, ported from
 * Prototemplate/src/components/viewer/Progress.tsx. On paged routes it fills
 * to (index + 1) / total, written as an inline transform so the server
 * render already carries it. On flow routes it follows the scroll position
 * of the scrolling box inside .pt-stagewrap, read from one passive listener
 * on the document in the capture phase (scroll events do not bubble). The
 * listener is always attached because a route can change tables with its
 * mode; it reads the key table through a ref at event time and returns at
 * once on a paged route. The rest is coalesced to one animation frame and
 * written straight to the fill's transform, so a scroll never renders React
 * (directive 7.5). A value prop overrides both.
 */
export type ProgressProps = {
  /** 0 to 1; replaces the shell-derived fraction */
  value?: number;
};

function clamp(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

function scaleOf(fraction: number): string {
  return `scaleX(${Math.round(fraction * 10000) / 10000})`;
}

export function Progress({ value }: ProgressProps) {
  const shell = usePtShell();
  const fill = useRef<HTMLElement>(null);

  const paged = shell.total > 0 && shell.index >= 0 ? (shell.index + 1) / shell.total : 0;
  /* the fraction React owns: a value, or the paged place; null while a flow route's scroll owns it */
  const fixed = value !== undefined ? clamp(value) : shell.keys === 'paged' ? clamp(paged) : null;

  /* the scroll listener reads these at event time */
  const fixedRef = useRef(fixed);
  fixedRef.current = fixed;

  useMountEffect(() => {
    let frame = 0;
    let next = 0;
    const paint = () => {
      frame = 0;
      const el = fill.current;
      if (el && fixedRef.current === null) el.style.transform = scaleOf(next);
    };
    const onScroll = (event: Event) => {
      if (fixedRef.current !== null) return;
      const box = event.target;
      if (!(box instanceof HTMLElement)) return;
      if (!box.closest('.pt-stagewrap')) return;
      const range = box.scrollHeight - box.clientHeight;
      next = range > 0 ? clamp(box.scrollTop / range) : 0;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  });

  return (
    <div className="pt-progress" aria-hidden="true">
      <i ref={fill} style={fixed !== null ? { transform: scaleOf(fixed) } : undefined} />
    </div>
  );
}
