import { describe, expect, it } from 'vitest';

import { KEEP_PAIR, codeRuns } from './code-runs';

// The runs a narrow line never breaks inside (code-runs.ts): a flag with its value, and a short
// word, so a line of code never ends after a flag's hyphens ("--" / "out renders").

const kept = (text: string): string[] =>
  codeRuns(text)
    .filter((run) => run.keep)
    .map((run) => run.text);

describe('the runs of a line of code', () => {
  it('keeps each flag with its value', () => {
    expect(kept('turboslide render --theme light,dark --out renders --json')).toEqual([
      'turboslide',
      'render',
      '--theme light,dark',
      '--out renders',
      '--json',
    ]);
    expect(kept('turboslide login --to https://www.turboslide.com')).toEqual([
      'turboslide',
      'login',
      '--to https://www.turboslide.com',
    ]);
  });

  it('keeps a flag alone before another flag, a lone hyphen or a line continuation', () => {
    expect(kept('a --json --pretty')).toEqual(['a', '--json', '--pretty']);
    expect(kept('cat --file -')).toEqual(['cat', '--file', '-']);
    expect(kept('turboslide export --mode \\')).toEqual(['turboslide', 'export', '--mode', '\\']);
  });

  it('lets a pair longer than the limit and a long word wrap', () => {
    const value = 'x'.repeat(KEEP_PAIR);
    expect(kept(`--out ${value}`)).toEqual(['--out']);
    expect(kept('see /api/actions/slide.new/and/a/long/path')).toEqual(['see']);
  });

  it('keeps every character and space in order', () => {
    const line = '  "slideId": "s1",  --deck <dir>  -n 2';
    expect(
      codeRuns(line)
        .map((run) => run.text)
        .join(''),
    ).toBe(line);
  });
});
