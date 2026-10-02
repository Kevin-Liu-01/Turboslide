// The geometry of brand direction B (docs/gslides-parity/next/brand-b.md), shared by
// build-marks.mjs and the variant sheet: Inter outlines through fontkit, the widening, the slant,
// the cut and the speed bars, all as plain contours. See build-marks.mjs for the outputs.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as fontkit from '/Users/kevinliu/repos/Prototemplate/node_modules/fontkit/dist/module.mjs';

export const INTER_WOFF2 = '/Users/kevinliu/repos/Turboslide-next/packages/fonts/assets/InterVariable.woff2';

/* fontkit 2.0.4 cannot instance a variable WOFF2 (getVariation loses the cmap, and a WOFF2 built
   with coordinates fails in the glyf transform), so the file is decompressed once to a TTF with
   fontTools and fontkit instances that. The cache lives outside the tree. */
const CACHE = join(tmpdir(), 'turboslide-brand-b');
const INTER_TTF = join(CACHE, 'InterVariable.ttf');
if (!existsSync(INTER_TTF)) {
  mkdirSync(CACHE, { recursive: true });
  execFileSync('python3', [
    '-c',
    'import sys; from fontTools.ttLib import TTFont; f = TTFont(sys.argv[1]); f.flavor = None; f.save(sys.argv[2])',
    INTER_WOFF2,
    INTER_TTF,
  ]);
}
export const INTER = fontkit.openSync(INTER_TTF);

export const round = (n) => (Math.round(n * 100) / 100).toString().replace(/\.0+$/, '');

/* ---------- the geometry model: contours of segments ----------
   A point is [x, y]. A segment is { k: 'L', p: [p0, p1] }, { k: 'Q', p: [p0, c, p1] } or
   { k: 'C', p: [p0, c1, c2, p1] }. A contour is a closed list of segments, each starting where
   the last ended. */

export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** a point on a segment at t */
export function at(seg, t) {
  let pts = seg.p;
  while (pts.length > 1) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) next.push(lerp(pts[i], pts[i + 1], t));
    pts = next;
  }
  return pts[0];
}

/** de Casteljau: the segment split at t into two segments of the same kind */
function splitAt(seg, t) {
  const left = [];
  const right = [];
  let pts = seg.p;
  left.push(pts[0]);
  right.unshift(pts[pts.length - 1]);
  while (pts.length > 1) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) next.push(lerp(pts[i], pts[i + 1], t));
    left.push(next[0]);
    right.unshift(next[next.length - 1]);
    pts = next;
  }
  return [
    { k: seg.k, p: left },
    { k: seg.k, p: right },
  ];
}

/** the parameters in (0, 1) where coordinate axis (0 = x, 1 = y) of the segment equals v */
function crossings(seg, axis, v) {
  const f = (t) => at(seg, t)[axis] - v;
  const ts = [];
  const N = seg.k === 'L' ? 1 : 48;
  let t0 = 0;
  let f0 = f(0);
  for (let i = 1; i <= N; i++) {
    const t1 = i / N;
    const f1 = f(t1);
    if ((f0 < 0 && f1 > 0) || (f0 > 0 && f1 < 0)) {
      let a = t0;
      let b = t1;
      let fa = f0;
      for (let j = 0; j < 60; j++) {
        const m = (a + b) / 2;
        const fm = f(m);
        if ((fa < 0 && fm > 0) || (fa > 0 && fm < 0)) b = m;
        else {
          a = m;
          fa = fm;
        }
      }
      const t = (a + b) / 2;
      if (t > 1e-9 && t < 1 - 1e-9) ts.push(t);
    }
    t0 = t1;
    f0 = f1;
  }
  return ts;
}

/** every segment of the contour split where it crosses axis = v, the crossing points snapped onto v */
export function splitContour(contour, axis, v) {
  const out = [];
  for (const seg of contour) {
    const ts = crossings(seg, axis, v);
    let rest = seg;
    let done = 0;
    for (const t of ts) {
      const local = (t - done) / (1 - done);
      const [a, b] = splitAt(rest, local);
      a.p[a.p.length - 1][axis] = v;
      b.p[0] = a.p[a.p.length - 1];
      out.push(a);
      rest = b;
      done = t;
    }
    out.push(rest);
  }
  return out;
}

const mapSeg = (seg, fn) => ({ k: seg.k, p: seg.p.map(fn) });
export const mapContours = (contours, fn) => contours.map((c) => c.map((s) => mapSeg(s, fn)));
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** closes the gaps a per segment map opened: a line from each segment's end to the next one's start */
function reconnect(segs) {
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    out.push(s);
    const n = segs[(i + 1) % segs.length];
    const end = s.p[s.p.length - 1];
    if (!same(end, n.p[0])) out.push({ k: 'L', p: [end, n.p[0]] });
  }
  return out;
}

/**
 * The widening: the outline is cut at x = c and everything right of the cut moves right by e,
 * the two sides joined by straight horizontal runs. The stems on either side keep their width.
 */
function widenAt(contours, c, e) {
  return contours.map((contour) => {
    const segs = splitContour(contour, 0, c).map((s) => {
      const mid = at(s, 0.5)[0];
      return mid > c ? mapSeg(s, ([x, y]) => [x + e, y]) : s;
    });
    return reconnect(segs);
  });
}

/**
 * Sutherland-Hodgman against one horizontal half plane, on curves: the segments are split where
 * they cross y = v, the outside ones are dropped and each exit is joined to the next entry by a
 * run along the line. For points inside the half plane the winding number is unchanged, so a
 * nonzero outline clipped contour by contour is the outline intersected with the half plane.
 */
function clipHalf(contours, v, keepBelow) {
  const inside = (y) => (keepBelow ? y > v : y < v);
  const out = [];
  for (const contour of contours) {
    const segs = splitContour(contour, 1, v);
    const flags = segs.map((s) => inside(at(s, 0.5)[1]));
    if (!flags.some(Boolean)) continue;
    if (flags.every(Boolean)) {
      out.push(segs);
      continue;
    }
    const start = flags.findIndex((f, i) => f && !flags[(i - 1 + flags.length) % flags.length]);
    const kept = [];
    for (let i = 0; i < segs.length; i++) {
      const j = (start + i) % segs.length;
      if (flags[j]) kept.push(segs[j]);
    }
    out.push(reconnect(kept));
  }
  return out;
}

/** the cut: everything between y0 and y1 (y down) removed, as plain contours */
export const cutBand = (contours, y0, y1) => [...clipHalf(contours, y0, false), ...clipHalf(contours, y1, true)];

/** signed area by the shoelace formula on the segment end points and control points */
export function area(contour) {
  let a = 0;
  for (const s of contour) {
    for (let i = 0; i < s.p.length - 1; i++) {
      const [x1, y1] = s.p[i];
      const [x2, y2] = s.p[i + 1];
      a += x1 * y2 - x2 * y1;
    }
  }
  return a / 2;
}

/** the axis aligned box of a set of contours (end points and control points) */
export function box(contours) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const c of contours)
    for (const s of c)
      for (const [x, y] of s.p) {
        b.minX = Math.min(b.minX, x);
        b.maxX = Math.max(b.maxX, x);
        b.minY = Math.min(b.minY, y);
        b.maxY = Math.max(b.maxY, y);
      }
  return b;
}

/** the contours as SVG path data */
export function pathData(contours) {
  return contours
    .map((c) => {
      let d = `M${round(c[0].p[0][0])} ${round(c[0].p[0][1])}`;
      for (const s of c) {
        const pts = s.p.slice(1).map(([x, y]) => `${round(x)} ${round(y)}`);
        if (s.k === 'L') {
          d += `L${pts[0]}`;
        } else if (s.k === 'Q') d += `Q${pts.join(' ')}`;
        else d += `C${pts.join(' ')}`;
      }
      return d + 'Z';
    })
    .join('');
}

/** a rectangle as one contour, wound with the sign `dir` (the sign of the letters' outer contours) */
function rect(x, y, w, h, dir) {
  const pts = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const c = pts.map((p, i) => ({ k: 'L', p: [p, pts[(i + 1) % 4]] }));
  return Math.sign(area([c].flat()) || 1) === dir ? c : pts
    .slice()
    .reverse()
    .map((p, i, r) => ({ k: 'L', p: [p, r[(i + 1) % 4]] }));
}

/** fontkit path commands to contours, y flipped (y down), scaled by k and placed at (x, baseline) */
function glyphContours(glyph, k, x, baseline) {
  const contours = [];
  let cur = null;
  let pen = null;
  let first = null;
  const P = (gx, gy) => [x + gx * k, baseline - gy * k];
  for (const { command, args } of glyph.path.commands) {
    if (command === 'moveTo') {
      if (cur && cur.length) contours.push(cur);
      cur = [];
      pen = P(args[0], args[1]);
      first = pen;
    } else if (command === 'lineTo') {
      const p = P(args[0], args[1]);
      if (!same(p, pen)) cur.push({ k: 'L', p: [pen, p] });
      pen = p;
    } else if (command === 'quadraticCurveTo') {
      const c = P(args[0], args[1]);
      const p = P(args[2], args[3]);
      cur.push({ k: 'Q', p: [pen, c, p] });
      pen = p;
    } else if (command === 'bezierCurveTo') {
      const c1 = P(args[0], args[1]);
      const c2 = P(args[2], args[3]);
      const p = P(args[4], args[5]);
      cur.push({ k: 'C', p: [pen, c1, c2, p] });
      pen = p;
    } else if (command === 'closePath') {
      if (pen && first && !same(pen, first)) cur.push({ k: 'L', p: [pen, first] });
      pen = first;
    }
  }
  if (cur && cur.length) contours.push(cur);
  return contours;
}

/* ---------- the system: mark units with the cap height at 120, as the GT bar monogram ---------- */

export const CAP_UNITS = 120;
export const BASELINE = 160; // the GT bar monogram's rectangles run from y 40 to y 160
export const CAP_TOP = BASELINE - CAP_UNITS;
export const CUT_UNITS = 8; // the GT bar monogram's cut is 8 units on its 120 unit cap
export const SLANT_DEG = 12;
const K_SLANT = Math.tan((SLANT_DEG * Math.PI) / 180);
/* the slant about the baseline, so the baseline stays where it is and the cap leans forward */
export const slant = (contours) => mapContours(contours, ([x, y]) => [x + K_SLANT * (BASELINE - y), y]);

/** the y values (mark units, y down) where the vertical line x crosses the contours, sorted */
function columnCrossings(contours, x) {
  const ys = [];
  for (const c of contours)
    for (const s of splitContour(c, 0, x)) for (const p of s.p) if (Math.abs(p[0] - x) < 1e-6) ys.push(p[1]);
  return [...new Set(ys.map((y) => Math.round(y * 1000) / 1000))].sort((a, z) => a - z);
}

/**
 * Where the cut goes. The GT monogram cuts its capitals at mid cap height (y 96 to 104). Eight of
 * the ten letters of Turboslide are lowercase, and at mid cap height their counters begin: a cut
 * there leaves a hairline of ink or of paper under every top stroke. So the cut keeps the GT
 * cut's thickness and sits with its lower edge on the top of the e's bar: it runs through the
 * eye of the e, the upper counters of o, b, d and s and the stems, it never touches a horizontal
 * stroke, and on the capital T it lands within four units of mid cap height.
 */
export function cutFor(weight) {
  const font = INTER.getVariation({ wght: weight, opsz: 32 });
  const k = CAP_UNITS / font.capHeight;
  const g = font.layout('e').glyphs[0];
  const contours = mapContours(glyphContours(g, 1, 0, 0), ([x, y]) => [x * k, BASELINE + y * k]);
  const b = box(contours);
  const ys = columnCrossings(contours, (b.minX + b.maxX) / 2);
  /* top of the top stroke, the eye's top, the eye's bottom (the bar's top), the bar's bottom, ... */
  const barTop = ys[2];
  return [barTop - CUT_UNITS, barTop];
}

/**
 * The x in [lo, hi] where the outline's crossings are flattest: the sum of |dy/dx| over every
 * place the vertical line meets the outline, sampled at 64 positions. A widening cut there
 * inserts its straight runs where the curves are already level, so no kink shows.
 */
function flattestX(contours, lo, hi) {
  let best = (lo + hi) / 2;
  let bestCost = Infinity;
  for (let i = 0; i <= 64; i++) {
    const x = lo + ((hi - lo) * i) / 64;
    let cost = 0;
    let hits = 0;
    for (const c of contours)
      for (const seg of c)
        for (const t of crossings(seg, 0, x)) {
          const a = at(seg, Math.max(0, t - 1e-4));
          const b = at(seg, Math.min(1, t + 1e-4));
          const dx = b[0] - a[0];
          cost += Math.abs(dx) < 1e-12 ? 1e6 : Math.abs((b[1] - a[1]) / dx);
          hits++;
        }
    /* prefer the middle when two places are equally flat */
    cost += Math.abs(x - (lo + hi) / 2) * 1e-4;
    if (hits > 0 && cost < bestCost) {
      bestCost = cost;
      best = x;
    }
  }
  return best;
}

/**
 * The widening per glyph, in font units at the chosen weight: where to cut and how far to extend.
 * Cuts go through counters and arms, never through a stem, so every vertical keeps Inter's
 * width, and each cut sits where the curves it crosses are flattest (flattestX). The T is cut
 * once in each arm. l and i are not widened: a wide letter has wide counters, and these have
 * none.
 */
export function widenPlan(name, b, stem, wide, contours) {
  const w = b.maxX - b.minX;
  const e = (f) => f * wide;
  const flat = (lo, hi) => flattestX(contours, lo, hi);
  switch (name) {
    case 'T':
      return [
        [b.minX + (w - stem) * 0.25, e(0.62)],
        [b.maxX - (w - stem) * 0.25, e(0.62)],
      ];
    case 'u':
      return [[flat(b.minX + stem * 1.2, b.maxX - stem * 1.2), e(1)]];
    case 'o':
    case 'e':
    case 's':
      return [[flat(b.minX + w * 0.3, b.maxX - w * 0.3), e(1)]];
    case 'b':
      return [[flat(b.minX + stem * 1.2, b.maxX - stem * 0.9), e(1)]];
    case 'd':
      return [[flat(b.minX + stem * 0.9, b.maxX - stem * 1.2), e(1)]];
    case 'r':
      return [[flat(b.minX + stem * 1.15, b.maxX - (w - stem) * 0.25), e(0.6)]];
    default:
      return [];
  }
}

/**
 * The wordmark's letters as contours in mark units, before the slant and the cut, with the
 * facts the bars and the monogram read: the T's box, its crossbar's bottom and its stem's edges.
 */
export function letters(opts) {
  const { weight, wide, tracking, text } = opts;
  const font = INTER.getVariation({ wght: weight, opsz: 32 });
  const k = CAP_UNITS / font.capHeight;
  const run = font.layout(text);
  /* the stem of l at this weight: the width of its box */
  const lBox = font.layout('l').glyphs[0].path.bbox;
  const stem = lBox.maxX - lBox.minX;
  let pen = 0;
  const glyphs = [];
  run.glyphs.forEach((glyph, i) => {
    const pos = run.positions[i];
    const b = glyph.path.bbox;
    let contours = glyphContours(glyph, 1, 0, 0); // font units, y flipped
    let extra = 0;
    /* the cuts from right to left, so each cut's x is still in the glyph's own units */
    const plan = widenPlan(glyph.name, b, stem, wide, contours).sort((a, z) => z[0] - a[0]);
    for (const [c, e] of plan) {
      contours = widenAt(contours, c, e);
      extra += e;
    }
    const placed = mapContours(contours, ([x, y]) => [(pen + pos.xOffset + x) * k, BASELINE + y * k]);
    glyphs.push({ name: glyph.name, contours: placed, box: box(placed) });
    pen += pos.xAdvance + extra + tracking;
  });
  return { glyphs, stem: stem * k, k, font, width: pen * k };
}

/** the T's crossbar bottom and stem edges, read from its outline by scanning (mark units) */
export function tAnatomy(t) {
  const b = t.box;
  /* the stem: the longest vertical ink run at the T's lowest third is between its edges */
  const ys = BASELINE - 10;
  const xs = [];
  for (const c of t.contours)
    for (const s of splitContour(c, 1, ys)) for (const p of s.p) if (Math.abs(p[1] - ys) < 1e-6) xs.push(p[0]);
  xs.sort((a, z) => a - z);
  const stemL = xs[0];
  const stemR = xs[xs.length - 1];
  /* the crossbar's bottom: scan down the left arm's middle until it leaves ink */
  const armX = (b.minX + stemL) / 2;
  let barBottom = CAP_TOP;
  for (const c of t.contours)
    for (const s of splitContour(c, 0, armX))
      for (const p of s.p) if (Math.abs(p[0] - armX) < 1e-6 && p[1] > barBottom && p[1] < BASELINE - 20) barBottom = p[1];
  return { left: b.minX, right: b.maxX, stemL, stemR, barBottom };
}

/**
 * The speed bars in the upright space, before the slant, as [x, y, w, h]. Variant 'under' runs
 * the middle and bottom bars under the T's left arm into its stem, the GT monogram's
 * construction (its bars run into the G's stem); variant 'before' keeps them clear of the letter.
 * The top bar extends the crossbar.
 */
export function bars(t, variant, cut, scale = 1) {
  const bar = t.barBottom - CAP_TOP;
  const overlap = 2;
  const gap = 12 * scale;
  /* three rows on the cap: the crossbar's row, the middle row the cut splits into two lines of
     14 units (the GT monogram's middle bar), the bottom row as thick as the crossbar */
  const mid = [cut[0] - 14 * scale, cut[1] + 14 * scale];
  const bottom = [BASELINE - bar, BASELINE];
  if (variant === 'under') {
    const into = t.stemL + overlap;
    return [
      [t.left - 22 * scale, CAP_TOP, 22 * scale + overlap, bar],
      [t.left - 80 * scale, mid[0], into - (t.left - 80 * scale), mid[1] - mid[0]],
      [t.left - 50 * scale, bottom[0], into - (t.left - 50 * scale), bottom[1] - bottom[0]],
    ];
  }
  if (variant === 'inset') {
    /* inside the T's box: under the left arm, clear of the stem by the gap, the middle bar
       reaching past the arm's end and the bottom bar starting inside it */
    const end = t.stemL - gap;
    return [
      [t.left - 22 * scale, CAP_TOP, 22 * scale + overlap, bar],
      [t.left - 26 * scale, mid[0], end - (t.left - 26 * scale), mid[1] - mid[0]],
      [t.left + 6 * scale, bottom[0], end - (t.left + 6 * scale), bottom[1] - bottom[0]],
    ];
  }
  const end = t.left - gap;
  return [
    [t.left - 22 * scale, CAP_TOP, 22 * scale + overlap, bar],
    [end - 96 * scale, mid[0], 96 * scale, mid[1] - mid[0]],
    [end - 60 * scale, bottom[0], 60 * scale, bottom[1] - bottom[0]],
  ];
}

/** one finished mark: letters (all or the T only), bars, slant, cut; plain path data and its box */
export function compose(opts) {
  const L = letters(opts);
  const t = L.glyphs[0];
  const anatomy = tAnatomy(t);
  const CUT = opts.cutAt ?? cutFor(opts.weight);
  const dir = Math.sign(area(t.contours.reduce((a, c) => (Math.abs(area(c)) > Math.abs(area(a)) ? c : a))));
  const rects = bars(anatomy, opts.bars, CUT).map(([x, y, w, h]) => rect(x, y, w, h, dir));
  const chosen = opts.only === 'T' ? [t] : L.glyphs;
  let contours = [...chosen.flatMap((g) => g.contours), ...(opts.bars === 'none' ? [] : rects)];
  contours = slant(contours);
  if (opts.cut !== false) contours = cutBand(contours, CUT[0], CUT[1]);
  const b = box(contours);
  return { d: pathData(contours), box: b, anatomy, stem: L.stem, contours, letters: L, cut: CUT };
}

