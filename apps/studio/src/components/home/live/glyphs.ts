/**
 * The interludes' glyphs (docs/LANDING.md 2.4; B's chapter fields, `direction-b/landing.js` 2215 to
 * 2310, drawn finer). V4's file. Each interlude gathers into the object of the band after it, drawn
 * as that band draws it: a list of shapes in cell units (one cell is 2 px on the page) inside a box
 * of at most 160 by 48 cells at 720 px and over (320 by 96 px) and 80 by 32 under (160 by 64 px),
 * centred in the strip. A shape is a rectangle with a tone (1 ink, 0 paper, between them a ground
 * the Bayer screen prints), painted in order, so a later shape covers an earlier one; the one round
 * object, the patterns band's lit sphere, is a disc with B's opener tone. Nothing here is a picture:
 * `glyphTone` computes the gathered tone of every cell on the first draw.
 */

/** The bands an interlude leads into (2.4's table, the order of the page). */
export type InterludeBand =
  | 'menus'
  | 'canvas'
  | 'tailor'
  | 'kits'
  | 'agents'
  | 'people'
  | 'present'
  | 'export'
  | 'patterns'
  | 'features'
  | 'close';

export const INTERLUDE_BANDS: readonly InterludeBand[] = [
  'menus',
  'canvas',
  'tailor',
  'kits',
  'agents',
  'people',
  'present',
  'export',
  'patterns',
  'features',
  'close',
];

/** A rectangle in cell units from the glyph box's top left, with its tone (1 when absent). */
export type GlyphRect = { x: number; y: number; w: number; h: number; t?: number };
/** B's lit sphere: a disc in cell units, lit from the upper left. */
export type GlyphDisc = { cx: number; cy: number; r: number };
export type GlyphShape = GlyphRect | GlyphDisc;

export type Glyph = { w: number; h: number; shapes: GlyphShape[] };

/** The glyph box's ceiling in cells: 160 by 48 at 720 px and over, 80 by 32 under (2.4). */
export const GLYPH_BOX = { wide: { w: 160, h: 48 }, narrow: { w: 80, h: 32 } } as const;

/** A line: `n` cells thick at the wide size, never under one cell. */
type Kit = {
  /** a rectangle at the glyph's scale (a dimension never rounds under one cell) */
  r(x: number, y: number, w: number, h: number, t?: number): GlyphRect;
  /** a 1 px outline: four rectangles of the line's thickness */
  box(x: number, y: number, w: number, h: number): GlyphRect[];
  /** a square of side `s` centred on (x, y) */
  sq(x: number, y: number, s: number, t?: number): GlyphRect;
  /** the line's thickness in cells at this scale */
  line: number;
};

function kit(scale: number): Kit {
  const v = (n: number): number => Math.round(n * scale);
  const len = (n: number): number => Math.max(1, Math.round(n * scale));
  const line = len(2);
  const r = (x: number, y: number, w: number, h: number, t = 1): GlyphRect => ({
    x: v(x),
    y: v(y),
    w: len(w),
    h: len(h),
    ...(t === 1 ? {} : { t }),
  });
  return {
    r,
    line,
    box(x, y, w, h) {
      const X = v(x);
      const Y = v(y);
      const W = len(w);
      const H = len(h);
      return [
        { x: X, y: Y, w: W, h: line },
        { x: X, y: Y + H - line, w: W, h: line },
        { x: X, y: Y, w: line, h: H },
        { x: X + W - line, y: Y, w: line, h: H },
      ];
    },
    sq(x, y, s, t = 1) {
      const S = len(s);
      return {
        x: v(x) - Math.floor(S / 2),
        y: v(y) - Math.floor(S / 2),
        w: S,
        h: S,
        ...(t === 1 ? {} : { t }),
      };
    },
  };
}

/**
 * Each band's glyph at the wide size (scale 1) or the narrow (scale 0.5), within GLYPH_BOX: the
 * shapes are written once in wide cells and scaled, every length kept at one cell or more.
 */
export function glyphFor(band: InterludeBand, narrow: boolean): Glyph {
  const scale = narrow ? 0.5 : 1;
  const k = kit(scale);
  const size = (w: number, h: number): { w: number; h: number } => ({
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  });
  switch (band) {
    case 'menus': {
      /* an open menu: the menu's title cell over its plate of five ruled rows, the third filled */
      const x0 = 44;
      const shapes: GlyphShape[] = [...k.box(x0, 0, 24, 10), k.r(x0 + 5, 4, 14, 2)];
      shapes.push(...k.box(x0, 9, 72, 38));
      for (let row = 0; row < 5; row += 1) {
        const y = 10 + row * 7.4;
        if (row === 2) {
          shapes.push(k.r(x0 + 2, y, 68, 7.4));
          /* the filled row's words in paper */
          shapes.push(k.r(x0 + 6, y + 3, 30, 2, 0), k.r(x0 + 58, y + 3, 8, 2, 0));
          continue;
        }
        shapes.push(k.r(x0 + 6, y + 3, row % 2 === 0 ? 34 : 26, 2), k.r(x0 + 58, y + 3, 8, 2));
      }
      return { ...size(160, 48), shapes };
    }
    case 'canvas': {
      /* the selection frame: its eight square handles, the stem, the knob and the chip (F1); the
         handles are placed on the scaled frame's lines, so they sit on them at both sizes */
      const shapes: GlyphShape[] = [...k.box(24, 16, 112, 30)];
      const [top, , left] = shapes as GlyphRect[];
      const X = left!.x;
      const Y = top!.y;
      const W = top!.w;
      const H = left!.h;
      const L = k.line;
      const S = Math.max(3, Math.round(6 * scale));
      const at = (n: number): number => n + Math.floor(L / 2) - Math.floor(S / 2);
      const xs = [X, X + Math.floor((W - L) / 2), X + W - L];
      const ys = [Y, Y + Math.floor((H - L) / 2), Y + H - L];
      for (const [i, x] of xs.entries())
        for (const [j, y] of ys.entries())
          if (i !== 1 || j !== 1) shapes.push({ x: at(x), y: at(y), w: S, h: S });
      const stemTop = Math.round(4 * scale);
      shapes.push({ x: xs[1]!, y: stemTop, w: L, h: Y - stemTop });
      shapes.push({ x: at(xs[1]!), y: at(stemTop), w: S, h: S });
      shapes.push(k.r(24, 2, 26, 10), k.r(28, 6, 18, 2, 0));
      return { ...size(160, 48), shapes };
    }
    case 'tailor': {
      /* four small sheets in a row, each with the same short bar at the same place */
      const shapes: GlyphShape[] = [];
      for (let i = 0; i < 4; i += 1) {
        const x = 6 + i * 38;
        shapes.push(...k.box(x, 12, 34, 20), k.r(x + 5, 18, 14, 3));
        shapes.push(k.r(x + 5, 24, 22, 1, 0.5));
      }
      return { ...size(160, 44), shapes };
    }
    case 'kits': {
      /* three square swatches, each a ground with an ink bar */
      const shapes: GlyphShape[] = [];
      [0, 0.25, 0.5].forEach((ground, i) => {
        const x = 26 + i * 40;
        if (ground > 0) shapes.push(k.r(x, 8, 32, 32, ground));
        shapes.push(...k.box(x, 8, 32, 32), k.r(x + 6, 28, 20, 4));
        shapes.push(k.r(x + 4, 26, 24, 2, 0));
      });
      return { ...size(160, 48), shapes };
    }
    case 'agents': {
      /* the agent's ring: a rectangle with the flag tab at its top left */
      return {
        ...size(160, 48),
        shapes: [...k.box(28, 14, 104, 32), k.r(28, 4, 30, 11), k.r(32, 8, 22, 2, 0)],
      };
    }
    case 'people': {
      /* two carets with their name flags (B's) */
      const shapes: GlyphShape[] = [];
      [
        [44, 30],
        [104, 20],
      ].forEach(([x, flag]) => {
        shapes.push(k.r(x!, 10, 2, 36), k.r(x!, 2, flag!, 10), k.r(x! + 4, 6, flag! - 8, 2, 0));
      });
      return { ...size(160, 48), shapes };
    }
    case 'present': {
      /* a 16 by 9 sheet on a filled ground, with the bar under it */
      return {
        ...size(160, 48),
        shapes: [
          k.r(44, 0, 72, 40),
          k.r(52, 4, 56, 32, 0),
          k.r(58, 10, 24, 3),
          k.r(58, 16, 34, 1, 0.5),
          k.r(44, 43, 72, 4),
          k.r(48, 44, 10, 2, 0),
        ],
      };
    }
    case 'export': {
      /* two pages and the seam between them with its square knob (B's and C's) */
      const shapes: GlyphShape[] = [];
      [18, 86].forEach((x) => {
        shapes.push(...k.box(x, 10, 56, 32));
        shapes.push(k.r(x + 7, 17, 24, 3), k.r(x + 7, 24, 38, 2), k.r(x + 7, 30, 38, 2));
      });
      shapes.push(k.r(79, 0, 2, 48), k.sq(80, 26, 8));
      return { ...size(160, 48), shapes };
    }
    case 'patterns': {
      /* a lit sphere (B's opener tone) */
      return { ...size(160, 48), shapes: [{ cx: 80 * scale, cy: 24 * scale, r: 23 * scale }] };
    }
    case 'features': {
      /* ruled rows, each with a square cell at its left (B's) */
      const shapes: GlyphShape[] = [];
      for (let row = 0; row < 4; row += 1) {
        const y = 2 + row * 14.5;
        shapes.push(k.r(10, y, 140, 2));
        if (row < 3) {
          shapes.push(k.r(14, y + 5, 6, 6));
          shapes.push(k.r(28, y + 7, row === 1 ? 52 : 72, 2), k.r(132, y + 7, 14, 2));
        }
      }
      return { ...size(160, 48), shapes };
    }
    case 'close': {
      /* the sheet's frame: two rails, two rules and four crosses */
      const shapes: GlyphShape[] = [
        k.r(34, 0, 1, 48),
        k.r(126, 0, 1, 48),
        k.r(20, 8, 120, 1),
        k.r(20, 40, 120, 1),
      ];
      for (const [x, y] of [
        [34, 8],
        [126, 8],
        [34, 40],
        [126, 40],
      ] as const)
        shapes.push(k.r(x - 4, y, 9, 1), k.r(x, y - 4, 1, 9));
      return { ...size(160, 48), shapes };
    }
  }
}

/**
 * B's opener tone on a disc: lit from the upper left, darkest at the lower right, so the screen
 * prints a sphere; the ink's share in 0 to 1 at a point inside the disc of radius 1.
 */
function sphereTone(u: number, v: number): number {
  const d2 = u * u + v * v;
  if (d2 > 1) return 0;
  const z = Math.sqrt(1 - d2);
  /* the light from the upper left and in front */
  const lit = Math.max(0, -0.55 * u - 0.55 * v + 0.63 * z);
  return Math.min(1, Math.max(0.12, 1 - lit * 1.15));
}

/**
 * The gathered tone of every cell of a strip of `cols` by `rows`: the glyph centred in it, each
 * shape painted in order. 0 is paper.
 */
export function glyphTone(glyph: Glyph, cols: number, rows: number): Float32Array {
  const tone = new Float32Array(cols * rows);
  const ox = Math.floor((cols - glyph.w) / 2);
  const oy = Math.floor((rows - glyph.h) / 2);
  for (const shape of glyph.shapes) {
    if ('r' in shape) {
      const r = shape.r;
      for (let y = Math.floor(shape.cy - r); y <= Math.ceil(shape.cy + r); y += 1)
        for (let x = Math.floor(shape.cx - r); x <= Math.ceil(shape.cx + r); x += 1) {
          const u = (x + 0.5 - shape.cx) / r;
          const v = (y + 0.5 - shape.cy) / r;
          if (u * u + v * v > 1) continue;
          const X = ox + x;
          const Y = oy + y;
          if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
          tone[Y * cols + X] = sphereTone(u, v);
        }
      continue;
    }
    const t = shape.t ?? 1;
    for (let y = shape.y; y < shape.y + shape.h; y += 1)
      for (let x = shape.x; x < shape.x + shape.w; x += 1) {
        const X = ox + x;
        const Y = oy + y;
        if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
        tone[Y * cols + X] = t;
      }
  }
  return tone;
}

/** The glyph's bounding box in cells, every shape included (the tests' reading of GLYPH_BOX). */
export function glyphBounds(glyph: Glyph): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const shape of glyph.shapes) {
    const [a, b, c, d] =
      'r' in shape
        ? [shape.cx - shape.r, shape.cy - shape.r, shape.cx + shape.r, shape.cy + shape.r]
        : [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h];
    x0 = Math.min(x0, a);
    y0 = Math.min(y0, b);
    x1 = Math.max(x1, c);
    y1 = Math.max(y1, d);
  }
  return { x0, y0, x1, y1 };
}
