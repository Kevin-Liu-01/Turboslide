import { useRef } from 'react';
import type { RefObject } from 'react';

import { ROWS16_PATH } from '@turboslide/theme/brand';

import { REDUCED_MOTION, inkOf, onAppearance } from './cells';
import { PATTERNS_SCREEN } from './copy';
import { Frame } from './Frame';
import { PATTERN_RECIPE, printPattern } from './pattern-cells';
import { ScreenHead } from './ScreenHead';
import { useMountEffect } from '../useMountEffect';

const { strip } = PATTERNS_SCREEN;
/** Seconds between two moments of the strip. */
const STEP_S = (strip.seconds[1] ?? 2) - (strip.seconds[0] ?? 0);
/** Frames a second while the slide plays. */
const FPS_MS = 1000 / 30;

/**
 * Plays the slide and draws the strip (pattern-cells.ts). Cells are the recipe's 3 of the slide's
 * 1,600 units rounded to whole device pixels, at least 2, one canvas pixel per cell scaled up
 * pixelated; the slide and the strip share the cell. The strip's moments are drawn once per
 * layout; the slide plays from its still while at least half of it is on screen and the tab is
 * shown, at 30 frames a second, looping over the strip's span (0 to 10 s, 0 to 6 s on a phone)
 * with a 1 px playhead on the axis. Under reduced motion it draws the still once and the playhead
 * is absent. The ink is `--pt-ink`, read again when the appearance changes.
 */
function usePattern(rootRef: RefObject<HTMLElement | null>) {
  useMountEffect(() => {
    const root = rootRef.current;
    const body = root?.querySelector<HTMLElement>('.site-pp-body');
    const slide = root?.querySelector<HTMLElement>('.site-pp-slide');
    const slideCells = slide?.querySelector<HTMLCanvasElement>('.site-pp-cells');
    const time = root?.querySelector<HTMLElement>('.site-pp-time');
    const head = root?.querySelector<HTMLElement>('.site-pp-head');
    if (!root || !body || !slide || !slideCells || !time || !head) return;
    const items = [...root.querySelectorAll<HTMLElement>('.site-pp-strip li')];
    const reduce = window.matchMedia(REDUCED_MOTION);
    const images = new WeakMap<HTMLCanvasElement, ImageData>();
    let cell = 2;
    let axis = { x0: 0, step: 0, y: 0, span: 10 };
    let ink = 0;
    let shown: number = strip.still;

    const readInk = (): void => {
      const [r, g, b] = inkOf(root);
      ink = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    };

    /* the pattern at second s on a w by h box, centred, in whole cells of `cell` device pixels;
       m is the recipe's unit, u0 and v0 the box's centre in the recipe's space */
    const draw = (
      canvas: HTMLCanvasElement,
      w: number,
      h: number,
      s: number,
      m: number,
      u0: number,
      v0: number,
    ): void => {
      const dpr = window.devicePixelRatio || 1;
      const cols = Math.floor((w * dpr) / cell / 2) * 2;
      const rows = Math.floor((h * dpr) / cell / 2) * 2;
      if (cols < 2 || rows < 2) return;
      const key = `${w} ${h} ${dpr} ${cell}`;
      if (canvas.dataset.key !== key) {
        canvas.dataset.key = key;
        canvas.width = cols;
        canvas.height = rows;
        const cw = (cols * cell) / dpr;
        const ch = (rows * cell) / dpr;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
        canvas.style.left = `${Math.round(((w - cw) / 2) * dpr) / dpr}px`;
        canvas.style.top = `${Math.round(((h - ch) / 2) * dpr) / dpr}px`;
      }
      const g = canvas.getContext('2d');
      if (g === null) return;
      let image = images.get(canvas);
      if (image === undefined || image.width !== cols || image.height !== rows) {
        image = g.createImageData(cols, rows);
        images.set(canvas, image);
      }
      printPattern(new Uint32Array(image.data.buffer), cols, rows, s, cell / dpr / m, u0, v0, ink);
      g.putImageData(image, 0, 0);
    };

    const drawSlide = (s: number): void => {
      const w = slide.clientWidth;
      const h = slide.clientHeight;
      if (w > 0 && h > 0) draw(slideCells, w, h, s, h, PATTERN_RECIPE.u0, PATTERN_RECIPE.v0);
    };

    /* each moment as a square around the sphere, the sphere 0.8 of the square across */
    const drawStrip = (): void => {
      for (const li of items) {
        const shot = li.querySelector<HTMLElement>('.site-pp-shot');
        const canvas = shot?.querySelector<HTMLCanvasElement>('.site-pp-cells');
        if (!shot || !canvas || shot.clientWidth === 0) continue;
        const side = shot.clientWidth;
        draw(canvas, side, side, Number(li.dataset.s), side / 0.8, 0, 0);
      }
    };

    /* whole pixels: an odd shot width, so each tick and the axis land on whole pixels; the slide
       takes the strip's width and a whole pixel height, both centred */
    const layout = (): void => {
      const ground = body.parentElement;
      if (ground === null) return;
      const cs = getComputedStyle(ground);
      const avail = ground.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const live = items.filter((li) => getComputedStyle(li).display !== 'none').length;
      const gap = parseFloat(getComputedStyle(body).getPropertyValue('--pp-gap')) || 16;
      let shot = Math.floor((avail - (live - 1) * gap) / live);
      if (shot % 2 === 0) shot -= 1;
      const w = live * shot + (live - 1) * gap;
      body.style.setProperty('--pp-n', String(live));
      body.style.setProperty('--pp-shot', `${shot}px`);
      body.style.setProperty('--pp-w', `${w}px`);
      body.style.setProperty('--pp-h', `${Math.round((w * 9) / 16)}px`);
      body.style.marginLeft = `${Math.floor((avail - w) / 2)}px`;
      body.dataset.laid = '';
      cell = Math.max(2, Math.round((3 * w * (window.devicePixelRatio || 1)) / 1600));
      axis = { x0: (shot - 1) / 2, step: shot + gap, y: shot + 12 + 6, span: (live - 1) * STEP_S };
    };

    /* the slide and the playhead at second s */
    const show = (s: number): void => {
      shown = s;
      drawSlide(s);
      const x = Math.round(axis.x0 + (s / STEP_S) * axis.step);
      head.style.transform = `translate(${x}px, ${axis.y - 10}px)`;
    };

    const paint = (): void => {
      layout();
      show(shown % axis.span);
      drawStrip();
    };

    let raf = 0;
    let playing = false;
    let from = 0;
    let base = shown;
    let last = 0;
    let inView = false;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      if (now - last < FPS_MS) return;
      last = now;
      show((base + (now - from) / 1000) % axis.span);
    };
    const play = (): void => {
      if (playing || reduce.matches || !inView || document.hidden) return;
      playing = true;
      time.setAttribute('data-playing', '');
      base = shown;
      from = performance.now();
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const pause = (): void => {
      if (!playing) return;
      playing = false;
      cancelAnimationFrame(raf);
    };
    const toStill = (): void => {
      pause();
      time.removeAttribute('data-playing');
      show(strip.still);
    };

    readInk();
    paint();
    const seen = new IntersectionObserver(
      (entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        if (inView) play();
        else pause();
      },
      { threshold: 0.5 },
    );
    seen.observe(slide);
    const visibility = (): void => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', visibility);
    const motion = (): void => (reduce.matches ? toStill() : play());
    reduce.addEventListener('change', motion);
    const resize = new ResizeObserver(paint);
    resize.observe(root);
    const stop = onAppearance(() => {
      readInk();
      show(shown);
      drawStrip();
    });
    return () => {
      pause();
      seen.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      reduce.removeEventListener('change', motion);
      resize.disconnect();
      stop();
    };
  });
}

/**
 * Screen 05, Patterns (docs/SITE.md 9): a slide with the Dithering pattern on the editor's
 * stage ground, the moments of its movement on one time axis with the still ringed in the
 * selection blue, and where the pattern moves. With motion on the slide plays and a playhead
 * runs on the axis; with Reduce motion on it holds the still.
 */
export function PatternsScreen() {
  const root = useRef<HTMLElement>(null);
  usePattern(root);
  const { figure, slide, table } = PATTERNS_SCREEN;
  return (
    <section
      ref={root}
      className="site-screen site-wrap"
      id="patterns"
      aria-labelledby="site-patterns-title"
    >
      <ScreenHead titleId="site-patterns-title" sentence={PATTERNS_SCREEN.sentence} />
      <div className="site-pp">
        <figure className="site-fig site-pp-fig">
          <Frame>
            <div className="site-pp-ground">
              <div className="site-pp-body">
                <div className="site-pp-slide" role="img" aria-label={figure.alt}>
                  <canvas className="site-pp-cells" aria-hidden="true" />
                  <svg className="site-pp-sheet" viewBox="0 0 1600 900" aria-hidden="true">
                    <g transform="translate(64 836) scale(2)" shapeRendering="crispEdges">
                      <rect className="site-mark-plate" width="16" height="16" />
                      <rect className="site-mark-frame" x="0.5" y="0.5" width="15" height="15" />
                      <path className="site-mark-ink" d={ROWS16_PATH} />
                    </g>
                    <text x="949" y="698" fontSize="46" fontWeight="500" letterSpacing="-0.92">
                      {slide.heading}
                    </text>
                    <text x="949" y="742" fontSize="22" letterSpacing="-0.1">
                      {slide.sentence}
                    </text>
                    <text className="is-num" x="1536" y="864" fontSize="16" textAnchor="end">
                      {slide.counter}
                    </text>
                  </svg>
                </div>
                <div className="site-pp-time">
                  <ol className="site-pp-strip" aria-label={strip.name}>
                    {strip.seconds.map((s) => (
                      <li key={s} data-s={s} className={s === strip.still ? 'is-still' : undefined}>
                        <div className="site-pp-shot">
                          <canvas className="site-pp-cells" aria-hidden="true" />
                        </div>
                        <div className="site-pp-tick" aria-hidden="true" />
                        <span className="site-pp-at t-small">
                          {s === strip.still ? strip.stillAt(s) : strip.at(s)}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <i className="site-pp-head" aria-hidden="true" />
                </div>
              </div>
            </div>
          </Frame>
        </figure>
        <div className="site-pp-where">
          <table className="site-spec site-pp-spec" aria-label={table.caption}>
            <thead>
              <tr>
                <th className="t-label" scope="col">
                  {table.heads.place}
                </th>
                <th className="t-label" scope="col">
                  {table.heads.pattern}
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.place}>
                  <th scope="row">{row.place}</th>
                  <td>{row.pattern}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
