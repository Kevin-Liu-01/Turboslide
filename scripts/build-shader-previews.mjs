#!/usr/bin/env node
// The gallery's stills (docs/FEATURES.md 5.4; audit-shaders 3): one 320 by 200 webp per material
// and one 96 by 60 tile per preset under packages/materials/previews/, rendered once per catalog
// change and committed, the way Glyphfield ships public/shader-previews/. Every still is the
// material at anchor 5500 in the legacy palette (the default kit's build in black and white, the
// gallery's one sentence says so; a kit's colours reach the shader on the slide, never the card),
// drawn by the product's own capture browser (@turboslide/headless/launch through
// playwright-core, the same page @turboslide/materials/capture serves) at 2x and encoded to webp
// by sharp (a root devDependency). The index beside the files names every still with its bytes.
//
//   node scripts/build-shader-previews.mjs            renders every still and writes the index
//   node scripts/build-shader-previews.mjs --check    exits 1 when a catalog entry or a preset has
//                                                     no still, or a still has no entry
//   node scripts/build-shader-previews.mjs --only paper:liquid-metal,paper:gem-smoke
//
// Run from the repository root with Node 24 (type stripping, no build step). Nothing here touches
// a deck or a store.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages/materials/previews');
const INDEX = join(OUT, 'index.json');

const { MATERIALS, GALLERY_MATERIAL_IDS } = await import('../packages/materials/src/catalog.ts');
const {
  SHADER_PREVIEW_ANCHOR,
  SHADER_PREVIEW_SIZE,
  SHADER_PRESET_TILE_SIZE,
  cardPresetOf,
  shaderPreviewFile,
} = await import('../packages/materials/src/previews.ts');
const { CAPTURE_ORIGIN, mountInPage, noiseTextureSrc, paperDistDir, servePaper } =
  await import('../packages/materials/src/capture.ts');
const { fragmentShaderExport, mipmapsFor, textureSources, toShaderUniforms } =
  await import('../packages/materials/src/paper.ts');
const { resolveRecipe } = await import('../packages/materials/src/recipe.ts');
const { launchBrowser } = await import('../packages/headless/src/launch.ts');

const args = process.argv.slice(2);
const check = args.includes('--check');
const onlyAt = args.indexOf('--only');
const only = onlyAt === -1 ? null : new Set((args[onlyAt + 1] ?? '').split(',').filter(Boolean));

/** Every still the catalog asks for: the material's card and one tile per preset. */
function wanted() {
  const rows = [];
  for (const id of GALLERY_MATERIAL_IDS) {
    const entry = MATERIALS[id];
    if (entry === undefined) continue;
    rows.push({
      materialId: id,
      preset: undefined,
      file: shaderPreviewFile(id),
      size: SHADER_PREVIEW_SIZE,
    });
    for (const preset of entry.presets)
      rows.push({
        materialId: id,
        preset: preset.name,
        file: shaderPreviewFile(id, preset.name),
        size: SHADER_PRESET_TILE_SIZE,
      });
  }
  return rows;
}

if (check) {
  const rows = wanted();
  const present = new Set(
    existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('.webp')) : [],
  );
  const missing = rows.filter((row) => !present.has(row.file)).map((row) => row.file);
  const extra = [...present].filter((file) => !rows.some((row) => row.file === file));
  if (missing.length > 0 || extra.length > 0) {
    if (missing.length > 0) console.error(`missing stills: ${missing.join(', ')}`);
    if (extra.length > 0) console.error(`stills with no catalog entry: ${extra.join(', ')}`);
    process.exit(1);
  }
  console.log(`shader previews: ${rows.length} stills present`);
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
const rows = wanted().filter((row) => only === null || only.has(row.materialId));
const launched = await launchBrowser();
const started = performance.now();
const written = [];
try {
  const noise = noiseTextureSrc();
  /* one page per material at the card's 2x, the presets at the tile's 2x; a still is the card's
     render resampled, so a card and its tiles agree */
  const byMaterial = new Map();
  for (const row of rows) {
    const list = byMaterial.get(row.materialId) ?? [];
    list.push(row);
    byMaterial.set(row.materialId, list);
  }
  for (const [materialId, list] of byMaterial) {
    const entry = MATERIALS[materialId];
    const renderSize = [SHADER_PREVIEW_SIZE[0] * 2, SHADER_PREVIEW_SIZE[1] * 2];
    for (const row of list) {
      // the card reads in black and white (the featured preset when it does, else ink and paper)
      const preset = row.preset ?? cardPresetOf(entry);
      const resolved = resolveRecipe(entry, { preset });
      const context = await launched.browser.newContext({
        viewport: { width: renderSize[0] / 2, height: renderSize[1] / 2 },
        deviceScaleFactor: 2,
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        await servePaper(page, paperDistDir(), renderSize);
        await page.goto(`${CAPTURE_ORIGIN}/capture.html`, { waitUntil: 'load' });
        await mountInPage(page, {
          shaderExport: fragmentShaderExport(entry),
          uniforms: toShaderUniforms(entry, resolved.uniforms),
          textures: textureSources(entry, noise),
          mipmaps: mipmapsFor(entry),
          frame: SHADER_PREVIEW_ANCHOR,
          width: renderSize[0],
          height: renderSize[1],
          maxPixelCount: renderSize[0] * renderSize[1] + 1,
        });
        const png = await page
          .locator('#host canvas')
          .screenshot({ type: 'png', animations: 'disabled' });
        const webp = await sharp(png)
          .resize(row.size[0], row.size[1], { fit: 'cover' })
          .webp({ quality: row.preset === undefined ? 82 : 74, effort: 6 })
          .toBuffer();
        const target = join(OUT, row.file);
        rmSync(target, { force: true });
        writeFileSync(target, webp);
        written.push({
          materialId: row.materialId,
          ...(row.preset === undefined ? {} : { preset: row.preset }),
          file: row.file,
          bytes: webp.byteLength,
        });
        console.log(`${row.file} ${webp.byteLength} bytes`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await launched.close();
}

/* the index: what exists after this run, merged with the rows an --only run left alone */
const previous = existsSync(INDEX) ? (JSON.parse(readFileSync(INDEX, 'utf8')).entries ?? []) : [];
const keep = previous.filter(
  (row) => !written.some((w) => w.file === row.file) && existsSync(join(OUT, row.file)),
);
const entries = [...keep, ...written].sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(
  INDEX,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      anchor: SHADER_PREVIEW_ANCHOR,
      size: [...SHADER_PREVIEW_SIZE],
      tileSize: [...SHADER_PRESET_TILE_SIZE],
      renderer: launched.renderer,
      entries,
    },
    null,
    2,
  )}\n`,
);
const total = entries.reduce((n, row) => n + row.bytes, 0);
console.log(
  `shader previews: ${written.length} written, ${entries.length} in the index, ${total} bytes, ${Math.round((performance.now() - started) / 1000)} s`,
);
