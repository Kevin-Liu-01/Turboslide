// The patterns band's build module (docs/LANDING.md 2.13, 4.1, 6.1, 6.4; the second pass). V4 owns
// this file and the `pattern.generated.ts` it writes. `scripts/build-home-assets.ts --stills` calls
// `derivePattern()` and serves the files it returns as the roles `pattern-still` and `pattern-mask`
// (assets.json), and
// `--check` compares the generated source and the files with what it returns.
//
// Slide 8's picture in the fixture (`apps/studio/home-deck/deck.json` asset `pattern`) is the frame
// the exporter stores for the Animated pattern: the CLI's `material capture paper:dithering` at the
// recipe's anchor, 3200 by 1800, one twin for each appearance (the same cells, the theme's ink on
// its paper). This module reads it and gives the page three things:
//
// - the still frame of each appearance as the page serves it: a lossless WebP of the twin's own
//   pixels when that is smaller than the PNG (it is: about 1.8 KB against 26 KB), checked to decode
//   to the same pixels, at most 48 KB, so the right slide of the band is the picture the PDF and the
//   PowerPoint file carry (row home.patterns.pair reads its pixels' hash against assets.json);
// - the frame's dots as one mask for both appearances (the role `pattern-mask`, about 1.8 KB):
//   every pixel that is not the twin's ground opaque, the rest transparent, checked to be the same
//   cells in both twins. The show, the Present display, the print and the miniature draw slide 8's
//   still through it as every other still is drawn, in the slide's own ink over its paper, so a
//   kit restyles it (verify2 N3; a browser's print draws no luminance mask or mask composite);
// - `pattern.generated.ts`: the recipe's uniforms converted at build by the materials package's own
//   `toShaderUniforms` (enum names to numbers, the sizing controls), without the two colours, which
//   the page maps by hand to the slide's `--ink` and `--paper` (2.13), so `live/pattern-mount.ts`
//   carries no catalog and no recipe code into the browser.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { requireMaterial } from '../../packages/materials/src/catalog.ts';
import { toShaderUniforms } from '../../packages/materials/src/paper.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = 'apps/studio/home-deck';
/** The picture of slide 8 in the fixture's deck.json. */
const ASSET_ID = 'pattern';
const MATERIAL = 'paper:dithering';
/** The served still frame's ceiling in each appearance (LANDING.md 4.1). */
export const PATTERN_STILL_LIMIT = 48_000;
/** The frame size the exporter stores for a 16 by 9 box (packages/materials/src/capture.ts). */
const FRAME: readonly [number, number] = [3200, 1800];

type Sharp = typeof import('sharp');
const sharp = createRequire(resolve(ROOT, 'apps/studio/package.json'))('sharp') as Sharp;

type FixtureAsset = {
  twins?: { light?: string; dark?: string };
  size?: [number, number];
  source?: {
    kind?: string;
    materialId?: string;
    uniforms?: Record<string, string | number | boolean>;
    timeMs?: number;
    recipeKey?: string;
    size?: [number, number];
  };
};

/** One served file the entry writes under public/home and lists in assets.json. */
export type PatternFile = {
  role: 'pattern-still' | 'pattern-mask';
  /** null for the mask, which both appearances share */
  appearance: 'light' | 'dark' | null;
  variant: null;
  bytes: Uint8Array;
  ext: 'webp' | 'png';
};

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function pixels(bytes: Uint8Array): Promise<{ hash: string; width: number; height: number }> {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { hash: sha256(data), width: info.width, height: info.height };
}

/** The fixture's pattern asset, refused when it is not the dithering capture of 2.13. */
function readAsset(): FixtureAsset & { source: NonNullable<FixtureAsset['source']> } {
  const deck = JSON.parse(readFileSync(resolve(ROOT, FIXTURE, 'deck.json'), 'utf8')) as {
    assets?: Record<string, FixtureAsset>;
  };
  const asset = deck.assets?.[ASSET_ID];
  if (asset === undefined) throw new Error(`${FIXTURE}/deck.json has no asset "${ASSET_ID}"`);
  const source = asset.source;
  if (source?.kind !== 'material' || source.materialId !== MATERIAL)
    throw new Error(`the asset "${ASSET_ID}" is not a ${MATERIAL} capture (LANDING.md 2.13)`);
  if (source.uniforms === undefined) throw new Error(`the asset "${ASSET_ID}" records no uniforms`);
  if (asset.twins?.light === undefined || asset.twins.dark === undefined)
    throw new Error(`the asset "${ASSET_ID}" has no light and dark twins`);
  return { ...asset, source };
}

/** The served still frame of one twin: a lossless WebP of its pixels when smaller, else the PNG. */
async function stillOf(path: string): Promise<{ bytes: Uint8Array; ext: 'webp' | 'png' }> {
  const png = new Uint8Array(readFileSync(resolve(ROOT, FIXTURE, path)));
  const source = await pixels(png);
  if (source.width !== FRAME[0] || source.height !== FRAME[1])
    throw new Error(
      `${path} is ${source.width} by ${source.height}, not ${FRAME[0]} by ${FRAME[1]}`,
    );
  const webp = new Uint8Array(await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer());
  const chosen =
    webp.length < png.length
      ? { bytes: webp, ext: 'webp' as const }
      : { bytes: png, ext: 'png' as const };
  const served = await pixels(chosen.bytes);
  if (served.hash !== source.hash)
    throw new Error(`the served still of ${path} does not decode to the capture's pixels`);
  if (chosen.bytes.length > PATTERN_STILL_LIMIT)
    throw new Error(
      `the still of ${path} is ${chosen.bytes.length} B, over ${PATTERN_STILL_LIMIT}`,
    );
  return chosen;
}

/**
 * A twin's dots as an alpha mask: RGBA with every pixel that differs from the twin's ground (its
 * first pixel, the sphere's paper) opaque black and the rest transparent.
 */
async function dotsOf(path: string): Promise<Uint8Array> {
  const { data, info } = await sharp(resolve(ROOT, FIXTURE, path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i += 1)
    if (data[i * 4] !== data[0] || data[i * 4 + 1] !== data[1] || data[i * 4 + 2] !== data[2])
      mask[i * 4 + 3] = 255;
  return mask;
}

/**
 * The frame's dots as the one mask both appearances draw (the role `pattern-mask`): a lossless
 * WebP, refused unless the two twins hold the same dots and the file decodes to them.
 */
async function maskOf(light: string, dark: string): Promise<Uint8Array> {
  const dots = await dotsOf(light);
  if (sha256(dots) !== sha256(await dotsOf(dark)))
    throw new Error(`${light} and ${dark} do not hold the same dots`);
  const [width, height] = FRAME;
  const webp = new Uint8Array(
    await sharp(dots, { raw: { width, height, channels: 4 } })
      .webp({ lossless: true, effort: 6 })
      .toBuffer(),
  );
  const decoded = await sharp(webp).ensureAlpha().raw().toBuffer();
  if (sha256(decoded) !== sha256(dots))
    throw new Error('the pattern mask does not decode to its dots');
  if (webp.length > PATTERN_STILL_LIMIT)
    throw new Error(`the pattern mask is ${webp.length} B, over ${PATTERN_STILL_LIMIT}`);
  return webp;
}

/** The two still frames, the mask and `pattern.generated.ts`'s text (unformatted). */
export async function derivePattern(): Promise<{ files: PatternFile[]; source: string }> {
  const asset = readAsset();
  const files: PatternFile[] = [];
  for (const appearance of ['light', 'dark'] as const) {
    const still = await stillOf(asset.twins![appearance]!);
    files.push({ role: 'pattern-still', appearance, variant: null, ...still });
  }
  files.push({
    role: 'pattern-mask',
    appearance: null,
    variant: null,
    bytes: await maskOf(asset.twins!.light!, asset.twins!.dark!),
    ext: 'webp',
  });
  const entry = requireMaterial(MATERIAL);
  const converted = toShaderUniforms(entry, asset.source.uniforms!);
  const uniforms: Record<string, number> = {};
  for (const [name, value] of Object.entries(converted)) {
    /* the two colours are the slide's --ink and --paper on the page (2.13) */
    if (name === 'u_colorBack' || name === 'u_colorFront') continue;
    if (typeof value !== 'number') throw new Error(`the uniform ${name} is not a number`);
    uniforms[name] = value;
  }
  const pattern = {
    materialId: MATERIAL,
    /** the capture's anchor in ms: the still frame is the shader at this frame */
    frame: asset.source.timeMs ?? 0,
    /** the editor's live preview speed (packages/materials/src/mount.ts: 1 unless a block sets it) */
    speed: 1,
    recipeKey: asset.source.recipeKey ?? null,
    uniforms,
  };
  const source = `// Generated by scripts/build-home-assets.ts --stills (docs/LANDING.md 2.13, 6.1); never edited by hand.
// node scripts/build-home-assets.ts --check compares this file with its sources.
//
// The Animated pattern of slide 8 as the patterns band's shader draws it (scripts/home/pattern.ts,
// V4's): the recipe of the fixture's \`pattern\` asset, the exporter's capture of
// \`${MATERIAL}\`, with its uniforms converted at build by the materials package's \`toShaderUniforms\`
// and its two colours left to the page, which maps them to the slide's --ink and --paper.

export type HomePattern = {
  materialId: string;
  /** the capture's anchor in ms: the still frame the exporter stores is the shader at this frame */
  frame: number;
  /** the editor's live preview speed */
  speed: number;
  /** the capture's recipe key, or null */
  recipeKey: string | null;
  /** every uniform but u_colorBack and u_colorFront, as ShaderMount takes them */
  uniforms: Readonly<Record<string, number>>;
};

export const HOME_PATTERN: HomePattern = ${JSON.stringify(pattern, null, 2)};
`;
  return { files, source };
}
