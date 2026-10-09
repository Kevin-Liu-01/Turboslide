import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ICON_COLORS, ICON_NAMES, isIconName } from '@turboslide/schema/icon-names';
import type { IconColor, IconName } from '@turboslide/schema/icon-names';

import { Glyph, IconGrid, IconPicker } from '../IconPicker';
import { tipProps } from '../Tooltip';
import { usePlate, useStart } from '../usePlate';
import type { ControlProps } from './props';

import './icon.css';

/**
 * An Icon as the sprite picker (SPEC 6.5): the current glyph and its name on a button that opens
 * the shared IconPicker (IconPicker.tsx: the filter, every symbol of the theme's sprite, the tone
 * Seg `none | ok | warn | no | info` and the placement note, DECK-GRAMMAR.md:40). Two field
 * shapes share it: the Icon object { name, color? } and a bare IconName string (a diagram's icon,
 * the icon block's name). The field is a group named with the label and the data-control, and
 * the picker's tiles carry `<data-control>.<name>` (and `.none` on an optional field); while the
 * card is closed the tiles stay mounted and hidden, so set(label, 'x-circle') from the window API
 * clicks a tile and lands in the same onChange as a click (docs/DROPDOWNS.md 4.4).
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

/**
 * The picker card under the button, in the popover layer of the stacking scale (docs/DESIGN.md
 * 2.3, 2.4): over the panel's rows and its edge, and on the button while the panel scrolls. Its
 * search field takes the focus as it mounts, so it stands under the button until placed.
 */
function IconCard({ anchor, children }: { anchor: HTMLElement; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);
  const start = useStart(anchor, 'below', 4);
  usePlate(card, { layer: 'popover', anchor, side: 'below', align: 'end', gap: 4 });
  return (
    <div ref={card} className="ts-ctl-icon-card pt-float" style={start}>
      {children}
    </div>
  );
}

export function IconControl({ spec, onChange, disabled }: ControlProps) {
  const objectMode = spec.schema.def.type === 'object';
  const value = readValue(spec.value);
  /* the button the card hangs from while it is open */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor !== null;
  /* an optional field offers None, which removes the icon */
  const clearable = spec.optional;

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
    <span className="ts-ctl-icon" role="group" aria-label={spec.label} data-control={spec.control}>
      <button
        type="button"
        className="ts-ctl-icon-btn"
        aria-label={`${spec.label} picker`}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-control={`${spec.control}.picker`}
        disabled={disabled}
        onClick={(event) => setAnchor(open ? null : event.currentTarget)}
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
      {anchor !== null ? (
        <IconCard anchor={anchor}>
          <IconPicker
            label={spec.label}
            value={value.name}
            control={spec.control}
            onPick={(name) => {
              write({ ...value, name });
              setAnchor(null);
            }}
            onNone={
              clearable
                ? () => {
                    write({ ...value, name: undefined });
                    setAnchor(null);
                  }
                : undefined
            }
            onClose={() => setAnchor(null)}
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
        </IconCard>
      ) : (
        <IconGrid
          hidden
          label={spec.label}
          value={value.name}
          names={ICON_NAMES}
          tileControl={spec.control}
          onPick={(name) => write({ ...value, name })}
          onNone={clearable ? () => write({ ...value, name: undefined }) : undefined}
        />
      )}
    </span>
  );
}
