import { useEffect, useRef, useState } from 'react';

import { DASHES, DASH_LABELS, dashArray } from '@turboslide/schema/shapes';
import type { Dash } from '@turboslide/schema/shapes';

import { cn } from '../lib/cn';
import { PICKERS } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './Pickers.css';

/**
 * The dash list (gslides-parity SPEC-2 0.13, 2.3.3, 4.2): Google's six dashes as rows, each with
 * a 64 px sample drawn with the shape table's `dashArray` at 2 px and the label; a `listbox` of
 * `option` rows the arrows walk, Enter picks. The caller writes the block's dash (`dashPlan`).
 */
export type DashListProps = {
  onPick: (dash: Dash) => void;
  picked?: Dash;
  autoFocus?: boolean;
  control?: string;
};

export function DashList({ onPick, picked, autoFocus = false, control = 'dash' }: DashListProps) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, DASHES.indexOf(picked ?? 'solid')));
  const words = PICKERS.dashes;

  useEffect(() => {
    if (autoFocus) root.current?.focus();
  }, [autoFocus]);

  const active = DASHES[Math.min(index, DASHES.length - 1)];
  const tip = tipProps({ name: words.list, doc: words.doc, key: 'Enter' });

  return (
    <div
      ref={root}
      className="ts-picker ts-picker-list ts-dashes"
      role="listbox"
      aria-label={words.list}
      aria-activedescendant={active === undefined ? undefined : `ts-dash-${active}`}
      tabIndex={0}
      data-control={`${control}.list`}
      {...tip}
      onKeyDown={(event) => {
        tip.onKeyDown(event);
        let next = index;
        if (event.key === 'ArrowDown') next = Math.min(DASHES.length - 1, index + 1);
        else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = DASHES.length - 1;
        else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          if (active !== undefined) onPick(active);
          return;
        } else return;
        event.preventDefault();
        event.stopPropagation();
        setIndex(next);
      }}
    >
      {DASHES.map((dash, at) => (
        <div
          key={dash}
          id={`ts-dash-${dash}`}
          role="option"
          aria-selected={picked === dash}
          className={cn(
            'ts-picker-row',
            at === index && 'is-active',
            picked === dash && 'is-picked',
          )}
          data-control={`${control}.pick.${dash}`}
          {...tipProps({ name: DASH_LABELS[dash] })}
          onMouseEnter={(event) => {
            tipProps({ name: DASH_LABELS[dash] }).onMouseEnter(event);
            setIndex(at);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onPick(dash);
          }}
        >
          <span className="ts-picker-check" aria-hidden="true">
            ✓
          </span>
          <svg viewBox="0 0 64 4" width={64} height={4} aria-hidden="true">
            <line
              x1={0}
              y1={2}
              x2={64}
              y2={2}
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray={dashArray(dash, 2) || undefined}
            />
          </svg>
          <span>{DASH_LABELS[dash]}</span>
        </div>
      ))}
    </div>
  );
}
