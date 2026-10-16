// The clustered-dot screen of the dither pattern 'halftone' (the Glyphfield port, wave 2.4): the
// look of Glyphfield's halftone converter (`renderHalftone` in its src/lib/compositionEffects.ts,
// MIT, Kevin Liu: round dots on offset rows that grow with the tone) as one more threshold table
// beside BAYER8_THRESHOLDS, so the block dither's integer pipeline, its agreement between the
// worker, the sheet runtime and Node, and its 1-bit export variants hold as they are. Glyphfield's
// float coverage code is not ported.
//
// The tile is 8 by 8 cells with two dot centres, at the cell corners (2, 2) and (6, 6). Repeated,
// they make a square lattice turned 45 degrees with a pitch of 4 times the square root of 2 cells,
// the classic print screen angle; the gaps between the dots, at (2, 6) and (6, 2), are a second
// lattice of the same shape. Every cell is ranked by its squared distance to the nearest dot centre
// (whole numbers in half cells, so no float enters), then by the dot, the row and the column, and
// takes the threshold trunc((rank + 0.5) / 64 * 255), the scale bayer8 uses. A tone lights the cells
// whose threshold it exceeds, so the lit cells grow as round dots from the two centres, touch at
// the middle grey as a checkerboard of diamonds, and close down to dark dots at the gaps.

/** The tile's side in cells. */
export const HALFTONE_TILE = 8;

/** The two dot centres of the tile, in half cells (cell corners (2, 2) and (6, 6)). */
const CENTRES: readonly (readonly [number, number])[] = [
  [4, 4],
  [12, 12],
];

/** The squared distance in half cells on the 16 half cell torus, and the dot it is nearest. */
function nearest(x: number, y: number): { d2: number; dot: number } {
  let best = { d2: Number.POSITIVE_INFINITY, dot: 0 };
  CENTRES.forEach(([cx, cy], dot) => {
    const span = HALFTONE_TILE * 2;
    const dx = Math.min(Math.abs(2 * x + 1 - cx), span - Math.abs(2 * x + 1 - cx));
    const dy = Math.min(Math.abs(2 * y + 1 - cy), span - Math.abs(2 * y + 1 - cy));
    const d2 = dx * dx + dy * dy;
    if (d2 < best.d2) best = { d2, dot };
  });
  return best;
}

/** The 64 thresholds, row major: the cells ranked by distance to their dot centre. */
export const HALFTONE8_THRESHOLDS: Uint8Array = (() => {
  const cells: { x: number; y: number; d2: number; dot: number }[] = [];
  for (let y = 0; y < HALFTONE_TILE; y += 1)
    for (let x = 0; x < HALFTONE_TILE; x += 1) cells.push({ x, y, ...nearest(x, y) });
  cells.sort((a, b) => a.d2 - b.d2 || a.dot - b.dot || a.y - b.y || a.x - b.x);
  const out = new Uint8Array(HALFTONE_TILE * HALFTONE_TILE);
  cells.forEach((cell, rank) => {
    out[cell.y * HALFTONE_TILE + cell.x] = Math.trunc(((rank + 0.5) / 64) * 255);
  });
  return out;
})();
