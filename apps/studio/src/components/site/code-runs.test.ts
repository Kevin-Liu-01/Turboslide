import { describe, expect, it } from 'vitest';

import { KEEP, KEEP_PAIR, codeRuns } from './code-runs';

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
    expect(kept('turboslide share --role editor')).toEqual([
      'turboslide',
      'share',
      '--role editor',
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

  // post-merge review: at 40 characters `--editors-can-share <editorsCanShare>` (37) made
  // /docs/reference/share scroll sideways by 28 px at 320 px, and /faq's
  // `--to https://www.turboslide.com` (31) ran into the gutter. The narrowest column that sets
  // code is an FAQ answer at 320 px: 252 px of 14 px monospace, 0.6 em a character.
  it('keeps no run wider than an FAQ answer at 320 px', () => {
    expect(KEEP_PAIR * 14 * 0.6).toBeLessThanOrEqual(252);
    expect(KEEP * 14 * 0.6).toBeLessThanOrEqual(252);
    expect(kept('turboslide share --editors-can-share <editorsCanShare>')).toEqual([
      'turboslide',
      'share',
      '--editors-can-share',
      '<editorsCanShare>',
    ]);
    expect(kept('turboslide login --to https://www.turboslide.com')).toEqual([
      'turboslide',
      'login',
      '--to',
    ]);
    expect(kept('--connect-start <connectStart>')).toEqual(['--connect-start', '<connectStart>']);
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
