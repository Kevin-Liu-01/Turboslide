import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { EMOJI_PALETTE } from '@turboslide/schema/comments';

import type {
  CommentAnchorView,
  CommentBodyInput,
  CommentThreadView,
  CommentView,
  EditorComments,
  IdentityView,
} from '../editor-shell';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { useMountEffect } from '../lib/useMountEffect';
import { focusableIn } from '../Dialog';
import { PlateMenu } from '../presence/PlateMenu';
import { COMMENTS } from '../menus/strings';
import { IdentityChip, nameOf, trustWordOf } from '../presence/IdentityChip';
import { tipProps } from '../Tooltip';
import { bodySegments, shortTime } from './comments-model';
import { ReplyBox } from './ReplyBox';

import './comments.css';

/**
 * The comment card (gslides-parity SPEC-3 5.3, 14; research 08 section 9, 11 6.8): a floating
 * layer beside the anchored object with the thread's comments (a 24 px chip, the name and trust
 * word, the tabular time, the body as text with the mentioned people's 14 px chips inline), the
 * Resolve tick at its top right ("Done" for the assignee), a More menu per comment (Edit for the
 * author, Delete for the author or the owner, Get link to this comment, Reassign), a reaction
 * button on hover with the 24 emoji palette, the reply box under the thread, and a tombstone with
 * Undo when the first comment is deleted. The card traps focus and answers the chords of section
 * 14 inside it: `j` and `k` move to the next and previous thread, `r` replies, `e` resolves, `u`
 * and Esc leave and return focus to the marker. A new thread renders the same card with the
 * comment box alone. No hue anywhere; every name is a text node.
 */
export type CommentCardProps = {
  /** the thread; null while a new comment is being written at `anchor` */
  thread: CommentThreadView | null;
  anchor: CommentAnchorView;
  comments: EditorComments;
  me?: IdentityView;
  /** the caller may write comments (a commenter, an editor, the owner) */
  canComment: boolean;
  /** the caller owns the deck: Delete on every comment */
  owner?: boolean;
  /** the caller may name grantees and addresses (an editor or the owner) */
  canInvite?: boolean;
  onClose: () => void;
  onStep: (direction: 1 | -1) => void;
  say: (text: string, action?: { label: string; run: () => void }) => void;
  /** where the card sits, in CSS pixels inside the overlay */
  style?: { left: number; top: number };
  control?: string;
};

function Body({ comment }: { comment: CommentView }) {
  if (comment.deleted === true)
    return <span className="ts-comment-deleted">{COMMENTS.deleted}</span>;
  return (
    <>
      {bodySegments(comment).map((segment, i) =>
        segment.kind === 'text' ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <span
            key={i}
            className="ts-comment-mention"
            data-principal={segment.identity.principalId}
          >
            <IdentityChip identity={segment.identity} size={14} />
            <span>{nameOf(segment.identity)}</span>
          </span>
        ),
      )}
    </>
  );
}

type CommentRowProps = {
  thread: CommentThreadView;
  comment: CommentView;
  first: boolean;
  comments: EditorComments;
  me?: IdentityView;
  owner: boolean;
  canComment: boolean;
  canInvite: boolean;
  mentionables: readonly IdentityView[];
  say: CommentCardProps['say'];
  control: string;
};

function CommentRow({
  thread,
  comment,
  first,
  comments,
  me,
  owner,
  canComment,
  canInvite,
  mentionables,
  say,
  control,
}: CommentRowProps) {
  const [more, setMore] = useState<HTMLElement | null>(null);
  const [palette, setPalette] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [reassign, setReassign] = useState(false);
  const mine = me !== undefined && comment.author.principalId === me.principalId;
  const trust = trustWordOf(comment.author);
  const reactions = Object.entries(comment.reactions ?? {}).filter(([, who]) => who.length > 0);
  const run = (promise: Promise<unknown> | undefined, done?: string) => {
    promise
      ?.then(() => (done === undefined ? undefined : say(done)))
      .catch((error: unknown) => say(error instanceof Error ? error.message : String(error)));
  };
  const remove = () => {
    setMore(null);
    run(comments.remove?.(thread.id, comment.id), undefined);
    say(COMMENTS.deleted, {
      label: COMMENTS.undo,
      run: () => run(comments.remove?.(thread.id, comment.id, true)),
    });
  };
  const link = () => {
    setMore(null);
    comments
      .link?.(thread.id)
      .then(({ url }) =>
        navigator.clipboard
          .writeText(url)
          .then(() => say(COMMENTS.linkCopied))
          .catch(() => say(url)),
      )
      .catch((error: unknown) => say(error instanceof Error ? error.message : String(error)));
  };
  return (
    <div
      className={cn('ts-comment', first && 'is-first', comment.deleted === true && 'is-deleted')}
      data-control={control}
      data-comment={comment.id}
    >
      <div className="ts-comment-head">
        <IdentityChip identity={comment.author} size={24} />
        <span className="ts-comment-who">
          <span className="ts-comment-name">{nameOf(comment.author)}</span>
          {trust !== null ? <span className="ts-comment-trust">{trust}</span> : null}
        </span>
        <time className="ts-comment-time" dateTime={comment.createdAt}>
          {shortTime(comment.createdAt)}
          {comment.editedAt !== undefined ? ' · edited' : ''}
        </time>
        {canComment && comment.deleted !== true ? (
          <button
            type="button"
            className="pt-ib pt-icon ts-comment-react"
            data-control={`${control}.react`}
            aria-haspopup="menu"
            aria-expanded={palette !== null}
            onClick={(event) => setPalette((open) => (open === null ? event.currentTarget : null))}
            {...tipProps({
              name: COMMENTS.addReaction,
              doc: 'One of 24; click yours again to remove it',
            })}
          >
            <span aria-hidden="true">☺</span>
          </button>
        ) : null}
        {comment.deleted !== true && (mine || owner || canInvite || comments.link) ? (
          <button
            type="button"
            className="pt-ib pt-icon ts-comment-more"
            data-control={`${control}.more`}
            aria-haspopup="menu"
            aria-expanded={more !== null}
            aria-label={COMMENTS.more}
            onClick={(event) => setMore((open) => (open === null ? event.currentTarget : null))}
            {...tipProps({ name: COMMENTS.more, doc: 'Edit, Delete, Get link to this comment' })}
          >
            <Icon name="ellipsis-vertical" />
          </button>
        ) : null}
      </div>
      {editing ? (
        <ReplyBox
          placeholder={COMMENTS.placeholder}
          submitLabel={COMMENTS.edit}
          mentionables={mentionables}
          canInvite={canInvite}
          initialText={comment.text}
          autoFocus
          control={`${control}.edit`}
          onCancel={() => setEditing(false)}
          onSubmit={(body: CommentBodyInput) => {
            setEditing(false);
            run(comments.edit?.(thread.id, comment.id, body));
          }}
        />
      ) : (
        <p className="ts-comment-body">
          <Body comment={comment} />
        </p>
      )}
      {reactions.length > 0 ? (
        <div className="ts-comment-reactions">
          {reactions.map(([emoji, who]) => {
            const mineToo = me !== undefined && who.includes(me.principalId);
            return (
              <button
                key={emoji}
                type="button"
                className={cn('ts-comment-reaction', mineToo && 'is-mine')}
                data-control={`${control}.reaction.${emoji}`}
                aria-pressed={mineToo}
                disabled={!canComment}
                onClick={() => run(comments.react?.(thread.id, comment.id, emoji, !mineToo))}
                {...tipProps({
                  name: `${emoji} ${who.length}`,
                  doc: mineToo ? 'Click to remove your reaction' : 'Click to react the same way',
                })}
              >
                <span aria-hidden="true">{emoji}</span>
                <span className="ts-comment-reaction-count">{who.length}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {palette !== null ? (
        <PlateMenu
          anchor={palette}
          label={COMMENTS.addReaction}
          onClose={() => setPalette(null)}
          width={232}
          className="ts-emoji-palette"
          control={`${control}.palette`}
        >
          {EMOJI_PALETTE.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              className="ts-emoji"
              data-control={`${control}.emoji.${emoji}`}
              onClick={() => {
                setPalette(null);
                run(comments.react?.(thread.id, comment.id, emoji, true));
              }}
              {...tipProps({ name: emoji })}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </PlateMenu>
      ) : null}
      {more !== null ? (
        <PlateMenu
          anchor={more}
          label={COMMENTS.more}
          onClose={() => setMore(null)}
          width={220}
          control={`${control}.menu`}
        >
          {mine ? (
            <button
              type="button"
              role="menuitem"
              className="ts-roster-row is-plain"
              data-control={`${control}.menu.edit`}
              onClick={() => {
                setMore(null);
                setEditing(true);
              }}
              {...tipProps({
                name: COMMENTS.edit,
                doc: 'Changes your words; the time reads edited',
              })}
            >
              <span className="ts-roster-name">{COMMENTS.edit}</span>
            </button>
          ) : null}
          {mine || owner ? (
            <button
              type="button"
              role="menuitem"
              className="ts-roster-row is-plain"
              data-control={`${control}.menu.delete`}
              onClick={remove}
              {...tipProps({
                name: COMMENTS.delete,
                doc: 'The replies stay; Undo brings it back within 30 days',
              })}
            >
              <span className="ts-roster-name">{COMMENTS.delete}</span>
            </button>
          ) : null}
          {first && canInvite ? (
            <button
              type="button"
              role="menuitem"
              className="ts-roster-row is-plain"
              data-control={`${control}.menu.reassign`}
              onClick={() => {
                setMore(null);
                setReassign(true);
              }}
              {...tipProps({ name: COMMENTS.reassign, doc: 'Gives the thread to someone else' })}
            >
              <span className="ts-roster-name">{COMMENTS.reassign}</span>
            </button>
          ) : null}
          {comments.link ? (
            <button
              type="button"
              role="menuitem"
              className="ts-roster-row is-plain"
              data-control={`${control}.menu.link`}
              onClick={link}
              {...tipProps({
                name: COMMENTS.getLink,
                doc: 'Copies a link that opens this slide with the thread expanded',
              })}
            >
              <span className="ts-roster-name">{COMMENTS.getLink}</span>
            </button>
          ) : null}
        </PlateMenu>
      ) : null}
      {reassign ? (
        <ReplyBox
          placeholder={COMMENTS.reassign}
          submitLabel={COMMENTS.reassign}
          mentionables={mentionables}
          canInvite={canInvite}
          assignable
          autoFocus
          control={`${control}.reassign`}
          onCancel={() => setReassign(false)}
          onSubmit={(_body, assignee) => {
            setReassign(false);
            if (assignee !== null) run(comments.assign?.(thread.id, assignee));
          }}
        />
      ) : null}
    </div>
  );
}

export function CommentCard({
  thread,
  anchor,
  comments,
  me,
  canComment,
  owner = false,
  canInvite = false,
  onClose,
  onStep,
  say,
  style,
  control = 'comment.card',
}: CommentCardProps) {
  const root = useRef<HTMLDivElement>(null);
  const [replying, setReplying] = useState(false);
  const mentionables = comments.mentionables ?? [];
  const assigned =
    thread?.assignee?.principalId !== undefined && me?.principalId === thread.assignee.principalId;

  useMountEffect(() => {
    const el = root.current;
    if (!el) return;
    const first = focusableIn(el)[0];
    (first ?? el).focus();
  });

  /* the open thread changed under the card: focus its root so the chords keep working */
  useEffect(() => {
    setReplying(false);
  }, [thread?.id]);

  const run = (promise: Promise<unknown> | undefined) =>
    promise?.catch((error: unknown) => say(error instanceof Error ? error.message : String(error)));

  const resolve = () => {
    if (!thread) return;
    if (thread.resolved === true) run(comments.reopen?.(thread.id));
    else if (assigned && comments.done) run(comments.done(thread.id));
    else run(comments.resolve?.(thread.id));
  };

  /* the chords inside a card (section 14): j, k, r, e, u and Esc, outside the editor's map */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    const inField = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (inField || event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key) {
      case 'j':
        event.preventDefault();
        onStep(1);
        return;
      case 'k':
        event.preventDefault();
        onStep(-1);
        return;
      case 'r':
        if (thread && canComment) {
          event.preventDefault();
          setReplying(true);
        }
        return;
      case 'e':
        if (thread && canComment) {
          event.preventDefault();
          resolve();
        }
        return;
      case 'u':
        event.preventDefault();
        onClose();
        return;
      default:
        return;
    }
  };

  let head: ReactNode = null;
  if (thread) {
    const tickLabel =
      thread.resolved === true ? COMMENTS.reopen : assigned ? COMMENTS.done : COMMENTS.resolve;
    head = canComment ? (
      <button
        type="button"
        className={cn(
          'pt-ib pt-icon ts-comment-resolve',
          thread.resolved === true && 'is-resolved',
        )}
        data-control={`${control}.resolve`}
        aria-label={tickLabel}
        onClick={resolve}
        {...tipProps({
          name: tickLabel,
          doc:
            thread.resolved === true
              ? 'Opens the thread again'
              : 'Closes the thread; it stays in the panel',
          key: 'E',
        })}
      >
        <Icon name={thread.resolved === true ? 'arrow-uturn-left' : 'check'} />
      </button>
    ) : null;
  }

  return (
    <div
      ref={root}
      className={cn(
        'ts-comment-card ts-chrome',
        thread === null && 'is-new',
        thread?.resolved === true && 'is-resolved',
      )}
      role="dialog"
      aria-label={
        thread === null ? COMMENTS.comment : `${COMMENTS.comment}: ${nameOf(thread.comment.author)}`
      }
      tabIndex={-1}
      data-control={control}
      data-thread={thread?.id}
      data-anchor={anchor.kind}
      style={style}
      onKeyDown={onKeyDown}
    >
      <div className="ts-comment-card-head">
        {thread?.anchor.orphaned === true ? (
          <span className="ts-comment-orphan">{COMMENTS.removedObject}</span>
        ) : thread?.anchor.kind === 'text' && thread.anchor.quote !== undefined ? (
          <q className="ts-comment-quote">{thread.anchor.quote}</q>
        ) : (
          <span />
        )}
        <span className="ts-comment-card-tools">
          {head}
          <button
            type="button"
            className="pt-ib pt-icon ts-comment-close"
            data-control={`${control}.close`}
            aria-label="Close"
            onClick={onClose}
            {...tipProps({ name: 'Close', key: 'Esc' })}
          >
            <Icon name="close" />
          </button>
        </span>
      </div>
      {thread ? (
        <div className="ts-comment-list pt-scroll">
          <CommentRow
            thread={thread}
            comment={thread.comment}
            first
            comments={comments}
            me={me}
            owner={owner}
            canComment={canComment}
            canInvite={canInvite}
            mentionables={mentionables}
            say={say}
            control={`${control}.first`}
          />
          {thread.assignee ? (
            <p className="ts-comment-assignee" data-control={`${control}.assignee`}>
              <IdentityChip identity={thread.assignee} size={14} />
              <span>{COMMENTS.assignTo(nameOf(thread.assignee))}</span>
            </p>
          ) : null}
          {thread.replies.map((reply, i) => (
            <CommentRow
              key={reply.id}
              thread={thread}
              comment={reply}
              first={false}
              comments={comments}
              me={me}
              owner={owner}
              canComment={canComment}
              canInvite={canInvite}
              mentionables={mentionables}
              say={say}
              control={`${control}.reply.${i}`}
            />
          ))}
        </div>
      ) : null}
      {thread === null && canComment ? (
        <ReplyBox
          placeholder={COMMENTS.placeholder}
          submitLabel={COMMENTS.comment}
          mentionables={mentionables}
          canInvite={canInvite}
          assignable
          autoFocus
          control={`${control}.new`}
          onCancel={onClose}
          onSubmit={(body, assignee) => {
            run(comments.add?.({ anchor, body, assignee }));
            onClose();
          }}
        />
      ) : null}
      {thread !== null && canComment ? (
        replying ? (
          <ReplyBox
            placeholder={COMMENTS.replyPlaceholder}
            submitLabel={COMMENTS.reply}
            mentionables={mentionables}
            canInvite={canInvite}
            assignable
            autoFocus
            control={`${control}.replyBox`}
            onCancel={() => setReplying(false)}
            onSubmit={(body, assignee) => {
              setReplying(false);
              run(comments.reply?.(thread.id, body));
              if (assignee !== null) run(comments.assign?.(thread.id, assignee));
            }}
          />
        ) : (
          <button
            type="button"
            className="ts-comment-reply-open"
            data-control={`${control}.reply`}
            onClick={() => setReplying(true)}
            {...tipProps({ name: COMMENTS.reply, doc: COMMENTS.replyPlaceholder, key: 'R' })}
          >
            {COMMENTS.replyPlaceholder}
          </button>
        )
      ) : null}
      {thread !== null && !canComment ? (
        <p className="ts-comment-readonly">{COMMENTS.readOnly}</p>
      ) : null}
    </div>
  );
}
