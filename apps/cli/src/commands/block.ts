// The block commands (SPEC 7.1): block set <slide>#<block> <path> <value> (block.set; the value is
// JSON when it parses, text otherwise; --delete removes the property), block insert (a block from
// stdin or --file into a slot), block remove and block move. Every one returns the normalized
// slide with its findings and the new revision.
import { SLOT_NAMES } from '@turboslide/schema/deck';
import type { BlockSlot } from '@turboslide/schema/mutations';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { blockInsert, blockMove, blockRemove, blockSet } from '../store-actions.ts';
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

const USAGE = `usage: turboslide block <set|insert|remove|move> ...
  block set <slideId>#<blockId> <pointer> <value>     JSON when it parses (22, true, "x"), text otherwise (4/8)
  block set <slideId>#<blockId> <pointer> --delete    remove the property
  block insert <slideId> --slot <slot> [--after <blockId>] [--file block.json] < block.json
  block remove <slideId>#<blockId>
  block move <slideId>#<blockId> --slot <slot> [--after <blockId>]
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

const SLOTS: ReadonlySet<string> = new Set([...SLOT_NAMES, 'plate']);

function requireSlot(ctx: CommandContext): BlockSlot {
  const slot = flagString(ctx.args, 'slot');
  if (slot === undefined || !SLOTS.has(slot))
    throw new UsageError(`--slot wants one of ${[...SLOTS].join(', ')}\n${USAGE}`);
  return slot as BlockSlot;
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
    default:
      throw new UsageError(`unknown subcommand "block ${sub ?? ''}"\n${USAGE}`);
  }
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
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockMove(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      slot,
      ...(after !== undefined ? { after } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `moved ${blockId} to ${slot} on`, result);
  return 0;
}
