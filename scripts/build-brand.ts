// The brand build (docs/NEXT.md 4.1.3 items 1 to 4; gslides-parity SPEC-4 0.7, 0.12, 0.13, 1.4,
// 1.5, 1.7, 6.4): every identity asset from one geometry module (packages/theme/src/brand.ts) and
// one facts object (packages/theme/brand/site.ts), written under apps/studio/public so every icon,
// manifest, twin and card request is a CDN hit and never a function invocation (research-4 report
// 02 section 1 measured the HTML 404s). Run from the repository root with Node 24 (type stripping,
// no build step). No new dependency and no font tool: sharp is in the root devDependencies, the
// mark is five rectangles in brand.ts, the twins' PNGs go through the effects package's 1-bit
// encoder, the card and the README lockups render through @turboslide/headless (the product's own
// Chromium) and the capture through @turboslide/materials/capture.
//
//   node scripts/build-brand.ts             the icon set, the SVG sources, the wordmark,
//                                           og-template.html, the card, mark-geometry.json and
//                                           brand-manifest.json (the twins stay as committed)
//   node scripts/build-brand.ts --capture   the twins (0.7, 0.12): the liquid metal recipe over the
//                                           anchor scan, the frames cut through the pipeline with
//                                           the theme palette, hero.recipe.json
//   node scripts/build-brand.ts --readme    docs/readme/brand/lockup-{dark,light}.png at 2x
//   node scripts/build-brand.ts --facts     packages/theme/brand/facts.json (0.25) from the tree
//   node scripts/build-brand.ts --check     step 29: the mark's committed paths against a rebuild
//                                           from its rectangles and rows and their sha256, the
//                                           manifest by bytes and sha256, a rebuild compared
//                                           (pixels for rasters and the ICO's decoded entries,
//                                           bytes for text), the file facts, the twins' palette and
//                                           ink sums, the card's pixels when the local browser is
//                                           chromium-1217, facts.json against the tree
//
// The set (SPEC-4 0.13; R02 section 3): favicon.ico (16, 32 and 48 px BMP entries on the paper
// tile: the 16 px rows, then the vector at a 16 and a 24 px cap), icon.svg (the 16 px tile with the
// prefers-color-scheme block, crispEdges), apple-touch-icon.png (180, the paper mark on the ink
// square, no corners), icons/icon-192.png and icon-512.png (the ink tile, `any`),
// icons/icon-mask-192.png and icon-mask-512.png (`maskable`, the mark inside the 40 percent safe
// circle), icons/icon-mono-512.png (`monochrome`, the mark as alpha), icons/icon-dark-192.png and
// icon-dark-512.png (the paper plate, the inverse of the manifest icons), manifest.webmanifest
// (start_url /home, the paper colours), robots.txt, og/turboslide.png (the card),
// brand/mood-earth-{dark,light}.jpg (the mood picture of site.ts MOOD_PICTURES, from the GT deck),
// brand/{hero,figure,notfound}-{dark,light}.png and brand/og-screen-{dark,light}.png (the twins),
// brand-manifest.json; and under packages/theme/brand the SVG sources (mark.svg, the master
// drawing; mark-small.svg, the 16 px rows; mark-24.svg, the 24 px placement; icon-tile.svg;
// wordmark.svg, the lockup with the word as live text), og-template.html, hero.recipe.json,
// mark-geometry.json and facts.json.
//
// Rasters: the 16 px tile is the rows, three colours with no anti aliased pixel. Every other icon
// is the vector at its cap with its horizontal edges on whole rows (brand.ts `markQuadsAt`),
// drawn by this script's own coverage rasterizer (the union of the quads, sixteen sub rows per
// pixel row, exact spans across), so every pixel is a blend of the plate and the ink and the
// bytes are deterministic. The ICO writer is the design copy's (three 32 bit BMP entries with AND
// masks; Pillow round trips it with zero differing pixels). The twins are committed assets with
// their recipe rather than a CI build output: byte identity holds only on a Mac with ANGLE Metal
// (J1 2.5), so `--check` compares them by bytes against the committed files and regenerates them
// only under `--capture`.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

import type { Page } from 'playwright-core';
import { format as prettierFormat, resolveConfig } from 'prettier';
import sharp from 'sharp';

import { ditherGray } from '../packages/effects/src/bayer.ts';
import type { BitImage, GrayImage, RgbaImage } from '../packages/effects/src/image.ts';
import { invertBits, litFraction } from '../packages/effects/src/image.ts';
import { decodeImage } from '../packages/effects/src/io.ts';
import { PLATE_BOXES } from '../packages/effects/src/metrics.ts';
import type { PlateClear } from '../packages/effects/src/metrics.ts';
import { encodePng1 } from '../packages/effects/src/png1.ts';
import { fitCover, scaleNearest } from '../packages/effects/src/resample.ts';
import { autocontrast, toGray, tone } from '../packages/effects/src/tone.ts';
import { twoTone } from '../packages/effects/src/two-tone.ts';
import type { TwoToneParams } from '../packages/effects/src/two-tone.ts';
import { launchBrowser } from '../packages/headless/src/launch.ts';
import type { LaunchedBrowser } from '../packages/headless/src/launch.ts';
import { FRAME_SIZE, captureMaterial } from '../packages/materials/src/capture.ts';
import type { CapturedFrame } from '../packages/materials/src/capture.ts';
import { MATERIAL_IDS } from '../packages/materials/src/catalog.ts';
import { ACTION_IDS } from '../packages/schema/src/actions.ts';
import { LAYOUTS } from '../packages/schema/src/layouts.ts';
import { SHAPE_PRESETS } from '../packages/schema/src/shapes.ts';
import {
  CARD_MOOD,
  ICON_PATHS,
  MOOD_PICTURES,
  SITE,
  TWIN_PATHS,
  TWIN_SIZE,
} from '../packages/theme/brand/site.ts';
import {
  MARK_ASPECT,
  MARK_PATH,
  MARK_PATH_SHA256,
  MARK_VIEWBOX,
  ROWS16,
  ROWS16_PATH,
  ROWS16_PATH_SHA256,
  TILE_COLORS,
  TILE_SIZES,
  markQuads,
  markQuadsAt,
  markQuadsInBox,
  markSvg,
  quadPath,
  rowsPath,
  tileMarkPath,
} from '../packages/theme/src/brand.ts';
import type { Quad, TileGeometry } from '../packages/theme/src/brand.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = 'apps/studio/public';
const BRAND_DIR = 'packages/theme/brand';
const README_BRAND_DIR = 'docs/readme/brand';
const MANIFEST_PATH = `${PUBLIC_DIR}/brand-manifest.json`;
const GEOMETRY_PATH = `${BRAND_DIR}/mark-geometry.json`;
const RECIPE_PATH = `${BRAND_DIR}/hero.recipe.json`;
const FACTS_PATH = `${BRAND_DIR}/facts.json`;
const OG_TEMPLATE_PATH = `${BRAND_DIR}/og-template.html`;
const CARD_PATH = `${PUBLIC_DIR}${ICON_PATHS.card}`;
/** The origin the card and the README lockups are served from, in memory (the capture job's pattern). */
const BRAND_ORIGIN = 'http://turboslide.brand';
/** The card's byte ceiling (SPEC-4 1.5 step 7). */
const CARD_MAX_BYTES = 1_000_000;

type Rgb = readonly [number, number, number];

/** An opaque or transparent RGBA raster, row major. */
type Raster = { width: number; height: number; data: Uint8Array };

const hex = (color: string): Rgb => {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const LIGHT = {
  plate: hex(TILE_COLORS.light.plate),
  ink: hex(TILE_COLORS.light.ink),
  frame: hex(TILE_COLORS.light.frame),
};
const DARK = {
  plate: hex(TILE_COLORS.dark.plate),
  ink: hex(TILE_COLORS.dark.ink),
  frame: hex(TILE_COLORS.dark.frame),
};

/**
 * The twins' palettes (SPEC-4 0.12): index 0 is the unlit cell and index 1 the lit cell. On the
 * dark twin lit means paper ink on the ink ground; the light twin is invertBits of the dark one,
 * so its lit cells are paper and its unlit cells ink. Both twins therefore carry #070707 at
 * index 0, and the ink fraction of a twin is its unlit share; the two sum to 1.0 by construction,
 * which `--check` reads back from the files.
 */
const TWIN_PALETTES = {
  dark: { unlit: TILE_COLORS.dark.plate, lit: TILE_COLORS.dark.ink },
  light: { unlit: TILE_COLORS.light.ink, lit: TILE_COLORS.light.plate },
} as const;

// ---------------------------------------------------------------------------------------------
// Rasters

function blank(width: number, height: number, ground: Rgb | null): Raster {
  const data = new Uint8Array(width * height * 4);
  if (ground !== null)
    for (let i = 0; i < width * height; i += 1) {
      data[i * 4] = ground[0];
      data[i * 4 + 1] = ground[1];
      data[i * 4 + 2] = ground[2];
      data[i * 4 + 3] = 255;
    }
  return { width, height, data };
}

function put(raster: Raster, x: number, y: number, color: Rgb, alpha = 255): void {
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return;
  const i = (y * raster.width + x) * 4;
  raster.data[i] = color[0];
  raster.data[i + 1] = color[1];
  raster.data[i + 2] = color[2];
  raster.data[i + 3] = alpha;
}

/** Sub rows per pixel row in the coverage rasterizer; the hinted edges fall between them exactly. */
const SUB_ROWS = 16;

/**
 * The coverage (0 to 1) of the union of `quads` on a `width` by `height` grid: each pixel row is
 * sampled on SUB_ROWS sub rows, every quad that crosses a sub row gives one span, the spans are
 * merged, and each pixel takes the exact length of the spans over it.
 */
function coverageOf(quads: readonly Quad[], width: number, height: number): Float64Array {
  const cover = new Float64Array(width * height);
  for (let py = 0; py < height; py += 1)
    for (let j = 0; j < SUB_ROWS; j += 1) {
      const y = py + (j + 0.5) / SUB_ROWS;
      const spans: [number, number][] = [];
      for (const [tl, tr, br, bl] of quads) {
        if (y < tl[1] || y >= bl[1]) continue;
        const t = (y - tl[1]) / (bl[1] - tl[1]);
        spans.push([tl[0] + (bl[0] - tl[0]) * t, tr[0] + (br[0] - tr[0]) * t]);
      }
      spans.sort((a, b) => a[0] - b[0]);
      const merged: [number, number][] = [];
      for (const span of spans) {
        const last = merged[merged.length - 1];
        if (last !== undefined && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
        else merged.push([span[0], span[1]]);
      }
      for (const [a, b] of merged) {
        const from = Math.max(0, a);
        const to = Math.min(width, b);
        for (let px = Math.floor(from); px < Math.ceil(to); px += 1) {
          const overlap = Math.min(to, px + 1) - Math.max(from, px);
          if (overlap > 0)
            cover[py * width + px] = (cover[py * width + px] ?? 0) + overlap / SUB_ROWS;
        }
      }
    }
  for (let i = 0; i < cover.length; i += 1) cover[i] = Math.min(1, cover[i] ?? 0);
  return cover;
}

/** The colour `level` of 255 of the way from `ground` to `ink`, rounded per channel. */
function blend(ground: Rgb, ink: Rgb, level: number): Rgb {
  const mix = (g: number, k: number): number => Math.round(g + ((k - g) * level) / 255);
  return [mix(ground[0], ink[0]), mix(ground[1], ink[1]), mix(ground[2], ink[2])];
}

/** The mark's quads drawn in `ink` over an opaque `ground` on a `size` px square. */
function markRaster(size: number, quads: readonly Quad[], ground: Rgb, ink: Rgb): Raster {
  const raster = blank(size, size, ground);
  const cover = coverageOf(quads, size, size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const level = Math.round((cover[y * size + x] ?? 0) * 255);
      if (level > 0) put(raster, x, y, blend(ground, ink, level));
    }
  return raster;
}

/** The ink of a raster's mark in pixels: the coverage summed, at one decimal. */
function inkOf(quads: readonly Quad[], size: number): number {
  let sum = 0;
  for (const value of coverageOf(quads, size, size)) sum += value;
  return Number(sum.toFixed(1));
}

/** The quads of a tile's vector mark in tile px. */
function tileQuads(tile: TileGeometry): Quad[] {
  return markQuadsAt(tile.size, tile.cap, tile.top, { hinted: true });
}

/**
 * The plate tile at 16, 32 or 48 px: the plate, the 1 px frame, the mark. The 16 px tile carries
 * the rows (three colours, no blend); the 32 and 48 px tiles the hinted vector over the plate.
 */
function tileRaster(tile: TileGeometry, colors: typeof LIGHT): Raster {
  const { size } = tile;
  const raster =
    tile.form === 'rows'
      ? blank(size, size, colors.plate)
      : markRaster(size, tileQuads(tile), colors.plate, colors.ink);
  if (tile.form === 'rows')
    ROWS16.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) if (row[x] === '#') put(raster, x, y, colors.ink);
    });
  for (let i = 0; i < size; i += 1) {
    put(raster, i, 0, colors.frame);
    put(raster, i, size - 1, colors.frame);
    put(raster, 0, i, colors.frame);
    put(raster, size - 1, i, colors.frame);
  }
  return raster;
}

/** The monochrome icon: black with the mark's coverage as alpha over a transparent ground. */
function monoRaster(size: number, quads: readonly Quad[]): Raster {
  const raster = blank(size, size, null);
  const cover = coverageOf(quads, size, size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const level = Math.round((cover[y * size + x] ?? 0) * 255);
      if (level > 0) put(raster, x, y, [0, 0, 0], level);
    }
  return raster;
}

/** An opaque raster as an 8 bit indexed PNG (deterministic bytes); at most 256 colours. */
function indexedPng(raster: Raster): Uint8Array {
  const colours = new Map<string, number>();
  const palette: Rgb[] = [];
  const indices = new Uint8Array(raster.width * raster.height);
  for (let p = 0; p < raster.width * raster.height; p += 1) {
    const rgb: Rgb = [
      raster.data[p * 4] ?? 0,
      raster.data[p * 4 + 1] ?? 0,
      raster.data[p * 4 + 2] ?? 0,
    ];
    const key = rgb.join(',');
    let index = colours.get(key);
    if (index === undefined) {
      index = palette.length;
      colours.set(key, index);
      palette.push(rgb);
    }
    indices[p] = index;
  }
  if (palette.length > 256) throw new Error(`${palette.length} colours do not fit a palette PNG`);
  return encodePngIndexed(raster.width, raster.height, indices, palette);
}

async function pngOfRaster(raster: Raster): Promise<Uint8Array> {
  const buffer = await sharp(
    Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength),
    {
      raw: { width: raster.width, height: raster.height, channels: 4 },
    },
  )
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** A two colour PNG through the effects package's 1-bit encoder: index 0 the ground, 1 the ink. */
function png1(bits: BitImage, ground: Rgb, ink: Rgb): Uint8Array {
  return encodePng1(bits, {
    palette: [
      [ground[0], ground[1], ground[2]],
      [ink[0], ink[1], ink[2]],
    ],
    level: 9,
  });
}

/** A twin through the 1-bit encoder with its appearance's palette (SPEC-4 0.12). */
function twinPng(bits: BitImage, appearance: 'dark' | 'light'): Uint8Array {
  const palette = TWIN_PALETTES[appearance];
  return png1(bits, hex(palette.unlit), hex(palette.lit));
}

// ---------------------------------------------------------------------------------------------
// The ICO (R02 6.3 step 5): a 6 byte header, 16 byte directory entries, then per entry a 40 byte
// BITMAPINFOHEADER (width, twice the height, 1 plane, 32 bits), the rows bottom up as BGRA, and
// an all zero AND mask padded to 4 byte rows.

function icoEntry(raster: Raster): Uint8Array {
  const size = raster.width;
  const rowBytes = size * 4;
  const maskRow = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(rowBytes * size + maskRow * size, 20);
  const pixels = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y += 1) {
    const src = (size - 1 - y) * rowBytes;
    for (let x = 0; x < size; x += 1) {
      const s = src + x * 4;
      const d = y * rowBytes + x * 4;
      pixels[d] = raster.data[s + 2] ?? 0;
      pixels[d + 1] = raster.data[s + 1] ?? 0;
      pixels[d + 2] = raster.data[s] ?? 0;
      pixels[d + 3] = raster.data[s + 3] ?? 0;
    }
  }
  const mask = Buffer.alloc(maskRow * size, 0);
  return new Uint8Array(Buffer.concat([header, pixels, mask]));
}

function writeIco(rasters: Raster[]): Uint8Array {
  const bodies = rasters.map(icoEntry);
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(rasters.length, 4);
  const dir = Buffer.alloc(16 * rasters.length);
  let offset = 6 + dir.length;
  rasters.forEach((raster, i) => {
    const o = i * 16;
    const body = bodies[i] ?? new Uint8Array(0);
    dir[o] = raster.width;
    dir[o + 1] = raster.height;
    dir[o + 2] = 0;
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(body.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += body.length;
  });
  return new Uint8Array(Buffer.concat([head, dir, ...bodies.map((b) => Buffer.from(b))]));
}

/** The ICO's entries decoded back to RGBA rasters (the script's own reader, for `--check`). */
export function readIco(bytes: Uint8Array): Raster[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('not an ICO');
  const count = buf.readUInt16LE(4);
  const out: Raster[] = [];
  for (let i = 0; i < count; i += 1) {
    const o = 6 + i * 16;
    const width = buf[o] === 0 ? 256 : (buf[o] ?? 0);
    const height = buf[o + 1] === 0 ? 256 : (buf[o + 1] ?? 0);
    const start = buf.readUInt32LE(o + 12);
    const bitCount = buf.readUInt16LE(start + 14);
    if (bitCount !== 32) throw new Error(`entry ${i} is ${bitCount} bit, expected 32`);
    const rowBytes = width * 4;
    const data = new Uint8Array(width * height * 4);
    const pixels = start + 40;
    for (let y = 0; y < height; y += 1) {
      const src = pixels + (height - 1 - y) * rowBytes;
      for (let x = 0; x < width; x += 1) {
        const s = src + x * 4;
        const d = (y * width + x) * 4;
        data[d] = buf[s + 2] ?? 0;
        data[d + 1] = buf[s + 1] ?? 0;
        data[d + 2] = buf[s] ?? 0;
        data[d + 3] = buf[s + 3] ?? 0;
      }
    }
    out.push({ width, height, data });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// An 8 bit indexed PNG writer for the card (SPEC-4 1.5 step 7: "palette PNG when the render has
// at most 256 colours"): the pixels as palette indices, PLTE with the exact colours, one filter
// byte per row, zlib at level 9. Deterministic bytes, no quantizer in the path.

function pngChunk(type: string, body: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'latin1');
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  typeBytes.copy(out, 4);
  Buffer.from(body.buffer, body.byteOffset, body.byteLength).copy(out, 8);
  out.writeUInt32BE(
    crc32(
      Buffer.concat([typeBytes, Buffer.from(body.buffer, body.byteOffset, body.byteLength)]),
    ) >>> 0,
    8 + body.length,
  );
  return out;
}

function encodePngIndexed(
  width: number,
  height: number,
  indices: Uint8Array,
  palette: Rgb[],
): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => plte.set(c, i * 3));
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y += 1)
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const idat = deflateSync(raw, { level: 9 });
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk('IHDR', new Uint8Array(ihdr)),
      pngChunk('PLTE', plte),
      pngChunk('IDAT', new Uint8Array(idat.buffer, idat.byteOffset, idat.byteLength)),
      pngChunk('IEND', new Uint8Array(0)),
    ]),
  );
}

// ---------------------------------------------------------------------------------------------
// Text sources

const SVG_NOTE = (what: string): string =>
  `<!-- Turboslide mark, ${what}. Generated by scripts/build-brand.ts from packages/theme/src/brand.ts: five rectangles sheared by tan(12 degrees) with the 8 unit cut through the stem and the middle bar, the GT bar monogram's construction (Prototemplate scripts/build-speed-marks.mjs); the 16 px rows are the one hand drawing. -->\n`;

/** mark.svg: the master drawing in units, one path in currentColor, with 4 units of clear space. */
function masterSvg(): string {
  return (
    SVG_NOTE(
      'the master drawing in its units (a 120 unit cap), for any size from 32 px; the product places it by whole pixel cap with its horizontal edges on whole rows',
    ) +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" fill="currentColor" role="img" aria-label="Turboslide"><title>Turboslide</title><path d="${MARK_PATH}"/></svg>\n`
  );
}

/** icon.svg (SPEC-4 0.13, 1.4): the 16 px tile with the rows, the prefers-color-scheme block and crispEdges. */
function iconTileSvg(): string {
  const l = TILE_COLORS.light;
  const d = TILE_COLORS.dark;
  return (
    SVG_NOTE(
      'the tab icon: the 16 px rows in ink on an opaque paper plate with a 1 px frame in the edge composite; paper ink on an ink plate where prefers-color-scheme: dark is honoured',
    ) +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" role="img" aria-label="Turboslide"><title>Turboslide</title><style>.plate{fill:${l.plate}}.frame{fill:none;stroke:${l.frame};stroke-width:1}.ink{fill:${l.ink}}@media (prefers-color-scheme: dark){.plate{fill:${d.plate}}.frame{stroke:${d.frame}}.ink{fill:${d.ink}}}</style><rect class="plate" x="0" y="0" width="16" height="16"/><rect class="frame" x="0.5" y="0.5" width="15" height="15"/><path class="ink" d="${tileMarkPath(TILE_SIZES[16])}"/></svg>\n`
  );
}

function robotsTxt(): string {
  const lines = ['User-agent: *'];
  for (const path of SITE.robots.allow) lines.push(`Allow: ${path}`);
  for (const path of SITE.robots.disallow) lines.push(`Disallow: ${path}`);
  lines.push('', `Sitemap: ${SITE.productionOrigin}${SITE.robots.sitemap}`);
  return `${lines.join('\n')}\n`;
}

// The lockup (docs/NEXT.md 4.1.2; brand-a 32 to 43): the mark at the word's cap, the baselines
// met, half the cap between the mark's ink and the word's T. The word is live text in Inter 500
// in Inter's default glyphs (no stylistic set since docs/POLISH-2.md 2.2), tracking -0.025em at
// 28 px and above (docs/brand.md section 4). The mark's box and the baseline sit on whole pixels,
// so the word's ink and the mark's end on one row (sheet-judge.md fix 9). At 66 px Inter's cap
// (1490 of 2048 units) is 48.0 px.
const WORD = 'Turboslide';
const WORD_PX = 66;
const WORD_TRACK_EM = -0.025;
/** The word's width at 66 px as Chromium measured it with the repository's InterVariable (P1 1.4). */
const WORD_WIDTH_CHROMIUM_PX = 287.06;
const INTER_STACK = "Inter, 'Inter Fallback', system-ui, sans-serif";
/** Inter's cap height over its em: 1490 of 2048 units. */
const INTER_CAP_EM = 1490 / 2048;
/**
 * The T's left side bearing at weight 500 by Inter's optical size axis, in units of 2048, read
 * from rendered pixels (the Round 1 sheet's measure-bearing.mjs at load 19.60; its bearing.json).
 * Chrome sets the axis to the font size in px between 14 and 32.
 */
const T_BEARING_BY_OPSZ: Readonly<Record<number, number>> = {
  14: 90,
  16: 86,
  18: 82,
  20: 76,
  22: 72,
  24: 68,
  26: 61,
  28: 57,
  30: 53,
  32: 49,
};

/** The T's left bearing in px at a word size, interpolated between the measured optical sizes. */
function tBearingPx(wordPx: number): number {
  const keys = Object.keys(T_BEARING_BY_OPSZ)
    .map(Number)
    .sort((a, b) => a - b);
  const first = keys[0] ?? 14;
  const last = keys[keys.length - 1] ?? 32;
  const opsz = Math.min(last, Math.max(first, wordPx));
  const lo = [...keys].reverse().find((k) => k <= opsz) ?? first;
  const hi = keys.find((k) => k >= opsz) ?? last;
  const at = (k: number): number => T_BEARING_BY_OPSZ[k] ?? 0;
  const units = lo === hi ? at(lo) : at(lo) + ((at(hi) - at(lo)) * (opsz - lo)) / (hi - lo);
  return (units / 2048) * wordPx;
}

/** The lockup's geometry at a word size: the cap, the mark's width, the word's origin, the box. */
function lockupGeometry(wordPx: number, wordWidth: number) {
  const cap = Math.round(INTER_CAP_EM * wordPx);
  const markWidth = cap * MARK_ASPECT;
  /* the word's ink starts half the cap after the mark's; its origin is the T's bearing before that */
  const textX = markWidth + cap / 2 - tBearingPx(wordPx);
  /* the baseline 51 of 66 rows down the line, where round four's wordmark set it; the cap line a cap above */
  const baseline = Math.round((wordPx * 51) / 66);
  const capTop = baseline - cap;
  return {
    cap,
    markWidth,
    textX,
    capTop,
    baseline,
    width: Math.ceil(textX + wordWidth),
    height: wordPx,
  };
}

/** The lockup as one SVG: the hinted mark at the cap and the word as live text on the baseline. */
function lockupSvg(options: { title?: boolean } = {}): string {
  const g = lockupGeometry(WORD_PX, WORD_WIDTH_CHROMIUM_PX);
  const name =
    options.title === false
      ? 'aria-hidden="true">'
      : `role="img" aria-label="${WORD}"><title>${WORD}</title>`;
  const mark = quadPath(markQuadsInBox(g.cap, 0, g.capTop, { hinted: true }), 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.width} ${g.height}" width="${g.width}" height="${g.height}" fill="currentColor" ${name}` +
    `<path d="${mark}"/>` +
    `<text x="${g.textX.toFixed(2)}" y="${g.baseline}" font-family="${INTER_STACK}" font-size="${WORD_PX}" font-weight="500" letter-spacing="${(WORD_TRACK_EM * WORD_PX).toFixed(2)}">${WORD}</text>` +
    `</svg>`
  );
}

/** wordmark.svg: the lockup with the word as live text (the studio, the card and the README render it with InterVariable). */
function wordmarkSvg(): string {
  const g = lockupGeometry(WORD_PX, WORD_WIDTH_CHROMIUM_PX);
  return (
    `<!-- Turboslide lockup (docs/NEXT.md 4.1.2): the mark at the cap of the word set at ${WORD_PX} px (a ${g.cap} px cap, its box from row ${g.capTop} to the baseline on row ${g.baseline}), Inter 500 in its default glyphs, tracking ${WORD_TRACK_EM}em, half the cap between the mark's ink and the word's T. The word is live text (the studio ships InterVariable.woff2). Generated by scripts/build-brand.ts. -->\n` +
    `${lockupSvg()}\n`
  );
}

// The Open Graph card (SPEC-4 1.7; docs/NEXT.md 4.1.3 item 4): 1200 by 630 in the dark appearance,
// the mood picture of `CARD_MOOD` (NASA's Blue Marble, public domain; docs/brand.md section 8) at
// object-fit cover behind, and a paper plate lower right, the mood slide's place on the deck
// (Prototemplate deck/slides/06-mood-earth.html), carrying the lockup, the lead's first sentence,
// the address in Inter (`SITE.productionOrigin`, so the card prints the domain) and the picture's
// credit in titanium. The Earth fills the left half of the picture, so the plate keeps clear of it.
// Nothing that matters sits within 48 px of an edge (X crops 1.91:1 to 2:1). The page links
// tokens.css, brand.css and inter.css by relative paths so the type and the tokens are the
// product's.
const CARD = { width: 1200, height: 630 } as const;
/** The plate's right and bottom edges: 56 px in from the card's, the deck's rail distance. */
const CARD_PLATE = { right: 56, bottom: 56, width: 528 } as const;

/** The card's sentence: the first sentence of the one description (POLISH.md 3.6). */
function cardSentence(): string {
  const first = /^[^.]*\./.exec(SITE.description);
  return first === null ? SITE.description : first[0];
}

async function ogTemplateHtml(): Promise<string> {
  const picture = relative(
    resolve(ROOT, BRAND_DIR),
    resolve(ROOT, `${PUBLIC_DIR}${CARD_MOOD.dark}`),
  );
  const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<title>Turboslide Open Graph card</title>
<!--
  The site wide Open Graph image (gslides-parity SPEC-4 1.7; docs/NEXT.md 4.1.3 item 4), 1200 by
  630, rendered in Chromium at device scale factor 1 by scripts/build-brand.ts into
  apps/studio/public/og/turboslide.png. ${CARD_MOOD.title} (${CARD_MOOD.dark}, ${CARD_MOOD.license})
  at object-fit cover behind; the paper plate lower right, ${CARD_PLATE.right} px from the right
  and the bottom edges and ${CARD_PLATE.width} px wide, carrying the lockup (the mark at the word's
  48 px cap, the word in live Inter 500), the lead's first sentence, the address and the credit.
  Nothing that matters sits within 48 px of an edge (X crops 1.91:1 to 2:1). Generated; edit the
  template function in scripts/build-brand.ts.
-->
<link rel="stylesheet" href="../../fonts/src/inter.css">
<link rel="stylesheet" href="../../chrome/src/tokens.css">
<link rel="stylesheet" href="../../chrome/src/brand.css">
<style>
html, body { margin: 0; }
body { width: ${CARD.width}px; height: ${CARD.height}px; overflow: hidden; background: var(--pt-paper); color: var(--pt-ink); font-family: var(--pt-display); -webkit-font-smoothing: antialiased; }
.card { position: relative; width: ${CARD.width}px; height: ${CARD.height}px; overflow: hidden; }
.card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.plate { position: absolute; right: ${CARD_PLATE.right}px; bottom: ${CARD_PLATE.bottom}px; width: ${CARD_PLATE.width}px; box-sizing: border-box; background: var(--ts-plate); padding: 32px 36px 28px; }
.lock { display: block; }
.lock svg { display: block; }
.plate p { margin: 20px 0 0; font-family: var(--pt-text); font-size: 22px; line-height: 1.4; color: var(--pt-ink); }
.url { margin: 12px 0 0; font-family: var(--pt-text); font-size: 20px; line-height: 1.4; color: var(--pt-ink-2); }
.credit { margin: 16px 0 0; font-family: var(--pt-text); font-size: 15px; line-height: 1.45; letter-spacing: 0.01em; color: var(--pt-titanium); }
</style>
</head>
<body>
<div class="card">
  <img src="${picture}" alt="">
  <div class="plate">
    <div class="lock">${lockupSvg({ title: false })}</div>
    <p>${cardSentence()}</p>
    <div class="url">${SITE.productionOrigin.replace(/^https?:\/\//, '')}</div>
    <div class="credit">${CARD_MOOD.credit}</div>
  </div>
</div>
</body>
</html>
`;
  const file = resolve(ROOT, OG_TEMPLATE_PATH);
  const config = (await resolveConfig(file)) ?? {};
  return prettierFormat(html, { ...config, parser: 'html' });
}

// ---------------------------------------------------------------------------------------------
// The mood pictures (docs/NEXT.md 4.1.2 and question 5; site.ts MOOD_PICTURES): each twin of the
// GT deck's copy re-encoded as a greyscale JPEG at the deck's 1600 by 900, quality 75 with no
// chroma subsampling, so a copy under /brand stays under 200 KB with no resampling of its cells.

const MOOD_SIZE = { width: 1600, height: 900 } as const;
const MOOD_MAX_BYTES = 200_000;

async function moodJpeg(from: string): Promise<Uint8Array> {
  const source = resolve(ROOT, from);
  const meta = await sharp(source).metadata();
  if (meta.width !== MOOD_SIZE.width || meta.height !== MOOD_SIZE.height)
    fail(
      `${from} is ${meta.width} by ${meta.height}, expected ${MOOD_SIZE.width} by ${MOOD_SIZE.height}`,
    );
  const buffer = await sharp(source)
    .greyscale()
    .jpeg({ quality: 75, chromaSubsampling: '4:4:4' })
    .toBuffer();
  if (buffer.length > MOOD_MAX_BYTES)
    fail(`${from} re-encodes to ${buffer.length} bytes, over the ${MOOD_MAX_BYTES} byte ceiling`);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

// ---------------------------------------------------------------------------------------------
// The build of the deterministic outputs

type Kind = 'built' | 'captured' | 'rendered' | 'facts';
type Output = { path: string; bytes: Uint8Array; kind: Kind };

type GeometryRow = {
  path: string;
  /** the raster's size in px */
  tile: number;
  /** the rows (the 16 px hand drawing) or the hinted vector */
  form: 'rows' | 'vector';
  /** the mark's cap in px and its cap line's row */
  cap: number;
  top: number;
  /** the ink in px: the coverage summed (the rows count their pixels) */
  ink: number;
  /** the colour count read back from the file by `--check` (the value written is the build's own read) */
  colours: number;
  plate: 'paper' | 'ink' | 'none';
};

type Build = { outputs: Output[]; geometry: GeometryRow[] };

/**
 * The vector icons: the square, the mark's cap and its cap line. The touch icon is the sheet's
 * 76 px cap on the 180 px ink square (0.42 of the side); the `any` and `dark` icons keep that
 * share; the maskable icons take 0.36 of the side so the mark's corners stay inside the 40
 * percent safe circle (R02 5.5); the monochrome icon is the 512 px `any` mark as alpha.
 */
const ICONS = {
  touch: { size: 180, cap: 76 },
  any192: { size: 192, cap: 81 },
  any512: { size: 512, cap: 215 },
  mask192: { size: 192, cap: 69 },
  mask512: { size: 512, cap: 184 },
  mono512: { size: 512, cap: 215 },
} as const;

/** An icon's quads: the mark at its cap, the cap line centred on a whole row, the edges hinted. */
function iconQuads(icon: { size: number; cap: number }): Quad[] {
  return markQuadsAt(icon.size, icon.cap, Math.round((icon.size - icon.cap) / 2), { hinted: true });
}

/** The icon set, the SVG sources, the wordmark and the card template, as bytes keyed by repository path. */
async function build(): Promise<Build> {
  const outputs: Output[] = [];
  const geometry: GeometryRow[] = [];
  const add = (path: string, bytes: Uint8Array | string): void => {
    outputs.push({
      path,
      bytes: typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes,
      kind: 'built',
    });
  };
  const vectorRow = (
    path: string,
    icon: { size: number; cap: number },
    plate: GeometryRow['plate'],
  ): GeometryRow => ({
    path,
    tile: icon.size,
    form: 'vector',
    cap: icon.cap,
    top: Math.round((icon.size - icon.cap) / 2),
    ink: inkOf(iconQuads(icon), icon.size),
    colours: 0,
    plate,
  });

  /* the SVG sources (1.4): the master drawing, the 16 px rows, the 24 px placement, the tile */
  add(`${BRAND_DIR}/mark.svg`, masterSvg());
  add(
    `${BRAND_DIR}/mark-small.svg`,
    SVG_NOTE('the 16 px rows, the one hand drawing (crisp edges)') + `${markSvg(16)}\n`,
  );
  add(
    `${BRAND_DIR}/mark-24.svg`,
    SVG_NOTE(
      'the 24 px placement: the vector at a 16 px cap with its horizontal edges on whole rows (the cut half a pixel above mid cap), the title row and the lockup beside the 22 px word',
    ) + `${markSvg(24)}\n`,
  );
  const tileSvg = iconTileSvg();
  add(`${BRAND_DIR}/icon-tile.svg`, tileSvg);
  add(`${PUBLIC_DIR}/icon.svg`, tileSvg);

  /* the lockup and the card template (1.2, 1.7) */
  add(`${BRAND_DIR}/wordmark.svg`, wordmarkSvg());
  add(OG_TEMPLATE_PATH, await ogTemplateHtml());

  /* the ICO: the paper tiles at 16 (the rows), 32 and 48 (the hinted vector) */
  const tiles = [TILE_SIZES[16], TILE_SIZES[32], TILE_SIZES[48]];
  add(`${PUBLIC_DIR}/favicon.ico`, writeIco(tiles.map((tile) => tileRaster(tile, LIGHT))));
  for (const tile of tiles)
    geometry.push({
      path: `${PUBLIC_DIR}/favicon.ico#${tile.size}`,
      tile: tile.size,
      form: tile.form,
      cap: tile.cap,
      top: tile.top,
      ink:
        tile.form === 'rows'
          ? ROWS16.reduce((n, row) => n + [...row].filter((c) => c === '#').length, 0)
          : inkOf(tileQuads(tile), tile.size),
      colours: 0,
      plate: 'paper',
    });

  /* the touch icon: the paper mark on the ink square, opaque, no corners (1.5 step 3) */
  add(
    `${PUBLIC_DIR}/apple-touch-icon.png`,
    indexedPng(markRaster(ICONS.touch.size, iconQuads(ICONS.touch), DARK.plate, DARK.ink)),
  );
  geometry.push(vectorRow(`${PUBLIC_DIR}/apple-touch-icon.png`, ICONS.touch, 'ink'));

  /* the manifest icons on the ink tile and their inverse on the paper plate for a <picture> */
  for (const [path, icon] of [
    [ICON_PATHS.any192, ICONS.any192],
    [ICON_PATHS.any512, ICONS.any512],
  ] as const) {
    add(
      `${PUBLIC_DIR}${path}`,
      indexedPng(markRaster(icon.size, iconQuads(icon), DARK.plate, DARK.ink)),
    );
    geometry.push(vectorRow(`${PUBLIC_DIR}${path}`, icon, 'ink'));
    const darkPath = path.replace('icon-', 'icon-dark-');
    add(
      `${PUBLIC_DIR}${darkPath}`,
      indexedPng(markRaster(icon.size, iconQuads(icon), LIGHT.plate, LIGHT.ink)),
    );
    geometry.push(vectorRow(`${PUBLIC_DIR}${darkPath}`, icon, 'paper'));
  }

  /* the maskable icons: the mark inside the 40 percent safe circle (1.5 step 5; R02 5.5) */
  for (const [path, icon] of [
    [ICON_PATHS.mask192, ICONS.mask192],
    [ICON_PATHS.mask512, ICONS.mask512],
  ] as const) {
    add(
      `${PUBLIC_DIR}${path}`,
      indexedPng(markRaster(icon.size, iconQuads(icon), DARK.plate, DARK.ink)),
    );
    geometry.push(vectorRow(`${PUBLIC_DIR}${path}`, icon, 'ink'));
  }

  /* the monochrome icon: the mark as alpha */
  add(
    `${PUBLIC_DIR}${ICON_PATHS.mono512}`,
    await pngOfRaster(monoRaster(ICONS.mono512.size, iconQuads(ICONS.mono512))),
  );
  geometry.push(vectorRow(`${PUBLIC_DIR}${ICON_PATHS.mono512}`, ICONS.mono512, 'none'));

  /* the mood pictures (docs/NEXT.md question 5): the deck's twins re-encoded under /brand */
  for (const mood of Object.values(MOOD_PICTURES))
    for (const appearance of ['dark', 'light'] as const)
      add(`${PUBLIC_DIR}${mood[appearance]}`, await moodJpeg(`${mood.from}-${appearance}.jpg`));

  /* the manifest and robots.txt from site.ts (1.5 step 5) */
  add(
    `${PUBLIC_DIR}${ICON_PATHS.manifest}`,
    await jsonText(`${PUBLIC_DIR}${ICON_PATHS.manifest}`, SITE.manifest),
  );
  add(`${PUBLIC_DIR}${ICON_PATHS.robots}`, robotsTxt());

  return { outputs, geometry };
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

type ManifestRecord = { bytes: number; sha256: string; kind: Kind };
type BrandManifest = { generator: string; files: Record<string, ManifestRecord> };

/** The paths the manifest covers beyond the deterministic build: by kind, as committed files. */
function knownPaths(): { path: string; kind: Kind }[] {
  const out: { path: string; kind: Kind }[] = [];
  for (const twin of Object.values(TWIN_PATHS))
    for (const path of [twin.dark, twin.light])
      out.push({ path: `${PUBLIC_DIR}${path}`, kind: 'captured' });
  out.push({ path: RECIPE_PATH, kind: 'captured' });
  out.push({ path: CARD_PATH, kind: 'rendered' });
  out.push({ path: FACTS_PATH, kind: 'facts' });
  return out;
}

/** The manifest over the built outputs plus every known file present on disk. */
function manifestOf(outputs: Output[]): BrandManifest {
  const records = new Map<string, ManifestRecord>();
  for (const output of outputs)
    records.set(output.path, {
      bytes: output.bytes.length,
      sha256: sha256(output.bytes),
      kind: output.kind,
    });
  for (const { path, kind } of knownPaths()) {
    if (records.has(path)) continue;
    const file = resolve(ROOT, path);
    if (!existsSync(file)) continue;
    const bytes = new Uint8Array(readFileSync(file));
    records.set(path, { bytes: bytes.length, sha256: sha256(bytes), kind });
  }
  const files: Record<string, ManifestRecord> = {};
  for (const path of [...records.keys()].sort((a, b) => a.localeCompare(b)))
    files[path] = records.get(path) as ManifestRecord;
  return { generator: 'scripts/build-brand.ts', files };
}

async function geometryJson(rows: GeometryRow[]): Promise<string> {
  return jsonText(GEOMETRY_PATH, {
    generator: 'scripts/build-brand.ts',
    mark: {
      path: { bytes: MARK_PATH.length, sha256: MARK_PATH_SHA256 },
      rows16: { bytes: ROWS16_PATH.length, sha256: ROWS16_PATH_SHA256 },
      aspect: Number(MARK_ASPECT.toFixed(4)),
    },
    steps:
      'the 16 px rows under 24 px; the vector at a 16 px cap in the 24 px square; from 32 px the vector at the size itself, its cap the whole pixels whose box fits the square, every horizontal edge on a whole row',
    rows,
  });
}

// ---------------------------------------------------------------------------------------------
// Reading back (6.4)

type Decoded = { width: number; height: number; data: Uint8Array };

async function decodePng(bytes: Uint8Array): Promise<Decoded> {
  const { data, info } = await sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

function colourSet(image: Decoded): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < image.data.length; i += 4)
    set.add(`${image.data[i]},${image.data[i + 1]},${image.data[i + 2]},${image.data[i + 3]}`);
  return set;
}

function samePixels(a: Decoded, b: Decoded): boolean {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i += 1) if (a.data[i] !== b.data[i]) return false;
  return true;
}

/** Every lit (non ground) pixel lies inside the 40 percent safe circle of the tile. */
function insideSafeCircle(image: Decoded, ground: Rgb): boolean {
  const c = (image.width - 1) / 2;
  const radius = image.width * 0.4;
  for (let y = 0; y < image.height; y += 1)
    for (let x = 0; x < image.width; x += 1) {
      const i = (y * image.width + x) * 4;
      const isGround =
        image.data[i] === ground[0] &&
        image.data[i + 1] === ground[1] &&
        image.data[i + 2] === ground[2];
      if (isGround) continue;
      if (Math.hypot(x - c, y - c) > radius) return false;
    }
  return true;
}

/** The share of pixels in the colour, over an opaque decoded PNG. */
function shareOf(image: Decoded, color: string): number {
  const [r, g, b] = hex(color);
  let count = 0;
  for (let i = 0; i < image.data.length; i += 4)
    if (image.data[i] === r && image.data[i + 1] === g && image.data[i + 2] === b) count += 1;
  return count / (image.width * image.height);
}

function fail(message: string): never {
  console.error(`build-brand: ${message}`);
  process.exit(1);
}

function note(message: string): void {
  console.log(`build-brand: ${message}`);
}

/**
 * A JSON document in the repository's Prettier shape (the check chain's format step reads every
 * committed file), so the bytes the build writes are the bytes the tree keeps and `--check` can
 * compare them.
 */
async function jsonText(path: string, value: unknown): Promise<string> {
  const file = resolve(ROOT, path);
  const config = (await resolveConfig(file)) ?? {};
  return prettierFormat(`${JSON.stringify(value, null, 2)}\n`, { ...config, parser: 'json' });
}

// ---------------------------------------------------------------------------------------------
// The browser: one Chrome for Testing over an in memory origin serving the repository (the
// capture job's pattern), so the card, the lockups and the previews load the product's tokens
// and Inter with no file:// rule involved.

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
};

/** Serves `BRAND_ORIGIN/<repository path>` from disk and `BRAND_ORIGIN/__doc/<name>` from memory. */
async function serveRepo(page: Page, documents: Map<string, string>): Promise<void> {
  await page.route(`${BRAND_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/__doc/')) {
      const body = documents.get(url.pathname.slice('/__doc/'.length));
      if (body === undefined) return route.fulfill({ status: 404, body: 'no such document' });
      return route.fulfill({ status: 200, contentType: CONTENT_TYPES['.html'], body });
    }
    const file = resolve(ROOT, decodeURIComponent(url.pathname.slice(1)));
    if (!file.startsWith(ROOT) || !existsSync(file))
      return route.fulfill({ status: 404, body: `not found: ${url.pathname}` });
    return route.fulfill({
      status: 200,
      contentType: CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      body: readFileSync(file),
    });
  });
}

type Shot = { png: Uint8Array; width: number; height: number };

/** Renders a page of the served repository, or an in memory document, at the size and scale. */
async function shoot(
  launched: LaunchedBrowser,
  target: { path: string } | { document: string },
  size: { width: number; height: number },
  scale: 1 | 2,
  colorScheme: 'light' | 'dark' = 'dark',
): Promise<Shot> {
  const context = await launched.browser.newContext({
    viewport: size,
    deviceScaleFactor: scale,
    colorScheme,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    const documents = new Map<string, string>();
    let url: string;
    if ('document' in target) {
      documents.set('page.html', target.document);
      url = `${BRAND_ORIGIN}/__doc/page.html`;
    } else {
      url = `${BRAND_ORIGIN}/${target.path}`;
    }
    await serveRepo(page, documents);
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: size.width, height: size.height },
      animations: 'disabled',
    });
    return { png: new Uint8Array(png), width: size.width * scale, height: size.height * scale };
  } finally {
    await context.close();
  }
}

async function withBrowser<T>(fn: (launched: LaunchedBrowser) => Promise<T>): Promise<T> {
  const launched = await launchBrowser({ backend: 'angle-metal' });
  try {
    return await fn(launched);
  } finally {
    await launched.close();
  }
}

/** A screenshot as the smallest exact PNG: indexed when it has at most 256 colours, else truecolor. */
async function exactPng(
  shot: Shot,
): Promise<{ bytes: Uint8Array; colours: number; indexed: boolean }> {
  const decoded = await decodePng(shot.png);
  const colours = new Map<string, number>();
  const indices = new Uint8Array(decoded.width * decoded.height);
  for (let i = 0, p = 0; i < decoded.data.length; i += 4, p += 1) {
    const key = `${decoded.data[i]},${decoded.data[i + 1]},${decoded.data[i + 2]}`;
    let index = colours.get(key);
    if (index === undefined) {
      index = colours.size;
      colours.set(key, index);
    }
    if (index < 256) indices[p] = index;
  }
  if (colours.size <= 256) {
    const palette = [...colours.keys()].map((key) => key.split(',').map(Number) as unknown as Rgb);
    return {
      bytes: encodePngIndexed(decoded.width, decoded.height, indices, palette),
      colours: colours.size,
      indexed: true,
    };
  }
  const truecolor = await sharp(Buffer.from(shot.png))
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  return { bytes: new Uint8Array(truecolor), colours: colours.size, indexed: false };
}

// ---------------------------------------------------------------------------------------------
// The card (1.7)

async function renderCard(
  launched: LaunchedBrowser,
): Promise<{ bytes: Uint8Array; colours: number; indexed: boolean }> {
  const shot = await shoot(launched, { path: OG_TEMPLATE_PATH }, CARD, 1);
  const png = await exactPng(shot);
  if (png.bytes.length > CARD_MAX_BYTES)
    fail(
      `${CARD_PATH} is ${png.bytes.length} bytes, over the ${CARD_MAX_BYTES} byte ceiling of SPEC-4 1.5`,
    );
  return png;
}

// ---------------------------------------------------------------------------------------------
// The twins (0.7, 0.12; 1.5 step 6): the liquid metal recipe of P1 mounted by the capture job at
// 3200 by 1800 on ANGLE Metal, frozen at every anchor of the scan, each frame cut through the
// pipeline (autocontrast 0.5, black 160, white 250, gamma 1.5, the 8 by 8 screen, 2 px cells)
// with the opener plate box measured; the frame with the fewest lit cells under the plate is the
// hero, and the next two by the same rule, at least a second apart, are the empty state figure
// and the Not found figure. The card's screen is the hero frame at 120 by 63 cells of 10 px.

/** P1's recipe (design-4/dither/assets/hero.recipe.json): LIQUID_METAL_DECK on the whole canvas, u_shape none. */
const HERO_MATERIAL = 'paper:liquid-metal';
const HERO_UNIFORMS = {
  u_colorBack: '#000000',
  u_colorTint: '#ffffff',
  u_softness: 0.05,
  u_shiftRed: 0,
  u_shiftBlue: 0,
  u_contour: 0.6,
  u_repetition: 3,
  u_distortion: 0.07,
  u_angle: 70,
  u_scale: 1,
  u_shape: 'none',
} as const;
const HERO_TREATMENT: TwoToneParams = {
  autocontrast: 0.5,
  black: 160,
  white: 250,
  gamma: 1.5,
  polarity: 'dark-ground',
  cell: 2,
};
const SCAN = { fromMs: 0, toMs: 10_000, stepMs: 500 } as const;
/** The chosen frames are at least this far apart so the three pictures differ. */
const FRAME_GAP_MS = 1000;
const OG_CELLS = { width: 120, height: 63, cellPx: 10 } as const;

type FrameRecord = {
  anchor: number;
  recipeKey: string;
  litFraction: number;
  litUnder: number;
  litInBand: number;
  nearestLitPx: number;
  warnings: string[];
};

type Chosen = { hero: FrameRecord; figure: FrameRecord; notfound: FrameRecord };

function scanAnchors(): number[] {
  const out: number[] = [];
  for (let ms = SCAN.fromMs; ms <= SCAN.toMs; ms += SCAN.stepMs) out.push(ms);
  return out;
}

/** The rule of 0.7: fewest lit cells under the opener plate, then in its band, then the farthest nearest cell, then the earlier anchor. */
function rankFrames(frames: FrameRecord[]): FrameRecord[] {
  return [...frames].sort(
    (a, b) =>
      a.litUnder - b.litUnder ||
      a.litInBand - b.litInBand ||
      b.nearestLitPx - a.nearestLitPx ||
      a.anchor - b.anchor,
  );
}

function chooseFrames(frames: FrameRecord[]): Chosen {
  const clean = frames.filter((f) => f.warnings.every((w) => !w.startsWith('blank twin')));
  const ranked = rankFrames(clean.length >= 3 ? clean : frames);
  const hero = ranked[0];
  if (hero === undefined) throw new Error('the scan produced no frame');
  const apart = (f: FrameRecord, others: FrameRecord[]): boolean =>
    others.every((o) => Math.abs(o.anchor - f.anchor) >= FRAME_GAP_MS);
  const figure = ranked.find((f) => f !== hero && apart(f, [hero])) ?? ranked[1] ?? hero;
  const notfound =
    ranked.find((f) => f !== hero && f !== figure && apart(f, [hero, figure])) ??
    ranked.find((f) => f !== hero && f !== figure) ??
    hero;
  return { hero, figure, notfound };
}

/** The card's screen: the same stage order as the pipeline at 120 by 63 cells (SPEC-4 1.7). */
function ogScreenBits(rgba: RgbaImage): BitImage {
  let gray: GrayImage = toGray(rgba, 'gray');
  gray = fitCover(gray, OG_CELLS.width, OG_CELLS.height);
  gray = autocontrast(gray, HERO_TREATMENT.autocontrast ?? 0.5);
  gray = tone(gray, HERO_TREATMENT.black, HERO_TREATMENT.white, HERO_TREATMENT.gamma);
  return ditherGray(gray);
}

type TwinPair = {
  dark: Uint8Array;
  light: Uint8Array;
  inkFraction: { dark: number; light: number };
};

function twinPair(darkBits: BitImage): TwinPair {
  const lightBits = invertBits(darkBits);
  return {
    dark: twinPng(darkBits, 'dark'),
    light: twinPng(lightBits, 'light'),
    /* the ink of a twin is its unlit share (TWIN_PALETTES): the two sum to 1.0 */
    inkFraction: {
      dark: Number((1 - litFraction(darkBits)).toFixed(6)),
      light: Number((1 - litFraction(lightBits)).toFixed(6)),
    },
  };
}

async function captureTwins(): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), 'turboslide-brand-capture-'));
  try {
    note(
      `capturing ${HERO_MATERIAL} at ${scanAnchors().length} anchors (${SCAN.fromMs} to ${SCAN.toMs} ms in ${SCAN.stepMs} ms steps) into ${scratch}`,
    );
    const result = await captureMaterial(
      {
        materialId: HERO_MATERIAL,
        uniforms: { ...HERO_UNIFORMS },
        anchors: scanAnchors(),
        id: 'brand-hero',
        role: 'opener',
        backend: 'angle-metal',
      },
      { deckDir: scratch, log: (line) => note(line) },
    );
    note(`captured ${result.frames.length} frames with ${result.renderer} in ${result.ms} ms`);

    /* cut every frame through the pipeline with the opener plate measured */
    const cuts = new Map<
      number,
      {
        frame: CapturedFrame;
        rgba: RgbaImage;
        dark: BitImage;
        clear: PlateClear;
        lit: number;
        warnings: string[];
        backend: string;
      }
    >();
    for (const frame of result.frames) {
      const anchor = frame.asset.source.kind === 'material' ? frame.asset.source.timeMs : 0;
      const rgba = await decodeImage(frame.frame);
      const cut = twoTone(rgba, HERO_TREATMENT, { plate: PLATE_BOXES.opener });
      const clear = cut.metrics.plateClear;
      if (clear === undefined) throw new Error('the cut carries no plate metric');
      cuts.set(anchor, {
        frame,
        rgba,
        dark: cut.dark.bits,
        clear,
        lit: cut.metrics.litFraction,
        warnings: cut.metrics.warnings,
        backend: cut.backend,
      });
    }
    const records: FrameRecord[] = [...cuts.entries()]
      .map(([anchor, cut]) => ({
        anchor,
        recipeKey:
          cut.frame.asset.source.kind === 'material' ? cut.frame.asset.source.recipeKey : '',
        litFraction: cut.lit,
        litUnder: cut.clear.litUnder,
        litInBand: cut.clear.litInBand,
        nearestLitPx: cut.clear.nearestLitPx,
        warnings: cut.warnings,
      }))
      .sort((a, b) => a.anchor - b.anchor);
    const chosen = chooseFrames(records);
    note(
      `hero ${chosen.hero.anchor} ms (${chosen.hero.litUnder} under the plate, ${chosen.hero.litInBand} in the band, nearest ${chosen.hero.nearestLitPx} px, lit ${(chosen.hero.litFraction * 100).toFixed(2)} percent); figure ${chosen.figure.anchor} ms; notfound ${chosen.notfound.anchor} ms`,
    );

    const outputs: Output[] = [];
    const twins: Record<string, unknown> = {};
    for (const [name, record] of [
      ['hero', chosen.hero],
      ['figure', chosen.figure],
      ['notfound', chosen.notfound],
    ] as const) {
      const cut = cuts.get(record.anchor);
      if (cut === undefined) throw new Error(`no cut at ${record.anchor}`);
      const pair = twinPair(cut.dark);
      const paths = TWIN_PATHS[name];
      outputs.push({ path: `${PUBLIC_DIR}${paths.dark}`, bytes: pair.dark, kind: 'captured' });
      outputs.push({ path: `${PUBLIC_DIR}${paths.light}`, bytes: pair.light, kind: 'captured' });
      twins[name] = {
        anchor: record.anchor,
        dark: paths.dark,
        light: paths.light,
        darkBytes: pair.dark.length,
        lightBytes: pair.light.length,
        inkFraction: pair.inkFraction,
        size: [cut.dark.width, cut.dark.height],
      };
    }
    /* the card's screen from the hero frame */
    const heroCut = cuts.get(chosen.hero.anchor);
    if (heroCut === undefined) throw new Error('no hero cut');
    const screen = ogScreenBits(heroCut.rgba);
    const screenPair = twinPair(scaleNearest(screen, OG_CELLS.cellPx));
    outputs.push({
      path: `${PUBLIC_DIR}${TWIN_PATHS.ogScreen.dark}`,
      bytes: screenPair.dark,
      kind: 'captured',
    });
    outputs.push({
      path: `${PUBLIC_DIR}${TWIN_PATHS.ogScreen.light}`,
      bytes: screenPair.light,
      kind: 'captured',
    });

    const recipe = {
      generator: 'scripts/build-brand.ts --capture',
      capturedAt: new Date().toISOString(),
      materialId: HERO_MATERIAL,
      uniforms: result.resolved.uniforms,
      size: FRAME_SIZE,
      backend: result.backend,
      renderer: result.renderer,
      twoTone: true,
      treatment: {
        kind: 'two-tone',
        autocontrast: HERO_TREATMENT.autocontrast,
        black: HERO_TREATMENT.black,
        white: HERO_TREATMENT.white,
        gamma: HERO_TREATMENT.gamma,
        polarity: HERO_TREATMENT.polarity,
        cell: 2,
        bayer: 8,
        resampler: 'lanczos3',
      },
      plate: 'lower-left',
      plateBox: PLATE_BOXES.opener,
      effectsBackend: heroCut.backend,
      palettes: TWIN_PALETTES,
      scan: {
        ...SCAN,
        rule: 'fewest lit cells under PLATE_BOXES.opener, then fewest in its 30 px band, then the farthest nearest lit cell, then the earlier anchor; the figure and the Not found frames are the next two by the same rule at least 1,000 ms from every chosen anchor (SPEC-4 0.7)',
      },
      frames: records,
      chosen,
      twins,
      og: {
        cells: [OG_CELLS.width, OG_CELLS.height],
        cellPx: OG_CELLS.cellPx,
        litFraction: Number(litFraction(screen).toFixed(4)),
        darkBytes: screenPair.dark.length,
        lightBytes: screenPair.light.length,
        dark: TWIN_PATHS.ogScreen.dark,
        light: TWIN_PATHS.ogScreen.light,
      },
    };
    outputs.push({
      path: RECIPE_PATH,
      bytes: new TextEncoder().encode(await jsonText(RECIPE_PATH, recipe)),
      kind: 'captured',
    });
    writeOutputs(ROOT, outputs);
    for (const output of outputs) console.log(`${output.path} ${output.bytes.length} bytes`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

type TwinFacts = {
  path: string;
  width: number;
  height: number;
  colours: string[];
  inkFraction: number;
};

/** Reads a committed twin back: its size, its colour set and its ink share (the #070707 pixels). */
async function readTwin(path: string): Promise<TwinFacts> {
  const image = await decodePng(new Uint8Array(readFileSync(resolve(ROOT, path))));
  return {
    path,
    width: image.width,
    height: image.height,
    colours: [...colourSet(image)].sort(),
    inkFraction: shareOf(image, TILE_COLORS.dark.plate),
  };
}

/** The twins' facts of 6.4: the palette exact, the size, the ink fractions summing to 1.0 per frame. */
async function checkTwins(): Promise<void> {
  const rgba = (color: string): string => `${hex(color).join(',')},255`;
  const darkPalette = [rgba(TWIN_PALETTES.dark.unlit), rgba(TWIN_PALETTES.dark.lit)].sort();
  const lightPalette = [rgba(TWIN_PALETTES.light.unlit), rgba(TWIN_PALETTES.light.lit)].sort();
  for (const [name, paths] of Object.entries(TWIN_PATHS)) {
    const size = name === 'ogScreen' ? CARD : TWIN_SIZE;
    const dark = await readTwin(`${PUBLIC_DIR}${paths.dark}`);
    const light = await readTwin(`${PUBLIC_DIR}${paths.light}`);
    for (const twin of [dark, light])
      if (twin.width !== size.width || twin.height !== size.height)
        fail(
          `${twin.path} is ${twin.width} by ${twin.height}, expected ${size.width} by ${size.height}`,
        );
    if (dark.colours.join('|') !== darkPalette.join('|'))
      fail(
        `${dark.path} holds ${dark.colours.join(' ')}, not the dark palette ${darkPalette.join(' ')} (SPEC-4 0.12)`,
      );
    if (light.colours.join('|') !== lightPalette.join('|'))
      fail(
        `${light.path} holds ${light.colours.join(' ')}, not the light palette ${lightPalette.join(' ')} (SPEC-4 0.12)`,
      );
    const sum = dark.inkFraction + light.inkFraction;
    if (Math.abs(sum - 1) > 1e-9)
      fail(
        `${name}: the ink fractions sum to ${sum.toFixed(6)}, not 1.0 (dark ${dark.inkFraction.toFixed(4)}, light ${light.inkFraction.toFixed(4)})`,
      );
  }
  const recipe = JSON.parse(readFileSync(resolve(ROOT, RECIPE_PATH), 'utf8')) as {
    chosen?: Chosen;
    frames?: FrameRecord[];
    renderer?: string;
  };
  if (
    recipe.chosen === undefined ||
    recipe.frames === undefined ||
    typeof recipe.renderer !== 'string'
  )
    fail(`${RECIPE_PATH} lacks its chosen frames, its scan or its renderer string`);
  for (const [name, record] of Object.entries(recipe.chosen))
    if (!recipe.frames.some((f) => f.anchor === record.anchor))
      fail(`${RECIPE_PATH}: the ${name} anchor ${record.anchor} is not in the scan`);
}

// ---------------------------------------------------------------------------------------------
// The README lockups (`--readme`; docs/NEXT.md 4.1.3 item 7): the lockup on an opaque plate in
// each appearance at 2x, rendered by Chromium with the repository's Inter, for the README's
// <picture> (the dark file as the default source on GitHub's light ground, the light file for a
// reader with the dark GitHub theme). The clear space around the lockup is the mark's cap, so the
// mark's box and the word's baseline stay on whole pixels at 1x and at 2x.

/** The README lockup's page box in CSS px: the lockup with its cap of clear space on every side. */
function readmeBox(): { width: number; height: number; pad: number; top: number } {
  const g = lockupGeometry(WORD_PX, WORD_WIDTH_CHROMIUM_PX);
  const pad = g.cap;
  /* a cap above the cap line and below the baseline; the svg's own rows above its cap line are taken from the margin */
  return { width: g.width + 2 * pad, height: 3 * pad, pad, top: pad - g.capTop };
}

function lockupDocument(appearance: 'dark' | 'light'): string {
  const colors = TILE_COLORS[appearance];
  const box = readmeBox();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="${BRAND_ORIGIN}/packages/fonts/src/inter.css"><style>html,body{margin:0}body{width:${box.width}px;height:${box.height}px;overflow:hidden;background:${colors.plate};color:${colors.ink};-webkit-font-smoothing:antialiased}svg{display:block;margin:${box.top}px 0 0 ${box.pad}px}</style></head><body>${lockupSvg()}</body></html>`;
}

async function readmeLockups(): Promise<void> {
  const box = readmeBox();
  mkdirSync(resolve(ROOT, README_BRAND_DIR), { recursive: true });
  await withBrowser(async (launched) => {
    for (const appearance of ['dark', 'light'] as const) {
      const shot = await shoot(
        launched,
        { document: lockupDocument(appearance) },
        { width: box.width, height: box.height },
        2,
        appearance,
      );
      const png = await exactPng(shot);
      const path = `${README_BRAND_DIR}/lockup-${appearance}.png`;
      writeFileSync(resolve(ROOT, path), png.bytes);
      console.log(
        `${path} ${png.bytes.length} bytes (${shot.width} by ${shot.height}, ${png.colours} colours, ${png.indexed ? 'indexed' : 'truecolor'})`,
      );
    }
  });
}

// ---------------------------------------------------------------------------------------------
// The facts (`--facts`; SPEC-4 0.25): the counts the /home page and the README state, read from
// the tree, and the measured numbers copied from the verifier's newest deployment run with its
// date, so a literal count in the copy is a defect the test can find.

type Facts = {
  generator: string;
  writtenAt: string;
  actions: { count: number; source: string };
  mcpTools: { count: number; source: string };
  httpPaths: { count: number; source: string };
  layouts: { count: number; source: string };
  shapePresets: { count: number; source: string };
  materials: { count: number; source: string };
  checkSteps: { count: number; source: string };
  parityRows: {
    pass: number;
    fail: number;
    skip: number;
    total: number;
    source: string;
    date: string;
    base: string;
  };
  licence: { name: string; source: string };
  export: { worstPageMismatchPercent: number; source: string };
  measured: {
    source: string;
    date: string;
    profile: string;
    base: string;
    rows: {
      check: string;
      name: string;
      value: number | null;
      limit: number | null;
      unit: string;
      ok: boolean;
    }[];
  };
};

function checkStepCount(): number {
  const run = spawnSync(process.execPath, [resolve(ROOT, 'scripts/check.mjs'), '--list'], {
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`check.mjs --list failed: ${run.stderr}`);
  return run.stdout.split('\n').filter((line) => /^\s*\d+\s/.test(line)).length;
}

/**
 * The origins a deployment profile run counts as production: the domain, and the project origin
 * that served main while the domain was two ship rounds behind it (docs/archive/rounds/POLISH.md section 0; the
 * same pair packages/theme/src/brand.test.ts accepts for facts.measured.base).
 */
const PRODUCTION_ORIGINS: readonly string[] = [
  SITE.productionOrigin,
  'https://turboslide.vercel.app',
];

/** The newest verifier run with the deployment profile against production, by the date in its name. */
function newestPerfRun(): {
  path: string;
  json: { startedAt: string; base: string; profile: string; rows: Facts['measured']['rows'] };
} {
  const dir = resolve(ROOT, 'docs/gslides-parity/verification-4');
  const candidates = readdirSync(dir)
    .filter((f) => /^perf-budget-.*\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => ({
      f,
      json: JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
        startedAt: string;
        base: string;
        profile: string;
        rows: Facts['measured']['rows'];
      },
    }))
    .filter((c) => c.json.profile === 'deployment' && PRODUCTION_ORIGINS.includes(c.json.base))
    .sort((a, b) => b.json.startedAt.localeCompare(a.json.startedAt));
  const best = candidates[0];
  if (best === undefined)
    throw new Error(
      'no deployment profile run against production under docs/gslides-parity/verification-4',
    );
  return { path: `docs/gslides-parity/verification-4/${best.f}`, json: best.json };
}

function newestParityAudit(): Facts['parityRows'] {
  const candidates = [
    'docs/gslides-parity/verification-4/parity-audit.json',
    'docs/gslides-parity/verification-3/parity-audit.json',
  ]
    .filter((p) => existsSync(resolve(ROOT, p)))
    .map((p) => ({
      p,
      json: JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')) as {
        summary: { pass: number; fail: number; skip: number };
        at?: string;
        base?: string;
      },
    }))
    .sort((a, b) => (b.json.at ?? '').localeCompare(a.json.at ?? ''));
  const best = candidates[0];
  if (best === undefined)
    throw new Error('no parity-audit.json under docs/gslides-parity/verification-3 or -4');
  const s = best.json.summary;
  return {
    pass: s.pass,
    fail: s.fail,
    skip: s.skip,
    total: s.pass + s.fail + s.skip,
    source: best.p,
    date: (best.json.at ?? '').slice(0, 10),
    base: best.json.base ?? '',
  };
}

function computeFacts(): Facts {
  const manifest = JSON.parse(
    readFileSync(resolve(ROOT, 'packages/agent/generated/manifest.json'), 'utf8'),
  ) as { actionCount: number };
  const mcp = JSON.parse(
    readFileSync(resolve(ROOT, 'packages/agent/generated/mcp-tools.json'), 'utf8'),
  ) as { tools: unknown[] };
  const openapi = JSON.parse(
    readFileSync(resolve(ROOT, 'packages/agent/generated/openapi.json'), 'utf8'),
  ) as { paths: Record<string, unknown> };
  if (manifest.actionCount !== ACTION_IDS.length)
    throw new Error(
      `packages/agent/generated/manifest.json says ${manifest.actionCount} actions, the tree has ${ACTION_IDS.length} (run pnpm generate:contracts)`,
    );
  const perf = newestPerfRun();
  return {
    generator: 'scripts/build-brand.ts --facts',
    writtenAt: new Date().toISOString().slice(0, 10),
    actions: {
      count: ACTION_IDS.length,
      source:
        'packages/schema/src/actions.ts ACTION_IDS; packages/agent/generated/manifest.json actionCount',
    },
    mcpTools: { count: mcp.tools.length, source: 'packages/agent/generated/mcp-tools.json tools' },
    httpPaths: {
      count: Object.keys(openapi.paths).length,
      source: 'packages/agent/generated/openapi.json paths',
    },
    layouts: { count: LAYOUTS.length, source: 'packages/schema/src/layouts.ts LAYOUTS' },
    shapePresets: {
      count: SHAPE_PRESETS.length,
      source: 'packages/schema/src/shapes.ts SHAPE_PRESETS',
    },
    materials: {
      count: MATERIAL_IDS.length,
      source: 'packages/materials/src/catalog.ts MATERIAL_IDS',
    },
    checkSteps: { count: checkStepCount(), source: 'node scripts/check.mjs --list' },
    parityRows: newestParityAudit(),
    licence: { name: 'MIT', source: 'LICENSE' },
    export: {
      worstPageMismatchPercent: 0.003,
      source:
        'docs/archive/status/HOSTED-STATUS.md (the flatten export of the 85 slide GT deck: perfect true, worst decoded mismatch 0.003 percent, horizon, 194 of 5,760,000 px); README.md "Perfect PPTX"',
    },
    measured: {
      source: perf.path,
      date: perf.json.startedAt.slice(0, 10),
      profile: perf.json.profile,
      base: perf.json.base,
      rows: perf.json.rows.map((r) => ({
        check: r.check,
        name: r.name,
        value: r.value,
        limit: r.limit,
        unit: r.unit,
        ok: r.ok,
      })),
    },
  };
}

function factsJson(facts: Facts): Promise<string> {
  return jsonText(FACTS_PATH, facts);
}

/** facts.json against the tree (6.4): every count recomputed, the measured source present. */
function checkFacts(): void {
  const file = resolve(ROOT, FACTS_PATH);
  if (!existsSync(file)) fail(`${FACTS_PATH} is missing; run node scripts/build-brand.ts --facts`);
  const committed = JSON.parse(readFileSync(file, 'utf8')) as Facts;
  const fresh = computeFacts();
  for (const key of [
    'actions',
    'mcpTools',
    'httpPaths',
    'layouts',
    'shapePresets',
    'materials',
    'checkSteps',
  ] as const)
    if (committed[key].count !== fresh[key].count)
      fail(
        `${FACTS_PATH}: ${key} is ${committed[key].count}, the tree has ${fresh[key].count}; run --facts`,
      );
  if (!existsSync(resolve(ROOT, committed.measured.source)))
    fail(`${FACTS_PATH}: the measured source ${committed.measured.source} is missing`);
  if (!existsSync(resolve(ROOT, committed.parityRows.source)))
    fail(`${FACTS_PATH}: the parity audit source ${committed.parityRows.source} is missing`);
  if (committed.measured.source !== fresh.measured.source)
    note(
      `${FACTS_PATH} reads ${committed.measured.source}; a newer run exists at ${fresh.measured.source} (run --facts to adopt it)`,
    );
}

// ---------------------------------------------------------------------------------------------
// The check (0.11, 6.4)

/** The mark's committed data against a rebuild from its rectangles and its rows (docs/NEXT.md 4.1.2). */
function checkMarkData(): void {
  const rebuilt = quadPath(markQuads(), 1);
  if (rebuilt !== MARK_PATH)
    fail('brand.ts MARK_PATH differs from the path MARK_RECTS build; rebuild it and its sha256');
  if (sha256(MARK_PATH) !== MARK_PATH_SHA256)
    fail(
      `brand.ts MARK_PATH has the sha256 ${sha256(MARK_PATH)}, MARK_PATH_SHA256 says ${MARK_PATH_SHA256}`,
    );
  if (rowsPath(ROWS16) !== ROWS16_PATH)
    fail('brand.ts ROWS16_PATH differs from the path ROWS16 draws');
  if (sha256(ROWS16_PATH) !== ROWS16_PATH_SHA256)
    fail(
      `brand.ts ROWS16_PATH has the sha256 ${sha256(ROWS16_PATH)}, ROWS16_PATH_SHA256 says ${ROWS16_PATH_SHA256}`,
    );
}

/** True when every pixel is opaque and lies on the line from `ground` to `ink` (a blend, no third colour). */
function blendsOnly(image: Decoded, ground: Rgb, ink: Rgb, extra: Rgb[] = []): boolean {
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] !== 255) return false;
    const px: Rgb = [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0];
    if (extra.some((c) => c[0] === px[0] && c[1] === px[1] && c[2] === px[2])) continue;
    const span = ink[0] - ground[0] || ink[1] - ground[1] || ink[2] - ground[2] || 1;
    const lead = ink[0] - ground[0] !== 0 ? 0 : ink[1] - ground[1] !== 0 ? 1 : 2;
    const level = Math.round((((px[lead] ?? 0) - (ground[lead] ?? 0)) * 255) / span);
    const want = blend(ground, ink, Math.max(0, Math.min(255, level)));
    for (let c = 0; c < 3; c += 1) if (Math.abs((want[c] ?? 0) - (px[c] ?? 0)) > 1) return false;
  }
  return true;
}

async function check(): Promise<void> {
  /* 0. the mark's paths against their rectangles and rows, and their sha256 */
  checkMarkData();

  const manifestFile = resolve(ROOT, MANIFEST_PATH);
  if (!existsSync(manifestFile))
    fail(`${MANIFEST_PATH} is missing; run node scripts/build-brand.ts first`);
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as BrandManifest;
  const skipped: string[] = [];

  /* 1. the committed files against the committed manifest: bytes and sha256 */
  for (const [path, record] of Object.entries(manifest.files)) {
    const file = resolve(ROOT, path);
    if (!existsSync(file)) fail(`${path} is listed in ${MANIFEST_PATH} and missing`);
    const bytes = readFileSync(file);
    if (bytes.length !== record.bytes)
      fail(`${path}: ${bytes.length} bytes, the manifest says ${record.bytes}`);
    const digest = sha256(bytes);
    if (digest !== record.sha256)
      fail(`${path}: sha256 ${digest}, the manifest says ${record.sha256}`);
  }
  for (const { path, kind } of knownPaths())
    if (!(path in manifest.files))
      fail(`${path} (${kind}) is not in ${MANIFEST_PATH}; run the build that writes it`);

  /* 2. a rebuild compared with the committed files: pixels for the rasters, bytes for text */
  const fresh = await build();
  const freshPaths = new Set(fresh.outputs.map((o) => o.path));
  for (const [path, record] of Object.entries(manifest.files))
    if (
      record.kind === 'built' &&
      !freshPaths.has(path) &&
      path !== GEOMETRY_PATH &&
      path !== MANIFEST_PATH
    )
      fail(`${path} is in the manifest as built and not in the build`);
  for (const output of fresh.outputs) {
    if (!(output.path in manifest.files)) fail(`${output.path} is built and not in the manifest`);
    const committed = new Uint8Array(readFileSync(resolve(ROOT, output.path)));
    if (output.path.endsWith('.png') || output.path.endsWith('.jpg')) {
      const [a, b] = await Promise.all([decodePng(committed), decodePng(output.bytes)]);
      if (!samePixels(a, b)) fail(`${output.path}: the rebuilt picture differs in its pixels`);
    } else if (output.path.endsWith('.ico')) {
      const a = readIco(committed);
      const b = readIco(output.bytes);
      if (a.length !== b.length) fail(`${output.path}: ${a.length} entries against ${b.length}`);
      for (let i = 0; i < a.length; i += 1) {
        const x = a[i];
        const y = b[i];
        if (x === undefined || y === undefined || !samePixels(x, y))
          fail(`${output.path}: entry ${i} differs in its pixels`);
      }
    } else if (Buffer.compare(Buffer.from(committed), Buffer.from(output.bytes)) !== 0) {
      fail(`${output.path}: the rebuilt text differs`);
    }
  }

  /* 3. the file facts, read from the committed files */
  const publicFile = (path: string): Uint8Array =>
    new Uint8Array(readFileSync(resolve(ROOT, `${PUBLIC_DIR}${path}`)));
  const ico = readIco(publicFile(ICON_PATHS.favicon));
  const sizes = ico.map((entry) => entry.width);
  if (sizes.join(',') !== '16,32,48')
    fail(`favicon.ico entries are ${sizes.join(', ')}, expected 16, 32, 48`);
  for (const entry of ico) {
    const tile = TILE_SIZES[entry.width as 16 | 32 | 48];
    if (!samePixels(entry, tileRaster(tile, LIGHT)))
      fail(`favicon.ico ${entry.width} px entry differs from the tile raster`);
    const colours = colourSet(entry).size;
    if (tile.form === 'rows' && colours !== 3)
      fail(
        `favicon.ico ${entry.width} px entry has ${colours} colours, expected 3 (plate, frame, ink)`,
      );
    if (!blendsOnly(entry, LIGHT.plate, LIGHT.ink, [LIGHT.frame]))
      fail(
        `favicon.ico ${entry.width} px entry carries a colour that is not the plate, the frame or a blend to the ink`,
      );
  }
  const iconSvg = new TextDecoder().decode(publicFile(ICON_PATHS.svg));
  if (!iconSvg.includes('@media (prefers-color-scheme: dark)'))
    fail('icon.svg has no prefers-color-scheme block');
  if (!iconSvg.includes('shape-rendering="crispEdges"')) fail('icon.svg has no crispEdges');
  if (!iconSvg.includes(ROWS16_PATH)) fail('icon.svg does not draw the 16 px rows');
  const touch = await decodePng(publicFile(ICON_PATHS.touch));
  if (touch.width !== 180 || touch.height !== 180)
    fail(`apple-touch-icon.png is ${touch.width} by ${touch.height}`);
  if (!blendsOnly(touch, DARK.plate, DARK.ink))
    fail('apple-touch-icon.png is not opaque paper on ink and the blends between them');
  for (const [path, ground, ink] of [
    [ICON_PATHS.any192, DARK.plate, DARK.ink],
    [ICON_PATHS.any512, DARK.plate, DARK.ink],
    [ICON_PATHS.dark192, LIGHT.plate, LIGHT.ink],
    [ICON_PATHS.dark512, LIGHT.plate, LIGHT.ink],
    [ICON_PATHS.mask192, DARK.plate, DARK.ink],
    [ICON_PATHS.mask512, DARK.plate, DARK.ink],
  ] as const) {
    const image = await decodePng(publicFile(path));
    if (!blendsOnly(image, ground, ink))
      fail(`${path} carries a colour that is not its plate, its ink or a blend between them`);
    if (path.includes('mask') && !insideSafeCircle(image, DARK.plate))
      fail(`${path}: the mark leaves the 40 percent safe circle`);
  }
  const mono = await decodePng(publicFile(ICON_PATHS.mono512));
  for (let i = 0; i < mono.data.length; i += 4)
    if (
      (mono.data[i + 3] ?? 0) > 0 &&
      (mono.data[i] !== 0 || mono.data[i + 1] !== 0 || mono.data[i + 2] !== 0)
    )
      fail('icon-mono-512.png carries a colour beside its alpha');
  const webmanifest = JSON.parse(new TextDecoder().decode(publicFile(ICON_PATHS.manifest))) as {
    start_url?: string;
    background_color?: string;
    theme_color?: string;
    icons?: { purpose?: string }[];
  };
  if (webmanifest.start_url !== '/home')
    fail(`manifest.webmanifest start_url is ${webmanifest.start_url}`);
  if (webmanifest.background_color !== '#ffffff' || webmanifest.theme_color !== '#ffffff')
    fail(
      `manifest.webmanifest colours are ${webmanifest.background_color} and ${webmanifest.theme_color}, not the paper #ffffff (docs/NEXT.md 4.1.3 item 3)`,
    );
  for (const icon of webmanifest.icons ?? [])
    if (icon.purpose !== undefined && icon.purpose.includes(' '))
      fail('manifest.webmanifest has an icon with more than one purpose');

  /* 4. the twins: the theme palette and the ink fractions summing to 1.0 (0.12) */
  await checkTwins();

  /* 5. the card: its size and ceiling always; its pixels when the local browser is chromium-1217 (1.5 step 7) */
  const cardBytes = new Uint8Array(readFileSync(resolve(ROOT, CARD_PATH)));
  const card = await decodePng(cardBytes);
  if (card.width !== CARD.width || card.height !== CARD.height)
    fail(
      `${CARD_PATH} is ${card.width} by ${card.height}, expected ${CARD.width} by ${CARD.height}`,
    );
  if (cardBytes.length > CARD_MAX_BYTES)
    fail(`${CARD_PATH} is ${cardBytes.length} bytes, over ${CARD_MAX_BYTES}`);
  await withBrowser(async (launched) => {
    if (launched.executableSource !== 'chromium-1217') {
      skipped.push(
        `the card's pixel compare (the local browser is ${launched.executableSource} ${launched.version}, not the chromium-1217 build)`,
      );
      return;
    }
    const rendered = await renderCard(launched);
    if (!samePixels(card, await decodePng(rendered.bytes)))
      fail(`${CARD_PATH}: the card rendered by ${launched.renderer} differs in its pixels`);
  });

  /* 6. mark-geometry.json against the files read back */
  const geometryFile = resolve(ROOT, GEOMETRY_PATH);
  if (!existsSync(geometryFile)) fail(`${GEOMETRY_PATH} is missing`);
  const geometry = JSON.parse(readFileSync(geometryFile, 'utf8')) as { rows: GeometryRow[] };
  for (const row of geometry.rows) {
    let colours: number;
    if (row.path.includes('#')) {
      const [, size] = row.path.split('#');
      const entry = ico.find((e) => e.width === Number(size));
      if (entry === undefined) fail(`${row.path}: no such ICO entry`);
      colours = colourSet(entry).size;
    } else {
      colours = colourSet(
        await decodePng(new Uint8Array(readFileSync(resolve(ROOT, row.path)))),
      ).size;
    }
    if (colours !== row.colours)
      fail(`${row.path}: ${colours} colours read back, ${GEOMETRY_PATH} says ${row.colours}`);
  }
  await readBackColours(fresh);
  const freshGeometry = await geometryJson(fresh.geometry);
  if (freshGeometry !== readFileSync(geometryFile, 'utf8'))
    fail(`${GEOMETRY_PATH} differs from the rebuild`);

  /* 7. facts.json against the tree (0.25) */
  checkFacts();

  for (const line of skipped) note(`skipped ${line}`);
  console.log(
    `build-brand --check: the mark's paths match their rectangles and rows; ${Object.keys(manifest.files).length} files match the manifest, the rebuild and the facts of SPEC-4 6.4`,
  );
}

function writeOutputs(base: string, outputs: Output[]): void {
  for (const output of outputs) {
    const file = resolve(base, output.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, output.bytes);
  }
}

/** Rewrites brand-manifest.json over the built outputs and every known file on disk. */
async function writeManifest(base: string, built: Output[]): Promise<BrandManifest> {
  const manifest = manifestOf(built);
  writeOutputs(base, [
    {
      path: MANIFEST_PATH,
      bytes: new TextEncoder().encode(await jsonText(MANIFEST_PATH, manifest)),
      kind: 'built',
    },
  ]);
  return manifest;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const known = new Set(['--check', '--capture', '--readme', '--facts', '--out', '--no-card']);
  for (const [i, flag] of argv.entries())
    if (flag.startsWith('--') && !known.has(flag) && argv[i - 1] !== '--out')
      fail(`unknown flag ${flag}`);
  if (argv.includes('--check')) {
    await check();
    return;
  }
  checkMarkData();
  const outIndex = argv.indexOf('--out');
  const base = outIndex >= 0 ? resolve(ROOT, argv[outIndex + 1] ?? '') : ROOT;
  const only = argv.filter((a) => ['--capture', '--readme', '--facts'].includes(a));

  if (argv.includes('--capture')) await captureTwins();
  if (argv.includes('--facts')) {
    const facts = computeFacts();
    writeOutputs(base, [
      { path: FACTS_PATH, bytes: new TextEncoder().encode(await factsJson(facts)), kind: 'facts' },
    ]);
    console.log(
      `${FACTS_PATH}: ${facts.actions.count} actions, ${facts.mcpTools.count} MCP tools, ${facts.httpPaths.count} HTTP paths, ${facts.layouts.count} layouts, ${facts.shapePresets.count} shape presets, ${facts.materials.count} materials, ${facts.checkSteps.count} check steps, ${facts.parityRows.total} parity rows (${facts.parityRows.date}), ${facts.measured.rows.length} measured rows from ${facts.measured.source}`,
    );
  }
  if (argv.includes('--readme')) await readmeLockups();
  if (only.length > 0) {
    /* a flag run rewrites the deterministic outputs (no browser) and the manifest over what is now on disk, then stops */
    const result = await build();
    await readBackColours(result);
    const built = [
      ...result.outputs,
      {
        path: GEOMETRY_PATH,
        bytes: new TextEncoder().encode(await geometryJson(result.geometry)),
        kind: 'built' as Kind,
      },
    ];
    writeOutputs(base, built);
    await writeManifest(base, built);
    return;
  }

  /* the default build: the deterministic outputs and the card */
  const outputs: Output[] = [];
  const result = await build();
  await readBackColours(result);
  outputs.push(...result.outputs);
  outputs.push({
    path: GEOMETRY_PATH,
    bytes: new TextEncoder().encode(await geometryJson(result.geometry)),
    kind: 'built',
  });
  writeOutputs(base, outputs);
  const missingTwins = knownPaths().filter(
    (k) => k.kind === 'captured' && !existsSync(resolve(ROOT, k.path)),
  );
  if (missingTwins.length > 0)
    note(
      `${missingTwins.length} twin file(s) missing (${missingTwins.map((m) => m.path).join(', ')}); run --capture`,
    );
  if (!argv.includes('--no-card'))
    await withBrowser(async (launched) => {
      const card = await renderCard(launched);
      outputs.push({ path: CARD_PATH, bytes: card.bytes, kind: 'rendered' });
      writeOutputs(base, [{ path: CARD_PATH, bytes: card.bytes, kind: 'rendered' }]);
      note(
        `card rendered by ${launched.product} ${launched.version} (${launched.executableSource}) on ${launched.renderer}: ${card.colours} colours, ${card.indexed ? 'indexed' : 'truecolor'}, ${card.bytes.length} bytes`,
      );
    });
  const manifest = await writeManifest(base, outputs);
  for (const output of outputs) console.log(`${output.path} ${output.bytes.length} bytes`);
  console.log(`${MANIFEST_PATH} ${Object.keys(manifest.files).length} files`);
}

/** The geometry rows carry the colour count read back from the built bytes, never assumed. */
async function readBackColours(result: Build): Promise<void> {
  for (const row of result.geometry) {
    const output = result.outputs.find((o) => o.path === row.path.split('#')[0]);
    if (output === undefined) continue;
    if (row.path.includes('#')) {
      const entry = readIco(output.bytes).find((e) => e.width === row.tile);
      row.colours = entry === undefined ? 0 : colourSet(entry).size;
    } else {
      row.colours = colourSet(await decodePng(output.bytes)).size;
    }
  }
}

/* a temporary directory for a rebuild, removed on exit; kept for `--out` callers who want one */
export function tempBuildDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'turboslide-brand-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const invoked =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (invoked) {
  main().catch((error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
