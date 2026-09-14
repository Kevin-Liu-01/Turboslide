import { useState } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';

import type { CommentThreadView, EditorComments, IdentityView } from '../editor-shell';
import { cn } from '../lib/cn';
import { COMMENTS, INBOX } from '../menus/strings';
import { Panel } from '../Panel';
import { IdentityChip, nameOf, trustWordOf } from '../presence/IdentityChip';
import { slideNumberOf } from '../presence/presence-model';
import { tipProps } from '../Tooltip';
import { filterThreads, firstLine, shortTime, sortThreads } from './comments-model';
import type { CommentsFilter, CommentsOrder } from './comments-model';

import './comments.css';

/**
 * The Comments panel (gslides-parity SPEC-3 5.3; research 08 section 9): the right panel opened
 * by the title row's glyph and View > Comments > Show all comments, with a For you tab, a search
 * field ("Search all comments" by text or author), the filter All, Open, Resolved, open threads by
 * last activity newest first and resolved after them, and a "Slide order" toggle for a review
 * pass. Rows are a fixed height with tabular relative times: the author's 24 px chip, the name
 * and trust word, the slide number, the first line, the reply count; an orphaned thread lists
 * under its slide with its quoted text; a resolved thread offers "Re-open". A click opens the
 * thread's card on its slide. The foot links to Notification settings, Google's position.
 */
export type CommentsPanelProps = {
  comments: EditorComments;
  document: DeckDocument;
  me?: IdentityView;
  canComment: boolean;
  onOpen: (thread: CommentThreadView) => void;
  onNotificationSettings?: () => void;
  onClose: () => void;
  say: (text: string) => void;
};

export function CommentsPanel({
  comments,
  document,
  me,
  canComment,
  onOpen,
  onNotificationSettings,
  onClose,
  say,
}: CommentsPanelProps) {
  const [tab, setTab] = useState<'all' | 'forYou'>('all');
  const [filter, setFilter] = useState<CommentsFilter>('all');
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<CommentsOrder>('activity');
  const sorted = sortThreads(comments.threads, order, document);
  const rows = filterThreads(sorted, {
    filter,
    search,
    forMe: tab === 'forYou',
    ...(me === undefined ? {} : { me: me.principalId }),
  });
  const reopen = (thread: CommentThreadView) =>
    comments
      .reopen?.(thread.id)
      .catch((error: unknown) => say(error instanceof Error ? error.message : String(error)));

  return (
    <Panel
      title={COMMENTS.panel}
      count={comments.threads.filter((thread) => thread.resolved !== true).length}
      onClose={onClose}
      control="panel.comments"
      className="ts-comments-panel"
    >
      <div className="ts-comments-head">
        <div className="ts-comments-tabs" role="tablist" aria-label={COMMENTS.panel}>
          {(['all', 'forYou'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={cn('ts-dialog-tab', tab === value && 'is-on')}
              data-control={`panel.comments.tab.${value}`}
              onClick={() => setTab(value)}
              {...tipProps({
                name: value === 'all' ? COMMENTS.all : COMMENTS.forYou,
                doc:
                  value === 'all'
                    ? 'Every thread on this presentation'
                    : 'Threads that name you, that are yours, or that are assigned to you',
              })}
            >
              {value === 'all' ? COMMENTS.all : COMMENTS.forYou}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="ts-comments-search"
          value={search}
          placeholder={COMMENTS.search}
          aria-label={COMMENTS.search}
          data-control="panel.comments.search"
          onChange={(event) => setSearch(event.target.value)}
          {...tipProps({ name: COMMENTS.search, doc: 'By words or by who wrote them' })}
        />
        <div className="ts-comments-filters">
          <select
            className="ts-comments-filter"
            value={filter}
            aria-label="Filter"
            data-control="panel.comments.filter"
            onChange={(event) => setFilter(event.target.value as CommentsFilter)}
            {...tipProps({ name: 'Filter', doc: 'All, Open or Resolved threads' })}
          >
            <option value="all">{COMMENTS.all}</option>
            <option value="open">{COMMENTS.open}</option>
            <option value="resolved">{COMMENTS.resolved}</option>
          </select>
          <button
            type="button"
            className={cn('pt-ib is-text ts-comments-order', order === 'slide' && 'is-on')}
            aria-pressed={order === 'slide'}
            data-control="panel.comments.slideOrder"
            onClick={() => setOrder((o) => (o === 'slide' ? 'activity' : 'slide'))}
            {...tipProps({
              name: COMMENTS.slideOrder,
              doc: 'Open threads in the order of the slides, for a review pass',
            })}
          >
            <span className="pt-lb">{COMMENTS.slideOrder}</span>
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="ts-panel-empty">{tab === 'forYou' ? COMMENTS.emptyForYou : COMMENTS.empty}</p>
      ) : (
        <ul
          className="ts-comments-list"
          data-control="panel.comments.list"
          data-count={rows.length}
        >
          {rows.map((thread) => {
            const n = slideNumberOf(document, thread.anchor.slideId);
            const trust = trustWordOf(thread.comment.author);
            const open = comments.openThreadId === thread.id;
            return (
              <li
                key={thread.id}
                className={cn(
                  'ts-comments-row',
                  thread.resolved === true && 'is-resolved',
                  open && 'is-open',
                  thread.anchor.orphaned === true && 'is-orphan',
                )}
                data-control={`panel.comments.thread.${thread.id}`}
                data-thread={thread.id}
              >
                <button
                  type="button"
                  className="ts-comments-row-btn"
                  data-control={`panel.comments.open.${thread.id}`}
                  onClick={() => onOpen(thread)}
                  {...tipProps({
                    name: firstLine(thread) || COMMENTS.comment,
                    doc: n === null ? 'Opens the thread' : `Opens the thread on slide ${n}`,
                  })}
                >
                  <IdentityChip identity={thread.comment.author} size={24} />
                  <span className="ts-comments-row-text">
                    <span className="ts-comments-row-head">
                      <span className="ts-comments-row-name">{nameOf(thread.comment.author)}</span>
                      {trust !== null ? (
                        <span className="ts-comments-row-trust">{trust}</span>
                      ) : null}
                      {n !== null ? <span className="ts-comments-row-slide">slide {n}</span> : null}
                    </span>
                    <span className="ts-comments-row-line">
                      {thread.anchor.orphaned === true && thread.anchor.quote !== undefined
                        ? `“${thread.anchor.quote}” · `
                        : ''}
                      {firstLine(thread)}
                    </span>
                    <span className="ts-comments-row-meta">
                      {thread.replies.length === 0
                        ? ''
                        : thread.replies.length === 1
                          ? '1 reply'
                          : `${thread.replies.length} replies`}
                      {thread.anchor.orphaned === true
                        ? (thread.replies.length ? ' · ' : '') + COMMENTS.removedObject
                        : ''}
                    </span>
                  </span>
                  <time className="ts-comments-row-time" dateTime={thread.updatedAt}>
                    {shortTime(thread.updatedAt)}
                  </time>
                </button>
                {thread.resolved === true && canComment ? (
                  <button
                    type="button"
                    className="pt-ib is-text ts-comments-reopen"
                    data-control={`panel.comments.reopen.${thread.id}`}
                    onClick={() => void reopen(thread)}
                    {...tipProps({
                      name: COMMENTS.reopen,
                      doc: 'Opens the thread again on its slide',
                    })}
                  >
                    <span className="pt-lb">{COMMENTS.reopen}</span>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {onNotificationSettings ? (
        <div className="ts-comments-foot">
          <button
            type="button"
            className="pt-ib is-text"
            data-control="panel.comments.notificationSettings"
            onClick={onNotificationSettings}
            {...tipProps({ name: INBOX.settings, doc: 'All comments, Comments for you, or None' })}
          >
            <span className="pt-lb">{INBOX.settings}</span>
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
