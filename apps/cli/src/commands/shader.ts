// The shader commands from the shell (docs/archive/rounds/POLISH.md item 119; the action table's `shader.*`
// usages): the catalog, a shader object on a slide, one of its fields, its frame from a PNG,
// the hosted capture and a render to a file, each the same handler the studio's `shader.*`
// actions run (@turboslide/materials/actions), over the deck folder the CLI works on.
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import {
  shaderCapture,
  shaderFrame,
  shaderInsert,
  shaderList,
  shaderRender,
  shaderSet,
} from '@turboslide/materials/actions';
import type { ShaderInsertInput } from '@turboslide/materials/actions';

import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { baseRevision, parseValue, requirePositional, runAction, writeContext } from '../write.ts';
import { assetDeps, oneOf } from './asset.ts';

const USAGE = `usage: turboslide shader <list|insert|set|frame|capture|render> ...
  shader list [--material <id>]                          the catalog: the shaders, their presets and controls
  shader insert <slideId> <materialId> [--preset <p>] [--controls <json>] [--at <x,y,w,h>] [--alt <text>]
  shader set <slideId> <blockId> <path> <value>          one field under the block (/preset, /controls/strength, /anchor)
  shader frame <slideId> <blockId> --frame-key <key> --file <frame.png>
  shader capture <slideId> <blockId> [--backend angle-metal|swiftshader]
  shader render <materialId> [--preset <p>] [--time <ms>] --out <file>`;

type Position = NonNullable<ShaderInsertInput['at']>;

/** `x,y,w,h` in sheet px into a position; a malformed value is a usage error. */
export function parsePosition(raw: string): Position {
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
    throw new UsageError(`--at wants x,y,w,h in sheet px, got "${raw}"\n${USAGE}`);
  const [x, y, w, h] = parts as [number, number, number, number];
  return { x, y, w, h };
}

export async function shader(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'list':
      return list(inner);
    case 'insert':
      return insert(inner);
    case 'set':
      return set(inner);
    case 'frame':
      return frame(inner);
    case 'capture':
      return capture(inner);
    case 'render':
      return render(inner);
    default:
      throw new UsageError(`unknown subcommand "shader ${sub ?? ''}"\n${USAGE}`);
  }
}

async function list(ctx: CommandContext): Promise<number> {
  const materialId = flagString(ctx.args, 'material');
  const deps = assetDeps(ctx);
  const deck = (await deps.store.read()).document.deck;
  const result = shaderList(materialId === undefined ? {} : { materialId }, deck);
  ctx.out.result(result);
  for (const entry of result.shaders) ctx.out.human(`${entry.id}  ${entry.category}`);
  return 0;
}

async function insert(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const materialId = requirePositional(ctx, 1, USAGE);
  const preset = flagString(ctx.args, 'preset');
  const controlsRaw = flagString(ctx.args, 'controls');
  const at = flagString(ctx.args, 'at');
  const alt = flagString(ctx.args, 'alt');
  const deps = assetDeps(ctx);
  const result = await runAction(ctx, async () =>
    shaderInsert(deps, writeContext(ctx), {
      slideId,
      materialId,
      ...(preset !== undefined ? { preset } : {}),
      ...(controlsRaw !== undefined
        ? { controls: parseValue(controlsRaw) as Record<string, number> }
        : {}),
      ...(at !== undefined ? { at: parsePosition(at) } : {}),
      ...(alt !== undefined ? { alt } : {}),
      baseRevision: await baseRevision(ctx, deps.store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(`inserted ${result.blockId} on ${result.slideId}: revision ${result.revision}`);
  return 0;
}

async function set(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const blockId = requirePositional(ctx, 1, USAGE);
  const path = requirePositional(ctx, 2, USAGE);
  const raw = ctx.rest[3];
  const deps = assetDeps(ctx);
  const result = await runAction(ctx, async () =>
    shaderSet(deps, writeContext(ctx), {
      slideId,
      blockId,
      path,
      ...(raw === undefined ? {} : { value: parseValue(raw) }),
      baseRevision: await baseRevision(ctx, deps.store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(`set ${path} on ${blockId}: revision ${result.revision}`);
  return 0;
}

async function frame(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const blockId = requirePositional(ctx, 1, USAGE);
  const frameKey = flagString(ctx.args, 'frame-key');
  if (frameKey === undefined) throw new UsageError(`shader frame needs --frame-key\n${USAGE}`);
  /* the PNG comes from --file: the CLI's stdin reader is text, which a PNG is not */
  const file = flagString(ctx.args, 'file');
  if (file === undefined) throw new UsageError(`shader frame wants --file <frame.png>\n${USAGE}`);
  const png = readFileSync(isAbsolute(file) ? file : resolve(ctx.cwd, file));
  if (png.byteLength === 0) throw new UsageError(`shader frame wants a PNG in --file\n${USAGE}`);
  const deps = assetDeps(ctx);
  const result = await runAction(ctx, async () =>
    shaderFrame(deps, writeContext(ctx), {
      slideId,
      blockId,
      frameKey,
      bytes: png.toString('base64'),
      baseRevision: await baseRevision(ctx, deps.store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `frame ${result.assetId} (${result.size[0]} by ${result.size[1]}): revision ${result.revision}`,
  );
  return 0;
}

async function capture(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const blockId = requirePositional(ctx, 1, USAGE);
  const backend = oneOf(ctx, 'backend', ['angle-metal', 'swiftshader'] as const);
  const deps = assetDeps(ctx);
  const result = await runAction(ctx, async () =>
    shaderCapture(deps, writeContext(ctx), {
      slideId,
      blockId,
      ...(backend !== undefined ? { backend } : {}),
      baseRevision: await baseRevision(ctx, deps.store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `captured ${result.assetId} (${result.size[0]} by ${result.size[1]}): revision ${result.revision}`,
  );
  return 0;
}

async function render(ctx: CommandContext): Promise<number> {
  const materialId = requirePositional(ctx, 0, USAGE);
  const out = flagString(ctx.args, 'out');
  if (out === undefined) throw new UsageError(`shader render needs --out <file>\n${USAGE}`);
  const preset = flagString(ctx.args, 'preset');
  const time = flagString(ctx.args, 'time');
  const backend = oneOf(ctx, 'backend', ['angle-metal', 'swiftshader'] as const);
  const deps = assetDeps(ctx);
  const deck = (await deps.store.read()).document.deck;
  const result = await runAction(ctx, () =>
    shaderRender(
      deps,
      {
        materialId,
        ...(preset !== undefined ? { preset } : {}),
        ...(time !== undefined ? { timeMs: Number(time) } : {}),
        ...(backend !== undefined ? { backend } : {}),
      },
      deck,
    ),
  );
  const path = isAbsolute(out) ? out : resolve(ctx.cwd, out);
  writeFileSync(path, Buffer.from(result.png, 'base64'));
  ctx.out.result({ ...result, png: undefined, out: path });
  ctx.out.human(
    `rendered ${materialId} at ${result.width} by ${result.height} in ${result.ms} ms to ${path}`,
  );
  return 0;
}
