// No tracked source file holds the byte 0x00 (docs/hardening/HARDENING.md HR-C#2, CLEANUP-17).
// Git calls a file binary when a NUL sits in its first 8,000 bytes, and then `git diff`,
// `git log -p` and a pull request show no lines for it: apps/studio/src/server/auth/digest.ts, the
// module that sends mail and checks unsubscribe tokens, diffed as "Binary files differ" until its
// separator was written as the escape '\u0000'. A separator or a test byte is written as an escape,
// never typed. Pictures, fonts, wasm and the other binaries are not source and are not read.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The text formats a person edits and reviews as lines. */
const SOURCE = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
  '.js',
  '.jsx',
  '.css',
  '.json',
  '.jsonc',
  '.md',
  '.mdx',
  '.py',
  '.sh',
  '.rs',
  '.toml',
  '.yaml',
  '.yml',
  '.sql',
  '.svg',
]);

describe('tracked source files', () => {
  const files = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
    .split('\0')
    .filter((file) => file && SOURCE.has(extname(file)));

  it('reads a real set of files', () => {
    expect(files.length).toBeGreaterThan(1_000);
  });

  it('hold no NUL byte', () => {
    const holding = files.filter((file) => readFileSync(join(ROOT, file)).includes(0));
    expect(holding).toEqual([]);
  });
});
