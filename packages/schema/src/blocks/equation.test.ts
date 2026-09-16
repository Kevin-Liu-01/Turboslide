import { describe, expect, it } from 'vitest';

import {
  EQUATION_COMMAND_BY_UNICODE,
  EQUATION_GROUP_COUNTS,
  EQUATION_GROUP_LABELS,
  EQUATION_SYMBOLS,
  EQUATION_SYMBOL_GROUPS,
  GOOGLE_ALIASES,
  equationSymbolGroups,
  equationSymbolsOf,
  firstEmptyGroup,
  isGoogleAlias,
} from './equation.ts';

// The symbol table and the alias macros (gslides-parity SPEC-5 8.1; R06 4, 9.3): Google's five
// dropdown counts, every row well formed, the thirteen aliases, the caret rule after a pick.
describe('EQUATION_SYMBOLS', () => {
  it("carries Google's five dropdown counts and Turboslide's More", () => {
    for (const group of EQUATION_SYMBOL_GROUPS)
      expect(equationSymbolsOf(group).length, group).toBe(EQUATION_GROUP_COUNTS[group]);
    expect(EQUATION_GROUP_COUNTS.greek + EQUATION_GROUP_COUNTS.operations).toBe(72);
    expect(EQUATION_SYMBOLS.filter((row) => row.group !== 'more')).toHaveLength(125);
  });

  it('names every row with a backslash command, a glyph, a LaTeX form and an OMML object', () => {
    const commands = new Set<string>();
    for (const row of EQUATION_SYMBOLS) {
      expect(row.command.startsWith('\\'), row.command).toBe(true);
      expect(row.unicode.length, row.command).toBeGreaterThan(0);
      expect(row.latex.length, row.command).toBeGreaterThan(0);
      expect(row.omml.length, row.command).toBeGreaterThan(0);
      expect(commands.has(row.command), `${row.command} repeats`).toBe(false);
      commands.add(row.command);
    }
  });

  it("writes the standard LaTeX for Google's aliases, never the alias", () => {
    for (const row of EQUATION_SYMBOLS) {
      if (!isGoogleAlias(row.command)) continue;
      expect(row.latex.includes(row.command), row.command).toBe(false);
    }
    expect(equationSymbolsOf('mathOperators').find((r) => r.command === '\\rootof')?.latex).toBe(
      '\\sqrt[]{}',
    );
  });

  it('answers the groups with Google labels in the toolbar order', () => {
    const groups = equationSymbolGroups();
    expect(groups.map((g) => g.label)).toEqual([
      'Greek letters',
      'Miscellaneous operations',
      'Relations',
      'Math operators',
      'Arrows',
      'More',
    ]);
    expect(groups.map((g) => g.id)).toEqual([...EQUATION_SYMBOL_GROUPS]);
    for (const group of groups) expect(group.label).toBe(EQUATION_GROUP_LABELS[group.id]);
    expect(groups[0]?.symbols[0]).toEqual({
      command: '\\alpha',
      latex: '\\alpha',
      unicode: 'α',
      omml: 'r',
    });
  });

  it('maps a symbol glyph back to its command for the drawing box and the OMML writer', () => {
    expect(EQUATION_COMMAND_BY_UNICODE.get('α')).toBe('\\alpha');
    expect(EQUATION_COMMAND_BY_UNICODE.get('⇒')).toBe('\\Rightarrow');
    expect(EQUATION_COMMAND_BY_UNICODE.get('½')).toBeUndefined();
  });
});

describe('GOOGLE_ALIASES', () => {
  it('holds the thirteen Google names as Temml macros', () => {
    expect(Object.keys(GOOGLE_ALIASES)).toHaveLength(13);
    expect(GOOGLE_ALIASES['\\rootof']).toBe('\\sqrt[#1]{#2}');
    expect(GOOGLE_ALIASES['\\abs']).toBe('\\left\\lvert#1\\right\\rvert');
    expect(GOOGLE_ALIASES['\\limsupab']).toBe('\\limsup_{#1\\to#2}');
    for (const name of Object.keys(GOOGLE_ALIASES)) expect(isGoogleAlias(name)).toBe(true);
    expect(isGoogleAlias('\\frac')).toBe(false);
  });
});

describe('firstEmptyGroup', () => {
  it('lands the caret inside the first empty group, else at the end', () => {
    expect(firstEmptyGroup('\\frac{}{}')).toBe(6);
    expect(firstEmptyGroup('\\frac{}{}', 7)).toBe(8);
    expect(firstEmptyGroup('\\alpha')).toBe(6);
  });
});
