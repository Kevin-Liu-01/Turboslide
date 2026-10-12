import { Select } from '../Select';
import type { SelectOption } from '../Select';
import type { ControlProps } from './props';
import { optionLabel, optionValue } from './props';

/**
 * A z.enum or literal set with more than four options, or an optional one of any size, as the
 * shared dropdown (SPEC 6.5; docs/DROPDOWNS.md 3, 4.1): the key widths, the icon tones with None,
 * the section of an opener. The trigger is the control itself, so the label and data-control sit
 * on it. An optional field offers the None row, which removes the field.
 */
export function SelectControl({ spec, onChange, disabled }: ControlProps) {
  const options = spec.options ?? [];
  const current = spec.value === undefined ? '' : String(spec.value);
  const known = options.some((option) => String(option) === current);
  /* the row that removes the field reads "None", or "Default" where one of the schema's own tags
     reads "none" (the chart's Legend: "none" hides the legend, and removing the field draws the
     default one), so no two rows read alike (the dropdown round's last visual pass, F5) */
  const clears = options.some((option) => optionLabel(option).toLowerCase() === 'none')
    ? 'Default'
    : 'None';
  const rows: SelectOption[] = [
    ...(spec.optional || current === '' ? [{ value: '', label: clears }] : []),
    ...(!known && current !== '' ? [{ value: current, label: optionLabel(current) }] : []),
    ...options.map((option) => ({ value: String(option), label: optionLabel(option) })),
  ];
  return (
    <Select
      size="compact"
      value={current}
      options={rows}
      label={spec.label}
      control={spec.control}
      disabled={disabled}
      tip={{
        name: spec.inspector.label,
        doc: spec.inspector.help ?? `One of ${options.length} values.`,
      }}
      onChange={(raw) => onChange(raw === '' ? undefined : optionValue(raw, options))}
    />
  );
}
