import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { ICON_COLORS, ICON_NAMES, iconSymbolId } from '@turboslide/schema/icons';
import type { IconColor, IconName } from '@turboslide/schema/icons';

import { Seg } from './Seg';
import type { SegOption } from './Seg';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './IconPicker.css';

/**
 * The picker over the theme's sprite (SPEC 6.5: "Icon becomes the sprite picker"): a filter,
 * the 8-column grid of every symbol (the 63 Heroicons plus gt-mark, drawn through
 * <use href="#i-name"> from the sprite the studio inlines once), an optional tone Seg
 * `none | ok | warn | no | info` and the note stating where icons are allowed
 * (DECK-GRAMMAR.md:40). One card serves three places: the inspector's icon control
 * (inspector/icon.tsx), the Icon primitive of the Insert menu (InsertMenu.tsx) and the palette's
 * icon prompt (Palette.tsx), so the chrome has one picker. The card holds the filter and nothing
 * else; the caller owns the value and closes the card. Every cell carries a tooltip with the
 * symbol's name.
 */
const TONES: readonly SegOption<'none' | IconColor>[] = [
  { value: 'none', label: 'none', title: 'No hue', doc: 'The icon takes the ink.' },
  ...ICON_COLORS.map((color) => ({
    value: color,
    label: color,
    title: `Tone ${color}`,
    doc: `The semantic hue ${color}, allowed on icons only (DECK-GRAMMAR.md:30).`,
  })),
];

export const ICON_PLACEMENT_NOTE =
  'Icons sit at a rows key, at the start of a plain row, as a board state or inside a diagram, at 20 or 24 px (DECK-GRAMMAR.md:40).';

/** A symbol from the sprite at 16px, fill currentColor. */
export function Glyph({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="ts-glyph" viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      <use href={`#${iconSymbolId(name)}`} />
    </svg>
  );
}

/** The symbols whose name contains the query, every one for an empty query. */
export function filterIcons(query: string): readonly IconName[] {
  const q = query.trim().toLowerCase();
  return q === '' ? ICON_NAMES : ICON_NAMES.filter((name) => name.includes(q));
}

export type IconPickerProps = {
  /** the accessible name prefix: `list: Icon 1`, `Insert icon` */
  label: string;
  value?: IconName;
  onPick: (name: IconName) => void;
  onClose: () => void;
  /** the tone Seg, when the field carries one (the Icon object) */
  tone?: { value: IconColor | undefined; onChange: (tone: IconColor | undefined) => void };
  /** the data-control prefix for the filter and the tone Seg */
  control?: string;
  /** the card closes when the pointer presses outside it; off when the caller owns that */
  closeOnOutsidePress?: boolean;
  className?: string;
};

export function IconPicker({
  label,
  value,
  onPick,
  onClose,
  tone,
  control,
  closeOnOutsidePress = true,
  className,
}: IconPickerProps) {
  const [query, setQuery] = useState('');
  const card = useRef<HTMLDivElement>(null);

  /* a press outside the card closes it; the listener lives only while the card is mounted */
  useEffect(() => {
    if (!closeOnOutsidePress) return;
    const onDown = (event: MouseEvent) => {
      if (card.current && event.target instanceof Node && !card.current.contains(event.target))
        onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [closeOnOutsidePress, onClose]);

  const names = filterIcons(query);
  const filterTip = tipProps({
    name: 'Filter symbols',
    doc: 'Type part of a Heroicons name; Enter picks the first match.',
    key: 'Enter',
  });

  const onFilterKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Enter') {
      const first = names[0];
      if (first !== undefined) {
        event.preventDefault();
        onPick(first);
      }
    }
  };

  return (
    <div
      ref={card}
      className={['ts-iconpicker', className ?? ''].filter(Boolean).join(' ')}
      role="dialog"
      aria-label={`${label} symbols`}
      data-control={control ? `${control}.picker` : undefined}
    >
      <div className="ts-iconpicker-tools">
        <input
          className="ts-iconpicker-filter"
          type="search"
          value={query}
          placeholder="Filter symbols"
          aria-label={`${label} filter`}
          data-control={control ? `${control}.filter` : undefined}
          autoComplete="off"
          spellCheck={false}
          ref={(el) => el?.focus()}
          {...filterTip}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            filterTip.onKeyDown(event);
            onFilterKey(event);
          }}
        />
        <ToolButton
          title="Close the picker (Esc)"
          icon="close"
          ariaLabel={`${label}: close the picker`}
          onClick={onClose}
        />
      </div>
      <div className="ts-iconpicker-grid pt-scroll" role="listbox" aria-label={`${label} symbols`}>
        {names.map((name) => (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={name === value}
            className={name === value ? 'ts-iconpicker-cell is-on' : 'ts-iconpicker-cell'}
            aria-label={`${label} ${name}`}
            onClick={() => onPick(name)}
            {...tipProps({ name, doc: `Heroicons 20 solid ${name} from the theme sprite.` })}
          >
            <Glyph name={name} size={20} />
          </button>
        ))}
        {names.length === 0 ? <p className="ts-iconpicker-empty">No symbol matches.</p> : null}
      </div>
      {tone ? (
        <div className="ts-iconpicker-tone">
          <span>Tone</span>
          <Seg
            options={TONES}
            value={tone.value ?? 'none'}
            onChange={(next) => tone.onChange(next === 'none' ? undefined : next)}
            label={`${label} tone`}
            className="is-small ts-iconpicker-tones"
            control={control ? `${control}.color` : undefined}
          />
        </div>
      ) : null}
      <p className="ts-iconpicker-note">{ICON_PLACEMENT_NOTE}</p>
    </div>
  );
}
