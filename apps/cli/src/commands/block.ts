// The block commands (SPEC 7.1): block set <slide>#<block> <path> <value> (block.set; the value is
// JSON when it parses, text otherwise; --delete removes the property), block insert (a block from
// stdin or --file into a slot, `--pos x,y,w,h` making it an object of the canvas), block remove
// and block move. The freeform round adds block align, block distribute and block order over the
// position boxes (docs/freeform.md); the Google Slides parity round two (docs/gslides-parity/
// SPEC-2.md section 3) adds block group, ungroup, regroup, rotate, flip, crop, mask, reset-image,
// adjust, alt, shadow and autofit, and every canvas write on a slide that is not arranged by
// hand yet converts it first (SPEC-2 1.6). Every one returns the normalized slide with its
// findings and the new revision.
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
import { AUTOFITS } from '@turboslide/schema/blocks';
import { isClosedShapeKind } from '@turboslide/schema/shapes';

import {
  blockAdjust,
  blockAlign,
  blockAutofit,
  blockCrop,
  blockDistribute,
  blockDuplicate,
  blockFlip,
  blockGroup,
  blockInsert,
  blockMask,
  blockMove,
  blockOrder,
  blockRegroup,
  blockRemove,
  blockResetImage,
  blockRotate,
  blockSet,
  blockSetAlt,
  blockShadow,
  blockUngroup,
} from '../store-actions.ts';
import { parsePos } from './diagram.ts';
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

const USAGE = `usage: turboslide block <set|insert|remove|move|duplicate|align|distribute|order|group|ungroup|regroup|rotate|flip|crop|mask|reset-image|adjust|alt|shadow|autofit> ...
  block set <slideId>#<blockId> <pointer> <value>     JSON when it parses (22, true, "x"), text otherwise (4/8)
  block set <slideId>#<blockId> <pointer> --delete    remove the property
  block insert <slideId> --slot <slot> [--after <blockId>] [--pos x,y,w,h] [--file block.json] < block.json
                                                       with --pos the block lands as an object of the canvas (the slide converts first)
  block remove <slideId>#<blockId>
  block move <slideId>#<blockId> --slot <slot> [--after <blockId>] [--z <n>]
  block duplicate <slideId> --blocks <id,id,...>       copies after their originals, 16 px right and down (block.duplicate)
  block align <slideId> --blocks <id,id,...> --edge left|center|right|top|middle|bottom [--to selection|content|sheet] [--no-snap]
  block distribute <slideId> --blocks <id,id,...> --axis horizontal|vertical [--gap <px>] [--snap]
  block order <slideId>#<blockId> --move front|back|forward|backward | --z <n>
  block group <slideId> --blocks <id,id,...> [--as <tag>]           one group tag on the objects (block.group)
  block ungroup <slideId> --group <tag> | --blocks <id,id,...>      remove the tag (block.ungroup)
  block regroup <slideId> --blocks <id,id,...> --as <tag>           the tag back on the objects (block.regroup)
  block rotate <slideId>#<blockId>[,<blockId>] --to <deg> | --by <deg> [--about each|selection]
  block flip <slideId>#<blockId>[,<blockId>] --axis h|v [--about each|selection]
  block crop <slideId>#<blockId> --left <f> --right <f> --top <f> --bottom <f>   fractions of the picture trimmed (block.crop)
  block mask <slideId>#<blockId> <preset> | --off                  clip a picture to a closed shape (block.mask)
  block reset-image <slideId>#<blockId>                            remove the crop, mask and adjustments (block.resetImage)
  block adjust <slideId>#<blockId> [--transparency <0..1>|none] [--brightness <-1..1>|none] [--contrast <-1..1>|none]
  block alt <slideId>#<blockId> <text>                             the description, on the block or its asset (block.setAlt)
  block shadow <slideId>#<blockId>[,<blockId>] --on [--color <c>] [--opacity <o>] [--angle <a>] [--distance <d>] [--blur <b>] | --off
  block autofit <slideId>#<blockId> none|shrink|grow [--apply]     Text fitting; --apply measures and writes the fit now (block.autofit)
Every canvas write on a slide that is not arranged by hand yet converts it first (slide.toCanvas).
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
    case 'group':
      return blockGroupCommand(inner);
    case 'ungroup':
      return blockUngroupCommand(inner);
    case 'regroup':
      return blockRegroupCommand(inner);
    case 'rotate':
      return blockRotateCommand(inner);
    case 'flip':
      return blockFlipCommand(inner);
    case 'crop':
      return blockCropCommand(inner);
    case 'mask':
      return blockMaskCommand(inner);
    case 'reset-image':
      return blockResetImageCommand(inner);
    case 'adjust':
      return blockAdjustCommand(inner);
    case 'alt':
      return blockAltCommand(inner);
    case 'shadow':
      return blockShadowCommand(inner);
    case 'autofit':
      return blockAutofitCommand(inner);
    default:
      throw new UsageError(`unknown subcommand "block ${sub ?? ''}"\n${USAGE}`);
  }
}

/** `<slideId>#<blockId>[,<blockId>]`: one slide, one or more blocks. */
function requireAddresses(ctx: CommandContext): { slideId: string; blockIds: string[] } {
  const raw = requirePositional(ctx, 0, USAGE);
  const hash = raw.indexOf('#');
  if (hash <= 0 || hash === raw.length - 1)
    throw new UsageError(`Expected slideId#blockId[,blockId], got ${raw}\n${USAGE}`);
  const blockIds = raw
    .slice(hash + 1)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (blockIds.length === 0) throw new UsageError(USAGE);
  return { slideId: raw.slice(0, hash), blockIds };
}

/** A numeric flag that also takes `none` to clear the field. */
function numberOrNone(ctx: CommandContext, flag: string): number | null | undefined {
  const raw = flagString(ctx.args, flag);
  if (raw === undefined) return undefined;
  if (raw === 'none' || raw === 'off') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new UsageError(`--${flag} wants a number or none, got ${raw}`);
  return n;
}

async function blockGroupCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const blockIds = requireBlocks(ctx, 2);
  const group = flagString(ctx.args, 'as');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockGroup(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      ...(group !== undefined ? { group } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `grouped ${blockIds.join(', ')} as ${result.group} on`, result);
  return 0;
}

async function blockUngroupCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const group = flagString(ctx.args, 'group');
  const blockIds = flagList(ctx.args, 'blocks', []);
  if (group === undefined && blockIds.length === 0)
    throw new UsageError(`block ungroup wants --group <tag> or --blocks <ids>\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockUngroup(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      ...(group !== undefined ? { group } : {}),
      ...(blockIds.length > 0 ? { blockIds } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `ungrouped ${group ?? blockIds.join(', ')} on`, result);
  return 0;
}

async function blockRegroupCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const blockIds = requireBlocks(ctx, 2);
  const group = flagString(ctx.args, 'as');
  if (group === undefined) throw new UsageError(`block regroup wants --as <tag>\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockRegroup(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      group,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `regrouped ${blockIds.join(', ')} as ${group} on`, result);
  return 0;
}

async function blockRotateCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockIds } = requireAddresses(ctx);
  const to = optionalNumber(ctx, 'to');
  const by = optionalNumber(ctx, 'by');
  if ((to === undefined) === (by === undefined))
    throw new UsageError(`block rotate wants --to <deg> or --by <deg>, one of the two\n${USAGE}`);
  const about = optionalChoice(ctx, 'about', ['each', 'selection'] as const);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockRotate(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      ...(to !== undefined ? { to } : {}),
      ...(by !== undefined ? { by } : {}),
      ...(about !== undefined ? { about } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `rotated ${blockIds.join(', ')} ${to !== undefined ? `to ${to}` : `by ${by}`} degrees on`,
    result,
  );
  return 0;
}

async function blockFlipCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockIds } = requireAddresses(ctx);
  const axis = requireChoice(ctx, 'axis', ['h', 'v'] as const);
  const about = optionalChoice(ctx, 'about', ['each', 'selection'] as const);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockFlip(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      axis,
      ...(about !== undefined ? { about } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `flipped ${blockIds.join(', ')} ${axis === 'h' ? 'horizontally' : 'vertically'} on`,
    result,
  );
  return 0;
}

/** A crop side: `--left .1`; a bare flag or an absent one is 0. */
function cropSide(ctx: CommandContext, flag: string): number {
  const raw = ctx.args.flags[flag];
  if (raw === undefined || raw === true) return 0;
  const n = Number(Array.isArray(raw) ? raw[raw.length - 1] : raw);
  if (!(n >= 0 && n < 1))
    throw new UsageError(`--${flag} wants a fraction from 0 up to 1, got ${String(raw)}`);
  return n;
}

async function blockCropCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const trim = {
    left: cropSide(ctx, 'left'),
    right: cropSide(ctx, 'right'),
    top: cropSide(ctx, 'top'),
    bottom: cropSide(ctx, 'bottom'),
  };
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockCrop(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      trim,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `cropped ${blockId} on`, result);
  return 0;
}

async function blockMaskCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const off = flagBoolean(ctx.args, 'off');
  const mask = ctx.rest[1];
  if ((mask === undefined) === !off)
    throw new UsageError(`block mask wants a closed shape preset or --off\n${USAGE}`);
  if (mask !== undefined && !isClosedShapeKind(mask))
    throw new UsageError(`${mask} is not a closed shape preset of the shape picker\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockMask(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      mask: mask ?? null,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `${off ? 'removed the mask of' : `masked ${blockId} as ${mask} on`}`,
    result,
  );
  return 0;
}

async function blockResetImageCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockResetImage(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `reset the picture ${blockId} on`, result);
  return 0;
}

async function blockAdjustCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const transparency = numberOrNone(ctx, 'transparency');
  const brightness = numberOrNone(ctx, 'brightness');
  const contrast = numberOrNone(ctx, 'contrast');
  if (transparency === undefined && brightness === undefined && contrast === undefined)
    throw new UsageError(`block adjust wants --transparency, --brightness or --contrast\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockAdjust(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      ...(transparency !== undefined ? { transparency } : {}),
      ...(brightness !== undefined ? { brightness } : {}),
      ...(contrast !== undefined ? { contrast } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `adjusted ${blockId} on`, result);
  return 0;
}

async function blockAltCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const alt = ctx.rest[1];
  if (alt === undefined) throw new UsageError(`block alt wants the description\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockSetAlt(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      alt,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `wrote the description of ${blockId} on the ${result.target}${result.assetId !== undefined ? ` ${result.assetId}` : ''} of`,
    result,
  );
  return 0;
}

async function blockShadowCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockIds } = requireAddresses(ctx);
  const on = flagBoolean(ctx.args, 'on');
  const off = flagBoolean(ctx.args, 'off');
  if (on === off) throw new UsageError(`block shadow wants --on or --off\n${USAGE}`);
  let shadow: Record<string, unknown> | null = null;
  if (on) {
    shadow = {};
    const color = flagString(ctx.args, 'color');
    if (color !== undefined) shadow.color = color;
    for (const key of ['opacity', 'angle', 'distance', 'blur'] as const) {
      const value = optionalNumber(ctx, key);
      if (value !== undefined) shadow[key] = value;
    }
  }
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockShadow(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      shadow: shadow as never,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `${on ? 'set the drop shadow on' : 'removed the drop shadow of'} ${blockIds.join(', ')} of`,
    result,
  );
  return 0;
}

async function blockAutofitCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const autofit = ctx.rest[1];
  if (autofit === undefined || !(AUTOFITS as ReadonlyArray<string>).includes(autofit))
    throw new UsageError(`block autofit wants one of ${AUTOFITS.join(', ')}\n${USAGE}`);
  const apply = flagBoolean(ctx.args, 'apply');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    blockAutofit(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      autofit: autofit as never,
      ...(apply ? { apply: true as const } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `set Text fitting ${autofit} on ${blockId} of`, result);
  ctx.out.human(
    `  written: ${result.written.join(', ') || 'nothing (the block carried the mode already)'}`,
  );
  return 0;
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
  // `--pos x,y,w,h` positions the block as an object of the canvas (gslides-parity SPEC-2 2.1.4)
  const posRaw = flagString(ctx.args, 'pos');
  if (posRaw !== undefined) {
    if (typeof document !== 'object' || document === null)
      throw new UsageError('the block must be a JSON object to take --pos');
    const block = document as Record<string, unknown>;
    const current =
      typeof block['pos'] === 'object' && block['pos'] !== null
        ? (block['pos'] as Record<string, unknown>)
        : {};
    block['pos'] = { ...current, ...parsePos(posRaw) };
  }
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
