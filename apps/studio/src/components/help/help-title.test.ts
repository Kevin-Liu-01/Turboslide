// help-title.ts answers what the markdown reader's `markdownTitle` answers, for both documents and
// for a fenced `#` line before the heading (VERIFICATION-5 finding 10: the reader stays out of the
// entry chunk, so the two must agree here rather than by sharing code).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { helpTitle } from './help-title';
import { markdownTitle, parseMarkdown } from './markdown';

const REPO = resolve(import.meta.dirname, '../../../../..');

describe('helpTitle', () => {
  it('reads the first heading of both help documents as the markdown reader does', () => {
    for (const [file, fallback] of [
      ['docs/training.md', 'Training'],
      ['docs/updates.md', 'Updates'],
    ] as const) {
      const source = readFileSync(join(REPO, file), 'utf8');
      const expected = markdownTitle(parseMarkdown(source), fallback);
      expect(helpTitle(source, fallback), file).toBe(expected);
      expect(helpTitle(source, fallback), file).not.toBe('');
    }
  });

  it('skips a `#` line inside a code fence and falls back when no heading exists', () => {
    const fenced = '```sh\n# a comment\n```\n\n# Real title\n\nBody.\n';
    expect(helpTitle(fenced, 'Fallback')).toBe('Real title');
    expect(helpTitle(fenced, 'Fallback')).toBe(markdownTitle(parseMarkdown(fenced), 'Fallback'));
    expect(helpTitle('## Only a level two\n\nBody.\n', 'Fallback')).toBe('Fallback');
    expect(helpTitle('', 'Fallback')).toBe('Fallback');
  });
});
