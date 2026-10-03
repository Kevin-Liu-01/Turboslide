import { describe, expect, it } from 'vitest';

import {
  BANNER_INDENT,
  CONTINUATION_INDENT,
  PANEL_WIDTHS,
  PanelOverflowError,
  escapeDoubleQuoted,
  escapeSingleQuotedJson,
  formatLines,
  formatScreen,
  splitWords,
  substituteAnswer,
  substituteName,
  wrapLine,
} from './panel-format';

/*
 * The panel's text rules (docs/LANDING.md 2.4). The commands below are the spec's three forms with
 * the fixture's name; L1's build records the real ones in run.generated.ts, and these tests hold
 * the rules for any command of that shape.
 */
const STEP_1 = 'turboslide slide new --layout rows --after ships --id next-steps';
const STEP_2 = 'turboslide block set next-steps#h /text "Next steps with Northwind"';
const STEP_3 = [
  "turboslide block set next-steps#rows /items '[",
  '{"key": "Monday", "value": "Northwind sellers get the deck"},',
  '{"key": "Wednesday", "value": "Agents draft slides over MCP"},',
  '{"key": "Friday", "value": "The first call uses this deck"}',
  "]'",
].join('\n');
const TAILOR = 'turboslide tailor --replace Northwind=Globex';
const NAMES = ['Northwind', "O'Neil & Co", '"Q" $5'];

const split = (line: string): string[] => {
  const result = splitWords(line);
  if (!result.ok) throw new Error(`unclosed quote in ${line}`);
  return result.words;
};

/** Undoes a wrap: each continuation line loses its indent and joins the last with one space. */
const unwrap = (lines: readonly string[], indent: number): string =>
  lines.reduce((acc, line, i) => (i === 0 ? line : `${acc} ${line.slice(indent)}`), '');

describe('wrapLine', () => {
  it('leaves a line that fits alone', () => {
    expect(wrapLine(STEP_1, 64)).toEqual([STEP_1]);
  });

  it('breaks only at a space, continues four columns in, and keeps every character', () => {
    for (const columns of [64, 44]) {
      for (const line of [STEP_1, STEP_2, ...STEP_3.split('\n')]) {
        const lines = wrapLine(line, columns);
        for (const piece of lines) expect(piece.length).toBeLessThanOrEqual(columns);
        lines.slice(1).forEach((piece) => {
          expect(piece.startsWith(' '.repeat(CONTINUATION_INDENT))).toBe(true);
          expect(piece[CONTINUATION_INDENT]).not.toBe(' ');
        });
        expect(unwrap(lines, CONTINUATION_INDENT)).toBe(line);
        const tokens = new Set(line.split(' ').filter(Boolean));
        const printed = lines.flatMap((piece) => piece.split(' ').filter(Boolean));
        for (const token of printed) expect(tokens.has(token)).toBe(true);
      }
    }
  });

  it('continues a banner line under its text column', () => {
    const banner = '██ ██ ██      Turboslide 1.4.0, the slides editor for people and agents';
    const lines = wrapLine(banner, 44, { indent: BANNER_INDENT });
    expect(lines.length).toBeGreaterThan(1);
    lines
      .slice(1)
      .forEach((piece) => expect(piece.startsWith(' '.repeat(BANNER_INDENT))).toBe(true));
    expect(unwrap(lines, BANNER_INDENT)).toBe(banner);
  });

  it('refuses a run of characters longer than a line, or breaks it for a typed line', () => {
    const long = `turboslide ${'x'.repeat(70)}`;
    expect(() => wrapLine(long, 64)).toThrow(PanelOverflowError);
    const broken = wrapLine(long, 64, { overlong: 'break' });
    for (const piece of broken) expect(piece.length).toBeLessThanOrEqual(64);
    expect(broken.join('').replace(/ /g, '')).toBe(long.replace(/ /g, ''));
  });
});

describe('formatScreen', () => {
  it('keeps the newlines a command carries and formats the rows of step 3 at both widths', () => {
    const wide = formatLines([STEP_3], 'wide');
    const narrow = formatLines([STEP_3], 'narrow');
    expect(wide.length).toBeGreaterThanOrEqual(STEP_3.split('\n').length);
    expect(narrow.length).toBeGreaterThan(wide.length);
    for (const line of wide) expect(line.length).toBeLessThanOrEqual(PANEL_WIDTHS.wide.columns);
    for (const line of narrow) expect(line.length).toBeLessThanOrEqual(PANEL_WIDTHS.narrow.columns);
  });

  it('refuses a screen with more lines than the panel has slots', () => {
    const many = Array.from({ length: PANEL_WIDTHS.wide.slots + 1 }, (_v, i) => `line ${i}`);
    expect(() => formatScreen(many, 'wide')).toThrow(PanelOverflowError);
    expect(formatScreen(many.slice(1), 'wide')).toHaveLength(PANEL_WIDTHS.wide.slots);
  });
});

describe('splitWords', () => {
  it('splits as a POSIX shell does, with no expansion', () => {
    expect(split(STEP_1)).toEqual(STEP_1.split(' '));
    expect(split(STEP_2)).toEqual([
      'turboslide',
      'block',
      'set',
      'next-steps#h',
      '/text',
      'Next steps with Northwind',
    ]);
    expect(split(`a 'b c' "d \\" \\$e \\x" f\\ g`)).toEqual(['a', 'b c', 'd " $e \\x', 'f g']);
    expect(split(`a ''`)).toEqual(['a', '']);
  });

  it('keeps step 3 one word whose value parses as the three rows', () => {
    const words = split(STEP_3);
    expect(words).toHaveLength(6);
    const rows = JSON.parse(words[5] as string) as Array<{ key: string; value: string }>;
    expect(rows.map((row) => row.key)).toEqual(['Monday', 'Wednesday', 'Friday']);
  });

  it('answers an unclosed quote', () => {
    expect(splitWords(`turboslide tailor --replace "Northwind=Glo`)).toEqual({
      ok: false,
      reason: 'unclosed-quote',
    });
    expect(splitWords(`a 'b`)).toEqual({ ok: false, reason: 'unclosed-quote' });
  });
});

describe('substituteName', () => {
  it('escapes a name for each place it sits in', () => {
    expect(escapeDoubleQuoted('"Q" $5')).toBe('\\"Q\\" \\$5');
    expect(escapeSingleQuotedJson("O'Neil & Co")).toBe("O'\\''Neil & Co");
    expect(escapeSingleQuotedJson('"Q" $5')).toBe('\\"Q\\" $5');
  });

  it("splits every substituted command to the recording's words with the name replaced", () => {
    for (const name of NAMES) {
      const two = split(substituteName(STEP_2, 'Northwind', name));
      expect(two).toEqual(split(STEP_2).map((w) => w.split('Northwind').join(name)));

      const three = split(substituteName(STEP_3, 'Northwind', name));
      const recorded = split(STEP_3);
      expect(three.slice(0, 5)).toEqual(recorded.slice(0, 5));
      const jsonName = JSON.stringify(name).slice(1, -1);
      expect(three[5]).toBe((recorded[5] as string).split('Northwind').join(jsonName));
      const rows = JSON.parse(three[5] as string) as Array<{ key: string; value: string }>;
      expect(rows[0]?.value).toBe(`${name} sellers get the deck`);

      const tailor = split(substituteName(TAILOR, 'Globex', name));
      expect(tailor).toEqual(['turboslide', 'tailor', '--replace', `Northwind=${name}`]);
    }
  });

  it('replaces a name in an answer as plain text', () => {
    expect(substituteAnswer('Tailored for Globex: 9 places on 4 slides', 'Globex', '"Q" $5')).toBe(
      'Tailored for "Q" $5: 9 places on 4 slides',
    );
  });
});
