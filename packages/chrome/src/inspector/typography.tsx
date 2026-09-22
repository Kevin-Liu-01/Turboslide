import { DEFAULT_FONT_ID, isFontId } from '@turboslide/schema/fonts';
import {
  NUMERALS_SENTENCE,
  NUMERALS_UNAVAILABLE,
  WEIGHT_CAP,
  isLadderSize,
} from '@turboslide/schema/typography';
import { hasTabularFigures } from '@turboslide/render/fonts';

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
 *
 * The features round (docs/FEATURES.md 3.1 item 4; audit-fonts 2) adds the Tabular figures row
 * (`numerals`): a check row carrying the sentence "Every digit takes the same width, so numbers
 * line up in a column" under its label and in its tooltip, writing `typography.numerals:
 * 'tabular'` on and removing the field off, and disabled with "This face has no tabular figures"
 * when the block's family (the theme's Inter when absent) carries no `tnum`, read from the
 * catalog's flag through @turboslide/render/fonts. Its `data-control` is
 * `formatOptions.typography.numerals`, the id the matrix row `formatting.numerals.tabular-row`
 * parks (the `family` field itself is the toolbar's Font dropdown, not a row here).
 */
const FIELD_ICONS: Readonly<Record<string, IconName>> = {
  size: 'language',
  weight: 'language',
  align: 'text',
  tracking: 'swap',
  leading: 'sync',
  numerals: 'table-cells',
};

const UNITS: Readonly<Record<string, string>> = { size: 'px', tracking: 'em' };

/** The control id of the Tabular figures row (docs/FEATURES.md 3.1 item 4, 7.1 `parks`). */
export const NUMERALS_CONTROL = 'formatOptions.typography.numerals';

/** The family the row reads its `tnum` flag from: the block's, else the theme's face. */
export function numeralsFamily(current: Readonly<Record<string, unknown>>): string {
  const family = current.family;
  return typeof family === 'string' && isFontId(family) ? family : DEFAULT_FONT_ID;
}

/** True when the Tabular figures row is enabled for a typography object: its face has `tnum`. */
export function numeralsAvailable(current: Readonly<Record<string, unknown>>): boolean {
  const family = numeralsFamily(current);
  return isFontId(family) ? hasTabularFigures(family) : true;
}

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
        if (key === 'numerals')
          return (
            <NumeralsRow
              key={field.path}
              field={field}
              current={current}
              disabled={disabled}
              onChange={(value) => write(key, value)}
            />
          );
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

/**
 * The Tabular figures row (docs/FEATURES.md 3.1 item 4): the label with its sentence under it, a
 * native checkbox (so the keyboard and the window API's set(label, boolean) reach it) that writes
 * `'tabular'` on and removes the field off, and the on or off word. On a face without `tnum` the
 * row is disabled and its sentence and tooltip read "This face has no tabular figures".
 */
function NumeralsRow({
  field,
  current,
  disabled,
  onChange,
}: {
  field: ControlSpec;
  current: Readonly<Record<string, unknown>>;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const label = field.inspector.label;
  const available = numeralsAvailable(current);
  const checked = field.value === 'tabular';
  const sentence = available ? NUMERALS_SENTENCE : NUMERALS_UNAVAILABLE;
  const off = disabled === true || !available;
  return (
    <span
      className="ts-ctl-typo-row ts-ctl-typo-numerals"
      data-field="numerals"
      data-available={available ? 'yes' : 'no'}
    >
      <span className="ts-ctl-typo-label ts-ctl-typo-label-stack">
        <span className="ts-ctl-typo-label-line">
          <Icon name={FIELD_ICONS.numerals ?? 'language'} size={14} />
          <span>{label}</span>
        </span>
        <span className="ts-ctl-typo-sentence" data-control={`${NUMERALS_CONTROL}.sentence`}>
          {sentence}
        </span>
      </span>
      <span className="ts-ctl-typo-field">
        <label className="ts-ctl-check" {...tipProps({ name: label, doc: sentence, key: 'Space' })}>
          <input
            type="checkbox"
            aria-label={field.label}
            data-control={NUMERALS_CONTROL}
            checked={checked}
            disabled={off}
            aria-disabled={!available ? true : undefined}
            onChange={(event) => onChange(event.target.checked ? 'tabular' : undefined)}
          />
          <span className="ts-ctl-check-box" aria-hidden="true" />
          <span className="ts-ctl-check-word" aria-hidden="true">
            {checked ? 'on' : 'off'}
          </span>
        </label>
      </span>
    </span>
  );
}
