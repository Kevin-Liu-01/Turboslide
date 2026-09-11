import { useEffect, useRef, useState } from 'react';

import { ICON_COLORS, ICON_NAMES, iconSymbolId, isIconName } from '@turboslide/schema/icons';
import type { IconColor, IconName } from '@turboslide/schema/icons';

import { Seg } from '../Seg';
import type { SegOption } from '../Seg';
import { ToolButton } from '../ToolButton';
import type { ControlProps } from './props';
import { HIDDEN_NATIVE_CLASS } from './props';

import './icon.css';

/**
 * An Icon as the sprite picker (SPEC 6.5): the current glyph and its name on a button that opens
 * a card with a filter and every symbol of the theme's sprite (the 63 Heroicons plus gt-mark,
 * drawn through <use href="#i-name"> from the sprite the studio inlines once), a tone Seg
 * `none | ok | warn | no | info`, and the note stating where icons are allowed
 * (DECK-GRAMMAR.md:40). Two field shapes share it: the Icon object { name, color? } and a bare
 * IconName string inside a diagram. A visually hidden select over the names carries the label
 * and data-control, so set(label, 'x-circle') from the window API lands in the same onChange
 * as a click.
 */
const TONES: readonly SegOption<'none' | IconColor>[] = [
  { value: 'none', label: 'none', title: 'No hue: the icon takes the ink' },
  ...ICON_COLORS.map((color) => ({
    value: color,
    label: color,
    title: `Semantic hue ${color} (DECK-GRAMMAR.md:30)`,
  })),
];

const NOTE =
  'Icons sit at a rows key, at the start of a plain row, as a board state or inside a diagram, at 20 or 24 px (DECK-GRAMMAR.md:40).';

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

export function Glyph({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="ts-glyph" viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      <use href={`#${iconSymbolId(name)}`} />
    </svg>
  );
}

export function IconControl({ spec, onChange, disabled }: ControlProps) {
  const objectMode = spec.schema.def.type === 'object';
  const value = readValue(spec.value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const card = useRef<HTMLDivElement>(null);

  /* a click outside the card closes it; the listener lives only while the card is open */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (card.current && event.target instanceof Node && !card.current.contains(event.target))
        setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

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

  const q = query.trim().toLowerCase();
  const names = ICON_NAMES.filter((name) => q === '' || name.includes(q));

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
        title={`${spec.label}: pick a symbol`}
        aria-label={`${spec.label} picker`}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-control={`${spec.control}.picker`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {value.name ? <Glyph name={value.name} /> : <span className="ts-ctl-icon-none" />}
        <span className="ts-ctl-icon-name">{value.name ?? 'none'}</span>
        {value.color ? <span className="ts-ctl-icon-tone">{value.color}</span> : null}
      </button>
      {open ? (
        <div
          ref={card}
          className="ts-ctl-icon-card"
          role="dialog"
          aria-label={`${spec.label} symbols`}
        >
          <div className="ts-ctl-icon-tools">
            <input
              className="ts-ctl-icon-filter"
              type="search"
              value={query}
              placeholder="Filter symbols"
              aria-label={`${spec.label} filter`}
              autoComplete="off"
              spellCheck={false}
              ref={(el) => el?.focus()}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setOpen(false);
                }
              }}
            />
            <ToolButton
              title="Close"
              icon="close"
              ariaLabel={`${spec.label}: close the picker`}
              onClick={() => setOpen(false)}
            />
          </div>
          <div
            className="ts-ctl-icon-grid pt-scroll"
            role="listbox"
            aria-label={`${spec.label} symbols`}
          >
            {names.map((name) => (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={name === value.name}
                className={name === value.name ? 'ts-ctl-icon-cell is-on' : 'ts-ctl-icon-cell'}
                title={name}
                aria-label={`${spec.label} ${name}`}
                onClick={() => {
                  write({ ...value, name });
                  setOpen(false);
                }}
              >
                <Glyph name={name} size={20} />
              </button>
            ))}
            {names.length === 0 ? <p className="ts-ctl-icon-empty">No symbol matches.</p> : null}
          </div>
          {objectMode ? (
            <div className="ts-ctl-icon-tone-row">
              <span>Tone</span>
              <Seg
                options={TONES}
                value={value.color ?? 'none'}
                onChange={(tone) =>
                  write({ ...value, ...(tone === 'none' ? { color: undefined } : { color: tone }) })
                }
                label={`${spec.label} tone`}
                className="is-small ts-ctl-icon-tones"
                control={`${spec.control}.color`}
              />
            </div>
          ) : null}
          <p className="ts-ctl-icon-note">{NOTE}</p>
        </div>
      ) : null}
    </span>
  );
}
