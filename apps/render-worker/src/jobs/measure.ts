// The measure job (gslides-parity SPEC-2 1.3, 0.104; docs/gslides-parity/build-2/integrator.md
// request I2): the canvas boxes and the text fit of the named slides, read the way the hosted
// studio's http transport converts a slide that is not a canvas yet. The worker runs the CLI's
// read only `turboslide slide measure <ids> --deck <dir> --json` (B1's command over
// `measureSlidesHeadless` of apps/cli/src/deps/canvas.ts, which evaluates `measureCanvasBoxes` of
// @turboslide/render/measure-dom on a 1x sheet page with prompts drawn) and returns its JSON,
// `{ [slideId]: { canvas: CanvasBoxes, fit: { [blockId]: { box, contentHeight?, fontSize? } } } }`,
// so the studio facade over TURBOSLIDE_WORKER_URL (apps/studio/src/server/render.ts
// measureSlidesThroughWorker) measures through the worker the way it renders through it and
// Chromium never runs inside the studio process. Nothing is written to the deck.
import { z } from 'zod';

import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { slugSchema } from '@turboslide/schema/ids';

import { parseJsonResult, runTurboslide } from '../cli.ts';
import { deckDirOf } from '../paths.ts';
import type { WorkerPaths } from '../paths.ts';
import type { JobContext } from '../queue.ts';

export const measureJobInput = z.strictObject({
  deckId: slugSchema,
  slideIds: z.array(slugSchema).min(1),
});

export type MeasureJobInput = z.input<typeof measureJobInput>;
export type MeasureJob = z.output<typeof measureJobInput>;

export type MeasuredSlide = {
  canvas: CanvasBoxes;
  fit: Record<
    string,
    { box: [number, number, number, number]; contentHeight?: number; fontSize?: number }
  >;
};

export type MeasureJobResult = {
  deckId: string;
  slides: Record<string, MeasuredSlide>;
  ms: number;
  /** How the CLI ran (cli.ts execMode). */
  exec?: string;
};

/** The CLI arguments of a measure job: the read only `slide measure` command with `--json`. */
export function measureJobArgs(input: MeasureJob, deckDir: string): string[] {
  return ['slide', 'measure', ...input.slideIds, '--deck', deckDir, '--json'];
}

export async function runMeasureJob(
  input: MeasureJob,
  ctx: JobContext,
  paths: WorkerPaths,
): Promise<MeasureJobResult> {
  const t = performance.now();
  const deckDir = deckDirOf(paths, input.deckId);
  const args = measureJobArgs(input, deckDir);
  ctx.log(`turboslide ${args.join(' ')}`);
  const run = await runTurboslide(args, {
    env: paths.env,
    onStderrLine: ctx.log,
    signal: ctx.signal,
  });
  if (run.code !== 0) {
    const tail = run.stderr.trim().split('\n').slice(-3).join(' | ');
    throw new Error(`slide measure exited ${run.code}${tail ? `: ${tail}` : ''}`);
  }
  const slides = parseJsonResult<Record<string, MeasuredSlide>>(run, 'slide measure');
  return {
    deckId: input.deckId,
    slides,
    ms: Math.round(performance.now() - t),
    ...(run.exec ? { exec: run.exec } : {}),
  };
}
