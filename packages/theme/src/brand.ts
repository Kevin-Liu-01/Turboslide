// The Turboslide identity as data (docs/NEXT.md 4.1.2 and 4.1.3 item 1; the Round 1 brand sheet
// docs/gslides-parity/round1/sheet.md with fixes 1 and 2 of sheet-judge.md): the `--ts-` tokens
// packages/chrome/src/brand.css declares, mirrored here and pinned by brand.test.ts the way
// tokens.ts and tokens.test.ts pin the sheet, and the one geometry of the mark. TurboslideMark.tsx,
// scripts/build-brand.ts and the CLI banner draw from this module and nowhere else, so the tab
// icon, the title row, the /decks bar, the README, the card and the terminal are one form.
// Framework free and import free.
//
// The mark is a T with three bars under its left arm in the GT speed register: five rectangles
// in an upright space, sheared by tan(12 degrees), with the 8 unit cut through the stem and the
// middle bar, built the way Prototemplate's scripts/build-speed-marks.mjs 94 to 142 builds the GT
// bar monogram's T. The units are the GT monogram's: a cap of 120 units from the cap line at y 40
// to the baseline at y 160. The committed path is `MARK_PATH` with its sha256; brand.test.ts and
// `scripts/build-brand.ts --check` rebuild it from `MARK_RECTS` and compare, so no font tool is
// needed. At 16 px the form is the hand drawing `ROWS16`, the one deviation from DECK-GRAMMAR 53
// (docs/brand.md section 1).

// ---------------------------------------------------------------------------------------------
// The tokens (docs/NEXT.md 4.1.2, C's page grammar; B2's day 0 request of
// docs/gslides-parity/round1/build/b2.md, read against Prototemplate deck/slides/29-ladder.html
// and 49-shell-numbers.html)

/** The identity tokens of brand.css, on :root, by their full custom property names. */
export const BRAND_TOKENS: Readonly<Record<string, string>> = {
  '--ts-cell': '2px',
  '--ts-mark': '24px',
  '--ts-h1': '3.7rem',
  '--ts-h2': '2.25rem',
  '--ts-h3': '1.375rem',
  '--ts-title': '1.125rem',
  '--ts-lead': '17px',
  '--ts-body': '16px',
  '--ts-small': '14px',
  '--ts-label': '13px',
  '--ts-figure': '40px',
  '--ts-rail': '1104px',
  '--ts-gutter': '40px',
  '--ts-nav-h': '58px',
  '--ts-cross': '9px',
  '--ts-plate': 'var(--pt-paper)',
};

/** The one media block of brand.css: the values at and under this width. */
export const BRAND_NARROW_MAX_PX = 720;

/** The tokens the narrow block redeclares; every other token keeps its value. */
export const BRAND_TOKENS_NARROW: Readonly<Record<string, string>> = {
  '--ts-h1': '2.5rem',
  '--ts-gutter': '16px',
  '--ts-figure': '32px',
};

/** The layout's one breakpoint (slide 49): under it every row is one column. */
export const BRAND_LAYOUT_MAX_PX = 1023;

/** The mark's name, the alt text of every mark that stands alone. */
export const MARK_LABEL = 'Turboslide';

// ---------------------------------------------------------------------------------------------
// The geometry

/** The skew of the speed register, in degrees, and its tangent. */
export const SKEW_DEGREES = 12;
export const SKEW: number = Math.tan((SKEW_DEGREES * Math.PI) / 180);

/** The cap line and the baseline in the mark's units, and the cap between them. */
export const CAP_TOP = 40;
export const BASELINE = 160;
export const CAP_UNITS: number = BASELINE - CAP_TOP;

/** The cut through the stem and the middle bar, [top, bottom) in units, centred on mid cap. */
export const CUT: readonly [number, number] = [96, 104];

/** One rectangle of the upright form, in units; x 0 is the top bar's left end. */
export type MarkRect = {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * The five rectangles. The weights are the GT T's (a crossbar 30 units tall, a stem 34 wide) and
 * the bars are the GT bars' heights (30, 36 and 30). The top bar runs the arm 22 units past its
 * left end and overlaps it by 2; the middle bar reaches 4 units past the top bar and ends 12
 * units before the stem, centred on the cut, so the cut leaves two lines of 14 units; the bottom
 * bar starts 16 units after the top bar's end and also ends 12 units before the stem.
 */
export const MARK_RECTS: readonly MarkRect[] = [
  { name: 'crossbar', x: 22, y: 40, width: 134, height: 30 },
  { name: 'stem', x: 72, y: 40, width: 34, height: 120 },
  { name: 'top bar', x: 0, y: 40, width: 24, height: 30 },
  { name: 'middle bar', x: -4, y: 82, width: 64, height: 36 },
  { name: 'bottom bar', x: 16, y: 130, width: 44, height: 30 },
];

/** A point and a parallelogram (four points, clockwise on screen: top left, top right, bottom right, bottom left). */
export type Point = readonly [number, number];
export type Quad = readonly [Point, Point, Point, Point];

/** A rectangle's vertical spans once the cut is taken out: one span, or two around the cut. */
function spansOf(rect: MarkRect): [number, number][] {
  const top = rect.y;
  const bottom = rect.y + rect.height;
  return (
    [
      [top, Math.min(bottom, CUT[0])],
      [Math.max(top, CUT[1]), bottom],
    ] as [number, number][]
  ).filter(([a, b]) => b > a);
}

/**
 * The form as seven parallelograms in units: each rectangle less the cut, sheared by x minus
 * SKEW times y. `edge` moves a horizontal edge before the shear (the hinted placements of
 * `markQuadsAt`); without it the quads are the master drawing.
 */
export function markQuads(edge: (y: number) => number = (y) => y): Quad[] {
  const out: Quad[] = [];
  for (const rect of MARK_RECTS)
    for (const [a, b] of spansOf(rect)) {
      const y1 = edge(a);
      const y2 = edge(b);
      const left = rect.x;
      const right = rect.x + rect.width;
      out.push([
        [left - SKEW * y1, y1],
        [right - SKEW * y1, y1],
        [right - SKEW * y2, y2],
        [left - SKEW * y2, y2],
      ]);
    }
  return out;
}

/** The bounding box of a set of quads. */
export type Box = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export function boxOf(quads: readonly Quad[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const quad of quads)
    for (const [x, y] of quad) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** The master drawing's box in units: 176.58 by 120. */
export const MARK_BOX: Box = boxOf(markQuads());

/** The mark's width over its cap: 1.4715. */
export const MARK_ASPECT: number = MARK_BOX.width / MARK_BOX.height;

/** A number at `digits` decimals with no trailing zero, the way build-speed-marks.mjs writes path data. */
export function roundTo(value: number, digits: number): string {
  const factor = 10 ** digits;
  const text = (Math.round(value * factor) / factor).toFixed(digits);
  const trimmed = digits > 0 ? text.replace(/\.?0+$/, '') : text;
  return trimmed === '-0' ? '0' : trimmed;
}

/** Quads as path data, one closed subpath per quad. */
export function quadPath(quads: readonly Quad[], digits = 1): string {
  return quads
    .map(
      (quad) =>
        `M${quad.map(([x, y]) => `${roundTo(x, digits)} ${roundTo(y, digits)}`).join('L')}Z`,
    )
    .join('');
}

/**
 * The master path in units (242 bytes), committed as data. brand.test.ts and
 * `scripts/build-brand.ts --check` rebuild it from MARK_RECTS and compare it and its sha256.
 */
export const MARK_PATH =
  'M13.5 40L147.5 40L141.1 70L7.1 70ZM63.5 40L97.5 40L85.6 96L51.6 96ZM49.9 104L83.9 104L72 160L38 160ZM-8.5 40L15.5 40L9.1 70L-14.9 70ZM-21.4 82L42.6 82L39.6 96L-24.4 96ZM-26.1 104L37.9 104L34.9 118L-29.1 118ZM-11.6 130L32.4 130L26 160L-18 160Z';

/** sha256 of MARK_PATH's UTF-8 bytes. */
export const MARK_PATH_SHA256 = '3e95914b621faf3bee9b73421ac62b264ee384c165346025c09dec99c154190a';

/** The view box of the master drawing: the box with 4 units of clear space on every side. */
export const MARK_VIEWBOX = `${roundTo(MARK_BOX.minX - 4, 1)} ${CAP_TOP - 4} ${roundTo(MARK_BOX.width + 8, 1)} ${CAP_UNITS + 8}`;

// ---------------------------------------------------------------------------------------------
// The 16 px drawing (the one hand drawing; docs/brand.md section 1 records the deviation)

/**
 * The mark at 16 px as rows of `#` (ink) and `.`. At 16 px the slant and the 8 unit cut fall
 * between pixels, so the form is set as whole pixels on a 12 px cap in rows 2 to 13: the crossbar
 * three rows from column 2 to 13 with the top bar folded into a left arm of 5 px against a right
 * arm of 4 px; the stem 3 px, stepped one pixel left after the cut and again at the bottom bar
 * (the slant as two steps over the cap); the cut one clear row through the stem and the middle
 * bar; the bars starting at column 2 and ending one pixel before the stem, so they step 4, 3 and
 * 2 px. The T sits one pixel left of the drawing's first form and its crossbar is one column
 * longer on the right (Kevin, 2026-10-08: "scooch the t inside the box a little to the left",
 * then "add an extra column of black on the top part"), so columns 1 and 14 stay clear beside the
 * tile's frame.
 */
export const ROWS16: readonly string[] = [
  '................',
  '................',
  '..############..',
  '..############..',
  '..############..',
  '.......###......',
  '.......###......',
  '..####.###......',
  '................',
  '..###.###.......',
  '......###.......',
  '......###.......',
  '..##.###........',
  '..##.###........',
  '................',
  '................',
];

/** The rows as path data of whole pixel rectangles, one run per row segment, offset by (ox, oy). */
export function rowsPath(rows: readonly string[] = ROWS16, ox = 0, oy = 0): string {
  let d = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === '#') run += 1;
      d += `M${x + ox} ${y + oy}h${run}v1h-${run}z`;
      x += run;
    }
  });
  return d;
}

/** The rows' path at the origin (the 16 px drawing's own file), committed as data with its sha256. */
export const ROWS16_PATH =
  'M2 2h12v1h-12zM2 3h12v1h-12zM2 4h12v1h-12zM7 5h3v1h-3zM7 6h3v1h-3zM2 7h4v1h-4zM7 7h3v1h-3zM2 9h3v1h-3zM6 9h3v1h-3zM6 10h3v1h-3zM6 11h3v1h-3zM2 12h2v1h-2zM5 12h3v1h-3zM2 13h2v1h-2zM5 13h3v1h-3z';

/** sha256 of ROWS16_PATH's UTF-8 bytes. */
export const ROWS16_PATH_SHA256 =
  'f892bd1fbb83e22737a5da3d9e41bad48fe9e620bb6a2a7fbdde39dacbe10018';

/** The number of ink pixels of a rows drawing. */
export function rowsInk(rows: readonly string[] = ROWS16): number {
  return rows.reduce((n, row) => n + [...row].filter((c) => c === '#').length, 0);
}

// ---------------------------------------------------------------------------------------------
// Placement: the mark in an N px square

/** The sizes the component and the files draw: the rows at 16, the hinted 16 px cap at 24, the vector from 32. */
export const MARK_STEPS = { rows: 16, hinted: 24, vector: 32 } as const;

/** The cap of the mark in an N px square: the whole pixels whose box fits the square's width. */
export function capAt(size: number): number {
  return Math.floor(size / MARK_ASPECT);
}

/** The size a request draws at: under 24 the rows at 16, under 32 the hinted placement at 24, from 32 the size itself. */
export function markStep(size: number): number {
  if (!Number.isFinite(size) || size <= 0) throw new RangeError(`no mark at ${size} px`);
  if (size < MARK_STEPS.hinted) return MARK_STEPS.rows;
  if (size < MARK_STEPS.vector) return MARK_STEPS.hinted;
  return Math.round(size);
}

/** The px rows of a hinted placement's horizontal edges, keyed by the edge in units, from the cap line. */
export type HintedRows = Readonly<Record<number, number>>;

/**
 * The hinted rows of a `cap` px mark (sheet-judge.md fix 1): every horizontal edge on a whole
 * row. The crossbar and the bottom bar keep their 30 unit height, the cut keeps at least one row
 * and sits on mid cap or half a row above it when the remainder is odd, and the middle bar's two
 * lines keep one height each side of it. At a 16 px cap that is the crossbar on rows 0 to 4, a
 * one row gap, a two row line, the cut on row 7 (half a pixel above mid cap), a two row line, a
 * two row gap and the bottom bar on rows 12 to 16.
 */
export function hintedRows(cap: number): HintedRows {
  if (!Number.isInteger(cap) || cap < 12)
    throw new RangeError(`no hinted placement at a ${cap} px cap`);
  const s = cap / CAP_UNITS;
  const bar = Math.max(1, Math.round(30 * s));
  const cut = Math.max(1, Math.round((CUT[1] - CUT[0]) * s));
  const line = Math.max(1, Math.round(14 * s));
  const cutTop = Math.floor((cap - cut) / 2);
  const rows: Record<number, number> = {
    [CAP_TOP]: 0,
    70: bar,
    82: cutTop - line,
    [CUT[0]]: cutTop,
    [CUT[1]]: cutTop + cut,
    118: cutTop + cut + line,
    130: cap - bar,
    [BASELINE]: cap,
  };
  if (rows[82]! <= rows[70]! || rows[118]! >= rows[130]!)
    throw new RangeError(`the bars touch at a ${cap} px cap`);
  return rows;
}

/** The mark's quads in px for an N px square: `cap` px tall, its cap line on row `top`, the box centred across. */
export function markQuadsAt(
  size: number,
  cap: number,
  top: number = Math.round((size - cap) / 2),
  options: { hinted?: boolean } = {},
): Quad[] {
  const left = (size - MARK_BOX.width * (cap / CAP_UNITS)) / 2;
  return markQuadsInBox(cap, left, top, options);
}

/**
 * The mark's quads in px with its box's left edge at `left` and its cap line on row `top`, `cap`
 * px tall: the lockup's placement, where the mark's ink ends at `left` plus `cap` times
 * MARK_ASPECT.
 */
export function markQuadsInBox(
  cap: number,
  left: number,
  top: number,
  options: { hinted?: boolean } = {},
): Quad[] {
  const s = cap / CAP_UNITS;
  const tx = left - MARK_BOX.minX * s;
  const ty = top - CAP_TOP * s;
  const hinted = options.hinted ?? true;
  const rows = hinted ? hintedRows(cap) : undefined;
  const edge = (y: number): number => {
    if (rows === undefined) return y;
    const row = rows[y];
    if (row === undefined) throw new RangeError(`no hinted row for the edge at ${y}`);
    return CAP_TOP + row / s;
  };
  return markQuads(edge).map(
    (quad) => quad.map(([x, y]) => [x * s + tx, y * s + ty] as Point) as unknown as Quad,
  );
}

/** One drawing of the mark: its square, its form, its cap and cap line, and its path in the square's px. */
export type MarkPlacement = {
  size: number;
  form: 'rows' | 'vector';
  cap: number;
  top: number;
  hinted: boolean;
  d: string;
};

/**
 * The mark drawn at `size` px (snapped by `markStep`): the 16 px rows, the hinted 16 px cap in
 * the 24 px square, and from 32 px the vector at the size itself with its cap in whole pixels.
 * Every vector placement is hinted (`hintedRows`), so its crossbar, lines, cut and bars land on
 * whole rows at 1x; `hinted: false` draws the plain scaled vector for a comparison picture.
 */
export function markPlacement(size: number, options: { hinted?: boolean } = {}): MarkPlacement {
  const step = markStep(size);
  if (step === MARK_STEPS.rows)
    return { size: step, form: 'rows', cap: 12, top: 2, hinted: true, d: ROWS16_PATH };
  const cap = capAt(step);
  const top = Math.round((step - cap) / 2);
  const hinted = step === MARK_STEPS.hinted ? true : (options.hinted ?? true);
  return {
    size: step,
    form: 'vector',
    cap,
    top,
    hinted,
    d: quadPath(markQuadsAt(step, cap, top, { hinted }), 2),
  };
}

/**
 * An SVG of the mark at `size` CSS px, `currentColor`. Alone the SVG names itself; beside a word
 * pass `decorative` so the name is read once. The rows carry crisp edges; the vector does not.
 */
export function markSvg(
  size: number,
  options: { title?: string; decorative?: boolean; hinted?: boolean } = {},
): string {
  const placement = markPlacement(size, { hinted: options.hinted });
  const title = options.title ?? MARK_LABEL;
  const name = options.decorative
    ? 'aria-hidden="true">'
    : `role="img" aria-label="${title}"><title>${title}</title>`;
  const crisp = placement.form === 'rows' ? ' shape-rendering="crispEdges"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${placement.size} ${placement.size}" width="${placement.size}" height="${placement.size}" fill="currentColor"${crisp} ${name}<path d="${placement.d}"/></svg>`;
}

/**
 * The mark as terminal half blocks (U+2580, U+2584, U+2588): the 16 px rows' mark area (rows 2
 * to 13, columns 2 to 13), two pixel rows per line, six lines of 12 characters, so the terminal
 * prints the tab icon's pixels.
 */
export function markBlocks(rows: readonly string[] = ROWS16): string[] {
  const lines: string[] = [];
  for (let y = 2; y < 14; y += 2) {
    let line = '';
    for (let x = 2; x < 14; x += 1) {
      const top = rows[y]?.[x] === '#';
      const bottom = rows[y + 1]?.[x] === '#';
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------
// The tile: the mark in ink on an opaque paper plate with a 1 px frame in the edge composite, for
// every raster the prefers-color-scheme block cannot reach (the ICO entries, Safari's base
// rendering of icon.svg, Windows). Where the block is honoured the SVG swaps to paper ink on an
// ink plate.

/** The plate and the ink per appearance, the theme's exact values (tokens.ts TOKENS). */
export const TILE_COLORS = {
  light: { plate: '#ffffff', ink: '#070707', frame: '#656565' },
  dark: { plate: '#070707', ink: '#f2f2f0', frame: '#888887' },
} as const;

/**
 * A tile: its size, the 1 px frame, and the mark it carries (the rows at 16, the hinted vector at
 * 32 and 48). `dx` moves the vector mark left of centre by the same share of the tile as the rows
 * move the T (3/64 of the tile), so every tile places the T alike.
 */
export type TileGeometry = {
  size: 16 | 32 | 48;
  frame: 1;
  form: 'rows' | 'vector';
  cap: number;
  top: number;
  dx: number;
};

/** The three tiles of the icon set: the rows at 16, a 16 px cap at 32 and a 24 px cap at 48, all hinted. */
export const TILE_SIZES: Readonly<Record<16 | 32 | 48, TileGeometry>> = {
  16: { size: 16, frame: 1, form: 'rows', cap: 12, top: 2, dx: 0 },
  32: { size: 32, frame: 1, form: 'vector', cap: 16, top: 8, dx: -1.5 },
  48: { size: 48, frame: 1, form: 'vector', cap: 24, top: 12, dx: -2.25 },
};

/** A tile's mark as path data in tile px. */
export function tileMarkPath(tile: TileGeometry): string {
  if (tile.form === 'rows') return ROWS16_PATH;
  return quadPath(tileVectorQuads(tile), 2);
}

/** A vector tile's mark quads in tile px: centred, then moved by the tile's `dx`. */
export function tileVectorQuads(tile: TileGeometry): Quad[] {
  const left = (tile.size - MARK_BOX.width * (tile.cap / CAP_UNITS)) / 2 + tile.dx;
  return markQuadsInBox(tile.cap, left, tile.top, { hinted: true });
}

// ---------------------------------------------------------------------------------------------
// Contrast: the WCAG 2.2 relative luminance formula on the token values, for brand.test.ts, the
// accessibility record of docs/brand.md and the selection colour (`--pt-select`, `--pt-guide` in
// tokens.css).

/** The relative luminance of an sRGB `#rrggbb` colour (WCAG 2.2, the definition of relative luminance). */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) throw new TypeError(`Expected #rrggbb, got ${hex}`);
  const n = parseInt(match[1] ?? '0', 16);
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** The contrast ratio of two opaque colours, at least 1. */
export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The selection colour (the orchestrator's ruling 1 over SPEC-4 0.3; Kevin's directive d; docs/NEXT.md
 * 4.1.2 and question 3, B3b's day 0 request of docs/gslides-parity/round1/build/b3b.md): GT blue
 * `#2f5ce0` in both appearances for the canvas selection ring, the handles, the marquee, the hover
 * outline, the crop frame, the group box and the selection chip, with `#ffffff` chip text, and one
 * distinct colour per appearance for the snap guides. The blue holds at least 3:1 (WCAG 2.2 SC
 * 1.4.11) against both the paper and the ink of each appearance (5.63:1 on #ffffff, 3.58:1 on
 * #070707, 5.0:1 on #f2f2f0), so a box reads on a white slide and on a dark photograph alike; the
 * chip's white text on it holds 5.63:1 (SC 1.4.3). brand.test.ts computes the numbers.
 */
export const SELECTION_COLORS = {
  light: { select: '#2f5ce0', text: '#ffffff', guide: '#d6336c' },
  dark: { select: '#2f5ce0', text: '#ffffff', guide: '#f0397a' },
} as const;
