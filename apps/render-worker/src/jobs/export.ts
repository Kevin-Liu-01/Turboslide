// The export job: `turboslide export <format> --deck <dir> --mode --theme --fonts [--headings raster]
// [--raster-scale] [--picture-scale] [--baseline-target] [--verify] [--embed-fonts] --out
// <job dir>/export --json` (SPEC 7.2; the flags are export.run's input fields, SPEC 7.1), the ExportReport read from the CLI's result or from
// export-report.json beside the files. A verify failure is exit 1 with a report whose `passed` is
// false; the job is done, not failed, and the report says why. Exit 2 (usage, an export command
// not wired yet, a browser error) fails the job with the CLI's `turboslide:` message line and the
// last stderr lines that are not stack frames (cli.ts failureLines); the job record's log has the
// whole of stderr.
//
// Verify needs LibreOffice and poppler (SPEC 8.5), which exist in the render worker image and
// nowhere else the job runs (docs/hosting-chromium.md): when `verify` is asked for and `soffice`
// does not answer, the export runs without it and the report says so in `residual`, with the
// flatten note that the mode is pixel identical by construction (the slide is the 2x sheet raster
// the browser painted, SPEC 8.2), so the file is still produced and `passed` reflects the checks
// that ran. The result names which of the three happened in `verify`.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { resolveTools, toolVersions } from '@turboslide/export/verify/libreoffice';
import type { ToolVersions } from '@turboslide/export/verify/libreoffice';
import type { ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import { slugSchema } from '@turboslide/schema/ids';

import { failureLines, runTurboslide } from '../cli.ts';
import type { ExecMode } from '../cli.ts';
import { deckDirOf } from '../paths.ts';
import type { WorkerPaths } from '../paths.ts';
import type { JobContext } from '../queue.ts';

/** The export.run input of the action table (SPEC 7.1) plus the deck. */
export const exportJobInput = z.strictObject({
  deckId: slugSchema,
  format: z.enum(['pptx', 'pdf']).default('pptx'),
  mode: z.enum(['native', 'flatten']).optional(),
  theme: z
    .array(z.enum(['light', 'dark']))
    .min(1)
    .optional(),
  fonts: z.enum(['exact', 'standard']).optional(),
  headings: z.literal('raster').optional(),
  rasterScale: z.union([z.literal('auto'), z.literal(2), z.literal(3)]).optional(),
  pictureScale: z.union([z.literal(2), z.literal(3)]).optional(),
  baseline: z.enum(['libreoffice', 'none']).optional(),
  verify: z.boolean().optional(),
  /** Editable text mode: embed the export faces as fntdata parts (docs/pptx.md). */
  embedFonts: z.boolean().optional(),
  excludeShareAlike: z.boolean().optional(),
  /** A subset of the deck, as export.run's `slideIds`; the CLI takes them as positionals. */
  slideIds: z.union([z.literal('all'), z.array(slugSchema).min(1)]).optional(),
});

export type ExportJobInput = z.input<typeof exportJobInput>;
export type ExportJob = z.output<typeof exportJobInput>;

export type VerifyOutcome = 'ran' | 'skipped' | 'not-requested';

export type ExportJobResult = {
  deckId: string;
  report: ExportReport;
  reportPath: string;
  outDir: string;
  exitCode: number;
  ms: number;
  /** Whether the LibreOffice loop ran, was skipped for want of the tools, or was not asked for. */
  verify: VerifyOutcome;
  /** The residual line the report carries when verify was skipped. */
  verifyNote?: string;
  /** How the CLI ran (cli.ts execMode). */
  exec?: ExecMode;
};

export const EXPORT_REPORT_FILE = 'export-report.json';

/** The residual line for a skipped verify; the second sentence is the flatten note of SPEC 8.2. */
export const VERIFY_UNAVAILABLE = 'verify: unavailable in this environment';

export function verifySkippedNote(
  mode: 'native' | 'flatten' | undefined,
  tools: ToolVersions,
): string {
  const missing = [
    tools.soffice ? '' : 'soffice',
    tools.pdftocairo || tools.pdftoppm ? '' : 'pdftocairo/pdftoppm',
  ].filter(Boolean);
  const base = `${VERIFY_UNAVAILABLE} (${missing.join(' and ')} not on PATH; the LibreOffice loop of SPEC 8.5 runs in the turboslide-render-worker image)`;
  return (mode ?? 'flatten') === 'flatten'
    ? `${base}; flatten is pixel identical by construction: each slide is the 2x sheet raster the browser painted (SPEC 8.2)`
    : `${base}; native text placement is unverified in this file`;
}

let toolsProbe: Promise<ToolVersions> | undefined;

/** `soffice --version` and the poppler versions, probed once per process; a missing binary answers null at once. */
export function verifyTools(env: NodeJS.ProcessEnv = process.env): Promise<ToolVersions> {
  toolsProbe ??= toolVersions(resolveTools(env));
  return toolsProbe;
}

export async function runExportJob(
  input: ExportJob,
  ctx: JobContext,
  paths: WorkerPaths,
): Promise<ExportJobResult> {
  const t = performance.now();
  const deckDir = deckDirOf(paths, input.deckId);
  const outDir = join(ctx.dir, 'export');
  // verify only where its tools answer; the report records the skip
  let verify: VerifyOutcome = input.verify ? 'ran' : 'not-requested';
  let verifyNote: string | undefined;
  if (input.verify && input.format === 'pptx') {
    const tools = await verifyTools(paths.env);
    if (!tools.soffice) {
      verify = 'skipped';
      verifyNote = verifySkippedNote(input.mode, tools);
      ctx.log(verifyNote);
    }
  }
  const args = [
    'export',
    input.format,
    ...(input.slideIds === undefined || input.slideIds === 'all' ? [] : input.slideIds),
    '--deck',
    deckDir,
    ...(input.mode ? ['--mode', input.mode] : []),
    ...(input.theme ? ['--theme', input.theme.join(',')] : []),
    ...(input.fonts ? ['--fonts', input.fonts] : []),
    ...(input.headings ? ['--headings', input.headings] : []),
    ...(input.rasterScale !== undefined ? ['--raster-scale', String(input.rasterScale)] : []),
    ...(input.pictureScale !== undefined ? ['--picture-scale', String(input.pictureScale)] : []),
    ...(input.baseline ? ['--baseline-target', input.baseline] : []),
    ...(verify === 'ran' ? ['--verify'] : []),
    ...(input.embedFonts ? ['--embed-fonts'] : []),
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
    const tail = failureLines(run.stderr).join(' | ');
    throw new Error(`export exited ${run.code} without an export report${tail ? `: ${tail}` : ''}`);
  }
  if (verifyNote && !report.residual.includes(verifyNote)) {
    report = { ...report, residual: [...report.residual, verifyNote] };
    if (existsSync(reportPath))
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return {
    deckId: input.deckId,
    report,
    reportPath,
    outDir,
    exitCode: run.code,
    ms: Math.round(performance.now() - t),
    verify,
    ...(verifyNote ? { verifyNote } : {}),
    ...(run.exec ? { exec: run.exec } : {}),
  };
}
