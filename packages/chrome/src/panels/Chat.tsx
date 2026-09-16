import { useEffect, useRef, useState } from 'react';

import { ROUND_FIVE } from '../menus/strings';
import { Panel } from '../Panel';
import type { ChatRow } from '../text-tools';
import { tipProps } from '../Tooltip';

import '../dialogs/text-tools-dialogs.css';

/**
 * Join chat (gslides-parity SPEC-5 10, 0.46; P3 9): the Chat panel in the right panel slot with
 * the room's participants, the messages since the room formed and a composer with Enter to send.
 * Its first line reads "Messages are not saved. Leave a comment for something that should stay".
 * The messages are `chat.list` through the dispatcher, re-read every two seconds while the
 * panel is open (the blob tier polls a one second head, and the panel says so as the roster
 * does); Enter sends `chat.send`. A commenter or better writes, a viewer reads with the composer
 * disabled and the sentence. The list is a `log` region so a screen reader announces a new
 * message; the panel never mounts on the presenter route or the published player.
 */
export const CHAT_STRINGS = {
  title: 'Chat',
  composer: 'Message',
  send: 'Send',
  participants: (n: number) => `${n} in the room`,
  empty: 'No messages yet',
  polling: 'Messages arrive within about a second on this instance',
  rateLimited: 'Too many messages; wait a moment',
} as const;

/** How often the panel re-reads the room while open. */
export const CHAT_POLL_MS = 2000;

export type ChatPanelProps = {
  list: () => Promise<{ messages: ChatRow[] }>;
  send: (text: string) => Promise<unknown>;
  /** the caller may write: commenters and editors */
  canSend: boolean;
  participants: number;
  /** the realtime tier; the polling sentence shows on `blob` */
  tier?: string;
  onClose: () => void;
  /** the caller's principal id, to mark own messages */
  selfId?: string;
};

/** "10:42" for a message time in the viewer's zone. */
export function chatTime(at: string, now: Date = new Date()): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return sameDay
    ? time
    : `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

export function ChatPanel({
  list,
  send,
  canSend,
  participants,
  tier,
  onClose,
  selfId,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatRow[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let alive = true;
    const read = () =>
      list()
        .then((answer) => {
          if (!alive) return;
          setMessages(answer.messages);
        })
        .catch((err: unknown) => {
          if (alive) setError(err instanceof Error ? err.message : String(err));
        });
    void read();
    const timer = window.setInterval(() => void read(), CHAT_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [list]);

  useEffect(() => {
    const node = log.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [messages?.length]);

  const submit = () => {
    const text = draft.trim();
    if (text === '' || !canSend || busy) return;
    setBusy(true);
    send(text)
      .then(() => {
        setDraft('');
        setError(null);
        return list().then((answer) => setMessages(answer.messages));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const composerTip = tipProps({
    name: CHAT_STRINGS.composer,
    doc: canSend ? 'Enter sends; Shift Enter starts a new line' : ROUND_FIVE.chatViewers,
    key: 'Enter',
  });
  return (
    <Panel
      title={CHAT_STRINGS.title}
      count={participants > 0 ? participants : undefined}
      onClose={onClose}
      control="panel.chat"
      className="ts-chat-panel"
    >
      <div className="ts-chat">
        <p className="ts-tt-note" data-control="panel.chat.notSaved">
          {ROUND_FIVE.chatNotSaved}
        </p>
        <p className="ts-tt-note" data-control="panel.chat.participants">
          {CHAT_STRINGS.participants(participants)}
          {tier === 'blob' ? `. ${CHAT_STRINGS.polling}` : ''}
        </p>
        <ul
          ref={log}
          className="ts-chat-log"
          role="log"
          aria-live="polite"
          aria-label={CHAT_STRINGS.title}
          data-control="panel.chat.log"
        >
          {messages === null ? null : messages.length === 0 ? (
            <li className="ts-tt-empty" data-control="panel.chat.empty">
              {CHAT_STRINGS.empty}
            </li>
          ) : (
            messages.map((message) => (
              <li
                key={message.id}
                className="ts-chat-message"
                data-control={`panel.chat.message.${message.id}`}
                data-self={message.principalId === selfId ? '' : undefined}
              >
                <span className="ts-chat-meta">
                  <b>{message.label}</b>
                  <time dateTime={message.at}>{chatTime(message.at)}</time>
                </span>
                <span className="ts-chat-text">{message.text}</span>
              </li>
            ))
          )}
        </ul>
        <div className="ts-chat-composer">
          <textarea
            value={draft}
            rows={1}
            maxLength={4000}
            placeholder={canSend ? CHAT_STRINGS.composer : ROUND_FIVE.chatViewers}
            aria-label={CHAT_STRINGS.composer}
            data-control="panel.chat.composer"
            disabled={!canSend}
            {...composerTip}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              composerTip.onKeyDown(event);
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
              event.stopPropagation();
            }}
          />
          <button
            type="button"
            className="ts-tt-small"
            disabled={!canSend || busy || draft.trim() === ''}
            data-control="panel.chat.send"
            {...tipProps({
              name: CHAT_STRINGS.send,
              doc: 'Posts the message to everyone in the room',
              key: 'Enter',
            })}
            onClick={submit}
          >
            {CHAT_STRINGS.send}
          </button>
        </div>
        {error !== null ? (
          <p className="ts-tt-error" role="alert" data-control="panel.chat.error">
            {error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
