// The verify job: the LibreOffice loop of @turboslide/export over an existing export report
// (SPEC 8.5), for a file exported without --verify or exported elsewhere. LibreOffice and poppler
// are child processes of verifyPptx; the reference renders come from `referenceDir` or are rendered
// through the CLI into the verify directory.
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { z } from 'zod';

import { verifyPptx } from '@turboslide/export/verify/report';
import type { ExportReport } from '@turboslide/schema/export';
import { slugSchema } from '@turboslide/schema/ids';

import { deckDirOf } from '../paths.ts';
import type { WorkerPaths } from '../paths.ts';
import type { JobContext } from '../queue.ts';

export const verifyJobInput = z.strictObject({
  deckId: slugSchema,
  /** export-report.json, absolute or relative to the worker's work directory. */
  reportPath: z.string().min(1),
  referenceDir: z.string().optional(),
  slideIds: z.array(slugSchema).optional(),
});

export type VerifyJobInput = z.input<typeof verifyJobInput>;
export type VerifyJob = z.output<typeof verifyJobInput>;

export type VerifyJobResult = {
  deckId: string;
  report: ExportReport;
  reportPath: string;
  outDir: string;
  ms: number;
};

export async function runVerifyJob(
  input: VerifyJob,
  ctx: JobContext,
  paths: WorkerPaths,
): Promise<VerifyJobResult> {
  const t = performance.now();
  const deckDir = deckDirOf(paths, input.deckId);
  const reportPath = isAbsolute(input.reportPath)
    ? input.reportPath
    : resolve(paths.workerDir, input.reportPath);
  if (!existsSync(reportPath)) throw new RangeError(`no export report at ${reportPath}`);
  const outDir = join(ctx.dir, 'verify');
  const report = await verifyPptx(reportPath, {
    deckDir,
    referenceDir: input.referenceDir,
    outDir,
    slideIds: input.slideIds,
    env: paths.env,
    log: ctx.log,
  });
  return {
    deckId: input.deckId,
    report,
    reportPath,
    outDir,
    ms: Math.round(performance.now() - t),
  };
}
