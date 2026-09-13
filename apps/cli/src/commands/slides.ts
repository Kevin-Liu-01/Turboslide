// slide.list and slide.get (SPEC 7.1): the slide rows with per-slide lint counts, and one slide
// with its assets and its last render records.
import { join } from 'node:path';

import { lintStatic, countsBySlide } from '@turboslide/lint/run';
import { canvasObjects, isCanvasSlide } from '@turboslide/schema/deck';

import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { derivedDir, findDeckDir, loadDeck, readRenderRecords, slideRows } from '../deck-files.ts';
import { lintLists } from '../deps/theme.ts';
import { UsageError } from '../exit.ts';

export async function slides(ctx: CommandContext): Promise<number> {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const sectionId = flagString(ctx.args, 'section');
  const findings = lintStatic(loaded, lintLists());
  const counts = countsBySlide(findings);
  const rows = slideRows(loaded)
    .filter((r) => !sectionId || r.sectionId === sectionId)
    .map((r) => ({
      ...r,
      lint: { s3: counts[r.id]?.s3 ?? 0, s2: counts[r.id]?.s2 ?? 0 },
      // the parity round's flags (gslides-parity SPEC 7.2.1, 7.2.2), so an agent reads them per slide
      ...(loaded.slides[r.id]?.skip === true ? { skip: true } : {}),
      ...(loaded.slides[r.id]?.template !== undefined
        ? { template: loaded.slides[r.id]?.template }
        : {}),
      // a canvas slide and its object count (gslides-parity SPEC-2 0.93)
      ...(loaded.slides[r.id] !== undefined && isCanvasSlide(loaded.slides[r.id] as never)
        ? { canvas: true, objects: canvasObjects(loaded.slides[r.id] as never).length }
        : {}),
    }));
  ctx.out.result(rows);
  for (const r of rows)
    ctx.out.human(
      `${String(r.n).padStart(2)}  ${r.id.padEnd(32)} ${r.kind.padEnd(9)} s3 ${r.lint.s3}  s2 ${r.lint.s2}  ${r.title}${r.skip === true ? '  (skipped)' : ''}`,
    );
  return 0;
}

export async function slideGet(ctx: CommandContext): Promise<number> {
  const id = ctx.rest[0];
  if (!id) throw new UsageError('usage: turboslide slide get <slideId>');
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const slide = loaded.slides[id];
  if (!slide) throw new UsageError(`no slide "${id}" in ${dir}`);
  const assetIds = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if ((k === 'asset' || k === 'assets') && typeof v === 'string') assetIds.add(v);
        else if (k === 'assets' && Array.isArray(v))
          v.forEach((a) => typeof a === 'string' && assetIds.add(a));
        else walk(v);
      }
    }
  };
  walk(slide);
  const records = readRenderRecords(join(derivedDir(dir, ctx.cwd), 'render', 'render.json')).filter(
    (r) => r.slideId === id,
  );
  const n = loaded.order.indexOf(id) + 1;
  const result = {
    slide,
    n,
    section: loaded.deck.sections.find((s) => s.slideIds.includes(id))?.id,
    assets: [...assetIds].map((a) => loaded.deck.assets[a]).filter(Boolean),
    render: records,
  };
  ctx.out.result(result);
  ctx.out.human(
    `${n} ${id} (${slide.kind}) in ${result.section ?? 'no section'}; ${assetIds.size} asset(s); ${records.length} render record(s)`,
  );
  if (!ctx.out.json) ctx.out.human(JSON.stringify(slide, null, 2));
  return 0;
}
