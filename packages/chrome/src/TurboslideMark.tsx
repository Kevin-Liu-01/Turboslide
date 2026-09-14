import type { SVGProps } from 'react';

import {
  CELL_THRESHOLD_PX,
  MARK_LABEL,
  PATH_UNITS,
  TILE_SIZES,
  cellRuns,
  markBits,
  markGrid,
  markPath,
  tileMarkPath,
} from '@turboslide/theme/brand';

import { cn } from './lib/cn';

/**
 * The Turboslide mark (gslides-parity SPEC-4 0.2, 0.5, 1.1, 1.10): a slide and the plate cut
 * from it, drawn from the one geometry module (`@turboslide/theme/brand`) so the title row, the
 * app bar, the print bar, Not found and the favicon are one form. Below 64 px it is the solid
 * even odd path on the 16 unit box; from 64 px it is the cells of `markBits(N)` on the size's
 * own cell grid (2 px at 64, 4 px from 128, 8 px from 512), never resampled. `currentColor`
 * throughout, `shape-rendering: crispEdges`. Alone it is `role="img"` named "Turboslide"; beside
 * the word pass `aria-hidden` so the name is read once (1.12). `tile` draws the tile of 0.4 (the
 * plate, the 1 px frame in the edge role, the inset mark) at 16, 32 or 48 px in the host's
 * tokens; it is the favicon's composition in chrome. New in Turboslide (no Prototemplate source;
 * GtMark.tsx stays for the sheet's content).
 */
export type TurboslideMarkProps = {
  /** the drawn size in CSS px; 24 is the title row (`--ts-mark`), 16 the app bar, 64 Not found */
  size: number;
  /** the tile of SPEC-4 0.4 instead of the bare mark; the size must be 16, 32 or 48 */
  tile?: boolean;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'children' | 'viewBox'>;

function isTileSize(size: number): size is 16 | 32 | 48 {
  return size === 16 || size === 32 || size === 48;
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
        shapeRendering="crispEdges"
        data-size={size}
        data-tile=""
      >
        <rect className="ts-tile-plate" x="0" y="0" width={size} height={size} />
        <rect className="ts-tile-frame" x="0.5" y="0.5" width={size - 1} height={size - 1} />
        <path className="ts-tile-mark" fillRule="evenodd" d={tileMarkPath(geometry)} />
      </svg>
    );
  }
  if (size < CELL_THRESHOLD_PX) {
    return (
      <svg
        {...rest}
        {...name}
        className={cn('ts-mark', className)}
        width={size}
        height={size}
        viewBox={`0 0 ${PATH_UNITS} ${PATH_UNITS}`}
        fill="currentColor"
        shapeRendering="crispEdges"
        data-size={size}
      >
        <path fillRule="evenodd" d={markPath(PATH_UNITS / 8)} />
      </svg>
    );
  }
  const { n } = markGrid(size);
  const runs = cellRuns(markBits(n));
  return (
    <svg
      {...rest}
      {...name}
      className={cn('ts-mark', className)}
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      fill="currentColor"
      shapeRendering="crispEdges"
      data-size={size}
      data-cells={n}
    >
      {runs.map((run) => (
        <rect key={`${run.y}-${run.x}`} x={run.x} y={run.y} width={run.width} height={1} />
      ))}
    </svg>
  );
}
