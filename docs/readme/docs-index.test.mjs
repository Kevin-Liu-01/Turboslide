// The docs index (docs/NEXT.md 5.1 item 1 and the check of 5.6 item 3): docs/README.md links every
// top-level document and folder under docs/, and every relative link it carries resolves to a
// file or folder in the checkout. The tracked tree decides what is top level, so a scratch file in
// a checkout never asks for a row. Runs in the root vitest project `scripts` (vitest.config.ts
// includes docs/readme/**/*.test.mjs).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = join(ROOT, 'docs');
const INDEX = readFileSync(join(DOCS, 'README.md'), 'utf8');

/** The first path segment under docs/ of every tracked file: the top-level documents and folders. */
const TOP = [
  ...new Set(
    execFileSync('git', ['-C', ROOT, 'ls-files', '-z', '--', 'docs'], {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    })
      .split('\0')
      .filter(Boolean)
      .map((path) => {
        const rest = path.slice('docs/'.length).split('/');
        return rest.length > 1 ? `${rest[0]}/` : rest[0];
      }),
  ),
]
  .filter((name) => name !== 'README.md')
  .sort();

/** Every Markdown link target of the index that is not a web address or an anchor. */
const LINKS = [...INDEX.matchAll(/\]\(([^)\s]+)\)/g)]
  .map((m) => m[1].split('#')[0])
  .filter((target) => target && !/^[a-z]+:/i.test(target));

/** A link target as a path under docs/, with a trailing slash kept for a folder. */
const underDocs = (target) => {
  const path = normalize(target).replace(/\\/g, '/');
  return target.endsWith('/') && !path.endsWith('/') ? `${path}/` : path;
};

describe('docs/README.md, the docs index (docs/NEXT.md 5.6 item 3)', () => {
  it('reads the tracked top level of docs/', () => {
    expect(TOP.length).toBeGreaterThan(10);
    expect(TOP).toContain('FOCUS.md');
    expect(TOP).toContain('gslides-parity/');
  });

  it('links every top-level document and folder under docs/', () => {
    const linked = new Set(LINKS.map(underDocs));
    const missing = TOP.filter(
      (name) =>
        !linked.has(name) &&
        !(name.endsWith('/') && [...linked].some((target) => target.startsWith(name))),
    );
    expect(missing).toEqual([]);
  });

  it('carries no link to a missing file or folder', () => {
    const dead = LINKS.filter((target) => !existsSync(join(DOCS, target)));
    expect(dead).toEqual([]);
  });

  it('names no document twice in the tables', () => {
    const rows = INDEX.split('\n').filter((line) => /^\| \[/.test(line));
    const firsts = rows.map((line) => line.match(/^\| \[[^\]]+\]\(([^)]+)\)/)?.[1]);
    expect(new Set(firsts).size).toBe(firsts.length);
  });
});
