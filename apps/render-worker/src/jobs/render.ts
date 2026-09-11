// The render job: `turboslide render <ids> --theme <t> --scale <s> --out <job dir> --json` for
// the slides not yet in the content-addressed cache, then the PNGs and records are copied under
// cache/<deckId>/<revision>/<theme>@<scale>x/ so a repeated request for the same revision is served
// without a browser (SPEC 11, Hosting). Records in the result carry absolute image paths.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { z } from 'zod';

import { slugSchema } from '@turboslide/schema/ids';
import type { RenderRecord, Theme } from '@turboslide/schema/render';

import { parseJsonResult, runTurboslide } from '../cli.ts';
import { cacheDir, deckDirOf, readDeckHead } from '../paths.ts';
import type { WorkerPaths } from '../paths.ts';
import type { JobContext } from '../queue.ts';

export const renderJobInput = z.strictObject({
  deckId: slugSchema,
  slideIds: z.union([z.literal('all'), z.array(slugSchema).min(1)]).default('all'),
  themes: z
    .array(z.enum(['light', 'dark']))
    .min(1)
    .default(['light', 'dark']),
  scale: z.literal([1, 2]).default(1),
  /** Screenshot the data-raster elements too; such a run bypasses the cache. */
  rasters: z.boolean().optional(),
});

export type RenderJobInput = z.input<typeof renderJobInput>;
export type RenderJob = z.output<typeof renderJobInput>;

export type RenderJobResult = {
  deckId: string;
  revision: number;
  renderer: string;
  records: RenderRecord[];
  /** Absolute PNG paths in record order. */
  images: string[];
  cached: number;
  rendered: number;
  ms: number;
};

/** The two cache files of one slide render. */
export function cacheFiles(dir: string, slideId: string): { png: string; json: string } {
  return { png: join(dir, `${slideId}.png`), json: join(dir, `${slideId}.json`) };
}

async function readCached(dir: string, slideId: string): Promise<RenderRecord | null> {
  const files = cacheFiles(dir, slideId);
  if (!existsSync(files.png) || !existsSync(files.json)) return null;
  return JSON.parse(await readFile(files.json, 'utf8')) as RenderRecord;
}

async function store(dir: string, record: RenderRecord, imagePath: string): Promise<RenderRecord> {
  await mkdir(dir, { recursive: true });
  const files = cacheFiles(dir, record.slideId);
  await copyFile(imagePath, files.png);
  const stored: RenderRecord = { ...record, image: files.png };
  await writeFile(files.json, `${JSON.stringify(stored, null, 2)}\n`);
  return stored;
}

export async function runRenderJob(
  input: RenderJob,
  ctx: JobContext,
  paths: WorkerPaths,
): Promise<RenderJobResult> {
  const t = performance.now();
  const deckDir = deckDirOf(paths, input.deckId);
  const head = readDeckHead(deckDir);
  const ids = input.slideIds === 'all' ? head.order : input.slideIds;
  for (const id of ids) {
    if (!head.order.includes(id)) throw new RangeError(`no slide ${id} in deck ${input.deckId}`);
  }
  const records: RenderRecord[] = [];
  let renderer = '';
  let cached = 0;
  let rendered = 0;
  for (const theme of input.themes as Theme[]) {
    const dir = cacheDir(paths, input.deckId, head.revision, theme, input.scale);
    const have = new Map<string, RenderRecord>();
    if (!input.rasters) {
      for (const id of ids) {
        const record = await readCached(dir, id);
        if (record) have.set(id, record);
      }
    }
    const missing = ids.filter((id) => !have.has(id));
    cached += have.size;
    if (missing.length > 0) {
      const outDir = join(ctx.dir, `render-${theme}`);
      const args = [
        'render',
        ...(missing.length === head.order.length ? ['all'] : missing),
        '--deck',
        deckDir,
        '--theme',
        theme,
        '--scale',
        String(input.scale),
        '--out',
        outDir,
        ...(input.rasters ? ['--rasters'] : []),
        '--json',
      ];
      ctx.log(`turboslide ${args.join(' ')}`);
      const run = await runTurboslide(args, {
        env: paths.env,
        onStderrLine: ctx.log,
        signal: ctx.signal,
      });
      const fresh = parseJsonResult<RenderRecord[]>(run, 'render');
      if (run.code === 2)
        throw new Error(`render exited 2: ${run.stderr.trim().split('\n').pop() ?? ''}`);
      for (const record of fresh) {
        const imagePath = isAbsolute(record.image) ? record.image : resolve(outDir, record.image);
        const stored = input.rasters
          ? { ...record, image: imagePath }
          : await store(dir, record, imagePath);
        have.set(record.slideId, stored);
        rendered += 1;
      }
      const errors = fresh.filter((r) => r.pageErrors.length > 0);
      if (errors.length) ctx.log(`${errors.length} record(s) carry page errors`);
    }
    for (const id of ids) {
      const record = have.get(id);
      if (!record) throw new Error(`render: no record for ${id} (${theme})`);
      renderer ||= record.renderer;
      records.push(record);
    }
  }
  return {
    deckId: input.deckId,
    revision: head.revision,
    renderer,
    records,
    images: records.map((r) => r.image),
    cached,
    rendered,
    ms: Math.round(performance.now() - t),
  };
}
