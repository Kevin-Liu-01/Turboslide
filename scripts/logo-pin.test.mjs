// Every copy of the GT logo is LOGO.d of Prototemplate src/lib/logo.ts, the refined globe of
// 2026-11-12 (`git -C ~/repos/Prototemplate show origin/main:src/lib/logo.ts`), on its drawn box,
// and no tracked file outside the docs/gslides-parity mockups (kept as history) draws a logo it
// replaced. A new logo changes LOGO_SHA256 here and each copy below in one commit.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const LOGO_SHA256 = '4cd01651f9291bb8efba81f2bd255d4e90247e3d5454d9ab38edfe2f4c6b46a4';
const LOGO_VIEW_BOX = '24.3 24.3 207.4 207.4';

/** The logos the refined globe replaced, by their path's sha256. */
const PREVIOUS = new Map([
  ['50fbc3ecf6a586e6bd1aec15d6cb0518efea8fd83ec0a0e45d69a4fce65b243c', 'the 11-06 globe'],
  ['0c2c5bfe44f4e540e050e005b7693599ea47b7ccd4eae85744d9b4eb57cbac11', 'the doubled-line monogram'],
]);

const HISTORY = 'docs/gslides-parity/';
const TEXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.css', '.json', '.html', '.svg', '.md']);

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/** The one match of a pattern's first group in a file. */
function only(file, pattern) {
  const found = [...read(file).matchAll(pattern)].map((match) => match[1]);
  expect(found, `${file}: ${pattern}`).toHaveLength(1);
  return found[0];
}

const SYMBOL = /<symbol id="gt-mark" viewBox="([^"]+)"><path fill-rule="nonzero" d="([^"]+)"/g;

/** Each copy's path and viewBox. */
function copies() {
  const svg = [...read('packages/theme/assets/sprite.svg').matchAll(SYMBOL)];
  const ts = [
    ...read('packages/theme/src/sprite.ts').matchAll(
      /'gt-mark': \{\n {4}id: 'gt-mark',\n {4}viewBox: '([^']+)',\n {4}body: '<path fill-rule="nonzero" d="([^"]+)"/g,
    ),
  ];
  expect(svg).toHaveLength(1);
  expect(ts).toHaveLength(1);
  return [
    { file: 'packages/theme/assets/sprite.svg', viewBox: svg[0][1], d: svg[0][2] },
    { file: 'packages/theme/src/sprite.ts', viewBox: ts[0][1], d: ts[0][2] },
    {
      file: 'packages/chrome/src/GtMark.tsx',
      viewBox: only('packages/chrome/src/GtMark.tsx', /GT_MARK_VIEW_BOX = '([^']+)'/g),
      d: only('packages/chrome/src/GtMark.tsx', /GT_MARK_PATH =\s*'([^']+)'/g),
    },
  ];
}

describe('the GT logo', () => {
  const pinned = copies();

  it.each(pinned)('$file carries LOGO.d on LOGO.viewBox', ({ d, viewBox }) => {
    expect(sha256(d)).toBe(LOGO_SHA256);
    expect(viewBox).toBe(LOGO_VIEW_BOX);
  });

  it('is what the e2e fixture looks for', () => {
    const head = only('apps/studio/e2e/core/chrome-round1.ts', /const GT_MARK_D = '([^']+)'/g);
    expect(head.length).toBeGreaterThanOrEqual(20);
    expect(pinned[0].d.startsWith(head)).toBe(true);
  });

  it('replaced every earlier logo outside the mockup history', { timeout: 120_000 }, () => {
    const files = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    })
      .split('\0')
      .filter((file) => file && !file.startsWith(HISTORY) && TEXT.has(extname(file)));
    expect(files.length).toBeGreaterThan(1_000);
    const drawn = [];
    for (const file of files) {
      for (const [path] of read(file).matchAll(/M[0-9][0-9MLHVCSQTAZmlhvcsqtaz., -]{199,}/g)) {
        const previous = PREVIOUS.get(sha256(path.trim()));
        if (previous) drawn.push(`${file} carries ${previous}; use LOGO.d`);
      }
    }
    expect(drawn).toEqual([]);
  });
});
