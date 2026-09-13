import { useEffect, useRef, useState } from 'react';

import { BULLET_PRESETS, NUMBER_PRESETS, bulletGlyph, listNumeral } from '@turboslide/schema/text';
import type { BulletPreset, NumberPreset } from '@turboslide/schema/text';

import { cn } from '../lib/cn';
import { PICKERS } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { gridKey } from './grid';

import './Pickers.css';

/**
 * The bullet and numbering preset grids (gslides-parity SPEC-2 0.4, 2.2.13, 4.1; R05 B5, E3):
 * the nine bullet presets and the six numbering presets as tiles showing the preset's three level
 * forms (the glyphs, or "1. a. i."), 3 per row as Google's grid. One focusable grid with
 * `gridcell` tiles named after the preset; the arrows walk it, Enter picks, ArrowLeft on the first
 * column is left to the menu. A pick writes `text.list` through the caller.
 */
export type PresetPickerProps = {
  family: 'bullet' | 'number';
  onPick: (preset: BulletPreset | NumberPreset) => void;
  picked?: string;
  autoFocus?: boolean;
  control?: string;
};

export const PRESET_GRID_COLUMNS = 3;

/** A preset's accessible name: its three forms read aloud ("disc, circle, square"; "1. a. i."). */
export function presetLabel(family: 'bullet' | 'number', preset: string): string {
  return presetForms(family, preset).join(' ');
}

/** The three level forms a tile shows. */
export function presetForms(family: 'bullet' | 'number', preset: string): string[] {
  if (family === 'bullet')
    return [1, 2, 3].map((level) => bulletGlyph(preset as BulletPreset, level));
  return [1, 2, 3].map((level) =>
    listNumeral(preset as NumberPreset, level, [1, 1, 1].slice(0, level)),
  );
}

export function PresetPicker({
  family,
  onPick,
  picked,
  autoFocus = false,
  control,
}: PresetPickerProps) {
  const root = useRef<HTMLDivElement>(null);
  const presets: ReadonlyArray<string> = family === 'bullet' ? BULLET_PRESETS : NUMBER_PRESETS;
  const words = family === 'bullet' ? PICKERS.bullets : PICKERS.numbering;
  const prefix = control ?? (family === 'bullet' ? 'bullets' : 'numbering');
  const [index, setIndex] = useState(() => Math.max(0, presets.indexOf(picked ?? '')));

  useEffect(() => {
    if (autoFocus) root.current?.focus();
  }, [autoFocus]);

  const active = presets[Math.min(index, presets.length - 1)];
  const tip = tipProps({ name: words.grid, doc: words.doc, key: 'Enter' });

  return (
    <div className="ts-picker ts-presets" data-control={`${prefix}.plate`}>
      <div
        ref={root}
        className="ts-picker-grid"
        role="grid"
        aria-label={words.grid}
        aria-activedescendant={active === undefined ? undefined : `ts-preset-${active}`}
        tabIndex={0}
        style={{ gridTemplateColumns: `repeat(${PRESET_GRID_COLUMNS}, 96px)` }}
        data-control={`${prefix}.grid`}
        {...tip}
        onKeyDown={(event) => {
          tip.onKeyDown(event);
          const result = gridKey(event, index, presets.length, PRESET_GRID_COLUMNS);
          if (result === null) return;
          event.preventDefault();
          event.stopPropagation();
          if ('pick' in result) {
            if (active !== undefined) onPick(active as BulletPreset | NumberPreset);
            return;
          }
          setIndex(result.index);
        }}
      >
        {presets.map((preset, at) => (
          <div
            key={preset}
            id={`ts-preset-${preset}`}
            role="gridcell"
            aria-label={presetLabel(family, preset)}
            aria-selected={at === index}
            className={cn(
              'ts-picker-tile is-wide',
              at === index && 'is-active',
              picked === preset && 'is-picked',
            )}
            data-control={`${prefix}.pick.${preset}`}
            data-preset={preset}
            {...tipProps({ name: presetLabel(family, preset) })}
            onMouseEnter={(event) => {
              tipProps({ name: presetLabel(family, preset) }).onMouseEnter(event);
              setIndex(at);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onPick(preset as BulletPreset | NumberPreset);
            }}
          >
            <span className="ts-picker-glyphs" aria-hidden="true">
              {presetForms(family, preset).map((form, level) => (
                <span key={level}>{form}</span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
