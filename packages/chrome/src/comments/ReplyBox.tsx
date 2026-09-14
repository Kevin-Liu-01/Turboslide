import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRef, useState } from 'react';

import type { CommentBodyInput, IdentityView } from '../editor-shell';
import { cn } from '../lib/cn';
import { COMMENTS, REFUSALS } from '../menus/strings';
import { IdentityChip, nameOf } from '../presence/IdentityChip';
import { tipProps } from '../Tooltip';
import {
  draftBody,
  isEmailToken,
  mentionCandidates,
  mentionQuery,
  mentionToken,
} from './comments-model';
import type { DraftMention } from './comments-model';

/**
 * The comment and reply box (gslides-parity SPEC-3 5.3, 5.4): a plain text field with the
 * placeholder Google shows, `@` or `+` opening the autocomplete over the people the caller may
 * mention (present people and past commenters for anyone who can comment; grantees and a raw
 * address for editors, because naming a grantee reveals the share list and an address creates an
 * invitation), the "Assign to <name>" checkbox once a mention is in the draft (one assignee per
 * thread), Ctrl+Enter or the button posting. The stored body carries `{@n}` tokens and ids,
 * never a display string; a mention of an address without a grant tells a caller who may share
 * to "Invite them from Share".
 */
export type ReplyBoxProps = {
  placeholder: string;
  submitLabel: string;
  mentionables: readonly IdentityView[];
  /** the caller may mention grantees and addresses (an editor or the owner) */
  canInvite?: boolean;
  /** the Assign checkbox is offered (a new thread or a reply) */
  assignable?: boolean;
  initialText?: string;
  autoFocus?: boolean;
  busy?: boolean;
  onSubmit: (body: CommentBodyInput, assignee: string | null) => void;
  onCancel?: () => void;
  control: string;
};

export function ReplyBox({
  placeholder,
  submitLabel,
  mentionables,
  canInvite = false,
  assignable = false,
  initialText = '',
  autoFocus = false,
  busy = false,
  onSubmit,
  onCancel,
  control,
}: ReplyBoxProps) {
  const [text, setText] = useState(initialText);
  const [drafts, setDrafts] = useState<DraftMention[]>([]);
  const [assign, setAssign] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const query = mentionQuery(text, caret);
  const candidates = query === null ? [] : mentionCandidates(mentionables, query.query);
  const email = query !== null && candidates.length === 0 && isEmailToken(query.query);
  const live = drafts.filter((draft) => text.includes(draft.token));
  const canSubmit = text.trim() !== '' && !busy;

  const insert = (identity: IdentityView) => {
    if (query === null) return;
    const token = mentionToken(identity);
    const next = `${text.slice(0, query.start)}${token} ${text.slice(caret)}`;
    setText(next);
    setDrafts((prev) => [...prev, { token, principalId: identity.principalId, identity }]);
    setPick(0);
    const position = query.start + token.length + 1;
    window.setTimeout(() => {
      field.current?.focus();
      field.current?.setSelectionRange(position, position);
      setCaret(position);
    }, 0);
  };

  const submit = () => {
    if (!canSubmit) return;
    const body = draftBody(text, live);
    onSubmit(body, assign !== null && live.some((d) => d.principalId === assign) ? assign : null);
    setText('');
    setDrafts([]);
    setAssign(null);
  };

  const onKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (candidates.length > 0 || email) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setPick((p) => Math.min(p + 1, Math.max(0, candidates.length - 1)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setPick((p) => Math.max(0, p - 1));
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && candidates.length > 0) {
        event.preventDefault();
        const chosen = candidates[pick] ?? candidates[0];
        if (chosen) insert(chosen);
        return;
      }
      if (event.key === 'Enter' && email) {
        event.preventDefault();
        setNote(
          canInvite
            ? REFUSALS.inviteFromShare
            : 'Only people who can open this presentation can be named',
        );
        return;
      }
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    setCaret(event.target.selectionStart ?? event.target.value.length);
    setNote(null);
  };

  const fieldTip = tipProps({
    name: placeholder,
    doc: 'Type @ to name someone; Ctrl Enter posts',
    key: 'Ctrl+Enter',
  });

  return (
    <div className="ts-reply" data-control={control}>
      <textarea
        ref={field}
        className="ts-reply-field"
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={2}
        autoFocus={autoFocus}
        disabled={busy}
        data-control={`${control}.field`}
        {...fieldTip}
        onChange={onChange}
        onKeyDown={(event) => {
          fieldTip.onKeyDown(event);
          onKey(event);
        }}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
      />
      {candidates.length > 0 ? (
        <ul
          className="ts-reply-mentions"
          role="listbox"
          aria-label="People to name"
          data-control={`${control}.mentions`}
        >
          {candidates.map((identity, i) => (
            <li key={identity.principalId} role="option" aria-selected={i === pick}>
              <button
                type="button"
                className={cn('ts-reply-mention', i === pick && 'is-picked')}
                data-control={`${control}.mention.${identity.principalId}`}
                {...tipProps({ name: nameOf(identity), doc: 'Names this person in the comment' })}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insert(identity)}
              >
                <IdentityChip identity={identity} size={16} />
                <span className="ts-reply-mention-name">{nameOf(identity)}</span>
                {identity.trust === 'guest' ? (
                  <span className="ts-reply-mention-trust">guest</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {note !== null ? (
        <p className="ts-reply-note" role="status">
          {note}
        </p>
      ) : null}
      {assignable && live.length > 0 ? (
        <label
          className="ts-reply-assign"
          {...tipProps({
            name: COMMENTS.assignTo(nameOf(live[0]!.identity)),
            doc: 'One person owns the thread until they mark it done',
          })}
        >
          <input
            type="checkbox"
            checked={assign !== null}
            data-control={`${control}.assign`}
            onChange={(event) => setAssign(event.target.checked ? live[0]!.principalId : null)}
          />
          <span className="ts-dialog-check-box" aria-hidden="true" />
          <span>{COMMENTS.assignTo(nameOf(live[0]!.identity))}</span>
        </label>
      ) : null}
      <div className="ts-reply-actions">
        {onCancel ? (
          <button
            type="button"
            className="pt-ib is-text"
            data-control={`${control}.cancel`}
            onClick={onCancel}
            {...tipProps({
              name: COMMENTS.cancel,
              doc: 'Closes the box without posting',
              key: 'Esc',
            })}
          >
            <span className="pt-lb">{COMMENTS.cancel}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="pt-ib is-solid"
          disabled={!canSubmit}
          data-control={`${control}.submit`}
          onClick={submit}
          {...tipProps({ name: submitLabel, doc: 'Posts the comment', key: 'Ctrl+Enter' })}
        >
          <span className="pt-lb">{submitLabel}</span>
        </button>
      </div>
    </div>
  );
}
