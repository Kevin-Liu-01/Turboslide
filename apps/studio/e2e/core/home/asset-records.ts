import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { HomeAsset } from '../../../src/components/home/assets';

/**
 * Every file under public/home/ with its whole record as assets.json holds it: the page's
 * assets.ts keeps only what the page draws with (role, appearance, variant, path and size), and
 * the rows read the bytes, the hashes, the part and the pages from here.
 */
export type HomeAssetRecord = HomeAsset & {
  bytes: number;
  sha256: string;
  pixelsSha256: string | null;
  partSha256: string | null;
  pages: number | null;
};

export const HOME_ASSETS: readonly HomeAssetRecord[] = (
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../src/components/home/assets.json'), 'utf8'),
  ) as { assets: HomeAssetRecord[] }
).assets;
