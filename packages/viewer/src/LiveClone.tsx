import { useLayoutEffect, useRef } from 'react';

import { Frame } from './Frame';
import { SHEET_W } from './model';
import { applyThemeToTree } from './theme';
import type { Theme } from './theme';

import './LiveClone.css';

export type LiveCloneProps = {
  /** renderSlide output (SPEC 5.2) */
  html: string;
  theme: Theme;
  /** the edge grid without the wordmark and counter; on by default, as the deck's cloneSlide does */
  frame?: boolean;
};

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

export function LiveClone({ html, theme, frame = true }: LiveCloneProps) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (w) el.style.setProperty('--k', String(w / SHEET_W));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = body.current;
    if (el) applyThemeToTree(el, theme);
  }, [html, theme]);

  return (
    <div ref={root} className="ts-sheet sheet is-clone" data-theme={theme} aria-hidden="true">
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
