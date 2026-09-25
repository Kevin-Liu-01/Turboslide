import { useEffect, useRef, useState } from 'react';

import {
  SHAPE_CATEGORIES,
  SHAPE_CATEGORY_LABELS,
  SHAPE_PRESETS,
  shapePath,
} from '@turboslide/schema/shapes';
import type { ShapeCategory, ShapePresetRow } from '@turboslide/schema/shapes';

import { cn } from '../lib/cn';
import { PICKERS } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { gridKey } from './grid';

import './Pickers.css';

const tileTip = (name: string) => tipProps({ name });

/**
 * The shape picker (gslides-parity SPEC-2 2.3, 4.1, 6.2): Google's four categories as glyph
 * grids, 8 tiles per row, every glyph drawn from the shape table's own `shapePath(48, 36)` and
 * nothing copied from Google. One category when the row names one (Insert > Shape > Arrows), all
 * four under their headings otherwise (Mask image, Change shape). The grid is one focusable
 * control with `gridcell` tiles named after the preset, the arrows walk it, Enter picks, and
 * ArrowLeft on the first column is left to the menu. The vector round (docs/VECTOR.md 2.6): the
 * geometry interpreter answers `shapePath` for every preset, so every tile draws its own outline;
 * one `<path>` per tile still, since the joined `d` string carries every subpath of a multi path
 * preset. The grid is named after its category when it draws one (Insert > Shape > Arrows reads
 * Arrows) and Shapes when it draws all four (Change shape, Mask image). The control id is the
 * caller's row (`insert.shape.gallery.grid`, `insert.shape.gallery.pick.hexagon`).
 */
export type ShapePickerProps = {
  category?: ShapeCategory;
  onPick: (shape: string) => void;
  /** the preset picked now (Change shape), drawn with the ring */
  picked?: string;
  autoFocus?: boolean;
  control?: string;
};

export const SHAPE_GRID_COLUMNS = 8;
const GLYPH_W = 48;
const GLYPH_H = 36;

/** The tiles of a category in the table's order. */
export function shapeTiles(category?: ShapeCategory): ShapePresetRow[] {
  return SHAPE_PRESETS.filter((row) => category === undefined || row.category === category);
}

function Glyph({ id }: { id: string }) {
  return (
    <svg viewBox={`-2 -2 ${GLYPH_W + 4} ${GLYPH_H + 4}`} width={28} height={21} aria-hidden="true">
      <path
        d={shapePath(id, GLYPH_W, GLYPH_H)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShapePicker({
  category,
  onPick,
  picked,
  autoFocus = false,
  control = 'shapes',
}: ShapePickerProps) {
  const root = useRef<HTMLDivElement>(null);
  const tiles = shapeTiles(category);
  const [index, setIndex] = useState(() => {
    const at = tiles.findIndex((row) => row.id === picked);
    return at < 0 ? 0 : at;
  });
  const words = PICKERS.shapes;
  const categories = category === undefined ? SHAPE_CATEGORIES : [category];

  useEffect(() => {
    if (autoFocus) root.current?.focus();
  }, [autoFocus]);

  const active = tiles[Math.min(index, tiles.length - 1)];
  /* one category names the grid after itself; all four take the picker's name */
  const name = category === undefined ? words.grid : SHAPE_CATEGORY_LABELS[category];
  const tip = tipProps({ name, doc: words.doc, key: 'Enter' });
  let offset = 0;

  return (
    <div
      ref={root}
      className="ts-picker ts-shapes"
      role="grid"
      aria-label={name}
      data-category={category ?? 'all'}
      aria-activedescendant={active === undefined ? undefined : `ts-shape-${active.id}`}
      tabIndex={0}
      data-control={`${control}.grid`}
      {...tip}
      onKeyDown={(event) => {
        tip.onKeyDown(event);
        const result = gridKey(event, index, tiles.length, SHAPE_GRID_COLUMNS);
        if (result === null) return;
        event.preventDefault();
        event.stopPropagation();
        if ('pick' in result) {
          if (active !== undefined) onPick(active.id);
          return;
        }
        setIndex(result.index);
      }}
    >
      {categories.map((each) => {
        const rows = tiles.filter((row) => row.category === each);
        const start = offset;
        offset += rows.length;
        return (
          <div key={each} role="rowgroup" className="ts-picker-section">
            {category === undefined ? (
              <p className="ts-picker-title" role="presentation">
                {SHAPE_CATEGORY_LABELS[each]}
              </p>
            ) : null}
            <div
              className="ts-picker-grid"
              role="row"
              style={{ gridTemplateColumns: `repeat(${SHAPE_GRID_COLUMNS}, 40px)` }}
            >
              {rows.map((row, i) => {
                const at = start + i;
                return (
                  <div
                    key={row.id}
                    id={`ts-shape-${row.id}`}
                    role="gridcell"
                    aria-label={row.label}
                    aria-selected={at === index}
                    className={cn(
                      'ts-picker-tile',
                      at === index && 'is-active',
                      picked === row.id && 'is-picked',
                    )}
                    data-control={`${control}.pick.${row.id}`}
                    data-shape={row.id}
                    {...tileTip(row.label)}
                    onMouseEnter={(event) => {
                      tileTip(row.label).onMouseEnter(event);
                      setIndex(at);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPick(row.id);
                    }}
                  >
                    <Glyph id={row.id} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
