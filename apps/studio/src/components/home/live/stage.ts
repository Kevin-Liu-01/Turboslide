import type { LiveContext } from './index';

/**
 * The hero's stage (docs/LANDING.md 2.2; V1's file), as the live core registers it: the frame's
 * filmstrip and the loop L-H are `hero-stage.ts`, a chunk of their own imported when the core
 * starts, so the core and the chunks it imports at once stay within 4.1's 64 KB decoded and 20 KB
 * gzip (`home.budget.live-module`). The step and the recorded loop are imported by that chunk on
 * the loop's first play.
 */
export function startStage(ctx: LiveContext): void {
  void import('./hero-stage')
    .then((stage) => stage.startStage(ctx))
    .catch((error: unknown) => console.error("the hero's stage did not load", error));
}
