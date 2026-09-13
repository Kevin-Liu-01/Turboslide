// The table commands (gslides-parity SPEC-2 2.7, section 3): Google's table menus as writes of
// the table block's fields through applyTableCommand. `table merge` and `table unmerge` write the
// spans (table.merge, table.unmerge); `table insert-rows` and `table insert-columns` add counted
// rows and columns above, below, left or right (table.insertRows, table.insertColumns); `table
// delete-rows` and `table delete-columns` remove a range (table.deleteRows, table.deleteColumns);
// `table distribute rows|columns` writes equal heights or widths from a total, or clears them
// (table.distribute); `table cell-style` writes a cell's fill and border, a border weight of 0
// being Google's Transparent border (table.cellStyle). Cells are `row,column`, zero based.
import { DASHES } from '@turboslide/schema/shapes';
import type { Dash } from '@turboslide/schema/shapes';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import {
  tableCellStyle,
  tableDeleteColumns,
  tableDeleteRows,
  tableDistribute,
  tableInsertColumns,
  tableInsertRows,
  tableMerge,
  tableUnmerge,
} from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  printSlideResult,
  requireAddress,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide table <merge|unmerge|insert-rows|insert-columns|delete-rows|delete-columns|distribute|cell-style> ...
  table merge <slideId>#<blockId> --from <row,column> --to <row,column>
                                    merge the cells between two corners; their texts join the anchor's (table.merge)
  table unmerge <slideId>#<blockId> --at <row,column>
                                    remove the merge that covers a cell (table.unmerge)
  table insert-rows <slideId>#<blockId> --at <row> [--count <n>] [--above|--below]
                                    insert rows above (default) or below a row (table.insertRows)
  table insert-columns <slideId>#<blockId> --at <column> [--count <n>] [--left|--right]
                                    insert columns left (default) or right of a column (table.insertColumns)
  table delete-rows <slideId>#<blockId> --from <row> [--to <row>]
  table delete-columns <slideId>#<blockId> --from <column> [--to <column>]
                                    delete a range; deleting every row or column removes the table (table.deleteRows, table.deleteColumns)
  table distribute <slideId>#<blockId> rows|columns [--total <px>]
                                    equal heights or widths from a total, or the content's when none (table.distribute)
  table cell-style <slideId>#<blockId> --at <row,column>[;<row,column>] [--fill <color>|--no-fill]
             [--border-color <color>] [--border-weight 0|1|1.5|2] [--border-dash <dash>] [--no-border]
                                    the fill and border of cells; weight 0 is Google's Transparent border (table.cellStyle)
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

export async function table(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'merge':
      return merge(inner);
    case 'unmerge':
      return unmerge(inner);
    case 'insert-rows':
      return insertRows(inner);
    case 'insert-columns':
      return insertColumns(inner);
    case 'delete-rows':
      return deleteRows(inner);
    case 'delete-columns':
      return deleteColumns(inner);
    case 'distribute':
      return distribute(inner);
    case 'cell-style':
      return cellStyle(inner);
    default:
      throw new UsageError(`unknown subcommand "table ${sub ?? ''}"\n${USAGE}`);
  }
}

/** `row,column` as two integers. */
function cell(raw: string | undefined, flag: string): [number, number] {
  const match = raw === undefined ? null : /^(\d+)\s*,\s*(\d+)$/.exec(raw.trim());
  if (match === null)
    throw new UsageError(`--${flag} wants <row,column>, got ${raw ?? 'nothing'}\n${USAGE}`);
  return [Number(match[1]), Number(match[2])];
}

function requireInt(ctx: CommandContext, flag: string): number {
  const raw = flagString(ctx.args, flag);
  const n = Number(raw);
  if (raw === undefined || !Number.isInteger(n) || n < 0)
    throw new UsageError(
      `--${flag} wants a non-negative integer, got ${raw ?? 'nothing'}\n${USAGE}`,
    );
  return n;
}

function optionalInt(ctx: CommandContext, flag: string): number | undefined {
  const raw = flagString(ctx.args, flag);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0)
    throw new UsageError(`--${flag} wants a non-negative integer, got ${raw}\n${USAGE}`);
  return n;
}

async function merge(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const from = cell(flagString(ctx.args, 'from'), 'from');
  const to = cell(flagString(ctx.args, 'to'), 'to');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    tableMerge(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      from,
      to,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `merged ${from.join(',')} to ${to.join(',')} of ${blockId} on`, result);
  return 0;
}

async function unmerge(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const at = cell(flagString(ctx.args, 'at'), 'at');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    tableUnmerge(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      at,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `unmerged the cells at ${at.join(',')} of ${blockId} on`, result);
  return 0;
}

async function insertRows(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const at = requireInt(ctx, 'at');
  const count = optionalInt(ctx, 'count');
  const where = flagBoolean(ctx.args, 'below') ? 'below' : 'above';
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    tableInsertRows(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      at,
      ...(count !== undefined ? { count } : {}),
      where,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `inserted ${count ?? 1} row(s) ${where} row ${at} of ${blockId} on`,
    result,
  );
  return 0;
}

async function insertColumns(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const at = requireInt(ctx, 'at');
  const count = optionalInt(ctx, 'count');
  // `--left` and `--right` are optional value flags (block crop takes fractions); here they are switches
  const where = ctx.args.flags['right'] !== undefined ? 'right' : 'left';
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    tableInsertColumns(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      at,
      ...(count !== undefined ? { count } : {}),
      where,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `inserted ${count ?? 1} column(s) ${where} of column ${at} of ${blockId} on`,
    result,
  );
  return 0;
}

async function deleteRows(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const from = requireInt(ctx, 'from');
  const to = optionalInt(ctx, 'to');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    tableDeleteRows(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      from,
      ...(to !== undefined ? { to } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `deleted rows ${from} to ${to ?? from} of ${blockId} on`, result);
  return 0;
}

async function deleteColumns(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const from = requireInt(ctx, 'from');
  const to = optionalInt(ctx, 'to');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    tableDeleteColumns(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      from,
      ...(to !== undefined ? { to } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `deleted columns ${from} to ${to ?? from} of ${blockId} on`, result);
  return 0;
}

async function distribute(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const axis = ctx.rest[1];
  if (axis !== 'rows' && axis !== 'columns')
    throw new UsageError(`table distribute wants rows or columns\n${USAGE}`);
  const totalRaw = flagString(ctx.args, 'total');
  const total = totalRaw === undefined ? undefined : Number(totalRaw);
  if (total !== undefined && !(total > 0)) throw new UsageError(`--total wants a positive number`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    tableDistribute(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      axis,
      ...(total !== undefined ? { total } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `distributed the ${axis} of ${blockId} on`, result);
  return 0;
}

async function cellStyle(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  // `--at 0,0;1,2`: cells separated by semicolons (a comma is the row and column separator)
  const cells = (flagString(ctx.args, 'at') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => cell(part, 'at'));
  if (cells.length === 0)
    throw new UsageError(`table cell-style wants --at <row,column>\n${USAGE}`);
  const fillRaw = flagString(ctx.args, 'fill');
  const fill =
    fillRaw !== undefined ? fillRaw : flagBoolean(ctx.args, 'no-fill') ? null : undefined;
  const borderColor = flagString(ctx.args, 'border-color');
  const weightRaw = flagString(ctx.args, 'border-weight');
  const weight = weightRaw === undefined ? undefined : Number(weightRaw);
  if (weight !== undefined && ![0, 1, 1.5, 2].includes(weight))
    throw new UsageError(`--border-weight wants 0, 1, 1.5 or 2, got ${weightRaw ?? ''}`);
  const dash = flagString(ctx.args, 'border-dash');
  if (dash !== undefined && !(DASHES as ReadonlyArray<string>).includes(dash))
    throw new UsageError(`--border-dash wants one of ${DASHES.join(', ')}`);
  let border: { color?: string; weight?: 0 | 1 | 1.5 | 2; dash?: Dash } | null | undefined;
  if (flagBoolean(ctx.args, 'no-border')) border = null;
  else if (borderColor !== undefined || weight !== undefined || dash !== undefined) {
    border = {
      ...(borderColor !== undefined ? { color: borderColor } : {}),
      ...(weight !== undefined ? { weight: weight as 0 | 1 | 1.5 | 2 } : {}),
      ...(dash !== undefined ? { dash: dash as Dash } : {}),
    };
  }
  if (fill === undefined && border === undefined)
    throw new UsageError(
      `table cell-style wants --fill, --no-fill, a border flag or --no-border\n${USAGE}`,
    );
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    tableCellStyle(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      cells,
      ...(fill !== undefined ? { fill: fill as never } : {}),
      ...(border !== undefined ? { border: border as never } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `styled ${cells.length} cell(s) of ${blockId} on`, result);
  return 0;
}
