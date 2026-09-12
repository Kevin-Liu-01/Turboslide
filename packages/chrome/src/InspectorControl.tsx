import { useState } from 'react';

import type { Finding } from '@turboslide/schema/findings';

import { Icon } from './icons';
import type { ControlSpec } from './inspector/generate';
import { AssetControl } from './inspector/asset';
import { CheckControl } from './inspector/check';
import { IconControl } from './inspector/icon';
import { JsonControl } from './inspector/json';
import { LintMark } from './inspector/lint-mark';
import { PaletteControl } from './inspector/palette';
import { PositionControl } from './inspector/position';
import type { ControlContext } from './inspector/props';
import { controlIcon } from './inspector/sections';
import { SegControl } from './inspector/seg';
import { SelectControl } from './inspector/select';
import { StepperControl } from './inspector/stepper';
import { TextControl } from './inspector/text';
import { TypographyControl } from './inspector/typography';
import { cn } from './lib/cn';
import { tipProps } from './Tooltip';

import './InspectorControl.css';

/**
 * One 32px ruled row of the inspector (SPEC 6.5): the property's icon and label at the left, the
 * control the spec's kind names at the right, the lint marks of the findings that name the
 * property, and the validation note under them when a value did not parse. The label carries the
 * tooltip: the property's name, the annotation's help sentence and the JSON pointer. The row
 * validates every value against the field's Zod schema before it reports it, so a control emits
 * only values the reducer will accept, and the Inspector turns the report into one block.set or
 * slide.set write. Rows draw --pt-hair-soft under themselves; the section body removes it from
 * the last one (SPEC 2.2 line law). The three kinds of the freeform round (color, typography,
 * position) take the wide row with their sub-rows under the label.
 */
export type InspectorControlProps = {
  spec: ControlSpec;
  /** the validated value, or undefined to remove the field */
  onChange: (value: unknown) => void;
  context?: ControlContext;
  disabled?: boolean;
  /** the findings of the row's owner (the block or the slide); the ones naming this path show as marks */
  findings?: ReadonlyArray<Finding>;
  /** the row draws no glyph before its label (the dither section's compact rows) */
  plain?: boolean;
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

/** The findings that name a control's path, or a path under it (a composite's fields). */
export function findingsForPath(
  findings: ReadonlyArray<Finding> | undefined,
  path: string,
): Finding[] {
  if (findings === undefined) return [];
  return findings.filter(
    (finding) =>
      finding.path !== undefined && (finding.path === path || finding.path.startsWith(`${path}/`)),
  );
}

/** The kinds that take the full row width, their control under the label. */
const WIDE_KINDS: ReadonlySet<ControlSpec['kind']> = new Set([
  'text',
  'textarea',
  'asset',
  'json',
  'color',
  'typography',
  'position',
]);

export function InspectorControl({
  spec,
  onChange,
  context,
  disabled,
  findings,
  plain = false,
}: InspectorControlProps) {
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
    case 'color':
      control = <PaletteControl {...props} />;
      break;
    case 'typography':
      control = <TypographyControl {...props} />;
      break;
    case 'position':
      control = <PositionControl {...props} />;
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

  const wide = WIDE_KINDS.has(spec.kind);
  const marks = findingsForPath(findings, spec.path);
  const label = rowLabel(spec);
  const doc = spec.inspector.help ?? `${label} of the ${spec.label.split(':')[0] ?? 'object'}.`;

  return (
    <div
      className={cn('ts-insp-row', `is-${spec.kind}`, wide && 'is-wide', plain && 'is-plain')}
      data-path={spec.path}
    >
      <span
        className="ts-insp-label"
        tabIndex={-1}
        {...tipProps({ name: label, doc: `${doc} (${spec.path})` })}
      >
        {plain ? null : (
          <span className="ts-insp-label-icon" aria-hidden="true">
            <Icon name={controlIcon(spec)} size={14} />
          </span>
        )}
        <span className="ts-insp-label-text">{label}</span>
        {marks.length > 0 ? (
          <span className="ts-insp-marks">
            {marks.map((finding) => (
              <LintMark
                key={finding.id}
                rule={finding.rule}
                severity={finding.severity}
                proposal={finding.proposal}
              />
            ))}
          </span>
        ) : null}
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
