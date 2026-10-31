import { useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';

import { TILE_SIZES, tileMarkPath } from '@turboslide/theme/brand';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { REDUCED_MOTION, inkOf, onAppearance } from './cells';
import { PATTERNS_SCREEN } from './copy';
import { PATTERN_RECIPE, printPattern } from './pattern-cells';
import { ScreenHead } from './ScreenHead';
import { useMountEffect } from '../useMountEffect';

/** The deck's footer mark, the vector mark of the 16 px tile (packages/theme brand.ts). */
const MARK_PATH = tileMarkPath(TILE_SIZES[16]);

const { time } = PATTERNS_SCREEN;
/** The axis's span in seconds: its first moment to its last. */
const SPAN = (time.seconds[time.seconds.length - 1] ?? 10) - (time.seconds[0] ?? 0);
/** Frames a second while the slide plays. */
const FPS_MS = 1000 / 30;
/** A key's step on the axis in seconds, and with Shift. */
const KEY_STEP = { small: 0.5, large: 2 } as const;

/**
 * Plays the slide and runs the time axis (pattern-cells.ts). Cells are the recipe's 3 of the
 * slide's 1,600 units rounded to whole device pixels, at least 2, one canvas pixel per cell scaled
 * up pixelated. The slide plays from the still while at least half of it is on screen and the tab
 * is shown, at 30 frames a second, looping over the axis's span, and the playhead follows it. A
 * pointer over the axis, a drag on it, or the arrow keys with its focus hold the slide at that
 * moment; when the pointer leaves or the focus goes, it plays on from there. Under reduced motion
 * it shows the still and moves only when the axis is moved. The ink is `--pt-ink`, read again
 * when the appearance changes. The playhead moves by transform alone.
 */
function usePattern(rootRef: RefObject<HTMLElement | null>) {
  useMountEffect(() => {
    const root = rootRef.current;
    const slide = root?.querySelector<HTMLElement>('.site-pp-slide');
    const canvas = slide?.querySelector<HTMLCanvasElement>('.site-pp-cells');
    const axis = root?.querySelector<HTMLElement>('.site-pp-time');
    const head = root?.querySelector<HTMLElement>('.site-pp-head');
    if (!root || !slide || !canvas || !axis || !head) return;
    const reduce = window.matchMedia(REDUCED_MOTION);
    let image: ImageData | null = null;
    let ink = 0;
    let shown: number = time.still;
    let track = 0;

    const readInk = (): void => {
      const [r, g, b] = inkOf(root);
      ink = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    };

    /* the pattern at second s over the slide, centred, in whole cells of `cell` device pixels */
    const draw = (s: number): void => {
      const w = slide.clientWidth;
      const h = slide.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const cell = Math.max(2, Math.round((3 * w * dpr) / 1600));
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
      if (image === null || image.width !== cols || image.height !== rows)
        image = g.createImageData(cols, rows);
      const pixels = new Uint32Array(image.data.buffer);
      printPattern(
        pixels,
        cols,
        rows,
        s,
        cell / dpr / h,
        PATTERN_RECIPE.u0,
        PATTERN_RECIPE.v0,
        ink,
      );
      g.putImageData(image, 0, 0);
    };

    /* the slide, the playhead and the slider's value at second s */
    const show = (s: number): void => {
      shown = s;
      draw(s);
      head.style.transform = `translateX(${Math.round((s / SPAN) * track)}px)`;
      const tenth = Math.round(s * 10) / 10;
      axis.setAttribute('aria-valuenow', String(tenth));
      axis.setAttribute('aria-valuetext', time.value(tenth));
    };

    let raf = 0;
    let playing = false;
    let held = false;
    let inView = false;
    let from = 0;
    let base = shown;
    let last = 0;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      if (now - last < FPS_MS) return;
      last = now;
      show((base + (now - from) / 1000) % SPAN);
    };
    const play = (): void => {
      if (playing || held || reduce.matches || !inView || document.hidden) return;
      playing = true;
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
    const hold = (s: number): void => {
      held = true;
      pause();
      show(Math.min(SPAN, Math.max(0, s)));
    };
    const release = (): void => {
      held = false;
      play();
    };

    /* the axis: hover and drag hold the moment under the pointer; on touch only a drag does,
       so a swipe over it still scrolls the page */
    const secondsAt = (event: PointerEvent): number => {
      const rect = axis.getBoundingClientRect();
      return ((event.clientX - rect.left) / rect.width) * SPAN;
    };
    let pressed = -1;
    const down = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      pressed = event.pointerId;
      axis.setPointerCapture(event.pointerId);
      hold(secondsAt(event));
    };
    const move = (event: PointerEvent): void => {
      if (pressed === event.pointerId || event.pointerType === 'mouse') hold(secondsAt(event));
    };
    const up = (event: PointerEvent): void => {
      if (pressed !== event.pointerId) return;
      pressed = -1;
      if (event.pointerType !== 'mouse') release();
    };
    const leave = (event: PointerEvent): void => {
      if (pressed === -1 && event.pointerType === 'mouse' && document.activeElement !== axis)
        release();
    };
    const key = (event: KeyboardEvent): void => {
      const step = event.shiftKey ? KEY_STEP.large : KEY_STEP.small;
      const to: Record<string, number> = {
        ArrowLeft: shown - step,
        ArrowDown: shown - step,
        ArrowRight: shown + step,
        ArrowUp: shown + step,
        Home: 0,
        End: SPAN,
      };
      const next = to[event.key];
      if (next === undefined) return;
      event.preventDefault();
      hold(next);
    };
    const blur = (): void => {
      if (pressed === -1) release();
    };

    const layout = (): void => {
      track = axis.clientWidth;
      head.style.left = '0';
      show(shown);
    };

    readInk();
    layout();
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
    const motion = (): void => {
      if (!reduce.matches) return play();
      pause();
      show(time.still);
    };
    reduce.addEventListener('change', motion);
    axis.addEventListener('pointerdown', down);
    axis.addEventListener('pointermove', move);
    axis.addEventListener('pointerup', up);
    axis.addEventListener('pointercancel', up);
    axis.addEventListener('pointerleave', leave);
    axis.addEventListener('keydown', key);
    axis.addEventListener('blur', blur);
    const resize = new ResizeObserver(layout);
    resize.observe(slide);
    const stop = onAppearance(() => {
      readInk();
      show(shown);
    });
    return () => {
      pause();
      seen.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      reduce.removeEventListener('change', motion);
      axis.removeEventListener('pointerdown', down);
      axis.removeEventListener('pointermove', move);
      axis.removeEventListener('pointerup', up);
      axis.removeEventListener('pointercancel', up);
      axis.removeEventListener('pointerleave', leave);
      axis.removeEventListener('keydown', key);
      axis.removeEventListener('blur', blur);
      resize.disconnect();
      stop();
    };
  });
}

/**
 * The Patterns screen: its head beside a slide of the landing's deck with the Dithering pattern,
 * playing, over its time axis. The axis is a slider: the moment the pointer or the keys pick is
 * the moment the slide shows, and the still every other place shows is marked on it with the one
 * ink square. The playhead is the screen's one accent.
 */
export function PatternsScreen() {
  const root = useRef<HTMLElement>(null);
  usePattern(root);
  const { figure, slide } = PATTERNS_SCREEN;
  return (
    <section
      ref={root}
      className="site-claim site-pp"
      id="patterns"
      aria-labelledby="site-patterns-title"
    >
      <div className="site-pp-in site-wrap">
        <ScreenHead
          titleId="site-patterns-title"
          heading={PATTERNS_SCREEN.heading}
          lead={PATTERNS_SCREEN.lead}
          wrap={false}
        />
        <figure className="site-pp-fig">
          <div className="site-pp-slide" role="img" aria-label={figure.alt}>
            <canvas className="site-pp-cells" aria-hidden="true" />
            <svg className="site-pp-sheet" viewBox="0 0 1600 900" aria-hidden="true">
              <g transform="translate(64 836) scale(2)">
                <rect className="site-mark-plate" width="16" height="16" />
                <rect className="site-mark-frame" x="0.5" y="0.5" width="15" height="15" />
                <path className="site-mark-ink" d={MARK_PATH} />
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
          <div
            className="site-pp-time"
            role="slider"
            tabIndex={0}
            aria-label={time.name}
            aria-valuemin={0}
            aria-valuemax={SPAN}
            aria-valuenow={time.still}
            aria-valuetext={time.value(time.still)}
            {...tipProps({ name: time.name, doc: time.doc, key: time.key })}
          >
            <ol className="site-pp-ticks" aria-hidden="true">
              {time.seconds.map((s) => (
                <li
                  key={s}
                  className={s === time.still ? 'is-still' : undefined}
                  style={{ '--at': s / SPAN } as CSSProperties}
                >
                  <span>{s === time.still ? time.stillAt(s) : time.at(s)}</span>
                </li>
              ))}
            </ol>
            {/* at the still from the first paint; the script moves it by transform from there */}
            <i
              className="site-pp-head"
              style={{ left: `${(time.still / SPAN) * 100}%` }}
              aria-hidden="true"
            />
          </div>
        </figure>
      </div>
    </section>
  );
}
