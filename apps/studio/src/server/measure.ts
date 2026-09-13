import { failureLines, parseJsonResult, runTurboslide } from '@turboslide/render-worker/cli';
import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import type { MeasureJobResult } from '@turboslide/render-worker/jobs/measure';
import type { CanvasBoxes } from '@turboslide/schema/canvas';

import { deckDir, ensureDeckAssets, openDeckStore, repoRoot, workerClientOptions } from './root';

/**
 * The canvas measurer of the hosted http transport (gslides-parity SPEC-2 1.3, 0.104;
 * MILESTONES-2 "Integrator" item 2), beside render.slide: the boxes `toCanvas` reads for the named
 * slides, measured on a 1x sheet page rendered with prompts drawn, the same function the CLI and
 * the MCP server run (`apps/cli/src/deps/canvas.ts` over `measureCanvas` of @turboslide/headless),
 * so the `pos` a hosted write produces equals the CLI's. The measurement runs the way a render
 * does, through the worker and never in this process: the turboslide CLI as the worker's child
 * process (`slide measure`, the read only command that prints `{ [slideId]: { canvas, fit } }`),
 * or the worker's `measure` job over HTTP when TURBOSLIDE_WORKER_URL names one.
 * server/actions.ts binds it as `deps.measureCanvas` and `deps.measureFit` of the store actions;
 * the editor measures its own hidden sheet (@turboslide/viewer/canvas-measure) and never calls
 * this.
 *
 * This module is server only and is imported by server/actions.ts alone. At merge 1 the function
 * lived in server/render.ts, a module the edit route imports on the client for its server
 * function wrapper; TanStack Start's client transform strips a server function's handler and the
 * imports only the handler used, but a plain exported function keeps its imports alive, so the
 * browser evaluated apps/render-worker/src/cli.ts (node:child_process at module scope) and no
 * editor page booted on any dev server or on the preview built from that tree (measured by B3, B4,
 * B5 and B6 on 2026-09-12, docs/gslides-parity/build-2/b6.md section 4 item 0). A route module may
 * import a server/*.ts file only when everything the file exports is a server function wrapper or
 * a pure helper with no worker import (server/download.ts).
 */

let client: WorkerClient | undefined;

function worker(): WorkerClient {
  client ??= createWorkerClient(workerClientOptions());
  return client;
}

/** What one measured slide carries: the boxes `toCanvas` reads and, per block, the fit `block.autofit --apply` reads. */
export type MeasuredSlide = {
  canvas: CanvasBoxes;
  fit: Record<
    string,
    { box: [number, number, number, number]; contentHeight?: number; fontSize?: number }
  >;
};

/** The wall time one measurement may take: a launch, one render and one page per call. */
const MEASURE_TIMEOUT_MS = 120_000;

export async function measureSlidesThroughWorker(
  deckId: string,
  slideIds: readonly string[],
): Promise<Record<string, MeasuredSlide>> {
  if (slideIds.length === 0) return {};
  const names = slideIds.join(', ');
  const local = worker();
  // the hosted store first, so the folder the CLI or the worker reads holds the store's current document
  await openDeckStore(deckId);
  await ensureDeckAssets(deckId);
  if (local.mode === 'http') {
    // the Docker worker's measure job (apps/render-worker/src/jobs/measure.ts, B2), the same CLI
    // command run beside the worker's own checkout of the deck
    const job = await local.submit('measure', { deckId, slideIds: [...slideIds] });
    const done = await local.wait(job.id, MEASURE_TIMEOUT_MS);
    if (done.status !== 'done') {
      throw new TypeError(
        `Slides ${names} are not arranged by hand yet and could not be measured to convert them: the render worker's measure job failed${done.error?.message ? ` (${done.error.message})` : ''} (gslides-parity SPEC-2 1.3)`,
      );
    }
    return (done.result as MeasureJobResult).slides;
  }
  const run = await runTurboslide(
    ['slide', 'measure', ...slideIds, '--deck', deckDir(deckId), '--json'],
    { cwd: repoRoot(), timeoutMs: MEASURE_TIMEOUT_MS },
  );
  if (run.code !== 0) {
    const why = failureLines(run.stderr, 2).join('; ');
    throw new TypeError(
      `Slides ${names} are not arranged by hand yet and could not be measured to convert them: turboslide slide measure exited ${run.code}${why ? ` (${why})` : ''} (gslides-parity SPEC-2 1.3); convert them with slide.toCanvas through the turboslide CLI on a checkout of the deck`,
    );
  }
  return parseJsonResult<Record<string, MeasuredSlide>>(run, 'slide measure');
}
