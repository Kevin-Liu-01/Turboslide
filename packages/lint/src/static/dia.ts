// Diagram rules (SPEC 7.7; DECK-GRAMMAR.md:43-46): strokes 1 or 1.5 px in ink, mid or hair with
// square caps and no arrowheads, fills only ink, paper or plate, labels 12 px clear of lines,
// coordinates on the half pixel for odd strokes, and a viewBox that equals the slot width.
// Declared data is checked as data; raw svg strings are scanned for the same faults.
import type { Diagram, Finding, Mutation } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import { slotWidths } from '../context.ts';

export const LABEL_CLEARANCE_PX = 12;
const ALLOWED_FILLS = new Set([
  'none',
  'var(--ink)',
  'var(--paper)',
  'var(--plate)',
  'currentcolor',
  'inherit',
]);

/** Approximate Inter width: 0.52 em per character at weight 400 to 500 (report 03 section 4.7 labels). */
function labelBox(t: Diagram['texts'][number]): [number, number, number, number] {
  const w = t.text.length * t.size * 0.52;
  const x = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return [x, t.y - t.size * 0.75, w, t.size];
}

/** Distance from a box to a segment, 0 when they intersect. */
function boxToSegment(
  box: [number, number, number, number],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const [bx, by, bw, bh] = box;
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

export function checkDia(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  for (const slide of ctx.slideList()) {
    const widths = slotWidths(slide);
    for (const ref of ctx.blocksOf(slide)) {
      const { block } = ref;
      if (block.type !== 'dia') continue;
      const base = { blockId: block.id };
      if (typeof block.fit === 'object') {
        const slotWidth = widths[ref.slot];
        if (slotWidth !== undefined && Math.abs(block.fit.viewBox[2] - slotWidth) > 0.5) {
          out.push(
            ctx.finding('dia/fit-slot', slide.id, {
              ...base,
              path: `${ref.path}/fit`,
              measured: { viewBoxWidth: block.fit.viewBox[2], slotWidth },
              proposal: `Set fit to "slot" so one unit is one sheet pixel (the slot is ${slotWidth} px wide).`,
              fix: [
                {
                  op: 'block.set',
                  slideId: slide.id,
                  blockId: block.id,
                  path: '/fit',
                  value: 'slot',
                },
              ],
            }),
          );
        }
      }
      if (block.data) checkDeclared(ctx, out, slide.id, block.id, ref.path, block.data);
      if (block.svg) checkRaw(ctx, out, slide.id, block.id, `${ref.path}/svg`, block.svg);
    }
  }
  return out;
}

function checkDeclared(
  ctx: LintContext,
  out: Finding[],
  slideId: string,
  blockId: string,
  path: string,
  data: Diagram,
): void {
  const fixes: Mutation[] = [];
  const offenders: string[] = [];
  data.lines.forEach((line, i) => {
    // width is 1 or 1.5 by schema (DECK-GRAMMAR.md:44); the raw svg check covers other values
    const width = line.width ?? 1;
    if (width === 1) {
      if (line.x1 === line.x2 && Number.isInteger(line.x1)) {
        offenders.push(`line ${i} x ${line.x1}`);
        fixes.push(
          { op: 'block.set', slideId, blockId, path: `/data/lines/${i}/x1`, value: line.x1 + 0.5 },
          { op: 'block.set', slideId, blockId, path: `/data/lines/${i}/x2`, value: line.x2 + 0.5 },
        );
      }
      if (line.y1 === line.y2 && Number.isInteger(line.y1)) {
        offenders.push(`line ${i} y ${line.y1}`);
        fixes.push(
          { op: 'block.set', slideId, blockId, path: `/data/lines/${i}/y1`, value: line.y1 + 0.5 },
          { op: 'block.set', slideId, blockId, path: `/data/lines/${i}/y2`, value: line.y2 + 0.5 },
        );
      }
    }
  });
  if (offenders.length > 0) {
    out.push(
      ctx.finding('dia/half-pixel', slideId, {
        blockId,
        path: `${path}/data/lines`,
        text: offenders.join('; '),
        proposal:
          'Put 1 px strokes on the half pixel so they render as one crisp pixel (report 03 section 5.11).',
        fix: fixes,
      }),
    );
  }
  data.texts.forEach((t, i) => {
    const box = labelBox(t);
    let nearest = Number.POSITIVE_INFINITY;
    for (const line of data.lines)
      nearest = Math.min(nearest, boxToSegment(box, line.x1, line.y1, line.x2, line.y2));
    for (const rect of data.rects) {
      if (rect.stroke) {
        nearest = Math.min(
          nearest,
          boxToSegment(box, rect.x, rect.y, rect.x + rect.w, rect.y),
          boxToSegment(box, rect.x, rect.y + rect.h, rect.x + rect.w, rect.y + rect.h),
          boxToSegment(box, rect.x, rect.y, rect.x, rect.y + rect.h),
          boxToSegment(box, rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h),
        );
      }
    }
    if (nearest < LABEL_CLEARANCE_PX) {
      out.push(
        ctx.finding('dia/label-clearance', slideId, {
          blockId,
          path: `${path}/data/texts/${i}`,
          text: t.text,
          measured: { clearance: Math.round(nearest * 10) / 10 },
          box: box.map(Math.round) as [number, number, number, number],
          proposal: `Move the label at least ${LABEL_CLEARANCE_PX} px clear of the nearest stroke (DECK-GRAMMAR.md:45).`,
        }),
      );
    }
  });
}

function checkRaw(
  ctx: LintContext,
  out: Finding[],
  slideId: string,
  blockId: string,
  path: string,
  svg: string,
): void {
  const faults: string[] = [];
  for (const m of svg.matchAll(/stroke-width\s*[:=]\s*["']?(\d+(?:\.\d+)?)/gi)) {
    const w = Number(m[1]);
    if (w !== 1 && w !== 1.5) faults.push(`stroke-width ${w}`);
  }
  if (/stroke-linecap\s*[:=]\s*["']?round/i.test(svg)) faults.push('round caps');
  if (/stroke-linejoin\s*[:=]\s*["']?round/i.test(svg)) faults.push('round joins');
  if (/<marker\b|marker-(?:end|start)\s*[:=]/i.test(svg)) faults.push('arrowhead marker');
  for (const m of svg.matchAll(/fill\s*[:=]\s*["']?([^"';)\s>]+(?:\([^)]*\))?)/gi)) {
    const v = (m[1] ?? '').toLowerCase();
    if (!ALLOWED_FILLS.has(v) && !v.startsWith('url(')) faults.push(`fill ${v}`);
  }
  if (faults.length > 0) {
    out.push(
      ctx.finding('dia/stroke-grammar', slideId, {
        blockId,
        path,
        text: [...new Set(faults)].join('; '),
        proposal:
          'Strokes 1 or 1.5 px in ink, mid or hair with square caps, no arrowheads, fills only ink, paper or plate (DECK-GRAMMAR.md:44).',
      }),
    );
  }
  const integer: string[] = [];
  for (const m of svg.matchAll(/<line\b[^>]*>/gi)) {
    const tag = m[0];
    const width = /stroke-width\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i.exec(tag)?.[1] ?? '1';
    if (Number(width) !== 1) continue;
    const x1 = /\bx1="([^"]+)"/.exec(tag)?.[1];
    const x2 = /\bx2="([^"]+)"/.exec(tag)?.[1];
    const y1 = /\by1="([^"]+)"/.exec(tag)?.[1];
    const y2 = /\by2="([^"]+)"/.exec(tag)?.[1];
    if (x1 !== undefined && x1 === x2 && /^-?\d+$/.test(x1)) integer.push(`x ${x1}`);
    if (y1 !== undefined && y1 === y2 && /^-?\d+$/.test(y1)) integer.push(`y ${y1}`);
  }
  if (integer.length > 0) {
    out.push(
      ctx.finding('dia/half-pixel', slideId, {
        blockId,
        path,
        text: integer.slice(0, 8).join('; '),
        proposal: 'Put 1 px strokes on the half pixel (report 03 section 5.11).',
      }),
    );
  }
}
