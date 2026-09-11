import { useState } from 'react';

import type { ControlSpec } from './inspector/generate';
import { AssetControl } from './inspector/asset';
import { CheckControl } from './inspector/check';
import { IconControl } from './inspector/icon';
import { JsonControl } from './inspector/json';
import type { ControlContext } from './inspector/props';
import { SegControl } from './inspector/seg';
import { SelectControl } from './inspector/select';
import { StepperControl } from './inspector/stepper';
import { TextControl } from './inspector/text';
import { cn } from './lib/cn';

import './InspectorControl.css';

/**
 * One 32px ruled row of the inspector (SPEC 6.5): the property label at the left, the control
 * the spec's kind names at the right, and the validation note under them when a value did not
 * parse. The row validates every value against the field's Zod schema before it reports it, so
 * a control emits only values the reducer will accept, and the Inspector turns the report into
 * one block.set or slide.set write. Rows draw --pt-hair-soft under themselves; the section body
 * removes it from the last one (SPEC 2.2 line law).
 */
export type InspectorControlProps = {
  spec: ControlSpec;
  /** the validated value, or undefined to remove the field */
  onChange: (value: unknown) => void;
  context?: ControlContext;
  disabled?: boolean;
};

/** `list: Key 1` reads `Key 1` in the row; the full label stays on the control. */
export function rowLabel(spec: ControlSpec): string {
  return spec.label.replace(/^[^:]+:\s*/, '');
}

function shown(value: unknown): string {
  if (value === undefined) return 'none';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function InspectorControl({ spec, onChange, context, disabled }: InspectorControlProps) {
  const [error, setError] = useState<string | null>(null);

  const change = (value: unknown) => {
    if (value === undefined) {
      if (!spec.optional) {
        setError('This field is required');
        return;
      }
      setError(null);
      onChange(undefined);
      return;
    }
    const parsed = spec.schema.safeParse(value);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(first === undefined ? 'Invalid value' : first.message);
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const props = { spec, onChange: change, context, disabled };
  let control;
  switch (spec.kind) {
    case 'seg':
      control = <SegControl {...props} />;
      break;
    case 'select':
      control = <SelectControl {...props} />;
      break;
    case 'stepper':
    case 'number':
      control = <StepperControl {...props} />;
      break;
    case 'check':
      control = <CheckControl {...props} />;
      break;
    case 'text':
    case 'textarea':
      control = <TextControl {...props} />;
      break;
    case 'icon':
      control = <IconControl {...props} />;
      break;
    case 'asset':
      control = <AssetControl {...props} />;
      break;
    case 'json':
      control = <JsonControl {...props} />;
      break;
    case 'readonly':
      control = (
        <span className="ts-insp-value" aria-label={spec.label} data-control={spec.control}>
          {shown(spec.value)}
        </span>
      );
      break;
  }

  const wide =
    spec.kind === 'text' ||
    spec.kind === 'textarea' ||
    spec.kind === 'asset' ||
    spec.kind === 'json';

  return (
    <div className={cn('ts-insp-row', `is-${spec.kind}`, wide && 'is-wide')} data-path={spec.path}>
      <span className="ts-insp-label" title={spec.inspector.help}>
        {rowLabel(spec)}
      </span>
      <div className="ts-insp-field">{control}</div>
      {error ? (
        <span className="ts-insp-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
