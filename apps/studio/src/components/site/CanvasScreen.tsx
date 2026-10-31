import { useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';

import { tipProps } from '@turboslide/chrome/Tooltip';

import { LIGHTHOUSE, RING_OFFSET, clampPose, grow, poseJson, turnTo } from './canvas-pose';
import type { Pose, SlideBox } from './canvas-pose';
import { SCREEN, fitCells, inkOf, onAppearance, printCells } from './cells';
import { CANVAS_SCREEN } from './copy';
import { ScreenHead } from './ScreenHead';
import { useMountEffect } from '../useMountEffect';

import toneUrl from './pictures/lighthouse-tone.webp?url';

/** The tone grid's columns: one value per cell of the deck's own print (2 slide px cells). */
const TONE_COLS = 800;
/** Tone bytes at or under this read as no ink, above the codec's ringing. */
const TONE_FLOOR = 10;

/** A box of the slide as the custom properties site.css places it by (`.site-obj`). */
function place(box: SlideBox): CSSProperties {
  return {
    '--x': box.x,
    '--y': box.y,
    '--w': box.w,
    '--h': box.h,
    '--r': `${box.rotate ?? 0}deg`,
  } as CSSProperties;
}

const GHOST = grow(LIGHTHOUSE.rest, RING_OFFSET);
const START: Pose = {
  x: LIGHTHOUSE.moved.x,
  y: LIGHTHOUSE.moved.y,
  rotate: LIGHTHOUSE.moved.rotate,
};

/**
 * Prints the slide's picture through the deck's 8 by 8 screen at the size the slide is shown: a
 * cell is the smallest whole CSS px that keeps the cells at or under the tone's 800 columns (2 px
 * on a 1440 window, 1 px on a phone), the tone area-averaged to that grid by the browser's
 * downscale. The same cells print in the appearance's ink. Nothing animates.
 */
function useLighthouse(
  sheet: RefObject<HTMLDivElement | null>,
  pic: RefObject<HTMLCanvasElement | null>,
) {
  useMountEffect(() => {
    const box = sheet.current;
    const canvas = pic.current;
    if (box === null || canvas === null) return;
    const tone = new Image();
    tone.decoding = 'async';
    let last = '';
    const draw = (): void => {
      if (!tone.complete || tone.naturalWidth === 0) return;
      const rect = box.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const cell = Math.max(1, Math.ceil(rect.width / TONE_COLS));
      const ink = inkOf(box);
      const key = `${rect.width}x${rect.height}+${rect.left}:${cell}:${window.devicePixelRatio}:${ink.join()}`;
      if (key === last) return;
      last = key;
      const { cols, rows } = fitCells(canvas, rect, cell);
      const grid = document.createElement('canvas');
      grid.width = cols;
      grid.height = rows;
      const g = grid.getContext('2d', { willReadFrequently: true });
      if (g === null) return;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(tone, 0, 0, cols, rows);
      const data = g.getImageData(0, 0, cols, rows).data;
      printCells(canvas, cols, rows, ink, (col, row) => {
        const byte = data[(row * cols + col) * 4] ?? 0;
        return byte > TONE_FLOOR && byte / 255 > (SCREEN[(row & 7) * 8 + (col & 7)] ?? 1);
      });
    };
    tone.addEventListener('load', draw);
    tone.src = toneUrl;
    const resize = new ResizeObserver(draw);
    resize.observe(box);
    const stop = onAppearance(draw);
    return () => {
      tone.removeEventListener('load', draw);
      resize.disconnect();
      stop();
    };
  });
}

/**
 * The heading's two gestures, as the editor's stage reads them: a drag on the heading moves its
 * box (whole slide px, its centre kept on the slide), a drag on the handle turns it about its
 * centre (whole degrees, Shift for 15 degree steps), and with the focus the arrow keys do the same
 * (1 px or 1 degree, Shift for 10 px or 15 degrees). Each change writes the box's custom
 * properties and the `/pos` the editor would commit under the slide, straight to the DOM, so a
 * drag renders nothing through React. Nothing moves on its own.
 */
function useMove(root: RefObject<HTMLElement | null>) {
  useMountEffect(() => {
    const figure = root.current;
    const sheet = figure?.querySelector<HTMLElement>('.site-sheet');
    const sel = figure?.querySelector<HTMLElement>('.site-cv-sel');
    const heading = figure?.querySelector<HTMLElement>('.site-cv-h');
    const knob = figure?.querySelector<HTMLElement>('.site-cv-knob');
    const json = figure?.querySelector<HTMLElement>('.site-cv-json');
    if (!figure || !sheet || !sel || !heading || !knob || !json) return;
    let pose: Pose = START;

    const set = (next: Pose): void => {
      pose = clampPose(next);
      sel.style.setProperty('--x', String(pose.x));
      sel.style.setProperty('--y', String(pose.y));
      sel.style.setProperty('--r', `${pose.rotate}deg`);
      knob.setAttribute('aria-valuenow', String(pose.rotate));
      knob.setAttribute('aria-valuetext', CANVAS_SCREEN.degrees(pose.rotate));
      json.textContent = poseJson(pose);
    };

    type Drag =
      | { mode: 'move'; id: number; x0: number; y0: number; from: Pose; k: number }
      | { mode: 'turn'; id: number; cx: number; cy: number };
    let drag: Drag | null = null;

    const start = (event: PointerEvent, mode: 'move' | 'turn'): void => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget as HTMLElement;
      target.focus({ preventScroll: true });
      target.setPointerCapture(event.pointerId);
      figure.setAttribute('data-dragging', mode);
      if (mode === 'move') {
        const k = 1600 / sheet.clientWidth;
        drag = { mode, id: event.pointerId, x0: event.clientX, y0: event.clientY, from: pose, k };
      } else {
        const r = sel.getBoundingClientRect();
        drag = { mode, id: event.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      }
    };
    const onMoveDown = (event: PointerEvent): void => start(event, 'move');
    const onTurnDown = (event: PointerEvent): void => start(event, 'turn');
    const onPointerMove = (event: PointerEvent): void => {
      if (drag === null || event.pointerId !== drag.id) return;
      if (drag.mode === 'move') {
        set({
          ...pose,
          x: Math.round(drag.from.x + (event.clientX - drag.x0) * drag.k),
          y: Math.round(drag.from.y + (event.clientY - drag.y0) * drag.k),
        });
      } else {
        const deg = (Math.atan2(event.clientY - drag.cy, event.clientX - drag.cx) * 180) / Math.PI;
        set({ ...pose, rotate: turnTo(deg + 90, event.shiftKey ? 15 : 1) });
      }
    };
    const onPointerUp = (event: PointerEvent): void => {
      if (drag === null || event.pointerId !== drag.id) return;
      drag = null;
      figure.removeAttribute('data-dragging');
    };

    const ARROWS: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const onMoveKey = (event: KeyboardEvent): void => {
      const arrow = ARROWS[event.key];
      if (arrow === undefined) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      set({ ...pose, x: pose.x + arrow[0] * step, y: pose.y + arrow[1] * step });
    };
    const onTurnKey = (event: KeyboardEvent): void => {
      const arrow = ARROWS[event.key];
      const by = arrow === undefined ? undefined : arrow[0] + arrow[1];
      if (by === undefined && event.key !== 'Home') return;
      event.preventDefault();
      const step = event.shiftKey ? 15 : 1;
      set({ ...pose, rotate: by === undefined ? 0 : turnTo(pose.rotate + by * step, step) });
    };

    heading.addEventListener('pointerdown', onMoveDown);
    knob.addEventListener('pointerdown', onTurnDown);
    heading.addEventListener('keydown', onMoveKey);
    knob.addEventListener('keydown', onTurnKey);
    for (const el of [heading, knob]) {
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);
      el.addEventListener('pointercancel', onPointerUp);
    }
    return () => {
      heading.removeEventListener('pointerdown', onMoveDown);
      knob.removeEventListener('pointerdown', onTurnDown);
      heading.removeEventListener('keydown', onMoveKey);
      knob.removeEventListener('keydown', onTurnKey);
      for (const el of [heading, knob]) {
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerUp);
        el.removeEventListener('pointercancel', onPointerUp);
      }
    };
  });
}

/**
 * The Canvas screen: the lighthouse slide across the window, every box the one the CLI wrote
 * (canvas-pose.ts), its heading moved off the plate and turned, with a dashed box where it was and
 * the editor's selection ring and rotation handle on it. The heading moves under a drag and turns
 * by its handle, and the line under the slide is the `/pos` the editor commits for the heading as
 * it stands, so the gesture and the data it writes are one thing. The picture is printed live at
 * the size shown (cells.ts); the ring and the handle are drawn to the editor's Overlay.css.
 */
export function CanvasScreen() {
  const root = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const pic = useRef<HTMLCanvasElement>(null);
  useLighthouse(sheet, pic);
  useMove(root);
  const { slide, write } = CANVAS_SCREEN;
  return (
    <section className="site-claim site-cv" id="canvas" aria-labelledby="site-canvas-title">
      <ScreenHead titleId="site-canvas-title" heading={CANVAS_SCREEN.heading} />
      <figure ref={root} className="site-cv-fig" aria-label={CANVAS_SCREEN.figure.alt}>
        <div ref={sheet} className="site-sheet">
          <canvas ref={pic} className="site-cells" aria-hidden="true" />
          <i className="site-obj site-lh-plate" style={place(LIGHTHOUSE.plate)} />
          <span
            className="site-obj site-lh-p"
            style={place(LIGHTHOUSE.paragraph)}
            aria-hidden="true"
          >
            {slide.paragraph}
          </span>
          <span
            className="site-obj site-lh-cap"
            style={place(LIGHTHOUSE.credit)}
            aria-hidden="true"
          >
            {slide.credit}
          </span>
          <i className="site-obj site-cv-ghost" style={place(GHOST)} />
          <div className="site-obj site-cv-sel" style={place(LIGHTHOUSE.moved)}>
            <button
              type="button"
              className="site-cv-h"
              aria-describedby="site-cv-write"
              {...tipProps(CANVAS_SCREEN.move)}
            >
              {slide.heading}
            </button>
            <span
              className="site-cv-knob"
              role="slider"
              tabIndex={0}
              aria-label={CANVAS_SCREEN.turn.name}
              aria-valuemin={0}
              aria-valuemax={359}
              aria-valuenow={START.rotate}
              aria-valuetext={CANVAS_SCREEN.degrees(START.rotate)}
              {...tipProps(CANVAS_SCREEN.turn)}
            />
          </div>
        </div>
        <figcaption className="site-cv-write site-wrap" id="site-cv-write">
          <code>
            <span className="site-cv-op">
              {write.action} {write.block} {write.path}
            </span>{' '}
            <span className="site-cv-json">{poseJson(START)}</span>
          </code>
        </figcaption>
      </figure>
    </section>
  );
}
