// The Turboslide monogram of Round 1 (docs/NEXT.md 4.1.2): brand direction B's square form (the
// T with three speed bars under its left arm, clear of the stem, a 12 degree skew and the 8 unit
// cut that splits the middle bar; docs/gslides-parity/next/brand-b.md 33) built the way the GT
// bar monogram builds its T (Prototemplate scripts/build-speed-marks.mjs 94 to 142): rectangles
// in an upright space, sheared by tan(12 degrees), the cut applied to the geometry, so the file
// is plain parallelograms in one path with no mask, no id and no font. No Inter outline is used.
//
// Units are the GT monogram's: a cap of 120 units from y 40 to the baseline at y 160, the cut
// from y 96 to 104, the crossbar 30 units thick, the stem 34 units wide, the bars 30, 36 and 30
// units tall, the middle bar centred on the cut so the cut leaves two lines of 14 units.
//
// This module is data and pure functions: the sheet generator (build-sheet.mjs) writes the files
// and pages from it, and preview.mjs rasterises it without a browser.

export const SKEW_DEG = 12;
export const SKEW = Math.tan((SKEW_DEG * Math.PI) / 180);
export const CAP_TOP = 40;
export const BASELINE = 160;
export const CAP = BASELINE - CAP_TOP;
/** the GT monogram's cut (build-speed-marks.mjs 109), centred on mid cap height */
export const CUT = [96, 104];

/**
 * The parameters of the form, in units. `arm` is each arm of the T's crossbar measured from the
 * stem, `ext` the top bar's run past the left arm (the GT top bar's 22 unit rectangle, which
 * overlaps by 2), `gap` the clear space between a bar and the stem, `midOut` how far the middle
 * bar reaches past the top bar's end, `bottomIn` where the bottom bar starts after the top bar's
 * end. The defaults are brand-b's arrangement (marks-lib.mjs 458 to 466: the top bar 22 past the
 * arm, the middle bar 26 past it, 12 clear of the stem) at the GT monogram's stroke weights, with
 * the bottom bar started 12 units further left than brand-b's (16 in place of 28 after the top
 * bar's end), so a bar 30 units tall reads as a bar of 44 units and not as a 32 unit block.
 */
export const DEFAULTS = {
  arm: 50,
  stem: 34,
  bar: 30,
  ext: 22,
  gap: 12,
  midOut: 4,
  bottomIn: 16,
  midH: 36,
  bottomH: 30,
};

/** The rectangles in the upright space, [x, y, w, h], named; x 0 is the top bar's left end. */
export function rects(p = DEFAULTS) {
  const stemX = p.ext + p.arm;
  const barEnd = stemX - p.gap;
  const mid = [(CUT[0] + CUT[1]) / 2 - p.midH / 2, p.midH];
  return [
    { name: 'crossbar', r: [p.ext, CAP_TOP, p.arm * 2 + p.stem, p.bar] },
    { name: 'stem', r: [stemX, CAP_TOP, p.stem, CAP] },
    { name: 'top bar', r: [0, CAP_TOP, p.ext + 2, p.bar] },
    { name: 'middle bar', r: [-p.midOut, mid[0], barEnd + p.midOut, mid[1]] },
    { name: 'bottom bar', r: [p.bottomIn, BASELINE - p.bottomH, barEnd - p.bottomIn, p.bottomH] },
  ];
}

/** one decimal, as build-speed-marks.mjs `round` writes path data */
export const round1 = (n) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, '').replace(/^-0$/, '0');
export const round2 = (n) => (Math.round(n * 100) / 100).toString().replace(/\.00?$/, '').replace(/^-0$/, '0');

/** A rectangle under the skew, minus the cut: one or two parallelograms, each four [x, y] points. */
export function skewedPieces([x, y, w, h], cut = CUT) {
  const spans = [
    [y, Math.min(y + h, cut[0])],
    [Math.max(y, cut[1]), y + h],
  ].filter(([a, b]) => b > a);
  return spans.map(([y1, y2]) => [
    [x - SKEW * y1, y1],
    [x + w - SKEW * y1, y1],
    [x + w - SKEW * y2, y2],
    [x - SKEW * y2, y2],
  ]);
}

/** The monogram as polygons (each a parallelogram, clockwise on screen) */
export function polygons(p = DEFAULTS) {
  return rects(p).flatMap(({ r }) => skewedPieces(r));
}

/** path data for polygons, rounded the way the GT file rounds */
export function pathData(polys, round = round1) {
  return polys.map((pts) => 'M' + pts.map(([px, py]) => `${round(px)} ${round(py)}`).join('L') + 'Z').join('');
}

export function box(polys) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const pts of polys)
    for (const [x, y] of pts) {
      b.minX = Math.min(b.minX, x);
      b.minY = Math.min(b.minY, y);
      b.maxX = Math.max(b.maxX, x);
      b.maxY = Math.max(b.maxY, y);
    }
  b.w = b.maxX - b.minX;
  b.h = b.maxY - b.minY;
  return b;
}

/**
 * The 16 px drawing, the one hand drawing (docs/NEXT.md 4.1.2; DECK-GRAMMAR 53's exception,
 * recorded as a deviation in docs/brand.md by the build). At 16 px the 12 degree slant and the
 * 8 unit cut fall between pixels, so the form is set as whole pixels on a 12 px cap (rows 2 to
 * 13, ten units a pixel; the width is squeezed to 12 px): the crossbar three rows from column 3
 * to 13 with the top bar folded into a left arm of 5 px against a right arm of 3 px, the stem
 * three pixels stepped one pixel left after the cut and again at the bottom bar (the slant as
 * two steps over the cap, against tan 12 degrees' 2.55), the cut one clear row through the stem
 * and the middle bar, the middle bar as the two one pixel lines the cut leaves, the bottom bar
 * two rows, every bar one pixel clear of the stem and starting at column 2, one pixel left of
 * the crossbar, so the three runs step 5, 4 and 3 pixels with the stem. Columns 1 and 14 stay
 * clear for the tile's frame and its one pixel margin. # is ink.
 */
export const ROWS16 = [
  '................',
  '................',
  '...###########..',
  '...###########..',
  '...###########..',
  '........###.....',
  '........###.....',
  '..#####.###.....',
  '................',
  '..####.###......',
  '.......###......',
  '.......###......',
  '..###.###.......',
  '..###.###.......',
  '................',
  '................',
];

/** Candidate drawings the sheet's maker compared before choosing ROWS16 (preview.mjs) */
export const ROWS16_CANDIDATES = {
  chosen: ROWS16,
  'bottom bar from column 3': [
    '................',
    '................',
    '...###########..',
    '...###########..',
    '...###########..',
    '........###.....',
    '........###.....',
    '..#####.###.....',
    '................',
    '..####.###......',
    '.......###......',
    '.......###......',
    '...##.###.......',
    '...##.###.......',
    '................',
    '................',
  ],
  'cut on row 7': [
    '................',
    '................',
    '...###########..',
    '...###########..',
    '...###########..',
    '........###.....',
    '..#####.###.....',
    '................',
    '..####.###......',
    '.......###......',
    '.......###......',
    '...##.###.......',
    '...##.###.......',
    '...##.###.......',
    '................',
    '................',
  ],
  'crossbar from column 4': [
    '................',
    '................',
    '....##########..',
    '....##########..',
    '....##########..',
    '........###.....',
    '........###.....',
    '..#####.###.....',
    '................',
    '..####.###......',
    '.......###......',
    '.......###......',
    '..###.###.......',
    '..###.###.......',
    '................',
    '................',
  ],
};

/** rows of # and . as path data of whole pixel rectangles, one run per row segment */
export function pixelPath(rows, ox = 0, oy = 0) {
  let d = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w] === '#') w++;
      d += `M${x + ox} ${y + oy}h${w}v1h-${w}z`;
      x += w;
    }
  });
  return d;
}

/**
 * The CLI glyph: the 16 px drawing's mark area (rows 2 to 13, columns 2 to 13) as half blocks,
 * two pixel rows per text line, so the terminal prints the tab icon's pixels; six lines.
 */
export function halfBlocks(rows = ROWS16, r0 = 2, r1 = 14, c0 = 2, c1 = 14) {
  const lines = [];
  for (let y = r0; y < r1; y += 2) {
    let line = '';
    for (let x = c0; x < c1; x++) {
      const top = rows[y][x] === '#';
      const bottom = y + 1 < r1 && rows[y + 1][x] === '#';
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines;
}

/** the transform that fits the monogram's box into a square of `size` with `inset` on every side */
export function fit(b, size, inset) {
  const s = (size - 2 * inset) / Math.max(b.w, b.h);
  const tx = (size - b.w * s) / 2 - b.minX * s;
  const ty = (size - b.h * s) / 2 - b.minY * s;
  return { s, tx, ty };
}

/** is a point inside any of the convex polygons (all wound the same way) */
export function inside(polys, x, y) {
  outer: for (const pts of polys) {
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0) continue outer;
    }
    return true;
  }
  return false;
}

/** coverage (0 to 1) of polygons on a width by height grid under {s, tx, ty}, ss by ss samples */
export function coverage(polys, width, height, { s, tx, ty }, ss = 8) {
  const out = new Float64Array(width * height);
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      let hit = 0;
      for (let j = 0; j < ss; j++)
        for (let i = 0; i < ss; i++) {
          const ux = (px + (i + 0.5) / ss - tx) / s;
          const uy = (py + (j + 0.5) / ss - ty) / s;
          if (inside(polys, ux, uy)) hit++;
        }
      out[py * width + px] = hit / (ss * ss);
    }
  return out;
}
