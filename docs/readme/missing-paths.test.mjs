// Every docs path a program, a config or a document outside docs/ names exists in the checkout
// (docs/hardening/HARDENING.md HR-C#16, CRIT-M20; research/cleanup.md 3.3). The tracked tree is
// read with git ls-files, so a scratch file never counts. Lines that are only a comment are
// skipped: a comment cites a decision, and the docs move of HR-C#1 leaves those citations as they
// are. A Python docstring, a JSON value and a Markdown line count, because a reader follows them.
// A named path ending in `-` or `_` is a prefix (`docs/gslides-parity/focus/ship-`), and it
// resolves when a tracked path starts with it. ABSENT lists the paths that are absent by design,
// each with its reason; the list only shrinks. The test lives here because the root vitest
// project `scripts` includes docs/readme/**/*.test.mjs (vitest.config.ts).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Paths that are absent on purpose, and why. */
const ABSENT = {
  // scripts/build-brand.ts reads the newer parity audit first and falls back to verification-3
  'docs/gslides-parity/verification-4/parity-audit.json':
    'an optional input: build-brand.ts reads it when a run writes it, and falls back to verification-3',
  // scripts/hosting-check.test.mjs checks the gate command's text for a parked list it never opens
  'docs/gslides-parity/focus/ship-abc1234.json': 'a fixture name in a test of a command string',
};

/** Extensions whose comments start with `//` or sit inside `/* ... *\/`. */
const SLASH = new Set(['.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs', '.js', '.jsonc', '.css']);
/** Extensions whose comments start with `#`. */
const HASH = new Set(['.py', '.sh', '.yaml', '.yml', '.toml']);
/** Extensions read whole: data and prose. */
const PLAIN = new Set(['.json', '.md', '.mdx']);

/** A docs path: `docs/` not preceded by a path character, so `/docs/x` and `a/docs/x` are not one. */
const PATH = /(?<![A-Za-z0-9_./-])docs\/[A-Za-z0-9_.\-/]+/g;

const FILES = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
})
  .split('\0')
  .filter(Boolean);
const TRACKED = new Set(FILES);
const FOLDERS = new Set(
  FILES.flatMap((file) => {
    const parts = file.split('/');
    return parts.slice(1).map((_, i) => parts.slice(0, i + 1).join('/'));
  }),
);

/** Each line of `text` that is not only a comment, with its 1-based number. */
function codeLines(text, ext) {
  const lines = [];
  let inBlock = false;
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (SLASH.has(ext)) {
      if (inBlock) {
        if (trimmed.includes('*/')) inBlock = false;
        return;
      }
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      if (trimmed.startsWith('/*')) {
        inBlock = !trimmed.includes('*/');
        return;
      }
    } else if (HASH.has(ext) && trimmed.startsWith('#')) {
      return;
    }
    lines.push({ line, number: index + 1 });
  });
  return lines;
}

/** Every docs path named on a code line of `text`, trailing punctuation and slashes dropped. */
function namedPaths(text, ext) {
  const paths = [];
  for (const { line, number } of codeLines(text, ext))
    for (const match of line.matchAll(PATH))
      paths.push({ path: match[0].replace(/[.,;:)]+$/, '').replace(/\/+$/, ''), number });
  return paths;
}

/** True when the checkout holds the path as a file or a folder, or as a prefix of a tracked path. */
function resolves(path) {
  if (TRACKED.has(path) || FOLDERS.has(path)) return true;
  return /[-_]$/.test(path) && FILES.some((file) => file.startsWith(path));
}

/** Every named docs path with the places that name it, read from the tracked files outside docs/. */
function scan() {
  const named = new Map();
  for (const file of FILES) {
    if (file.startsWith('docs/')) continue;
    const ext = extname(file);
    if (!SLASH.has(ext) && !HASH.has(ext) && !PLAIN.has(ext)) continue;
    const text = readFileSync(join(ROOT, file), 'utf8');
    for (const { path, number } of namedPaths(text, ext)) {
      const places = named.get(path) ?? [];
      places.push(`${file}:${number}`);
      named.set(path, places);
    }
  }
  return named;
}

describe('docs paths named outside docs/', () => {
  const named = scan();

  it('reads a real set of names', () => {
    // 107 distinct paths on origin/main f7e97039; a scan that finds a handful is broken, not clean
    expect(named.size).toBeGreaterThan(50);
  });

  it('every one exists, except the paths absent by design', () => {
    const missing = [...named]
      .filter(([path]) => !resolves(path) && !(path in ABSENT))
      .map(([path, places]) => `${path} <- ${places.join(', ')}`);
    expect(missing).toEqual([]);
  });

  it('every path absent by design is still named and still absent', () => {
    for (const path of Object.keys(ABSENT)) {
      expect(named.has(path), `${path} is named nowhere; remove it from ABSENT`).toBe(true);
      expect(resolves(path), `${path} exists now; remove it from ABSENT`).toBe(false);
    }
  });
});

describe('the comment rule', () => {
  it('skips whole comment lines and keeps code, data and docstrings', () => {
    const ts = [
      '// docs/a.md',
      '/* docs/b.md',
      ' * docs/c.md */',
      "const x = 'docs/d.md'; // docs/e.md",
    ].join('\n');
    expect(namedPaths(ts, '.ts').map((p) => p.path)).toEqual(['docs/d.md', 'docs/e.md']);
    expect(namedPaths('# docs/a.md\n"""docs/b.md"""', '.py').map((p) => p.path)).toEqual([
      'docs/b.md',
    ]);
    expect(namedPaths('{"x": "see docs/a.md 3.1."}', '.json').map((p) => p.path)).toEqual([
      'docs/a.md',
    ]);
    expect(namedPaths('https://example.com/docs/a.md', '.md')).toEqual([]);
  });
});
