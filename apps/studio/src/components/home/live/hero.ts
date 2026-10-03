import { FIELD_STILL_MS } from '../boot';
import { createPrint, densitySchedule, fieldBox, targetOf } from './field';
import type { LiveContext } from './index';
import { installGuards, motionPaused, reduced } from './motion';

/**
 * H5, the Blue Marble developing in the editor frame's slide 1 (docs/LANDING.md 2.2, 3.5 H5, with
 * Kevin's answer 1). V4's file.
 *
 * The frame's slide 1 holds the Blue Marble as a CSS still, which the boot script's `ts-intro`
 * hides from the first paint until this develop starts or 3,000 ms have passed (`boot.ts`
 * `FIELD_STILL_MS`). The develop starts when the live core starts, after `load` and one idle
 * callback, and only while the boot has not ended: past 3,000 ms, after Pause Motion, on a hidden
 * tab or under reduced motion the still is the field and nothing prints. It runs `--ts-d-gather`
 * (1,500 ms) on the tone curve, and any key or press in the hero, a hidden tab and Pause Motion end
 * it at its still (motion.ts). Nothing is requested for it: the cells are the still's own, read
 * from the box's `--ts-still` and `--ts-still-disc`.
 *
 * The develop is a one shot motion, so the hero's staged loop (L-H, V1's `live/stage.ts`) starts
 * only once it ended; `heroDeveloped()` answers when.
 */

let developed: Promise<void> = Promise.resolve();

/** Resolves when H5 has ended (at once when it never ran): L-H's start waits for it (3.4). */
export function heroDeveloped(): Promise<void> {
  return developed;
}

export function startHero(ctx: LiveContext): void {
  installGuards();
  /* the frame's shown slide; the filmstrip's thumbnail of slide 1 carries a small print of its own */
  const field = fieldBox(
    ctx.band.querySelector<HTMLElement>('[data-sheet="hero"]') ?? ctx.band,
    'hero',
  );
  const boot = window.tsHomeBoot;
  if (field === null || reduced() || motionPaused() || boot === undefined || boot.ended) {
    boot?.end();
    return;
  }
  if (field.box.hasAttribute('data-field-state')) return;
  const late = (): boolean =>
    boot.ended ||
    motionPaused() ||
    field.box.hasAttribute('data-field-state') ||
    (boot.t0 !== undefined && performance.now() >= boot.t0 + FIELD_STILL_MS);
  if (late()) {
    boot.end();
    return;
  }
  let done: () => void = () => undefined;
  developed = new Promise((resolve) => (done = resolve));
  void targetOf(field.box)
    .then((read) => {
      if (read === null || late()) {
        boot.end();
        done();
        return;
      }
      const print = createPrint(
        field,
        densitySchedule(read.target, read.dark),
        'gather',
        'hero',
        done,
      );
      print.arm();
      print.play();
    })
    .catch(() => {
      boot.end();
      done();
    });
}
