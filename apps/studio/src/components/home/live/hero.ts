import { FIELD_STILL_MS } from '../boot';
import { createPrint, densitySchedule, fieldBox, targetOf } from './field';
import type { LiveContext } from './index';
import { installGuards, reduced, slowFactor } from './motion';

/**
 * H5, the hero's Blue Marble developing over its inlined still (docs/LANDING.md 2.2, 3.2 H5 with
 * Kevin's answer 1; build/integrator.md "Landing, day 0" 2.2). L4's file.
 *
 * The boot script built the rest of the hero sequence (H1 to H4) before this module loaded; the
 * still of the field stays hidden under `html.ts-intro` until either this develop starts or L1's
 * CSS shows it at T0 + 3.0 s. The develop starts after `load` and one idle callback (when the live
 * module starts) and never later than T0 + 3.0 s: past that, or once the boot sequence ended, the
 * still is the field and nothing prints. It runs `--ts-d-gather` (1,500 ms) on the tone curve, so
 * it ends by T0 + 4.5 s (3.7), and any key, press or wheel in the hero ends it at its still
 * (motion.ts). Nothing is requested for it: the cells are the still's own, read from the box's
 * `--ts-still` and `--ts-still-disc`.
 *
 * The field under a moved title or subtitle needs no reprint: each text object draws its clear
 * zone as its own paper ground, which moves with its `transform` (l2.md Q2), over the still.
 */
export function startHero(ctx: LiveContext): void {
  installGuards();
  const field = fieldBox(ctx.band, 'hero');
  const boot = window.tsHomeBoot;
  if (field === null || reduced() || boot === undefined || boot.ended) return;
  if (field.box.hasAttribute('data-field-state')) return;
  const late = (): boolean =>
    boot.ended ||
    field.box.hasAttribute('data-field-state') ||
    (boot.t0 !== undefined && performance.now() >= boot.t0 + FIELD_STILL_MS * slowFactor());
  if (late()) return;
  void targetOf(field.box).then((read) => {
    if (read === null || late()) return;
    const print = createPrint(field, densitySchedule(read.target, read.dark), 'gather', 'hero');
    print.arm();
    print.play();
  });
}
