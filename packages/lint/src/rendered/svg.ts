// Geometry of a raw `dia` svg string for the rendered half of dia/label-clearance (SPEC 7.7;
// DECK-GRAMMAR.md:45). The renderer passes a raw svg through unchanged (render/blocks/dia.ts), so
// the only way to know where its labels and strokes are is to read the string: lines, stroked
// rects, paths (straight commands exactly, curves by their end points), polylines and polygons
// become segments in viewBox units; text elements become label boxes with the sheet's diagram
// sizes (20 px, `.lab` 26, `.sm` 18; sheet.css svg.dia rules) and the 0.52 em average Inter
// advance the static rule uses. Only translate transforms are followed; an element under any
// other transform is counted in `skipped` and left out.
export type Segment = [number, number, number, number];

export type SvgLabel = {
  text: string;
  x: number;
  y: number;
  size: number;
  anchor: 'start' | 'middle' | 'end';
  /** The label box in viewBox units: [x, y, w, h]. */
  box: [number, number, number, number];
};

export type SvgGeometry = {
  viewBox?: [number, number, number, number];
  segments: Segment[];
  labels: SvgLabel[];
  /** Elements left out: under a non-translate transform, or a shape this reader does not follow. */
  skipped: number;
};

export type SvgTextSizes = { text: number; lab: number; sm: number };

/** The sizes sheet.css gives diagram text (svg.dia text 20 px, .lab 26 px, .sm 18 px). */
export const DIA_TEXT_SIZES: SvgTextSizes = { text: 20, lab: 26, sm: 18 };

/**
 * Approximate Inter advances in em at weight 400 to 500, by character class, so a label's width
 * follows its letters instead of a flat average (the static rule's 0.52 em per character reads a
 * lowercase label 10 to 20 percent too wide, which puts it inside the clearance of a stroke to
 * its right). Narrow letters and punctuation, wide letters, capitals, digits, the rest.
 */
const NARROW = new Set("iljtfrI.,:;'|!/\\()[]{}-");
const WIDE = new Set('mwMW@%');
const ADVANCE = { narrow: 0.32, wide: 0.86, capital: 0.66, digit: 0.58, space: 0.27, other: 0.55 };

/** The estimated advance of a string in em. */
export function interWidthEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ' || ch === '\u00a0') em += ADVANCE.space;
    else if (NARROW.has(ch)) em += ADVANCE.narrow;
    else if (WIDE.has(ch)) em += ADVANCE.wide;
    else if (/[0-9]/.test(ch)) em += ADVANCE.digit;
    else if (/[A-Z]/.test(ch)) em += ADVANCE.capital;
    else em += ADVANCE.other;
  }
  return em;
}

type Attrs = Record<string, string>;

type Frame = { tx: number; ty: number; stroked: boolean; unmapped: boolean };

const TAG = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^>]*?)?)(\/?)>/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function attrsOf(raw: string): Attrs {
  const out: Attrs = {};
  for (const m of raw.matchAll(ATTR)) {
    const name = m[1];
    if (name) out[name] = m[2] ?? m[3] ?? '';
  }
  return out;
}

function num(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function numbers(value: string): number[] {
  return (value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
}

/** A stroke is declared by a stroke attribute other than none, a stroke width, or a stroke class. */
function declaresStroke(attrs: Attrs): boolean {
  const stroke = attrs.stroke?.trim().toLowerCase();
  if (stroke && stroke !== 'none') return true;
  if (attrs['stroke-width'] !== undefined) return true;
  const cls = ` ${attrs.class ?? ''} `;
  if (/ (ink|mid|hair|paper) /.test(cls)) return true;
  const style = attrs.style ?? '';
  return /stroke\s*:\s*(?!none)/i.test(style);
}

/** The translation of a transform attribute, or null when it carries anything else. */
function translation(value: string | undefined): { tx: number; ty: number } | null {
  if (!value) return { tx: 0, ty: 0 };
  let tx = 0;
  let ty = 0;
  for (const m of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const fn = (m[1] ?? '').toLowerCase();
    const args = numbers(m[2] ?? '');
    if (fn !== 'translate') return null;
    tx += args[0] ?? 0;
    ty += args[1] ?? 0;
  }
  return { tx, ty };
}

function pathSegments(d: string, tx: number, ty: number, out: Segment[]): number {
  let skipped = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const push = (nx: number, ny: number): void => {
    out.push([x + tx, y + ty, nx + tx, ny + ty]);
    x = nx;
    y = ny;
  };
  for (const m of d.matchAll(/([MmLlHhVvZzCcSsQqTtAa])([^MmLlHhVvZzCcSsQqTtAa]*)/g)) {
    const cmd = m[1] ?? '';
    const args = numbers(m[2] ?? '');
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M':
        for (let i = 0; i + 1 < args.length; i += 2) {
          const nx = (rel ? x : 0) + (args[i] ?? 0);
          const ny = (rel ? y : 0) + (args[i + 1] ?? 0);
          if (i === 0) {
            x = nx;
            y = ny;
            startX = nx;
            startY = ny;
          } else push(nx, ny);
        }
        break;
      case 'L':
        for (let i = 0; i + 1 < args.length; i += 2)
          push((rel ? x : 0) + (args[i] ?? 0), (rel ? y : 0) + (args[i + 1] ?? 0));
        break;
      case 'H':
        for (const a of args) push((rel ? x : 0) + a, y);
        break;
      case 'V':
        for (const a of args) push(x, (rel ? y : 0) + a);
        break;
      case 'Z':
        push(startX, startY);
        break;
      case 'C':
        for (let i = 0; i + 5 < args.length; i += 6)
          push((rel ? x : 0) + (args[i + 4] ?? 0), (rel ? y : 0) + (args[i + 5] ?? 0));
        skipped += 1;
        break;
      case 'S':
      case 'Q':
        for (let i = 0; i + 3 < args.length; i += 4)
          push((rel ? x : 0) + (args[i + 2] ?? 0), (rel ? y : 0) + (args[i + 3] ?? 0));
        skipped += 1;
        break;
      case 'T':
        for (let i = 0; i + 1 < args.length; i += 2)
          push((rel ? x : 0) + (args[i] ?? 0), (rel ? y : 0) + (args[i + 1] ?? 0));
        skipped += 1;
        break;
      case 'A':
        for (let i = 0; i + 6 < args.length; i += 7)
          push((rel ? x : 0) + (args[i + 5] ?? 0), (rel ? y : 0) + (args[i + 6] ?? 0));
        skipped += 1;
        break;
      default:
        break;
    }
  }
  return skipped;
}

function rectSegments(attrs: Attrs, tx: number, ty: number, out: Segment[]): void {
  const x = num(attrs.x) + tx;
  const y = num(attrs.y) + ty;
  const w = num(attrs.width);
  const h = num(attrs.height);
  out.push([x, y, x + w, y], [x, y + h, x + w, y + h], [x, y, x, y + h], [x + w, y, x + w, y + h]);
}

function pointsSegments(
  value: string,
  close: boolean,
  tx: number,
  ty: number,
  out: Segment[],
): void {
  const n = numbers(value);
  for (let i = 2; i + 1 < n.length; i += 2)
    out.push([(n[i - 2] ?? 0) + tx, (n[i - 1] ?? 0) + ty, (n[i] ?? 0) + tx, (n[i + 1] ?? 0) + ty]);
  if (close && n.length >= 4) {
    const last = n.length - (n.length % 2);
    out.push([
      (n[last - 2] ?? 0) + tx,
      (n[last - 1] ?? 0) + ty,
      (n[0] ?? 0) + tx,
      (n[1] ?? 0) + ty,
    ]);
  }
}

/** The label box of a text element: the estimated advance, 0.75 em above the baseline. */
export function labelBoxOf(
  x: number,
  y: number,
  size: number,
  anchor: SvgLabel['anchor'],
  text: string,
): [number, number, number, number] {
  const w = interWidthEm(text) * size;
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return [left, y - size * 0.75, w, size];
}

/** Read the viewBox attribute of the root svg element. */
export function svgViewBox(svg: string): [number, number, number, number] | undefined {
  const m = /<svg\b[^>]*\sviewBox\s*=\s*["']([^"']*)["']/i.exec(svg);
  if (!m) return undefined;
  const parts = numbers(m[1] ?? '');
  if (parts.length !== 4) return undefined;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

export function parseSvgGeometry(svg: string, sizes: SvgTextSizes = DIA_TEXT_SIZES): SvgGeometry {
  const segments: Segment[] = [];
  const labels: SvgLabel[] = [];
  let skipped = 0;
  const stack: Frame[] = [{ tx: 0, ty: 0, stroked: false, unmapped: false }];
  const top = (): Frame =>
    stack[stack.length - 1] ?? { tx: 0, ty: 0, stroked: false, unmapped: false };
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(svg)) !== null) {
    const closing = m[1] === '/';
    const name = (m[2] ?? '').toLowerCase();
    const attrs = attrsOf(m[3] ?? '');
    const selfClosing = m[4] === '/';
    if (closing) {
      if (name === 'g' || name === 'svg' || name === 'a' || name === 'switch') {
        if (stack.length > 1) stack.pop();
      }
      continue;
    }
    const parent = top();
    const t = translation(attrs.transform);
    const frame: Frame = {
      tx: parent.tx + (t?.tx ?? 0),
      ty: parent.ty + (t?.ty ?? 0),
      stroked: parent.stroked || declaresStroke(attrs),
      unmapped: parent.unmapped || t === null,
    };
    const container = name === 'g' || name === 'svg' || name === 'a' || name === 'switch';
    if (container) {
      if (!selfClosing) stack.push(frame);
      continue;
    }
    if (frame.unmapped) {
      if (
        name === 'line' ||
        name === 'rect' ||
        name === 'path' ||
        name === 'polyline' ||
        name === 'polygon' ||
        name === 'text'
      )
        skipped += 1;
      continue;
    }
    switch (name) {
      case 'line':
        segments.push([
          num(attrs.x1) + frame.tx,
          num(attrs.y1) + frame.ty,
          num(attrs.x2) + frame.tx,
          num(attrs.y2) + frame.ty,
        ]);
        break;
      case 'rect':
        if (frame.stroked) rectSegments(attrs, frame.tx, frame.ty, segments);
        break;
      case 'path':
        if (attrs.d) skipped += pathSegments(attrs.d, frame.tx, frame.ty, segments);
        break;
      case 'polyline':
        if (attrs.points) pointsSegments(attrs.points, false, frame.tx, frame.ty, segments);
        break;
      case 'polygon':
        if (attrs.points) pointsSegments(attrs.points, true, frame.tx, frame.ty, segments);
        break;
      case 'circle':
      case 'ellipse':
        skipped += 1;
        break;
      case 'text': {
        if (selfClosing) break;
        const end = svg.indexOf('</text>', TAG.lastIndex);
        if (end < 0) break;
        const inner = svg.slice(TAG.lastIndex, end);
        TAG.lastIndex = end + '</text>'.length;
        const text = inner
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
        if (!text) break;
        const cls = ` ${attrs.class ?? ''} `;
        const size =
          attrs['font-size'] !== undefined
            ? num(attrs['font-size'], sizes.text)
            : cls.includes(' lab ')
              ? sizes.lab
              : cls.includes(' sm ')
                ? sizes.sm
                : sizes.text;
        const anchorRaw =
          attrs['text-anchor'] ?? /text-anchor\s*:\s*(\w+)/.exec(attrs.style ?? '')?.[1];
        const anchor: SvgLabel['anchor'] =
          anchorRaw === 'middle' || anchorRaw === 'end' ? anchorRaw : 'start';
        const x = num(attrs.x) + frame.tx;
        const y = num(attrs.y) + frame.ty;
        labels.push({ text, x, y, size, anchor, box: labelBoxOf(x, y, size, anchor, text) });
        break;
      }
      default:
        break;
    }
  }
  return { viewBox: svgViewBox(svg), segments, labels, skipped };
}

/** Distance from a box to a segment, 0 when they intersect (static/dia.ts boxToSegment). */
export function boxToSegment(box: [number, number, number, number], seg: Segment): number {
  const [bx, by, bw, bh] = box;
  const [x1, y1, x2, y2] = seg;
  const steps = 16;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    const dx = px < bx ? bx - px : px > bx + bw ? px - (bx + bw) : 0;
    const dy = py < by ? by - py : py > by + bh ? py - (by + bh) : 0;
    const d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
}
