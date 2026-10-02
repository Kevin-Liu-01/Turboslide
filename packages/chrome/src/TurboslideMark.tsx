import type { SVGProps } from 'react';

import { MARK_LABEL, TILE_SIZES, markPlacement, tileMarkPath } from '@turboslide/theme/brand';
import type { MarkPlacement } from '@turboslide/theme/brand';

import { cn } from './lib/cn';

/**
 * The Turboslide mark (docs/NEXT.md 4.1.2, 4.1.3 item 2): the T with three bars in the GT speed
 * register, drawn from the one geometry module (`@turboslide/theme/brand`) so the title row, the
 * /decks bar, the print bar, Not found and the favicon are one form. The size snaps to the
 * drawing's steps (`markStep`): under 24 px the 16 px rows (the one hand drawing, crisp edges),
 * under 32 px the 24 px square with the mark at a 16 px cap on whole rows, and from 32 px the
 * vector at the size itself with its cap in whole pixels and every horizontal edge on a whole row.
 * `currentColor` throughout. Alone it is `role="img"` named "Turboslide"; beside the word pass
 * `aria-hidden` so the name is read once. `tile` draws the favicon's tile (the plate, the 1 px
 * frame in the edge role, the mark) at 16, 32 or 48 px in the host's tokens. New in Turboslide
 * (no Prototemplate source; GtMark.tsx stays for the sheet's content).
 */
export type TurboslideMarkProps = {
  /** the requested size in CSS px; 24 is the title row (`--ts-mark`) and the 22 px word's lockup, 64 Not found */
  size: number;
  /** the tile of the icon set instead of the bare mark; the size must be 16, 32 or 48 */
  tile?: boolean;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'children' | 'viewBox'>;

function isTileSize(size: number): size is 16 | 32 | 48 {
  return size === 16 || size === 32 || size === 48;
}

/** One placement per size, computed once per module (seven quads and their path). */
const PLACEMENTS = new Map<number, MarkPlacement>();

function placementOf(size: number): MarkPlacement {
  let placement = PLACEMENTS.get(size);
  if (placement === undefined) {
    placement = markPlacement(size);
    PLACEMENTS.set(size, placement);
  }
  return placement;
}

export function TurboslideMark({ size, tile = false, className, ...rest }: TurboslideMarkProps) {
  const hidden = rest['aria-hidden'] === true || rest['aria-hidden'] === 'true';
  const name = hidden ? {} : { role: 'img', 'aria-label': rest['aria-label'] ?? MARK_LABEL };
  /* the size as presentation attributes, so a sheet's rule (the title row's --ts-mark) wins over them */
  if (tile) {
    if (!isTileSize(size))
      throw new RangeError(`the tile is drawn at 16, 32 or 48 px, not ${size}`);
    const geometry = TILE_SIZES[size];
    return (
      <svg
        {...rest}
        {...name}
        className={cn('ts-mark', 'ts-tile', className)}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering={geometry.form === 'rows' ? 'crispEdges' : undefined}
        data-size={size}
        data-form={geometry.form}
        data-tile=""
      >
        <rect className="ts-tile-plate" x="0" y="0" width={size} height={size} />
        <rect className="ts-tile-frame" x="0.5" y="0.5" width={size - 1} height={size - 1} />
        <path className="ts-tile-mark" d={tileMarkPath(geometry)} />
      </svg>
    );
  }
  const placement = placementOf(size);
  return (
    <svg
      {...rest}
      {...name}
      className={cn('ts-mark', className)}
      width={placement.size}
      height={placement.size}
      viewBox={`0 0 ${placement.size} ${placement.size}`}
      fill="currentColor"
      shapeRendering={placement.form === 'rows' ? 'crispEdges' : undefined}
      data-size={placement.size}
      data-form={placement.form}
      data-cap={placement.cap}
    >
      <path d={placement.d} />
    </svg>
  );
}
