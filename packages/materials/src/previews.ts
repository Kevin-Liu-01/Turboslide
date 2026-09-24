// The gallery's stills (docs/FEATURES.md 5.4; audit-shaders 3): one 320 by 200 webp per material
// and one small tile per preset under packages/materials/previews/, rendered once per catalog
// change by `node scripts/build-shader-previews.mjs` at anchor 5500 in the legacy palette (the
// default kit's build in black and white, the gallery's one sentence says so) and committed, the
// way Glyphfield ships `public/shader-previews/` (134 files in about 600 KB). This module names
// the files: `shaderPreviewFile` is the file name every transport reads (`shader.list`), and
// `shaderPreviewUrl` resolves it against this module's location, which Vite turns into a hashed
// asset URL in the client and Node reads as a file URL. Browser safe; no file is read here.
import { materialSlug } from './recipe.ts';

/** The still's pixels: Glyphfield's card size (5.4). */
export const SHADER_PREVIEW_SIZE: readonly [number, number] = [320, 200];

/** The preset tile's pixels: the row of small tiles under a card. */
export const SHADER_PRESET_TILE_SIZE: readonly [number, number] = [96, 60];

/** The anchor every still is rendered at (the brand deck's middle anchor, 5.5 s). */
export const SHADER_PREVIEW_ANCHOR = 5500;

/** The folder under the package, relative to `src/`. */
export const SHADER_PREVIEWS_DIR = '../previews/';

/** The presets that read in black and white, the card's look (5.4: the stills are the default kit's build in black and white). */
const MONOCHROME_PRESETS: ReadonlySet<string> = new Set([
  'ink-paper',
  'paper-ink',
  'diamond',
  'sphere',
  'chrome',
  'noir',
]);

/**
 * The preset a material's card is rendered with: its featured preset when that one reads in ink
 * and paper (the liquid metal's diamond), else the ink ground with paper figures, so every card
 * is black and white and the dialog's sentence holds.
 */
export function cardPresetOf(entry: { featuredPreset?: string | undefined }): string {
  const featured = entry.featuredPreset;
  return featured !== undefined && MONOCHROME_PRESETS.has(featured) ? featured : 'ink-paper';
}

/** `liquid-metal.webp`, `liquid-metal--diamond.webp`. */
export function shaderPreviewFile(materialId: string, preset?: string): string {
  const slug = materialSlug(materialId);
  return preset === undefined ? `${slug}.webp` : `${slug}--${preset}.webp`;
}

/**
 * The URL of a still: in the browser Vite rewrites `new URL(..., import.meta.url)` to the built
 * asset, in Node it is the file URL under the package. A gallery card draws it in an `<img>` and
 * mounts no canvas.
 */
export function shaderPreviewUrl(materialId: string, preset?: string): string {
  return new URL(`${SHADER_PREVIEWS_DIR}${shaderPreviewFile(materialId, preset)}`, import.meta.url)
    .href;
}

/** The index the build script writes beside the files. */
export type ShaderPreviewIndex = {
  generatedAt: string;
  anchor: number;
  size: [number, number];
  tileSize: [number, number];
  entries: { materialId: string; preset?: string; file: string; bytes: number }[];
};
