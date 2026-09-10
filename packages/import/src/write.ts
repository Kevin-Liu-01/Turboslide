// Canonical JSON (SPEC 4.1): two-space indent, keys in schema order, arrays one element per line,
// trailing newline, so `git diff` reads at the line level and two writers produce identical bytes.
// Key order is the construction order of the objects, which the mapper builds in schema order.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Writes a file only when its content changed, so timestamps and diffs stay quiet. */
export function writeIfChanged(path: string, content: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  try {
    if (readFileSync(path, 'utf8') === content) return false;
  } catch {
    // The file does not exist yet.
  }
  writeFileSync(path, content);
  return true;
}

export function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}
