// The export job: `turboslide export <format> --deck <dir> --mode --theme --fonts [--headings raster]
// [--raster-scale] [--picture-scale] [--baseline-target] [--tables] [--include-skipped]
// [--include-notes] [--appearance] [--verify] [--embed-fonts] --out <job dir>/export --json`
// (SPEC 7.2; the flags are export.run's input fields, SPEC 7.1; the PDF of gslides-parity SPEC
// 7.6 takes the same path with format pdf), the ExportReport read from the CLI's result or from
// export-report.json beside the files. A verify failure is exit 1 with a report whose `passed` is
// false; the job is done, not failed, and the report says why. Exit 2 (usage, an export command
// not wired yet, a browser error) fails the job with the CLI's `turboslide:` message line and the
// last stderr lines that are not stack frames (cli.ts failureLines); the job record's log has the
// whole of stderr.
//
// Verify needs LibreOffice and poppler (SPEC 8.5), which exist in the render worker image and
// nowhere else the job runs (docs/hosting-chromium.md); the PDF gate needs poppler alone
// (gslides-parity SPEC 7.6). When `verify` is asked for and the format's tools do not answer, the
// export runs without it and the report says so in `residual`, with the
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
  /** Carry the skipped slides too (gslides-parity SPEC 7.2.1). */
  includeSkipped: z.boolean().optional(),
  /** Carry the speaker notes (gslides-parity SPEC 7.2.13, decision 15.2). */
  includeNotes: z.boolean().optional(),
  /** The svgBlip switch of docs/VECTOR.md 4.6; false writes the PNG blip alone (`--no-svg-vector`). */
  svgVector: z.boolean().optional(),
  /** How a table block travels in Editable text (gslides-parity SPEC 7.3). */
  tables: z.enum(['auto', 'table', 'rows']).optional(),
  /** The PDF's appearance (gslides-parity SPEC 7.6); the deck's `defaults.appearance` when absent. */
  appearance: z.enum(['light', 'dark']).optional(),
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
  format: 'pptx' | 'pdf' = 'pptx',
): string {
  if (format === 'pdf')
    return `${VERIFY_UNAVAILABLE} (neither pdftoppm nor pdftocairo on PATH; the raster gate of gslides-parity SPEC 7.6 runs where poppler is installed); the page count is the gate`;
  const missing = [
    tools.soffice ? '' : 'soffice',
    tools.pdftocairo || tools.pdftoppm ? '' : 'pdftocairo/pdftoppm',
  ].filter(Boolean);
  const base = `${VERIFY_UNAVAILABLE} (${missing.join(' and ')} not on PATH; the LibreOffice loop of SPEC 8.5 runs in the turboslide-render-worker image)`;
  return (mode ?? 'flatten') === 'flatten'
    ? `${base}; flatten is pixel identical by construction: each slide is the 2x sheet raster the browser painted (SPEC 8.2)`
    : `${base}; native text placement is unverified in this file`;
}

/** True when the tools a format's verify pass needs answer: LibreOffice for PPTX, poppler for PDF. */
export function verifyToolsFor(format: 'pptx' | 'pdf', tools: ToolVersions): boolean {
  if (format === 'pdf') return Boolean(tools.pdftoppm || tools.pdftocairo);
  return Boolean(tools.soffice);
}

/**
 * The CLI arguments of an export job (SPEC 7.2 `turboslide export <format> ...`): the flags are
 * export.run's input fields; `verify` is passed only when the pass can run.
 */
export function exportJobArgs(
  input: ExportJob,
  deckDir: string,
  outDir: string,
  verify: boolean,
): string[] {
  return [
    'export',
    input.format,
    ...(input.slideIds === undefined || input.slideIds === 'all' ? [] : input.slideIds),
    '--deck',
    deckDir,
    ...(input.mode ? ['--mode', input.mode] : []),
    ...(input.theme ? ['--theme', input.theme.join(',')] : []),
    ...(input.appearance ? ['--appearance', input.appearance] : []),
    ...(input.fonts ? ['--fonts', input.fonts] : []),
    ...(input.headings ? ['--headings', input.headings] : []),
    ...(input.rasterScale !== undefined ? ['--raster-scale', String(input.rasterScale)] : []),
    ...(input.pictureScale !== undefined ? ['--picture-scale', String(input.pictureScale)] : []),
    ...(input.baseline ? ['--baseline-target', input.baseline] : []),
    ...(input.tables ? ['--tables', input.tables] : []),
    ...(input.includeSkipped ? ['--include-skipped'] : []),
    ...(input.includeNotes ? ['--include-notes'] : []),
    ...(input.svgVector === false ? ['--no-svg-vector'] : []),
    ...(verify ? ['--verify'] : []),
    ...(input.embedFonts ? ['--embed-fonts'] : []),
    ...(input.excludeShareAlike ? ['--exclude-share-alike'] : []),
    '--out',
    outDir,
    '--json',
  ];
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
  // verify only where its tools answer (LibreOffice for PPTX, poppler for PDF); the report
  // records the skip
  let verify: VerifyOutcome = input.verify ? 'ran' : 'not-requested';
  let verifyNote: string | undefined;
  if (input.verify) {
    const tools = await verifyTools(paths.env);
    if (!verifyToolsFor(input.format, tools)) {
      verify = 'skipped';
      verifyNote = verifySkippedNote(input.mode, tools, input.format);
      ctx.log(verifyNote);
    }
  }
  const args = exportJobArgs(input, deckDir, outDir, verify === 'ran');
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
