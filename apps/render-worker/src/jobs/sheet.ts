// The sheet job: the render job fills the cache, a render.json with absolute image paths is written
// into the job directory, and `turboslide sheet` draws the contact sheets from it (SPEC 7.2).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { slugSchema } from '@turboslide/schema/ids';

import { parseJsonResult, runTurboslide } from '../cli.ts';
import { deckDirOf } from '../paths.ts';
import type { WorkerPaths } from '../paths.ts';
import type { JobContext } from '../queue.ts';
import { runRenderJob } from './render.ts';

export const sheetJobInput = z.strictObject({
  deckId: slugSchema,
  slideIds: z.union([z.literal('all'), z.array(slugSchema).min(1)]).default('all'),
  themes: z
    .array(z.enum(['light', 'dark']))
    .min(1)
    .default(['light', 'dark']),
  cols: z.number().int().positive().default(4),
  thumb: z.number().int().positive().default(480),
  numbered: z.boolean().default(true),
  overlay: z.enum(['lint', 'plate']).optional(),
});

export type SheetJobInput = z.input<typeof sheetJobInput>;
export type SheetJob = z.output<typeof sheetJobInput>;

export type SheetCellMap = {
  cells: { slideId: string; n: number; box: [number, number, number, number] }[];
  [key: string]: unknown;
};

export type SheetJobResult = {
  deckId: string;
  revision: number;
  sheets: {
    theme: 'light' | 'dark';
    png: string;
    map: string;
    cells: number;
    cellMap: SheetCellMap;
  }[];
  ms: number;
};

type SheetCliResult = {
  outDir: string;
  sheets: { theme: string; png: string; map: string; cells: number }[];
};

export async function runSheetJob(
  input: SheetJob,
  ctx: JobContext,
  paths: WorkerPaths,
): Promise<SheetJobResult> {
  const t = performance.now();
  const deckDir = deckDirOf(paths, input.deckId);
  const render = await runRenderJob(
    { deckId: input.deckId, slideIds: input.slideIds, themes: input.themes, scale: 1 },
    ctx,
    paths,
  );
  const renderDir = join(ctx.dir, 'render');
  await mkdir(renderDir, { recursive: true });
  await writeFile(join(renderDir, 'render.json'), `${JSON.stringify(render.records, null, 2)}\n`);
  const outDir = join(ctx.dir, 'sheet');
  const args = [
    'sheet',
    ...(input.slideIds === 'all' ? ['all'] : input.slideIds),
    '--deck',
    deckDir,
    '--render',
    renderDir,
    '--out',
    outDir,
    '--theme',
    input.themes.join(','),
    '--cols',
    String(input.cols),
    '--thumb',
    String(input.thumb),
    ...(input.numbered ? ['--numbered'] : ['--numbered=false']),
    ...(input.overlay ? ['--overlay', input.overlay] : []),
    '--json',
  ];
  ctx.log(`turboslide ${args.join(' ')}`);
  const run = await runTurboslide(args, {
    env: paths.env,
    onStderrLine: ctx.log,
    signal: ctx.signal,
  });
  const result = parseJsonResult<SheetCliResult>(run, 'sheet');
  if (run.code !== 0) throw new Error(`sheet exited ${run.code}`);
  const sheets: SheetJobResult['sheets'] = [];
  for (const sheet of result.sheets) {
    const cellMap = JSON.parse(await readFile(sheet.map, 'utf8')) as SheetCellMap;
    sheets.push({
      theme: sheet.theme === 'dark' ? 'dark' : 'light',
      png: sheet.png,
      map: sheet.map,
      cells: sheet.cells,
      cellMap,
    });
  }
  return {
    deckId: input.deckId,
    revision: render.revision,
    sheets,
    ms: Math.round(performance.now() - t),
  };
}
