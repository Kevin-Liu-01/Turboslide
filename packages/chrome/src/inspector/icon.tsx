import { useState } from 'react';

import { ICON_COLORS, ICON_NAMES, isIconName } from '@turboslide/schema/icons';
import type { IconColor, IconName } from '@turboslide/schema/icons';

import { Glyph, IconPicker } from '../IconPicker';
import { tipProps } from '../Tooltip';
import type { ControlProps } from './props';
import { HIDDEN_NATIVE_CLASS } from './props';

import './icon.css';

/**
 * An Icon as the sprite picker (SPEC 6.5): the current glyph and its name on a button that opens
 * the shared IconPicker (IconPicker.tsx: the filter, every symbol of the theme's sprite, the tone
 * Seg `none | ok | warn | no | info` and the placement note, DECK-GRAMMAR.md:40). Two field
 * shapes share it: the Icon object { name, color? } and a bare IconName string (a diagram's icon,
 * the icon block's name). A visually hidden select over the names carries the label and
 * data-control, so set(label, 'x-circle') from the window API lands in the same onChange as a
 * click.
 */
export { Glyph } from '../IconPicker';

type IconValue = { name?: IconName; color?: IconColor };

function readValue(value: unknown): IconValue {
  if (typeof value === 'string') return isIconName(value) ? { name: value } : {};
  if (value !== null && typeof value === 'object') {
    const record = value as { name?: unknown; color?: unknown };
    const name =
      typeof record.name === 'string' && isIconName(record.name) ? record.name : undefined;
    const color =
      typeof record.color === 'string' &&
      (ICON_COLORS as ReadonlyArray<string>).includes(record.color)
        ? (record.color as IconColor)
        : undefined;
    return { ...(name ? { name } : {}), ...(color ? { color } : {}) };
  }
  return {};
}

export function IconControl({ spec, onChange, disabled }: ControlProps) {
  const objectMode = spec.schema.def.type === 'object';
  const value = readValue(spec.value);
  const [open, setOpen] = useState(false);

  const write = (next: IconValue) => {
    if (disabled) return;
    if (!objectMode) {
      onChange(next.name);
      return;
    }
    if (next.name === undefined) {
      if (spec.optional) onChange(undefined);
      return;
    }
    onChange({ name: next.name, ...(next.color ? { color: next.color } : {}) });
  };

  return (
    <span className="ts-ctl-icon">
      <select
        className={HIDDEN_NATIVE_CLASS}
        aria-label={spec.label}
        data-control={spec.control}
        value={value.name ?? ''}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          write({ ...value, ...(isIconName(raw) ? { name: raw } : { name: undefined }) });
        }}
      >
        <option value="">none</option>
        {ICON_NAMES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="ts-ctl-icon-btn"
        aria-label={`${spec.label} picker`}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-control={`${spec.control}.picker`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        {...tipProps({
          name: spec.inspector.label,
          doc:
            spec.inspector.help ??
            'Opens the picker over the theme sprite: 63 Heroicons plus the GT mark, with the tone.',
        })}
      >
        {value.name ? <Glyph name={value.name} /> : <span className="ts-ctl-icon-none" />}
        <span className="ts-ctl-icon-name">{value.name ?? 'none'}</span>
        {value.color ? <span className="ts-ctl-icon-tone">{value.color}</span> : null}
      </button>
      {open ? (
        <IconPicker
          className="ts-ctl-icon-card"
          label={spec.label}
          value={value.name}
          control={spec.control}
          onPick={(name) => {
            write({ ...value, name });
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          tone={
            objectMode
              ? {
                  value: value.color,
                  onChange: (tone) =>
                    write({
                      ...value,
                      ...(tone === undefined ? { color: undefined } : { color: tone }),
                    }),
                }
              : undefined
          }
        />
      ) : null}
    </span>
  );
}
