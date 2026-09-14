// The brand asset test of gslides-parity SPEC-4 6.4 (MILESTONES-4 B1 day 5): the set of 0.13 exists
// under apps/studio/public at the sizes brand-manifest.json records, so a deleted or a stale icon,
// twin or card fails `pnpm test` before the build check (step 29, `build-brand.ts --check`) runs.
// The manifest is the build's record (path, bytes, sha256 and kind per output); the paths every
// consumer reads come from packages/theme/brand/site.ts, so the two are compared here.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CARD_SIZE, ICON_PATHS, SITE, TWIN_PATHS } from '@turboslide/theme/brand/site';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PUBLIC_DIR = 'apps/studio/public';

type Record_ = { bytes: number; sha256: string; kind: string };
type Manifest = { generator: string; files: Record<string, Record_> };

const manifest = JSON.parse(
  readFileSync(resolve(ROOT, PUBLIC_DIR, 'brand-manifest.json'), 'utf8'),
) as Manifest;

/** Every file under a public folder, as repository paths. */
function filesUnder(folder: string): string[] {
  const dir = resolve(ROOT, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${folder}/${entry.name}`);
}

describe('the brand files (SPEC-4 0.13, 6.4)', () => {
  it('lists every path of the manifest as a file of the recorded size', () => {
    expect(manifest.generator).toBe('scripts/build-brand.ts');
    expect(Object.keys(manifest.files).length).toBeGreaterThanOrEqual(30);
    for (const [path, record] of Object.entries(manifest.files)) {
      const file = resolve(ROOT, path);
      expect(existsSync(file), `${path} exists`).toBe(true);
      expect(statSync(file).size, `${path} bytes`).toBe(record.bytes);
      expect(['built', 'outlined', 'captured', 'rendered', 'facts'], `${path} kind`).toContain(
        record.kind,
      );
    }
  });

  it('carries every icon, manifest, robots and card path site.ts exports', () => {
    for (const path of Object.values(ICON_PATHS)) {
      if (path === ICON_PATHS.brandManifest) continue;
      expect(`${PUBLIC_DIR}${path}` in manifest.files, path).toBe(true);
    }
    expect(manifest.files[`${PUBLIC_DIR}${ICON_PATHS.card}`]?.kind).toBe('rendered');
  });

  it('carries the eight twins of 0.7 and 0.12 as captured files', () => {
    for (const pair of Object.values(TWIN_PATHS))
      for (const path of [pair.dark, pair.light])
        expect(manifest.files[`${PUBLIC_DIR}${path}`]?.kind, path).toBe('captured');
  });

  it('has no stray file in the icon, brand or card folders and at the root of the set', () => {
    const listed = new Set(Object.keys(manifest.files));
    const folders = [`${PUBLIC_DIR}/icons`, `${PUBLIC_DIR}/brand`, `${PUBLIC_DIR}/og`];
    for (const folder of folders)
      for (const file of filesUnder(folder))
        expect(listed.has(file), `${file} is in the manifest`).toBe(true);
    for (const path of Object.values(ICON_PATHS))
      if (!path.includes('/', 1))
        expect(existsSync(resolve(ROOT, `${PUBLIC_DIR}${path}`)), path).toBe(true);
  });

  it('serves a manifest with start_url /home, one purpose per icon and the site description', () => {
    const webmanifest = JSON.parse(
      readFileSync(resolve(ROOT, `${PUBLIC_DIR}${ICON_PATHS.manifest}`), 'utf8'),
    ) as {
      start_url: string;
      description: string;
      icons: { src: string; purpose?: string }[];
    };
    expect(webmanifest.start_url).toBe('/home');
    expect(webmanifest.description).toBe(SITE.description);
    for (const icon of webmanifest.icons) {
      expect(icon.purpose ?? 'any').not.toContain(' ');
      expect(existsSync(resolve(ROOT, `${PUBLIC_DIR}${icon.src}`)), icon.src).toBe(true);
    }
  });

  it('writes robots.txt from the site rules', () => {
    const robots = readFileSync(resolve(ROOT, `${PUBLIC_DIR}${ICON_PATHS.robots}`), 'utf8');
    for (const path of SITE.robots.allow) expect(robots).toContain(`Allow: ${path}`);
    for (const path of SITE.robots.disallow) expect(robots).toContain(`Disallow: ${path}`);
  });

  it('keeps the card under a megabyte at 1200 by 630', () => {
    const card = resolve(ROOT, `${PUBLIC_DIR}${ICON_PATHS.card}`);
    const bytes = readFileSync(card);
    expect(bytes.length).toBeLessThan(1_000_000);
    /* the PNG header: width and height at bytes 16 and 20 */
    expect(bytes.readUInt32BE(16)).toBe(CARD_SIZE.width);
    expect(bytes.readUInt32BE(20)).toBe(CARD_SIZE.height);
  });

  it('records the twins as 1600 by 900 and the card screens as 1200 by 630 one bit PNGs', () => {
    for (const [name, pair] of Object.entries(TWIN_PATHS)) {
      const size = name === 'ogScreen' ? CARD_SIZE : { width: 1600, height: 900 };
      for (const path of [pair.dark, pair.light]) {
        const bytes = readFileSync(resolve(ROOT, `${PUBLIC_DIR}${path}`));
        expect(bytes.readUInt32BE(16), `${path} width`).toBe(size.width);
        expect(bytes.readUInt32BE(20), `${path} height`).toBe(size.height);
        expect(bytes[24], `${path} bit depth`).toBe(1);
        expect(bytes[25], `${path} colour type (indexed)`).toBe(3);
      }
    }
  });

  it('names the folder every path resolves under', () => {
    expect(relative(ROOT, join(ROOT, PUBLIC_DIR))).toBe(PUBLIC_DIR);
  });
});
