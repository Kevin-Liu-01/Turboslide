// The line command (gslides-parity SPEC-2 2.4, section 3): `line set` writes the line fields of
// one or more line blocks in one write (line.set): the kind (line, arrow, elbow, curved, curve,
// polyline, scribble), the start and end decorations, the weight, the dash, a connector's bend,
// the points of a curve, polyline or scribble as fractions of the box, and the attachments: a
// `--connect-start <block>:<site>` or `--connect-end <block>:<site>` attaches that end to a
// shape's connection site and moves the end onto it in the same write; `--detach start|end|both`
// removes the attachment where the end is (SPEC-2 2.4.7).
import { DASHES, LINE_ENDS, LINE_KINDS } from '@turboslide/schema/shapes';
import type { LineEnd, LineKind } from '@turboslide/schema/shapes';

import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { lineSet } from '../store-actions.ts';
import type { LineSetInput } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  printSlideResult,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide line set <slideId>#<blockId>[,<blockId>] [--kind <kind>] [--start <end>] [--end <end>] [--weight 1|1.5|2|3|4]
             [--dash <dash>|--dash none] [--bend <0..1>|--bend none] [--points "x,y x,y ..."]
             [--connect-start <blockId>:<site>] [--connect-end <blockId>:<site>] [--detach start|end|both]
The kinds: ${LINE_KINDS.join(', ')}. The decorations: ${LINE_ENDS.join(', ')}. The dashes: ${DASHES.join(', ')}.
A connector end attached to a shape's connection site follows the shape when it moves (line.set with connect).
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

/** `<blockId>:<site>` as an attachment. */
function attachment(
  raw: string | undefined,
  flag: string,
): { block: string; site: number } | undefined {
  if (raw === undefined) return undefined;
  const match = /^([a-z0-9][a-z0-9-]*):(\d+)$/.exec(raw.trim());
  if (match === null)
    throw new UsageError(`--${flag} wants <blockId>:<site>, got ${raw}\n${USAGE}`);
  return { block: match[1] ?? '', site: Number(match[2]) };
}

export async function line(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  if (sub !== 'set') throw new UsageError(`unknown subcommand "line ${sub ?? ''}"\n${USAGE}`);
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
  if (kind !== undefined && !(LINE_KINDS as ReadonlyArray<string>).includes(kind))
    throw new UsageError(`--kind wants one of ${LINE_KINDS.join(', ')}, got ${kind}\n${USAGE}`);
  const decoration = (flag: string): LineEnd | undefined => {
    const value = flagString(ctx.args, flag);
    if (value === undefined) return undefined;
    if (!(LINE_ENDS as ReadonlyArray<string>).includes(value))
      throw new UsageError(`--${flag} wants one of ${LINE_ENDS.join(', ')}, got ${value}`);
    return value as LineEnd;
  };
  const start = decoration('start');
  const end = decoration('end');
  const weightRaw = flagString(ctx.args, 'weight');
  const weight = weightRaw === undefined ? undefined : Number(weightRaw);
  if (weight !== undefined && ![1, 1.5, 2, 3, 4].includes(weight))
    throw new UsageError(`--weight wants 1, 1.5, 2, 3 or 4, got ${weightRaw ?? ''}`);
  const dashRaw = flagString(ctx.args, 'dash');
  const dash = dashRaw === undefined ? undefined : dashRaw === 'none' ? null : dashRaw;
  if (dash !== undefined && dash !== null && !(DASHES as ReadonlyArray<string>).includes(dash))
    throw new UsageError(`--dash wants one of ${DASHES.join(', ')}, got ${dash}`);
  const bendRaw = flagString(ctx.args, 'bend');
  const bend = bendRaw === undefined ? undefined : bendRaw === 'none' ? null : Number(bendRaw);
  if (bend !== undefined && bend !== null && !(bend >= 0 && bend <= 1))
    throw new UsageError(`--bend wants a number from 0 to 1, got ${bendRaw ?? ''}`);
  const pointsRaw = flagString(ctx.args, 'points');
  const points =
    pointsRaw === undefined
      ? undefined
      : pointsRaw
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((pair): [number, number] => {
            const [x, y] = pair.split(',').map(Number);
            if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y))
              throw new UsageError(`--points wants "x,y x,y ...", got ${pointsRaw}`);
            return [x, y];
          });
  const connectStart = attachment(flagString(ctx.args, 'connect-start'), 'connect-start');
  const connectEnd = attachment(flagString(ctx.args, 'connect-end'), 'connect-end');
  const detach = flagString(ctx.args, 'detach');
  if (detach !== undefined && !['start', 'end', 'both'].includes(detach))
    throw new UsageError(`--detach wants start, end or both, got ${detach}`);
  let connect: LineSetInput['connect'];
  if (connectStart !== undefined || connectEnd !== undefined || detach !== undefined) {
    connect = {};
    if (connectStart !== undefined) connect.start = connectStart;
    if (connectEnd !== undefined) connect.end = connectEnd;
    if (detach === 'start' || detach === 'both') connect.start = null;
    if (detach === 'end' || detach === 'both') connect.end = null;
  }
  if ([kind, start, end, weight, dash, bend, points, connect].every((value) => value === undefined))
    throw new UsageError(`line set wants at least one field flag\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    lineSet(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      ...(kind !== undefined ? { kind: kind as LineKind } : {}),
      ...(start !== undefined ? { start } : {}),
      ...(end !== undefined ? { end } : {}),
      ...(weight !== undefined ? { weight: weight as 1 | 1.5 | 2 | 3 | 4 } : {}),
      ...(dash !== undefined ? { dash: dash as never } : {}),
      ...(bend !== undefined ? { bend } : {}),
      ...(points !== undefined ? { points } : {}),
      ...(connect !== undefined ? { connect } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `set the line fields of ${blockIds.join(', ')} on`, result);
  return 0;
}
