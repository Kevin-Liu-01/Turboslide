import { tipProps } from '../Tooltip';
import type { ControlProps } from './props';
import { optionLabel, optionValue } from './props';

import './select.css';

/**
 * A z.enum or literal set with more than four options as a native select (SPEC 6.5): the key
 * widths, the icon tones with none, the section of an opener. The select is the control itself,
 * so the label and data-control sit on it. An optional field offers the empty option, which
 * removes the field.
 */
export function SelectControl({ spec, onChange, disabled }: ControlProps) {
  const options = spec.options ?? [];
  const current = spec.value === undefined ? '' : String(spec.value);
  const known = options.some((option) => String(option) === current);
  return (
    <select
      className="ts-ctl-select"
      aria-label={spec.label}
      data-control={spec.control}
      value={current}
      disabled={disabled}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === '' ? undefined : optionValue(raw, options));
      }}
      {...tipProps({
        name: spec.inspector.label,
        doc: spec.inspector.help ?? `One of ${options.length} values.`,
      })}
    >
      {spec.optional || current === '' ? <option value="">none</option> : null}
      {!known && current !== '' ? <option value={current}>{optionLabel(current)}</option> : null}
      {options.map((option) => (
        <option key={String(option)} value={String(option)}>
          {optionLabel(option)}
        </option>
      ))}
    </select>
  );
}
