import type {
  Comment,
  CommentAnchor,
  CommentAuthor,
  CommentBody,
  CommentOp,
  Emoji,
  Mention,
  Thread,
} from '@turboslide/schema/comments';
import {
  anchorSlideId,
  applyCommentOp,
  quotedTextOf,
  readableThread,
  resolveAnchor,
} from '@turboslide/schema/comments';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { Author } from '@turboslide/schema/mutations';

/**
 * The comments and the inbox of the presentation in the hero (docs/SITE.md C.4): the threads in
 * memory, every op applied through the schema's reducer (`applyCommentOp`, the one implementation
 * the CLI and the server use), anchors placed and resolved against the tab room's live document.
 * The inbox is empty: notifications are mail and the server's. Nothing leaves the tab.
 */
export type TabComments = {
  /** runs one `comment.*` or `notification.*` action as `author`; answers the server's shapes */
  run: (action: string, input: unknown, author: Author) => unknown;
  /** the comments' revision */
  revision: () => number;
  /** the op the last write landed, once, for the room's comment entry; null after a read */
  takeOp: () => CommentOp | null;
};

const ULID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** A 26 character lower case ULID (comments.ts ULID_PATTERN): ten time characters, sixteen random. */
function tabUlid(now: number = Date.now()): string {
  let time = now;
  let head = '';
  for (let i = 0; i < 10; i += 1) {
    head = ULID_ALPHABET.charAt(time % 32) + head;
    time = Math.floor(time / 32);
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let tail = '';
  for (const byte of bytes) tail += ULID_ALPHABET.charAt(byte % 32);
  return head + tail;
}

function authorOf(author: Author): CommentAuthor {
  return {
    principalId: author.principalId ?? `local:${author.name}`,
    label: author.name,
    kind: author.kind === 'agent' ? 'agent' : 'human',
  };
}

type AddInput = { anchor: CommentAnchor; body: CommentBody; assignee?: Mention };
type ThreadInput = { threadId: string };
type ListInput = {
  slideId?: string;
  state?: 'open' | 'resolved' | 'all';
  includeDeleted?: boolean;
  limit?: number;
};

export function tabComments(document: () => DeckDocument): TabComments {
  const threads = new Map<string, Thread>();
  let revision = 0;
  let lastOp: CommentOp | null = null;
  const stamp = (): string => new Date().toISOString();

  const land = (
    thread: Thread | undefined,
    op: CommentOp,
  ): { thread: Thread; commentsRevision: number } => {
    revision += 1;
    lastOp = op;
    const next = applyCommentOp(thread, op, stamp(), revision);
    threads.set(next.id, next);
    return { thread: next, commentsRevision: revision };
  };
  const existing = (threadId: string): Thread => {
    const thread = threads.get(threadId);
    if (thread === undefined) throw new RangeError(`no thread ${threadId}`);
    return thread;
  };
  const placed = (thread: Thread, includeDeleted: boolean) => ({
    ...readableThread(thread, { includeDeleted }),
    placement: resolveAnchor(document(), thread.anchor),
  });

  const run = (action: string, raw: unknown, author: Author): unknown => {
    const me = authorOf(author);
    const at = stamp();
    switch (action) {
      case 'comment.add': {
        const input = raw as AddInput;
        const anchor =
          input.anchor.kind === 'text' && input.anchor.quoted === ''
            ? { ...input.anchor, quoted: quotedTextOf(document(), input.anchor) }
            : input.anchor;
        const id = tabUlid();
        return land(undefined, {
          op: 'add',
          thread: {
            id,
            deckId: document().deck.id,
            anchor,
            comment: { id, author: me, createdAt: at, body: input.body },
            replies: [],
            ...(input.assignee === undefined
              ? {}
              : { assignee: { to: input.assignee, by: me.principalId, at } }),
            createdAt: at,
            updatedAt: at,
            revision: 0,
          },
        });
      }
      case 'comment.reply': {
        const input = raw as ThreadInput & { body: CommentBody };
        const comment: Comment = { id: tabUlid(), author: me, createdAt: at, body: input.body };
        return land(existing(input.threadId), { op: 'reply', threadId: input.threadId, comment });
      }
      case 'comment.edit': {
        const input = raw as ThreadInput & {
          commentId: string;
          body: CommentBody;
          expectedUpdatedAt?: string;
        };
        return land(existing(input.threadId), {
          op: 'edit',
          threadId: input.threadId,
          commentId: input.commentId,
          body: input.body,
          editedAt: at,
          by: me.principalId,
          ...(input.expectedUpdatedAt === undefined
            ? {}
            : { expectedUpdatedAt: input.expectedUpdatedAt }),
        });
      }
      case 'comment.delete': {
        const input = raw as ThreadInput & { commentId: string; restore?: boolean };
        return land(existing(input.threadId), {
          op: 'delete',
          threadId: input.threadId,
          commentId: input.commentId,
          at,
          by: me.principalId,
          ...(input.restore === true ? { restore: true as const } : {}),
        });
      }
      case 'comment.resolve':
      case 'comment.reopen':
      case 'comment.done': {
        const input = raw as ThreadInput;
        const op =
          action === 'comment.resolve'
            ? 'resolve'
            : action === 'comment.reopen'
              ? 'reopen'
              : 'done';
        return land(existing(input.threadId), {
          op,
          threadId: input.threadId,
          at,
          by: me.principalId,
        });
      }
      case 'comment.assign': {
        const input = raw as ThreadInput & { assignee: Mention | null };
        return land(existing(input.threadId), {
          op: 'assign',
          threadId: input.threadId,
          to: input.assignee,
          at,
          by: me.principalId,
        });
      }
      case 'comment.react': {
        const input = raw as ThreadInput & { commentId: string; emoji: Emoji; on: boolean };
        return land(existing(input.threadId), {
          op: input.on ? 'react' : 'unreact',
          threadId: input.threadId,
          commentId: input.commentId,
          emoji: input.emoji,
          principalId: me.principalId,
        });
      }
      case 'comment.get': {
        const input = raw as ThreadInput;
        return { thread: placed(existing(input.threadId), false), commentsRevision: revision };
      }
      case 'comment.list': {
        const input = (raw ?? {}) as ListInput;
        const state = input.state ?? 'open';
        const rows = [...threads.values()]
          .filter((thread) =>
            input.slideId === undefined ? true : anchorSlideId(thread.anchor) === input.slideId,
          )
          .filter((thread) =>
            state === 'all'
              ? true
              : state === 'open'
                ? thread.resolved === undefined
                : thread.resolved !== undefined,
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
        return {
          threads: rows
            .slice(0, input.limit ?? 200)
            .map((thread) => placed(thread, input.includeDeleted === true)),
          commentsRevision: revision,
          total: rows.length,
        };
      }
      case 'notification.list':
        return { notifications: [], unread: 0 };
      case 'notification.markRead':
        return { unread: 0 };
      case 'notification.settings':
        return { level: 'all', email: false, activityForCommenters: false };
      default:
        throw new RangeError(`${action} has no answer in this tab`);
    }
  };
  return {
    run,
    revision: () => revision,
    takeOp: () => {
      const op = lastOp;
      lastOp = null;
      return op;
    },
  };
}
