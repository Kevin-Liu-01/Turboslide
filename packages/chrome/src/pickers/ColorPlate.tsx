import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { BrandKit, KitColor } from '@turboslide/schema/brand';
import { KIT_COLORS, KIT_COLOR_TOKENS, KIT_COLOR_WORDS } from '@turboslide/schema/brand';
import { COLOR_LABELS, COLOR_TOKENS, isHexColor } from '@turboslide/schema/color';
import type { Color, ColorToken } from '@turboslide/schema/color';
import type { Appearance } from '@turboslide/schema/deck';
import { TOKENS } from '@turboslide/theme/tokens';

import { swatchPaint } from '../inspector/palette';
import { cn } from '../lib/cn';
import { useMountEffect } from '../lib/useMountEffect';
import { PICKERS } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './Pickers.css';

/**
 * The colour plate (gslides-parity SPEC 3.2 rows 8, 9, 17; SPEC-2 0.27, 4.2; docs/PRODUCT.md
 * 4.1): the brand kit's six colours first (Text, Background, Captions, Hints, Primary, Accent,
 * each writing its token so the colour follows the kit; the role's name and hex in the tooltip,
 * the token id on its second line for agents), the theme tokens second, then None and the Custom
 * hex field, anchored under a toolbar button or a menu row (Format > Borders & lines > Border
 * color). `tones` is the older heading and paragraph form: Ink and Muted only, kept for a block
 * whose schema takes a tone and no colour. The plate is a dialog that closes on Esc (focus
 * returns to the anchor) and on a click outside; the caller writes the field the plate stands
 * for. The container is `<control>.menu` (audit-brand 11: it shared `.plate` with the plate
 * token's swatch).
 */
export type ColorPlateProps = {
  anchor: HTMLElement;
  /** the accessible name: the control's label */
  label: string;
  current: Color | 'none' | undefined;
  /** Ink and Muted only (a heading or paragraph tone) */
  tones?: boolean;
  /** the deck's brand kit and appearance, for the kit row's hexes; the theme's values when absent */
  kit?: BrandKit | undefined;
  appearance?: Appearance;
  onPick: (value: Color | 'none') => void;
  onClose: () => void;
  control: string;
};

/** The hex a kit role shows in an appearance: the kit's own value, else the theme token's. */
export function kitRoleHex(
  kit: BrandKit | undefined,
  appearance: Appearance,
  role: KitColor,
): string {
  const own = kit?.colors?.[appearance]?.[role];
  if (own !== undefined) return own;
  const token = KIT_COLOR_TOKENS[role] as keyof (typeof TOKENS)['light'];
  const value = TOKENS[appearance][token];
  return typeof value === 'string' ? value : '';
}

/** Where an anchored plate opens: under the anchor, kept inside the viewport. */
export function anchoredAt(
  anchor: HTMLElement,
  width = 160,
  height = 200,
): { left: number; top: number } {
  const rect = anchor.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 2;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - 2 - height);
  return { left, top };
}

export function ColorPlate({
  anchor,
  label,
  current,
  tones = false,
  kit,
  appearance = 'light',
  onPick,
  onClose,
  control,
}: ColorPlateProps) {
  const root = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState('');
  const at = anchoredAt(anchor);
  const words = PICKERS.colors;

  /* the first swatch takes the focus once, on mount (the focus round, cycle 3 fix; b3 C3-R1,
     VERIFICATION C3-F7). It sat in the listener effect below, which re-runs whenever the caller
     passes a fresh `onClose` (ToolbarTail's closure is new on every render of the tail, and on
     the memory tier a checkpoint lands as a revision 2 s after the last op, so the swatch write of
     the same plate re-rendered the tail while the hex value was typed); the re-run moved the
     focus from the hex field to the None swatch mid word, Enter landed on that button and the
     value never reached the shape */
  useMountEffect(() => {
    root.current?.querySelector<HTMLElement>('button')?.focus();
  });

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (root.current?.contains(event.target) || anchor.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, onClose]);

  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      anchor.focus();
    }
  };

  /* the kit's six colours first: each swatch writes its token (KIT_COLOR_TOKENS), so a heading
     painted Primary follows the kit when the kit changes; the swatch paints the kit's hex */
  const kitOptions: ReadonlyArray<{ value: ColorToken; role: KitColor; hex: string }> = tones
    ? []
    : KIT_COLORS.map((role) => ({
        value: KIT_COLOR_TOKENS[role] as ColorToken,
        role,
        hex: kitRoleHex(kit, appearance, role),
      }));
  const options: ReadonlyArray<{ value: Color | 'none'; label: string }> = tones
    ? [
        { value: 'ink', label: 'Ink' },
        { value: 'titanium', label: 'Muted' },
      ]
    : [
        ...COLOR_TOKENS.map((token) => ({ value: token, label: COLOR_LABELS[token] })),
        { value: 'none', label: words.none },
      ];
  const shown: Color | 'none' = current ?? (tones ? 'ink' : 'none');
  const hexTip = tipProps({ name: words.custom, doc: words.hex, key: 'Enter' });

  return (
    <div
      ref={root}
      className="ts-plate-anchored ts-color-plate ts-chrome"
      role="dialog"
      aria-label={label}
      style={{ left: at.left, top: at.top }}
      data-control={`${control}.menu`}
      onKeyDown={onKey}
    >
      {kitOptions.length > 0 ? (
        <div className="ts-color-grid ts-color-kit" role="group" aria-label="Brand kit colours">
          {kitOptions.map((option) => (
            <button
              key={option.role}
              type="button"
              className={cn('ts-color-swatch', shown === option.value && 'is-on')}
              aria-label={KIT_COLOR_WORDS[option.role].name}
              aria-pressed={shown === option.value}
              data-control={`${control}.kit.${option.role}`}
              data-token={option.value}
              style={{ background: option.hex }}
              onClick={() => onPick(option.value)}
              {...tipProps({
                name: `${KIT_COLOR_WORDS[option.role].name} ${option.hex}`,
                doc: `${KIT_COLOR_WORDS[option.role].line}; the token ${option.value}`,
              })}
            />
          ))}
        </div>
      ) : null}
      <div className="ts-color-grid">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              'ts-color-swatch',
              shown === option.value && 'is-on',
              option.value === 'none' && 'is-none',
            )}
            aria-label={option.label}
            aria-pressed={shown === option.value}
            data-control={`${control}.${option.value}`}
            style={option.value === 'none' ? undefined : { background: swatchPaint(option.value) }}
            onClick={() => onPick(option.value)}
            {...tipProps({ name: option.label })}
          />
        ))}
      </div>
      {tones ? null : (
        <label className="ts-color-hex">
          <span>{words.custom}</span>
          <input
            type="text"
            value={hex}
            placeholder="#rrggbb"
            aria-label={words.custom}
            data-control={`${control}.hex`}
            spellCheck={false}
            autoComplete="off"
            {...hexTip}
            onChange={(event) => setHex(event.target.value)}
            onKeyDown={(event) => {
              hexTip.onKeyDown(event);
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const value = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
              if (isHexColor(value)) onPick(value);
            }}
          />
        </label>
      )}
    </div>
  );
}
