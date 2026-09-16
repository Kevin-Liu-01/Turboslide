// The print layout and page flags of the round five CLI (gslides-parity SPEC-5 6.1, 6.2): the
// words `export pdf --layout --paper --orientation --order --hide-background` and `export check
// --page WxH` parse as values (args.ts VALUED_FLAGS), the closed lists refuse a stranger, the
// slide paper is the one slide layout's alone, and a malformed page is a usage error.
import { describe, expect, it } from 'vitest';

import { parseArgs } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { parsePageFlag } from './export-check.ts';
import { parsePrintLayout } from './export.ts';

function ctx(argv: string[]): CommandContext {
  return { args: parseArgs(argv) } as unknown as CommandContext;
}

describe('the print layout flags', () => {
  it('parse the five fields as values', () => {
    const parsed = parseArgs([
      'export',
      'pdf',
      'decks/fixture/gslides',
      '--layout',
      'handout-6',
      '--paper',
      'letter',
      '--orientation',
      'portrait',
      '--order',
      'down',
      '--hide-background',
    ]);
    // the values are not slide selection words
    expect(parsed.positionals).toEqual(['export', 'pdf', 'decks/fixture/gslides']);
    expect(
      parsePrintLayout(
        ctx([
          '--layout',
          'handout-6',
          '--paper',
          'letter',
          '--orientation',
          'portrait',
          '--order',
          'down',
          '--hide-background',
        ]),
      ),
    ).toEqual({
      layout: 'handout-6',
      paper: 'letter',
      orientation: 'portrait',
      order: 'down',
      hideBackground: true,
    });
    expect(parsePrintLayout(ctx([]))).toEqual({});
  });

  it('refuse a stranger and the slide paper on a handout', () => {
    expect(() => parsePrintLayout(ctx(['--layout', 'handout-5']))).toThrow(UsageError);
    expect(() => parsePrintLayout(ctx(['--paper', 'legal']))).toThrow(
      /--paper wants slide, letter, a4/,
    );
    expect(() => parsePrintLayout(ctx(['--layout', 'notes', '--paper', 'slide']))).toThrow(
      /the one slide layout's alone/,
    );
    expect(parsePrintLayout(ctx(['--layout', 'slides', '--paper', 'slide']))).toEqual({
      layout: 'slides',
      paper: 'slide',
    });
  });

  it('parse --page WxH in sheet pixels and refuse a malformed one', () => {
    expect(parsePageFlag('1200x900')).toEqual({ width: 1200, height: 900 });
    expect(parsePageFlag(undefined)).toBeUndefined();
    expect(() => parsePageFlag('12x')).toThrow(UsageError);
    expect(() => parsePageFlag('0x900')).toThrow(/two positive numbers/);
    const parsed = parseArgs([
      'export',
      'check',
      'file.pptx',
      '--page',
      '1200x900',
      '--text',
      'embed',
    ]);
    expect(parsed.positionals).toEqual(['export', 'check', 'file.pptx']);
    expect(parsed.flags['page']).toBe('1200x900');
    expect(parsed.flags['text']).toBe('embed');
  });
});
