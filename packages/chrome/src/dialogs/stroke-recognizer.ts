// The drawing box's recogniser (gslides-parity SPEC-5 0.41, 7.7; P1 5.13): Turboslide's own,
// no service called. A drawing is a list of strokes (pointer paths on the 160 by 160 canvas);
// its features are eight direction histogram bins over every segment weighted by length, the
// stroke count, the ink's aspect ratio, its centroid and the share of ink per quadrant, all in
// the drawing's own bounding box, so size and place do not matter. Every Math and Arrows glyph
// the special characters dialog offers has a template drawn here as polylines in a unit box; the
// nearest templates by weighted distance are the "Best guesses". The templates are data, pinned
// by special-characters-drawing.test.ts with ten drawn glyphs.

export type Point = { x: number; y: number };
export type Stroke = Point[];

/** The features a drawing reduces to; the distance runs over these numbers. */
export type StrokeFeatures = {
  /** eight bins: right, down right, down, down left, left, up left, up, up right, as shares of the ink */
  directions: number[];
  strokes: number;
  /** height over width of the ink box, clamped to 0.05 to 4 */
  aspect: number;
  /** the ink's centroid in the unit box */
  centroid: Point;
  /** the share of ink per quadrant: top left, top right, bottom left, bottom right */
  quadrants: number[];
};

const BINS = 8;

function boundsOf(strokes: ReadonlyArray<Stroke>): { x: number; y: number; w: number; h: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const stroke of strokes)
    for (const point of stroke) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1e-6), h: Math.max(maxY - minY, 1e-6) };
}

/** The strokes moved and scaled into the unit box, the larger side to 1, the other centred. */
export function normalizeStrokes(strokes: ReadonlyArray<Stroke>): Stroke[] {
  const box = boundsOf(strokes);
  const size = Math.max(box.w, box.h);
  const dx = (size - box.w) / 2;
  const dy = (size - box.h) / 2;
  return strokes.map((stroke) =>
    stroke.map((point) => ({ x: (point.x - box.x + dx) / size, y: (point.y - box.y + dy) / size })),
  );
}

/** The features of a drawing (see the type); a drawing without ink answers zeros. */
export function strokeFeatures(raw: ReadonlyArray<Stroke>): StrokeFeatures {
  const strokes = normalizeStrokes(raw.filter((stroke) => stroke.length > 0));
  const directions = new Array<number>(BINS).fill(0);
  const quadrants = [0, 0, 0, 0];
  let total = 0;
  let cx = 0;
  let cy = 0;
  for (const stroke of strokes) {
    if (stroke.length === 1) {
      // a dot: ink at a point with no direction
      const point = stroke[0] as Point;
      const weight = 0.02;
      total += weight;
      cx += point.x * weight;
      cy += point.y * weight;
      const q = (point.y < 0.5 ? 0 : 2) + (point.x < 0.5 ? 0 : 1);
      quadrants[q] = (quadrants[q] ?? 0) + weight;
      continue;
    }
    for (let i = 1; i < stroke.length; i += 1) {
      const a = stroke[i - 1] as Point;
      const b = stroke[i] as Point;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const angle = Math.atan2(dy, dx); // y down: positive is down
      const bin = ((Math.round(angle / (Math.PI / 4)) % BINS) + BINS) % BINS;
      directions[bin] = (directions[bin] ?? 0) + length;
      total += length;
      // the ink of a long segment is spread along it, so a stroke through the centre counts in
      // every quadrant it crosses and the centroid reads the line, not its midpoint
      const steps = Math.max(1, Math.ceil(length / 0.02));
      const piece = length / steps;
      for (let k = 0; k < steps; k += 1) {
        const t = (k + 0.5) / steps;
        const mx = a.x + dx * t;
        const my = a.y + dy * t;
        cx += mx * piece;
        cy += my * piece;
        const q = (my < 0.5 ? 0 : 2) + (mx < 0.5 ? 0 : 1);
        quadrants[q] = (quadrants[q] ?? 0) + piece;
      }
    }
  }
  const box = boundsOf(raw);
  if (total === 0)
    return {
      directions,
      strokes: strokes.length,
      aspect: 1,
      centroid: { x: 0.5, y: 0.5 },
      quadrants,
    };
  return {
    directions: directions.map((value) => value / total),
    strokes: strokes.length,
    aspect: Math.min(4, Math.max(0.05, box.h / box.w)),
    centroid: { x: cx / total, y: cy / total },
    quadrants: quadrants.map((value) => value / total),
  };
}

/** The distance between two feature sets: the histogram first, then the count, the aspect, the centroid and the quadrants. */
export function featureDistance(a: StrokeFeatures, b: StrokeFeatures): number {
  let d = 0;
  for (let i = 0; i < BINS; i += 1) {
    // a direction and its opposite are the same line drawn the other way: fold them
    const fa = (a.directions[i] ?? 0) + (a.directions[(i + 4) % BINS] ?? 0);
    const fb = (b.directions[i] ?? 0) + (b.directions[(i + 4) % BINS] ?? 0);
    d += (fa - fb) ** 2 * 1.5;
  }
  d += (Math.min(a.strokes, 4) - Math.min(b.strokes, 4)) ** 2 * 0.25;
  d += (Math.log(a.aspect) - Math.log(b.aspect)) ** 2 * 0.35;
  d += ((a.centroid.x - b.centroid.x) ** 2 + (a.centroid.y - b.centroid.y) ** 2) * 1.2;
  for (let i = 0; i < 4; i += 1) d += ((a.quadrants[i] ?? 0) - (b.quadrants[i] ?? 0)) ** 2 * 0.8;
  return Math.sqrt(d);
}

// ---------------------------------------------------------------------------------------------
// The templates: polylines in the unit box (x right, y down)

const line = (x1: number, y1: number, x2: number, y2: number): Stroke => [
  { x: x1, y: y1 },
  { x: x2, y: y2 },
];

/** A circle as a 24 point polyline. */
const circle = (cx: number, cy: number, r: number): Stroke =>
  Array.from({ length: 25 }, (_v, i) => {
    const t = (i / 24) * Math.PI * 2;
    return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r };
  });

/** An arc from angle a0 to a1 (radians, y down) as a polyline. */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number): Stroke =>
  Array.from({ length: 17 }, (_v, i) => {
    const t = a0 + ((a1 - a0) * i) / 16;
    return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r };
  });

const rightHead = (x: number, y: number, s = 0.3): Stroke => [
  { x: x - s, y: y - s },
  { x, y },
  { x: x - s, y: y + s },
];
const leftHead = (x: number, y: number, s = 0.3): Stroke => [
  { x: x + s, y: y - s },
  { x, y },
  { x: x + s, y: y + s },
];
const upHead = (x: number, y: number, s = 0.3): Stroke => [
  { x: x - s, y: y + s },
  { x, y },
  { x: x + s, y: y + s },
];
const downHead = (x: number, y: number, s = 0.3): Stroke => [
  { x: x - s, y: y - s },
  { x, y },
  { x: x + s, y: y - s },
];

export type GlyphTemplate = { char: string; category: 'Math' | 'Arrows'; strokes: Stroke[] };

/** The templates of the Math and Arrows glyphs the drawing box recognises (Turboslide's own). */
export const GLYPH_TEMPLATES: ReadonlyArray<GlyphTemplate> = [
  { char: '→', category: 'Arrows', strokes: [line(0, 0.5, 1, 0.5), rightHead(1, 0.5)] },
  { char: '←', category: 'Arrows', strokes: [line(1, 0.5, 0, 0.5), leftHead(0, 0.5)] },
  { char: '↑', category: 'Arrows', strokes: [line(0.5, 1, 0.5, 0), upHead(0.5, 0)] },
  { char: '↓', category: 'Arrows', strokes: [line(0.5, 0, 0.5, 1), downHead(0.5, 1)] },
  {
    char: '↔',
    category: 'Arrows',
    strokes: [line(0, 0.5, 1, 0.5), rightHead(1, 0.5, 0.22), leftHead(0, 0.5, 0.22)],
  },
  {
    char: '↕',
    category: 'Arrows',
    strokes: [line(0.5, 0, 0.5, 1), upHead(0.5, 0, 0.22), downHead(0.5, 1, 0.22)],
  },
  {
    char: '↗',
    category: 'Arrows',
    strokes: [
      line(0, 1, 1, 0),
      [
        { x: 0.5, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0.5 },
      ],
    ],
  },
  {
    char: '↘',
    category: 'Arrows',
    strokes: [
      line(0, 0, 1, 1),
      [
        { x: 0.5, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 0.5 },
      ],
    ],
  },
  {
    char: '↙',
    category: 'Arrows',
    strokes: [
      line(1, 0, 0, 1),
      [
        { x: 0.5, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0.5 },
      ],
    ],
  },
  {
    char: '↖',
    category: 'Arrows',
    strokes: [
      line(1, 1, 0, 0),
      [
        { x: 0.5, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0.5 },
      ],
    ],
  },
  {
    char: '⇒',
    category: 'Arrows',
    strokes: [line(0, 0.38, 0.8, 0.38), line(0, 0.62, 0.8, 0.62), rightHead(1, 0.5, 0.35)],
  },
  {
    char: '⇐',
    category: 'Arrows',
    strokes: [line(1, 0.38, 0.2, 0.38), line(1, 0.62, 0.2, 0.62), leftHead(0, 0.5, 0.35)],
  },
  {
    char: '⇔',
    category: 'Arrows',
    strokes: [
      line(0.15, 0.38, 0.85, 0.38),
      line(0.15, 0.62, 0.85, 0.62),
      rightHead(1, 0.5, 0.25),
      leftHead(0, 0.5, 0.25),
    ],
  },
  {
    char: '↩',
    category: 'Arrows',
    strokes: [
      [
        { x: 1, y: 0.2 },
        { x: 1, y: 0.6 },
        { x: 0.2, y: 0.6 },
      ],
      leftHead(0, 0.6, 0.2),
    ],
  },
  {
    char: '↪',
    category: 'Arrows',
    strokes: [
      [
        { x: 0, y: 0.2 },
        { x: 0, y: 0.6 },
        { x: 0.8, y: 0.6 },
      ],
      rightHead(1, 0.6, 0.2),
    ],
  },
  { char: '+', category: 'Math', strokes: [line(0, 0.5, 1, 0.5), line(0.5, 0, 0.5, 1)] },
  { char: '−', category: 'Math', strokes: [line(0, 0.5, 1, 0.5)] },
  { char: '×', category: 'Math', strokes: [line(0, 0, 1, 1), line(1, 0, 0, 1)] },
  {
    char: '÷',
    category: 'Math',
    strokes: [line(0, 0.5, 1, 0.5), [{ x: 0.5, y: 0.15 }], [{ x: 0.5, y: 0.85 }]],
  },
  { char: '=', category: 'Math', strokes: [line(0, 0.35, 1, 0.35), line(0, 0.65, 1, 0.65)] },
  {
    char: '≠',
    category: 'Math',
    strokes: [line(0, 0.35, 1, 0.35), line(0, 0.65, 1, 0.65), line(0.7, 0, 0.3, 1)],
  },
  {
    char: '≈',
    category: 'Math',
    strokes: [
      [
        { x: 0, y: 0.4 },
        { x: 0.25, y: 0.25 },
        { x: 0.5, y: 0.4 },
        { x: 0.75, y: 0.55 },
        { x: 1, y: 0.4 },
      ],
      [
        { x: 0, y: 0.7 },
        { x: 0.25, y: 0.55 },
        { x: 0.5, y: 0.7 },
        { x: 0.75, y: 0.85 },
        { x: 1, y: 0.7 },
      ],
    ],
  },
  {
    char: '<',
    category: 'Math',
    strokes: [
      [
        { x: 1, y: 0 },
        { x: 0, y: 0.5 },
        { x: 1, y: 1 },
      ],
    ],
  },
  {
    char: '>',
    category: 'Math',
    strokes: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0, y: 1 },
      ],
    ],
  },
  {
    char: '≤',
    category: 'Math',
    strokes: [
      [
        { x: 1, y: 0 },
        { x: 0, y: 0.4 },
        { x: 1, y: 0.8 },
      ],
      line(0, 1, 1, 1),
    ],
  },
  {
    char: '≥',
    category: 'Math',
    strokes: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0.4 },
        { x: 0, y: 0.8 },
      ],
      line(0, 1, 1, 1),
    ],
  },
  {
    char: '±',
    category: 'Math',
    strokes: [line(0, 0.4, 1, 0.4), line(0.5, 0, 0.5, 0.8), line(0, 1, 1, 1)],
  },
  {
    char: '∞',
    category: 'Math',
    strokes: [[...circle(0.25, 0.5, 0.25).slice(0, 25), ...circle(0.75, 0.5, 0.25).reverse()]],
  },
  {
    char: '√',
    category: 'Math',
    strokes: [
      [
        { x: 0, y: 0.6 },
        { x: 0.25, y: 1 },
        { x: 0.55, y: 0 },
        { x: 1, y: 0 },
      ],
    ],
  },
  {
    char: '∑',
    category: 'Math',
    strokes: [
      [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0.6, y: 0.5 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
    ],
  },
  {
    char: '∏',
    category: 'Math',
    strokes: [line(0, 0, 1, 0), line(0.2, 0, 0.2, 1), line(0.8, 0, 0.8, 1)],
  },
  {
    char: '∫',
    category: 'Math',
    strokes: [
      [
        { x: 0.9, y: 0.1 },
        { x: 0.7, y: 0 },
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.8 },
        { x: 0.3, y: 1 },
        { x: 0.1, y: 0.9 },
      ],
    ],
  },
  {
    char: 'π',
    category: 'Math',
    strokes: [line(0, 0.15, 1, 0.15), line(0.25, 0.15, 0.25, 1), line(0.75, 0.15, 0.75, 1)],
  },
  { char: '°', category: 'Math', strokes: [circle(0.5, 0.5, 0.5)] },
  { char: '∅', category: 'Math', strokes: [circle(0.5, 0.5, 0.45), line(0.9, 0, 0.1, 1)] },
  {
    char: '∈',
    category: 'Math',
    strokes: [arc(0.6, 0.5, 0.5, Math.PI * 0.5, Math.PI * 1.5), line(0.1, 0.5, 1, 0.5)],
  },
  {
    char: '∀',
    category: 'Math',
    strokes: [
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 1 },
        { x: 1, y: 0 },
      ],
      line(0.2, 0.4, 0.8, 0.4),
    ],
  },
  {
    char: '∃',
    category: 'Math',
    strokes: [line(0, 0, 1, 0), line(1, 0, 1, 1), line(0, 1, 1, 1), line(0.3, 0.5, 1, 0.5)],
  },
  {
    char: '∆',
    category: 'Math',
    strokes: [
      [
        { x: 0.5, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0.5, y: 0 },
      ],
    ],
  },
  {
    char: '∇',
    category: 'Math',
    strokes: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0 },
      ],
    ],
  },
  {
    char: '∠',
    category: 'Math',
    strokes: [
      [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
    ],
  },
  {
    char: '∴',
    category: 'Math',
    strokes: [[{ x: 0.5, y: 0.1 }], [{ x: 0.1, y: 0.9 }], [{ x: 0.9, y: 0.9 }]],
  },
  {
    char: '∪',
    category: 'Math',
    strokes: [
      [
        { x: 0, y: 0 },
        { x: 0, y: 0.6 },
        ...arc(0.5, 0.6, 0.5, Math.PI, 2 * Math.PI)
          .reverse()
          .slice(1),
        { x: 1, y: 0 },
      ],
    ],
  },
  {
    char: '∩',
    category: 'Math',
    strokes: [
      [
        { x: 0, y: 1 },
        { x: 0, y: 0.4 },
        ...arc(0.5, 0.4, 0.5, Math.PI, 2 * Math.PI).slice(1),
        { x: 1, y: 1 },
      ],
    ],
  },
  {
    char: '∂',
    category: 'Math',
    strokes: [[...arc(0.5, 0.2, 0.3, Math.PI, 2 * Math.PI), ...circle(0.5, 0.65, 0.35).slice(1)]],
  },
  {
    char: '∝',
    category: 'Math',
    strokes: [
      [...circle(0.3, 0.5, 0.3).slice(0, 25), { x: 1, y: 0.2 }],
      [
        { x: 0.55, y: 0.5 },
        { x: 1, y: 0.8 },
      ],
    ],
  },
];

export type Guess = { char: string; distance: number };

/** The nearest templates to a drawing, the best first, at most `max` (the "Best guesses" list). */
export function recognizeStrokes(strokes: ReadonlyArray<Stroke>, max = 5): Guess[] {
  const drawn = strokes.filter((stroke) => stroke.length > 0);
  if (drawn.length === 0) return [];
  const features = strokeFeatures(drawn);
  return GLYPH_TEMPLATES.map((template) => ({
    char: template.char,
    distance: featureDistance(features, strokeFeatures(template.strokes)),
  }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max);
}

/** The template strokes of a glyph scaled onto a canvas of `size` px with a margin, for the tests and the preview. */
export function templateStrokes(char: string, size = 160, margin = 20): Stroke[] {
  const template = GLYPH_TEMPLATES.find((entry) => entry.char === char);
  if (template === undefined) return [];
  const inner = size - margin * 2;
  return template.strokes.map((stroke) =>
    stroke.map((point) => ({ x: margin + point.x * inner, y: margin + point.y * inner })),
  );
}
