// The composite block's track arithmetic (SPEC 4.2, M5): `tracks` is a CSS grid-template-columns
// value, and the renderer, the importer and the linter all need the width of each cell in sheet
// pixels to size the blocks inside it (a slot-fit diagram, a shot's caption measure, the dia
// fit-slot check). The parser covers what the deck writes: px tracks, fr tracks, minmax(0, Nfr),
// repeat(n, track) and percentages; anything else leaves the widths unknown and the cells inherit
// no width. Pure functions, no DOM.
import type { CompositeBlock } from '../blocks.ts';

export type Track = { kind: 'px'; px: number } | { kind: 'fr'; fr: number } | { kind: 'auto' };

/** The default composite gap, the deck's `.stack` gap (head:86). */
export const COMPOSITE_DEFAULT_GAP = 22;

function parseTrack(token: string): Track {
  const t = token.trim();
  const px = /^(\d+(?:\.\d+)?)px$/.exec(t);
  if (px) return { kind: 'px', px: Number(px[1]) };
  const fr = /^(\d+(?:\.\d+)?)fr$/.exec(t);
  if (fr) return { kind: 'fr', fr: Number(fr[1]) };
  const minmax = /^minmax\(\s*0(?:px)?\s*,\s*(\d+(?:\.\d+)?)fr\s*\)$/.exec(t);
  if (minmax) return { kind: 'fr', fr: Number(minmax[1]) };
  if (t === '100%') return { kind: 'fr', fr: 1 };
  return { kind: 'auto' };
}

/** Splits a template on white space outside parentheses. */
function tokens(template: string): string[] {
  const out: string[] = [];
  let buffer = '';
  let depth = 0;
  for (const ch of template.trim()) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (buffer) out.push(buffer);
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  if (buffer) out.push(buffer);
  return out;
}

/** The tracks of a template with `repeat(n, track)` expanded. */
export function parseTracks(template: string): Track[] {
  const out: Track[] = [];
  for (const token of tokens(template)) {
    const repeat = /^repeat\(\s*(\d+)\s*,\s*(.+)\)$/.exec(token);
    if (repeat) {
      const count = Number(repeat[1]);
      const inner = parseTracks(repeat[2] ?? '');
      for (let i = 0; i < count; i += 1) out.push(...inner);
      continue;
    }
    out.push(parseTrack(token));
  }
  return out;
}

/** True when the template is one track that fills the slot (`1fr`, `minmax(0, 1fr)`, `100%`). */
export function isSingleTrack(template: string): boolean {
  const list = parseTracks(template);
  return list.length === 1 && list[0]?.kind === 'fr';
}

/**
 * The width of every track in sheet pixels for a container width and a gap, or undefined when a
 * track is `auto` (content sized, unknown without a browser). `space-between` leaves fixed tracks
 * at their size; fr tracks share what the fixed ones leave.
 */
export function trackWidths(
  template: string,
  containerWidth: number,
  gap: number = COMPOSITE_DEFAULT_GAP,
): number[] | undefined {
  const list = parseTracks(template);
  if (list.length === 0 || list.some((t) => t.kind === 'auto')) return undefined;
  const fixed = list.reduce((sum, t) => sum + (t.kind === 'px' ? t.px : 0), 0);
  const frTotal = list.reduce((sum, t) => sum + (t.kind === 'fr' ? t.fr : 0), 0);
  const free = Math.max(0, containerWidth - fixed - gap * (list.length - 1));
  return list.map((t) => {
    if (t.kind === 'px') return t.px;
    if (t.kind === 'fr') return frTotal > 0 ? (free * t.fr) / frTotal : free / list.length;
    return free / list.length;
  });
}

/**
 * The width available to each cell of a composite in sheet pixels, in cell order: spans add the
 * spanned tracks and the gaps between them; a cell past the explicit tracks wraps onto the next
 * row and takes the track at its column. Undefined entries mean the width is unknown.
 */
export function cellWidths(
  block: Pick<CompositeBlock, 'tracks' | 'gap' | 'cells'>,
  containerWidth: number | undefined,
): (number | undefined)[] {
  if (containerWidth === undefined) return block.cells.map(() => undefined);
  const gap = block.gap ?? COMPOSITE_DEFAULT_GAP;
  const widths = trackWidths(block.tracks, containerWidth, gap);
  if (!widths) return block.cells.map(() => undefined);
  const count = widths.length;
  let column = 0;
  return block.cells.map((cell) => {
    const span = Math.max(1, Math.min(cell.span ?? 1, count));
    if (column + span > count) column = 0;
    let width = 0;
    for (let i = 0; i < span; i += 1) width += widths[column + i] ?? 0;
    width += gap * (span - 1);
    column = (column + span) % count;
    return width;
  });
}
