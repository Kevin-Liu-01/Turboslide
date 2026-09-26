// The hosted svg branch (docs/FEATURES.md 4.7; docs/VECTOR.md 4.1, 4.2, 6.3): under the svg
// raster policy an uploaded svg is sanitized by the host's parser before sharp reads it, the
// sanitized file is the asset's vector, and sharp rasterizes one PNG twin at 3x of the svg fitted
// inside 800 by 450; the record is `kind: 'svg'` at the svg's intrinsic size and scale 3, with
// the dropped elements on its file source. An oversized file answers the sanitizer's cap sentence
// before anything decodes it; a hosted intake without a sanitizer still refuses with the line it
// always had; a checkout keeps the svg bytes as they came.
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { SVG_RASTER_BOX, addAsset, rasterizeSvg, svgRasterSize } from './intake.ts';
import { CHECKOUT_INTAKE_POLICY, setIntakePolicy } from './shared.ts';

const WIDE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><script>alert(1)</script><rect width="200" height="50" fill="#0af"/></svg>';
const TALL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><rect width="10" height="20" fill="#f00"/></svg>';

/** The upload's cap and its sentence, as the studio's upload.ts hands them to the sanitizer. */
const CAP = 2 * 1024 * 1024;
const CAP_SENTENCE = 'The SVG file is over 2 MB';
const BROKEN_SENTENCE = 'This SVG file could not be read';

/**
 * A stand in for the studio's sanitizer (apps/studio/src/server/logo-sanitize.ts): the cap before
 * parsing with the upload's sentence, a file that is not an svg document refused with the other,
 * `<script>` dropped and named.
 */
const sanitize = (bytes: Uint8Array): { svg: string; removed: string[] } => {
  if (bytes.byteLength > CAP) throw new RangeError(CAP_SENTENCE);
  const text = Buffer.from(bytes).toString('utf8');
  if (!/<\/svg>\s*$/.test(text)) throw new TypeError(BROKEN_SENTENCE);
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
  test('fits the picture inside 800 by 450 at its ratio and takes it at 3x', async () => {
    expect(SVG_RASTER_BOX).toEqual({ w: 800, h: 450 });
    expect(svgRasterSize([200, 50])).toEqual({ width: 2400, height: 600 });
    expect(svgRasterSize([10, 20])).toEqual({ width: 675, height: 1350 });
    expect(svgRasterSize([0, 0])).toEqual({ width: 1350, height: 1350 });
    /* a picture wider than half the sheet gets a twin under 3x of its box: 1600 by 900 draws at 1.5x */
    expect(svgRasterSize([1600, 900])).toEqual({ width: 2400, height: 1350 });
    const png = await rasterizeSvg(TALL, [10, 20]);
    expect([png.width, png.height]).toEqual([675, 1350]);
    const meta = await sharp(Buffer.from(png.bytes)).metadata();
    expect(meta.format).toBe('png');
  });
});

describe('addAsset with an svg (docs/VECTOR.md 4.1, 4.2)', () => {
  test('hosted with the sanitizer: the asset of 4.1 with the vector file, the twin at 3x inside 800 by 450, the drop recorded', async () => {
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(WIDE).toString('base64')}`;
    const result = await addAsset(
      { id: 'acme-mark', file: dataUrl, role: 'capture', alt: 'Acme diagram' },
      { deckDir: dir, hosted: true, allowPaths: false, digestNames: true, svgRaster: { sanitize } },
    );
    const { asset } = result;
    expect(asset.kind).toBe('svg');
    expect(asset.scale).toBe(3);
    /* the svg's intrinsic size in sheet px, not the twin's pixels */
    expect(asset.size).toEqual([200, 50]);
    expect(asset.vector).toBeDefined();
    const vector =
      asset.vector !== undefined && 'neutral' in asset.vector ? asset.vector.neutral : '';
    expect(vector).toMatch(/^assets\/acme-mark\.[0-9a-f]{8}\.svg$/);
    expect(asset.sourceFile).toBeUndefined();
    const source = readFileSync(join(dir, vector), 'utf8');
    expect(source.startsWith('<svg')).toBe(true);
    expect(source).not.toMatch(/<script/);
    expect(result.warnings.some((w) => w.includes('script'))).toBe(true);
    expect(asset.source).toEqual({ kind: 'file', sanitized: { removed: ['script'] } });
    const twin = 'neutral' in asset.twins ? asset.twins.neutral : '';
    expect(twin).toMatch(/^assets\/acme-mark\.[0-9a-f]{8}\.png$/);
    expect(existsSync(join(dir, twin))).toBe(true);
    const meta = await sharp(join(dir, twin)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([2400, 600, 'png']);
    expect(result.files).toEqual([vector, twin]);
    /* nothing dropped: a plain file source */
    const clean = await addAsset(
      {
        id: 'acme-2',
        file: `data:image/svg+xml;base64,${Buffer.from(TALL).toString('base64')}`,
        role: 'capture',
        alt: 'x',
      },
      { deckDir: dir, hosted: true, allowPaths: false, digestNames: true, svgRaster: { sanitize } },
    );
    expect(clean.asset.source).toEqual({ kind: 'file' });
    expect(clean.asset.size).toEqual([10, 20]);
  });

  test('a 2.1 MB svg is refused with the cap sentence and a broken one with the other, before sharp decodes either', async () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="${'M0 0h1v1z'.repeat(250_000)}"/></svg>`;
    expect(Buffer.byteLength(big)).toBeGreaterThan(2.1 * 1024 * 1024);
    await expect(
      addAsset(
        {
          id: 'big',
          file: `data:image/svg+xml;base64,${Buffer.from(big).toString('base64')}`,
          role: 'capture',
          alt: 'x',
        },
        { deckDir: dir, hosted: true, allowPaths: false, svgRaster: { sanitize } },
      ),
    ).rejects.toThrow(CAP_SENTENCE);
    const broken =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M0 0h1v1z"/>';
    await expect(
      addAsset(
        {
          id: 'broken',
          file: `data:image/svg+xml;base64,${Buffer.from(broken).toString('base64')}`,
          role: 'capture',
          alt: 'x',
        },
        { deckDir: dir, hosted: true, allowPaths: false, svgRaster: { sanitize } },
      ),
    ).rejects.toThrow(BROKEN_SENTENCE);
    expect(existsSync(join(dir, 'assets/big.svg'))).toBe(false);
    expect(existsSync(join(dir, 'assets/broken.svg'))).toBe(false);
  });

  test('hosted without a sanitizer: the refusal line is the one it always had', async () => {
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(TALL).toString('base64')}`;
    await expect(
      addAsset(
        { id: 'acme-2', file: dataUrl, role: 'logo', alt: 'x' },
        { deckDir: dir, hosted: true, allowPaths: false },
      ),
    ).rejects.toThrow(/svg is not accepted here; send png, jpeg, webp or gif/);
  });

  test('a checkout keeps the svg bytes as they came, policy or not', async () => {
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(TALL).toString('base64')}`;
    const result = await addAsset(
      { id: 'acme-3', file: dataUrl, role: 'logo', alt: 'x' },
      { deckDir: dir, hosted: false, svgRaster: { sanitize } },
    );
    expect(result.asset.scale).toBe(1);
    expect('neutral' in result.asset.twins && result.asset.twins.neutral.endsWith('.svg')).toBe(
      true,
    );
  });
});
