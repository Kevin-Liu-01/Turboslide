// The inbox commands (gslides-parity SPEC-3 5.5, 12): `notifications [--unread] [--since <iso>]`
// lists the caller's inbox, `notifications read <ids>|--all` marks records read, `notifications
// settings` reads or writes the per deck level (all, for-you, none), the email switch and, for the
// owner, whether commenters read the Activity panel. On a checkout the inbox is
// `.turboslide/inbox/<principal>.json` for the `--author` principal (`notification.*`).
import { flagAll, flagBoolean, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import type { Notification } from '../records/inbox.ts';

export const NOTIFICATIONS_USAGE = `usage: turboslide notifications [--unread] [--since <iso>] [--limit <n>]
  notifications                     the inbox, newest first (notification.list)
  notifications read <id> [<id>...] | notifications read --all
                                    mark read; answers the unread count (notification.markRead)
  notifications settings [--level all|for-you|none] [--email true|false] [--activity-for-commenters true|false]
                                    read or write the per deck settings (notification.settings)
Every command takes --to <studio>, --author <name> and --json.`;

const LEVELS: Record<string, 'all' | 'forYou' | 'none'> = {
  all: 'all',
  'for-you': 'forYou',
  forYou: 'forYou',
  none: 'none',
};

function boolFlag(ctx: CommandContext, name: string): boolean | undefined {
  const value = flagString(ctx.args, name);
  if (value === undefined) return ctx.args.flags[name] === true ? true : undefined;
  if (value === 'true' || value === '1' || value === 'on') return true;
  if (value === 'false' || value === '0' || value === 'off') return false;
  throw new UsageError(`--${name} wants true or false, got ${value}`);
}

function sentence(row: Notification): string {
  const who = row.actors[0] ?? 'Someone';
  const more = row.count > 1 ? ` and ${row.count - 1} more` : '';
  const where = row.slideId !== undefined ? ` on slide ${row.slideId}` : '';
  switch (row.kind) {
    case 'mention':
      return `${who} mentioned you${where}${more}`;
    case 'reply':
      return `${who} replied${where}${more}`;
    case 'assigned':
      return `${who} assigned you a comment${where}`;
    case 'resolved':
      return `${who} resolved a comment${where}`;
    case 'reopened':
      return `${who} reopened a comment${where}`;
    case 'reaction':
      return `${who} reacted to your comment${where}${more}`;
    case 'accessRequest':
      return `${who} asked for access to ${row.deckId}`;
    case 'granted':
      return `${who} gave you access to ${row.deckId}`;
    case 'versionNamed':
      return `${who} named a version of ${row.deckId}`;
    case 'comment':
      return `${who} commented${where}${more}`;
    default:
      return `${who}: ${row.kind}`;
  }
}

export async function notifications(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  if (sub === 'read') {
    const all = flagBoolean(ctx.args, 'all');
    const ids = rest;
    if (!all && ids.length === 0)
      throw new UsageError(`notifications read wants ids or --all\n${NOTIFICATIONS_USAGE}`);
    const result = await runDeckAction<{ unread: number }>(
      ctx,
      'notification.markRead',
      all ? { all: true } : { ids },
    );
    ctx.out.result(result);
    ctx.out.human(`${result.unread} unread`);
    return 0;
  }
  if (sub === 'settings') {
    const levelFlag = flagString(ctx.args, 'level');
    const level = levelFlag === undefined ? undefined : LEVELS[levelFlag];
    if (levelFlag !== undefined && level === undefined)
      throw new UsageError(`--level wants all, for-you or none\n${NOTIFICATIONS_USAGE}`);
    const email = boolFlag(ctx, 'email');
    const activity = boolFlag(ctx, 'activity-for-commenters');
    const result = await runDeckAction<{
      level: string;
      email: boolean;
      activityForCommenters: boolean;
    }>(ctx, 'notification.settings', {
      ...(level !== undefined ? { level } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(activity !== undefined ? { activityForCommenters: activity } : {}),
    });
    ctx.out.result(result);
    const words: Record<string, string> = {
      all: 'All comments',
      forYou: 'Comments for you',
      none: 'None',
    };
    ctx.out.human(
      `${words[result.level] ?? result.level}; email ${result.email ? 'on' : 'off'}; activity for commenters ${result.activityForCommenters ? 'on' : 'off'}`,
    );
    return 0;
  }
  if (sub !== undefined)
    throw new UsageError(`unknown subcommand "notifications ${sub}"\n${NOTIFICATIONS_USAGE}`);
  const since = flagString(ctx.args, 'since');
  const result = await runDeckAction<{ notifications: Notification[]; unread: number }>(
    ctx,
    'notification.list',
    {
      ...(flagBoolean(ctx.args, 'unread') ? { unread: true } : {}),
      ...(since !== undefined ? { since } : {}),
      ...(flagString(ctx.args, 'limit') !== undefined
        ? { limit: flagNumber(ctx.args, 'limit', 100) }
        : {}),
    },
  );
  ctx.out.result(result);
  if (result.notifications.length === 0)
    ctx.out.human(`no notifications (${result.unread} unread)`);
  for (const row of result.notifications) {
    ctx.out.human(
      `${row.readAt === undefined ? '*' : ' '} ${row.id}  ${row.updatedAt}  ${sentence(row)}`,
    );
  }
  void flagAll;
  return 0;
}
