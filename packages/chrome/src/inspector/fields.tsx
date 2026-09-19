import type { ReactNode } from 'react';
import { useRef, useState } from 'react';

import type { Color } from '@turboslide/schema/color';
import { COLOR_LABELS, COLOR_TOKENS, isHexColor } from '@turboslide/schema/color';

import type { EditorDispatch } from '../dispatch';
import type { EditorHandle } from '../editor-shell';
import { Icon } from '../icons';
import type { IconName } from '../icons';
import { cn } from '../lib/cn';
import { tipProps } from '../Tooltip';
import { swatchPaint } from './palette';

import './fields.css';

/**
 * The small controls the round two Format options sections share (gslides-parity SPEC-2 section
 * 5, section 10): a number field that commits on Enter and blur, a slider with its value field, a
 * row of toggle buttons, a radio list, a select, a colour row of swatches and a hex field, and the
 * write context every section receives. Every control carries the Tooltip primitive with its
 * label; no `title` attribute. Values are numbers and tokens; the sections turn them into one
 * action call each.
 */
export type SectionWrite = {
  slideId: string;
  revision: number;
  dispatch: EditorDispatch;
  busy: boolean;
  /** reports a rejected write in the panel's notice line */
  report: (promise: Promise<unknown>) => void;
  editor?: EditorHandle;
};

/** A number field: Enter and blur commit, Esc restores, the arrows step. */
export function NumberField({
  label,
  value,
  onCommit,
  control,
  disabled,
  doc,
  step = 1,
  min,
  max,
  unit,
}: {
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  control: string;
  disabled?: boolean;
  doc?: string;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  /* the draft as the handlers read it: Enter commits and blurs in one event, and the blur's
     commit read the draft of the render its handler was bound in, so one typed width made two
     writes and two history entries and the first Cmd+Z restored nothing (docs/RETURN.md 2.14
     item 3; audit-formatting rows 13, 64 to 66). The ref is cleared before the write */
  const draftRef = useRef<string | null>(null);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = () => {
    const typed = draftRef.current;
    if (typed === null) return;
    draftRef.current = null;
    const n = Number(typed);
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onCommit(clamp(n));
  };
  const tip = tipProps({ name: label, ...(doc === undefined ? {} : { doc }), key: 'Enter' });
  return (
    <label className={cn('ts-fo-field', disabled && 'is-disabled')}>
      <span className="ts-fo-field-label">{label}</span>
      <span className="ts-fo-field-box">
        <input
          type="text"
          inputMode="decimal"
          value={draft ?? (value === undefined ? '' : String(value))}
          aria-label={label}
          data-control={control}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          {...tip}
          onChange={(event) => {
            draftRef.current = event.target.value;
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            tip.onKeyDown(event);
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              draftRef.current = null;
              setDraft(null);
              event.currentTarget.blur();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const typed = draftRef.current;
              const base = typed === null ? (value ?? 0) : Number(typed) || 0;
              const next = clamp(base + (event.key === 'ArrowUp' ? step : -step));
              draftRef.current = null;
              setDraft(null);
              onCommit(Math.round(next * 100) / 100);
            }
          }}
          onBlur={(event) => {
            tip.onBlur(event);
            commit();
          }}
        />
        {unit !== undefined ? <span className="ts-fo-field-unit">{unit}</span> : null}
      </span>
    </label>
  );
}

/** A slider with its value field: the slider commits on release, the field on Enter. */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
  control,
  disabled,
  doc,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  control: string;
  disabled?: boolean;
  doc?: string;
  unit?: string;
}) {
  const [live, setLive] = useState<number | null>(null);
  /* the value the pointer or the keys moved to is kept in a ref beside the state: the commit on
     the release reads the ref, so a press that moves the thumb and releases inside one event
     turn (a click on the track) commits what the input event set, not the state of the render
     the handler was bound in (docs/FOCUS.md `images.options.transparency`: the slider took no
     mouse drag and no track click while ArrowRight moved it; F-transparency, b1 R25) */
  const liveRef = useRef<number | null>(null);
  const update = (next: number | null) => {
    liveRef.current = next;
    setLive(next);
  };
  const commit = () => {
    const next = liveRef.current;
    if (next !== null && next !== value) onCommit(next);
    update(null);
  };
  const shown = live ?? value;
  const tip = tipProps({ name: label, ...(doc === undefined ? {} : { doc }) });
  return (
    <div className={cn('ts-fo-slider', disabled && 'is-disabled')}>
      <span className="ts-fo-field-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-label={label}
        aria-valuetext={`${shown}${unit ?? ''}`}
        data-control={`${control}.slider`}
        disabled={disabled}
        {...tip}
        onChange={(event) => update(Number(event.target.value))}
        onPointerDown={() => {
          /* a release outside the input (a drag that ends past the track) still commits: the
             document sees the pointer up the input does not */
          document.addEventListener('pointerup', commit, { once: true });
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={(event) => {
          tip.onBlur(event);
          commit();
        }}
      />
      <NumberField
        label={`${label} value`}
        value={shown}
        onCommit={onCommit}
        control={control}
        disabled={disabled}
        step={step}
        min={min}
        max={max}
        unit={unit}
      />
    </div>
  );
}

export type ToggleOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
  doc?: string;
  disabled?: boolean;
};

/** A row of toggle buttons: one pressed at a time (`radio`) or several (`multi`). */
export function ToggleRow<T extends string>({
  label,
  options,
  pressed,
  onToggle,
  control,
  disabled,
  mode = 'radio',
}: {
  label: string;
  options: ReadonlyArray<ToggleOption<T>>;
  pressed: ReadonlySet<T> | T | undefined;
  onToggle: (value: T) => void;
  control: string;
  disabled?: boolean;
  mode?: 'radio' | 'multi';
}) {
  const isOn = (value: T) => (pressed instanceof Set ? pressed.has(value) : pressed === value);
  return (
    <div
      className="ts-fo-toggles"
      role={mode === 'radio' ? 'radiogroup' : 'group'}
      aria-label={label}
      data-control={control}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role={mode === 'radio' ? 'radio' : undefined}
          aria-checked={mode === 'radio' ? isOn(option.value) : undefined}
          aria-pressed={mode === 'multi' ? isOn(option.value) : undefined}
          aria-label={option.icon === undefined ? undefined : option.label}
          aria-disabled={disabled || option.disabled ? true : undefined}
          className={cn(
            'pt-ib ts-fo-toggle',
            option.icon !== undefined && 'pt-icon',
            isOn(option.value) && 'is-on',
            (disabled || option.disabled) && 'is-disabled',
          )}
          data-control={`${control}.${option.value}`}
          onClick={() => {
            if (disabled || option.disabled) return;
            onToggle(option.value);
          }}
          {...tipProps({
            name: option.label,
            ...(option.doc === undefined ? {} : { doc: option.doc }),
          })}
        >
          {option.icon !== undefined ? (
            <Icon name={option.icon} />
          ) : (
            <span className="pt-lb">{option.label}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** A native select in the panel grammar. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  control,
  disabled,
  doc,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  control: string;
  disabled?: boolean;
  doc?: string;
}) {
  return (
    <label className={cn('ts-fo-field', disabled && 'is-disabled')}>
      <span className="ts-fo-field-label">{label}</span>
      <select
        value={value}
        aria-label={label}
        data-control={control}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        {...tipProps({ name: label, ...(doc === undefined ? {} : { doc }) })}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A radio list, one row per option, with a note under a disabled row. */
export function RadioList<T extends string>({
  label,
  value,
  options,
  onChange,
  control,
  disabled,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{
    value: T;
    label: string;
    doc?: string;
    disabled?: boolean;
    note?: string;
  }>;
  onChange: (value: T) => void;
  control: string;
  disabled?: boolean;
}) {
  return (
    <div className="ts-fo-radios" role="radiogroup" aria-label={label} data-control={control}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn('ts-fo-radio', (disabled || option.disabled) && 'is-disabled')}
          {...tipProps({
            name: option.label,
            ...(option.doc === undefined ? {} : { doc: option.doc }),
          })}
        >
          <input
            type="radio"
            name={control}
            value={option.value}
            checked={value === option.value}
            disabled={disabled || option.disabled}
            data-control={`${control}.${option.value}`}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
          {option.note !== undefined ? <span className="ts-fo-note">{option.note}</span> : null}
        </label>
      ))}
    </div>
  );
}

/** A check row. */
export function CheckField({
  label,
  checked,
  onChange,
  control,
  disabled,
  doc,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  control: string;
  disabled?: boolean;
  doc?: string;
}) {
  return (
    <label
      className={cn('ts-fo-check', disabled && 'is-disabled')}
      {...tipProps({ name: label, ...(doc === undefined ? {} : { doc }) })}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        data-control={control}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/** The palette swatches in a row with None and a hex field; `current` undefined reads None. */
export function ColorRow({
  label,
  current,
  onPick,
  control,
  disabled,
  allowNone = true,
  doc,
}: {
  label: string;
  current: Color | undefined;
  onPick: (value: Color | null) => void;
  control: string;
  disabled?: boolean;
  allowNone?: boolean;
  doc?: string;
}) {
  const [hex, setHex] = useState('');
  const hexTip = tipProps({
    name: `${label} custom`,
    doc: 'Six hex digits; Enter applies',
    key: 'Enter',
  });
  return (
    <div className={cn('ts-fo-colors', disabled && 'is-disabled')} data-control={control}>
      <span
        className="ts-fo-field-label"
        {...tipProps({ name: label, ...(doc === undefined ? {} : { doc }) })}
      >
        {label}
      </span>
      <div className="ts-fo-swatches" role="radiogroup" aria-label={label}>
        {allowNone ? (
          <button
            type="button"
            role="radio"
            aria-checked={current === undefined}
            aria-label="None"
            className={cn('ts-fo-swatch is-none', current === undefined && 'is-on')}
            data-control={`${control}.none`}
            disabled={disabled}
            onClick={() => onPick(null)}
            {...tipProps({ name: 'None' })}
          />
        ) : null}
        {COLOR_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            role="radio"
            aria-checked={current === token}
            aria-label={COLOR_LABELS[token]}
            className={cn('ts-fo-swatch', current === token && 'is-on')}
            style={{ background: swatchPaint(token) }}
            data-control={`${control}.${token}`}
            disabled={disabled}
            onClick={() => onPick(token)}
            {...tipProps({ name: COLOR_LABELS[token] })}
          />
        ))}
      </div>
      <input
        type="text"
        className="ts-fo-hex"
        value={hex}
        placeholder={current !== undefined && isHexColor(current) ? current : '#rrggbb'}
        aria-label={`${label} custom`}
        data-control={`${control}.hex`}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        {...hexTip}
        onChange={(event) => setHex(event.target.value)}
        onKeyDown={(event) => {
          hexTip.onKeyDown(event);
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const value = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
          if (isHexColor(value)) {
            onPick(value);
            setHex('');
          }
        }}
      />
    </div>
  );
}

/** A labelled row holding a control the section draws itself. */
export function Row({
  label,
  children,
  doc,
}: {
  label: string;
  children: ReactNode;
  doc?: string;
}) {
  return (
    <div className="ts-fo-row">
      <span
        className="ts-fo-field-label"
        {...tipProps({ name: label, ...(doc === undefined ? {} : { doc }) })}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/** A plain sentence under a control. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="ts-fo-note">{children}</p>;
}

/** A text button in the panel grammar. */
export function PanelButton({
  label,
  onClick,
  control,
  disabled,
  doc,
  icon,
  pressed,
}: {
  label: string;
  onClick: (anchor: HTMLElement) => void;
  control: string;
  disabled?: boolean;
  doc?: string;
  icon?: IconName;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn('pt-ib ts-fo-button', pressed && 'is-on', disabled && 'is-disabled')}
      aria-disabled={disabled ? true : undefined}
      aria-pressed={pressed}
      data-control={control}
      onClick={(event) => {
        if (disabled) return;
        onClick(event.currentTarget);
      }}
      {...tipProps({ name: label, ...(doc === undefined ? {} : { doc }) })}
    >
      {icon !== undefined ? <Icon name={icon} /> : null}
      <span className="pt-lb">{label}</span>
    </button>
  );
}
