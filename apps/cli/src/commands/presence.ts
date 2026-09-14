// `turboslide presence list|follow|unfollow|pointer` and `turboslide sync status` (gslides-parity
// SPEC-3 3.10, 4.11, 12): the roster with computed marks, the follow controls of an attached page,
// the own live pointer switch (persisted on the principal record), and the client's position in
// the room. On a checkout with no server the roster is the caller alone and the sync status
// reads the file store; `--to <studio>` reads the hosted room.
import { flagBoolean } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import type { Participant } from '../records/presence.ts';

export const PRESENCE_USAGE = `usage: turboslide presence <list|follow|unfollow|pointer> ...
  presence list                     the roster with the computed mark per participant (presence.list)
  presence follow <clientId>        the attached page follows a client (presence.follow)
  presence unfollow                 (presence.unfollow)
  presence pointer --on|--off       the own live pointer, per deck (presence.pointer)
  sync status                       seq, revision, pending, retained, tier, transport, connected (sync.status)
Every command takes --to <studio>, --author <name> and --json.`;

function printParticipant(ctx: CommandContext, row: Participant, you: boolean): void {
  ctx.out.human(
    `${you ? '*' : ' '} ${row.clientId.padEnd(18)} ${row.label} (${row.trust})${row.role !== undefined ? `, ${row.role}` : ''}${row.slideId !== undefined ? `, slide ${row.slideId}` : ''}${row.following !== undefined ? `, following ${row.following}` : ''}${row.presenting ? ', presenting' : ''}${row.idle ? ', idle' : ''}`,
  );
}

export async function presence(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    case 'list': {
      const result = await runDeckAction<{
        deckId: string;
        cap: number;
        pointersVisible: boolean;
        self: Participant;
        others: Participant[];
      }>(ctx, 'presence.list', {});
      ctx.out.result(result);
      ctx.out.human(
        `${result.deckId}: ${result.others.length + 1} in the room; pointers ${result.pointersVisible ? 'shown' : 'hidden'} (${result.cap} at most)`,
      );
      printParticipant(ctx, result.self, true);
      for (const row of result.others) printParticipant(ctx, row, false);
      return 0;
    }
    case 'follow': {
      const clientId = rest[0];
      if (clientId === undefined)
        throw new UsageError(`presence follow wants <clientId>\n${PRESENCE_USAGE}`);
      const result = await runDeckAction<{ following: string | null; slideId?: string }>(
        ctx,
        'presence.follow',
        { clientId },
      );
      ctx.out.result(result);
      ctx.out.human(
        result.following === null
          ? 'not following'
          : `following ${result.following}${result.slideId !== undefined ? ` on slide ${result.slideId}` : ''}`,
      );
      return 0;
    }
    case 'unfollow': {
      const result = await runDeckAction<{ following: null }>(ctx, 'presence.unfollow', {});
      ctx.out.result(result);
      ctx.out.human('not following');
      return 0;
    }
    case 'pointer': {
      const off = flagBoolean(ctx.args, 'off');
      const on = flagBoolean(ctx.args, 'on');
      if (!on && !off)
        throw new UsageError(`presence pointer wants --on or --off\n${PRESENCE_USAGE}`);
      const result = await runDeckAction<{ on: boolean }>(ctx, 'presence.pointer', {
        on: on && !off,
      });
      ctx.out.result(result);
      ctx.out.human(result.on ? 'Showing my pointer' : 'My pointer is hidden');
      return 0;
    }
    default:
      throw new UsageError(`unknown subcommand "presence ${sub ?? ''}"\n${PRESENCE_USAGE}`);
  }
}

export async function sync(ctx: CommandContext): Promise<number> {
  const [sub] = ctx.rest;
  if (sub !== 'status')
    throw new UsageError(`unknown subcommand "sync ${sub ?? ''}"\n${PRESENCE_USAGE}`);
  const result = await runDeckAction<{
    seq: number;
    revision: number;
    pending: number;
    retained: number;
    tier: string;
    transport: string;
    connected: boolean;
  }>(ctx, 'sync.status', {});
  ctx.out.result(result);
  ctx.out.human(
    `revision ${result.revision}, seq ${result.seq}; ${result.pending} pending, ${result.retained} retained; ${result.tier} over ${result.transport}, ${result.connected ? 'connected' : 'not connected'}`,
  );
  return 0;
}
