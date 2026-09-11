import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { ToolButton } from '../ToolButton';
import type { ControlProps } from './props';

import './stepper.css';

/**
 * A number as a stepper (SPEC 6.5): with a snap annotation the minus and plus buttons walk the
 * set (the key widths 90 to 300, the measures 32 and 56), without one they step by one. The
 * field between them is a native number input carrying the label and data-control. A typed value
 * commits on the DOM's change event, which the browser fires on Enter or on blur after an edit
 * and which the window API's set() dispatches after writing the value (SPEC 7.4), so a typed
 * value and an agent's value land in the one onChange; clearing an optional field removes it.
 * The listener is native because React's onChange cannot tell change from input.
 */
export function StepperControl({ spec, onChange, disabled }: ControlProps) {
  const options = (spec.options ?? []).filter(
    (option): option is number => typeof option === 'number',
  );
  const current = typeof spec.value === 'number' ? spec.value : undefined;
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const step = (direction: -1 | 1) => {
    if (disabled) return;
    if (options.length > 0) {
      if (current === undefined) {
        onChange(direction > 0 ? options[0] : options[options.length - 1]);
        return;
      }
      /* the nearest option in the direction, so a value off the set still walks onto it */
      const sorted = [...options].sort((a, b) => a - b);
      const next =
        direction > 0
          ? sorted.find((option) => option > current)
          : [...sorted].reverse().find((option) => option < current);
      if (next !== undefined) onChange(next);
      return;
    }
    onChange((current ?? 0) + direction);
  };

  const commit = (raw: string) => {
    setDraft(null);
    const trimmed = raw.trim();
    if (trimmed === '') {
      if (spec.optional) onChange(undefined);
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value === current) return;
    onChange(value);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;

  /* the DOM's change event, bound once to the input; the handler reads the latest commit */
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
      /* the field shows the document's value again before it blurs, so the blur fires no change */
      event.currentTarget.value = current === undefined ? '' : String(current);
      event.currentTarget.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      step(event.key === 'ArrowUp' ? 1 : -1);
    }
  };

  const shown = draft ?? (current === undefined ? '' : String(current));
  const atFirst = options.length > 0 && current !== undefined && current <= Math.min(...options);
  const atLast = options.length > 0 && current !== undefined && current >= Math.max(...options);

  return (
    <span className="ts-ctl-stepper">
      <ToolButton
        title={`${spec.label}: smaller`}
        ariaLabel={`${spec.label} down`}
        className="ts-ctl-step"
        onClick={() => step(-1)}
        control={`${spec.control}.down`}
      >
        <span aria-hidden="true">−</span>
      </ToolButton>
      <input
        ref={input}
        className="ts-ctl-number"
        type="number"
        inputMode="decimal"
        aria-label={spec.label}
        data-control={spec.control}
        value={shown}
        placeholder={spec.optional ? 'none' : undefined}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKey}
      />
      <ToolButton
        title={`${spec.label}: larger`}
        ariaLabel={`${spec.label} up`}
        className="ts-ctl-step"
        onClick={() => step(1)}
        control={`${spec.control}.up`}
      >
        <span aria-hidden="true">+</span>
      </ToolButton>
      {options.length > 0 ? (
        <span className="ts-ctl-snap" aria-hidden="true">
          {atFirst ? 'first' : atLast ? 'last' : `of ${options.length}`}
        </span>
      ) : null}
    </span>
  );
}
