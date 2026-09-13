// The shape command (gslides-parity SPEC-2 2.3, section 3): `shape set` writes the shape fields
// of one or more shape blocks in one write (shape.set): the preset by its id from the shape
// picker (the 135 presets of Google's Shapes, Arrows, Callouts and Equation categories, or the
// legacy rectangle, rounded and ellipse), its adjust values, the fill, the border colour, weight
// and dash, and the corner radius. A value of `none` clears a field. Lines are `line set`.
import { SHAPE_KINDS } from '@turboslide/schema/blocks';
import { DASHES } from '@turboslide/schema/shapes';

import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { shapeSet } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  printSlideResult,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide shape set <slideId>#<blockId>[,<blockId>] [--kind <preset>] [--adjust <n,n>|--adjust none]
             [--fill <color>|--fill none] [--stroke <color>|--stroke none] [--width 1|1.5|2|3|4] [--dash <dash>|--dash none]
             [--radius <px>|--radius none]
The presets are the ids of the shape picker (rect, roundRect, ellipse, triangle, hexagon, rightArrow, wedgeRectCallout, mathPlus, ...);
the dashes: ${DASHES.join(', ')}.
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

export async function shape(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  if (sub !== 'set') throw new UsageError(`unknown subcommand "shape ${sub ?? ''}"\n${USAGE}`);
  const inner = { ...ctx, rest };
  const raw = requirePositional(inner, 0, USAGE);
  const hash = raw.indexOf('#');
  if (hash <= 0 || hash === raw.length - 1)
    throw new UsageError(`Expected slideId#blockId[,blockId], got ${raw}\n${USAGE}`);
  const slideId = raw.slice(0, hash);
  const blockIds = raw
    .slice(hash + 1)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const kind = flagString(ctx.args, 'kind');
  if (kind !== undefined && !(SHAPE_KINDS as ReadonlyArray<string>).includes(kind))
    throw new UsageError(`--kind wants a shape id from the shape picker, got ${kind}\n${USAGE}`);
  const colorOrNone = (flag: string): string | null | undefined => {
    const value = flagString(ctx.args, flag);
    if (value === undefined) return undefined;
    return value === 'none' ? null : value;
  };
  const adjustRaw = flagString(ctx.args, 'adjust');
  const adjust =
    adjustRaw === undefined
      ? undefined
      : adjustRaw === 'none'
        ? null
        : adjustRaw.split(',').map((part) => {
            const n = Number(part.trim());
            if (!Number.isFinite(n))
              throw new UsageError(`--adjust wants numbers, got ${adjustRaw}`);
            return n;
          });
  const widthRaw = flagString(ctx.args, 'width');
  const width = widthRaw === undefined ? undefined : widthRaw === 'none' ? null : Number(widthRaw);
  if (width !== undefined && width !== null && ![1, 1.5, 2, 3, 4].includes(width))
    throw new UsageError(`--width wants 1, 1.5, 2, 3 or 4, got ${widthRaw ?? ''}`);
  const dash = colorOrNone('dash');
  if (dash !== undefined && dash !== null && !(DASHES as ReadonlyArray<string>).includes(dash))
    throw new UsageError(`--dash wants one of ${DASHES.join(', ')}, got ${dash}`);
  const radiusRaw = flagString(ctx.args, 'radius');
  const radius =
    radiusRaw === undefined ? undefined : radiusRaw === 'none' ? null : Number(radiusRaw);
  if (radius !== undefined && radius !== null && !(radius >= 0))
    throw new UsageError(`--radius wants a non-negative number, got ${radiusRaw ?? ''}`);
  const fill = colorOrNone('fill');
  const stroke = colorOrNone('stroke');
  if ([kind, adjust, fill, stroke, width, dash, radius].every((value) => value === undefined))
    throw new UsageError(`shape set wants at least one field flag\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    shapeSet(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      ...(kind !== undefined ? { kind: kind as never } : {}),
      ...(adjust !== undefined ? { adjust } : {}),
      ...(fill !== undefined ? { fill: fill as never } : {}),
      ...(stroke !== undefined ? { stroke: stroke as never } : {}),
      ...(width !== undefined ? { width: width as never } : {}),
      ...(dash !== undefined ? { dash: dash as never } : {}),
      ...(radius !== undefined ? { radius } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `set the shape fields of ${blockIds.join(', ')} on`, result);
  return 0;
}
