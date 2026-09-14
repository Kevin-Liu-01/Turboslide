// `turboslide activity [--since <iso>] [--kind comment,share] [--limit <n>]` (gslides-parity
// SPEC-3 5.7, 12 activity.list): the merged feed of version windows, comment events, share events,
// requests and role changes, newest first; editors and the owner read it, commenters when the
// owner allows.
import type { ActivityKind } from '@turboslide/schema/actions';
import { ACTIVITY_KINDS } from '@turboslide/schema/actions';

import { flagList, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import type { ActivityEvent } from '../records/activity.ts';

export const ACTIVITY_USAGE = `usage: turboslide activity [--since <iso>] [--kind comment,share,...] [--limit <n>] [--to <studio>] [--json]
Kinds: ${ACTIVITY_KINDS.join(', ')}.`;

export async function activity(ctx: CommandContext): Promise<number> {
  const kinds = flagList(ctx.args, 'kind', []);
  for (const kind of kinds) {
    if (!(ACTIVITY_KINDS as ReadonlyArray<string>).includes(kind))
      throw new UsageError(`"${kind}" is not an activity kind\n${ACTIVITY_USAGE}`);
  }
  const since = flagString(ctx.args, 'since');
  const result = await runDeckAction<{ events: ActivityEvent[] }>(ctx, 'activity.list', {
    ...(since !== undefined ? { since } : {}),
    ...(kinds.length > 0 ? { kinds: kinds as ActivityKind[] } : {}),
    ...(flagString(ctx.args, 'limit') !== undefined
      ? { limit: flagNumber(ctx.args, 'limit', 200) }
      : {}),
  });
  ctx.out.result(result);
  if (result.events.length === 0) ctx.out.human('no activity');
  for (const event of result.events)
    ctx.out.human(`${event.at}  ${event.kind.padEnd(8)} ${event.summary}`);
  return 0;
}
