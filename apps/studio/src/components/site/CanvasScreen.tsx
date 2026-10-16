import { useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';

import { LIGHTHOUSE, RING_OFFSET, grow } from './canvas-pose';
import type { SlideBox } from './canvas-pose';
import { SCREEN, fitCells, inkOf, onAppearance, printCells } from './cells';
import { CANVAS_SCREEN } from './copy';
import { Frame } from './Frame';
import { InlineCode } from './InlineCode';
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

/** The upright bounds of a box turned about its centre, for the chip that stays upright. */
function bounds(box: SlideBox): { left: number; top: number; bottom: number } {
  const turn = ((box.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(turn));
  const sin = Math.abs(Math.sin(turn));
  const halfH = (box.w / 2) * sin + (box.h / 2) * cos;
  const halfW = (box.w / 2) * cos + (box.h / 2) * sin;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { left: cx - halfW, top: cy - halfH, bottom: cy + halfH };
}

const RING = grow(LIGHTHOUSE.moved, RING_OFFSET);
const GHOST = grow(LIGHTHOUSE.rest, RING_OFFSET);
const RING_BOUNDS = bounds(RING);

/** The table's rows: the Format options field, the box at rest and moved, whole px. */
const ROWS = (['w', 'h', 'rotate', 'x', 'y'] as const).map((key) => {
  const unit = key === 'rotate' ? '°' : '';
  const rest = Math.round(LIGHTHOUSE.rest[key]);
  const moved = Math.round(LIGHTHOUSE.moved[key]);
  return { key, rest: `${rest}${unit}`, moved: `${moved}${unit}`, changed: rest !== moved };
});

/**
 * Prints the slide's picture through the deck's 8 by 8 screen at the size the slide is shown: a
 * cell is the smallest whole CSS px that keeps the cells at or under the tone's 800 columns (2 px
 * on the 1440 slide, 1 px on a phone), the tone area-averaged to that grid by the browser's
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
 * Screen 02, Canvas (docs/SITE.md 9): the lighthouse slide after one drag and one turn of its
 * heading, every box the one the CLI wrote (canvas-pose.ts), with the editor's selection on the
 * heading where it is now and a dashed box where it was; beside it the heading's box at rest and
 * moved in the Format options words. The picture is printed live at the size shown (cells.ts);
 * the selection is drawn to the editor's Overlay.css and text-ring.ts.
 */
export function CanvasScreen() {
  const sheet = useRef<HTMLDivElement>(null);
  const pic = useRef<HTMLCanvasElement>(null);
  useLighthouse(sheet, pic);
  const { figure, slide, table } = CANVAS_SCREEN;
  return (
    <section className="site-screen site-wrap" id="canvas" aria-labelledby="site-canvas-title">
      <ScreenHead
        titleId="site-canvas-title"
        icon="cursor-arrow-rays"
        number={CANVAS_SCREEN.number}
        label={CANVAS_SCREEN.label}
        sentence={CANVAS_SCREEN.sentence}
      />
      <div className="site-canvas">
        <figure className="site-fig site-canvas-fig">
          <figcaption className="site-fig-head">
            <span className="t-label">{figure.label}</span>
            <span className="site-fig-note t-small">{figure.note}</span>
          </figcaption>
          <Frame>
            <div ref={sheet} className="site-sheet site-lh" role="img" aria-label={figure.alt}>
              <canvas ref={pic} className="site-cells" aria-hidden="true" />
              <SheetFrame />
              <i className="site-obj site-lh-plate" style={place(LIGHTHOUSE.plate)} />
              <span className="site-obj site-lh-p" style={place(LIGHTHOUSE.paragraph)}>
                {slide.paragraph}
              </span>
              <span className="site-obj site-lh-cap" style={place(LIGHTHOUSE.credit)}>
                {slide.credit}
              </span>
              <i className="site-obj site-lh-ghost" style={place(GHOST)} />
              <span className="site-obj site-lh-h" style={place(LIGHTHOUSE.moved)}>
                {slide.heading}
              </span>
              <i className="site-obj site-lh-ring" style={place(RING)}>
                {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((at) => (
                  <i key={at} className={`site-lh-sq is-${at}`} />
                ))}
                <i className="site-lh-knob" />
              </i>
              <span
                className="site-lh-chip"
                style={
                  {
                    '--cx': RING_BOUNDS.left,
                    '--cy': RING_BOUNDS.top,
                    '--cb': RING_BOUNDS.bottom,
                  } as CSSProperties
                }
              >
                {slide.chip}
              </span>
            </div>
          </Frame>
        </figure>
        <div className="site-canvas-side">
          <table className="site-spec site-canvas-spec" aria-label={table.name}>
            <caption className="t-label">{table.caption}</caption>
            <thead>
              <tr>
                <th className="t-label" scope="col">
                  {table.heads.field}
                </th>
                <th className="t-label" scope="col">
                  <i className="site-canvas-key is-rest" aria-hidden="true" />
                  {table.heads.rest}
                </th>
                <th className="t-label" scope="col">
                  <i className="site-canvas-key is-moved" aria-hidden="true" />
                  {table.heads.moved}
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{table.rows[row.key]}</th>
                  <td>{row.rest}</td>
                  <td className={row.changed ? 'is-changed' : undefined}>{row.moved}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="site-note t-small">
            <InlineCode text={CANVAS_SCREEN.note} />
          </p>
          <p className="site-canvas-credit t-small">{slide.credit}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * The frame the example theme draws on every slide: two rails and two rules 56 slide px in, with
 * an 11 px cross where they meet (packages/theme/src/gt-ink-paper/sheet.css).
 */
export function SheetFrame() {
  return (
    <>
      <i className="site-sheet-rule is-l" />
      <i className="site-sheet-rule is-r" />
      <i className="site-sheet-rule is-t" />
      <i className="site-sheet-rule is-b" />
      <i className="site-sheet-x is-tl" />
      <i className="site-sheet-x is-tr" />
      <i className="site-sheet-x is-bl" />
      <i className="site-sheet-x is-br" />
    </>
  );
}
