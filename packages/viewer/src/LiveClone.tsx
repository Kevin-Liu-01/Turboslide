import { useLayoutEffect, useRef } from 'react';

import { Frame } from './Frame';
import { SHEET_W, sheetSizeVars } from './model';
import type { PageSize } from './model';
import { applyThemeToTree } from './theme';
import type { Theme } from './theme';

import './LiveClone.css';

export type LiveCloneProps = {
  /** renderSlide output (SPEC 5.2) */
  html: string;
  theme: Theme;
  /** the edge grid without the wordmark and counter; on by default, as the deck's cloneSlide does */
  frame?: boolean;
  /** the deck's page in sheet pixels (gslides-parity SPEC-5 6.1): `--k` is the frame width over its width; 1600 by 900 when absent */
  page?: PageSize;
  /**
   * The Themes panel's GT and Plate tiles show a base theme without the deck's edits (gslides-parity
   * SPEC-5 9.2; b6.md request 5): `base` stamps `data-theme-base` on the clone root, which the
   * deck's override stylesheet excludes.
   */
  base?: boolean;
};

/**
 * The `sizes` of the clone's pictures (SPEC-5 11 "The 320 px twin variant"): a renderer picture
 * whose record carries the twin variant has a `srcset` naming the 320 file and the stored twin;
 * the browser picks by `sizes`, which is this clone's own width (an upper bound for any picture in
 * it), so a filmstrip card 200 px wide fetches the 320 file and the sheet fetches the 1600 one.
 */
export function applyCloneSizes(root: ParentNode, width: number): number {
  const value = `${Math.max(1, Math.round(width))}px`;
  let changed = 0;
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img[srcset]'))) {
    if (img.sizes === value) continue;
    img.sizes = value;
    changed += 1;
  }
  return changed;
}

/**
 * A live, scaled copy of a slide for the grid tiles, the book pages, the
 * sidebar's thumbnail density and the hover preview (tail.html cloneSlide,
 * scaleThumbs and scaleBook). The scale is measured from the clone's own
 * box with a ResizeObserver and written as --k, so one sheet rule scales
 * every clone whatever frame holds it. Static thumbnails from the render
 * worker replace live clones in M3 (SPEC 5.5), with the clone as the
 * fallback while a render is pending.
 */
/**
 * The clone's pictures load lazily: the sidebar mounts one clone per slide in thumbnail density,
 * and eager pictures made the 85 clones request about 120 asset twins at once, which held every
 * browser connection to the dev server so an editor write waited 15 s behind them (measured
 * 2026-09-11; on the host the same requests compete with the renders for function instances).
 * Only the clones near the viewport fetch their pictures now; a picture already marked keeps its
 * own attribute.
 */
export function lazyPictures(html: string): string {
  return html.replace(/<img\b(?![^>]*\bloading=)/g, '<img loading="lazy" decoding="async"');
}

export function LiveClone({ html, theme, frame = true, page, base }: LiveCloneProps) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const pageWidth = page?.width ?? SHEET_W;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (w) {
        el.style.setProperty('--k', String(w / pageWidth));
        applyCloneSizes(el, w);
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageWidth]);

  useLayoutEffect(() => {
    const el = body.current;
    if (el) applyThemeToTree(el, theme);
    // a new slide body: its pictures take the clone's width before the first fetch
    const outer = root.current;
    if (outer && outer.clientWidth) applyCloneSizes(outer, outer.clientWidth);
  }, [html, theme]);

  return (
    <div
      ref={root}
      className="ts-sheet sheet is-clone"
      data-theme={theme}
      data-theme-base={base ? '' : undefined}
      aria-hidden="true"
      style={page ? sheetSizeVars(page) : undefined}
    >
      <div className="ts-stage stage">
        {frame ? <Frame wordmark={false} counter={false} /> : null}
        <div
          ref={body}
          className="pt-slide"
          dangerouslySetInnerHTML={{ __html: lazyPictures(html) }}
        />
      </div>
    </div>
  );
}
