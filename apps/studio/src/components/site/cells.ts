import { BAYER8 } from '@turboslide/effects/bayer';

/**
 * What the landing's dithered grounds share (SiteField.tsx, the /decks field): the deck's 8 by 8
 * screen as thresholds, a colour read as bytes, the ink a figure prints in and the appearance's
 * change. Nothing here reaches the editor: the screen is the deck's own table (packages/effects).
 */

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * The deck's 8 by 8 Bayer screen as thresholds in 0 to 1, row major: a cell whose tone is over
 * (m + 0.5) / 64 is lit (packages/effects/src/bayer.ts).
 */
export const SCREEN: Float32Array = (() => {
  const out = new Float32Array(64);
  BAYER8.forEach((row, r) => row.forEach((m, c) => (out[r * 8 + c] = (m + 0.5) / 64)));
  return out;
})();

export type Rgb = readonly [number, number, number];

/** A CSS colour as bytes, read through a 1 by 1 canvas, so any colour syntax reads. */
export function rgbOf(color: string): Rgb {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const g = probe.getContext('2d', { willReadFrequently: true });
  if (g === null) return [0, 0, 0];
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  const [r = 0, gr = 0, b = 0] = g.getImageData(0, 0, 1, 1).data;
  return [r, gr, b];
}

/** The ink a figure prints in: the `--pt-ink` its own box resolves. */
export function inkOf(element: Element): Rgb {
  return rgbOf(getComputedStyle(element).getPropertyValue('--pt-ink').trim() || 'currentColor');
}

/**
 * Calls back when the appearance changes: the root's `data-theme` (the footer's switch, the
 * boot script) or the system's scheme. Returns the cleanup.
 */
export function onAppearance(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', callback);
  return () => {
    observer.disconnect();
    scheme.removeEventListener('change', callback);
  };
}
