// The evidence policy of docs/NEXT.md 5.3 and its checks 5.6 items 4 and 5, read from the tracked
// tree (git ls-files and the blob sizes, so an untracked capture never counts). Under
// docs/gslides-parity/ a tracked picture is under 200,000 bytes, a round folder's tracked pictures
// stay under 25 MB, no folder holds more than 1,000 entries, and a folder whose round closed before
// the policy holds no picture at all: Round 1's lane B6 removed them (5.2 item 1), and every one is
// in the history at cc06189b. The folder's README.md states the policy. The test lives here because
// the root vitest project `scripts` includes docs/readme/**/*.test.mjs (vitest.config.ts).
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE = 'docs/gslides-parity';

/** A picture, a PDF or a PowerPoint file: the binaries the policy bounds (5.3 rules 2 and 3). */
const BINARY = /\.(png|jpe?g|webp|gif|pdf|pptx)$/i;
/** 5.3 rule 2: each tracked picture under 200 KB, read as 200,000 bytes. */
const PICTURE_MAX = 200_000;
/** 5.3 rule 2: a round's tracked pictures under 25 MB, read as 25,000,000 bytes. */
const ROUND_MAX = 25_000_000;
/** 5.3 rule 7: no folder over 1,000 entries (files and subfolders). */
const FOLDER_MAX = 1_000;

/**
 * The folders of the rounds that closed before the policy. B6a removed their binaries; their notes,
 * ledgers and drivers stay. Each names the commit that holds its pictures in its README.md.
 */
const CLOSED = [
  'build',
  'build-2',
  'build-3',
  'build-4',
  'design',
  'design-3',
  'design-4',
  'design-5',
  'features',
  'focus',
  'objects',
  'people',
  'polish',
  'product',
  'research',
  'research-3',
  'research-4',
  'research-5',
  'return',
  'sync',
  'vector',
  'verification',
  'verification-2',
  'verification-3',
  'verification-4',
];

/**
 * The pictures of 200,000 bytes or more tracked before the policy, all in the next program's audit
 * folder. The list only shrinks: B6 prunes the pictures of next/ that no note names after Round 1
 * (NEXT.md 4.0), and a new picture of that size fails wherever it lands.
 */
const RECORDED_OVER = [
  'next/brand-a/mockups/assets/mood-tablet-light.jpg',
  'next/brand-a/mockups/assets/mood-tablet.jpg',
  'next/brand-a/mockups/assets/opener-brand-light.jpg',
  'next/brand-a/mockups/assets/opener-brand.jpg',
  'next/brand-a/shots/home-1440-dark.png',
  'next/brand-a/shots/home-1440-light.png',
  'next/brand-b/pictures/marks-dark.png',
  'next/brand-b/pictures/marks-light.png',
  'next/brand-b/pictures/variants-dark.png',
  'next/brand-b/pictures/variants-light.png',
  'next/brand-surfaces/decks-1440-dark-full.png',
  'next/brand-surfaces/decks-1440-light-full.png',
  'next/brand-surfaces/decks-390-dark-full.png',
  'next/brand-surfaces/decks-390-light-full.png',
  'next/brand-surfaces/home-1440-dark-full.png',
  'next/brand-surfaces/home-1440-dark.png',
  'next/brand-surfaces/home-1440-light-full.png',
  'next/brand-surfaces/home-1440-light.png',
  'next/brand-surfaces/home-390-dark-full.png',
  'next/brand-surfaces/home-390-light-full.png',
  'next/clutter/editor-image-selected-light-local.png',
  'next/clutter/editor-table-cell-light-local.png',
  'next/clutter/home-dark-local.png',
  'next/clutter/home-dark-prod.png',
  'next/clutter/home-light-local.png',
  'next/clutter/home-light-prod.png',
  'next/features/shots/assist-panel.png',
  'next/features/shots/import-slides-pptx.png',
  'next/features/shots/menu-file-download.png',
  'next/features/shots/menu-file.png',
  'next/features/shots/menu-insert.png',
  'next/features/shots/menu-slide.png',
  'next/features/shots/menu-tools.png',
].map((p) => `${EVIDENCE}/${p}`);

/** Every tracked file under the evidence folder with its blob size in bytes. */
function trackedFiles() {
  const staged = execFileSync('git', ['-C', ROOT, 'ls-files', '-s', '-z', '--', EVIDENCE], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  })
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split('\t');
      return { path, blob: meta.split(' ')[1] };
    });
  const sizes = execFileSync(
    'git',
    ['-C', ROOT, 'cat-file', '--batch-check=%(objectname) %(objectsize)'],
    { input: staged.map((f) => f.blob).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 26 },
  )
    .trim()
    .split('\n');
  const byBlob = new Map(sizes.map((l) => l.split(' ')).map(([id, n]) => [id, Number(n)]));
  return staged.map((f) => ({ path: f.path, bytes: byBlob.get(f.blob) ?? 0 }));
}

const FILES = trackedFiles();
const BINARIES = FILES.filter((f) => BINARY.test(f.path));
/** The round folder of a path: the first folder under docs/gslides-parity/, or '' at its top. */
const roundOf = (path) => {
  const rest = path.slice(EVIDENCE.length + 1).split('/');
  return rest.length > 1 ? rest[0] : '';
};

describe('the evidence policy (docs/NEXT.md 5.3, 5.6 items 4 and 5)', () => {
  it('reads a tracked evidence folder', () => {
    expect(FILES.length).toBeGreaterThan(0);
    expect(FILES.some((f) => f.path === `${EVIDENCE}/README.md`)).toBe(true);
  });

  it('tracks no picture, PDF or PowerPoint file in a folder whose round closed before the policy', () => {
    const closed = new Set(CLOSED);
    const found = BINARIES.filter((f) => closed.has(roundOf(f.path)) || roundOf(f.path) === '');
    expect(found.map((f) => f.path)).toEqual([]);
  });

  it('names the commit that holds the removed pictures in every closed folder that had any', () => {
    const readmes = new Set(FILES.map((f) => f.path));
    for (const folder of [
      'build-4',
      'design-4',
      'features',
      'focus',
      'objects',
      'people',
      'polish',
      'product',
      'return',
      'sync',
      'vector',
      'verification',
      'verification-2',
      'verification-3',
      'verification-4',
    ])
      expect(readmes.has(`${EVIDENCE}/${folder}/README.md`), folder).toBe(true);
  });

  it('keeps every tracked picture under 200,000 bytes, apart from the recorded ones of next/', () => {
    const recorded = new Set(RECORDED_OVER);
    const over = BINARIES.filter((f) => f.bytes >= PICTURE_MAX && !recorded.has(f.path));
    expect(over.map((f) => `${f.path} ${f.bytes}`)).toEqual([]);
  });

  it('keeps each round folder under 25 MB of tracked pictures', () => {
    const totals = new Map();
    for (const f of BINARIES)
      totals.set(roundOf(f.path), (totals.get(roundOf(f.path)) ?? 0) + f.bytes);
    const over = [...totals].filter(([, bytes]) => bytes >= ROUND_MAX);
    expect(over.map(([round, bytes]) => `${round} ${bytes}`)).toEqual([]);
  });

  it('keeps every folder at 1,000 entries or fewer', () => {
    const entries = new Map();
    for (const f of FILES) {
      const parts = f.path.split('/');
      for (let i = 2; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        if (!entries.has(dir)) entries.set(dir, new Set());
        entries.get(dir).add(parts[i]);
      }
    }
    const wide = [...entries].filter(([, names]) => names.size > FOLDER_MAX);
    expect(wide.map(([dir, names]) => `${dir} ${names.size}`)).toEqual([]);
  });
});
