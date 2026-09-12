// The block commands (SPEC 7.1): block set <slide>#<block> <path> <value> (block.set; the value is
// JSON when it parses, text otherwise; --delete removes the property), block insert (a block from
// stdin or --file into a slot), block remove and block move. The freeform round adds block align,
// block distribute and block order over the position boxes of a freeform slide (docs/freeform.md).
// Every one returns the normalized slide with its findings and the new revision.
import { SLOT_NAMES } from '@turboslide/schema/deck';
import type {
  AlignEdge,
  AlignTarget,
  DistributeAxis,
  OrderMove,
} from '@turboslide/schema/freeform';
import {
  ALIGN_EDGES,
  ALIGN_TARGETS,
  DISTRIBUTE_AXES,
  ORDER_MOVES,
} from '@turboslide/schema/freeform';
import type { BlockSlot } from '@turboslide/schema/mutations';

import { flagBoolean, flagList, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import {
  blockAlign,
  blockDistribute,
  blockDuplicate,
  blockInsert,
  blockMove,
  blockOrder,
  blockRemove,
  blockSet,
} from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  parseValue,
  printSlideResult,
  readDocumentInput,
  requireAddress,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide block <set|insert|remove|move|duplicate|align|distribute|order> ...
  block set <slideId>#<blockId> <pointer> <value>     JSON when it parses (22, true, "x"), text otherwise (4/8)
  block set <slideId>#<blockId> <pointer> --delete    remove the property
  block insert <slideId> --slot <slot> [--after <blockId>] [--file block.json] < block.json
  block remove <slideId>#<blockId>
  block move <slideId>#<blockId> --slot <slot> [--after <blockId>] [--z <n>]
  block duplicate <slideId> --blocks <id,id,...>       copies after their originals; 16 px right and down on a freeform slide (block.duplicate)
  block align <slideId> --blocks <id,id,...> --edge left|center|right|top|middle|bottom [--to selection|content|sheet] [--no-snap]
  block distribute <slideId> --blocks <id,id,...> --axis horizontal|vertical [--gap <px>] [--snap]
  block order <slideId>#<blockId> --move front|back|forward|backward | --z <n>
The last three work on a freeform slide (docs/freeform.md).
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

const SLOTS: ReadonlySet<string> = new Set([...SLOT_NAMES, 'plate']);

function requireSlot(ctx: CommandContext): BlockSlot {
  const slot = flagString(ctx.args, 'slot');
  if (slot === undefined || !SLOTS.has(slot))
    throw new UsageError(`--slot wants one of ${[...SLOTS].join(', ')}\n${USAGE}`);
  return slot as BlockSlot;
}

/** `--<flag> <value>` from a fixed list, or a usage error naming the list. */
function requireChoice<T extends string>(
  ctx: CommandContext,
  flag: string,
  choices: ReadonlyArray<T>,
): T {
  const value = flagString(ctx.args, flag);
  if (value === undefined || !(choices as ReadonlyArray<string>).includes(value))
    throw new UsageError(`--${flag} wants one of ${choices.join(', ')}\n${USAGE}`);
  return value as T;
}

function optionalChoice<T extends string>(
  ctx: CommandContext,
  flag: string,
  choices: ReadonlyArray<T>,
): T | undefined {
  const value = flagString(ctx.args, flag);
  if (value === undefined) return undefined;
  if (!(choices as ReadonlyArray<string>).includes(value))
    throw new UsageError(`--${flag} wants one of ${choices.join(', ')}\n${USAGE}`);
  return value as T;
}

function requireBlocks(ctx: CommandContext, min: number): string[] {
  const ids = flagList(ctx.args, 'blocks', []);
  if (ids.length < min)
    throw new UsageError(`--blocks wants at least ${min} block id(s), comma separated\n${USAGE}`);
  return ids;
}

function optionalNumber(ctx: CommandContext, flag: string): number | undefined {
  const raw = flagString(ctx.args, flag);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new UsageError(`--${flag} wants a number, got ${raw}`);
  return n;
}

export async function block(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'set':
      return blockSetCommand(inner);
    case 'insert':
      return blockInsertCommand(inner);
    case 'remove':
      return blockRemoveCommand(inner);
    case 'move':
      return blockMoveCommand(inner);
    case 'duplicate':
      return blockDuplicateCommand(inner);
    case 'align':
      return blockAlignCommand(inner);
    case 'distribute':
      return blockDistributeCommand(inner);
    case 'order':
      return blockOrderCommand(inner);
    default:
      throw new UsageError(`unknown subcommand "block ${sub ?? ''}"\n${USAGE}`);
  }
}

async function blockDuplicateCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const blockIds = requireBlocks(ctx, 1);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockDuplicate(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `duplicated ${blockIds.join(', ')} as ${result.blockIds.join(', ')} on`,
    result,
  );
  return 0;
}

async function blockAlignCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const blockIds = requireBlocks(ctx, 1);
  const edge = requireChoice<AlignEdge>(ctx, 'edge', ALIGN_EDGES);
  const to = optionalChoice<AlignTarget>(ctx, 'to', ALIGN_TARGETS);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockAlign(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      edge,
      ...(to !== undefined ? { to } : {}),
      ...(flagBoolean(ctx.args, 'no-snap') ? { snap: false } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `aligned ${blockIds.join(', ')} ${edge} on`, result);
  return 0;
}

async function blockDistributeCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const blockIds = requireBlocks(ctx, 2);
  const axis = requireChoice<DistributeAxis>(ctx, 'axis', DISTRIBUTE_AXES);
  const gap = optionalNumber(ctx, 'gap');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockDistribute(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      axis,
      ...(gap !== undefined ? { gap } : {}),
      ...(flagBoolean(ctx.args, 'snap') ? { snap: true } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `distributed ${blockIds.join(', ')} ${axis} on`, result);
  return 0;
}

async function blockOrderCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const move = optionalChoice<OrderMove>(ctx, 'move', ORDER_MOVES);
  const z = optionalNumber(ctx, 'z');
  if ((move === undefined) === (z === undefined))
    throw new UsageError(`block order wants --move or --z, one of the two\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockOrder(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      ...(move !== undefined ? { move } : {}),
      ...(z !== undefined ? { z } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `ordered ${blockId} ${move ?? `to z ${z}`} on`, result);
  return 0;
}

async function blockSetCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const path = requirePositional(ctx, 1, USAGE);
  const remove = flagBoolean(ctx.args, 'delete');
  const raw = ctx.rest[2];
  if (raw === undefined && !remove)
    throw new UsageError(`block set needs a value, or --delete to remove the property\n${USAGE}`);
  if (raw !== undefined && remove)
    throw new UsageError('block set: pass a value or --delete, not both');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockSet(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      path,
      ...(raw !== undefined ? { value: parseValue(raw) } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `set ${blockId} ${path} on`, result);
  return 0;
}

async function blockInsertCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const slot = requireSlot(ctx);
  const after = flagString(ctx.args, 'after');
  const document = await readDocumentInput(ctx, 'the block');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockInsert(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      slot,
      ...(after !== undefined ? { after } : {}),
      block: document as never,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `inserted a block in ${slot} of`, result);
  return 0;
}

async function blockRemoveCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockRemove(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `removed ${blockId} from`, result);
  return 0;
}

async function blockMoveCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const slot = requireSlot(ctx);
  const after = flagString(ctx.args, 'after');
  const z = optionalNumber(ctx, 'z');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockMove(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      slot,
      ...(after !== undefined ? { after } : {}),
      ...(z !== undefined ? { z } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `moved ${blockId} to ${slot} on`, result);
  return 0;
}
