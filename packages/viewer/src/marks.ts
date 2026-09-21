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

/**
 * The Text with a link written over a range, or cleared from it (null), on the run model
 * (docs/FOCUS.md section 5 rank 2: Cmd+K and the toolbar's Insert link wrap the selected word as
 * a link mark, never through execCommand('createLink'), which inserts the address as text at a
 * collapsed caret). A gt run keeps no link (the mark is drawn, not read). marks.test.ts pins it.
 */
export function linkRange(
  text: Markup,
  range: readonly [number, number],
  link: string | null,
): Markup {
  if (range[0] >= range[1]) return text;
  const { paragraphs, inside } = splitAt(text, range);
  for (const p of placedOf(paragraphs)) {
    if (!inside(p) || p.run.gt) continue;
    if (link === null) delete p.run.link;
    else p.run.link = link;
  }
  return paragraphs.map((runs) => serializeRuns(mergeRuns(runs))).join('\n');
}

/**
 * The plain range of the link around an offset: the contiguous runs of the caret's paragraph that
 * carry the same link as the run at (or just before) the caret; null when that run has no link.
 * Cmd K inside a linked span edits the whole span, as Google's does.
 */
export function linkExtentAt(text: Markup, at: number): [number, number] | null {
  const placed = placedOf(parseParagraphs(text).map((runs) => runs.map((run) => ({ ...run }))));
  /* the run the caret sits in; at a boundary the linked neighbour wins, so a caret at either end
     of a link edits that link */
  const inside = placed.find((p) => p.start <= at && at < p.end);
  const before = placed.find((p) => p.end === at && p.start < p.end);
  const host =
    inside !== undefined && inside.run.link !== undefined
      ? inside
      : before !== undefined && before.run.link !== undefined
        ? before
        : inside;
  if (host === undefined || host.run.link === undefined) return null;
  const link = host.run.link;
  let start = host.start;
  let end = host.end;
  for (const p of placed) {
    if (p.paragraph !== host.paragraph || p.run.link !== link) continue;
    if (p.end === start) start = p.start;
  }
  for (const p of placed) {
    if (p.paragraph !== host.paragraph || p.run.link !== link) continue;
    if (p.start === end) end = p.end;
  }
  return [start, end];
}

/**
 * What the popover's field means as a link: the trimmed text, with `https://` in front of a bare
 * address the way Google completes "example.com"; a scheme the Text takes (https, http, mailto,
 * tel) and a slide link (`#s/<id>`, `#next`) are kept as typed; an empty field is no link (null).
 */
export function normalizeLinkInput(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return null;
  if (/^(https?:|mailto:|tel:|#)/i.test(value)) return value;
  if (/\s/.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

/** The one link every run of the range carries, for the popover's field; null when none or when they differ. */
export function linkOfRange(text: Markup, range: readonly [number, number]): string | null {
  if (range[0] >= range[1]) return null;
  const { paragraphs, inside } = splitAt(text, range);
  const runs = placedOf(paragraphs).filter(inside);
  const first = runs[0];
  if (first === undefined || first.run.link === undefined) return null;
  const link = first.run.link;
  return runs.every((p) => p.run.link === link) ? link : null;
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
  /* the range is clamped to the text before it reaches marksOfRange (schema/text.ts checkRange
     throws past the length): a caret read against the trimmed canonical text can carry DOM offsets
     one or more characters past it, VERIFICATION.md C2-F22 */
  const length = plainLength(text);
  const clamped: [number, number] = [
    Math.max(0, Math.min(range[0], length)),
    Math.max(0, Math.min(range[1], length)),
  ];
  if (clamped[0] >= clamped[1]) return marksAt(text, clamped[0]);
  const marks: RunMarks & { b?: true } = marksOfRange(text, clamped);
  if (boldOfRange(text, clamped)) marks.b = true;
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

// ---------------------------------------------------------------------------------------------
// Link detection and the address word (docs/PRODUCT.md section 2 rank 9; audit-seller 9)

/** The characters a web or mail address may hold once it is typed as one token. */
const ADDRESS_CHAR = /[\p{L}\p{N}_\-.@:/+%~#?&=]/u;
/** The punctuation a sentence hangs on the end of an address, never part of it ("see acme.com."). */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/u;
/** A top level label: letters alone, two to twenty four of them (".com", ".io", ".technology"). */
const TLD = /^[\p{L}]{2,24}$/u;

/**
 * The range of the address around a plain offset, for the double click that must select
 * `generaltranslation.com` whole where the browser's word selection stops at the dot
 * (audit-seller 9: the link wrapped "generaltranslation" and ".com" stayed outside). The token is
 * the run of address characters around the offset with the sentence's trailing punctuation
 * dropped; null when that token is not an address (`linkOfToken` says), so a plain word keeps the
 * browser's selection.
 */
export function addressRangeAt(plain: string, at: number): [number, number] | null {
  const clamped = Math.max(0, Math.min(plain.length, at));
  let start = clamped;
  let end = clamped;
  while (start > 0 && ADDRESS_CHAR.test(plain.charAt(start - 1))) start -= 1;
  while (end < plain.length && ADDRESS_CHAR.test(plain.charAt(end))) end += 1;
  const trimmed = plain.slice(start, end).replace(TRAILING_PUNCTUATION, '');
  if (trimmed === '' || linkOfToken(trimmed) === null) return null;
  return [start, start + trimmed.length];
}

/**
 * The link a typed token stands for, or null: a scheme address is kept (`https://`, `http://`,
 * `mailto:`), `www.` gains `https://`, a bare domain with a path or not (`acme.com/pricing`) gains
 * `https://`, an email becomes `mailto:`. A number with a dot (`3.5`), a version (`v1.0`), an
 * abbreviation (`e.g`) and a word are not addresses: the last label must be letters alone.
 */
export function linkOfToken(token: string): string | null {
  const value = token.trim();
  if (value === '' || /\s/.test(value)) return null;
  if (/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(value)) return value;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return value;
  if (/^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(value)) {
    const host = value.slice(value.indexOf('@') + 1);
    return TLD.test(host.slice(host.lastIndexOf('.') + 1)) ? `mailto:${value}` : null;
  }
  if (/^www\.[^\s/]+\.[^\s]+$/i.test(value)) return `https://${value}`;
  const match = /^([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)(\/[^\s]*)?$/u.exec(value);
  if (match === null) return null;
  const host = match[1] ?? '';
  const labels = host.split('.');
  const last = labels[labels.length - 1] ?? '';
  if (!TLD.test(last)) return null;
  if (labels.some((label) => label === '' || label.startsWith('-') || label.endsWith('-')))
    return null;
  return `https://${value}`;
}

/**
 * The link a token just typed before the caret earns as the space or Enter lands (Google's link
 * detection): the run of non space characters ending at `caret`, its trailing punctuation
 * dropped, when `linkOfToken` reads it as an address. `range` is the token's plain range; the
 * caller checks that the range carries no link yet.
 */
export function detectLinkBefore(
  plain: string,
  caret: number,
): { range: [number, number]; url: string } | null {
  const end = Math.max(0, Math.min(plain.length, caret));
  if (end === 0 || /\s/.test(plain.charAt(end - 1))) return null;
  let start = end;
  while (start > 0 && !/\s/.test(plain.charAt(start - 1))) start -= 1;
  let token = plain.slice(start, end);
  /* a wrapping parenthesis belongs to the sentence: "(see acme.com)" */
  if (token.startsWith('(')) {
    token = token.slice(1);
    start += 1;
  }
  token = token.replace(TRAILING_PUNCTUATION, '');
  if (token === '') return null;
  const url = linkOfToken(token);
  if (url === null) return null;
  return { range: [start, start + token.length], url };
}
