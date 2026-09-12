import { WEIGHT_CAP, isLadderSize } from '@turboslide/schema/typography';

import { Icon } from '../icons';
import type { IconName } from '../icons';
import { tipProps } from '../Tooltip';
import { compositeControls } from './generate';
import type { ControlSpec } from './generate';
import { LintMark } from './lint-mark';
import type { ControlProps } from './props';
import { SegControl } from './seg';
import { StepperControl } from './stepper';

import './typography.css';

/**
 * The Typography object as one control (annotation control `typography`, schema/typography.ts;
 * Kevin, 2026-09-11: "font and typography controls"): a sub-row per field of the object, each
 * with its icon, its label, its tooltip from the field's help and the control the field's own
 * annotation asks for (a stepper through the type ladder for size, a stepper 300 to 700 for
 * weight, a Seg for alignment, steppers through the tracking and leading steps), so the five
 * controls are generated from the schema like every other one. Every change writes the whole
 * object in one block.set; clearing the last field removes it, so a slide written before the
 * round reads back unchanged. The 500 cap is a lint mark (type/weight-cap) beside the weight and
 * a size off the ladder a mark (type/ladder) beside the size, never a hard block.
 */
const FIELD_ICONS: Readonly<Record<string, IconName>> = {
  size: 'language',
  weight: 'language',
  align: 'text',
  tracking: 'swap',
  leading: 'sync',
};

const UNITS: Readonly<Record<string, string>> = { size: 'px', tracking: 'em' };

export function TypographyControl({ spec, onChange, context, disabled }: ControlProps) {
  const current =
    spec.value !== null && typeof spec.value === 'object'
      ? (spec.value as Record<string, unknown>)
      : {};
  const fields = compositeControls(spec);

  const write = (key: string, value: unknown) => {
    const next: Record<string, unknown> = { ...current };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(Object.keys(next).length === 0 ? undefined : next);
  };

  const markFor = (field: ControlSpec) => {
    const key = field.path.split('/').pop() ?? '';
    if (key === 'weight' && typeof field.value === 'number' && field.value > WEIGHT_CAP) {
      return (
        <LintMark
          rule="type/weight-cap"
          severity={3}
          proposal={`Display weight is capped at ${WEIGHT_CAP} (DECK-GRAMMAR.md:20); ${field.value} is over it.`}
        />
      );
    }
    if (key === 'size' && typeof field.value === 'number' && !isLadderSize(field.value)) {
      return (
        <LintMark
          rule="type/ladder"
          severity={2}
          proposal={`${field.value} px is not a step of the type ladder (head:59-65).`}
        />
      );
    }
    return null;
  };

  return (
    <span className="ts-ctl-typo" data-control={spec.control}>
      {fields.map((field) => {
        const key = field.path.split('/').pop() ?? '';
        const label = field.inspector.label;
        const unit = UNITS[key];
        const props = {
          spec: field,
          context,
          disabled,
          onChange: (value: unknown) => write(key, value),
        };
        return (
          <span key={field.path} className="ts-ctl-typo-row" data-field={key}>
            <span
              className="ts-ctl-typo-label"
              {...tipProps({
                name: label,
                doc:
                  field.inspector.help ?? `${label} of the text; absent keeps the grammar default.`,
              })}
            >
              <Icon name={FIELD_ICONS[key] ?? 'language'} size={14} />
              <span>{label}</span>
            </span>
            <span className="ts-ctl-typo-field">
              {field.kind === 'seg' ? <SegControl {...props} /> : <StepperControl {...props} />}
              {unit !== undefined ? (
                <span className="ts-ctl-typo-unit" aria-hidden="true">
                  {unit}
                </span>
              ) : null}
              {markFor(field)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
