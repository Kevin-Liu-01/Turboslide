import { Fragment, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';

import { ROWS16_PATH } from '@turboslide/theme/brand';

import { SCREEN, fitCells, inkOf, onAppearance, printCells } from './cells';
import { EXPORT_SCREEN } from './copy';
import { EDITABLE_PARTS, PICTURES_PARTS, countParts } from './export-parts';
import type { ExportPart } from './export-parts';
import { Frame } from './Frame';
import { SiteIcon } from './SiteIcon';
import { useMountEffect } from '../useMountEffect';

const EDITABLE = countParts(EDITABLE_PARTS);
const PICTURES = countParts(PICTURES_PARTS);

/**
 * The slide's words at the sizes, tracking and optical sizes the example theme sets them
 * (packages/theme LADDER): the heading, the paragraph, the credit and the counter.
 */
const TEXT_STYLE: Record<string, { fs: number; lh: number; ls: number; fw: number; op: number }> = {
  'h/text': { fs: 44, lh: 47.52, ls: -1.1, fw: 500, op: 32 },
  'p1/text': { fs: 22, lh: 33, ls: 0, fw: 400, op: 22 },
  'credit/text': { fs: 15, lh: 21.75, ls: 0.15, fw: 400, op: 15 },
  counter: { fs: 13, lh: 15.73, ls: 0.26, fw: 400, op: 14 },
};
const MUTED = new Set(['credit/text', 'counter']);

/** The opener field: a sphere lit from the upper left, whole on the slide, with a thin halo. */
const SPHERE = { cx: 730, cy: 446, r: 372, halo: 90, floor: 0.1 } as const;
const LIGHT = (() => {
  const l = [-0.52, -0.6, 0.6];
  const n = Math.hypot(l[0] ?? 0, l[1] ?? 0, l[2] ?? 0);
  return l.map((v) => v / n) as [number, number, number];
})();

/**
 * The share of a cell printed in the ink at slide point (x, y): light prints the shadow and dark
 * prints the light, so both appearances show the same lit sphere, never a negative.
 */
function coverage(x: number, y: number, dark: boolean): number {
  const dx = (x - SPHERE.cx) / SPHERE.r;
  const dy = (y - SPHERE.cy) / SPHERE.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= 1) {
    const k = Math.max(0, 1 - ((Math.sqrt(d2) - 1) * SPHERE.r) / SPHERE.halo);
    return SPHERE.floor * k * k;
  }
  const diffuse = Math.max(0, dx * LIGHT[0] + dy * LIGHT[1] + Math.sqrt(1 - d2) * LIGHT[2]);
  const t = 0.04 + 0.96 * diffuse;
  return Math.min(0.96, Math.max(SPHERE.floor, dark ? t : 1 - t));
}

function isDark(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark' || theme === 'light') return theme === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** A part's box as the custom properties site.css places it by (`.site-xs-box`). */
function at(part: ExportPart): CSSProperties {
  const [x, y, w, h] = part.box;
  return { '--x': x, '--y': y, '--w': w, '--h': h } as CSSProperties;
}

/** A chip's corner and the share of its own size it is moved by. */
function chip(x: number, y: number, tx = '0', ty = '0'): CSSProperties {
  return { '--x': x, '--y': y, '--tx': tx, '--ty': ty } as CSSProperties;
}

/** The footer's small parts, whose rings and chips leave on a phone. */
const isSmall = (part: ExportPart): boolean => part.box[2] * part.box[3] < 3000;

/** The lines of a part list as one path, for the slide's frame and crosses. */
function linePath(parts: readonly ExportPart[]): string {
  return parts
    .map(({ box: [x, y, w, h] }) => (w === 0 ? `M${x} ${y}V${y + h}` : `M${x} ${y}H${x + w}`))
    .join('');
}

const LINES = EDITABLE_PARTS.filter((part) => part.kind === 'line');
const FRAME_PATH = linePath(LINES.filter((part) => part.id.startsWith('frame')));
const CROSS_PATH = linePath(LINES.filter((part) => part.id.startsWith('cross')));
const ALL_LINES = linePath(LINES);
const byId = (id: string): ExportPart | undefined => EDITABLE_PARTS.find((p) => p.id === id);

/**
 * Prints the field at the size shown (2 CSS px cells, 1 on a phone) and runs the seam: a drag on
 * the figure follows the pointer (on touch only the seam drags, so a swipe still scrolls), the
 * arrows move it 2 percent, Shift 10, Home and End go to the ends. Nothing moves on its own.
 */
function useSeam(frameRef: RefObject<HTMLDivElement | null>) {
  useMountEffect(() => {
    const root = frameRef.current;
    const sheet = root?.querySelector<HTMLElement>('.site-xs-sheet');
    const canvas = root?.querySelector<HTMLCanvasElement>('.site-xs-field');
    const seam = root?.querySelector<HTMLElement>('.site-xs-seam');
    if (!root || !sheet || !canvas || !seam) return;
    let cut = 0.5;

    const draw = (): void => {
      const rect = sheet.getBoundingClientRect();
      if (rect.width === 0) return;
      const cell = rect.width >= 640 ? 2 : 1;
      const { cols, rows } = fitCells(canvas, rect, cell);
      const unit = (1600 / rect.width) * cell;
      const dark = isDark();
      printCells(
        canvas,
        cols,
        rows,
        inkOf(sheet),
        (col, row) =>
          coverage((col + 0.5) * unit, (row + 0.5) * unit, dark) >
          (SCREEN[((row & 7) << 3) | (col & 7)] ?? 1),
      );
    };

    const place = (): void => {
      const px = Math.round(cut * sheet.clientWidth);
      root.style.setProperty('--xs-cut', `${px}px`);
      const p = Math.round(cut * 100);
      seam.setAttribute('aria-valuenow', String(p));
      seam.setAttribute('aria-valuetext', EXPORT_SCREEN.seam.slider.value(p));
    };
    const setCut = (value: number): void => {
      cut = Math.min(1, Math.max(0, value));
      place();
    };

    const xOf = (event: PointerEvent): number => {
      const rect = sheet.getBoundingClientRect();
      return (event.clientX - rect.left) / rect.width;
    };
    let dragging = false;
    const down = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      if (event.pointerType === 'touch' && !seam.contains(event.target as Node)) return;
      event.preventDefault();
      dragging = true;
      seam.focus({ preventScroll: true });
      root.setPointerCapture(event.pointerId);
      setCut(xOf(event));
    };
    const move = (event: PointerEvent): void => {
      if (dragging) setCut(xOf(event));
    };
    const up = (): void => {
      dragging = false;
    };
    const key = (event: KeyboardEvent): void => {
      const step = event.shiftKey ? 0.1 : 0.02;
      const to: Record<string, number> = {
        ArrowLeft: cut - step,
        ArrowDown: cut - step,
        ArrowRight: cut + step,
        ArrowUp: cut + step,
        PageDown: cut - 0.1,
        PageUp: cut + 0.1,
        Home: 0,
        End: 1,
      };
      const next = to[event.key];
      if (next === undefined) return;
      event.preventDefault();
      setCut(next);
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    seam.addEventListener('keydown', key);
    const resize = new ResizeObserver(() => {
      draw();
      place();
    });
    resize.observe(sheet);
    const stop = onAppearance(draw);
    return () => {
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      seam.removeEventListener('keydown', key);
      resize.disconnect();
      stop();
    };
  });
}

/**
 * Screen 06's second row (docs/SITE.md 9): the opener field slide cut by a seam between the
 * two PowerPoint files the CLI wrote for it (export-parts.ts). The slide is drawn once from the
 * Editable text file's parts; over it two layers in the editor's selection style (Overlay.css:
 * the 1 px --pt-select ring and the square chip) are clipped at the cut: left, the Pictures file
 * (one picture, the logo laid over it again, the text there but invisible, dashed); right, the
 * Editable text file (each text box, rectangle and line). The counts beside it are the files'.
 */
export function ExportSeam() {
  const frame = useRef<HTMLDivElement>(null);
  useSeam(frame);
  const { seam } = EXPORT_SCREEN;
  const plate = byId('plate/0');
  const heading = byId('h/text');
  const logo = byId('footer-logo:1');
  return (
    <div className="site-row site-xs-row">
      <div className="site-row-text">
        <dl className="site-xs-holds t-small">
          <div>
            <dt>
              <SiteIcon name="photo" />
              {seam.pictures}
            </dt>
            <dd>{seam.holds.pictures(PICTURES)}</dd>
          </div>
          <div>
            <dt>
              <SiteIcon name="document-text" />
              {seam.editable}
            </dt>
            <dd>{seam.holds.editable(EDITABLE)}</dd>
          </div>
        </dl>
      </div>
      <figure className="site-xs-fig">
        <Frame>
          <div ref={frame} className="site-xs">
            <div className="site-xs-bar" aria-hidden="true">
              <span className="site-xs-mode">
                <SiteIcon name="photo" />
                {seam.pictures}
              </span>
              <span className="site-xs-mode">
                {seam.editable}
                <SiteIcon name="document-text" />
              </span>
            </div>
            <div className="site-xs-sheet">
              <div className="site-xs-layer" role="img" aria-label={seam.alt(EDITABLE)}>
                <canvas className="site-cells site-xs-field" aria-hidden="true" />
                <svg
                  className="site-xs-svg"
                  viewBox="0 0 1600 900"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path className="is-hair" d={FRAME_PATH} />
                  <path className="is-cross" d={CROSS_PATH} />
                </svg>
                {EDITABLE_PARTS.filter((part) => part.kind === 'rect').map((part) => (
                  <i key={part.id} className="site-xs-box site-xs-rect" style={at(part)} />
                ))}
                {logo === undefined ? null : (
                  <svg
                    className="site-xs-box site-xs-mark"
                    style={at(logo)}
                    viewBox="0 0 16 16"
                    shapeRendering="crispEdges"
                    aria-hidden="true"
                  >
                    <rect className="is-plate" width="16" height="16" />
                    <rect className="is-frame" x="0.5" y="0.5" width="15" height="15" />
                    <path className="is-ink" d={ROWS16_PATH} />
                  </svg>
                )}
                {EDITABLE_PARTS.filter((part) => part.kind === 'text').map((part) => {
                  const style = TEXT_STYLE[part.id];
                  return (
                    <span
                      key={part.id}
                      className={`site-xs-box site-xs-text${MUTED.has(part.id) ? ' is-muted' : ''}`}
                      style={
                        {
                          ...at(part),
                          '--fs': style?.fs,
                          '--lh': style?.lh,
                          '--ls': style?.ls,
                          '--fw': style?.fw,
                          '--op': style?.op,
                        } as CSSProperties
                      }
                      aria-hidden="true"
                    >
                      {(part.text ?? []).map((line, i) => (
                        <Fragment key={line}>
                          {i > 0 ? <br /> : null}
                          {line}
                        </Fragment>
                      ))}
                    </span>
                  );
                })}
              </div>
              <div className="site-xs-layer is-pictures" aria-hidden="true">
                {PICTURES_PARTS.filter((part) => part.id !== 'sheet').map((part) => (
                  <i
                    key={part.id}
                    className={`site-xs-box site-xs-ring${part.invisible === true ? ' is-dash' : ''}${isSmall(part) ? ' is-small' : ''}`}
                    style={at(part)}
                  />
                ))}
                <b className="site-xs-chip" style={chip(0, 0)}>
                  {seam.chips.picture}
                </b>
                {plate === undefined ? null : (
                  <b
                    className="site-xs-chip"
                    style={chip(plate.box[0], plate.box[1], '0', '-100%')}
                  >
                    {seam.chips.invisible}
                  </b>
                )}
              </div>
              <div className="site-xs-layer is-editable" aria-hidden="true">
                <svg className="site-xs-svg" viewBox="0 0 1600 900" preserveAspectRatio="none">
                  <path className="is-sel" d={ALL_LINES} />
                </svg>
                {EDITABLE_PARTS.filter((part) => part.kind !== 'line').map((part) => (
                  <i
                    key={part.id}
                    className={`site-xs-box site-xs-ring${isSmall(part) ? ' is-small' : ''}`}
                    style={at(part)}
                  />
                ))}
                <b className="site-xs-chip" style={chip(1600, 0, '-100%')}>
                  {seam.chips.background}
                </b>
                <b className="site-xs-chip" style={chip(1543, 200, '-100%', '-50%')}>
                  {seam.chips.line}
                </b>
                {plate === undefined ? null : (
                  <b
                    className="site-xs-chip"
                    style={chip(plate.box[0], plate.box[1], '0', '-100%')}
                  >
                    {seam.chips.rect}
                  </b>
                )}
                {heading === undefined ? null : (
                  <b
                    className="site-xs-chip"
                    style={chip(heading.box[0] + heading.box[2], heading.box[1], '-100%')}
                  >
                    {seam.chips.text}
                  </b>
                )}
              </div>
            </div>
            <div
              className="site-xs-seam"
              role="slider"
              tabIndex={0}
              aria-label={seam.slider.name}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={50}
              aria-valuetext={seam.slider.value(50)}
            >
              <i className="site-xs-knob">
                <svg viewBox="0 0 14 10" width="14" height="10" aria-hidden="true">
                  <path d="M4.5 1.5 1.5 5l3 3.5M9.5 1.5l3 3.5-3 3.5" />
                </svg>
              </i>
            </div>
          </div>
        </Frame>
      </figure>
    </div>
  );
}
