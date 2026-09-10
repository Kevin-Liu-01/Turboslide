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
// No line breaks inside a string except in panel.code, where \n is honored. A non-breaking space
// (U+00A0) is the nowrap device.
import { z } from 'zod';

export type Text = string;

/** parseText(text): Run[]; serializeRuns(runs): Text. A gt run always has t === 'GT'. */
export type Run = { t: string; b?: true; gt?: true; link?: string };

/** No line breaks in a Text; panel.code is a plain string and is not a Text (SPEC 4.2). */
export const textSchema = z
  .string()
  .refine((value) => !/[\n\r]/.test(value), 'a Text has no line breaks (SPEC 4.2)');

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

/** parse then serialize: the form the validator stores so escapes are canonical (SPEC 4.4). */
export function canonicalText(text: Text): Text {
  return serializeRuns(parseText(text));
}

/** The visible characters with markup removed; what the copy rules read. */
export function plainText(text: Text): string {
  return parseText(text)
    .map((run) => run.t)
    .join('');
}
