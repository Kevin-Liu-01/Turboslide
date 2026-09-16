import { useEffect, useLayoutEffect, useRef } from 'react';

import type { PageSize } from '../model';
import { SHEET_W } from '../model';
import { appendPoint, drawStrokes, newStrokeId, toSheetPoint } from './pen';
import type { BlankSlide } from './presentModel';
import type { PresentStroke } from './presentSync';
import { PRESENT_TEXT } from './strings';

import './SlideshowLayer.css';

/*
 * The motion layer (motionLayer.ts) is the third layer a show draws (gslides-parity SPEC-5 2.2):
 * the step classes on the rendered nodes and the transition between two mounted slides. It is
 * re-exported here until `packages/viewer/package.json` names `./present/motionLayer` (b1.md
 * request to the integrator), the way `@turboslide/render/motion` carried `motionCss` before the
 * `./motion-css` export landed at merge 1.
 */
export * from './motionLayer';
export * from './pen';
/*
 * B2's media controller (media-controller.ts, gslides-parity SPEC-5 0.17) reaches the studio the
 * same way until `./present/media-controller` is exported; the show creates one per mount.
 */
export { createMediaController } from './media-controller';
export type { MediaController } from './media-controller';

/**
 * The two layers a show draws over the sheet (gslides-parity SPEC 9.2): the blank black or white
 * slide (B or . and W or ,; any key or a click returns) and the laser pointer, a 12 px ink dot with
 * a paper ring that follows the pointer (the chrome has no red). Both are fixed to the viewport so
 * they cover whatever is around the sheet; the dot never takes the pointer.
 */
export function BlankLayer({ blank, onDismiss }: { blank: BlankSlide; onDismiss: () => void }) {
  return (
    <div
      className="ts-present-blank"
      data-blank={blank}
      data-control="present.blank"
      role="img"
      aria-label={PRESENT_TEXT.blankSlide(blank)}
      onClick={onDismiss}
    />
  );
}

export function LaserPointer({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="ts-present-laser"
      data-control="present.laserDot"
      aria-hidden="true"
      style={{ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)` }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// The pen (gslides-parity SPEC-5 0.15, 2.2): one canvas over the whole window that draws the
// strokes of the current slide in `--pt-ink` at 3 sheet px, scaled to the sheet box it finds
// under `sheetSelector`; with `active` it takes the pointer and appends points to a stroke, else
// it lets the pointer through and only mirrors the strokes another window sent.

export type PenLayerProps = {
  slideId: string;
  strokes: readonly PresentStroke[];
  /** the pen is on: the canvas takes the pointer and draws */
  active: boolean;
  /** the sheet the strokes are drawn over, found in the document */
  sheetSelector: string;
  page?: PageSize;
  /** a stroke grew or finished; the caller keeps the list and posts it to the other windows */
  onStroke?: (stroke: PresentStroke) => void;
};

function inkOf(): string {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--pt-ink').trim();
    return value === '' ? '#101010' : value;
  } catch {
    return '#101010';
  }
}

export function PenLayer({
  slideId,
  strokes,
  active,
  sheetSelector,
  page,
  onStroke,
}: PenLayerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<PresentStroke | null>(null);
  const pageWidth = page?.width ?? SHEET_W;

  const sheetBox = (): DOMRect | null =>
    document.querySelector<HTMLElement>(sheetSelector)?.getBoundingClientRect() ?? null;

  const paint = (extra?: PresentStroke | null) => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * dpr);
    const height = Math.round(window.innerHeight * dpr);
    if (el.width !== width || el.height !== height) {
      el.width = width;
      el.height = height;
    }
    const ctx = el.getContext('2d');
    const box = sheetBox();
    if (!ctx || !box) return;
    const scale = (box.width / pageWidth) * dpr;
    const all = extra ? [...strokes.filter((s) => s.id !== extra.id), extra] : [...strokes];
    drawStrokes(
      ctx,
      { width, height },
      all.filter((s) => s.slideId === slideId),
      { left: box.left * dpr, top: box.top * dpr, scale },
      inkOf(),
    );
  };

  useLayoutEffect(() => {
    paint(drawing.current);
  });

  useEffect(() => {
    const onResize = () => paint(drawing.current);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // paint reads the latest props through the closure of the current render
  });

  const pointOf = (event: { clientX: number; clientY: number }): [number, number] | null => {
    const box = sheetBox();
    return box ? toSheetPoint(event.clientX, event.clientY, box, pageWidth) : null;
  };

  return (
    <canvas
      ref={canvas}
      className={active ? 'ts-present-pen is-active' : 'ts-present-pen'}
      data-control="present.penLayer"
      data-strokes={strokes.filter((s) => s.slideId === slideId).length}
      aria-hidden="true"
      style={{ width: '100vw', height: '100vh' }}
      onPointerDown={
        active
          ? (event) => {
              const point = pointOf(event);
              if (!point) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              drawing.current = appendPoint(
                { id: newStrokeId(), slideId, done: false, points: [] },
                point,
              );
              paint(drawing.current);
            }
          : undefined
      }
      onPointerMove={
        active
          ? (event) => {
              if (!drawing.current) return;
              const point = pointOf(event);
              if (!point) return;
              drawing.current = appendPoint(drawing.current, point);
              paint(drawing.current);
            }
          : undefined
      }
      onPointerUp={
        active
          ? (event) => {
              const stroke = drawing.current;
              drawing.current = null;
              if (!stroke) return;
              const point = pointOf(event);
              const finished = { ...(point ? appendPoint(stroke, point) : stroke), done: true };
              onStroke?.(finished);
            }
          : undefined
      }
      onPointerCancel={
        active
          ? () => {
              const stroke = drawing.current;
              drawing.current = null;
              if (stroke) onStroke?.({ ...stroke, done: true });
            }
          : undefined
      }
    />
  );
}
