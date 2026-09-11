// `turboslide lease <slideId> [--minutes 10] [--force] [--release]` (SPEC 6.7, 7.1 slide.lease):
// takes ten minutes on a slide for the author; another author's lease is a 409 with the holder
// unless --force; --release gives it back. Leases are advisory in M2 (a write to a leased slide
// warns), enforced for agent writes in M4.
import { describeLease } from '@turboslide/store/lease';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { slideLease } from '../store-actions.ts';
import { openStore, runAction, storeDeps } from '../write.ts';

const USAGE = 'usage: turboslide lease <slideId> [--minutes <n>] [--force] [--release] [--json]';

export async function lease(ctx: CommandContext): Promise<number> {
  const slideId = ctx.rest[0];
  if (!slideId) throw new UsageError(USAGE);
  const minutesFlag = flagString(ctx.args, 'minutes');
  const minutes = minutesFlag === undefined ? undefined : Number(minutesFlag);
  if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1))
    throw new UsageError(`--minutes wants a positive integer, got ${minutesFlag}`);
  const release = flagBoolean(ctx.args, 'release');
  const store = openStore(ctx);
  const result = await runAction(ctx, () =>
    slideLease(
      storeDeps(ctx, store),
      { author: ctx.author, deckDir: store.dir },
      {
        slideId,
        ...(minutes !== undefined ? { minutes } : {}),
        force: flagBoolean(ctx.args, 'force'),
        release,
      },
    ),
  );
  ctx.out.result(result);
  ctx.out.human(release ? `released: ${describeLease(result)}` : describeLease(result));
  return 0;
}
