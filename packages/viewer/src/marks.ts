// The run marks of inline editing (gslides-parity SPEC-2 2.2.1 to 2.2.6, 6.2 "Text marks", 7.2,
// 0.54): the pure side of Cmd+I, Cmd+U, Cmd+Shift+X, Cmd+., Cmd+, and Cmd+B over a range or the
// word at the caret. The marks toggle on the run model (schema/text.ts styleRange, marksOfRange)
// and never through the browser's execCommand, so the six marks and bold behave alike; the
// editable element's HTML is then rewritten from the canonical runs with the selection recorded
// as plain text offsets and restored (InlineText.tsx owns the DOM side). marks.test.ts pins it.
import type { Color } from '@turboslide/schema/color';
import { isColorToken, isHexColor, SEMANTIC_PALETTE } from '@turboslide/schema/color';
import {
  marksOfRange,
  mergeRuns,
  parseParagraphs,
  plainLength,
  serializeRuns,
  styleRange,
} from '@turboslide/schema/text';
import type { MarkEdit, MarkFlag, Run, RunMarks, Text as Markup } from '@turboslide/schema/text';

/** The marks a key toggles: the five flags of the span rule and bold, the display run. */
export type ToggleMark = MarkFlag | 'b';

/** A word character for the range the caret expands to when nothing is selected. */
const WORD = /[\p{L}\p{N}_'’]/u;

/**
 * The range of the word at a plain text offset: the run of word characters around it, or the
 * caret itself when it sits between two non word characters (nothing to mark).
 */
export function wordRangeAt(plain: string, at: number): [number, number] {
  const clamped = Math.max(0, Math.min(plain.length, at));
  let start = clamped;
  let end = clamped;
  while (start > 0 && WORD.test(plain.charAt(start - 1))) start -= 1;
  while (end < plain.length && WORD.test(plain.charAt(end))) end += 1;
  return [start, end];
}

/** True when every run of the range carries the mark (the toolbar's pressed state; the toggle clears then). */
export function rangeHasMark(
  text: Markup,
  range: readonly [number, number],
  mark: ToggleMark,
): boolean {
  if (range[0] >= range[1]) return false;
  if (mark === 'b') return boldOfRange(text, range);
  return marksOfRange(text, range)[mark] === true;
}

/** The edit that toggles one flag over a range: cleared when every run has it, set otherwise (sup and sub stay exclusive through styleRange). */
export function toggleMarkEdit(
  text: Markup,
  range: readonly [number, number],
  mark: MarkFlag,
): MarkEdit {
  return { [mark]: !rangeHasMark(text, range, mark) } as MarkEdit;
}

/** The Text after one mark toggles over a range; bold goes through the display run. */
export function toggleMark(
  text: Markup,
  range: readonly [number, number],
  mark: ToggleMark,
): Markup {
  if (range[0] >= range[1]) return text;
  if (mark === 'b') return setBoldRange(text, range, !boldOfRange(text, range));
  return styleRange(text, range, toggleMarkEdit(text, range, mark));
}

/** The Text with a text or highlight colour written over a range (null clears it). */
export function colorRange(
  text: Markup,
  range: readonly [number, number],
  which: 'color' | 'highlight',
  color: Color | null,
): Markup {
  if (range[0] >= range[1]) return text;
  return styleRange(text, range, which === 'color' ? { color } : { highlight: color });
}

type Placed = { paragraph: number; run: Run; start: number; end: number };

/** Every run of every paragraph split at the range's two offsets, with plain offsets (one per paragraph break). */
function splitAt(
  text: Markup,
  range: readonly [number, number],
): { paragraphs: Run[][]; inside: (p: Placed) => boolean } {
  const [from, to] = range;
  const paragraphs = parseParagraphs(text).map((runs) => {
    const out: Run[] = [];
    for (const run of runs) {
      out.push({ ...run });
    }
    return out;
  });
  /* split runs so no run straddles an offset */
  let offset = 0;
  paragraphs.forEach((runs, index) => {
    if (index > 0) offset += 1;
    for (let i = 0; i < runs.length; i += 1) {
      const run = runs[i];
      if (run === undefined) continue;
      const start = offset;
      const end = start + run.t.length;
      for (const cut of [from, to]) {
        if (cut > start && cut < end && !run.gt) {
          const head: Run = { ...run, t: run.t.slice(0, cut - start) };
          const tail: Run = { ...run, t: run.t.slice(cut - start) };
          runs.splice(i, 1, head, tail);
          break;
        }
      }
      const current = runs[i];
      offset += current === undefined ? 0 : current.t.length;
    }
  });
  const inside = (p: Placed) => p.start >= from && p.end <= to && p.end > p.start;
  return { paragraphs, inside };
}

function placedOf(paragraphs: Run[][]): Placed[] {
  const out: Placed[] = [];
  let offset = 0;
  paragraphs.forEach((runs, paragraph) => {
    if (paragraph > 0) offset += 1;
    for (const run of runs) {
      out.push({ paragraph, run, start: offset, end: offset + run.t.length });
      offset += run.t.length;
    }
  });
  return out;
}

/** True when every run inside the range is the display run (bold). */
export function boldOfRange(text: Markup, range: readonly [number, number]): boolean {
  const { paragraphs, inside } = splitAt(text, range);
  const runs = placedOf(paragraphs).filter(inside);
  return runs.length > 0 && runs.every((p) => p.run.b === true || p.run.gt === true);
}

/** The Text with the display run set or cleared over a range (Cmd+B on the run model, SPEC-2 0.54). */
export function setBoldRange(
  text: Markup,
  range: readonly [number, number],
  bold: boolean,
): Markup {
  const { paragraphs, inside } = splitAt(text, range);
  for (const p of placedOf(paragraphs)) {
    if (!inside(p) || p.run.gt) continue;
    if (bold) p.run.b = true;
    else delete p.run.b;
  }
  return paragraphs.map((runs) => serializeRuns(mergeRuns(runs))).join('\n');
}

/** The marks of the caret's run at an offset (the toolbar's pressed state with no range). */
export function marksAt(text: Markup, at: number): RunMarks & { b?: true } {
  const length = plainLength(text);
  const clamped = Math.max(0, Math.min(length, at));
  const range: [number, number] =
    clamped < length ? [clamped, clamped + 1] : clamped > 0 ? [clamped - 1, clamped] : [0, 0];
  if (range[0] >= range[1]) return {};
  const marks: RunMarks & { b?: true } = marksOfRange(text, range);
  if (boldOfRange(text, range)) marks.b = true;
  return marks;
}

/** The marks of a range, with bold, for the pressed state of the toolbar (SPEC-2 6.2). */
export function marksOf(text: Markup, range: readonly [number, number]): RunMarks & { b?: true } {
  if (range[0] >= range[1]) return marksAt(text, range[0]);
  const marks: RunMarks & { b?: true } = marksOfRange(text, range);
  if (boldOfRange(text, range)) marks.b = true;
  return marks;
}

/**
 * The palette colour a rendered CSS colour stands for (render/text.ts writes `var(--<token>)` for
 * a token, the semantic hex for the four hues and the hex itself otherwise), or null.
 */
export function colorFromCss(css: string): Color | null {
  const value = css.trim().toLowerCase();
  const token = /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1];
  if (token !== undefined) return isColorToken(token) ? token : null;
  for (const [name, hex] of Object.entries(SEMANTIC_PALETTE)) {
    if (hex.toLowerCase() === value && isColorToken(name)) return name;
  }
  const hex = /^#([0-9a-f]{6})$/.exec(value)?.[0];
  if (hex !== undefined && isHexColor(hex)) return hex;
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(value);
  if (rgb) {
    const to = (n: string) => Number(n).toString(16).padStart(2, '0');
    const out = `#${to(rgb[1] ?? '0')}${to(rgb[2] ?? '0')}${to(rgb[3] ?? '0')}`;
    for (const [name, semantic] of Object.entries(SEMANTIC_PALETTE)) {
      if (semantic.toLowerCase() === out && isColorToken(name)) return name;
    }
    return isHexColor(out) ? out : null;
  }
  return null;
}
