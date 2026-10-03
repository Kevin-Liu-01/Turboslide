/**
 * The agents panel's text rules (docs/LANDING.md 2.0 "Type", 2.4), the one module the build
 * (`scripts/build-home-assets.ts --run`) and the live module (`live/agents.ts`) share, so the
 * page prints every screen exactly as the build checked it. L1 owns this file and landed it on
 * day 0 (docs/LANDING.md 6.4; docs/gslides-parity/landing/build/integrator.md "Landing, day 0",
 * section 4.3); L3 imports it and asks L1 for a change.
 *
 * - The panel holds 14 slots of 64 columns at 1,024 px and over and 22 slots of 44 columns under
 *   720 px (the widest advance of `--pt-mono` is 0.602 em, so 64 columns take 539 of the 548 px
 *   inside the panel and 44 take 318 of 334).
 * - A line breaks only at a space, which the break consumes, and continues four columns in (a
 *   banner line continues 14 columns in, under its text column), so no run of characters without
 *   a space is ever split. A newline the text carries (the rows of step 3, one to a line inside
 *   their quotes) is kept as it is.
 * - A typed line is split into words by POSIX shell rules with no expansion, so the page answers
 *   what a shell would pass to the CLI. A name the page substitutes is escaped for its place:
 *   inside double quotes `"`, `\`, `$` and the backtick take a backslash; inside single quotes the
 *   value is JSON (the only single quoted values this page prints), so the name is escaped as a
 *   JSON string and every `'` becomes `'\''`; outside quotes a name with a shell character is
 *   single quoted.
 */

export const PANEL_WIDTHS = {
  wide: { columns: 64, slots: 14 },
  narrow: { columns: 44, slots: 22 },
} as const;

export type PanelWidth = keyof typeof PANEL_WIDTHS;

/** The continuation indent of a wrapped command or answer line. */
export const CONTINUATION_INDENT = 4;

/** The continuation indent of a wrapped banner line: under the banner's text column. */
export const BANNER_INDENT = 14;

/** The longest customer name the page takes (the Tailor field's `maxlength`, docs/LANDING.md 2.4). */
export const NAME_MAX = 24;

/** A screen or a token that does not fit the panel; the build exits 1 on it. */
export class PanelOverflowError extends RangeError {}

export type WrapOptions = {
  /** the continuation indent, CONTINUATION_INDENT by default */
  indent?: number;
  /**
   * What to do with a run of characters longer than a line: 'throw' (the build: a recorded
   * command never holds one) or 'break' at the column (a line the visitor typed, echoed).
   */
  overlong?: 'throw' | 'break';
};

/**
 * One logical line (no newline in it) as panel lines of at most `columns` characters, broken at
 * spaces only. Joining the result with one space after removing each continuation indent gives
 * the line back.
 */
export function wrapLine(line: string, columns: number, options: WrapOptions = {}): string[] {
  const indent = options.indent ?? CONTINUATION_INDENT;
  const overlong = options.overlong ?? 'throw';
  if (indent >= columns) throw new RangeError(`indent ${indent} leaves no room in ${columns}`);
  const out: string[] = [];
  let rest = line;
  /* the indentation the current piece starts with, which a break may not fall inside */
  let lead = leadingSpaces(line);
  while (rest.length > columns) {
    const at = rest.lastIndexOf(' ', columns);
    if (at > lead) {
      out.push(rest.slice(0, at));
      rest = ' '.repeat(indent) + rest.slice(at + 1);
      lead = indent;
      continue;
    }
    if (overlong === 'throw')
      throw new PanelOverflowError(
        `a run of characters longer than ${columns - lead} columns: ${JSON.stringify(rest.slice(lead, lead + 40))}`,
      );
    out.push(rest.slice(0, columns));
    rest = ' '.repeat(indent) + rest.slice(columns);
    lead = indent;
  }
  out.push(rest);
  return out;
}

/** Several lines, each split at its own newlines and wrapped, at a panel width. */
export function formatLines(
  lines: readonly string[],
  width: PanelWidth,
  options: WrapOptions = {},
): string[] {
  const { columns } = PANEL_WIDTHS[width];
  return lines.flatMap((text) =>
    text.split('\n').flatMap((line) => wrapLine(line, columns, options)),
  );
}

/** A whole screen at a width; throws when it needs more slots than the panel holds. */
export function formatScreen(
  lines: readonly string[],
  width: PanelWidth,
  options: WrapOptions = {},
): string[] {
  const out = formatLines(lines, width, options);
  const { slots } = PANEL_WIDTHS[width];
  if (out.length > slots)
    throw new PanelOverflowError(`${out.length} lines at ${width} width, ${slots} slots`);
  return out;
}

export type SplitResult = { ok: true; words: string[] } | { ok: false; reason: 'unclosed-quote' };

/**
 * A typed line as the words a POSIX shell passes on, with no expansion of `$`, globs or `~`:
 * blanks separate words outside quotes; single quotes keep every character; inside double quotes
 * a backslash escapes `"`, `\`, `$`, the backtick and a newline (removed) and is kept before any
 * other character; outside quotes a backslash escapes the next character (a newline is removed).
 */
export function splitWords(line: string): SplitResult {
  const words: string[] = [];
  let word = '';
  let inWord = false;
  let i = 0;
  while (i < line.length) {
    const c = line[i] as string;
    if (c === ' ' || c === '\t' || c === '\n') {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
      i += 1;
      continue;
    }
    inWord = true;
    if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) return { ok: false, reason: 'unclosed-quote' };
      word += line.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (c === '"') {
      i += 1;
      let closed = false;
      while (i < line.length) {
        const d = line[i] as string;
        if (d === '"') {
          closed = true;
          i += 1;
          break;
        }
        if (d === '\\' && i + 1 < line.length) {
          const e = line[i + 1] as string;
          if (e === '"' || e === '\\' || e === '$' || e === '`') word += e;
          else if (e !== '\n') word += d + e;
          i += 2;
          continue;
        }
        word += d;
        i += 1;
      }
      if (!closed) return { ok: false, reason: 'unclosed-quote' };
      continue;
    }
    if (c === '\\') {
      if (i + 1 < line.length) {
        const e = line[i + 1] as string;
        if (e !== '\n') word += e;
        i += 2;
      } else {
        word += c;
        i += 1;
      }
      continue;
    }
    word += c;
    i += 1;
  }
  if (inWord) words.push(word);
  return { ok: true, words };
}

/** A name for a place inside double quotes. */
export function escapeDoubleQuoted(name: string): string {
  return name.replace(/["\\$`]/g, '\\$&');
}

/** A name for a place inside a JSON string inside single quotes. */
export function escapeSingleQuotedJson(name: string): string {
  return JSON.stringify(name).slice(1, -1).replace(/'/g, "'\\''");
}

/** A name as one shell word outside quotes: as it is when it holds no shell character. */
export function quoteWord(name: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(name)) return name;
  return `'${name.replace(/'/g, "'\\''")}'`;
}

type QuoteState = 'none' | 'single' | 'double';

/**
 * A recorded command with every `from` replaced by `to`, escaped for the quotes each place sits
 * in, so the result splits to the recording's words with the name replaced (panel-format.test.ts
 * for Northwind, `O'Neil & Co` and `"Q" $5`).
 */
export function substituteName(command: string, from: string, to: string): string {
  if (from === '') return command;
  let out = '';
  let state: QuoteState = 'none';
  let i = 0;
  while (i < command.length) {
    if (command.startsWith(from, i)) {
      out +=
        state === 'double'
          ? escapeDoubleQuoted(to)
          : state === 'single'
            ? escapeSingleQuotedJson(to)
            : quoteWord(to);
      i += from.length;
      continue;
    }
    const c = command[i] as string;
    if (state === 'none') {
      if (c === "'") state = 'single';
      else if (c === '"') state = 'double';
      else if (c === '\\' && i + 1 < command.length) {
        out += c + (command[i + 1] as string);
        i += 2;
        continue;
      }
    } else if (state === 'single') {
      if (c === "'") state = 'none';
    } else if (c === '\\' && i + 1 < command.length) {
      out += c + (command[i + 1] as string);
      i += 2;
      continue;
    } else if (c === '"') state = 'none';
    out += c;
    i += 1;
  }
  return out;
}

/** A recorded answer with the name replaced: plain text, no quoting. */
export function substituteAnswer(answer: string, from: string, to: string): string {
  return from === '' ? answer : answer.split(from).join(to);
}

function leadingSpaces(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === ' ') n += 1;
  return n;
}

// ---------------------------------------------------------------------------------------------
// The lines of a step (l3.md R2): the build composes the panel's screens with these, so the live
// module prints a step with a substituted name exactly as `build-home-assets.ts --check` formatted
// it. Each returns logical lines; the caller formats them with `formatScreen`.

/** The closing line of the MCP and HTTP panels (copy.ts AGENTS.panel.requestOnly). */
export const REQUEST_ONLY = 'Request only. The CLI tab shows the recorded answer.';

/** JSON with a space after every colon and comma, so the panel can break it at spaces. */
export function spacedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(spacedJson).join(', ')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .map(([k, v]) => `${JSON.stringify(k)}: ${spacedJson(v)}`)
      .join(', ')}}`;
  return JSON.stringify(value);
}

/** What the three helpers read of a recorded step (run.generated.ts `RunStep`). */
export type StepLines = {
  command: string;
  answer: readonly string[];
  mcp: { name: string; arguments: Readonly<Record<string, unknown>> };
  http: { path: string; body: Readonly<Record<string, unknown>> };
};

/** The CLI tab's lines of a step: the prompt and the command with the name, then the answer. */
export function cliStepLines(step: StepLines, from: string, to: string): string[] {
  return [
    `$ ${substituteName(step.command, from, to)}`,
    ...step.answer.map((l) => substituteAnswer(l, from, to)),
  ];
}

/** The MCP tab's line of a step: the `tools/call` with the tool's name and its arguments. */
export function mcpStepLines(step: StepLines, from: string, to: string): string[] {
  return [
    substituteAnswer(`tools/call ${step.mcp.name} ${spacedJson(step.mcp.arguments)}`, from, to),
  ];
}

/** The HTTP tab's line of a step: the POST to the action's path with its body. */
export function httpStepLines(step: StepLines, from: string, to: string): string[] {
  return [substituteAnswer(`POST ${step.http.path} ${spacedJson(step.http.body)}`, from, to)];
}
