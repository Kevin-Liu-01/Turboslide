import { CANVAS } from '../copy';
import type { HomeSlideId, SheetBox } from '../deck.generated';
import { play } from './motion';

/**
 * The canvas band's Command row (docs/LANDING.md 2.6; integrator.md 2.3): the end of each gesture
 * prints one line in a form of `packages/agent/generated/cli.json` with the gesture's values in
 * whole slide units, replacing the last. The first change prints `slide to-canvas` first and the
 * gesture's line in the next frame. A key burst ends 400 ms after its last key. The line is set in
 * Inter inside the row's `code` element (`[data-log]`), so monospace stays on the agents band's one
 * panel; it fades in over the fast duration (3.2 C6) and the band's polite live region reads it.
 */

/** A key burst ends this long after its last key (2.6). A window, not a motion token. */
const BURST_END_MS = 400;

export type Gesture = { kind: 'pos'; box: SheetBox } | { kind: 'rotate'; deg: number };

export type CommandLog = {
  /** prints the gesture's line; a burst waits for its end; `toCanvas` prints to-canvas first */
  print(block: string, gesture: () => Gesture, burst: boolean, toCanvas: boolean): void;
  /** the Layout row's word: Canvas after the first change, Mood after the last Undo (3.2 C7, a cut) */
  layout(canvas: boolean): void;
};

/** One line of the row for a gesture, in whole units and degrees. */
export function gestureLine(slide: HomeSlideId, block: string, g: Gesture): string {
  if (g.kind === 'rotate') return CANVAS.log.rotate(slide, block, Math.round(g.deg));
  const b = g.box;
  return CANVAS.log.pos(slide, block, {
    x: Math.round(b.x),
    y: Math.round(b.y),
    w: Math.round(b.w),
    h: Math.round(b.h),
  });
}

export function createLog(
  band: HTMLElement,
  slide: HomeSlideId,
  announce: (text: string) => void,
): CommandLog | null {
  const code = band.querySelector<HTMLElement>('[data-log]');
  if (code === null) return null;
  const words: string[] = [CANVAS.layout.mood, CANVAS.layout.canvas];
  // the word is `[data-layout-word]`, or the row's leaf (the row itself in HomeCanvas.tsx) that
  // reads Mood or Canvas
  const row = band.querySelector<HTMLElement>('[data-layout-row]');
  const word =
    row?.querySelector<HTMLElement>('[data-layout-word]') ??
    (row === null ? [] : [row, ...row.querySelectorAll<HTMLElement>('*')]).find(
      (el) => el.childElementCount === 0 && words.includes((el.textContent ?? '').trim()),
    );
  let timer = 0;
  let canvasFirst = false;
  const show = (line: string): void => {
    code.textContent = line;
    code.setAttribute('data-printed', '');
    play(code, [{ opacity: 0 }, { opacity: 1 }], 'fast', 'fade', 'canvas');
    announce(line);
  };
  return {
    layout(canvas) {
      const text = canvas ? CANVAS.layout.canvas : CANVAS.layout.mood;
      if (word !== undefined && word.textContent !== text) word.textContent = text;
    },
    print(block, gesture, burst, toCanvas) {
      canvasFirst ||= toCanvas;
      window.clearTimeout(timer);
      const out = (): void => {
        const line = gestureLine(slide, block, gesture());
        if (canvasFirst) {
          canvasFirst = false;
          show(CANVAS.log.toCanvas(slide));
          requestAnimationFrame(() => show(line));
        } else show(line);
      };
      if (burst) timer = window.setTimeout(out, BURST_END_MS);
      else out();
    },
  };
}
