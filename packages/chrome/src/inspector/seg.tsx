import { Seg } from '../Seg';
import type { SegOption } from '../Seg';
import type { ControlProps } from './props';
import { optionLabel, optionValue } from './props';

import './seg.css';

/**
 * A required z.enum or literal set with four or fewer options as the shell's segmented control
 * (SPEC 6.5). The Seg is the field: its group carries the field's accessible label and its options
 * the ids `<data-control>.<value>`, so the window API's set('<label>' | '<id>', value) clicks the
 * option (the group path of controls.ts) and a click and an agent's set() end in the same onChange
 * (docs/DROPDOWNS.md 4.1). A click on the active option changes nothing. An optional field of this
 * size is the dropdown with its None row (generate.ts kindFor), so the Seg never clears a field.
 */
export function SegControl({ spec, onChange, disabled }: ControlProps) {
  const options = spec.options ?? [];
  const current = spec.value === undefined ? '' : String(spec.value);
  const segOptions: readonly SegOption<string>[] = options.map((option) => ({
    value: String(option),
    label: optionLabel(option),
    title: `${spec.inspector.label} ${optionLabel(option)}`,
    doc: spec.inspector.help ?? `Sets ${spec.inspector.label} to ${optionLabel(option)}.`,
  }));
  return (
    <span className="ts-ctl-seg">
      <Seg
        options={segOptions}
        value={current}
        onChange={(raw) => {
          if (disabled) return;
          onChange(optionValue(raw, options));
        }}
        label={spec.label}
        className="is-small ts-ctl-seg-group"
        control={spec.control}
      />
    </span>
  );
}
