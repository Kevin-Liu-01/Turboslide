// The export job: `turboslide export <format> --deck <dir> --mode --theme --fonts [--verify] --out
// <job dir>/export --json` (SPEC 7.2), the ExportReport read from the CLI's result or from
// export-report.json beside the files. A verify failure is exit 1 with a report whose `passed` is
// false; the job is done, not failed, and the report says why. Exit 2 (usage, an export command
// not wired yet) fails the job with the CLI's last line.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import { slugSchema } from '@turboslide/schema/ids';

import { runTurboslide } from '../cli.ts';
import { deckDirOf } from '../paths.ts';
import type { WorkerPaths } from '../paths.ts';
import type { JobContext } from '../queue.ts';

/** The export.run input of the action table (SPEC 7.1) plus the deck. */
export const exportJobInput = z.strictObject({
  deckId: slugSchema,
  format: z.enum(['pptx', 'gslides', 'pdf']).default('pptx'),
  mode: z.enum(['native', 'flatten']).optional(),
  theme: z
    .array(z.enum(['light', 'dark']))
    .min(1)
    .optional(),
  fonts: z.enum(['exact', 'standard']).optional(),
  headings: z.literal('raster').optional(),
  verify: z.boolean().optional(),
  excludeShareAlike: z.boolean().optional(),
});

export type ExportJobInput = z.input<typeof exportJobInput>;
export type ExportJob = z.output<typeof exportJobInput>;

export type ExportJobResult = {
  deckId: string;
  report: ExportReport;
  reportPath: string;
  outDir: string;
  exitCode: number;
  ms: number;
};

export const EXPORT_REPORT_FILE = 'export-report.json';

export async function runExportJob(
  input: ExportJob,
  ctx: JobContext,
  paths: WorkerPaths,
): Promise<ExportJobResult> {
  const t = performance.now();
  const deckDir = deckDirOf(paths, input.deckId);
  const outDir = join(ctx.dir, 'export');
  const args = [
    'export',
    input.format,
    '--deck',
    deckDir,
    ...(input.mode ? ['--mode', input.mode] : []),
    ...(input.theme ? ['--theme', input.theme.join(',')] : []),
    ...(input.fonts ? ['--fonts', input.fonts] : []),
    ...(input.headings ? ['--headings', input.headings] : []),
    ...(input.verify ? ['--verify'] : []),
    ...(input.excludeShareAlike ? ['--exclude-share-alike'] : []),
    '--out',
    outDir,
    '--json',
  ];
  ctx.log(`turboslide ${args.join(' ')}`);
  const run = await runTurboslide(args, {
    env: paths.env,
    onStderrLine: ctx.log,
    signal: ctx.signal,
  });
  const reportPath = join(outDir, EXPORT_REPORT_FILE);
  let report: ExportReport | null = null;
  try {
    const parsed = exportReportSchema.safeParse(JSON.parse(run.stdout));
    if (parsed.success) report = parsed.data;
  } catch {
    // no JSON on stdout; the file beside the export is the record
  }
  if (!report && existsSync(reportPath)) {
    const parsed = exportReportSchema.safeParse(JSON.parse(await readFile(reportPath, 'utf8')));
    if (parsed.success) report = parsed.data;
  }
  if (!report) {
    const tail = run.stderr.trim().split('\n').slice(-3).join(' | ');
    throw new Error(`export exited ${run.code} without an export report${tail ? `: ${tail}` : ''}`);
  }
  return {
    deckId: input.deckId,
    report,
    reportPath,
    outDir,
    exitCode: run.code,
    ms: Math.round(performance.now() - t),
  };
}
