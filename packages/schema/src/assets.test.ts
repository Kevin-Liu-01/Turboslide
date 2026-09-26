// The svg asset of the vector round (docs/VECTOR.md 4.1, 6.3): the record validates with `kind`
// and `vector`, and `vectorOf` answers the vector files of a new svg asset, a ship one logo's
// untinted source, and nothing for a tinted logo or a raster.
import { describe, expect, it } from 'vitest';

import { assetSchema, assetVector, vectorOf } from './assets.ts';
import type { Asset } from './assets.ts';

const upload: Asset = {
  id: 'diagram',
  role: 'capture',
  alt: 'diagram',
  kind: 'svg',
  vector: { neutral: 'assets/diagram.1a2b3c4d.svg' },
  twins: { neutral: 'assets/diagram.5e6f7a8b.png' },
  size: [200, 50],
  scale: 3,
  source: { kind: 'file', sanitized: { removed: ['script', 'foreignObject'] } },
  inline: 'pass-through',
};

const shipOneLogo: Asset = {
  id: 'figma',
  role: 'logo',
  alt: 'Figma logo',
  twins: { neutral: 'assets/figma.0f0f0f0f.png' },
  size: [324, 480],
  scale: 3,
  source: {
    kind: 'logo',
    provider: 'thesvg',
    slug: 'figma',
    variant: 'default',
    title: 'Figma',
    license: 'CC0-1.0',
    fetchedAt: '2026-09-22T00:00:00Z',
    digest: 'ab'.repeat(32),
  },
  sourceFile: 'assets/figma.source.0a0a0a0a.svg',
  inline: 'pass-through',
};

describe('the svg asset (docs/VECTOR.md 4.1)', () => {
  it('validates with kind svg, vector twins and the sanitizer record on a file source', () => {
    expect(assetSchema.safeParse(upload).success).toBe(true);
    const tinted: Asset = {
      ...upload,
      vector: { light: 'assets/d.1-light.svg', dark: 'assets/d.1-dark.svg' },
    };
    expect(assetSchema.safeParse(tinted).success).toBe(true);
    /* a raster asset carries neither field and still validates */
    const raster: Asset = { ...upload, source: { kind: 'file' } };
    delete raster.kind;
    delete raster.vector;
    expect(assetSchema.safeParse(raster).success).toBe(true);
    /* the kind takes svg alone and a vector path stays under assets/ */
    expect(assetSchema.safeParse({ ...upload, kind: 'png' }).success).toBe(false);
    expect(assetSchema.safeParse({ ...upload, vector: { neutral: '/etc/x.svg' } }).success).toBe(
      false,
    );
  });

  it('vectorOf answers the record, a ship one logo’s untinted source, and nothing for a tinted one or a raster', () => {
    expect(vectorOf(upload)).toEqual({ neutral: 'assets/diagram.1a2b3c4d.svg' });
    expect(assetVector(upload, 'dark')).toBe('assets/diagram.1a2b3c4d.svg');
    expect(vectorOf(shipOneLogo)).toEqual({ neutral: 'assets/figma.source.0a0a0a0a.svg' });
    const tintedLogo: Asset = {
      ...shipOneLogo,
      twins: { light: 'assets/f-light.png', dark: 'assets/f-dark.png' },
      source: {
        ...shipOneLogo.source,
        tint: { light: '#111111', dark: '#eeeeee' },
      } as Asset['source'],
    };
    expect(vectorOf(tintedLogo)).toBeUndefined();
    expect(assetVector(tintedLogo, 'light')).toBeUndefined();
    /* a logo re inserted by the vector round carries `vector` and answers it, tinted or not */
    const reinserted: Asset = {
      ...tintedLogo,
      kind: 'svg',
      vector: { light: 'assets/f.1-light.svg', dark: 'assets/f.1-dark.svg' },
    };
    expect(assetVector(reinserted, 'dark')).toBe('assets/f.1-dark.svg');
    const raster: Asset = { ...upload, source: { kind: 'file' } };
    delete raster.kind;
    delete raster.vector;
    expect(vectorOf(raster)).toBeUndefined();
    /* a capture role with an svg sourceFile is not a logo and answers nothing */
    expect(
      vectorOf({ ...raster, sourceFile: 'assets/x.source.svg', role: 'capture' }),
    ).toBeUndefined();
  });
});
