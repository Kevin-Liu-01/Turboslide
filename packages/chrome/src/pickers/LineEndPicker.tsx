import { useEffect, useRef, useState } from 'react';

import { LINE_ENDS, LINE_END_LABELS, lineEndFilled, lineEndPath } from '@turboslide/schema/shapes';
import type { LineEnd } from '@turboslide/schema/shapes';

import { cn } from '../lib/cn';
import { PICKERS } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { gridKey } from './grid';

import './Pickers.css';

/**
 * The line decoration picker (gslides-parity SPEC-2 2.4.5, 4.2; R05 A10): Google's ten
 * decorations as tiles, 5 per row, each glyph a short line ending in `lineEndPath` from the
 * shape table (filled or stroked as the kind says). One focusable grid with `gridcell` tiles;
 * the arrows walk it, Enter picks. The caller writes `line.set` with `start` or `end`.
 */
export type LineEndPickerProps = {
  end: 'start' | 'end';
  onPick: (kind: LineEnd) => void;
  picked?: LineEnd;
  autoFocus?: boolean;
  control?: string;
};

export const LINE_END_COLUMNS = 5;

function EndGlyph({ kind, end }: { kind: LineEnd; end: 'start' | 'end' }) {
  const path = lineEndPath(kind);
  const filled = lineEndFilled(kind);
  /* the line runs left to right; a start decoration points left, so the glyph is mirrored */
  const flip = end === 'start' ? 'translate(28 0) scale(-1 1)' : undefined;
  return (
    <svg viewBox="0 0 28 12" width={28} height={12} aria-hidden="true">
      <g transform={flip}>
        <line
          x1={2}
          y1={6}
          x2={kind === 'none' ? 26 : 20}
          y2={6}
          stroke="currentColor"
          strokeWidth={1.5}
        />
        {path === '' ? null : (
          <path
            d={path}
            transform="translate(26 6)"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={1.2}
          />
        )}
      </g>
    </svg>
  );
}

export function LineEndPicker({
  end,
  onPick,
  picked,
  autoFocus = false,
  control,
}: LineEndPickerProps) {
  const root = useRef<HTMLDivElement>(null);
  const prefix = control ?? `line${end === 'start' ? 'Start' : 'End'}`;
  const [index, setIndex] = useState(() => Math.max(0, LINE_ENDS.indexOf(picked ?? 'none')));
  const words = PICKERS.lineEnds;

  useEffect(() => {
    if (autoFocus) root.current?.focus();
  }, [autoFocus]);

  const active = LINE_ENDS[Math.min(index, LINE_ENDS.length - 1)];
  const tip = tipProps({ name: words.grid, doc: words.doc, key: 'Enter' });

  return (
    <div className="ts-picker ts-line-ends" data-control={`${prefix}.plate`}>
      <div
        ref={root}
        className="ts-picker-grid"
        role="grid"
        aria-label={words.grid}
        aria-activedescendant={active === undefined ? undefined : `ts-lineend-${end}-${active}`}
        tabIndex={0}
        style={{ gridTemplateColumns: `repeat(${LINE_END_COLUMNS}, 40px)` }}
        data-control={`${prefix}.grid`}
        {...tip}
        onKeyDown={(event) => {
          tip.onKeyDown(event);
          const result = gridKey(event, index, LINE_ENDS.length, LINE_END_COLUMNS);
          if (result === null) return;
          event.preventDefault();
          event.stopPropagation();
          if ('pick' in result) {
            if (active !== undefined) onPick(active);
            return;
          }
          setIndex(result.index);
        }}
      >
        {LINE_ENDS.map((kind, at) => (
          <div
            key={kind}
            id={`ts-lineend-${end}-${kind}`}
            role="gridcell"
            aria-label={LINE_END_LABELS[kind]}
            aria-selected={at === index}
            className={cn(
              'ts-picker-tile',
              at === index && 'is-active',
              picked === kind && 'is-picked',
            )}
            data-control={`${prefix}.pick.${kind}`}
            {...tipProps({ name: LINE_END_LABELS[kind] })}
            onMouseEnter={(event) => {
              tipProps({ name: LINE_END_LABELS[kind] }).onMouseEnter(event);
              setIndex(at);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onPick(kind);
            }}
          >
            <EndGlyph kind={kind} end={end} />
          </div>
        ))}
      </div>
    </div>
  );
}
