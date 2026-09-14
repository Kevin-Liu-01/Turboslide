// The five-rule inline text markup (SPEC 4.2 "Text"; gslides-parity SPEC-2 7.2 adds the fifth). A
// Text is a string so that `git diff` reads at the word level and an agent can type it; parseText
// turns it into runs for the renderer and serializeRuns turns runs back into the canonical string.
// Resolution recorded in SPEC 4.2: the agent-nativeness judge chose the string over a
// `string | Run[]` union.
//
//   *text*             the display run: weight 500, the deck's <b> (DECK-GRAMMAR.md:20)
//   [text](https://…)  a link; inside rows.links an external glyph follows it (head:121)
//   [text]{marks}      the mark span (SPEC-2 0.5): marks is a space separated list of
//                      i u s sup sub c:<color> h:<color>, written in that canonical order;
//                      italic, underline, strikethrough, superscript, subscript, text colour
//                      and highlight. [text](url){marks} is a linked span; the order of the
//                      (url) and {marks} parts is free on input. Unknown marks leave the
//                      brackets literal.
//   GT                 a standalone GT word becomes the mark at render (head:70-74); the document
//                      keeps the letters. The renderer skips panels, links and decks with gtWord
//                      off; the parser never flags GT inside a link.
//   \*  \[  \GT        escapes; a literal "]{" after an escaped "[" stays literal
//
// No line breaks inside a string except a paragraph break in the multiline pointers
// (paragraph.text, text.text, box.text, shape.text and a table cell; gslides-parity SPEC 7.4) and
// \n in panel.code. A non-breaking space (U+00A0) is the nowrap device.
//
// A link whose target is `#s/<slideId>`, `#next`, `#previous`, `#first` or `#last` is a slide
// link (gslides-parity SPEC 7.2.8): the viewer and the standalone runtime resolve it, the
// validator checks that the slide exists, and the export writes it as a slide hyperlink.
import { z } from 'zod';
import { annotate } from './annotate.ts';
import type { Color } from './color.ts';
import { colorSchema } from './color.ts';
import type { SlideId } from './ids.ts';
import { slugSchema } from './ids.ts';

export type Text = string;

/**
 * The marks a run carries beyond the display run and the link (SPEC-2 7.2): `sup` and `sub` are
 * exclusive, `color` is the text colour and `hl` the highlight, each a palette token or a hex.
 */
export type RunMarks = {
  i?: true;
  u?: true;
  s?: true;
  sup?: true;
  sub?: true;
  color?: Color;
  hl?: Color;
};

/** parseText(text): Run[]; serializeRuns(runs): Text. A gt run always has t === 'GT'. */
export type Run = RunMarks & { t: string; b?: true; gt?: true; link?: string };

/** The boolean marks in canonical order (SPEC-2 7.2). */
export const MARK_FLAGS = ['i', 'u', 's', 'sup', 'sub'] as const;
export type MarkFlag = (typeof MARK_FLAGS)[number];

/** No line breaks in a Text; panel.code is a plain string and is not a Text (SPEC 4.2). */
export const textSchema = z
  .string()
  .refine((value) => !/[\n\r]/.test(value), 'a Text has no line breaks (SPEC 4.2)');

/**
 * A Text that may hold paragraph breaks: `\n` separates paragraphs, `\r` is refused. The catalog
 * names the pointers that take it (gslides-parity SPEC 7.4); every other Text keeps the one line
 * rule of textSchema.
 */
export const multilineTextSchema = z
  .string()
  .refine(
    (value) => !/\r/.test(value),
    'a multiline Text separates paragraphs with \\n and holds no \\r (gslides-parity SPEC 7.4)',
  );

/** The paragraphs of a Text: the string split on `\n`; a one line Text is one paragraph. */
export function splitParagraphs(text: Text): string[] {
  return text.split('\n');
}

/** The runs of every paragraph, in order (the renderer draws one paragraph per entry). */
export function parseParagraphs(text: Text): Run[][] {
  return splitParagraphs(text).map((paragraph) => parseText(paragraph));
}

// ---------------------------------------------------------------------------------------------
// Slide links

export const SLIDE_LINK_KEYWORDS = ['next', 'previous', 'first', 'last'] as const;
export type SlideLinkKeyword = (typeof SLIDE_LINK_KEYWORDS)[number];

/** The target of a slide link: a slide id, or one of the four positions. */
export type SlideLinkTarget = { slide: string | SlideLinkKeyword };

const SLIDE_LINK_ID = /^#s\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Reads a link URL as a slide link: `#s/<slideId>` names a slide, `#next`, `#previous`, `#first`
 * and `#last` a position among the deck's slides; null for any other URL.
 */
export function slideLinkTarget(url: string): SlideLinkTarget | null {
  const id = SLIDE_LINK_ID.exec(url);
  if (id?.[1] !== undefined) return { slide: id[1] };
  if (url.startsWith('#')) {
    const keyword = url.slice(1);
    if ((SLIDE_LINK_KEYWORDS as ReadonlyArray<string>).includes(keyword))
      return { slide: keyword as SlideLinkKeyword };
  }
  return null;
}

/** The link URL for a slide link target: `#s/<slideId>` or `#<keyword>`. */
export function slideLinkUrl(target: SlideLinkTarget): string {
  return (SLIDE_LINK_KEYWORDS as ReadonlyArray<string>).includes(target.slide)
    ? `#${target.slide}`
    : `#s/${target.slide}`;
}

/**
 * A link on a whole object (gslides-parity SPEC 7.2.7): a URL, or a slide by id or by position.
 * Active in present mode, the view route and the standalone build; inert on the editor stage.
 * Allowed on pictures, shapes, boxes, text boxes, icons and the other non-text blocks; a grammar
 * text block links through a run link in its Text instead (validate.ts LINK_REFUSED_BLOCK_TYPES).
 */
export type BlockLink = string | { slide: SlideId | SlideLinkKeyword };

/**
 * A URL, or `{ slide }` naming a slide id or one of next, previous, first, last. The URL form
 * takes https, http, mailto, tel and the slide link forms only (gslides-parity SPEC-3 8.4).
 */
export const blockLinkSchema = z.union([
  z
    .string()
    .min(1)
    .refine(
      (value) => isAllowedLink(value),
      'a link is https:, http:, mailto:, tel: or a slide link (#s/<id>, #next, #previous, #first, #last)',
    ),
  z.strictObject({ slide: z.union([slugSchema, z.enum(SLIDE_LINK_KEYWORDS)]) }),
]) satisfies z.ZodType<BlockLink>;

/** The optional `link` field every block schema carries, with its inspector annotation. */
export const blockLinkField = annotate(blockLinkSchema.optional(), {
  label: 'Link',
  control: 'json',
  group: 'Block',
  help: 'A URL, or { "slide": "<id>" | "next" | "previous" | "first" | "last" }; active when presenting, in the shared view and in the downloads (gslides-parity SPEC 7.2.7).',
});

/** The slide a block link points at, as a slide link target; null for a URL or no link. */
export function blockLinkSlide(link: BlockLink | undefined): SlideLinkTarget | null {
  if (link === undefined) return null;
  return typeof link === 'string' ? slideLinkTarget(link) : { slide: link.slide };
}

/** The slide ids and keywords every run link of a Text points at, in order. */
export function slideLinksOf(text: Text): SlideLinkTarget[] {
  const out: SlideLinkTarget[] = [];
  for (const run of parseText(text)) {
    if (run.link === undefined) continue;
    const target = slideLinkTarget(run.link);
    if (target !== null) out.push(target);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The parser

/**
 * Characters that keep GT from being a standalone word: the letters of gt-next, a URL path or file
 * name, a package. Punctuation after the word (`GT:` on slide 53, `(GT)`) leaves it standalone, so
 * the set is word characters plus dot, hyphen and slash only, the same set the render applies
 * (SPEC 4.2, 5.2; deck/slides/53-content-rule.html:10).
 */
const WORD_CHARACTER = /[A-Za-z0-9_\-./]/;

function isBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  return !WORD_CHARACTER.test(text.charAt(index));
}

/** True when text[start..start+2) is 'GT' and both sides are boundaries. */
function standaloneGtAt(text: string, start: number, before: number): boolean {
  return (
    text.charAt(start) === 'G' &&
    text.charAt(start + 1) === 'T' &&
    isBoundary(text, before) &&
    isBoundary(text, start + 2)
  );
}

/** Index of the next `needle` from `from` that is not preceded by a backslash, or -1. */
function findUnescaped(text: string, needle: string, from: number): number {
  let i = text.indexOf(needle, from);
  while (i > 0 && text.charAt(i - 1) === '\\') i = text.indexOf(needle, i + 1);
  return i;
}

type Flags = RunMarks & { b?: true; link?: string };

function makeRun(t: string, flags: Flags, gt: boolean): Run {
  const run: Run = { t };
  if (flags.b) run.b = true;
  for (const flag of MARK_FLAGS) if (flags[flag]) run[flag] = true;
  if (flags.color !== undefined) run.color = flags.color;
  if (flags.hl !== undefined) run.hl = flags.hl;
  if (flags.link !== undefined) run.link = flags.link;
  if (gt) run.gt = true;
  return run;
}

/**
 * Reads a `{marks}` list into marks, or null when a token is not a mark (the brackets then stay
 * literal). `sup` beside `sub` keeps the first and drops the second (SPEC-2 7.2); markConflicts
 * reports it.
 */
export function parseMarks(list: string): RunMarks | null {
  const marks: RunMarks = {};
  const tokens = list.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  for (const token of tokens) {
    if ((MARK_FLAGS as ReadonlyArray<string>).includes(token)) {
      const flag = token as MarkFlag;
      if ((flag === 'sup' && marks.sub) || (flag === 'sub' && marks.sup)) continue;
      marks[flag] = true;
      continue;
    }
    const colon = token.indexOf(':');
    if (colon !== 1) return null;
    const kind = token.charAt(0);
    const value = token.slice(2);
    if (!colorSchema.safeParse(value).success) return null;
    if (kind === 'c') marks.color = value as Color;
    else if (kind === 'h') marks.hl = value as Color;
    else return null;
  }
  return marks;
}

/** The marks of a run or flag set in canonical order, as the `{…}` list without the braces. */
export function serializeMarks(marks: RunMarks): string {
  const out: string[] = [];
  for (const flag of MARK_FLAGS) if (marks[flag]) out.push(flag);
  if (marks.color !== undefined) out.push(`c:${marks.color}`);
  if (marks.hl !== undefined) out.push(`h:${marks.hl}`);
  return out.join(' ');
}

/** The `(url)` and `{marks}` parts after a closing bracket, in either order; null when neither parses. */
function spanTail(
  text: string,
  from: number,
): { link?: string; marks?: RunMarks; end: number } | null {
  let i = from;
  let link: string | undefined;
  let marks: RunMarks | undefined;
  for (let part = 0; part < 2; part += 1) {
    const c = text.charAt(i);
    if (c === '(' && link === undefined) {
      const end = text.indexOf(')', i + 1);
      const url = end > i + 1 ? text.slice(i + 1, end) : '';
      if (url === '' || /\s/.test(url)) return null;
      link = url;
      i = end + 1;
      continue;
    }
    if (c === '{' && marks === undefined) {
      const end = text.indexOf('}', i + 1);
      if (end < 0) return null;
      const parsed = parseMarks(text.slice(i + 1, end));
      if (parsed === null) return null;
      marks = parsed;
      i = end + 1;
      continue;
    }
    break;
  }
  if (link === undefined && marks === undefined) return null;
  return {
    ...(link !== undefined ? { link } : {}),
    ...(marks !== undefined ? { marks } : {}),
    end: i,
  };
}

function parseInto(text: string, flags: Flags, out: Run[]): void {
  let buffer = '';
  const flush = (): void => {
    if (buffer !== '') out.push(makeRun(buffer, flags, false));
    buffer = '';
  };
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if (c === '\\') {
      const next = text.charAt(i + 1);
      if (next === '*' || next === '[') {
        buffer += next;
        i += 2;
        continue;
      }
      if (standaloneGtAt(text, i + 1, i - 1)) {
        buffer += 'GT';
        i += 3;
        continue;
      }
      buffer += c;
      i += 1;
      continue;
    }
    if (c === '*' && !flags.b) {
      const close = findUnescaped(text, '*', i + 1);
      if (close > i + 1) {
        flush();
        parseInto(text.slice(i + 1, close), { ...flags, b: true }, out);
        i = close + 1;
        continue;
      }
    }
    if (c === '[') {
      const close = findUnescaped(text, ']', i + 1);
      if (close > i + 1) {
        const tail = spanTail(text, close + 1);
        if (tail !== null && (tail.link === undefined || flags.link === undefined)) {
          const inner: Flags = { ...flags, ...(tail.marks ?? {}) };
          if (tail.link !== undefined) inner.link = tail.link;
          // sup and sub stay exclusive when a span nests inside another (SPEC-2 7.2)
          if (tail.marks?.sup && flags.sub) delete inner.sup;
          if (tail.marks?.sub && flags.sup) delete inner.sub;
          flush();
          parseInto(text.slice(i + 1, close), inner, out);
          i = tail.end;
          continue;
        }
      }
    }
    if (flags.link === undefined && standaloneGtAt(text, i, i - 1)) {
      flush();
      out.push(makeRun('GT', flags, true));
      i += 2;
      continue;
    }
    buffer += c;
    i += 1;
  }
  flush();
}

/** The marks of a run, without its text, display and link flags. */
export function runMarks(run: Run): RunMarks {
  const marks: RunMarks = {};
  for (const flag of MARK_FLAGS) if (run[flag]) marks[flag] = true;
  if (run.color !== undefined) marks.color = run.color;
  if (run.hl !== undefined) marks.hl = run.hl;
  return marks;
}

function sameFlags(a: Run, b: Run): boolean {
  return (
    a.b === b.b &&
    a.link === b.link &&
    a.gt === undefined &&
    b.gt === undefined &&
    serializeMarks(a) === serializeMarks(b)
  );
}

/** Merges adjacent runs with identical flags; gt runs stay separate. */
export function mergeRuns(runs: ReadonlyArray<Run>): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.t === '') continue;
    const last = out[out.length - 1];
    if (last !== undefined && sameFlags(last, run)) last.t += run.t;
    else out.push({ ...run });
  }
  return out;
}

/** Parses the markup into runs. Unclosed `*` and `[` are literal characters. */
export function parseText(text: Text): Run[] {
  const runs: Run[] = [];
  parseInto(text, {}, runs);
  return mergeRuns(runs);
}

/**
 * The `{…}` lists of a Text that name both sup and sub (SPEC-2 7.2): the parser keeps the first
 * and drops the second, and the validator notes it at severity 1. The pointer is the offset of
 * the list in the markup string.
 */
export function markConflicts(text: Text): { at: number; list: string }[] {
  const out: { at: number; list: string }[] = [];
  for (const match of text.matchAll(/\{([^}]*)\}/g)) {
    const tokens = (match[1] ?? '').trim().split(/\s+/);
    if (tokens.includes('sup') && tokens.includes('sub'))
      out.push({ at: match.index, list: match[1] ?? '' });
  }
  return out;
}

/** Escapes `*`, `[` and any standalone GT so the text parses back to the same plain run. */
function escapeRunText(t: string, inLink: boolean): string {
  let out = '';
  let i = 0;
  while (i < t.length) {
    const c = t.charAt(i);
    if (c === '*' || c === '[') {
      out += `\\${c}`;
      i += 1;
      continue;
    }
    if (!inLink && standaloneGtAt(t, i, i - 1)) {
      out += '\\GT';
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function serializeOne(run: Run): string {
  const marks = serializeMarks(run);
  const inner = run.gt ? 'GT' : escapeRunText(run.t, run.link !== undefined);
  if (run.link === undefined && marks === '') return inner;
  let out = `[${inner}]`;
  if (run.link !== undefined) out += `(${run.link})`;
  if (marks !== '') out += `{${marks}}`;
  return out;
}

/**
 * The canonical string for a run list: bold runs grouped in one `*…*` (the display run stays
 * outside a mark span, SPEC-2 7.2), every marked or linked run as one bracket, escapes applied.
 */
export function serializeRuns(runs: ReadonlyArray<Run>): Text {
  const merged = mergeRuns(runs);
  let out = '';
  let i = 0;
  while (i < merged.length) {
    const run = merged[i];
    if (run === undefined) break;
    if (run.b) {
      let j = i;
      let inner = '';
      while (j < merged.length) {
        const next = merged[j];
        if (next === undefined || !next.b) break;
        inner += serializeOne(next);
        j += 1;
      }
      out += `*${inner}*`;
      i = j;
    } else {
      out += serializeOne(run);
      i += 1;
    }
  }
  return out;
}

/**
 * parse then serialize: the form the validator stores so escapes are canonical (SPEC 4.4). Runs
 * per paragraph, so a paragraph break never joins two paragraphs' markup (gslides-parity SPEC 7.4).
 */
export function canonicalText(text: Text): Text {
  return splitParagraphs(text)
    .map((paragraph) => serializeRuns(parseText(paragraph)))
    .join('\n');
}

/** The visible characters with markup removed; what the copy rules read. */
export function plainText(text: Text): string {
  return parseText(text)
    .map((run) => run.t)
    .join('');
}

// ---------------------------------------------------------------------------------------------
// Ranges in the plain text (SPEC-2 section 3: text.style, text.case, text.insert)

/**
 * A run of one paragraph with its plain text offsets in the whole Text, where the `\n` between
 * two paragraphs counts as one character (SPEC-2 3, text.style: "in the plain text of the Text").
 */
export type PlacedRun = { paragraph: number; run: Run; start: number; end: number };

/** Every run of every paragraph with its plain offsets. */
export function placeRuns(text: Text): PlacedRun[] {
  const out: PlacedRun[] = [];
  let offset = 0;
  parseParagraphs(text).forEach((runs, paragraph) => {
    if (paragraph > 0) offset += 1;
    for (const run of runs) {
      out.push({ paragraph, run, start: offset, end: offset + run.t.length });
      offset += run.t.length;
    }
  });
  return out;
}

/** The length of the plain text with one character per paragraph break. */
export function plainLength(text: Text): number {
  return splitParagraphs(text).reduce(
    (sum, paragraph, index) => sum + plainText(paragraph).length + (index > 0 ? 1 : 0),
    0,
  );
}

function checkRange(text: Text, range: readonly [number, number]): [number, number] {
  const length = plainLength(text);
  const [start, end] = range;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start)
    throw new RangeError(
      `A text range is [start, end] with 0 <= start <= end, got ${start}:${end}`,
    );
  if (end > length)
    throw new RangeError(`The range ${start}:${end} is outside a text of ${length} characters`);
  return [start, end];
}

/**
 * The runs of every paragraph with the runs that cross `start` or `end` split there, so a range
 * edit touches whole runs. A gt run is never split (it is the two letters GT); a range that cuts
 * through one takes the whole run.
 */
function splitAt(
  text: Text,
  range: readonly [number, number],
): { paragraphs: Run[][]; inside: (placed: PlacedRun) => boolean } {
  const [start, end] = checkRange(text, range);
  const paragraphs: Run[][] = splitParagraphs(text).map(() => []);
  let offset = 0;
  parseParagraphs(text).forEach((runs, paragraph) => {
    if (paragraph > 0) offset += 1;
    const list = paragraphs[paragraph] ?? [];
    for (const run of runs) {
      const from = offset;
      const to = offset + run.t.length;
      offset = to;
      if (run.gt) {
        list.push(run);
        continue;
      }
      const cuts = [start, end].filter((cut) => cut > from && cut < to).sort((a, b) => a - b);
      let at = from;
      for (const cut of [...cuts, to]) {
        if (cut === at) continue;
        list.push({ ...run, t: run.t.slice(at - from, cut - from) });
        at = cut;
      }
    }
    paragraphs[paragraph] = list;
  });
  return {
    paragraphs,
    inside: (placed) => placed.start >= start && placed.end <= end && placed.end > placed.start,
  };
}

function placeParagraphs(paragraphs: ReadonlyArray<Run[]>): PlacedRun[] {
  const out: PlacedRun[] = [];
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

/** What text.style writes: true sets a mark, false clears it, null clears a colour (SPEC-2 3). */
export type MarkEdit = {
  i?: boolean;
  u?: boolean;
  s?: boolean;
  sup?: boolean;
  sub?: boolean;
  color?: Color | null;
  highlight?: Color | null;
};

/** The runs over a plain text range with the marks applied; the rest of the Text is unchanged. */
export function styleRange(text: Text, range: readonly [number, number], edit: MarkEdit): Text {
  const { paragraphs, inside } = splitAt(text, range);
  for (const placed of placeParagraphs(paragraphs)) {
    if (!inside(placed)) continue;
    const run = placed.run;
    for (const flag of MARK_FLAGS) {
      const value = edit[flag];
      if (value === true) run[flag] = true;
      else if (value === false) delete run[flag];
    }
    // sup and sub stay exclusive: setting one clears the other
    if (edit.sup === true) delete run.sub;
    if (edit.sub === true) delete run.sup;
    if (edit.color === null) delete run.color;
    else if (edit.color !== undefined) run.color = edit.color;
    if (edit.highlight === null) delete run.hl;
    else if (edit.highlight !== undefined) run.hl = edit.highlight;
  }
  return paragraphs.map((runs) => serializeRuns(runs)).join('\n');
}

/** The marks every run of the range carries (the toolbar's pressed state); empty when the range is empty. */
export function marksOfRange(text: Text, range: readonly [number, number]): RunMarks {
  const { paragraphs, inside } = splitAt(text, range);
  const runs = placeParagraphs(paragraphs).filter(inside);
  const first = runs[0];
  if (first === undefined) return {};
  const marks = runMarks(first.run);
  for (const placed of runs.slice(1)) {
    const other = runMarks(placed.run);
    for (const flag of MARK_FLAGS) if (!other[flag]) delete marks[flag];
    if (other.color !== marks.color) delete marks.color;
    if (other.hl !== marks.hl) delete marks.hl;
  }
  return marks;
}

export const CASE_MODES = ['lower', 'upper', 'title'] as const;
export type CaseMode = (typeof CASE_MODES)[number];

const TITLE_WORD_CHARACTER = /[\p{L}\p{N}'’]/u;

/**
 * Title Case as Google writes it: the first letter of every word up, the rest down. `before` is
 * the character that precedes `text` in its paragraph (the empty string at the paragraph start),
 * so a run that starts inside a word (a mark boundary, a concurrent splice) does not capitalize
 * mid word: the result depends on the characters alone, never on where the runs are cut, which
 * is what the multiplayer transform relies on (gslides-parity SPEC-3 3.4).
 */
export function titleCase(text: string, before = ''): string {
  const lower = text.toLowerCase();
  const startsWord = !TITLE_WORD_CHARACTER.test(before);
  return lower.replace(
    /(^|[^\p{L}\p{N}'’])(\p{L})/gu,
    (match, prefix: string, letter: string, offset: number) =>
      offset === 0 && prefix === '' && !startsWord ? match : `${prefix}${letter.toUpperCase()}`,
  );
}

/** The characters of the range rewritten in a case, marks and links kept (SPEC-2 0.19, 2.2.14). */
export function caseRange(text: Text, range: readonly [number, number], mode: CaseMode): Text {
  const { paragraphs, inside } = splitAt(text, range);
  const plain = plainOf(text);
  for (const placed of placeParagraphs(paragraphs)) {
    if (!inside(placed) || placed.run.gt) continue;
    const t = placed.run.t;
    // the character before the run in its paragraph; a paragraph break counts as none
    const before = placed.start > 0 ? plain.slice(placed.start - 1, placed.start) : '';
    placed.run.t =
      mode === 'lower'
        ? t.toLowerCase()
        : mode === 'upper'
          ? t.toUpperCase()
          : titleCase(t, before === '\n' ? '' : before);
  }
  return paragraphs.map((runs) => serializeRuns(runs)).join('\n');
}

/**
 * A string inserted at a plain text offset as a plain run (the special characters picker,
 * SPEC-2 2.2.15); it takes the marks of the run it lands inside, as a caret does. A `\n` in the
 * string starts a new paragraph.
 */
export function insertAt(text: Text, at: number, insert: string): Text {
  const { paragraphs } = splitAt(text, [at, at]);
  const placed = placeParagraphs(paragraphs);
  // the run that ends at the offset (typing continues it), else the one that starts there
  const before = placed.find((row) => row.end === at && !row.run.gt);
  const after = placed.find((row) => row.start === at);
  const host = before ?? after;
  const paragraphOf = (offset: number): number => {
    let cursor = 0;
    for (let i = 0; i < paragraphs.length; i += 1) {
      const length = (paragraphs[i] ?? []).reduce((sum, run) => sum + run.t.length, 0);
      if (offset <= cursor + length) return i;
      cursor += length + 1;
    }
    return paragraphs.length - 1;
  };
  const template: Run = host === undefined ? { t: '' } : { ...host.run, t: '' };
  delete template.gt;
  const pieces = insert.split('\n');
  const paragraph = paragraphOf(at);
  const list = paragraphs[paragraph] ?? [];
  const index =
    before !== undefined && before.paragraph === paragraph
      ? list.indexOf(before.run) + 1
      : after !== undefined && after.paragraph === paragraph
        ? list.indexOf(after.run)
        : list.length;
  const firstPiece = pieces[0] ?? '';
  const head = list.slice(0, index);
  const tail = list.slice(index);
  if (pieces.length === 1) {
    list.splice(0, list.length, ...head, { ...template, t: firstPiece }, ...tail);
    paragraphs[paragraph] = list;
  } else {
    const newParagraphs: Run[][] = [];
    newParagraphs.push([...head, { ...template, t: firstPiece }]);
    for (const middle of pieces.slice(1, -1)) newParagraphs.push([{ ...template, t: middle }]);
    newParagraphs.push([{ ...template, t: pieces[pieces.length - 1] ?? '' }, ...tail]);
    paragraphs.splice(paragraph, 1, ...newParagraphs);
  }
  return paragraphs.map((runs) => serializeRuns(runs)).join('\n');
}

// ---------------------------------------------------------------------------------------------
// Splices, flag edits and flag diffs in plain offsets (gslides-parity SPEC-3 3.1: the text.splice
// and text.mark mutations). The offsets are the plain text offsets the range functions above use,
// one character per paragraph break, so a comment anchor, a caret and a mutation count the same.

/**
 * Every flag a run carries but its characters: the marks, the display run and the link. What
 * text.mark's `set` writes and its `clear` removes; `gt` is derived from the characters and is
 * not a flag. The display run and the link are here so the inverse of a splice that removed a
 * bold word or a link restores it exactly (SPEC-3 3.1 names RunMarks; b1.md records the widening).
 */
export type RunFlags = RunMarks & { b?: true; link?: string };

/** The keys of RunFlags in canonical order; what text.mark's `clear` names. */
export const RUN_FLAG_KEYS = [...MARK_FLAGS, 'color', 'hl', 'b', 'link'] as const;
export type RunFlagKey = (typeof RUN_FLAG_KEYS)[number];

export const runFlagsSchema = z.strictObject({
  i: z.literal(true).optional(),
  u: z.literal(true).optional(),
  s: z.literal(true).optional(),
  sup: z.literal(true).optional(),
  sub: z.literal(true).optional(),
  color: colorSchema.optional(),
  hl: colorSchema.optional(),
  b: z.literal(true).optional(),
  link: z.string().min(1).optional(),
}) satisfies z.ZodType<RunFlags>;

/** What text.mark's `marks` kind carries: flags to set and flag keys to clear. */
export type FlagEdit = { set?: RunFlags; clear?: ReadonlyArray<RunFlagKey> };

/** A flag edit over a plain text range, what flagDiffs returns. */
export type FlagEditRange = FlagEdit & { range: [number, number] };

/** The flags of a run. */
export function runFlags(run: Run): RunFlags {
  const flags: RunFlags = runMarks(run);
  if (run.b) flags.b = true;
  if (run.link !== undefined) flags.link = run.link;
  return flags;
}

/** An empty run carrying exactly these flags: the template a pinned insertion is placed with. */
function runOfFlags(flags: RunFlags): Run {
  const run: Run = { t: '' };
  for (const flag of MARK_FLAGS) if (flags[flag]) run[flag] = true;
  if (run.sup && run.sub) delete run.sub;
  if (flags.color !== undefined) run.color = flags.color;
  if (flags.hl !== undefined) run.hl = flags.hl;
  if (flags.b) run.b = true;
  if (flags.link !== undefined) run.link = flags.link;
  return run;
}

export function sameRunFlags(a: RunFlags, b: RunFlags): boolean {
  return RUN_FLAG_KEYS.every((key) => a[key] === b[key]);
}

/** The plain text of a Text with one `\n` per paragraph break: the string plain offsets index. */
export function plainOf(text: Text): string {
  return splitParagraphs(text).map(plainText).join('\n');
}

/**
 * Every run of every paragraph split at the cuts. A gt run is split too when a cut lies inside
 * it, and its pieces become plain runs: a splice that removes the T of GT leaves a G.
 */
function splitRunsAt(text: Text, cuts: ReadonlyArray<number>): Run[][] {
  const sorted = [...new Set(cuts)].sort((a, b) => a - b);
  const paragraphs: Run[][] = [];
  let offset = 0;
  parseParagraphs(text).forEach((runs, paragraph) => {
    if (paragraph > 0) offset += 1;
    const list: Run[] = [];
    for (const run of runs) {
      const from = offset;
      const to = from + run.t.length;
      offset = to;
      const inner = sorted.filter((cut) => cut > from && cut < to);
      if (inner.length === 0) {
        list.push({ ...run });
        continue;
      }
      let at = from;
      for (const cut of [...inner, to]) {
        if (cut === at) continue;
        const piece: Run = { ...run, t: run.t.slice(at - from, cut - from) };
        delete piece.gt;
        list.push(piece);
        at = cut;
      }
    }
    paragraphs.push(list);
  });
  return paragraphs;
}

function joinParagraphs(paragraphs: ReadonlyArray<Run[]>): Text {
  return paragraphs.map((runs) => serializeRuns(runs)).join('\n');
}

/** The runs with the plain range [at, end) removed; a break inside the range joins its paragraphs. */
function deleteRange(text: Text, at: number, end: number): Run[][] {
  const split = splitRunsAt(text, [at, end]);
  const out: Run[][] = [];
  let current: Run[] = [];
  let offset = 0;
  split.forEach((runs, paragraph) => {
    if (paragraph > 0) {
      const breakAt = offset;
      offset += 1;
      if (!(breakAt >= at && breakAt < end)) {
        out.push(current);
        current = [];
      }
    }
    for (const run of runs) {
      const from = offset;
      const to = from + run.t.length;
      offset = to;
      if (!(from >= at && to <= end)) current.push(run);
    }
  });
  out.push(current);
  return out;
}

/**
 * `insert` placed at a plain offset with the flags of `template` when given, else of the run it
 * continues: the run that ends at the offset (typing continues it), else the run that starts
 * there, the rule of insertAt. A `\n` in the string starts a paragraph.
 */
function insertPlain(paragraphs: Run[][], at: number, insert: string, template?: Run): Run[][] {
  let offset = 0;
  for (let p = 0; p < paragraphs.length; p += 1) {
    if (p > 0) offset += 1;
    const runs = paragraphs[p] ?? [];
    const length = runs.reduce((sum, run) => sum + run.t.length, 0);
    if (at > offset + length) {
      offset += length;
      continue;
    }
    const local = at - offset;
    // the count of runs wholly before the offset, splitting the run that straddles it
    let index = 0;
    let cursor = 0;
    for (let i = 0; i < runs.length; i += 1) {
      const run = runs[i];
      if (run === undefined) break;
      const from = cursor;
      const to = from + run.t.length;
      cursor = to;
      if (to <= local) {
        index = i + 1;
        continue;
      }
      if (from < local) {
        const head: Run = { ...run, t: run.t.slice(0, local - from) };
        const tail: Run = { ...run, t: run.t.slice(local - from) };
        delete head.gt;
        delete tail.gt;
        runs.splice(i, 1, head, tail);
        index = i + 1;
      }
      break;
    }
    const before = runs[index - 1];
    const after = runs[index];
    const host = template ?? (before !== undefined && !before.gt ? before : after);
    const flags: Run = host === undefined ? { t: '' } : { ...host, t: '' };
    delete flags.gt;
    const pieces = insert.split('\n');
    const head = runs.slice(0, index);
    const tail = runs.slice(index);
    const first = pieces[0] ?? '';
    if (pieces.length === 1) {
      paragraphs[p] = [...head, { ...flags, t: first }, ...tail];
      return paragraphs;
    }
    const inserted: Run[][] = [[...head, { ...flags, t: first }]];
    for (const middle of pieces.slice(1, -1)) inserted.push([{ ...flags, t: middle }]);
    inserted.push([{ ...flags, t: pieces[pieces.length - 1] ?? '' }, ...tail]);
    paragraphs.splice(p, 1, ...inserted);
    return paragraphs;
  }
  return paragraphs;
}

/**
 * What text.splice writes (SPEC-3 3.1): `remove` plain characters at `at` leave and `insert`
 * lands in their place. A pure insertion takes the flags of the run it continues (the run that
 * ends at the offset, else the one that starts there, the rule of insertAt); a replacement takes
 * the flags of the first character it replaces, as typing over a selection does in an editor, so
 * retyping a bold word keeps it bold. A break inside the removed range joins its two paragraphs
 * and a `\n` in the insertion starts one. Throws RangeError outside the text. The result is
 * canonical.
 */
export function spliceText(
  text: Text,
  at: number,
  remove: number,
  insert: string,
  flags?: RunFlags,
): Text {
  const length = plainLength(text);
  if (
    !Number.isInteger(at) ||
    !Number.isInteger(remove) ||
    at < 0 ||
    remove < 0 ||
    at + remove > length
  ) {
    throw new RangeError(
      `A splice at ${at} removing ${remove} characters is outside a text of ${length} characters`,
    );
  }
  if (remove === 0 && insert === '') return text;
  // pinned flags win (SPEC-3 3.1, the room client's caret run); else a replacement takes the
  // flags of the first character it replaces and a pure insertion follows insertAt's rule
  const replaced =
    flags !== undefined
      ? runOfFlags(flags)
      : remove > 0
        ? placeRuns(text).find((row) => row.start <= at && at < row.end)?.run
        : undefined;
  let paragraphs = remove === 0 ? splitRunsAt(text, []) : deleteRange(text, at, at + remove);
  if (insert !== '') paragraphs = insertPlain(paragraphs, at, insert, replaced);
  return joinParagraphs(paragraphs);
}

/**
 * What text.mark's `marks` kind writes: the flags set and cleared on every run of a plain text
 * range, the rest of the Text unchanged. sup and sub stay exclusive; a gt run is never split, so
 * a range that cuts through one marks the whole run.
 */
export function markRange(text: Text, range: readonly [number, number], edit: FlagEdit): Text {
  const { paragraphs, inside } = splitAt(text, range);
  const [start, end] = range;
  const set = edit.set ?? {};
  const clear = edit.clear ?? [];
  for (const placed of placeParagraphs(paragraphs)) {
    const covered = placed.run.gt ? placed.start < end && placed.end > start : inside(placed);
    if (!covered) continue;
    const run = placed.run;
    for (const flag of MARK_FLAGS) if (set[flag]) run[flag] = true;
    if (set.sup) delete run.sub;
    if (set.sub) delete run.sup;
    if (set.color !== undefined) run.color = set.color;
    if (set.hl !== undefined) run.hl = set.hl;
    if (set.b) run.b = true;
    if (set.link !== undefined) run.link = set.link;
    for (const key of clear) delete run[key];
  }
  return joinParagraphs(paragraphs);
}

/**
 * The flag edits that turn the runs of `from` into the runs of `to` over a plain range, for two
 * Texts whose plain characters agree there: one edit per maximal segment whose flags differ,
 * with `set` for every flag `to` carries and `from` does not (or carries with another value) and
 * `clear` for every flag only `from` carries. Empty when the flags agree. The reducer builds the
 * exact inverse of a splice and of a mark from it.
 */
export function flagDiffs(from: Text, to: Text, range: readonly [number, number]): FlagEditRange[] {
  const [start, end] = range;
  const a = placeRuns(from);
  const b = placeRuns(to);
  const cuts = new Set<number>([start, end]);
  for (const placed of [...a, ...b]) {
    for (const edge of [placed.start, placed.end]) if (edge > start && edge < end) cuts.add(edge);
  }
  const sorted = [...cuts].sort((x, y) => x - y);
  const flagsAt = (placed: ReadonlyArray<PlacedRun>, offset: number): RunFlags | null => {
    const row = placed.find((entry) => entry.start <= offset && offset < entry.end);
    return row === undefined ? null : runFlags(row.run);
  };
  const out: FlagEditRange[] = [];
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (s === undefined || e === undefined) break;
    const fa = flagsAt(a, s);
    const fb = flagsAt(b, s);
    if (fa === null || fb === null || sameRunFlags(fa, fb)) continue;
    const set: RunFlags = {};
    const clear: RunFlagKey[] = [];
    for (const key of RUN_FLAG_KEYS) {
      const want = fb[key];
      const have = fa[key];
      if (want !== undefined) {
        if (have !== want) (set as Record<RunFlagKey, unknown>)[key] = want;
      } else if (have !== undefined) {
        clear.push(key);
      }
    }
    const edit: FlagEditRange = {
      range: [s, e],
      ...(Object.keys(set).length > 0 ? { set } : {}),
      ...(clear.length > 0 ? { clear } : {}),
    };
    const last = out[out.length - 1];
    if (
      last !== undefined &&
      last.range[1] === s &&
      JSON.stringify([last.set, last.clear]) === JSON.stringify([edit.set, edit.clear])
    ) {
      last.range[1] = e;
    } else {
      out.push(edit);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Link schemes (gslides-parity SPEC-3 8.4 layer 3, 0.27)

/** The URL schemes a run link or a block link may carry, beside the slide link forms. */
export const LINK_SCHEMES = ['https:', 'http:', 'mailto:', 'tel:'] as const;

/**
 * True for a link a Text or a block may carry: https, http, mailto, tel, or a slide link
 * (`#s/<id>`, `#next`, `#previous`, `#first`, `#last`). Everything else (javascript:, data:, vbscript:,
 * a relative path, an entity encoded scheme) is refused by the schema and the validator.
 */
export function isAllowedLink(url: string): boolean {
  if (slideLinkTarget(url) !== null) return true;
  const lower = url.toLowerCase();
  return LINK_SCHEMES.some((scheme) => lower.startsWith(scheme) && url.length > scheme.length);
}

/** The refused run links of a Text, in order, for the validator's issue per link. */
export function refusedLinksOf(text: Text): string[] {
  const out: string[] = [];
  for (const runs of parseParagraphs(text)) {
    for (const run of runs) {
      if (run.link !== undefined && !isAllowedLink(run.link)) out.push(run.link);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// List glyphs and numerals (SPEC-2 2.2.12, 2.2.13; R05 E3)

/** Google's bullet glyph presets, each three code points that cycle from level 4 (SPEC-2 0.58). */
export const BULLET_PRESETS = [
  'disc-circle-square',
  'diamondx-arrow3d-square',
  'checkbox',
  'arrow-diamond-disc',
  'star-circle-square',
  'arrow3d-circle-square',
  'lefttriangle-diamond-disc',
  'diamondx-hollowdiamond-square',
  'diamond-circle-square',
] as const;
export type BulletPreset = (typeof BULLET_PRESETS)[number];

/** Google's numbering presets, each three numeral forms that cycle from level 4. */
export const NUMBER_PRESETS = [
  'digit-alpha-roman',
  'digit-alpha-roman-parens',
  'digit-nested',
  'upperalpha-alpha-roman',
  'upperroman-upperalpha-digit',
  'zerodigit-alpha-roman',
] as const;
export type NumberPreset = (typeof NUMBER_PRESETS)[number];

export const LIST_MARKERS = ['rule', 'bullet', 'number'] as const;
export type ListMarker = (typeof LIST_MARKERS)[number];

/** List levels run 1 to 9 (SPEC-2 0.58). */
export const LIST_LEVEL_MAX = 9;

/** The glyph code points Google's presets use (R05 E3, the BulletGlyphPreset table). */
export const BULLET_GLYPHS = {
  arrow: '➔',
  arrow3d: '➢',
  checkbox: '❏',
  circle: '○',
  diamond: '◆',
  diamondx: '❖',
  hollowdiamond: '◇',
  disc: '●',
  square: '■',
  star: '★',
  lefttriangle: '◄',
} as const;
export type BulletGlyphName = keyof typeof BULLET_GLYPHS;

/** The three glyphs of a bullet preset, in level order; checkbox repeats its one glyph. */
export const BULLET_PRESET_GLYPHS: Readonly<
  Record<BulletPreset, readonly [BulletGlyphName, BulletGlyphName, BulletGlyphName]>
> = {
  'disc-circle-square': ['disc', 'circle', 'square'],
  'diamondx-arrow3d-square': ['diamondx', 'arrow3d', 'square'],
  checkbox: ['checkbox', 'checkbox', 'checkbox'],
  'arrow-diamond-disc': ['arrow', 'diamond', 'disc'],
  'star-circle-square': ['star', 'circle', 'square'],
  'arrow3d-circle-square': ['arrow3d', 'circle', 'square'],
  'lefttriangle-diamond-disc': ['lefttriangle', 'diamond', 'disc'],
  'diamondx-hollowdiamond-square': ['diamondx', 'hollowdiamond', 'square'],
  'diamond-circle-square': ['diamond', 'circle', 'square'],
};

export type NumeralForm = 'digit' | 'zerodigit' | 'alpha' | 'upperalpha' | 'roman' | 'upperroman';

/** The three numeral forms of a numbering preset with their suffix, in level order. */
export const NUMBER_PRESET_FORMS: Readonly<
  Record<
    NumberPreset,
    { forms: readonly [NumeralForm, NumeralForm, NumeralForm]; suffix: '.' | ')'; nested?: true }
  >
> = {
  'digit-alpha-roman': { forms: ['digit', 'alpha', 'roman'], suffix: '.' },
  'digit-alpha-roman-parens': { forms: ['digit', 'alpha', 'roman'], suffix: ')' },
  'digit-nested': { forms: ['digit', 'digit', 'digit'], suffix: '.', nested: true },
  'upperalpha-alpha-roman': { forms: ['upperalpha', 'alpha', 'roman'], suffix: '.' },
  'upperroman-upperalpha-digit': { forms: ['upperroman', 'upperalpha', 'digit'], suffix: '.' },
  'zerodigit-alpha-roman': { forms: ['zerodigit', 'alpha', 'roman'], suffix: '.' },
};

/** The level a preset's third form covers, wrapping: level 4 draws level 1's form (SPEC-2 0.58). */
export function presetSlot(level: number): 0 | 1 | 2 {
  const clamped = Math.min(LIST_LEVEL_MAX, Math.max(1, Math.round(level)));
  return ((clamped - 1) % 3) as 0 | 1 | 2;
}

/** The bullet glyph of a preset at a level. */
export function bulletGlyph(preset: BulletPreset, level = 1): string {
  return BULLET_GLYPHS[BULLET_PRESET_GLYPHS[preset][presetSlot(level)]];
}

function toRoman(n: number): string {
  const table: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let out = '';
  let rest = Math.max(1, Math.round(n));
  for (const [value, glyph] of table)
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  return out;
}

function toAlpha(n: number): string {
  let out = '';
  let rest = Math.max(1, Math.round(n));
  while (rest > 0) {
    rest -= 1;
    out = String.fromCharCode(97 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

/** One numeral in a form: 3 is "3", "03", "c", "C", "iii" or "III". */
export function numeral(form: NumeralForm, n: number): string {
  switch (form) {
    case 'digit':
      return String(n);
    case 'zerodigit':
      return n < 10 ? `0${n}` : String(n);
    case 'alpha':
      return toAlpha(n);
    case 'upperalpha':
      return toAlpha(n).toUpperCase();
    case 'roman':
      return toRoman(n);
    case 'upperroman':
      return toRoman(n).toUpperCase();
  }
}

/**
 * The numeral a numbered item shows (SPEC-2 2.2.12): the preset's form for the level with its
 * suffix; the nested preset writes the counters of every level ("1.2.1."). `counters` are the
 * one based positions at levels 1 to `level`.
 */
export function listNumeral(
  preset: NumberPreset,
  level: number,
  counters: readonly number[],
): string {
  const spec = NUMBER_PRESET_FORMS[preset];
  const clamped = Math.min(LIST_LEVEL_MAX, Math.max(1, Math.round(level)));
  const n = counters[clamped - 1] ?? 1;
  if (spec.nested) return `${counters.slice(0, clamped).join('.')}.`;
  return `${numeral(spec.forms[presetSlot(clamped)], n)}${spec.suffix}`;
}

/**
 * The numerals of a whole numbered list, one per item, from the items' levels: a level restarts
 * its count after a shallower item, as Google numbers nested lists.
 */
export function listNumerals(preset: NumberPreset, levels: ReadonlyArray<number>): string[] {
  const counters: number[] = [];
  return levels.map((raw) => {
    const level = Math.min(LIST_LEVEL_MAX, Math.max(1, Math.round(raw)));
    counters.length = Math.min(counters.length, level);
    while (counters.length < level) counters.push(0);
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    return listNumeral(preset, level, counters);
  });
}

/** The plain text glyph export.text writes per level: •, ◦, ▪ cycling (SPEC-2 3). */
export function textBullet(level = 1): string {
  return ['•', '◦', '▪'][presetSlot(level)] ?? '•';
}
