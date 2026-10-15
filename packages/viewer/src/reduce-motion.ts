/**
 * Whether motion is reduced on this page, from both of its sources: the system's
 * `prefers-reduced-motion: reduce`, and Tools > Preferences > Reduce motion, which the studio stamps
 * as `data-reduce-motion` on the root (packages/chrome/src/chrome-preferences.ts; the Glyphfield
 * port, PLAN.md wave 1 item 7). The one module that answers the question in script: the help card,
 * the viewer shell's view transition, the tooltip's fade, the shader gallery's hover preview, the
 * router's view transition and the stage's live shader (MaterialMount.tsx) read it. The stylesheets
 * read the same two sources in tokens.css, which zeroes every `--pt-dur-*` duration under either.
 * The attribute's name lives here, in the viewer, so the viewer's own modules can read it.
 */

/** Present on the root while Tools > Preferences > Reduce motion is on. */
export const REDUCE_MOTION_ATTRIBUTE = 'data-reduce-motion';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function reducedQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(REDUCED_QUERY);
  } catch {
    return null;
  }
}

/** True when the system asks for reduced motion or the root carries Reduce motion; false on a server. */
export function motionReduced(): boolean {
  if (
    typeof document !== 'undefined' &&
    document.documentElement.hasAttribute(REDUCE_MOTION_ATTRIBUTE)
  )
    return true;
  return reducedQuery()?.matches === true;
}

/**
 * Calls `listener` when either source changes: the system setting, or the root's attribute (the
 * editor's toggle, or another tab's through the storage event). Returns the unsubscribe.
 */
export function onMotionReducedChange(listener: () => void): () => void {
  const stops: Array<() => void> = [];
  const media = reducedQuery();
  if (media !== null && typeof media.addEventListener === 'function') {
    media.addEventListener('change', listener);
    stops.push(() => media.removeEventListener('change', listener));
  }
  if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(listener);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [REDUCE_MOTION_ATTRIBUTE],
    });
    stops.push(() => observer.disconnect());
  }
  return () => {
    for (const stop of stops) stop();
  };
}
