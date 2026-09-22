// The hosted svg branch of the features round (docs/FEATURES.md 4.7; audit-logos 4): under the
// svg raster policy an uploaded svg is sanitized by the host's parser and rasterized by sharp into
// one PNG twin at 3x of a 264 by 168 box, its sanitized source kept beside it; with the policy off
// the hosted intake refuses it with the line it always had, and a checkout keeps the svg bytes.
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { addAsset, rasterizeSvg, svgRasterSize } from './intake.ts';
import { CHECKOUT_INTAKE_POLICY, setIntakePolicy } from './shared.ts';

const WIDE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><script>alert(1)</script><rect width="200" height="50" fill="#0af"/></svg>';
const TALL = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><rect width="10" height="20" fill="#f00"/></svg>';

/** A stand in for the studio's sanitizer: drops `<script>` and names it, as logo-sanitize.ts does. */
const sanitize = (bytes: Uint8Array): { svg: string; removed: string[] } => {
  const text = Buffer.from(bytes).toString('utf8');
  const removed = /<script[\s>]/i.test(text) ? ['script'] : [];
  return { svg: text.replace(/<script[\s\S]*?<\/script>/gi, ''), removed };
};

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'turboslide-intake-svg-'));
  setIntakePolicy(CHECKOUT_INTAKE_POLICY);
});
afterAll(async () => {
  setIntakePolicy(CHECKOUT_INTAKE_POLICY);
  await rm(dir, { recursive: true, force: true });
});

describe('svgRasterSize and rasterizeSvg', () => {
  test('fits the mark inside 264 by 168 at its ratio and takes it at 3x', async () => {
    expect(svgRasterSize([200, 50])).toEqual({ width: 792, height: 198 });
    expect(svgRasterSize([10, 20])).toEqual({ width: 252, height: 504 });
    expect(svgRasterSize([0, 0])).toEqual({ width: 504, height: 504 });
    const png = await rasterizeSvg(TALL, [10, 20]);
    expect([png.width, png.height]).toEqual([252, 504]);
    const meta = await sharp(Buffer.from(png.bytes)).metadata();
    expect(meta.format).toBe('png');
  });
});

describe('addAsset with an svg (docs/FEATURES.md 4.7)', () => {
  test('hosted with the policy: one PNG twin at 3x, the sanitized source kept, the drop named', async () => {
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(WIDE).toString('base64')}`;
    const result = await addAsset(
      { id: 'acme-mark', file: dataUrl, role: 'logo', alt: 'Acme logo' },
      { deckDir: dir, hosted: true, allowPaths: false, digestNames: true, svgRaster: { sanitize } },
    );
    const { asset } = result;
    expect(asset.scale).toBe(3);
    expect(asset.size).toEqual([792, 198]);
    expect('neutral' in asset.twins && asset.twins.neutral.endsWith('.png')).toBe(true);
    expect(asset.sourceFile).toMatch(/^assets\/acme-mark\.source\.[0-9a-f]{8}\.svg$/);
    const source = readFileSync(join(dir, asset.sourceFile!), 'utf8');
    expect(source).not.toMatch(/<script/);
    expect(result.warnings.some((w) => w.includes('script'))).toBe(true);
    const twin = 'neutral' in asset.twins ? asset.twins.neutral : '';
    expect(existsSync(join(dir, twin))).toBe(true);
    const meta = await sharp(join(dir, twin)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([792, 198, 'png']);
  });

  test('hosted without the policy: the refusal line is the one it always had', async () => {
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(TALL).toString('base64')}`;
    await expect(
      addAsset({ id: 'acme-2', file: dataUrl, role: 'logo', alt: 'x' }, { deckDir: dir, hosted: true, allowPaths: false }),
    ).rejects.toThrow(/svg is not accepted here; send png, jpeg, webp or gif/);
  });

  test('a checkout keeps the svg bytes as they came, policy or not', async () => {
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(TALL).toString('base64')}`;
    const result = await addAsset(
      { id: 'acme-3', file: dataUrl, role: 'logo', alt: 'x' },
      { deckDir: dir, hosted: false, svgRaster: { sanitize } },
    );
    expect(result.asset.scale).toBe(1);
    expect('neutral' in result.asset.twins && result.asset.twins.neutral.endsWith('.svg')).toBe(true);
  });
});
