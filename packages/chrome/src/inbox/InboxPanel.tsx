import type { DeckDocument } from '@turboslide/schema/deck';

import type { EditorInbox, InboxItemView } from '../editor-shell';
import { cn } from '../lib/cn';
import { INBOX } from '../menus/strings';
import { Panel } from '../Panel';
import { IdentityChip } from '../presence/IdentityChip';
import { shortTime } from '../comments/comments-model';
import { tipProps } from '../Tooltip';
import { inboxSentence, sortInbox } from './inbox-model';

import './inbox.css';

/**
 * The Notifications panel (gslides-parity SPEC-3 5.5; research 08 5.3): Turboslide's own inbox
 * with Google's levels. Rows of a fixed 40 px height: the actor's mark, one sentence, a tabular
 * time; a click runs the record's target (the thread's card on its slide) and marks it read;
 * "Mark all read" at the head; "Notification settings" at the foot, Google's position for the
 * per file dialog. Unread rows carry a 6 px ink dot inside their box.
 */
export type InboxPanelProps = {
  inbox: EditorInbox;
  document: DeckDocument;
  onOpen: (item: InboxItemView) => void;
  onSettings: () => void;
  onClose: () => void;
};

export function InboxPanel({ inbox, document, onOpen, onSettings, onClose }: InboxPanelProps) {
  const rows = sortInbox(inbox.items);
  return (
    <Panel
      title={INBOX.panel}
      count={inbox.unread > 0 ? inbox.unread : undefined}
      onClose={onClose}
      control="panel.inbox"
      className="ts-inbox-panel"
      aside={
        <button
          type="button"
          className="pt-ib is-text ts-inbox-markall"
          disabled={inbox.unread === 0}
          data-control="panel.inbox.markAllRead"
          onClick={() => inbox.onMarkAllRead?.()}
          {...tipProps({ name: INBOX.markAllRead, doc: 'Every row reads as seen' })}
        >
          <span className="pt-lb">{INBOX.markAllRead}</span>
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="ts-panel-empty">{INBOX.empty}</p>
      ) : (
        <ul className="ts-inbox-list" data-control="panel.inbox.list" data-count={rows.length}>
          {rows.map((item) => {
            const unread = item.readAt === undefined;
            const sentence = inboxSentence(item, document);
            const actor = item.actors[0];
            return (
              <li
                key={item.id}
                className={cn('ts-inbox-row', unread && 'is-unread')}
                data-control={`panel.inbox.item.${item.id}`}
                data-kind={item.kind}
                data-read={unread ? undefined : ''}
              >
                <button
                  type="button"
                  className="ts-inbox-row-btn"
                  data-control={`panel.inbox.open.${item.id}`}
                  onClick={() => {
                    if (unread) inbox.onMarkRead?.([item.id]);
                    onOpen(item);
                  }}
                  {...tipProps({ name: sentence, doc: 'Opens the thread on its slide' })}
                >
                  {actor ? (
                    <IdentityChip identity={actor} size={24} />
                  ) : (
                    <span className="ts-chip is-blank" />
                  )}
                  <span className="ts-inbox-sentence">{sentence}</span>
                  <time className="ts-inbox-time" dateTime={item.updatedAt}>
                    {shortTime(item.updatedAt)}
                  </time>
                  <i className="ts-inbox-dot" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="ts-inbox-foot">
        <button
          type="button"
          className="pt-ib is-text"
          data-control="panel.inbox.settings"
          onClick={onSettings}
          {...tipProps({ name: INBOX.settings, doc: 'All comments, Comments for you, or None' })}
        >
          <span className="pt-lb">{INBOX.settings}</span>
        </button>
      </div>
    </Panel>
  );
}
