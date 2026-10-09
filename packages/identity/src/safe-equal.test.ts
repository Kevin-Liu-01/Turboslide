import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { safeEqual, safeEqualBytes } from './safe-equal';

// HR-SA#1 (docs/hardening/HARDENING.md; CLEANUP-1): one comparison, and no other file with one.

const HEX_32 = '0123456789abcdef0123456789abcdef';

describe('safeEqual', () => {
  it('answers false for 32 é against 32 hex characters and does not throw', () => {
    const accents = 'é'.repeat(32);
    expect(accents.length).toBe(HEX_32.length);
    expect(() => safeEqual(accents, HEX_32)).not.toThrow();
    expect(safeEqual(accents, HEX_32)).toBe(false);
    expect(safeEqual(HEX_32, accents)).toBe(false);
  });

  it('answers true for equal strings and false for any difference', () => {
    expect(safeEqual(HEX_32, `${HEX_32}`)).toBe(true);
    expect(safeEqual('', '')).toBe(true);
    expect(safeEqual(HEX_32, `${HEX_32.slice(0, 31)}0`)).toBe(false);
    expect(safeEqual(HEX_32, `1${HEX_32.slice(1)}`)).toBe(false);
    expect(safeEqual(HEX_32, HEX_32.slice(0, 31))).toBe(false);
    expect(safeEqual('', 'a')).toBe(false);
    expect(safeEqual('é', 'é')).toBe(true);
    // the same characters in another normal form are other bytes
    expect(safeEqual('é', 'é')).toBe(false);
  });

  it('compares bytes', () => {
    expect(safeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(safeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(safeEqualBytes(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
    expect(safeEqualBytes(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});

// The source tree: every TypeScript and JavaScript file under apps/, packages/ and scripts/,
// without dependencies, build output and the evidence under docs/.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SKIP = new Set([
  'node_modules',
  'dist',
  '.output',
  '.vercel',
  '.wrangler',
  '.turboslide',
  '.nitro',
  '.tanstack',
  'target',
  'coverage',
  'generated',
]);
const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.isFile() && SOURCE.test(entry.name)) out.push(path);
  }
  return out;
}

describe('the one comparison', () => {
  it('is the only timing safe compare in the source tree', () => {
    const files = ['apps', 'packages', 'scripts'].flatMap((dir) => sourceFiles(join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(500);
    const own = new Set([
      'packages/identity/src/safe-equal.ts',
      'packages/identity/src/safe-equal.test.ts',
    ]);
    // the names the compare and the helpers it replaced went by
    const pattern = /\btimingSafeEqual\b|\bfunction (?:sameToken|sameSecret|sameHex)\b/;
    const offenders = files
      .map((file) => relative(ROOT, file))
      .filter((file) => !own.has(file))
      .filter((file) => pattern.test(readFileSync(join(ROOT, file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
