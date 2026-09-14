// The comment commands (gslides-parity SPEC-3 5.9, 12): `comment add <anchor> -m <text>`, reply,
// edit, delete, resolve, reopen, assign, done, react, get and link on one thread, and `comments`
// for the list. The anchor grammar is SPEC-3 5.9's: `deck`, `slide:<id>`, `<slide>#<block>`,
// `<slide>#<block>/<path>:<start>-<end>` (a plain text range whose quote the document supplies),
// `<slide>#<block>/cell:<r>,<c>` and `notes:<slide>`. `<who>` is a principal id (`local:<name>`,
// `usr_…`, `anon_…`, `agent:<tokenId>`), a bare name for a checkout principal, or an email for an
// invitation. Every write runs through the dispatcher, on the checkout's sidecar or on the studio
// `--to` names.
import type { CommentAnchor, Emoji, Mention } from '@turboslide/schema/comments';
import { EMOJI_PALETTE } from '@turboslide/schema/comments';
import { parseBlockAddress } from '@turboslide/schema/ids';

import { flagAll, flagBoolean, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import type { PlacedThread, ThreadResult } from '../records/comments.ts';
import { requirePositional } from '../write.ts';

export const COMMENT_USAGE = `usage: turboslide comment <add|reply|edit|delete|resolve|reopen|assign|done|react|get|link> ...
  comment add <anchor> -m <text> [--mention <who>]... [--assign <who>]
                                    a thread at an anchor (comment.add)
  comment reply <threadId> -m <text> [--mention <who>]...
                                    a reply (comment.reply)
  comment edit <threadId> <commentId> -m <text> [--expected <updatedAt>]
                                    the author rewrites a comment (comment.edit)
  comment delete <threadId> <commentId> [--restore]
                                    a tombstone that keeps the replies; --restore within 30 days (comment.delete)
  comment resolve <threadId> | comment reopen <threadId> | comment done <threadId>
                                    (comment.resolve, comment.reopen, comment.done)
  comment assign <threadId> <who> | comment assign <threadId> --clear
                                    (comment.assign)
  comment react <threadId> <commentId> <emoji> [--off]
                                    a reaction from the palette (comment.react)
  comment get <threadId> | comment link <threadId>
                                    (comment.get, comment.link)
  comments [<slideId>] [--block <blockId>] [--state open|resolved|all] [--for-me] [--author-id <who>]
           [--search <text>] [--since <n>] [--include-deleted] [--limit <n>]
                                    the threads with their anchors resolved (comment.list)
Anchors: deck, slide:<id>, <slide>#<block>, <slide>#<block>/<path>:<start>-<end>, <slide>#<block>/cell:<r>,<c>, notes:<slide>.
Every command takes --to <studio> to run on a hosted deck, --author <name> and --json.`;

/** The anchor grammar of SPEC-3 5.9. */
export function parseAnchor(text: string): CommentAnchor {
  if (text === 'deck') return { kind: 'deck' };
  const slide = /^slide:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(text);
  if (slide?.[1] !== undefined) return { kind: 'slide', slideId: slide[1] };
  const notes = /^notes:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(text);
  if (notes?.[1] !== undefined) return { kind: 'notes', slideId: notes[1] };
  const hash = text.indexOf('#');
  if (hash < 0) throw new UsageError(`"${text}" is not an anchor\n${COMMENT_USAGE}`);
  const slash = text.indexOf('/', hash);
  const address = slash < 0 ? text : text.slice(0, slash);
  let slideId: string;
  let blockId: string;
  try {
    ({ slideId, blockId } = parseBlockAddress(address));
  } catch (error) {
    throw new UsageError(
      `${error instanceof Error ? error.message : String(error)}\n${COMMENT_USAGE}`,
    );
  }
  if (slash < 0) return { kind: 'block', slideId, blockId };
  const rest = text.slice(slash);
  const cell = /^\/cell:(\d+),(\d+)$/.exec(rest);
  if (cell !== null)
    return { kind: 'cell', slideId, blockId, cell: [Number(cell[1]), Number(cell[2])] };
  const range = /^(\/.+):(\d+)-(\d+)$/.exec(rest);
  if (range?.[1] !== undefined) {
    const start = Number(range[2]);
    const end = Number(range[3]);
    if (end < start)
      throw new UsageError(`the range ${start}-${end} ends before it starts\n${COMMENT_USAGE}`);
    // the quoted text is read from the document by the action
    return { kind: 'text', slideId, blockId, path: range[1], range: [start, end], quoted: '' };
  }
  throw new UsageError(`"${text}" is not an anchor\n${COMMENT_USAGE}`);
}

/** `<who>`: a principal id, a bare checkout name, or an email (an invitation). */
export function parseWho(text: string): Mention {
  const trimmed = text.trim();
  if (trimmed === '')
    throw new UsageError('a person is named by a principal id, a name or an email');
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed))
    return { kind: 'invite', inviteId: trimmed.toLowerCase() };
  if (/^(anon_|usr_|agent:|local:)/.test(trimmed))
    return { kind: 'principal', principalId: trimmed };
  return { kind: 'principal', principalId: `local:${trimmed}` };
}

/** The body: the text with the mentions appended as `{@n}` tokens when the text does not name them. */
export function bodyOf(ctx: CommandContext): { text: string; mentions: Mention[] } {
  const text = flagString(ctx.args, 'm') ?? flagString(ctx.args, 'message');
  if (text === undefined || text.trim() === '')
    throw new UsageError(`the comment needs -m <text>\n${COMMENT_USAGE}`);
  const mentions = flagAll(ctx.args, 'mention').map(parseWho);
  let body = text;
  mentions.forEach((_mention, index) => {
    if (!body.includes(`{@${index}}`)) body = `${body} {@${index}}`;
  });
  return { text: body, mentions };
}

function printThread(ctx: CommandContext, verb: string, result: ThreadResult): void {
  ctx.out.result(result);
  const thread = result.thread;
  const where = 'slideId' in thread.anchor ? `slide ${thread.anchor.slideId}` : 'the deck';
  ctx.out.human(
    `${verb} ${thread.id} on ${where}: ${thread.replies.length} repl${thread.replies.length === 1 ? 'y' : 'ies'}${thread.resolved ? ', resolved' : ''}; comments revision ${result.commentsRevision}`,
  );
}

export async function comment(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  const base = flagString(ctx.args, 'base-revision');
  const baseRevision = base === undefined ? {} : { baseRevision: Number(base) };
  switch (sub) {
    case 'add': {
      const anchor = parseAnchor(requirePositional(inner, 0, COMMENT_USAGE));
      const assign = flagString(ctx.args, 'assign');
      const result = await runDeckAction<ThreadResult>(ctx, 'comment.add', {
        anchor,
        body: bodyOf(ctx),
        ...(assign !== undefined ? { assignee: parseWho(assign) } : {}),
        ...baseRevision,
      });
      printThread(ctx, 'commented', result);
      return 0;
    }
    case 'reply': {
      const threadId = requirePositional(inner, 0, COMMENT_USAGE);
      const result = await runDeckAction<ThreadResult>(ctx, 'comment.reply', {
        threadId,
        body: bodyOf(ctx),
        ...baseRevision,
      });
      printThread(ctx, 'replied on', result);
      return 0;
    }
    case 'edit': {
      const threadId = requirePositional(inner, 0, COMMENT_USAGE);
      const commentId = requirePositional(inner, 1, COMMENT_USAGE);
      let expected = flagString(ctx.args, 'expected');
      if (expected === undefined) {
        const current = await runDeckAction<{ thread: PlacedThread }>(ctx, 'comment.get', {
          threadId,
        });
        expected = current.thread.updatedAt;
      }
      const result = await runDeckAction<ThreadResult>(ctx, 'comment.edit', {
        threadId,
        commentId,
        body: bodyOf(ctx),
        expectedUpdatedAt: expected,
        ...baseRevision,
      });
      printThread(ctx, 'edited', result);
      return 0;
    }
    case 'delete': {
      const threadId = requirePositional(inner, 0, COMMENT_USAGE);
      const commentId = requirePositional(inner, 1, COMMENT_USAGE);
      const restore = flagBoolean(ctx.args, 'restore');
      const result = await runDeckAction<ThreadResult>(ctx, 'comment.delete', {
        threadId,
        commentId,
        ...(restore ? { restore: true } : {}),
        ...baseRevision,
      });
      printThread(ctx, restore ? 'restored in' : 'deleted in', result);
      return 0;
    }
    case 'resolve':
    case 'reopen':
    case 'done': {
      const threadId = requirePositional(inner, 0, COMMENT_USAGE);
      const id =
        sub === 'resolve'
          ? 'comment.resolve'
          : sub === 'reopen'
            ? 'comment.reopen'
            : 'comment.done';
      const result = await runDeckAction<ThreadResult>(ctx, id, { threadId, ...baseRevision });
      printThread(
        ctx,
        sub === 'resolve' ? 'resolved' : sub === 'reopen' ? 'reopened' : 'marked done',
        result,
      );
      return 0;
    }
    case 'assign': {
      const threadId = requirePositional(inner, 0, COMMENT_USAGE);
      const clear = flagBoolean(ctx.args, 'clear');
      const who = inner.rest[1];
      if (!clear && who === undefined)
        throw new UsageError(`comment assign wants <who> or --clear\n${COMMENT_USAGE}`);
      const result = await runDeckAction<ThreadResult>(ctx, 'comment.assign', {
        threadId,
        assignee: clear || who === undefined ? null : parseWho(who),
        ...baseRevision,
      });
      printThread(ctx, clear ? 'unassigned' : 'assigned', result);
      return 0;
    }
    case 'react': {
      const threadId = requirePositional(inner, 0, COMMENT_USAGE);
      const commentId = requirePositional(inner, 1, COMMENT_USAGE);
      const emoji = requirePositional(inner, 2, COMMENT_USAGE);
      if (!(EMOJI_PALETTE as ReadonlyArray<string>).includes(emoji)) {
        throw new UsageError(`"${emoji}" is not in the palette: ${EMOJI_PALETTE.join(' ')}`);
      }
      const result = await runDeckAction<ThreadResult>(ctx, 'comment.react', {
        threadId,
        commentId,
        emoji: emoji as Emoji,
        on: !flagBoolean(ctx.args, 'off'),
        ...baseRevision,
      });
      printThread(ctx, 'reacted on', result);
      return 0;
    }
    case 'get': {
      const threadId = requirePositional(inner, 0, COMMENT_USAGE);
      const result = await runDeckAction<{ thread: PlacedThread; commentsRevision: number }>(
        ctx,
        'comment.get',
        { threadId },
      );
      ctx.out.result(result);
      printPlaced(ctx, result.thread);
      return 0;
    }
    case 'link': {
      const threadId = requirePositional(inner, 0, COMMENT_USAGE);
      const result = await runDeckAction<{ url: string; viewUrl: string }>(ctx, 'comment.link', {
        threadId,
      });
      ctx.out.result(result);
      ctx.out.human(result.url);
      ctx.out.human(result.viewUrl);
      return 0;
    }
    default:
      throw new UsageError(`unknown subcommand "comment ${sub ?? ''}"\n${COMMENT_USAGE}`);
  }
}

function printPlaced(ctx: CommandContext, thread: PlacedThread): void {
  const where = thread.placement.orphaned
    ? `orphaned (${thread.placement.reason})`
    : 'slideId' in thread.anchor
      ? `slide ${thread.anchor.slideId}${'blockId' in thread.anchor ? `#${thread.anchor.blockId}` : ''}`
      : 'the deck';
  const state = thread.resolved !== undefined ? 'resolved' : 'open';
  const body = thread.comment.deleted !== undefined ? 'Comment deleted' : thread.comment.body.text;
  ctx.out.human(
    `${thread.id}  ${state.padEnd(8)} ${where}  ${thread.comment.author.label}: ${body}`,
  );
  for (const reply of thread.replies) {
    ctx.out.human(
      `  ${reply.id}  ${reply.author.label}: ${reply.deleted !== undefined ? 'Comment deleted' : reply.body.text}`,
    );
  }
}

/** `turboslide comments [<slideId>] ...` (comment.list). */
export async function comments(ctx: CommandContext): Promise<number> {
  const slideId = ctx.rest[0];
  const state = flagString(ctx.args, 'state');
  if (state !== undefined && state !== 'open' && state !== 'resolved' && state !== 'all') {
    throw new UsageError(`--state wants open, resolved or all\n${COMMENT_USAGE}`);
  }
  const author = flagString(ctx.args, 'author-id');
  const since = flagString(ctx.args, 'since');
  const input = {
    ...(slideId !== undefined ? { slideId } : {}),
    ...(flagString(ctx.args, 'block') !== undefined
      ? { blockId: flagString(ctx.args, 'block') }
      : {}),
    ...(state !== undefined ? { state } : {}),
    ...(flagBoolean(ctx.args, 'for-me') ? { forMe: true } : {}),
    ...(author !== undefined
      ? {
          author:
            parseWho(author).kind === 'principal'
              ? (parseWho(author) as { principalId: string }).principalId
              : author,
        }
      : {}),
    ...(flagString(ctx.args, 'search') !== undefined
      ? { search: flagString(ctx.args, 'search') }
      : {}),
    ...(flagBoolean(ctx.args, 'include-deleted') ? { includeDeleted: true } : {}),
    ...(since !== undefined ? { since: Number(since) } : {}),
    ...(flagString(ctx.args, 'limit') !== undefined
      ? { limit: flagNumber(ctx.args, 'limit', 200) }
      : {}),
  };
  const result = await runDeckAction<{
    threads: PlacedThread[];
    commentsRevision: number;
    total: number;
  }>(ctx, 'comment.list', input);
  ctx.out.result(result);
  if (result.threads.length === 0)
    ctx.out.human(`no ${state ?? 'open'} comments (comments revision ${result.commentsRevision})`);
  for (const thread of result.threads) printPlaced(ctx, thread);
  if (result.total > result.threads.length)
    ctx.out.human(`${result.total - result.threads.length} more; raise --limit`);
  return 0;
}
