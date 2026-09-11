// The capture layer (MILESTONES M5 items 1 and 2): the recipes and the allowlist, identical-region
// math, the intake of a photograph through the two-tone pipeline with the source kept, the plate
// metrics read back from the deck's committed twins (mood-earth: 0 lit cells under the mood plate,
// the count OPENERS.md records), and a gt-site page capture of the Prototemplate brand page when
// its dev server listens on 3005 (the M5 acceptance shape: twins 2880 wide). The page test is
// skipped when nothing listens, since no variable names the server; every other test needs
// nothing outside the repository.
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import { assetSchema } from '@turboslide/schema/assets';

import './gt-site.ts';
import { addAsset, creditFor, sourceFromFields } from './intake.ts';
import { capturePage } from './page.ts';
import { recipeFor, recipeIds } from './recipes.ts';
import { checkRegion, deviceRegion, detailId } from './region.ts';
import { assertAllowedHost, assetIdFrom, fullTreatment, plateBoxFor, slugify } from './shared.ts';
import { ditherAsset, readTwinBits, screenMetrics } from './twins.ts';

const REPO = join(import.meta.dirname, '..', '..', '..', '..');
const GT_BRAND = join(REPO, 'decks', 'gt-brand');

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** A 2400 by 1600 photograph stand-in: a dark ground with a bright disk on the left. */
async function syntheticPhoto(): Promise<Uint8Array> {
  const width = 2400;
  const height = 1600;
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - 700;
      const dy = y - 800;
      const inside = dx * dx + dy * dy < 520 * 520;
      const v = inside ? 230 - Math.min(80, Math.hypot(dx, dy) / 8) : 12;
      const i = (y * width + x) * 3;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  }
  const png = await sharp(Buffer.from(data), { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'turboslide-capture-'));
  await mkdir(join(dir, 'assets'), { recursive: true });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('recipes and the allowlist', () => {
  test('gt-site and plain are registered and the gt-site init script seeds the theme', () => {
    expect(recipeIds()).toEqual(expect.arrayContaining(['plain', 'gt-site']));
    const recipe = recipeFor('gt-site');
    expect(recipe.init).toBeTypeOf('function');
    const source = String(recipe.init);
    expect(source).toMatch(/gt-theme/);
    expect(source).toMatch(/cookie_consent=no/);
    expect(source).toMatch(/classList\.toggle\(["']dark["']/);
    expect(recipe.css).toContain('animation-duration:0s');
    expect(recipe.scrollPass).toBe(true);
    expect(() => recipeFor('nothing')).toThrow(RangeError);
  });

  test('the allowlist admits the GT hosts and localhost and refuses the rest without --allow', () => {
    expect(assertAllowedHost('https://generaltranslation.com/docs').hostname).toBe(
      'generaltranslation.com',
    );
    expect(assertAllowedHost('https://www.prototemplate.com/brand').hostname).toBe(
      'www.prototemplate.com',
    );
    expect(assertAllowedHost('http://localhost:3005/brand').port).toBe('3005');
    expect(() => assertAllowedHost('https://example.com/')).toThrow(/allowlist/);
    expect(assertAllowedHost('https://example.com/', ['example.com']).hostname).toBe('example.com');
    expect(() => assertAllowedHost('ftp://generaltranslation.com/')).toThrow(RangeError);
  });

  test('ids and regions', () => {
    expect(assetIdFrom('https://generaltranslation.com/docs')).toBe('generaltranslation-docs');
    expect(assetIdFrom('/tmp/Rosetta Stone.JPG')).toBe('rosetta-stone');
    expect(slugify('The Great Wave!')).toBe('the-great-wave');
    expect(checkRegion([0, 0, 1440, 900], [1440, 900])).toEqual([0, 0, 1440, 900]);
    expect(() => checkRegion([100, 100, 1400, 100], [1440, 900])).toThrow(RangeError);
    expect(deviceRegion([10, 20, 300, 200], 2)).toEqual({
      left: 20,
      top: 40,
      width: 600,
      height: 400,
    });
    expect(detailId('site-home', 1)).toBe('site-home-detail-2');
    expect(plateBoxFor('lower-right')).toEqual([851, 539, 612, 232]);
    expect(plateBoxFor('lower-left', 740)).toEqual([137, 500, 740, 271]);
    expect(fullTreatment({ black: 24, gamma: 1 }, { width: 10, height: 5 })).toMatchObject({
      kind: 'two-tone',
      crop: [0, 0, 10, 5],
      black: 24,
      polarity: 'dark-ground',
    });
  });
});

describe('asset intake', () => {
  test('a photograph with the license fields goes through the two-tone pipeline with its source kept', async () => {
    const png = await syntheticPhoto();
    const result = await addAsset(
      {
        file: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
        id: 'disk',
        role: 'mood',
        alt: 'A bright disk on an ink ground',
        title: 'The disk',
        artist: 'A test',
        license: 'CC BY-SA 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Disk.png',
        twoTone: true,
        treatment: { black: 40, gamma: 1 },
        plate: 'lower-right',
      },
      { deckDir: dir },
    );
    const { asset } = result;
    expect(assetSchema.safeParse(asset).success).toBe(true);
    expect(asset.twins).toEqual({ light: 'assets/disk-light.png', dark: 'assets/disk-dark.png' });
    expect(asset.size).toEqual([1600, 900]);
    expect(asset.inline).toBe('two-color');
    expect(asset.sourceFile).toBe('assets/disk.source.png');
    expect(asset.source).toMatchObject({
      kind: 'photo',
      artist: 'A test',
      license: 'CC BY-SA 4.0',
      shareAlike: true,
      title: 'The disk',
    });
    expect(asset.credit).toBe('Photograph: A test, CC BY-SA 4.0');
    expect(asset.treatment).toMatchObject({
      kind: 'two-tone',
      black: 40,
      crop: [0, 0, 1800, 1200],
    });
    for (const file of result.files) expect(existsSync(join(dir, file)), file).toBe(true);
    const source = await sharp(join(dir, 'assets/disk.source.png')).metadata();
    expect([source.width, source.height]).toEqual([1800, 1200]);
    expect(asset.metrics?.litFraction).toBeGreaterThan(0.1);
    expect(asset.metrics?.plateClear).toMatchObject({ plate: [851, 539, 612, 232], litUnder: 0 });
    // the twins read back as exact inverses and the metrics agree with the record
    const bits = await readTwinBits(dir, asset);
    expect(bits.inverseMismatch).toBe(0);
    expect(screenMetrics(bits.dark, plateBoxFor('lower-right'), 2).plateClear?.litUnder).toBe(0);
    // a re-run with a new black point rewrites the twins from the kept source
    const rerun = await ditherAsset({ asset, params: { black: 120 } }, { deckDir: dir });
    expect(rerun.report.written).toHaveLength(2);
    expect(rerun.asset.treatment).toMatchObject({ black: 120 });
    // reading back verifies the cells against the source
    const verified = await ditherAsset(
      { asset: rerun.asset, fromRecorded: true, verifyCells: true },
      { deckDir: dir },
    );
    expect(verified.report.mismatchedCells).toBe(0);
    expect(verified.report.twinInverseMismatch).toBe(0);
  });

  test('a plain file becomes one neutral twin with the file source', async () => {
    const png = await sharp({
      create: { width: 640, height: 400, channels: 3, background: '#2f5ce0' },
    })
      .png()
      .toBuffer();
    const file = join(dir, 'logo.png');
    await sharp(png).toFile(file);
    const { asset } = await addAsset({ file, role: 'logo', alt: 'A blue plate' }, { deckDir: dir });
    expect(asset).toMatchObject({
      id: 'logo',
      twins: { neutral: 'assets/logo.png' },
      size: [640, 400],
      source: { kind: 'file' },
      inline: 'pass-through',
    });
    expect(sourceFromFields({ role: 'mood', alt: 'x', artist: 'A' }, 'f').kind).toBe('photo');
    expect(
      creditFor(
        { role: 'mood', alt: 'x', title: 'The Great Wave, woodblock print' },
        {
          kind: 'photo',
          origin: 'o',
          artist: 'Hokusai',
          license: 'public domain',
          shareAlike: false,
        },
      ),
    ).toBe('Print: Hokusai, public domain');
  });
});

describe('the deck twins', () => {
  const deck = JSON.parse(readFileSync(join(GT_BRAND, 'deck.json'), 'utf8')) as {
    assets: Record<string, Asset>;
  };

  test('mood-earth clears the mood plate: 0 lit cells under it (OPENERS.md, Brand, mood-earth)', async () => {
    const asset = deck.assets['mood-earth'];
    if (asset === undefined) throw new Error('mood-earth is not in the deck');
    const bits = await readTwinBits(GT_BRAND, asset);
    expect([bits.dark.width, bits.dark.height]).toEqual([800, 450]);
    const metrics = screenMetrics(bits.dark, plateBoxFor('lower-right'), 2);
    expect(metrics.plateClear?.litUnder).toBe(0);
    expect(bits.inverseMismatch).toBe(0);
    const outcome = await ditherAsset(
      { asset, fromRecorded: true, plate: 'lower-right' },
      { deckDir: GT_BRAND },
    );
    expect(outcome.report.metrics?.plateClear?.litUnder).toBe(0);
    expect(outcome.report.written).toEqual([]);
  });

  test('every two-tone twin pair reads back as exact inverses', async () => {
    const pairs = Object.values(deck.assets).filter(
      (asset) => asset.treatment?.kind === 'two-tone',
    );
    expect(pairs.length).toBeGreaterThanOrEqual(15);
    const off: string[] = [];
    for (const asset of pairs) {
      const bits = await readTwinBits(GT_BRAND, asset);
      if (bits.inverseMismatch > 0) off.push(`${asset.id}: ${bits.inverseMismatch}`);
    }
    expect(off).toEqual([]);
  });
});

describe('a gt-site page capture', async () => {
  const up = await listening(3005);
  test.skipIf(!up)(
    'localhost:3005/brand yields light and dark twins 2880 wide',
    { timeout: 90_000 },
    async () => {
      const result = await capturePage(
        {
          url: 'http://localhost:3005/brand',
          theme: 'both',
          recipe: 'gt-site',
          details: [[72, 72, 640, 360]],
        },
        { deckDir: dir },
      );
      expect(assetSchema.safeParse(result.asset).success).toBe(true);
      expect(result.asset.size[0]).toBe(2880);
      expect(result.asset.size[1]).toBe(1800);
      expect('light' in result.asset.twins && 'dark' in result.asset.twins).toBe(true);
      expect(result.asset.source).toMatchObject({
        kind: 'capture',
        viewport: [1440, 900],
        scale: 2,
        theme: 'both',
        recipe: 'gt-site',
      });
      expect(result.details).toHaveLength(1);
      expect(result.details[0]?.size).toEqual([1280, 720]);
      expect(result.details[0]?.source).toMatchObject({ region: [72, 72, 640, 360] });
      for (const file of result.files) expect(existsSync(join(dir, file)), file).toBe(true);
    },
  );
});
