import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import { tipProps } from '../Tooltip';
import type { ControlProps } from './props';
import { optionValue } from './props';

import './json.css';

/**
 * A structured field as JSON (annotation control `json`): a layout ratio, a split head, a body
 * alignment, the weights of a specimen, row heights, tags. With a snap the common forms are a
 * select (5/7, 4/8, 1/1) and `custom` reveals the JSON field for the rest ({ left: 390 });
 * without one the JSON field stands alone. The field commits on Cmd Enter, Ctrl Enter or blur;
 * text that does not parse is kept in the field with a note and never written.
 */
function show(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value);
}

/** The snap value a field's current value is, or `custom` when it is not one of them. */
function pickOf(value: unknown, options: ReadonlyArray<string | number> | undefined): string {
  if (value === undefined) return '';
  if (options?.some((option) => option === value)) return String(value);
  /* a body alignment { align: 'center' } or a head { cols: '5/7' } names its snap through its one value */
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const inner = Object.values(value as Record<string, unknown>);
    const first = inner[0];
    if (inner.length === 1 && options?.some((option) => option === first)) return String(first);
  }
  return 'custom';
}

export function JsonControl({ spec, onChange, disabled }: ControlProps) {
  const options = spec.options;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const picked = pickOf(spec.value, options);
  const showField = options === undefined || custom || picked === 'custom';
  const shown = draft ?? show(spec.value);

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    if (text === '') {
      setDraft(null);
      setError(null);
      if (spec.optional) onChange(undefined);
      return;
    }
    try {
      const value: unknown = JSON.parse(text);
      setDraft(null);
      setError(null);
      onChange(value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invalid JSON');
    }
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
      setError(null);
      event.currentTarget.blur();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit();
    }
  };

  const fieldTip = tipProps({
    name: `${spec.inspector.label} as JSON`,
    doc: spec.inspector.help ?? 'A JSON value; Cmd Enter or Ctrl Enter commits, Escape restores.',
    key: 'Cmd Enter',
  });

  return (
    <span className="ts-ctl-json">
      {options !== undefined ? (
        <select
          className="ts-ctl-select"
          aria-label={showField ? `${spec.label} form` : spec.label}
          data-control={showField ? `${spec.control}.form` : spec.control}
          value={picked}
          disabled={disabled}
          {...tipProps({
            name: spec.inspector.label,
            doc: spec.inspector.help ?? 'One of the common forms, or custom for a JSON value.',
          })}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === 'custom') {
              setCustom(true);
              return;
            }
            setCustom(false);
            setDraft(null);
            setError(null);
            if (raw === '') onChange(undefined);
            else onChange(optionValue(raw, options));
          }}
        >
          {spec.optional || picked === '' ? <option value="">none</option> : null}
          {options.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
          <option value="custom">custom</option>
        </select>
      ) : null}
      {showField ? (
        <textarea
          className="ts-ctl-json-field"
          rows={1}
          aria-label={spec.label}
          data-control={spec.control}
          value={shown}
          placeholder={spec.optional ? 'none' : undefined}
          disabled={disabled}
          spellCheck={false}
          {...fieldTip}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            fieldTip.onBlur(event);
            commit();
          }}
          onKeyDown={(event) => {
            fieldTip.onKeyDown(event);
            onKey(event);
          }}
        />
      ) : null}
      {error ? (
        <span className="ts-ctl-json-error" role="status">
          {error}
        </span>
      ) : null}
    </span>
  );
}
