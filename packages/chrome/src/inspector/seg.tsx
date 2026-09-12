import { Seg } from '../Seg';
import type { SegOption } from '../Seg';
import type { ControlProps } from './props';
import { HIDDEN_NATIVE_CLASS, optionValue } from './props';

import './seg.css';

/**
 * A z.enum or literal set with four or fewer options as the shell's segmented control (SPEC 6.5).
 * The Seg is the visible control; a visually hidden native select carries the accessible label
 * and the data-control id, so the window API's set() writes it the way it writes any field
 * (SPEC 7.4: set writes native values and dispatches input and change) and a click on an option
 * and an agent's set() end in the same onChange. Clicking the active non-first option returns
 * to the first, as the Seg does everywhere; an optional field also offers the empty option
 * through the select, which removes the field.
 */
export function SegControl({ spec, onChange, disabled }: ControlProps) {
  const options = spec.options ?? [];
  const current = spec.value === undefined ? '' : String(spec.value);
  const segOptions: readonly SegOption<string>[] = options.map((option) => ({
    value: String(option),
    label: String(option),
    title: `${spec.inspector.label} ${String(option)}`,
    doc: spec.inspector.help ?? `Sets ${spec.inspector.label} to ${String(option)}.`,
  }));
  const pick = (raw: string) => {
    if (disabled) return;
    onChange(raw === '' ? undefined : optionValue(raw, options));
  };
  return (
    <span className="ts-ctl-seg">
      <select
        className={HIDDEN_NATIVE_CLASS}
        aria-label={spec.label}
        data-control={spec.control}
        value={current}
        disabled={disabled}
        onChange={(event) => pick(event.target.value)}
      >
        {spec.optional ? <option value="">none</option> : null}
        {options.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
      <Seg
        options={segOptions}
        value={current}
        onChange={pick}
        label={`${spec.label} options`}
        className="is-small ts-ctl-seg-group"
        control={`${spec.control}.option`}
      />
    </span>
  );
}
