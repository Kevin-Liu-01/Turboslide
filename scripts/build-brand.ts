// The brand build (gslides-parity SPEC-4 0.7, 0.11, 0.12, 0.13, 1.2, 1.4, 1.5, 1.7, 6.4;
// MILESTONES-4 B1): every identity asset from one geometry module (packages/theme/src/brand.ts)
// and one facts object (packages/theme/brand/site.ts), written under apps/studio/public so every
// icon, manifest, twin and card request is a CDN hit and never a function invocation (research-4
// report 02 section 1 measured the HTML 404s). Run from the repository root with Node 24 (type
// stripping, no build step). No new dependency: sharp is in the root devDependencies, the two
// colour PNGs go through the effects package's 1-bit encoder (encodePng1, deterministic bytes),
// the card and the previews render through @turboslide/headless (the product's own Chromium),
// the capture through @turboslide/materials/capture (the implementation of material.capture) and
// the wordmark outlines through packages/theme/scripts/outline-wordmark.py under the fonts venv.
//
//   node scripts/build-brand.ts             the icon set, the SVG sources, the wordmarks, the
//                                           lockup, og-template.html, the card, mark-geometry.json
//                                           and brand-manifest.json (the twins stay as committed)
//   node scripts/build-brand.ts --capture   the twins (0.7, 0.12): the liquid metal recipe over the
//                                           anchor scan, the frames cut through the pipeline with
//                                           the theme palette, hero.recipe.json
//   node scripts/build-brand.ts --previews  packages/theme/brand/previews/** (the size sheet, the
//                                           8x upscales, the tab strips, the confusion sheet, the
//                                           raster edges, the hero scan, variants/)
//   node scripts/build-brand.ts --readme    docs/readme/brand/lockup-stacked-{dark,light}.png at 2x
//   node scripts/build-brand.ts --facts     packages/theme/brand/facts.json (0.25) from the tree
//   node scripts/build-brand.ts --check     step 29: the manifest by bytes and sha256, a rebuild
//                                           compared (pixels for rasters and the ICO's decoded
//                                           entries, bytes for text), the file facts of 6.4, the
//                                           twins' palette and ink sums, the card's pixels when the
//                                           local browser is chromium-1217, the outlines when the
//                                           venv python is present, facts.json against the tree
//
// The set (SPEC-4 0.13; R02 section 3): favicon.ico (16, 32 and 48 px BMP entries, the plate tile
// of 0.4), icon.svg (the tile with the prefers-color-scheme block, crispEdges), apple-touch-icon.png
// (180, the ink tile, no corners), icons/icon-192.png and icon-512.png (the ink tile, `any`),
// icons/icon-mask-192.png and icon-mask-512.png (`maskable`, the mark inside the 40 percent safe
// circle), icons/icon-mono-512.png (`monochrome`, the solid form as alpha), icons/icon-dark-192.png
// and icon-dark-512.png (the paper plate, the inverse of the manifest icons, for the README's
// <picture>), manifest.webmanifest (start_url /home), robots.txt, og/turboslide.png (the card),
// brand/{hero,figure,notfound}-{dark,light}.png and brand/og-screen-{dark,light}.png (the twins),
// brand-manifest.json; and under packages/theme/brand the SVG sources (mark.svg at 64 cells,
// mark-small.svg, icon-tile.svg, wordmark.svg, wordmark-outlines.svg, lockup-stacked.svg),
// og-template.html, hero.recipe.json, mark-geometry.json and facts.json.
//
// Rasters: every mark is drawn on its own cell grid and never resampled (R02 5.4). The tile's
// 12 px mark at 16 px is the one hinted size (brand.ts solidWindow); the 24 and 40 px marks of
// the 32 and 48 px tiles keep integer edges by arithmetic. The ICO writer is the design copy's
// (three 32 bit BMP entries with AND masks; Pillow round trips it with zero differing pixels).
// The twins are committed assets with their recipe rather than a CI build output: byte identity
// holds only on a Mac with ANGLE Metal (J1 2.5), so `--check` compares them by bytes against the
// committed files and regenerates them only under `--capture`.
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

import { bayerThreshold, ditherGray } from '../packages/effects/src/bayer.ts';
import type { BitImage, GrayImage, RgbaImage } from '../packages/effects/src/image.ts';
import { invertBits, litFraction } from '../packages/effects/src/image.ts';
import { decodeImage } from '../packages/effects/src/io.ts';
import { PLATE_BOXES } from '../packages/effects/src/metrics.ts';
import type { PlateClear } from '../packages/effects/src/metrics.ts';
import { encodePng1 } from '../packages/effects/src/png1.ts';
import { rampInk } from '../packages/effects/src/ramp.ts';
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
import { ICON_PATHS, SITE, TWIN_PATHS, TWIN_SIZE } from '../packages/theme/brand/site.ts';
import {
  TILE_COLORS,
  TILE_SIZES,
  cellRects,
  litCount,
  markBits,
  markGrid,
  markPath,
  markSvg,
  solidBits,
  tileMarkPath,
} from '../packages/theme/src/brand.ts';
import type { TileGeometry } from '../packages/theme/src/brand.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = 'apps/studio/public';
const BRAND_DIR = 'packages/theme/brand';
const PREVIEWS_DIR = `${BRAND_DIR}/previews`;
const VARIANTS_DIR = `${PREVIEWS_DIR}/variants`;
const README_BRAND_DIR = 'docs/readme/brand';
const MANIFEST_PATH = `${PUBLIC_DIR}/brand-manifest.json`;
const GEOMETRY_PATH = `${BRAND_DIR}/mark-geometry.json`;
const RECIPE_PATH = `${BRAND_DIR}/hero.recipe.json`;
const FACTS_PATH = `${BRAND_DIR}/facts.json`;
const OUTLINES_PATH = `${BRAND_DIR}/wordmark-outlines.svg`;
const OG_TEMPLATE_PATH = `${BRAND_DIR}/og-template.html`;
const CARD_PATH = `${PUBLIC_DIR}${ICON_PATHS.card}`;
const VENV_PYTHON = '.turboslide/venv/bin/python';
const OUTLINE_SCRIPT = 'packages/theme/scripts/outline-wordmark.py';
const INTER_WOFF2 = 'packages/fonts/assets/InterVariable.woff2';
/** The origin the previews and the card are served from, in memory (the capture job's pattern). */
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

/** The plate tile of SPEC-4 0.4 at 16, 32 or 48 px: the plate, the 1 px frame, the inset solid mark. */
function tileRaster(tile: TileGeometry, colors: typeof LIGHT): Raster {
  const { size } = tile;
  const raster = blank(size, size, colors.plate);
  for (let i = 0; i < size; i += 1) {
    put(raster, i, 0, colors.frame);
    put(raster, i, size - 1, colors.frame);
    put(raster, 0, i, colors.frame);
    put(raster, size - 1, i, colors.frame);
  }
  const bits = solidBits(tile.mark.size);
  for (let y = 0; y < tile.mark.size; y += 1)
    for (let x = 0; x < tile.mark.size; x += 1)
      if (bits.bits[y * tile.mark.size + x])
        put(raster, tile.mark.x + x, tile.mark.y + y, colors.ink);
  return raster;
}

/**
 * A mark of `markPx` on a `size` px tile as one bit image (1 is ink), the mark centred, its
 * cells drawn on their own grid: `markPx / n` px per cell, an integer by construction.
 */
function markTileBits(size: number, markPx: number, n: number): BitImage {
  const cell = markPx / n;
  if (!Number.isInteger(cell)) throw new Error(`non integer cell ${markPx}/${n} at ${size}`);
  const off = (size - markPx) / 2;
  if (!Number.isInteger(off)) throw new Error(`non integer offset for a ${markPx} mark on ${size}`);
  const { bits } = markBits(n);
  const out = new Uint8Array(size * size);
  for (let y = 0; y < markPx; y += 1)
    for (let x = 0; x < markPx; x += 1) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      if (bits[cy * n + cx]) out[(off + y) * size + off + x] = 1;
    }
  return { width: size, height: size, bits: out };
}

/** A bit image as an opaque RGBA raster: index 0 the ground, 1 the ink. */
function rasterOfBits(bits: BitImage, ground: Rgb, ink: Rgb): Raster {
  const raster = blank(bits.width, bits.height, ground);
  for (let y = 0; y < bits.height; y += 1)
    for (let x = 0; x < bits.width; x += 1)
      if (bits.bits[y * bits.width + x]) put(raster, x, y, ink);
  return raster;
}

/** The monochrome icon: the solid form at 448 px as alpha over a transparent ground, black where lit. */
function monoRaster(size: number, markPx: number): Raster {
  const raster = blank(size, size, null);
  const bits = markTileBits(size, markPx, 8);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) if (bits.bits[y * size + x]) put(raster, x, y, [0, 0, 0]);
  return raster;
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
  `<!-- Turboslide mark, ${what}. Generated by scripts/build-brand.ts from packages/theme/src/brand.ts (the 8 by 8 Bayer permutation of packages/effects/src/bayer.ts). Ink is currentColor; the plate window is the ground showing through. -->\n`;

/** icon.svg (SPEC-4 0.13, 1.4): the 16 px tile with the prefers-color-scheme block and crispEdges. */
function iconTileSvg(): string {
  const tile = TILE_SIZES[16];
  const l = TILE_COLORS.light;
  const d = TILE_COLORS.dark;
  return (
    SVG_NOTE(
      'the tab icon: the solid mark on an opaque paper plate with a 1 px frame in the edge composite; paper ink on an ink plate where prefers-color-scheme: dark is honoured',
    ) +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" role="img" aria-label="Turboslide"><title>Turboslide</title><style>.plate{fill:${l.plate}}.frame{fill:none;stroke:${l.frame};stroke-width:1}.ink{fill:${l.ink}}@media (prefers-color-scheme: dark){.plate{fill:${d.plate}}.frame{stroke:${d.frame}}.ink{fill:${d.ink}}}</style><rect class="plate" x="0" y="0" width="16" height="16"/><rect class="frame" x="0.5" y="0.5" width="15" height="15"/><path class="ink" fill-rule="evenodd" d="${tileMarkPath(tile)}"/></svg>\n`
  );
}

function robotsTxt(): string {
  const lines = ['User-agent: *'];
  for (const path of SITE.robots.allow) lines.push(`Allow: ${path}`);
  for (const path of SITE.robots.disallow) lines.push(`Disallow: ${path}`);
  return `${lines.join('\n')}\n`;
}

// The wordmark (SPEC-4 1.2): Inter 500 with cv11 and ss01, tracking -0.025em at 28 px and above;
// the mark's height is the cap height of the word (1490 of 2048 units, 0.7275 em, so 66 px type
// gives 48.0 px), the gap is one third of the mark, baselines aligned, the mark solid at 48 px
// (0.5). The SVG's baseline sits at y 51 in a 66 unit line, so the 48 px mark spans y 3 to 51.
const WORD = 'Turboslide';
const WORD_PX = 66;
const WORD_MARK_PX = 48;
const WORD_GAP_PX = WORD_MARK_PX / 3;
const WORD_BASELINE_Y = 51;
const WORD_TRACK_EM = -0.025;
/** The word's width at 66 px as Chromium measured it with the repository's InterVariable (P1 1.4). */
const WORD_WIDTH_CHROMIUM_PX = 287.06;
const WORDMARK_BOX_W = 354;
const INTER_STACK = "Inter, 'Inter Fallback', system-ui, sans-serif";

function wordText(x: number, y: number, anchor: 'start' | 'middle' = 'start'): string {
  return `<text x="${x}" y="${y}" font-family="${INTER_STACK}" font-size="${WORD_PX}" font-weight="500" letter-spacing="${(WORD_TRACK_EM * WORD_PX).toFixed(2)}" text-anchor="${anchor}" style="font-feature-settings:'cv11','ss01'">${WORD}</text>`;
}

/** wordmark.svg: the 48 px solid mark and the word as live text (the studio ships Inter). */
function wordmarkSvg(): string {
  return (
    `<!-- Turboslide wordmark (gslides-parity SPEC-4 1.2): the 48 px solid mark at the cap height of the word set at ${WORD_PX} px, Inter 500, cv11 and ss01, tracking ${WORD_TRACK_EM}em, a ${WORD_GAP_PX} px gap, baselines aligned. The word is live text (the studio ships InterVariable.woff2); wordmark-outlines.svg carries it as outlines for surfaces without the font. Generated by scripts/build-brand.ts. -->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORDMARK_BOX_W} ${WORD_PX}" width="${WORDMARK_BOX_W}" height="${WORD_PX}" fill="currentColor" role="img" aria-label="${WORD}"><title>${WORD}</title>` +
    `<path transform="translate(0 ${WORD_BASELINE_Y - WORD_MARK_PX}) scale(${WORD_MARK_PX / 16})" shape-rendering="crispEdges" fill-rule="evenodd" d="${markPath(2)}"/>` +
    wordText(WORD_MARK_PX + WORD_GAP_PX, WORD_BASELINE_Y) +
    `</svg>\n`
  );
}

/** The outlined word as outline-wordmark.py writes it (font units, baseline at 0, y down). */
type Outline = {
  word: string;
  font: string;
  fontVersion: string;
  upm: number;
  wght: number;
  opsz: number;
  trackEm: number;
  capHeight: number;
  width: number;
  glyphs: { glyph: string; x: number; advance: number; kern: number }[];
  d: string;
};

/** The venv interpreter with fontTools, or null with the reason it is not usable here. */
function venvPython(): { python: string } | { reason: string } {
  const python = resolve(ROOT, VENV_PYTHON);
  if (!existsSync(python))
    return { reason: `${VENV_PYTHON} is missing (turboslide fonts build creates it)` };
  const probe = spawnSync(python, ['-c', 'import fontTools'], { encoding: 'utf8' });
  if (probe.status !== 0) return { reason: `${VENV_PYTHON} has no fontTools` };
  return { python };
}

/** Runs outline-wordmark.py under the venv; the JSON it prints. */
function outlineWord(python: string): Outline {
  const run = spawnSync(
    python,
    [
      resolve(ROOT, OUTLINE_SCRIPT),
      '--font',
      resolve(ROOT, INTER_WOFF2),
      '--word',
      WORD,
      '--wght',
      '500',
      '--opsz',
      '32',
      '--track',
      String(WORD_TRACK_EM),
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (run.status !== 0) throw new Error(`${OUTLINE_SCRIPT} failed: ${run.stderr.trim()}`);
  return JSON.parse(run.stdout) as Outline;
}

/** wordmark-outlines.svg from the outline record: the mark and the word as one path in font units. */
function wordmarkOutlinesSvg(outline: Outline): string {
  const scale = WORD_PX / outline.upm;
  const wordWidth = Math.ceil(outline.width * scale);
  const box = WORD_MARK_PX + WORD_GAP_PX + wordWidth;
  return (
    `<!-- Turboslide wordmark as outlines (gslides-parity SPEC-4 1.2): the 48 px solid mark and the word "${outline.word}" taken from ${outline.font} (${outline.fontVersion}) at wght ${outline.wght}, opsz ${outline.opsz}, tracking ${outline.trackEm}em, with Inter's pair kerning applied (${outline.glyphs
      .filter((g) => g.kern !== 0)
      .map((g) => `${g.glyph} ${g.kern}`)
      .join(
        ', ',
      )} units), by packages/theme/scripts/outline-wordmark.py under the fonts venv; the word is ${(outline.width * scale).toFixed(1)} px wide at ${WORD_PX} px. For the README, npm and the card, where no font can be assumed. Generated by scripts/build-brand.ts. -->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${WORD_PX}" width="${box}" height="${WORD_PX}" fill="currentColor" role="img" aria-label="${outline.word}"><title>${outline.word}</title>` +
    `<path transform="translate(0 ${WORD_BASELINE_Y - WORD_MARK_PX}) scale(${WORD_MARK_PX / 16})" shape-rendering="crispEdges" fill-rule="evenodd" d="${markPath(2)}"/>` +
    `<path transform="translate(${WORD_MARK_PX + WORD_GAP_PX} ${WORD_BASELINE_Y}) scale(${scale})" d="${outline.d}"/>` +
    `</svg>\n`
  );
}

/** The committed outlines' path and width, when the file exists (the card and the lockups read it). */
function committedOutline(): { d: string; widthPx: number } | null {
  const file = resolve(ROOT, OUTLINES_PATH);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const d = /<path transform="translate\([^)]*\) scale\([^)]*\)" d="([^"]+)"\/>/.exec(text)?.[1];
  const width = /the word is ([0-9.]+) px wide/.exec(text)?.[1];
  if (d === undefined || width === undefined) return null;
  return { d, widthPx: Number(width) };
}

// The stacked lockup (SPEC-4 1.2): the 64 px cellular mark (32 cells, 2 px) centred over the word
// at 66 px, the clear space around the pair equal to the mark's height, a half mark between them.
const LOCKUP_MARK_PX = 64;
const LOCKUP_CLEAR_PX = LOCKUP_MARK_PX;
const LOCKUP_GAP_PX = LOCKUP_MARK_PX / 2;

function lockupGeometry(wordWidth: number) {
  const content = Math.max(LOCKUP_MARK_PX, Math.ceil(wordWidth));
  const width = content + 2 * LOCKUP_CLEAR_PX;
  const height = 2 * LOCKUP_CLEAR_PX + LOCKUP_MARK_PX + LOCKUP_GAP_PX + WORD_PX;
  /* the mark's left edge on an even pixel so its 2 px cells land on device pixels */
  const markX = Math.floor((width - LOCKUP_MARK_PX) / 2 / 2) * 2;
  const markY = LOCKUP_CLEAR_PX;
  const wordY = LOCKUP_CLEAR_PX + LOCKUP_MARK_PX + LOCKUP_GAP_PX + WORD_BASELINE_Y;
  return { width, height, markX, markY, wordY, centerX: width / 2 };
}

/** lockup-stacked.svg with the word as live text; the README PNGs render it with the repository's Inter. */
function lockupStackedSvg(): string {
  const g = lockupGeometry(WORD_WIDTH_CHROMIUM_PX);
  const { n } = markGrid(LOCKUP_MARK_PX);
  return (
    `<!-- Turboslide stacked lockup (gslides-parity SPEC-4 1.2): the ${LOCKUP_MARK_PX} px mark at ${n} cells (2 px cells) centred over the word at ${WORD_PX} px, a ${LOCKUP_GAP_PX} px gap, clear space of ${LOCKUP_CLEAR_PX} px around the pair; the README hero (docs/readme/brand, rendered at 2x by build-brand.ts --readme) and Not found. Generated by scripts/build-brand.ts. -->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.width} ${g.height}" width="${g.width}" height="${g.height}" fill="currentColor" role="img" aria-label="${WORD}"><title>${WORD}</title>` +
    `<g transform="translate(${g.markX} ${g.markY}) scale(${LOCKUP_MARK_PX / n})" shape-rendering="crispEdges">${cellRects(markBits(n))}</g>` +
    wordText(g.centerX, g.wordY, 'middle') +
    `</svg>\n`
  );
}

// The Open Graph card (SPEC-4 1.7; design-4/dither/og.html): 1200 by 630 in the dark appearance,
// the hero frame through the screen at 10 px cells behind, the plate cut from it at the mark's
// proportions (left 150, width 600, bottom 79, height 236) with the 48 px solid mark, the word as
// outlines and the one sentence, the address top left on its own plate; nothing that matters
// within 48 px of an edge. The page links tokens.css, brand.css and inter.css by relative paths so
// the type and the tokens are the product's.
const CARD = { width: 1200, height: 630 } as const;
const CARD_PLATE = { left: 150, width: 600, bottom: 79, height: 236 } as const;

async function ogTemplateHtml(outline: { d: string; widthPx: number } | null): Promise<string> {
  const scale = WORD_PX / 2048;
  const word =
    outline === null
      ? `<b>${WORD}</b>`
      : `<svg class="word" viewBox="0 0 ${Math.ceil(outline.widthPx)} ${WORD_PX}" width="${Math.ceil(outline.widthPx)}" height="${WORD_PX}" aria-hidden="true"><path transform="translate(0 ${WORD_BASELINE_Y}) scale(${scale})" d="${outline.d}"/></svg>`;
  const screen = relative(
    resolve(ROOT, BRAND_DIR),
    resolve(ROOT, `${PUBLIC_DIR}${TWIN_PATHS.ogScreen.dark}`),
  );
  const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<title>Turboslide Open Graph card</title>
<!--
  The site wide Open Graph image (gslides-parity SPEC-4 1.7; research-4 report 02 section 6.4),
  1200 by 630, rendered in Chromium at device scale factor 1 by scripts/build-brand.ts into
  apps/studio/public/og/turboslide.png. The composition is the mark at card size: the hero's frame
  through the screen at 10 px cells (${TWIN_PATHS.ogScreen.dark}, 120 by 63 cells, so a 552 px feed
  card still shows 4.6 px cells and a 360 px unfurl 3 px); the plate cut from it at the mark's
  proportions (left ${CARD_PLATE.left}, width ${CARD_PLATE.width}, bottom ${CARD_PLATE.bottom}, height ${CARD_PLATE.height}) carrying the 48 px solid mark, the word
  as outlines and the one sentence; the address top left on its own plate. Nothing that matters
  sits within 48 px of an edge (X crops 1.91:1 to 2:1). Generated; edit the template function in
  scripts/build-brand.ts.
-->
<link rel="stylesheet" href="../../fonts/src/inter.css">
<link rel="stylesheet" href="../../chrome/src/tokens.css">
<link rel="stylesheet" href="../../chrome/src/brand.css">
<style>
html, body { margin: 0; }
body { width: ${CARD.width}px; height: ${CARD.height}px; overflow: hidden; background: var(--pt-paper); color: var(--pt-ink); font-family: var(--pt-display); font-feature-settings: 'cv11', 'ss01'; -webkit-font-smoothing: antialiased; }
.card { position: relative; width: ${CARD.width}px; height: ${CARD.height}px; background: url('${screen}') 0 0 no-repeat; background-size: ${CARD.width}px ${CARD.height}px; image-rendering: pixelated; }
.plate { position: absolute; left: ${CARD_PLATE.left}px; bottom: ${CARD_PLATE.bottom}px; width: ${CARD_PLATE.width}px; height: ${CARD_PLATE.height}px; box-sizing: border-box; background: var(--ts-plate); padding: 30px 32px 0; }
.lock { display: flex; align-items: flex-end; gap: ${WORD_GAP_PX}px; height: ${WORD_PX}px; }
.lock .mark { width: ${WORD_MARK_PX}px; height: ${WORD_MARK_PX}px; fill: currentColor; display: block; margin-bottom: ${WORD_PX - WORD_BASELINE_Y}px; }
.lock .word { display: block; fill: currentColor; }
.lock b { font-weight: 500; font-size: ${WORD_PX}px; line-height: 1; letter-spacing: ${WORD_TRACK_EM}em; }
.plate p { margin: 22px 0 0; font-family: var(--pt-text); font-size: 22px; line-height: 1.4; color: var(--pt-ink-2); max-width: 536px; }
.url { position: absolute; left: ${CARD_PLATE.left}px; top: 60px; font-family: var(--pt-mono); font-size: 20px; color: var(--pt-ink); background: var(--ts-plate); padding: 6px 12px; }
</style>
</head>
<body>
<div class="card">
  <span class="url">${SITE.productionOrigin.replace(/^https?:\/\//, '')}</span>
  <div class="plate">
    <div class="lock"><svg class="mark" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path fill-rule="evenodd" d="${markPath(2)}"/></svg>${word}</div>
    <p>${SITE.description}</p>
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
// The build of the deterministic outputs

type Kind = 'built' | 'outlined' | 'captured' | 'rendered' | 'facts';
type Output = { path: string; bytes: Uint8Array; kind: Kind };

type GeometryRow = {
  path: string;
  tile: number;
  mark: number;
  cells: number;
  cell: number;
  lit: number;
  /** the colour count read back from the file by `--check` (the value written is the build's own read) */
  colours: number;
  plate: 'paper' | 'ink' | 'none';
};

type Build = { outputs: Output[]; geometry: GeometryRow[] };

/** The icon set, the SVG sources, the lockups and the card template, as bytes keyed by repository path. */
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

  /* the SVG sources (1.4) */
  add(
    `${BRAND_DIR}/mark.svg`,
    SVG_NOTE('the full mark at 64 cells (8 px cells at 512 px)') + `${markSvg(64, 512)}\n`,
  );
  add(
    `${BRAND_DIR}/mark-small.svg`,
    SVG_NOTE('the small mark: the solid form on the 16 unit grid for 16 to 48 px') +
      `${markSvg(8, 16)}\n`,
  );
  const tileSvg = iconTileSvg();
  add(`${BRAND_DIR}/icon-tile.svg`, tileSvg);
  add(`${PUBLIC_DIR}/icon.svg`, tileSvg);

  /* the wordmark, the stacked lockup and the card template (1.2, 1.7) */
  add(`${BRAND_DIR}/wordmark.svg`, wordmarkSvg());
  add(`${BRAND_DIR}/lockup-stacked.svg`, lockupStackedSvg());
  add(OG_TEMPLATE_PATH, await ogTemplateHtml(committedOutline()));

  /* the ICO: the plate tiles at 16, 32 and 48 (0.4, 0.5) */
  const tiles = [TILE_SIZES[16], TILE_SIZES[32], TILE_SIZES[48]].map((tile) =>
    tileRaster(tile, LIGHT),
  );
  add(`${PUBLIC_DIR}/favicon.ico`, writeIco(tiles));
  for (const tile of [TILE_SIZES[16], TILE_SIZES[32], TILE_SIZES[48]])
    geometry.push({
      path: `${PUBLIC_DIR}/favicon.ico#${tile.size}`,
      tile: tile.size,
      mark: tile.mark.size,
      cells: 8,
      cell: tile.mark.size / 8,
      lit: litCount(solidBits(tile.mark.size)),
      colours: 3,
      plate: 'paper',
    });

  /* the touch icon: the ink tile, the 128 px mark at 4 px cells, truecolor RGBA (1.5 step 3) */
  const touch = markTileBits(180, 128, markGrid(128).n);
  add(
    `${PUBLIC_DIR}/apple-touch-icon.png`,
    await pngOfRaster(rasterOfBits(touch, DARK.plate, DARK.ink)),
  );
  geometry.push({
    path: `${PUBLIC_DIR}/apple-touch-icon.png`,
    tile: 180,
    mark: 128,
    cells: 32,
    cell: 4,
    lit: litCount(touch),
    colours: 2,
    plate: 'ink',
  });

  /* the manifest icons: the ink tile with the mark at 160 and 448 px (1.1's table), palette PNGs */
  const anyIcons: [string, number, number][] = [
    [ICON_PATHS.any192, 192, 160],
    [ICON_PATHS.any512, 512, 448],
  ];
  for (const [path, size, markPx] of anyIcons) {
    const grid = markGrid(markPx);
    const bits = markTileBits(size, markPx, grid.n);
    add(`${PUBLIC_DIR}${path}`, png1(bits, DARK.plate, DARK.ink));
    geometry.push({
      path: `${PUBLIC_DIR}${path}`,
      tile: size,
      mark: markPx,
      cells: grid.n,
      cell: grid.cell,
      lit: litCount(bits),
      colours: 2,
      plate: 'ink',
    });
    /* the inverse for the README's <picture>: the paper plate with the ink mark */
    const darkPath = path.replace('icon-', 'icon-dark-');
    add(`${PUBLIC_DIR}${darkPath}`, png1(bits, LIGHT.plate, LIGHT.ink));
    geometry.push({
      path: `${PUBLIC_DIR}${darkPath}`,
      tile: size,
      mark: markPx,
      cells: grid.n,
      cell: grid.cell,
      lit: litCount(bits),
      colours: 2,
      plate: 'paper',
    });
  }

  /* the maskable icons: the mark inside the 40 percent safe circle (1.5 step 5; R02 5.5) */
  const maskIcons: [string, number, number][] = [
    [ICON_PATHS.mask192, 192, 96],
    [ICON_PATHS.mask512, 512, 256],
  ];
  for (const [path, size, markPx] of maskIcons) {
    const grid = markGrid(markPx);
    const bits = markTileBits(size, markPx, grid.n);
    add(`${PUBLIC_DIR}${path}`, png1(bits, DARK.plate, DARK.ink));
    geometry.push({
      path: `${PUBLIC_DIR}${path}`,
      tile: size,
      mark: markPx,
      cells: grid.n,
      cell: grid.cell,
      lit: litCount(bits),
      colours: 2,
      plate: 'ink',
    });
  }

  /* the monochrome icon: the solid form as alpha */
  add(`${PUBLIC_DIR}${ICON_PATHS.mono512}`, await pngOfRaster(monoRaster(512, 448)));
  geometry.push({
    path: `${PUBLIC_DIR}${ICON_PATHS.mono512}`,
    tile: 512,
    mark: 448,
    cells: 8,
    cell: 56,
    lit: litCount(markTileBits(512, 448, 8)),
    colours: 2,
    plate: 'none',
  });

  /* the manifest and robots.txt from site.ts (1.5 step 5) */
  add(
    `${PUBLIC_DIR}${ICON_PATHS.manifest}`,
    await jsonText(`${PUBLIC_DIR}${ICON_PATHS.manifest}`, SITE.manifest),
  );
  add(`${PUBLIC_DIR}${ICON_PATHS.robots}`, robotsTxt());

  return { outputs, geometry };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

type ManifestRecord = { bytes: number; sha256: string; kind: Kind };
type BrandManifest = { generator: string; files: Record<string, ManifestRecord> };

/** The paths the manifest covers beyond the deterministic build: by kind, as committed files. */
function knownPaths(): { path: string; kind: Kind }[] {
  const out: { path: string; kind: Kind }[] = [{ path: OUTLINES_PATH, kind: 'outlined' }];
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
    threshold:
      'solid below 64 px; 2 px cells at 64, 4 px from 128 to 256, 8 px at 448 and 512 (SPEC-4 0.5, 1.1)',
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
// The previews (1.4 `previews/**`; 0.49; MILESTONES-4 B1 day 3): records for the judges and the
// verifier, regenerated on demand and not in the manifest.

/** An SVG string rasterized by sharp (librsvg) at 1x. */
async function svgPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

function rasterPngBuffer(raster: Raster): Promise<Buffer> {
  return sharp(Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength), {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function label(x: number, y: number, text: string, color: string, size = 12): string {
  return `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="${color}">${text}</text>`;
}

async function upscale(png: Buffer, k: number): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  return sharp(png)
    .resize((meta.width ?? 0) * k, (meta.height ?? 0) * k, { kernel: 'nearest' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** The mark at `markPx` on a `size` square of the appearance, as PNG bytes; the tile when `tile`. */
async function markPreview(
  size: number,
  markPx: number,
  appearance: 'light' | 'dark',
  tile = false,
): Promise<Buffer> {
  const colors = appearance === 'light' ? LIGHT : DARK;
  if (tile) {
    const geometry = TILE_SIZES[size as 16 | 32 | 48];
    return rasterPngBuffer(tileRaster(geometry, colors));
  }
  const bits = markTileBits(size, markPx, markGrid(markPx).n);
  return rasterPngBuffer(rasterOfBits(bits, colors.plate, colors.ink));
}

type Composite = { input: Buffer; left: number; top: number };

async function sheet(
  width: number,
  height: number,
  background: string,
  parts: Composite[],
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background } })
    .composite(parts)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** previews/mark-sizes.png: the sizes of 1.1's table on paper and on ink, every raster at 1:1. */
async function sizeSheet(): Promise<Buffer> {
  const items: { name: string; size: number; markPx: number; tile: boolean }[] = [
    { name: '16 tile', size: 16, markPx: 12, tile: true },
    { name: '24', size: 24, markPx: 24, tile: false },
    { name: '32 tile', size: 32, markPx: 24, tile: true },
    { name: '48 tile', size: 48, markPx: 40, tile: true },
    { name: '64 (2 px cells)', size: 64, markPx: 64, tile: false },
    { name: '128 (4 px)', size: 128, markPx: 128, tile: false },
    { name: '180 touch tile', size: 180, markPx: 128, tile: false },
    { name: '512 (8 px)', size: 512, markPx: 512, tile: false },
  ];
  const rowH = 560;
  const parts: Composite[] = [];
  const labels: string[] = [];
  let x = 24;
  const positions: number[] = [];
  for (const item of items) {
    positions.push(x);
    x += item.size + 40;
  }
  const width = x + 24;
  for (const [row, appearance] of [
    [0, 'light'],
    [1, 'dark'],
  ] as const) {
    const top = row * rowH;
    parts.push({
      input: await sheet(
        width,
        rowH,
        appearance === 'light' ? TILE_COLORS.light.plate : TILE_COLORS.dark.plate,
        [],
      ),
      left: 0,
      top,
    });
    for (const [i, item] of items.entries()) {
      const png = await markPreview(item.size, item.markPx, appearance, item.tile);
      parts.push({ input: png, left: positions[i] ?? 0, top: top + 528 - item.size - 8 });
      labels.push(
        label(
          positions[i] ?? 0,
          top + 546,
          item.name,
          appearance === 'light' ? '#3a3d44' : '#b9bcc3',
        ),
      );
    }
  }
  parts.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${rowH * 2}">${labels.join('')}</svg>`,
    ),
    left: 0,
    top: 0,
  });
  return sheet(width, rowH * 2, '#888888', parts);
}

/**
 * previews/tab-strips-{1x,2x}.png: three strips at the browser's real geometry (a 48 px strip, 176
 * by 36 px tabs, 16 px icons) beside grey boxes standing for other sites' icons: Chrome's light
 * strip with the light tile, Chrome's dark strip with the dark tile (the prefers-color-scheme block
 * honoured), Safari's dark strip with the light tile (the base colours; R02 2.1 T2). At 2x the
 * tiles are the 32 px rasters, never the 16 px ones scaled.
 */
async function tabStrips(scale: 1 | 2): Promise<Buffer> {
  const stripW = 720 * scale;
  const stripH = 48 * scale;
  const tabW = 176 * scale;
  const tabH = 36 * scale;
  const icon = 16 * scale;
  const cases: {
    strip: string;
    tab: string;
    text: string;
    tile: 'light' | 'dark';
    name: string;
  }[] = [
    {
      strip: '#dee1e6',
      tab: '#ffffff',
      text: '#3c4043',
      tile: 'light',
      name: 'Chrome, light strip: the paper tile',
    },
    {
      strip: '#202124',
      tab: '#35363a',
      text: '#e8eaed',
      tile: 'dark',
      name: 'Chrome, dark strip: the ink tile through the media block',
    },
    {
      strip: '#2d2d2d',
      tab: '#3f3f3f',
      text: '#e8eaed',
      tile: 'light',
      name: 'Safari, dark strip: the paper tile (the base colours)',
    },
  ];
  const rows: Buffer[] = [];
  for (const c of cases) {
    const parts: Composite[] = [];
    for (let t = 0; t < 4; t += 1) {
      const active = t === 1;
      parts.push({
        input: await sheet(tabW, tabH, active ? c.tab : c.strip, []),
        left: (8 + t * 180) * scale,
        top: 8 * scale,
      });
      if (t !== 1 && t !== 2) {
        const grey = c.tile === 'light' && c.strip === '#dee1e6' ? '#80868b' : '#9aa0a6';
        parts.push({
          input: await sheet(icon, icon, grey, []),
          left: (8 + t * 180 + 12) * scale,
          top: 18 * scale,
        });
      }
    }
    const tile = await markPreview(icon, icon === 16 ? 12 : 24, c.tile, true);
    parts.push({ input: tile, left: (8 + 180 + 12) * scale, top: 18 * scale });
    parts.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${stripW}" height="${stripH}">${label((8 + 180 + 36) * scale, 30 * scale, c.name, c.text, 12 * scale)}</svg>`,
      ),
      left: 0,
      top: 0,
    });
    rows.push(await sheet(stripW, stripH, c.strip, parts));
  }
  const gap = 8 * scale;
  return sheet(
    stripW,
    stripH * 3 + gap * 2,
    '#888888',
    rows.map((input, i) => ({ input, left: 0, top: i * (stripH + gap) })),
  );
}

/** The grey silhouettes of R01 6.3 item 12 on a 32 unit box: the forms the mark must not read as. */
const SILHOUETTES: [string, string][] = [
  ['triangle', '<path d="M16 5 L28 27 H4 Z"/>'],
  ['cube', '<path d="M16 3 L28 9.5 V22.5 L16 29 L4 22.5 V9.5 Z"/>'],
  ['Z', '<path d="M6 6 H26 V10 L12 22 H26 V26 H6 V22 L20 10 H6 Z"/>'],
  [
    'rectangle in a rectangle',
    '<rect x="4" y="8" width="24" height="16"/><rect x="10" y="12" width="12" height="8" fill="#ffffff"/>',
  ],
  ['roundel', '<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="5" fill="#ffffff"/>'],
  [
    'chevron pair',
    '<path d="M6 6 L16 16 L6 26 L10 26 L20 16 L10 6 Z"/><path d="M14 6 L24 16 L14 26 L18 26 L28 16 L18 6 Z"/>',
  ],
  [
    'speed line',
    '<rect x="4" y="9" width="24" height="3"/><rect x="8" y="15" width="20" height="3"/><rect x="12" y="21" width="16" height="3"/>',
  ],
  [
    'portrait card with a plate',
    '<rect x="8" y="3" width="16" height="26"/><rect x="11" y="9" width="10" height="7" fill="#ffffff"/>',
  ],
];

/** previews/confusion-sheet.png: the 32 px tile and the bare 32 px mark beside the silhouettes, at 1x. */
function confusionSheetSvg(): string {
  const cellW = 156;
  const width = 24 + cellW * (SILHOUETTES.length + 2);
  const height = 120;
  const items: string[] = [];
  let x = 24;
  const tile = TILE_SIZES[32];
  items.push(
    `<g transform="translate(${x} 24)"><rect width="48" height="48" fill="#ffffff"/><rect x="8" y="8" width="32" height="32" fill="${TILE_COLORS.light.plate}"/><rect x="8.5" y="8.5" width="31" height="31" fill="none" stroke="${TILE_COLORS.light.frame}" stroke-width="1"/><path transform="translate(8 8)" fill="${TILE_COLORS.light.ink}" fill-rule="evenodd" shape-rendering="crispEdges" d="${tileMarkPath(tile)}"/></g>${label(x, 92, 'the tile at 32', '#3a3d44')}`,
  );
  x += cellW;
  items.push(
    `<g transform="translate(${x} 24)"><rect width="48" height="48" fill="#ffffff"/><path transform="translate(8 8) scale(2)" fill="${TILE_COLORS.light.ink}" fill-rule="evenodd" shape-rendering="crispEdges" d="${markPath(2)}"/></g>${label(x, 92, 'the mark at 32', '#3a3d44')}`,
  );
  x += cellW;
  for (const [name, body] of SILHOUETTES) {
    items.push(
      `<g transform="translate(${x} 24)"><rect width="48" height="48" fill="#ffffff"/><g transform="translate(8 8)" fill="#8a8f98">${body}</g></g>${label(x, 92, name, '#3a3d44')}`,
    );
    x += cellW;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#f6f6f6"/>${items.join('')}${label(24, 112, 'Research-4 report 01 section 6.3 item 12: grey stand ins for the forms the mark must not read as; none is a logo. A square with a lower left window shares no silhouette with them.', '#3a3d44', 11)}</svg>`;
}

type EdgeRecord = {
  size: number;
  scale: number;
  px: number;
  colours: number;
  leftRailPx: number;
  bottomRailPx: number;
  windowEdges: number[];
  soft: boolean;
};

/**
 * The raster edge check of 0.50: the 16 unit path at 16, 20 and 24 px, 1x and 2x, rasterized by
 * librsvg with crispEdges; a soft edge is a third colour. The window's edges in px are recorded so
 * a reader sees where the arithmetic lands (2.5 px at 20 px 1x) and how the renderer snapped it.
 */
async function rasterEdges(): Promise<{ records: EdgeRecord[]; sheet: Buffer }> {
  const records: EdgeRecord[] = [];
  const tiles: Buffer[] = [];
  for (const size of [16, 20, 24]) {
    for (const scale of [1, 2]) {
      const px = size * scale;
      const svg = markSvg(8, px).replace('fill="currentColor"', `fill="${TILE_COLORS.light.ink}"`);
      const png = await svgPng(svg);
      const image = await decodePng(new Uint8Array(png));
      const colours = colourSet(image).size;
      const isInk = (x: number, y: number): boolean => image.data[(y * px + x) * 4 + 3] === 255;
      /* the row through the window's middle and the column through it */
      const midY = Math.floor(px * 0.8);
      const midX = Math.floor(px * 0.35);
      let leftRail = 0;
      while (leftRail < px && isInk(leftRail, midY)) leftRail += 1;
      let bottomRail = 0;
      while (bottomRail < px && isInk(midX, px - 1 - bottomRail)) bottomRail += 1;
      const unit = px / 16;
      records.push({
        size,
        scale,
        px,
        colours,
        leftRailPx: leftRail,
        bottomRailPx: bottomRail,
        windowEdges: [2 * unit, 10 * unit, 8 * unit, 14 * unit],
        soft: colours > 2,
      });
      tiles.push(await upscale(png, 8));
    }
  }
  const parts: Composite[] = [];
  let x = 24;
  const labels: string[] = [];
  for (const [i, tile] of tiles.entries()) {
    const r = records[i] as EdgeRecord;
    parts.push({ input: tile, left: x, top: 24 });
    labels.push(
      label(
        x,
        24 + r.px * 8 + 16,
        `${r.size} px at ${r.scale}x: ${r.colours} colours, rails ${r.leftRailPx}/${r.bottomRailPx} px`,
        '#3a3d44',
        11,
      ),
    );
    x += r.px * 8 + 32;
  }
  const width = x;
  const height = 24 + 48 * 8 + 48;
  parts.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join('')}</svg>`,
    ),
    left: 0,
    top: 0,
  });
  return { records, sheet: await sheet(width, height, '#f6f6f6', parts) };
}

/** previews/hero-scan.png: the scan's dark twins as a contact sheet (downscaled, a record only) with the plate metrics. */
async function heroScanSheet(launched: LaunchedBrowser): Promise<Buffer | null> {
  const recipeFile = resolve(ROOT, RECIPE_PATH);
  if (!existsSync(recipeFile)) return null;
  const recipe = JSON.parse(readFileSync(recipeFile, 'utf8')) as {
    frames: FrameRecord[];
    chosen: Chosen;
    renderer: string;
    capturedAt: string;
  };
  const cols = 3;
  const w = 400;
  const h = 225;
  const rows = Math.ceil(recipe.frames.length / cols);
  const cards: string[] = [];
  recipe.frames.forEach((f, i) => {
    const x = 24 + (i % cols) * (w + 24);
    const y = 24 + Math.floor(i / cols) * (h + 56);
    const role =
      f.anchor === recipe.chosen.hero.anchor
        ? 'hero'
        : f.anchor === recipe.chosen.figure.anchor
          ? 'figure'
          : f.anchor === recipe.chosen.notfound.anchor
            ? 'notfound'
            : '';
    const px = PLATE_BOXES.opener[0] / 4;
    const py = PLATE_BOXES.opener[1] / 4;
    const pw = PLATE_BOXES.opener[2] / 4;
    const ph = PLATE_BOXES.opener[3] / 4;
    cards.push(
      `<div class="card" style="left:${x}px;top:${y}px"><div class="twin" style="background-image:url('${BRAND_ORIGIN}/${PUBLIC_DIR}${TWIN_PATHS.hero.dark}')"></div><div class="plate" style="left:${px}px;top:${py}px;width:${pw}px;height:${ph}px"></div><p>${f.anchor} ms${role ? `, ${role}` : ''}: ${f.litUnder} under the plate, ${f.litInBand} in the band, nearest ${f.nearestLitPx} px, lit ${(f.litFraction * 100).toFixed(1)} percent</p></div>`,
    );
  });
  /* the frames other than the three chosen are not committed, so the sheet shows the plate box over the hero twin for each anchor's numbers */
  const document = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#f6f6f6;font:12px Helvetica,Arial,sans-serif;color:#3a3d44;width:${24 + cols * (w + 24)}px;height:${64 + rows * (h + 56)}px;position:relative}
.card{position:absolute;width:${w}px}.twin{width:${w}px;height:${h}px;background-size:${w}px ${h}px;image-rendering:auto;border:1px solid #656565;box-sizing:border-box}
.plate{position:absolute;border:1px solid #d6336c;box-sizing:border-box}.card p{margin:6px 0 0}
</style></head><body>${cards.join('')}<p style="position:absolute;left:24px;top:${rows * (h + 56) - 8}px">The scan of SPEC-4 0.7 over ${recipe.frames.length} anchors, ${recipe.renderer}, ${recipe.capturedAt}. The picture is the committed hero twin downscaled to a quarter (a record, not a product surface); the outline is PLATE_BOXES.opener at the same scale; the numbers are each anchor's own.</p></body></html>`;
  const shot = await shoot(
    launched,
    { document },
    { width: 24 + cols * (w + 24), height: 64 + rows * (h + 56) },
    1,
    'light',
  );
  return Buffer.from(shot.png);
}

// The variants (0.49, 0.51; MILESTONES-4 B1 day 3): the two alternates re-rendered from the
// repository's generators with a measured reason each, and P1's cell threshold sheet.

/** Proposal 2's geometry (design-4/shader/tools/make-mark.mjs `geometry`, copied so importing the module does not rerun its writes). */
function p2Geometry(S: number) {
  const stroke = Math.max(1, Math.round(S / 32));
  const bar = 2 * Math.max(1, Math.round(S / 32));
  const cell = S >= 384 ? 8 : S >= 128 ? 4 : S >= 32 ? 2 : 0;
  const padMin = Math.max(1, Math.round(S / 16));
  let interior = Math.floor((S - 2 * padMin - 2 * stroke - bar) / 2);
  if (cell) interior = Math.floor(interior / cell) * cell;
  const W = 2 * interior + 2 * stroke + bar;
  const pad = Math.floor((S - W) / 2);
  const target = (W * 9) / 16;
  let inner = Math.round(target) - bar - stroke;
  if (cell) {
    const lo = Math.floor(inner / cell) * cell;
    const hi = lo + cell;
    const dl = Math.abs(bar + lo + stroke - target);
    const dh = Math.abs(bar + hi + stroke - target);
    inner = dh <= dl ? hi : lo;
  }
  const H = bar + inner + stroke;
  const y0 = Math.floor((S - H) / 2);
  return {
    S,
    stroke,
    bar,
    cell,
    pad,
    W,
    H,
    interior,
    inner,
    x0: pad,
    y0,
    stemX: pad + stroke + interior,
  };
}

function p2Svg(
  S: number,
  ink: string,
  plate: string,
): { svg: string; measured: Record<string, number> } {
  const g = p2Geometry(S);
  const r = (x: number, y: number, w: number, h: number): string =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const parts = [
    r(g.x0, g.y0, g.W, g.bar),
    r(g.x0, g.y0 + g.bar, g.stroke, g.H - g.bar),
    r(g.x0 + g.W - g.stroke, g.y0 + g.bar, g.stroke, g.H - g.bar),
    r(g.x0, g.y0 + g.H - g.stroke, g.W, g.stroke),
    r(g.stemX, g.y0 + g.bar, g.bar, g.inner),
  ];
  let cells = 0;
  if (g.cell) {
    const n = g.interior / g.cell;
    const m = g.inner / g.cell;
    const px = g.stemX + g.bar;
    const py = g.y0 + g.bar;
    for (let i = 0; i < m; i += 1)
      for (let j = 0; j < n; j += 1)
        if (rampInk(j + 1, i, n + 1)) {
          parts.push(r(px + j * g.cell, py + i * g.cell, g.cell, g.cell));
          cells += 1;
        }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" shape-rendering="crispEdges"><rect width="${S}" height="${S}" fill="${plate}"/><g fill="${ink}">${parts.join('')}</g></svg>`;
  return {
    svg,
    measured: {
      size: S,
      frameHeightPx: g.H,
      rowsOutsideFrame: S - g.H,
      strokePx: g.stroke,
      stemPx: g.bar,
      cellPx: g.cell,
      rampCells: cells,
    },
  };
}

/** Proposal 3's hint T on the tile (design-4/type/tools/build-marks.mjs HINT and hintRects, copied). */
const P3_HINT = {
  barX: 3,
  barY: 2,
  barW: 10,
  barH: 2,
  stemX: 7,
  stemW: 2,
  stemY: 4,
  footY: 14,
  rampFromY: 10,
} as const;
const P3_END_TONE = 0.25;

function p3TileSvg(
  size: number,
  colors: typeof TILE_COLORS.light,
): { svg: string; measured: Record<string, number> } {
  const unit = size / 16;
  const cell = unit >= 4 ? unit / 2 : 0;
  const r = (x: number, y: number, w: number, h: number): string =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const parts = [
    r(P3_HINT.barX * unit, P3_HINT.barY * unit, P3_HINT.barW * unit, P3_HINT.barH * unit),
  ];
  const solidEnd = cell > 0 ? P3_HINT.rampFromY : P3_HINT.footY;
  parts.push(
    r(
      P3_HINT.stemX * unit,
      P3_HINT.stemY * unit,
      P3_HINT.stemW * unit,
      (solidEnd - P3_HINT.stemY) * unit,
    ),
  );
  let cells = 0;
  if (cell > 0) {
    const rows = ((P3_HINT.footY - P3_HINT.rampFromY) * unit) / cell;
    const cols = (P3_HINT.stemW * unit) / cell;
    for (let row = 0; row < rows; row += 1) {
      const t = 1 - ((row + 1) / (rows + 1)) * (1 - P3_END_TONE);
      for (let c = 0; c < cols; c += 1)
        if (t * 255 > bayerThreshold(row, c)) {
          parts.push(
            r(P3_HINT.stemX * unit + c * cell, P3_HINT.rampFromY * unit + row * cell, cell, cell),
          );
          cells += 1;
        }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${colors.plate}"/><rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" fill="none" stroke="${colors.frame}" stroke-width="1"/><g fill="${colors.ink}">${parts.join('')}</g></svg>`;
  const letterArea = P3_HINT.barW * P3_HINT.barH + P3_HINT.stemW * (P3_HINT.footY - P3_HINT.stemY);
  return {
    svg,
    measured: {
      size,
      stemPx: P3_HINT.stemW * unit,
      armPx: P3_HINT.barH * unit,
      cellPx: cell,
      rampCells: cells,
      letterShareOfBox: Number((letterArea / 256).toFixed(4)),
    },
  };
}

/** P1's cell threshold sheet (P1 1.4): the mark beside 44 px type at 32 and 48 px in the solid, 16 and 24 cell forms, at 1x and 2x. */
function cellThresholdDocument(): string {
  const forms: { size: number; n: number }[] = [
    { size: 32, n: 8 },
    { size: 32, n: 16 },
    { size: 48, n: 8 },
    { size: 48, n: 16 },
    { size: 48, n: 24 },
    { size: 64, n: 32 },
  ];
  const rows = forms
    .map((f) => {
      const cell = f.size / f.n;
      const body =
        f.n === 8 ? `<path fill-rule="evenodd" d="${markPath(2)}"/>` : cellRects(markBits(f.n));
      const box = f.n === 8 ? 16 : f.n;
      return `<div class="row"><svg width="${f.size}" height="${f.size}" viewBox="0 0 ${box} ${box}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${body}</svg><span class="word">Turboslide</span><span class="cap">${f.size} px, ${f.n === 8 ? 'solid' : `${f.n} cells of ${cell} px`}</span></div>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="${BRAND_ORIGIN}/packages/fonts/src/inter.css"><style>
body{margin:0;padding:24px;background:#ffffff;color:#070707;font-family:${INTER_STACK};font-feature-settings:'cv11','ss01';width:560px}
.row{display:flex;align-items:center;gap:16px;height:72px}.word{font-size:44px;font-weight:500;letter-spacing:-0.025em;line-height:1}.cap{margin-left:auto;font-size:12px;color:#3a3d44;font-family:Helvetica,Arial,sans-serif}
p{font:12px Helvetica,Arial,sans-serif;color:#3a3d44;max-width:560px}
</style></head><body>${rows}<p>Proposal 1 section 1.4: the sheet that fixed the cell threshold. A 2 px cell beside 44 px type reads as noise at 32 px (the 8 by 8 tile shows twice across) and as a picture from 64 px; SPEC-4 0.5 sets the one threshold at 64 px for every surface, so the horizontal lockup at 66 px type carries the solid 48 px mark.</p></body></html>`;
}

async function previews(): Promise<void> {
  mkdirSync(resolve(ROOT, VARIANTS_DIR), { recursive: true });
  const written: { path: string; bytes: number }[] = [];
  const write = (path: string, bytes: Buffer | Uint8Array | string): void => {
    const file = resolve(ROOT, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    written.push({
      path,
      bytes: typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.length,
    });
  };

  write(`${PREVIEWS_DIR}/mark-sizes.png`, await sizeSheet());
  for (const [size, tile] of [
    [16, true],
    [32, true],
    [16, false],
    [32, false],
  ] as const) {
    const markPx = tile ? (size === 16 ? 12 : 24) : size;
    const png = await markPreview(size, markPx, 'light', tile);
    write(`${PREVIEWS_DIR}/mark-${size}-${tile ? 'tile' : 'paper'}-8x.png`, await upscale(png, 8));
  }
  write(`${PREVIEWS_DIR}/tab-strips-1x.png`, await tabStrips(1));
  write(`${PREVIEWS_DIR}/tab-strips-2x.png`, await tabStrips(2));
  const confusion = await svgPng(confusionSheetSvg());
  write(`${PREVIEWS_DIR}/confusion-sheet.png`, confusion);
  write(`${PREVIEWS_DIR}/confusion-sheet-4x.png`, await upscale(confusion, 4));
  const edges = await rasterEdges();
  write(`${PREVIEWS_DIR}/raster-edges.png`, edges.sheet);
  write(
    `${PREVIEWS_DIR}/raster-edges.json`,
    await jsonText(`${PREVIEWS_DIR}/raster-edges.json`, {
      generator: 'scripts/build-brand.ts --previews',
      rule: 'SPEC-4 0.50: the 20 px print bar mark and the 24 px title row mark as rasters at 1x and 2x; a soft edge is a third colour; rasterized by librsvg (sharp) from the SVG path with shape-rendering crispEdges',
      records: edges.records,
    }),
  );

  /* the variants: the two alternates from the repository's generators with a measured reason each */
  const variantRecords: Record<string, unknown>[] = [];
  for (const S of [16, 32, 64, 512]) {
    const { svg, measured } = p2Svg(S, TILE_COLORS.light.ink, TILE_COLORS.light.plate);
    write(`${VARIANTS_DIR}/p2-frame-t-${S}-paper.png`, await svgPng(svg));
    variantRecords.push({
      variant: 'proposal 2, the slide frame and T with the ramp panel',
      source:
        'docs/gslides-parity/design-4/shader/tools/make-mark.mjs (geometry, panelCells, markShapes; copied here so the module is not rerun)',
      file: `${VARIANTS_DIR}/p2-frame-t-${S}-paper.png`,
      measured,
      reason: `Rejected as the product mark (SPEC-4 0.2; J1 rejection 5, J3 rejection 5): the 16:9 frame leaves ${measured.rowsOutsideFrame} of ${S} rows outside it (${((measured.rowsOutsideFrame / S) * 100).toFixed(0)} percent of the box), its stroke is ${measured.strokePx} px${measured.cellPx ? ` and the panel holds ${measured.rampCells} cells of ${measured.cellPx} px` : ' and no cell fits at this size'}; the form reads as a letter and a screen before a slide, and J2's choice of it is on Kevin's list (section 8).`,
    });
  }
  for (const S of [16, 32, 64]) {
    const { svg, measured } = p3TileSvg(S, TILE_COLORS.light);
    write(`${VARIANTS_DIR}/p3-t-tile-${S}-paper.png`, await svgPng(svg));
    variantRecords.push({
      variant: 'proposal 3, the Inter T tile with the dissolving foot',
      source:
        'docs/gslides-parity/design-4/type/tools/build-marks.mjs (HINT, hintRects; copied here so the module is not rerun)',
      file: `${VARIANTS_DIR}/p3-t-tile-${S}-paper.png`,
      measured,
      reason: `Rejected as the product mark (SPEC-4 0.2; J1 rejection 2, J3 rejection 3): the letter covers ${(measured.letterShareOfBox * 100).toFixed(1)} percent of the box with a ${measured.stemPx} px stem${measured.cellPx ? ` and ${measured.rampCells} ramp cells of ${measured.cellPx} px` : ' and no ramp cell at this size'}; it reads as a Latin letter first (R01 6.3 item 13) and the ramp needs 64 px before a cell exists. Its tile (the plate and the 1 px frame) is what SPEC-4 0.4 kept.`,
    });
  }
  write(
    `${VARIANTS_DIR}/variants.json`,
    await jsonText(`${VARIANTS_DIR}/variants.json`, {
      generator: 'scripts/build-brand.ts --previews',
      records: variantRecords,
    }),
  );

  await withBrowser(async (launched) => {
    for (const scale of [1, 2] as const) {
      const shot = await shoot(
        launched,
        { document: cellThresholdDocument() },
        { width: 608, height: 24 * 2 + 72 * 6 + 80 },
        scale,
        'light',
      );
      write(`${VARIANTS_DIR}/cell-threshold-${scale}x.png`, Buffer.from(shot.png));
    }
    const scan = await heroScanSheet(launched);
    if (scan !== null) write(`${PREVIEWS_DIR}/hero-scan.png`, scan);
  });

  write(
    `${PREVIEWS_DIR}/index.json`,
    await jsonText(`${PREVIEWS_DIR}/index.json`, {
      generator: 'scripts/build-brand.ts --previews',
      writtenAt: new Date().toISOString(),
      files: written.filter((w) => !w.path.endsWith('index.json')),
    }),
  );
  for (const w of written) console.log(`${w.path} ${w.bytes} bytes`);
}

// ---------------------------------------------------------------------------------------------
// The README lockups (`--readme`; SPEC-4 section 5, 1.13): the stacked lockup on an opaque plate
// in each appearance at 2x, rendered by Chromium with the repository's Inter, for the README's
// <picture> (the dark file as the default source on GitHub's light ground, the light file for a
// reader with the dark GitHub theme). Written to docs/readme/brand for B5 to place.

function lockupDocument(appearance: 'dark' | 'light'): string {
  const colors = TILE_COLORS[appearance];
  const svg = lockupStackedSvg().replace(/^<!--[\s\S]*?-->\n/, '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="${BRAND_ORIGIN}/packages/fonts/src/inter.css"><style>html,body{margin:0}body{background:${colors.plate};color:${colors.ink};-webkit-font-smoothing:antialiased}svg{display:block}</style></head><body>${svg}</body></html>`;
}

async function readmeLockups(): Promise<void> {
  const g = lockupGeometry(WORD_WIDTH_CHROMIUM_PX);
  mkdirSync(resolve(ROOT, README_BRAND_DIR), { recursive: true });
  await withBrowser(async (launched) => {
    for (const appearance of ['dark', 'light'] as const) {
      const shot = await shoot(
        launched,
        { document: lockupDocument(appearance) },
        { width: g.width, height: g.height },
        2,
        appearance,
      );
      const png = await exactPng(shot);
      const path = `${README_BRAND_DIR}/lockup-stacked-${appearance}.png`;
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
    .filter((c) => c.json.profile === 'deployment' && c.json.base === SITE.productionOrigin)
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
        'docs/HOSTED-STATUS.md (the flatten export of the 85 slide GT deck: perfect true, worst decoded mismatch 0.003 percent, horizon, 194 of 5,760,000 px); README.md "Perfect PPTX"',
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

async function check(): Promise<void> {
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
    if (output.path.endsWith('.png')) {
      const [a, b] = await Promise.all([decodePng(committed), decodePng(output.bytes)]);
      if (!samePixels(a, b)) fail(`${output.path}: the rebuilt PNG differs in its pixels`);
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

  /* 3. the wordmark outlines, when the venv python is here */
  const python = venvPython();
  if ('python' in python) {
    const rebuilt = wordmarkOutlinesSvg(outlineWord(python.python));
    if (rebuilt !== readFileSync(resolve(ROOT, OUTLINES_PATH), 'utf8'))
      fail(`${OUTLINES_PATH} differs from the rebuild under ${VENV_PYTHON}`);
  } else {
    skipped.push(
      `the outlines rebuild (${python.reason}; the committed file is verified by bytes)`,
    );
  }

  /* 4. the file facts of 6.4, read from the committed files */
  const publicFile = (path: string): Uint8Array =>
    new Uint8Array(readFileSync(resolve(ROOT, `${PUBLIC_DIR}${path}`)));
  const ico = readIco(publicFile(ICON_PATHS.favicon));
  const sizes = ico.map((entry) => entry.width);
  if (sizes.join(',') !== '16,32,48')
    fail(`favicon.ico entries are ${sizes.join(', ')}, expected 16, 32, 48`);
  for (const entry of ico) {
    const colours = colourSet(entry).size;
    if (colours !== 3)
      fail(
        `favicon.ico ${entry.width} px entry has ${colours} colours, expected 3 (plate, frame, ink)`,
      );
    const tile = TILE_SIZES[entry.width as 16 | 32 | 48];
    if (!samePixels(entry, tileRaster(tile, LIGHT)))
      fail(`favicon.ico ${entry.width} px entry differs from the tile raster`);
  }
  const iconSvg = new TextDecoder().decode(publicFile(ICON_PATHS.svg));
  if (!iconSvg.includes('@media (prefers-color-scheme: dark)'))
    fail('icon.svg has no prefers-color-scheme block');
  if (!iconSvg.includes('shape-rendering="crispEdges"')) fail('icon.svg has no crispEdges');
  const touch = await decodePng(publicFile(ICON_PATHS.touch));
  if (touch.width !== 180 || touch.height !== 180)
    fail(`apple-touch-icon.png is ${touch.width} by ${touch.height}`);
  for (let i = 3; i < touch.data.length; i += 4)
    if (touch.data[i] !== 255) fail('apple-touch-icon.png is not opaque');
  if (colourSet(touch).size !== 2)
    fail(`apple-touch-icon.png has ${colourSet(touch).size} colours, expected 2`);
  for (const path of [
    ICON_PATHS.any192,
    ICON_PATHS.any512,
    ICON_PATHS.dark192,
    ICON_PATHS.dark512,
    ICON_PATHS.mask192,
    ICON_PATHS.mask512,
  ]) {
    const image = await decodePng(publicFile(path));
    const colours = colourSet(image).size;
    if (colours !== 2) fail(`${path} has ${colours} colours, expected 2`);
    if (path.includes('mask') && !insideSafeCircle(image, DARK.plate))
      fail(`${path}: the mark leaves the 40 percent safe circle`);
  }
  const mono = await decodePng(publicFile(ICON_PATHS.mono512));
  for (let i = 0; i < mono.data.length; i += 4) {
    const alpha = mono.data[i + 3];
    if (alpha !== 0 && alpha !== 255) fail('icon-mono-512.png has a partial alpha');
    if (alpha === 255 && (mono.data[i] !== 0 || mono.data[i + 1] !== 0 || mono.data[i + 2] !== 0))
      fail('icon-mono-512.png carries a colour beside its alpha');
  }
  const webmanifest = JSON.parse(new TextDecoder().decode(publicFile(ICON_PATHS.manifest))) as {
    start_url?: string;
    icons?: { purpose?: string }[];
  };
  if (webmanifest.start_url !== '/home')
    fail(`manifest.webmanifest start_url is ${webmanifest.start_url}`);
  for (const icon of webmanifest.icons ?? [])
    if (icon.purpose !== undefined && icon.purpose.includes(' '))
      fail('manifest.webmanifest has an icon with more than one purpose');

  /* 5. the twins: the theme palette and the ink fractions summing to 1.0 (0.12) */
  await checkTwins();

  /* 6. the card: its size and ceiling always; its pixels when the local browser is chromium-1217 (1.5 step 7) */
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

  /* 7. mark-geometry.json against the PNGs read back */
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
  const freshGeometry = await geometryJson(fresh.geometry);
  if (freshGeometry !== readFileSync(geometryFile, 'utf8'))
    fail(`${GEOMETRY_PATH} differs from the rebuild`);

  /* 8. facts.json against the tree (0.25) */
  checkFacts();

  for (const line of skipped) note(`skipped ${line}`);
  console.log(
    `build-brand --check: ${Object.keys(manifest.files).length} files match the manifest, the rebuild and the facts of SPEC-4 6.4`,
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
  const known = new Set([
    '--check',
    '--capture',
    '--previews',
    '--readme',
    '--facts',
    '--out',
    '--no-card',
  ]);
  for (const [i, flag] of argv.entries())
    if (flag.startsWith('--') && !known.has(flag) && argv[i - 1] !== '--out')
      fail(`unknown flag ${flag}`);
  if (argv.includes('--check')) {
    await check();
    return;
  }
  const outIndex = argv.indexOf('--out');
  const base = outIndex >= 0 ? resolve(ROOT, argv[outIndex + 1] ?? '') : ROOT;
  const only = argv.filter((a) => ['--capture', '--previews', '--readme', '--facts'].includes(a));

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
  if (argv.includes('--previews')) await previews();
  if (argv.includes('--readme')) await readmeLockups();
  if (only.length > 0) {
    /* a flag run rewrites the deterministic outputs (no browser, no python) and the manifest over what is now on disk, then stops */
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

  /* the default build: the deterministic outputs, the outlines when python is here, the card */
  const outputs: Output[] = [];
  const python = venvPython();
  if ('python' in python) {
    const outlines = wordmarkOutlinesSvg(outlineWord(python.python));
    outputs.push({
      path: OUTLINES_PATH,
      bytes: new TextEncoder().encode(outlines),
      kind: 'outlined',
    });
    writeOutputs(base, outputs);
  } else {
    note(
      `${OUTLINES_PATH} not rebuilt: ${python.reason}${existsSync(resolve(ROOT, OUTLINES_PATH)) ? '; the committed file stands' : '; wordmark.svg carries the word as live text'}`,
    );
  }
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
  if (!argv.includes('--no-card')) {
    if (missingTwins.some((m) => m.path.includes('og-screen')))
      note(`the card is not rendered without ${TWIN_PATHS.ogScreen.dark}`);
    else
      await withBrowser(async (launched) => {
        const card = await renderCard(launched);
        outputs.push({ path: CARD_PATH, bytes: card.bytes, kind: 'rendered' });
        writeOutputs(base, [{ path: CARD_PATH, bytes: card.bytes, kind: 'rendered' }]);
        note(
          `card rendered by ${launched.product} ${launched.version} (${launched.executableSource}) on ${launched.renderer}: ${card.colours} colours, ${card.indexed ? 'indexed' : 'truecolor'}`,
        );
      });
  }
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
