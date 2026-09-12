import { tipProps } from '../Tooltip';
import type { ControlProps } from './props';

import './check.css';

/**
 * A boolean as a check row (SPEC 6.5). Two field shapes share it: z.boolean() (tight, links,
 * border, centerTick) writes true and, when optional, removes the field on uncheck; a
 * z.literal(true).optional() flag (ext, no, marker, marks) can only be present or absent, so
 * uncheck removes it too. The input is native, so the window API's set(label, boolean) clicks it.
 */
export function CheckControl({ spec, onChange, disabled }: ControlProps) {
  const literal = spec.schema.def.type === 'literal';
  const checked = spec.value === true;
  return (
    <label
      className="ts-ctl-check"
      {...tipProps({
        name: spec.inspector.label,
        doc:
          spec.inspector.help ??
          (literal
            ? `Present or absent: unchecking removes ${spec.inspector.label}.`
            : `On or off; unchecking ${spec.optional ? 'removes the field' : 'writes false'}.`),
        key: 'Space',
      })}
    >
      <input
        type="checkbox"
        aria-label={spec.label}
        data-control={spec.control}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.checked;
          if (next) onChange(true);
          else onChange(literal || spec.optional ? undefined : false);
        }}
      />
      <span className="ts-ctl-check-box" aria-hidden="true" />
      <span className="ts-ctl-check-word" aria-hidden="true">
        {checked ? 'on' : 'off'}
      </span>
    </label>
  );
}
