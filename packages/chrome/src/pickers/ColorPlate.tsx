import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { COLOR_LABELS, COLOR_TOKENS, isHexColor } from '@turboslide/schema/color';
import type { Color } from '@turboslide/schema/color';

import { swatchPaint } from '../inspector/palette';
import { cn } from '../lib/cn';
import { useMountEffect } from '../lib/useMountEffect';
import { PICKERS } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './Pickers.css';

/**
 * The colour plate (gslides-parity SPEC 3.2 rows 8, 9, 17; SPEC-2 0.27, 4.2): the twelve palette
 * swatches, None and a hex field, anchored under a toolbar button or a menu row (Format > Borders
 * & lines > Border color). `tones` is the heading and paragraph form: Ink and Muted only. The
 * plate is a dialog that closes on Esc (focus returns to the anchor) and on a click outside; the
 * caller writes the field the plate stands for.
 */
export type ColorPlateProps = {
  anchor: HTMLElement;
  /** the accessible name: the control's label */
  label: string;
  current: Color | 'none' | undefined;
  /** Ink and Muted only (a heading or paragraph tone) */
  tones?: boolean;
  onPick: (value: Color | 'none') => void;
  onClose: () => void;
  control: string;
};

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

  const options: ReadonlyArray<{ value: Color | 'none'; label: string }> = tones
    ? [
        { value: 'ink', label: 'Ink' },
        { value: 'titanium', label: 'Muted' },
      ]
    : [
        { value: 'none', label: words.none },
        ...COLOR_TOKENS.map((token) => ({ value: token, label: COLOR_LABELS[token] })),
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
      data-control={`${control}.plate`}
      onKeyDown={onKey}
    >
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
