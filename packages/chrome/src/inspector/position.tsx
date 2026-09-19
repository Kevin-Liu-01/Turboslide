import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { FREEFORM_GRID, offSheet, snapPosition } from '@turboslide/schema/freeform';
import type { Position } from '@turboslide/schema/position';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';

import { ToolButton } from '../ToolButton';
import { tipProps } from '../Tooltip';
import { LintMark } from './lint-mark';
import type { ControlProps } from './props';

import './position.css';

/**
 * The Position box as one control (annotation control `position`, schema/position.ts; Kevin,
 * 2026-09-11: "be able to drag stuff around in each slide"): X, Y, W, H and Z as steppers in a
 * two by two grid plus the stacking row, in sheet pixels on the 1600 by 900 sheet. The minus and
 * plus buttons move by the 8 px grid; a typed box is snapped by freeform.ts snapPosition, which
 * takes the nearest rail, plate edge or column seam within 6 px and the grid otherwise, so the
 * inspector and the stage's drag agree on where a box lands. Every change writes the whole
 * object in one block.set. A box that leaves the sheet shows the freeform/off-sheet lint mark.
 */
type Key = 'x' | 'y' | 'w' | 'h' | 'z';

const FIELDS: ReadonlyArray<{ key: Key; label: string; doc: string }> = [
  { key: 'x', label: 'X', doc: 'The left edge in sheet px from the left of the 1600 px sheet.' },
  { key: 'y', label: 'Y', doc: 'The top edge in sheet px from the top of the 900 px sheet.' },
  { key: 'w', label: 'W', doc: 'The width in sheet px; the right edge snaps like the left.' },
  { key: 'h', label: 'H', doc: 'The height in sheet px; the bottom edge snaps like the top.' },
  {
    key: 'z',
    label: 'Z',
    doc: 'The stacking order; higher draws over lower. block.order moves a block through the stack.',
  },
];

function readPosition(value: unknown): Position {
  const record =
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const number = (key: Key, fallback: number) =>
    typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] : fallback;
  const out: Position = {
    x: number('x', 0),
    y: number('y', 0),
    w: number('w', FREEFORM_GRID),
    h: number('h', FREEFORM_GRID),
  };
  if (typeof record.z === 'number') out.z = record.z;
  return out;
}

/** The box after one field changes, snapped for the geometry fields and kept whole for z. */
export function withField(current: Position, key: Key, value: number | undefined): Position {
  if (key === 'z') {
    const next: Position = { x: current.x, y: current.y, w: current.w, h: current.h };
    if (value !== undefined) next.z = Math.round(value);
    return next;
  }
  const next: Position = { ...current, [key]: value ?? 0 };
  if (key === 'w' || key === 'h') next[key] = Math.max(FREEFORM_GRID, next[key]);
  return snapPosition(next);
}

function Field({
  spec,
  field,
  value,
  optional,
  disabled,
  onCommit,
}: {
  spec: ControlProps['spec'];
  field: (typeof FIELDS)[number];
  value: number | undefined;
  optional: boolean;
  disabled: boolean | undefined;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const step = field.key === 'z' ? 1 : FREEFORM_GRID;
  const label = `${spec.label} ${field.label}`;
  const control = `${spec.control}.${field.key}`;

  /* the value the last commit wrote, until the document carries it: the change event fires on
     Enter and again on the blur before the write has landed, and the second commit compared the
     typed value with the old `value` and wrote it again, so X, Y and Rotate made two history
     entries per typed value (docs/RETURN.md 2.14 item 3; audit-formatting rows 65, 66) */
  const written = useRef<number | undefined | null>(null);
  if (written.current !== null && written.current === value) written.current = null;
  const commit = (raw: string) => {
    setDraft(null);
    const trimmed = raw.trim();
    if (trimmed === '') {
      if (optional && value !== undefined && written.current !== undefined) {
        written.current = undefined;
        onCommit(undefined);
      }
      return;
    }
    const next = Number(trimmed);
    if (!Number.isFinite(next) || next === value) return;
    if (written.current !== null && written.current === next) return;
    written.current = next;
    onCommit(next);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;

  /* the DOM's change event, so a typed value and the window API's set() land in one commit */
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onNativeChange = () => commitRef.current(el.value);
    el.addEventListener('change', onNativeChange);
    return () => el.removeEventListener('change', onNativeChange);
  }, []);

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
      event.currentTarget.value = value === undefined ? '' : String(value);
      event.currentTarget.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onCommit((value ?? 0) + (event.key === 'ArrowUp' ? step : -step));
    }
  };

  const fieldTip = tipProps({
    name: `${field.label} in sheet px`,
    doc: `${field.doc} Enter commits; up and down arrows step by ${step}.`,
    key: 'Enter',
  });

  return (
    <span className="ts-ctl-pos-field" data-field={field.key}>
      <span className="ts-ctl-pos-key" {...tipProps({ name: field.label, doc: field.doc })}>
        {field.label}
      </span>
      <ToolButton
        title={`${field.label} minus ${step}`}
        ariaLabel={`${label} down`}
        className="ts-ctl-step"
        control={`${control}.down`}
        disabled={disabled}
        onClick={() => onCommit((value ?? 0) - step)}
      >
        <span aria-hidden="true">−</span>
      </ToolButton>
      <input
        ref={input}
        className="ts-ctl-number ts-ctl-pos-number"
        type="number"
        inputMode="numeric"
        step={step}
        aria-label={label}
        data-control={control}
        value={draft ?? (value === undefined ? '' : String(value))}
        placeholder={optional ? 'none' : undefined}
        disabled={disabled}
        {...fieldTip}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          fieldTip.onKeyDown(event);
          onKey(event);
        }}
      />
      <ToolButton
        title={`${field.label} plus ${step}`}
        ariaLabel={`${label} up`}
        className="ts-ctl-step"
        control={`${control}.up`}
        disabled={disabled}
        onClick={() => onCommit((value ?? 0) + step)}
      >
        <span aria-hidden="true">+</span>
      </ToolButton>
    </span>
  );
}

export function PositionControl({ spec, onChange, disabled }: ControlProps) {
  const current = readPosition(spec.value);
  const out = offSheet(current);
  return (
    <span className="ts-ctl-pos" data-control={spec.control}>
      <span className="ts-ctl-pos-grid">
        {FIELDS.map((field) => (
          <Field
            key={field.key}
            spec={spec}
            field={field}
            value={current[field.key]}
            optional={field.key === 'z'}
            disabled={disabled}
            onCommit={(value) => onChange(withField(current, field.key, value))}
          />
        ))}
      </span>
      <span className="ts-ctl-pos-note">
        <span
          {...tipProps({
            name: 'Sheet',
            doc: `The box lives on the ${SHEET_WIDTH} by ${SHEET_HEIGHT} sheet and snaps to the ${FREEFORM_GRID} px grid, the rails, the plate edges and the column seams.`,
          })}
        >
          {current.x + current.w} right, {current.y + current.h} bottom of {SHEET_WIDTH} by{' '}
          {SHEET_HEIGHT}
        </span>
        {out ? (
          <LintMark
            rule="freeform/off-sheet"
            severity={3}
            proposal="Part of the box leaves the sheet; move or shrink it back inside."
          />
        ) : null}
      </span>
    </span>
  );
}
