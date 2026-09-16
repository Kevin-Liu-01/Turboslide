// The fixture files for the reader's tests: the bytes of `packages/import/src/__fixtures__/pptx/
// <name>` and their package entries through the store's `readZip` (the inflate guard the studio
// trusts, R04 1 decision 4). Day 1 carried a private central directory walk here because the
// workspace edge to `@turboslide/store` did not exist yet (b3.md 1.2); the edge landed at merge 1
// (B3-1) and this module is now a thin wrapper, kept under its old name so the day 1 tests read on.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZip } from '@turboslide/store/zip';

import type { PackageEntry } from '../package.ts';
import { PPTX_INFLATE_MAX_BYTES } from '../package.ts';

/** The entries of a zip archive under the reader's inflate cap. */
export function unzipEntries(bytes: Uint8Array): PackageEntry[] {
  return readZip(bytes, { maxTotalBytes: PPTX_INFLATE_MAX_BYTES });
}

export const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '__fixtures__',
  'pptx',
);

export function fixtureBytes(fileName: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, fileName)));
}

export function fixtureEntries(fileName: string): PackageEntry[] {
  return unzipEntries(fixtureBytes(fileName));
}

/** The names of the committed fixtures, without the extension. */
export const FIXTURE_NAMES = [
  '01-text',
  '02-shapes',
  '03-pictures-tables',
  '04-charts-motion-media',
  '05-roundtrip',
  '05b-roundtrip-perfect',
] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];
