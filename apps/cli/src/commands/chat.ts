// The chat commands (gslides-parity SPEC-5 10, 13; MILESTONES-5 B5): `chat send "<text>" --to
// <studio>` posts a message to the deck's room, `chat list [--since <iso>]` reads the retained
// messages, `chat clear` removes the room's entries (the owner's). The room lives on a hosted
// studio, so every command needs `--to <url>` (or the saved credential); a checkout answers the
// sentence naming it. The route is a one line request in cli.ts (b5.md request 2).
import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { requirePositional } from '../write.ts';

export const CHAT_USAGE = `usage: turboslide chat <send|list|clear> ...
  chat send "<text>" --to <studio>  post a message to the deck's room (chat.send)
  chat list [--since <iso>] --to <studio>
                                    the retained messages, oldest first (chat.list)
  chat clear --to <studio>          remove the room's messages, the owner's action (chat.clear)
Messages are not saved: a chat is gone when the retained stream is or when everyone leaves.
Every command takes --author <name> and --json.`;

type Message = { id: string; principalId: string; label: string; text: string; at: string };

export async function chat(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const scoped = { ...ctx, rest };
  switch (sub) {
    case 'send': {
      const text = requirePositional(scoped, 0, CHAT_USAGE);
      const answer = await runDeckAction<{ id: string; at: string }>(
        ctx,
        'chat.send',
        { text },
        { hostedOnly: true },
      );
      ctx.out.result(answer);
      ctx.out.human(`Sent ${answer.id} at ${answer.at}`);
      return 0;
    }
    case 'list': {
      const since = flagString(ctx.args, 'since');
      const answer = await runDeckAction<{ messages: Message[] }>(
        ctx,
        'chat.list',
        since === undefined ? {} : { since },
        { hostedOnly: true },
      );
      ctx.out.result(answer);
      if (answer.messages.length === 0) ctx.out.human('No messages');
      for (const message of answer.messages)
        ctx.out.human(`${message.at}  ${message.label}: ${message.text}`);
      return 0;
    }
    case 'clear': {
      const answer = await runDeckAction<{ cleared: number }>(
        ctx,
        'chat.clear',
        {},
        { hostedOnly: true },
      );
      ctx.out.result(answer);
      ctx.out.human(`${answer.cleared} message${answer.cleared === 1 ? '' : 's'} cleared`);
      return 0;
    }
    default:
      throw new UsageError(CHAT_USAGE);
  }
}
