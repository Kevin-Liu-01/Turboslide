// The four-rule inline text markup (SPEC 4.2 "Text"). A Text is a string so that `git diff` reads
// at the word level and an agent can type it; parseText turns it into runs for the renderer and
// serializeRuns turns runs back into the canonical string. Resolution recorded in SPEC 4.2: the
// agent-nativeness judge chose the string over a `string | Run[]` union.
//
//   *text*             the display run: weight 500, the deck's <b> (DECK-GRAMMAR.md:20)
//   [text](https://…)  a link; inside rows.links an external glyph follows it (head:121)
//   GT                 a standalone GT word becomes the mark at render (head:70-74); the document
//                      keeps the letters. The renderer skips panels, links and decks with gtWord
//                      off; the parser never flags GT inside a link.
//   \*  \[  \GT        escapes
//
// No line breaks inside a string except a paragraph break in the four multiline pointers
// (paragraph.text, text.text, box.text and a table cell; gslides-parity SPEC 7.4) and \n in
// panel.code. A non-breaking space (U+00A0) is the nowrap device.
//
// A link whose target is `#s/<slideId>`, `#next`, `#previous`, `#first` or `#last` is a slide
// link (gslides-parity SPEC 7.2.8): the viewer and the standalone runtime resolve it, the
// validator checks that the slide exists, and the export writes it as a slide hyperlink.
import { z } from 'zod';
import { annotate } from './annotate.ts';
import type { SlideId } from './ids.ts';
import { slugSchema } from './ids.ts';

export type Text = string;

/** parseText(text): Run[]; serializeRuns(runs): Text. A gt run always has t === 'GT'. */
export type Run = { t: string; b?: true; gt?: true; link?: string };

/** No line breaks in a Text; panel.code is a plain string and is not a Text (SPEC 4.2). */
export const textSchema = z
  .string()
  .refine((value) => !/[\n\r]/.test(value), 'a Text has no line breaks (SPEC 4.2)');

/**
 * A Text that may hold paragraph breaks: `\n` separates paragraphs, `\r` is refused. The catalog
 * names the four pointers that take it (gslides-parity SPEC 7.4); every other Text keeps the one
 * line rule of textSchema.
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

/** A URL, or `{ slide }` naming a slide id or one of next, previous, first, last. */
export const blockLinkSchema = z.union([
  z.string().min(1),
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

type Flags = { b?: true; link?: string };

function makeRun(t: string, flags: Flags, gt: boolean): Run {
  const run: Run = { t };
  if (flags.b) run.b = true;
  if (flags.link !== undefined) run.link = flags.link;
  if (gt) run.gt = true;
  return run;
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
    if (c === '[' && flags.link === undefined) {
      const close = findUnescaped(text, ']', i + 1);
      if (close > i + 1 && text.charAt(close + 1) === '(') {
        const end = text.indexOf(')', close + 2);
        const url = end > close + 2 ? text.slice(close + 2, end) : '';
        if (url !== '' && !/\s/.test(url)) {
          flush();
          parseInto(text.slice(i + 1, close), { ...flags, link: url }, out);
          i = end + 1;
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

function sameFlags(a: Run, b: Run): boolean {
  return a.b === b.b && a.link === b.link && a.gt === undefined && b.gt === undefined;
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
  if (run.gt) return 'GT';
  if (run.link !== undefined) return `[${escapeRunText(run.t, true)}](${run.link})`;
  return escapeRunText(run.t, false);
}

/** The canonical string for a run list: bold runs grouped in one `*…*`, escapes applied. */
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
