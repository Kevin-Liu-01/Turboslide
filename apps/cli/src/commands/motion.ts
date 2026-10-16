// The motion commands (HTML-SLIDES-DESIGN 2.4): `motion list` prints a slide's effects and its
// rehearsal schedule, `motion add` adds one effect to a block (a preset with --enter, --emphasis
// or --exit, keyframes with --keyframes, or a motion path with --path), and `motion set`,
// `remove` and `move` change one effect by id. `slide transition` and `slide advance` live in
// slide.ts beside the other slide writes. Each runs the store action every transport runs.
import { formatFinding } from '@turboslide/lint/run';
import type { Effect, NewEffect } from '@turboslide/schema/motion';
import {
  DIRECTIONS,
  EASING_NAMES,
  EFFECT_PRESETS,
  EFFECT_STARTS,
  SPLIT_UNITS,
  newEffectSchema,
} from '@turboslide/schema/motion';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { motionAdd, motionList, motionMove, motionRemove, motionSet } from '../store-actions.ts';
import type { MotionWriteResult } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  parseValue,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide motion <list|add|set|remove|move> ...
  motion list <slideId>                        the effects, the transition, the advance and the schedule (motion.list)
  motion add <slideId> --block <blockId> --enter <preset>|--emphasis <preset>|--exit <preset>
             [--start click|with|after] [--delay <ms>] [--ms <ms>] [--easing <easing>] [--from <side>]
             [--amount <n>] [--repeat <n>|slide] [--split line|word|glyph] [--stagger <ms>] [--index <n>]
  motion add <slideId> --block <blockId> --keyframes '<json>' [--role enter|emphasis|exit] ...
  motion add <slideId> --block <blockId> --path '<svg path>' [--rotate] [--role enter|emphasis|exit] ...
                                               one effect on a block; click starts it by default, 500 ms (motion.add)
  motion set <slideId> <effectId> <pointer> <value>
                                               one field inside an effect, such as /durationMs 800 (motion.set)
  motion set <slideId> <effectId> <pointer> --unset
  motion remove <slideId> <effectId>           (motion.remove)
  motion move <slideId> <effectId> <index>     its new place in play order, from 0 (motion.move)
The presets: ${EFFECT_PRESETS.join(', ')}. The starts: ${EFFECT_STARTS.join(', ')}.
The easings: ${EASING_NAMES.join(', ')}. The sides: ${DIRECTIONS.join(', ')}. The splits: ${SPLIT_UNITS.join(', ')}.
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

export async function motion(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'list':
      return motionListCommand(inner);
    case 'add':
      return motionAddCommand(inner);
    case 'set':
      return motionSetCommand(inner);
    case 'remove':
      return motionRemoveCommand(inner);
    case 'move':
      return motionMoveCommand(inner);
    default:
      throw new UsageError(`unknown subcommand "motion ${sub ?? ''}"\n${USAGE}`);
  }
}

/** A whole number of milliseconds from a flag, or undefined. */
function msFlag(ctx: CommandContext, name: string): number | undefined {
  const raw = flagString(ctx.args, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0)
    throw new UsageError(`--${name} wants a whole number of milliseconds, got ${raw}`);
  return n;
}

function describeEffect(effect: Effect): string {
  const motion =
    'preset' in effect.motion
      ? effect.motion.preset
      : 'keyframes' in effect.motion
        ? `${effect.motion.keyframes.length} keyframes`
        : 'path';
  return `${effect.id}: ${effect.role} ${motion} on ${effect.block}, ${effect.start}, ${effect.durationMs} ms${effect.delayMs ? ` after ${effect.delayMs} ms` : ''}`;
}

function printWrite(ctx: CommandContext, verb: string, result: MotionWriteResult): void {
  ctx.out.result(result);
  ctx.out.human(
    `${verb} on ${result.slideId}: ${result.effects.length} effect(s), revision ${result.revision}, ${result.findings.length} finding(s)`,
  );
  for (const finding of result.findings) ctx.out.human(`  ${formatFinding(finding)}`);
}

async function motionListCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const store = openStore(ctx);
  const result = await runAction(ctx, () => motionList(storeDeps(ctx, store), { slideId }));
  ctx.out.result(result);
  const { schedule } = result;
  ctx.out.human(
    `${result.slideId}: ${result.effects.length} effect(s), ${schedule.steps} click(s), ${schedule.lengthMs} ms; transition ${result.transition === null ? 'default' : `${result.transition.name} ${result.transition.durationMs} ms`}; advance ${result.advance === null ? 'on click' : `after ${result.advance.afterMs} ms`}`,
  );
  for (const effect of result.effects) {
    const row = schedule.effects.find((entry) => entry.id === effect.id);
    ctx.out.human(
      `  ${describeEffect(effect)}${row === undefined ? ' (its block is gone; skipped)' : `; step ${row.step}, ${row.startMs} to ${row.endMs} ms`}`,
    );
  }
  return 0;
}

/** The effect `motion add`'s flags describe, checked by the action's own schema. */
function effectFromFlags(ctx: CommandContext): NewEffect {
  const block = flagString(ctx.args, 'block');
  if (block === undefined) throw new UsageError(`motion add wants --block <blockId>\n${USAGE}`);
  const roles = (['enter', 'emphasis', 'exit'] as const).filter(
    (role) => flagString(ctx.args, role) !== undefined,
  );
  const keyframes = flagString(ctx.args, 'keyframes');
  const path = flagString(ctx.args, 'path');
  const kinds = roles.length + (keyframes !== undefined ? 1 : 0) + (path !== undefined ? 1 : 0);
  if (kinds !== 1)
    throw new UsageError(
      `motion add wants exactly one of --enter, --emphasis, --exit, --keyframes or --path\n${USAGE}`,
    );
  let role =
    roles[0] ?? flagString(ctx.args, 'role') ?? (path !== undefined ? 'emphasis' : 'enter');
  let motion: unknown;
  if (roles[0] !== undefined) {
    const from = flagString(ctx.args, 'from');
    const amount = flagString(ctx.args, 'amount');
    motion = {
      preset: flagString(ctx.args, roles[0]),
      ...(from !== undefined ? { from } : {}),
      ...(amount !== undefined ? { amount: Number(amount) } : {}),
    };
    role = roles[0];
  } else if (keyframes !== undefined) {
    motion = { keyframes: parseValue(keyframes) };
  } else {
    motion = { path, ...(flagBoolean(ctx.args, 'rotate') ? { rotate: true } : {}) };
  }
  const start = flagString(ctx.args, 'start');
  const delayMs = msFlag(ctx, 'delay');
  const durationMs = msFlag(ctx, 'ms');
  const easing = flagString(ctx.args, 'easing');
  const repeat = flagString(ctx.args, 'repeat');
  const split = flagString(ctx.args, 'split');
  const staggerMs = msFlag(ctx, 'stagger');
  const parsed = newEffectSchema.safeParse({
    block,
    role,
    motion,
    ...(start !== undefined ? { start } : {}),
    ...(delayMs !== undefined ? { delayMs } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(easing !== undefined ? { easing: parseValue(easing) } : {}),
    ...(repeat !== undefined ? { repeat: repeat === 'slide' ? 'slide' : Number(repeat) } : {}),
    ...(split !== undefined ? { split: { by: split, staggerMs: staggerMs ?? 0 } } : {}),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const at = first === undefined ? '' : first.path.map(String).join('/');
    throw new UsageError(
      `motion add: ${at === '' ? '' : `/${at}: `}${first?.message ?? 'invalid effect'}\n${USAGE}`,
    );
  }
  return parsed.data;
}

async function motionAddCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const effect = effectFromFlags(ctx);
  const index = flagString(ctx.args, 'index');
  if (index !== undefined && !(Number.isInteger(Number(index)) && Number(index) >= 0))
    throw new UsageError(`--index wants a whole number from 0, got ${index}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    motionAdd(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      effect,
      ...(index !== undefined ? { index: Number(index) } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printWrite(ctx, `added ${result.effectId}`, result);
  return 0;
}

async function motionSetCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const effectId = requirePositional(ctx, 1, USAGE);
  const path = requirePositional(ctx, 2, USAGE);
  const unset = flagBoolean(ctx.args, 'unset');
  const raw = ctx.rest[3];
  if (!unset && raw === undefined)
    throw new UsageError(`motion set wants a value, or --unset to remove the field\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    motionSet(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      effectId,
      path,
      ...(!unset && raw !== undefined ? { value: parseValue(raw) } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printWrite(ctx, `set ${path} of ${effectId}`, result);
  return 0;
}

async function motionRemoveCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const effectId = requirePositional(ctx, 1, USAGE);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    motionRemove(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      effectId,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printWrite(ctx, `removed ${effectId}`, result);
  return 0;
}

async function motionMoveCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const effectId = requirePositional(ctx, 1, USAGE);
  const raw = requirePositional(ctx, 2, USAGE);
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0)
    throw new UsageError(`motion move wants an index from 0, got ${raw}\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    motionMove(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      effectId,
      index,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printWrite(ctx, `moved ${effectId} to ${index}`, result);
  return 0;
}
