// The material commands (SPEC 7.1, 7.2; MILESTONES M5 item 3): `material list` prints the catalog
// (paper:* with uniform schemas and presets, proto:* as unavailable), `material capture` renders a
// recipe at 3200 by 1800 and freezes frames at the anchors as assets with recipe keys, plain or
// two-tone, through the one implementation in @turboslide/materials/actions. `--uniforms <file>`
// takes a recipe sidecar (assets/<id>.recipe.json) or a bare uniform record; `--set u_x=v` sets
// one uniform; `--preset` names a palette preset.
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import type { Asset } from '@turboslide/schema/assets';
import type { MaterialUniforms } from '@turboslide/schema/blocks/material';
import { materialCapture, materialList } from '@turboslide/materials/actions';
import { parseRecipeFile } from '@turboslide/materials/capture';

import { flagAll, flagBoolean, flagList, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { baseRevision, parseValue, requirePositional, runAction, writeContext } from '../write.ts';
import { assetDeps, oneOf, twoToneFlags } from './asset.ts';

const USAGE = `usage: turboslide material <list|capture> ...
  material list [<materialId>] [--json]
  material capture <materialId> [--preset <name>] [--uniforms <recipe.json>] [--set u_name=value ...] --anchor 4000,5500,7000
            [--id <slug>] [--role opener|mood|frame] [--alt <text>] [--two-tone] [--crop l,t,r,b] [--black <n>] [--white <n>]
            [--gamma <g>] [--blur <px>] [--channel c] [--polarity p] [--plate lower-left|lower-right|upper-left]
            [--backend angle-metal|swiftshader] [--settle <ms>]
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

export async function material(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'list':
      return materialListCommand(inner);
    case 'capture':
      return materialCaptureCommand(inner);
    default:
      throw new UsageError(USAGE);
  }
}

async function materialListCommand(ctx: CommandContext): Promise<number> {
  const id = ctx.rest[0];
  const entries = materialList(id !== undefined ? { materialId: id } : {});
  if (id !== undefined && entries.length === 0) throw new UsageError(`unknown material "${id}"`);
  ctx.out.result(entries);
  for (const entry of entries) {
    const state = entry.available ? '' : ' (not ported, open question 9)';
    ctx.out.human(`${entry.id}  ${entry.label}${state}`);
    if (entry.available) {
      ctx.out.human(`  presets: ${entry.presets.map((p) => p.name).join(', ')}`);
      ctx.out.human(
        `  uniforms: ${entry.uniforms.map((u) => `${u.name}${u.kind === 'enum' ? `[${(u.options ?? []).map((o) => o.name).join('|')}]` : u.min !== undefined ? ` ${u.min}..${u.max}` : ''}`).join(', ')}`,
      );
    }
  }
  return 0;
}

function anchorsFlag(ctx: CommandContext): number[] {
  const raw = flagList(ctx.args, 'anchor', []);
  const anchors = raw.map((s) => Number(s));
  if (anchors.some((n) => !Number.isFinite(n) || n < 0))
    throw new UsageError(`--anchor wants frame times in ms, got ${raw.join(',')}`);
  return anchors;
}

/** `--set u_scale=0.5 --set u_colorBack=#070707`: values parse as JSON when they can, else text. */
function setFlags(ctx: CommandContext): MaterialUniforms {
  const out: MaterialUniforms = {};
  for (const entry of flagAll(ctx.args, 'set')) {
    const eq = entry.indexOf('=');
    if (eq <= 0) throw new UsageError(`--set wants u_name=value, got ${entry}`);
    const name = entry.slice(0, eq).trim();
    const value = parseValue(entry.slice(eq + 1).trim());
    if (typeof value === 'number' || typeof value === 'string') out[name] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === 'number'))
      out[name] = value as number[];
    else throw new UsageError(`--set ${name}: a uniform is a number, a string or a number list`);
  }
  return out;
}

async function materialCaptureCommand(ctx: CommandContext): Promise<number> {
  const positional = requirePositional(ctx, 0, USAGE);
  const file = flagString(ctx.args, 'uniforms');
  const fromFile =
    file === undefined
      ? {}
      : parseRecipeFile(
          JSON.parse(
            readFileSync(isAbsolute(file) ? file : resolve(ctx.cwd, file), 'utf8'),
          ) as unknown,
        );
  const materialId = positional;
  if (fromFile.materialId !== undefined && fromFile.materialId !== materialId)
    ctx.out.warn(
      `material capture: the recipe file names ${fromFile.materialId}; capturing ${materialId} as asked`,
    );
  const anchors = anchorsFlag(ctx);
  const anchorList =
    anchors.length > 0 ? anchors : fromFile.anchor !== undefined ? [fromFile.anchor] : [];
  if (anchorList.length === 0)
    throw new UsageError(`material capture wants --anchor <ms,...>\n${USAGE}`);
  const preset = flagString(ctx.args, 'preset') ?? fromFile.preset;
  const uniforms = { ...(fromFile.uniforms ?? {}), ...setFlags(ctx) };
  const treatmentFlags = twoToneFlags(ctx);
  const treatment =
    treatmentFlags !== undefined || fromFile.treatment !== undefined
      ? { ...fromFile.treatment, ...treatmentFlags }
      : undefined;
  const twoTone = flagBoolean(ctx.args, 'two-tone') || fromFile.twoTone === true;
  const plateFlagValue =
    oneOf(ctx, 'plate', ['lower-left', 'lower-right', 'upper-left'] as const) ?? fromFile.plate;
  const role = oneOf(ctx, 'role', ['opener', 'mood', 'frame'] as const);
  const backend = oneOf(ctx, 'backend', ['angle-metal', 'swiftshader'] as const);
  const deps = assetDeps(ctx);
  const base = await baseRevision(ctx, deps.store);
  const request = {
    materialId,
    ...(preset !== undefined ? { preset } : {}),
    ...(Object.keys(uniforms).length > 0 ? { uniforms } : {}),
    anchors: anchorList,
    ...(flagString(ctx.args, 'id') !== undefined
      ? { id: flagString(ctx.args, 'id') as string }
      : {}),
    ...(role !== undefined ? { role } : {}),
    ...(flagString(ctx.args, 'alt') !== undefined
      ? { alt: flagString(ctx.args, 'alt') as string }
      : {}),
    ...(twoTone ? { twoTone: true } : {}),
    ...(treatment !== undefined ? { treatment } : {}),
    ...(plateFlagValue !== undefined ? { plate: plateFlagValue } : {}),
    ...(backend !== undefined ? { backend } : {}),
    ...(flagString(ctx.args, 'settle') !== undefined
      ? { settleMs: Number(flagString(ctx.args, 'settle')) }
      : {}),
    baseRevision: base,
  };
  const result = await runAction(ctx, () => materialCapture(deps, writeContext(ctx), request));
  ctx.out.result(result);
  const assets: Asset[] = Array.isArray(result) ? result : [result];
  const revision = await deps.store.revision();
  for (const asset of assets) {
    const key = asset.source.kind === 'material' ? asset.source.recipeKey : '';
    const twins =
      'neutral' in asset.twins ? asset.twins.neutral : `${asset.twins.light}, ${asset.twins.dark}`;
    ctx.out.human(
      `captured ${asset.id} at ${asset.source.kind === 'material' ? asset.source.timeMs : '?'} ms: ${twins}; ${key}`,
    );
    if (asset.metrics?.plateClear !== undefined) {
      const c = asset.metrics.plateClear;
      ctx.out.human(
        `  lit ${(asset.metrics.litFraction * 100).toFixed(1)} percent, plate ${c.plate.join(',')}: ${c.litUnder} under, ${c.litInBand} in the band, nearest ${c.nearestLitPx} px`,
      );
    }
  }
  ctx.out.human(`revision ${revision}`);
  return 0;
}
