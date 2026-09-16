// The picture dither field and the asset variants (gslides-parity SPEC-3 10.1, 0.36, 0.37): the
// zod ranges, the defaults, the preset rows by equality, the annotate groups the generated
// controls read, the field on picture and shot, the validator's "no continuous source" refusal,
// and `Asset.variants`.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readInspector } from './annotate.ts';
import {
  assetSchema,
  assetVariantSchema,
  assetVariantTwin,
  hasContinuousSource,
  isPictureAsset,
} from './assets.ts';
import type { Asset } from './assets.ts';
import { pictureBlockSchema, shotBlockSchema } from './blocks.ts';
import {
  DITHER_DEFAULTS,
  DITHER_NO_SOURCE_MESSAGE,
  DITHER_PHOTOGRAPH_PRESET,
  DITHER_PHOTOGRAPH_VALUE,
  DITHER_TOGGLE_VALUE,
  ditherPresetOf,
  pictureDitherSchema,
  resolveDither,
} from './blocks/dither.ts';
import type { DeckDocument } from './deck.ts';
import { LIQUID_METAL_DIAMOND, MOOD_EARTH, SITE_HOME, workedDocument } from './fixtures.ts';
import { validateDocument } from './validate.ts';

describe('pictureDitherSchema', () => {
  it('takes the pattern alone and every field inside its range (SPEC-3 10.1)', () => {
    expect(pictureDitherSchema.safeParse({ pattern: 'bayer8' }).success).toBe(true);
    expect(
      pictureDitherSchema.safeParse({
        pattern: 'blue64',
        tone: 'original',
        steps: 7,
        cell: 4,
        strength: 0.5,
        black: 120,
        white: 230,
        gamma: 0.9,
        invert: true,
        polarity: 'same',
        blur: 0.6,
        minFilter: 2,
        channel: 'r',
        seed: 42,
      }).success,
    ).toBe(true);
    for (const bad of [
      {},
      { pattern: 'floyd' },
      { pattern: 'bayer8', steps: 8 },
      { pattern: 'bayer8', steps: 1 },
      { pattern: 'bayer8', cell: 5 },
      { pattern: 'bayer8', strength: 1.5 },
      { pattern: 'bayer8', black: 256 },
      { pattern: 'bayer8', white: -1 },
      { pattern: 'bayer8', gamma: 0.4 },
      { pattern: 'bayer8', gamma: 2.5 },
      { pattern: 'bayer8', blur: 9 },
      { pattern: 'bayer8', minFilter: 10 },
      { pattern: 'bayer8', channel: 'a' },
      { pattern: 'bayer8', seed: 2 ** 31 },
      { pattern: 'bayer8', preset: 'photograph' },
    ]) {
      expect(pictureDitherSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('resolves the defaults and names the preset rows by equality (0.36, 0.37)', () => {
    expect(resolveDither({ pattern: 'bayer8' })).toEqual({ pattern: 'bayer8', ...DITHER_DEFAULTS });
    expect(DITHER_DEFAULTS).toMatchObject({
      tone: 'two',
      steps: 4,
      cell: 2,
      strength: 1,
      black: 0,
      white: 255,
      gamma: 1,
      invert: false,
      polarity: 'auto',
      blur: 0,
      minFilter: 0,
      channel: 'gray',
      seed: 0,
    });
    expect(DITHER_PHOTOGRAPH_PRESET).toEqual({ black: 120, white: 230, gamma: 0.9 });
    expect(ditherPresetOf(DITHER_TOGGLE_VALUE)).toBe('neutral');
    expect(ditherPresetOf(DITHER_PHOTOGRAPH_VALUE)).toBe('photograph');
    expect(ditherPresetOf({ pattern: 'bayer8', black: 120, white: 230, gamma: 1 })).toBeNull();
    // the preset never becomes a stored field
    expect(Object.keys(DITHER_PHOTOGRAPH_VALUE).sort()).toEqual([
      'black',
      'gamma',
      'pattern',
      'white',
    ]);
  });

  it('carries annotate groups so the generated controls, the window API and the CLI agree', () => {
    const shape = pictureDitherSchema.shape;
    const groups = Object.fromEntries(
      Object.entries(shape).map(([key, field]) => [key, readInspector(field as z.ZodType)?.group]),
    );
    expect(groups).toEqual({
      pattern: 'Block',
      tone: 'Block',
      steps: 'Block',
      cell: 'Block',
      strength: 'Block',
      black: 'Block',
      white: 'Block',
      gamma: 'Block',
      invert: 'Block',
      polarity: 'Block',
      blur: 'Advanced',
      minFilter: 'Advanced',
      channel: 'Advanced',
      seed: 'Advanced',
      /* round five (gslides-parity SPEC-5 11): the halftone screen's angle */
      angle: 'Advanced',
    });
    expect(readInspector(shape.minFilter as z.ZodType)?.label).toBe('Thicken');
    const json = z.toJSONSchema(pictureDitherSchema, { target: 'draft-2020-12' }) as {
      properties: Record<string, { minimum?: number; maximum?: number; title?: string }>;
    };
    expect(json.properties.black).toMatchObject({ minimum: 0, maximum: 255, title: 'Black point' });
    expect(json.properties.gamma).toMatchObject({ minimum: 0.5, maximum: 2 });
    expect(json.properties.strength).toMatchObject({ minimum: 0, maximum: 1 });
  });

  it('is a field of picture and shot and of no other block', () => {
    expect(
      pictureBlockSchema.safeParse({
        id: 'bg',
        type: 'picture',
        asset: 'mood-rosetta',
        dither: DITHER_PHOTOGRAPH_VALUE,
      }).success,
    ).toBe(true);
    expect(
      shotBlockSchema.safeParse({
        id: 's',
        type: 'shot',
        asset: 'site-home',
        dither: { pattern: 'bayer4' },
      }).success,
    ).toBe(true);
    expect(pictureBlockSchema.shape.dither).toBeDefined();
    expect(readInspector(pictureBlockSchema.shape.dither as z.ZodType)?.label).toBe('Dither');
  });
});

/** The worked deck with a picture object over the named asset on the content slide. */
function withDitheredPicture(assetId: string): DeckDocument {
  const document = workedDocument();
  const slide = document.slides['content-rule'];
  if (slide?.kind !== 'content') throw new Error('fixture');
  slide.slots.left?.push({
    id: 'bg',
    type: 'picture',
    asset: assetId,
    dither: { pattern: 'bayer8' },
  });
  return document;
}

describe('the validator and a block dither (SPEC-3 10.1)', () => {
  it('refuses a dither over a two tone asset without a continuous source with the fixed sentence', () => {
    // the fixture's opener asset carries a two tone treatment and no sourceFile, like the GT deck's 16
    const result = validateDocument(withDitheredPicture('liquid-metal-diamond'));
    expect(result.ok).toBe(false);
    const issue = result.issues.find((row) => row.code === 'dither');
    expect(issue?.severity).toBe(3);
    expect(issue?.pointer).toBe('/slots/left/2/dither');
    expect(issue?.message).toContain(DITHER_NO_SOURCE_MESSAGE);
    expect(DITHER_NO_SOURCE_MESSAGE).toBe(
      'the asset has no continuous source (sourceFile); the committed twins are already dithered',
    );
  });

  it('accepts a dither over a continuous asset and over a two tone asset that keeps its source', () => {
    expect(validateDocument(withDitheredPicture('site-home')).ok).toBe(true);
    // the mood asset records no treatment, so its twins count as the continuous picture
    expect(validateDocument(withDitheredPicture('mood-earth')).ok).toBe(true);
    const document = withDitheredPicture('liquid-metal-diamond');
    const asset = document.deck.assets['liquid-metal-diamond'];
    if (asset === undefined || !isPictureAsset(asset)) throw new Error('fixture');
    asset.sourceFile = 'assets/liquid-metal-diamond.source.png';
    expect(validateDocument(document).ok).toBe(true);
    expect(hasContinuousSource(SITE_HOME)).toBe(true);
    expect(hasContinuousSource(MOOD_EARTH)).toBe(true);
    expect(hasContinuousSource(LIQUID_METAL_DIAMOND)).toBe(false);
    expect(hasContinuousSource({ ...LIQUID_METAL_DIAMOND, sourceFile: 'assets/x.png' })).toBe(true);
  });
});

const KEY = 'a'.repeat(64);

describe('Asset.variants (SPEC-3 10.1)', () => {
  const variant = {
    key: KEY,
    twins: {
      light: 'assets/mood-earth.dither-aaaaaaaaaaaa-light.png',
      dark: 'assets/mood-earth.dither-aaaaaaaaaaaa-dark.png',
    },
    size: [1600, 900] as [number, number],
    scale: 2 as const,
    producedAt: '2026-09-13T10:00:00.000Z',
  };

  it('parses a variant and refuses a bad key, scale or twin path', () => {
    expect(assetVariantSchema.safeParse(variant).success).toBe(true);
    expect(assetVariantSchema.safeParse({ ...variant, key: 'short' }).success).toBe(false);
    expect(assetVariantSchema.safeParse({ ...variant, scale: 3 }).success).toBe(false);
    expect(
      assetVariantSchema.safeParse({ ...variant, twins: { neutral: '../outside.png' } }).success,
    ).toBe(false);
  });

  it('is optional on the asset, keyed by the variant key, and read per theme', () => {
    const asset: Asset = { ...SITE_HOME, variants: { [KEY]: variant } };
    expect(assetSchema.safeParse(asset).success).toBe(true);
    expect(assetSchema.safeParse({ ...SITE_HOME, variants: { nope: variant } }).success).toBe(
      false,
    );
    expect(assetVariantTwin(asset, KEY, 'dark')).toBe(variant.twins.dark);
    expect(assetVariantTwin(asset, 'b'.repeat(64), 'dark')).toBeUndefined();
    expect(
      assetVariantTwin(
        { ...asset, variants: { [KEY]: { ...variant, twins: { neutral: 'assets/n.png' } } } },
        KEY,
        'light',
      ),
    ).toBe('assets/n.png');
  });
});
