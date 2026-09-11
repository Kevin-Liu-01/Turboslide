// Diagram rules (SPEC 7.7; DECK-GRAMMAR.md:43-46): strokes 1 or 1.5 px in ink, mid or hair with
// square caps and no arrowheads, fills only ink, paper or plate, labels 12 px clear of lines,
// coordinates on the half pixel for odd strokes, and a viewBox that equals the slot width.
// Declared data is checked as data; raw svg strings are scanned for the same faults.
import type { Diagram, Finding, Mutation } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import { slotWidths } from '../context.ts';
import { LABEL_CLEARANCE, labelClearance } from '@turboslide/render/dia/snap';

export const LABEL_CLEARANCE_PX = LABEL_CLEARANCE;
const ALLOWED_FILLS = new Set([
  'none',
  'var(--ink)',
  'var(--paper)',
  'var(--plate)',
  'currentcolor',
  'inherit',
]);

export function checkDia(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  for (const slide of ctx.slideList()) {
    const widths = slotWidths(slide);
    for (const ref of ctx.blocksOf(slide)) {
      const { block } = ref;
      if (block.type !== 'dia') continue;
      const base = { blockId: block.id };
      // An icon seat (a diagram of icons and marks alone, the closed lock of slide 83) has no
      // stroke or label to keep on the pixel grid; its viewBox scales the glyph and stays.
      const seat =
        block.data !== undefined &&
        block.data.lines.length === 0 &&
        block.data.rects.length === 0 &&
        block.data.texts.length === 0 &&
        (block.data.polygons?.length ?? 0) === 0;
      if (typeof block.fit === 'object' && !seat) {
        // a nested diagram's slot is its composite cell (M5); a content-sized cell has no width
        const slotWidth = ref.parent !== undefined ? ref.width : widths[ref.slot];
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
  data.rects.forEach((rect, i) => {
    // a stroked rect draws 1 px edges: its corner sits on the half pixel like a line (s25:52)
    if (!rect.stroke) return;
    if (Number.isInteger(rect.x)) {
      offenders.push(`rect ${i} x ${rect.x}`);
      fixes.push({
        op: 'block.set',
        slideId,
        blockId,
        path: `/data/rects/${i}/x`,
        value: rect.x + 0.5,
      });
    }
    if (Number.isInteger(rect.y)) {
      offenders.push(`rect ${i} y ${rect.y}`);
      fixes.push({
        op: 'block.set',
        slideId,
        blockId,
        path: `/data/rects/${i}/y`,
        value: rect.y + 0.5,
      });
    }
  });
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
    // the clearance the editor shows live during an Alt-drag is this one arithmetic
    // (render/dia/snap.ts): strokes of lines, stroked rects and polygons, and the marker squares
    const { box, nearest } = labelClearance(data, i);
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
