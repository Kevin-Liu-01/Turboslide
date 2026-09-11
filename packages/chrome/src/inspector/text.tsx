import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { ControlProps } from './props';

import './text.css';

/**
 * A string or a Text as a textarea (SPEC 6.5: Text becomes a textarea in the inline markup with
 * a live copy lint). A `text` field is one line of markup: it grows with its content, Enter
 * commits and a line break is never inserted (a Text has none, SPEC 4.2). A `textarea` field
 * (notes, panel code, css, html) takes line breaks; Cmd Enter or Ctrl Enter commits. Both
 * commit on blur and restore the field on Escape. The copy lint runs on every keystroke through
 * context.lintText and its messages sit under the field in titanium; the field keeps its
 * value whatever the lint says (the linter flags, the designer decides). Clearing an optional
 * field removes it.
 */
export function TextControl({ spec, onChange, context, disabled }: ControlProps) {
  const multiline = spec.kind === 'textarea';
  const current = typeof spec.value === 'string' ? spec.value : '';
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const shown = draft ?? current;
  const messages = spec.text && context?.lintText ? context.lintText(shown, spec) : [];

  /* a one-line field grows with its text; a multiline one grows to its lines, capped by CSS */
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 28)}px`;
  }, [shown, multiline]);

  const commit = () => {
    if (draft === null) return;
    const next = multiline ? draft : draft.replace(/[\r\n]+/g, ' ');
    setDraft(null);
    if (next === current) return;
    if (next === '' && spec.optional) {
      onChange(undefined);
      return;
    }
    onChange(next);
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
      event.currentTarget.blur();
      return;
    }
    if (event.key !== 'Enter') return;
    if (!multiline || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    }
  };

  return (
    <span className={multiline ? 'ts-ctl-text is-multiline' : 'ts-ctl-text'}>
      <textarea
        ref={field}
        className="ts-ctl-textarea"
        rows={1}
        aria-label={spec.label}
        data-control={spec.control}
        value={shown}
        placeholder={spec.optional ? 'none' : undefined}
        disabled={disabled}
        spellCheck={spec.text}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
      />
      {messages.length > 0 ? (
        <span className="ts-ctl-lint" role="status">
          {messages.map((message) => (
            <span key={message}>{message}</span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
