import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '../lib/cn';
import { PICKERS } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { anchoredAt } from './ColorPlate';

import './Pickers.css';

/**
 * The weight list (gslides-parity SPEC-2 0.27, 4.2): the border, line or outline weights a block
 * takes, anchored under a toolbar button or a menu row (Format > Borders & lines > Border weight).
 * A `listbox` of `option` rows the arrows walk; Enter picks, Esc closes and returns focus. The
 * caller says which weights apply (0 reads None, Google's Transparent) and writes the field.
 */
export type WeightListProps = {
  anchor: HTMLElement;
  label: string;
  weights: ReadonlyArray<number>;
  current: number | undefined;
  onPick: (weight: number) => void;
  onClose: () => void;
  control: string;
};

export function WeightList({
  anchor,
  label,
  weights,
  current,
  onPick,
  onClose,
  control,
}: WeightListProps) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, weights.indexOf(current ?? 1)));
  const at = anchoredAt(anchor, 140, 32 * weights.length + 16);
  const words = PICKERS.weights;

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (root.current?.contains(event.target) || anchor.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    root.current?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, onClose]);

  const active = weights[Math.min(index, weights.length - 1)];
  const tip = tipProps({ name: label, doc: words.list, key: 'Enter' });
  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    tip.onKeyDown(event);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      anchor.focus();
      return;
    }
    let next = index;
    if (event.key === 'ArrowDown') next = Math.min(weights.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = weights.length - 1;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (active !== undefined) onPick(active);
      return;
    } else return;
    event.preventDefault();
    setIndex(next);
  };

  return (
    <div
      ref={root}
      className="ts-plate-anchored ts-picker-list ts-weights ts-chrome"
      role="listbox"
      aria-label={label}
      aria-activedescendant={active === undefined ? undefined : `${control}-${active}`}
      tabIndex={0}
      style={{ left: at.left, top: at.top }}
      data-control={`${control}.plate`}
      {...tip}
      onKeyDown={onKey}
    >
      {weights.map((weight, i) => (
        <div
          key={weight}
          id={`${control}-${weight}`}
          role="option"
          aria-selected={current === weight}
          className={cn(
            'ts-picker-row',
            i === index && 'is-active',
            current === weight && 'is-picked',
          )}
          data-control={`${control}.${weight}`}
          {...tipProps({ name: weight === 0 ? words.none : words.px(weight) })}
          onMouseEnter={(event) => {
            tipProps({ name: weight === 0 ? words.none : words.px(weight) }).onMouseEnter(event);
            setIndex(i);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onPick(weight);
          }}
        >
          <span className="ts-picker-check" aria-hidden="true">
            ✓
          </span>
          <svg viewBox="0 0 48 8" width={48} height={8} aria-hidden="true">
            {weight === 0 ? null : (
              <line x1={0} y1={4} x2={48} y2={4} stroke="currentColor" strokeWidth={weight} />
            )}
          </svg>
          <span>{weight === 0 ? words.none : words.px(weight)}</span>
        </div>
      ))}
    </div>
  );
}
