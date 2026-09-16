import { describe, expect, test } from 'vitest';

import { parseArgs } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { createOutput } from '../output.ts';
import { PREFS_USAGE, parsePrefsValue, prefs } from './prefs.ts';

// The `prefs` command's parsing (gslides-parity SPEC-5 7.1, 13; R10 3.4): the value read as JSON
// then as a string, the usage refusals before any action runs, and the usage text naming the two
// actions (prefs.get, prefs.set). The actions themselves are tested through the dispatcher in
// apps/cli/src/actions/prefs.test.ts; the checkout run of `turboslide prefs set /units cm` is the
// round's acceptance line once the CLI composes the caller's record (b5.md request 1).

function contextOf(rest: string[], flags: string[] = []): CommandContext {
  const args = parseArgs([...rest, ...flags]);
  return {
    args,
    out: createOutput(true, { stdout: () => {}, stderr: () => {} }),
    cwd: '/nowhere',
    env: {},
    author: { kind: 'human', name: 'tester' },
    rest,
    readStdin: async () => '',
  };
}

describe('parsePrefsValue', () => {
  test('JSON first, then the string', () => {
    expect(parsePrefsValue('cm')).toBe('cm');
    expect(parsePrefsValue('true')).toBe(true);
    expect(parsePrefsValue('false')).toBe(false);
    expect(parsePrefsValue('12')).toBe(12);
    expect(parsePrefsValue('["a","b"]')).toEqual(['a', 'b']);
    expect(parsePrefsValue('{"from":"(p)","to":"℗","on":true}')).toEqual({
      from: '(p)',
      to: '℗',
      on: true,
    });
    expect(parsePrefsValue('q4-review')).toBe('q4-review');
    expect(parsePrefsValue('pt-PT')).toBe('pt-PT');
    expect(parsePrefsValue('"quoted"')).toBe('quoted');
  });
});

describe('the usage refusals', () => {
  test('set without a path, without a value, with both a value and --unset; an unknown word', async () => {
    await expect(prefs(contextOf(['set']))).rejects.toThrow(UsageError);
    await expect(prefs(contextOf(['set', '/units']))).rejects.toThrow(/wants a value, or --unset/);
    await expect(prefs(contextOf(['set', '/units', 'cm'], ['--unset']))).rejects.toThrow(
      /a value or --unset, not both/,
    );
    await expect(prefs(contextOf(['list']))).rejects.toThrow(UsageError);
    await expect(prefs(contextOf([]))).rejects.toThrow(PREFS_USAGE.split('\n')[0] ?? '');
  });

  test('the usage names both actions and the pointer forms', () => {
    expect(PREFS_USAGE).toContain('prefs.get');
    expect(PREFS_USAGE).toContain('prefs.set');
    expect(PREFS_USAGE).toContain('/starred/-');
    expect(PREFS_USAGE).toContain('--unset');
  });
});
