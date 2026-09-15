// `dia`: inline SVG diagrams (head:156-160; DECK-GRAMMAR.md:44-48). Declared data is emitted with
// half-pixel snapping on odd stroke widths, square caps and no joins; a raw `svg` string passes
// through unchanged apart from the viewBox rewrite that `fit: 'slot'` asks for (SPEC 5.2).
import { escapeAttr, escapeText, px } from '../html.ts';
import type { BlockOf, Diagram } from '@turboslide/schema/blocks';
import { dataAttrs, raster, rootAttrs } from './context.ts';
import type { BlockContext } from './context.ts';

const STROKE_CLASS = { ink: 'ink', mid: 'mid', hair: 'hair' } as const;
const FILL_VAR = {
  ink: 'var(--ink)',
  paper: 'var(--paper)',
  plate: 'var(--plate)',
  none: 'none',
} as const;

/** Snaps a coordinate to the half pixel for a 1 px stroke (report 03 section 5.11). */
export function snap(value: number, width: number): number {
  return width % 2 === 1 ? Math.round(value - 0.5) + 0.5 : Math.round(value * 2) / 2;
}

/**
 * The body of a declared diagram, one element per primitive, in the grammar's draw order: rects,
 * polygons, lines, markers, icons, marks, texts. With `attrs` the markers and texts carry
 * `data-dia="<path>"` (the pointer under `/data`) so the editor can measure them for Alt-drag
 * (SPEC 6.4) without a second parser.
 */
export function diagramBody(data: Diagram, attrs = false): string {
  let out = '';
  const dia = (path: string): string => (attrs ? ` data-dia="${path}"` : '');
  for (const rect of data.rects) {
    const strokeWidth = rect.stroke ? 1 : 0;
    const x = rect.stroke ? snap(rect.x, 1) : rect.x;
    const y = rect.stroke ? snap(rect.y, 1) : rect.y;
    out += `<rect x="${px(x)}" y="${px(y)}" width="${px(rect.w)}" height="${px(rect.h)}" fill="${FILL_VAR[rect.fill]}"`;
    if (rect.opacity !== undefined) out += ` fill-opacity="${px(rect.opacity)}"`;
    if (rect.stroke) out += ` class="${STROKE_CLASS[rect.stroke]}" stroke-width="${strokeWidth}"`;
    out += '/>';
  }
  for (const polygon of data.polygons ?? []) {
    // Closed faces (s25:57-60): a filled face has no stroke, an outline has fill none.
    const points = polygon.points.map(([x, y]) => `${px(x)},${px(y)}`).join(' ');
    out += `<polygon points="${points}" fill="${FILL_VAR[polygon.fill]}"`;
    if (polygon.opacity !== undefined) out += ` fill-opacity="${px(polygon.opacity)}"`;
    if (polygon.stroke)
      out += ` class="${STROKE_CLASS[polygon.stroke]}" stroke-width="${px(polygon.width ?? 1)}" stroke-linejoin="miter"`;
    out += '/>';
  }
  for (const line of data.lines) {
    const width = line.width ?? 1;
    const s = (v: number): string => px(width === 1 ? snap(v, 1) : v);
    out += `<line class="${STROKE_CLASS[line.stroke]}" stroke-width="${px(width)}" stroke-linecap="square" x1="${s(line.x1)}" y1="${s(line.y1)}" x2="${s(line.x2)}" y2="${s(line.y2)}"/>`;
  }
  data.markers.forEach((marker, i) => {
    // 11 px filled squares centered on the point (DECK-GRAMMAR.md:45, head:127).
    out += `<rect class="marker" x="${px(marker.x - 5.5)}" y="${px(marker.y - 5.5)}" width="11" height="11" fill="var(--ink)"${dia(`markers/${i}`)}/>`;
  });
  for (const icon of data.icons) {
    const fill =
      icon.color === 'ok'
        ? '#12a37a'
        : icon.color === 'warn'
          ? '#f0a020'
          : icon.color === 'no'
            ? '#e5484d'
            : icon.color === 'info'
              ? '#2f5ce0'
              : 'var(--ink)';
    out += `<use href="#i-${escapeAttr(icon.name)}" x="${px(icon.x)}" y="${px(icon.y)}" width="${icon.size}" height="${icon.size}" fill="${fill}"/>`;
  }
  for (const mark of data.marks) {
    if (mark.iso) {
      // The mark seated in an isometric top face (s27:15): scale(1 0.5) rotate(45).
      out += `<g transform="translate(${px(mark.x)} ${px(mark.y)}) scale(1 0.5) rotate(45)"><svg width="${px(mark.w)}" height="${px(mark.h)}" x="${px(-mark.w / 2)}" y="${px(-mark.h / 2)}" fill="var(--ink)" fill-opacity="0.55"><use href="#gt-mark"/></svg></g>`;
    } else {
      out += `<use href="#gt-mark" x="${px(mark.x)}" y="${px(mark.y)}" width="${px(mark.w)}" height="${px(mark.h)}" fill="var(--ink)"/>`;
    }
  }
  data.texts.forEach((text, i) => {
    const cls = text.size === 26 ? ' class="lab"' : text.size === 18 ? ' class="sm"' : '';
    const anchor = text.anchor && text.anchor !== 'start' ? ` text-anchor="${text.anchor}"` : '';
    out += `<text${cls} x="${px(text.x)}" y="${px(text.y)}"${anchor}${dia(`texts/${i}`)}>${escapeText(text.text)}</text>`;
  });
  return out;
}

const VIEWBOX = /\sviewBox="([^"]*)"/;
const OPEN_TAG = /^\s*<svg\b([^>]*)>/;

/** Reads the four viewBox numbers of a raw svg string. */
export function readViewBox(svg: string): [number, number, number, number] | undefined {
  const match = VIEWBOX.exec(svg);
  if (!match) return undefined;
  const parts = (match[1] ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return undefined;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

export function renderDia(block: BlockOf<'dia'>, ctx: BlockContext): string {
  const attributes = rootAttrs(block, ctx, { className: 'dia' });
  const rasterAttrs = raster(ctx, block.id, 'dia', true);
  if (block.svg) {
    // Raw svg: the string passes through; only the opening tag is rewritten so the root carries the
    // block attributes and, with fit 'slot', a viewBox whose width is the slot width.
    const open = OPEN_TAG.exec(block.svg);
    if (!open) {
      ctx.warnings.push(`${ctx.slideId}#${block.id}: raw svg does not start with <svg>`);
      return block.svg;
    }
    let inner = open[1] ?? '';
    const box = readViewBox(block.svg);
    if (block.fit === 'slot' && box && ctx.slotWidth !== undefined) {
      inner = inner.replace(
        VIEWBOX,
        ` viewBox="${px(box[0])} ${px(box[1])} ${px(ctx.slotWidth)} ${px(box[3])}"`,
      );
    }
    if (!/\saria-label=|\saria-hidden=/.test(inner)) {
      inner += block.alt ? ` aria-label="${escapeAttr(block.alt)}"` : ' aria-hidden="true"';
    }
    // a diagram object of the canvas fills its box in both axes, so a resize handle scales the
    // drawing with the box (hotfix-3 cause R5); block-css.ts gives the svg the box's size
    if (block.pos !== undefined && !/\spreserveAspectRatio=/.test(inner)) {
      inner += ' preserveAspectRatio="none"';
    }
    const classMatch = /\sclass="([^"]*)"/.exec(inner);
    const rawClasses = classMatch ? (classMatch[1] ?? '').split(/\s+/).filter(Boolean) : [];
    const merged = [...new Set(['dia', ...rawClasses, ...(attributes.class ?? '').split(' ')])]
      .filter(Boolean)
      .join(' ');
    inner = inner.replace(/\sclass="[^"]*"/, '');
    let out = `<svg class="${merged}"`;
    for (const [name, value] of Object.entries(attributes)) {
      if (name === 'class' || value === undefined) continue;
      out += ` ${name}="${escapeAttr(value)}"`;
    }
    out += dataAttrs(rasterAttrs);
    out += inner;
    out += '>';
    return out + block.svg.slice(open[0].length);
  }
  const data = block.data;
  if (!data) {
    ctx.warnings.push(`${ctx.slideId}#${block.id}: dia has neither data nor svg`);
    return '';
  }
  const width = block.fit === 'slot' && ctx.slotWidth !== undefined ? ctx.slotWidth : data.w;
  let out = `<svg class="${attributes.class ?? 'dia'}"`;
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class' || value === undefined) continue;
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  out += dataAttrs(rasterAttrs);
  out += ` viewBox="0 0 ${px(width)} ${px(data.h)}"`;
  if (block.pos !== undefined) out += ' preserveAspectRatio="none"';
  out += block.alt ? ` aria-label="${escapeAttr(block.alt)}"` : ' aria-hidden="true"';
  return `${out}>${diagramBody(data, ctx.blockAttrs)}</svg>`;
}
