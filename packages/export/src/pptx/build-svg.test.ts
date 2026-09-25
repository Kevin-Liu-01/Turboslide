// The vector picture through the PowerPoint builder without a browser (docs/VECTOR.md 4.6, 6.3),
// over scenes built by hand the way the extractor records them: a picture raster carrying the
// asset's vector file travels as its 3x PNG blip (the fallback, whose IHDR width is the box
// times three) with `asvg:svgBlip` beside it, the media part holds the svg's bytes, the content
// type default is written and the package validates; `svgVector: false` writes the PNG alone; in
// the Perfect mode the kit's logo object over the sheet raster carries it too and a block raster
// does not (the sheet raster holds it); a missing or non svg file leaves the PNG alone and the
// residual says so; export check classes the part as `svg`.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { checkPptx } from '../check.ts';
import { countSvgBlips, SVG_BLIP_EXT_URI } from '../ooxml/svg.ts';
import { listParts, openPackage, readPart, readPartBytes } from '../ooxml/zip.ts';
import type { Scene, SceneRaster } from '../scene/types.ts';
import { buildPptx } from './build.ts';
import type { BuildOptions, BuildResult } from './build.ts';
import { loadFontsCatalog } from './fonts-map.ts';

const SVG = new TextEncoder().encode(
  '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="#070707"/></svg>',
);

let work = '';
let png3x = '';
let sheet = '';
let svg = '';
beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'turboslide-build-svg-'));
  mkdirSync(join(work, 'assets'), { recursive: true });
  // the 3x shot of a 40 by 20 box, and a sheet stand in for the Perfect mode
  png3x = join(work, 'p1@3x.png');
  writeFileSync(
    png3x,
    await sharp({ create: { width: 120, height: 60, channels: 4, background: '#ffffff' } })
      .png()
      .toBuffer(),
  );
  sheet = join(work, 'sheet@2x.png');
  writeFileSync(
    sheet,
    await sharp({ create: { width: 32, height: 18, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer(),
  );
  svg = join(work, 'assets', 'art.ab12.svg');
  writeFileSync(svg, SVG);
});
afterAll(() => {
  if (work !== '') rmSync(work, { recursive: true, force: true });
});

function raster(extra: Partial<SceneRaster> & { blockId: string; id: string }): SceneRaster {
  return {
    kind: 'block',
    selector: `[data-block="${extra.blockId}"]`,
    box: [100, 100, 40, 20],
    alpha: true,
    file: png3x,
    scale: 3,
    ...extra,
  };
}

function scene(rasters: SceneRaster[], mode: 'native' | 'flatten'): Scene {
  return {
    slideId: 's1',
    n: 1,
    total: 1,
    theme: 'light',
    kind: 'content',
    title: 'The vector slide',
    sheet: [0, 0, 1600, 900],
    paper: 'rgb(255, 255, 255)',
    ink: 'rgb(7, 7, 7)',
    frame: { rules: [], crosses: [], crossColor: 'rgb(0, 0, 0)' },
    plates: [],
    chips: [],
    texts: [],
    rules: [],
    rects: [],
    rasters,
    blocks: rasters
      .filter((r) => r.kind === 'block')
      .map((r) => ({ blockId: r.blockId, type: 'picture', box: r.box, native: false })),
    fonts: [],
    ...(mode === 'flatten' ? { sheetImage: sheet } : {}),
    warnings: [],
  };
}

const catalog = loadFontsCatalog();

function build(scenes: Scene[], extra: Partial<BuildOptions> = {}): Promise<BuildResult> {
  return buildPptx(scenes, {
    deckId: 'fixture',
    deckTitle: 'The fixture',
    revision: 1,
    theme: 'light',
    mode: 'native',
    fontSet: 'exact',
    fontsCatalog: catalog,
    ...extra,
  });
}

/** The slide part, its rels and the blip targets of the pic named `name`. */
async function readPic(
  bytes: Uint8Array,
  name: string,
): Promise<{ xml: string; pic: string; png?: string; svgPart?: string; types: string }> {
  const zip = await openPackage(bytes);
  const xml = await readPart(zip, 'ppt/slides/slide1.xml');
  const rels = await readPart(zip, 'ppt/slides/_rels/slide1.xml.rels');
  const types = await readPart(zip, '[Content_Types].xml');
  const at = xml.indexOf(`name="${name}"`);
  const start = xml.lastIndexOf('<p:pic>', at);
  const end = xml.indexOf('</p:pic>', at);
  const pic = start >= 0 && end >= 0 ? xml.slice(start, end + '</p:pic>'.length) : '';
  const target = (rId: string | undefined): string | undefined => {
    if (rId === undefined) return undefined;
    const m = new RegExp(`<Relationship Id="${rId}"[^>]*Target="([^"]+)"`).exec(rels);
    return m?.[1] === undefined ? undefined : `ppt/slides/${m[1]}`.replace('slides/../', '');
  };
  const png = target(/<a:blip r:embed="(rId\d+)"/.exec(pic)?.[1]);
  const svgPart = target(/<asvg:svgBlip [^>]*r:embed="(rId\d+)"/.exec(pic)?.[1]);
  return { xml, pic, png, svgPart, types };
}

function ihdrWidth(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(16);
}

describe('the Editable text file (native mode)', () => {
  test('a vector picture carries asvg:svgBlip beside its 3x PNG blip; the package validates; export check counts the svg part', async () => {
    const built = await build([scene([raster({ id: 'p1:1', blockId: 'p1', svg })], 'native')]);
    expect(built.validation.issues).toEqual([]);
    expect(built.counts?.svgBlips).toBe(1);
    expect(built.residual).toContain(
      'svg: 1 picture(s) carry asvg:svgBlip beside the PNG blip (docs/VECTOR.md 4.6); PowerPoint 2016 and later draw the vector, every other viewer the PNG fallback',
    );
    const { pic, png, svgPart, types } = await readPic(built.bytes, 'ts:s1#p1:1');
    expect(pic).toContain(`<a:ext uri="${SVG_BLIP_EXT_URI}"><asvg:svgBlip`);
    expect(countSvgBlips(pic)).toBe(1);
    expect(png).toMatch(/^ppt\/media\/.*\.png$/);
    expect(svgPart).toMatch(/^ppt\/media\/.*\.svg$/);
    expect(types).toContain('<Default Extension="svg" ContentType="image/svg+xml"/>');
    const zip = await openPackage(built.bytes);
    // the fallback is the 3x shot: the PNG signature and the box's width times three
    const fallback = await readPartBytes(zip, png ?? '');
    expect([...fallback.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(ihdrWidth(fallback)).toBe(40 * 3);
    // the vector part holds the file's bytes as stored
    expect(await readPartBytes(zip, svgPart ?? '')).toEqual(SVG);
    const file = join(work, 'native.pptx');
    writeFileSync(file, built.bytes);
    const check = await checkPptx(file, { quickLook: false });
    expect(check.formats['svg']).toBe(1);
    expect(check.valid).toBe(true);
  });

  test('svgVector false writes the PNG blip alone and no svg part', async () => {
    const built = await build([scene([raster({ id: 'p1:1', blockId: 'p1', svg })], 'native')], {
      svgVector: false,
    });
    expect(built.validation.valid).toBe(true);
    expect(built.counts?.svgBlips).toBe(0);
    expect(built.residual).toContain('svg: 1 vector picture(s) travel as PNG alone (svgVector false)');
    const { pic, svgPart, types } = await readPic(built.bytes, 'ts:s1#p1:1');
    expect(countSvgBlips(pic)).toBe(0);
    expect(svgPart).toBeUndefined();
    // pptxgenjs writes the svg default itself; the writer adds none (its "once" rule)
    expect((types.match(/Extension="svg"/g) ?? []).length).toBe(1);
    expect(listParts(await openPackage(built.bytes)).some((p) => p.endsWith('.svg'))).toBe(false);
  });

  test('a raster picture and a picture whose vector file is missing or not an svg stay PNG alone', async () => {
    const missing = join(work, 'assets', 'gone.svg');
    expect(existsSync(missing)).toBe(false);
    const notSvg = join(work, 'assets', 'not.svg');
    writeFileSync(notSvg, 'hello, not markup');
    const built = await build([
      scene(
        [
          raster({ id: 'p1:1', blockId: 'p1' }),
          raster({ id: 'p2:2', blockId: 'p2', svg: missing, box: [200, 100, 40, 20] }),
          raster({ id: 'p3:3', blockId: 'p3', svg: notSvg, box: [300, 100, 40, 20] }),
        ],
        'native',
      ),
    ]);
    expect(built.validation.valid).toBe(true);
    expect(built.counts?.svgBlips).toBe(0);
    expect(built.residual).toContain(
      'svg: s1: ts:s1#p2:2 names a vector file that is missing; the picture travels as PNG alone',
    );
    expect(built.residual).toContain(
      'svg: s1: ts:s1#p3:3 names a vector file that is not an svg; the picture travels as PNG alone',
    );
    expect(built.warnings).toEqual([]);
    expect(listParts(await openPackage(built.bytes)).some((p) => p.endsWith('.svg'))).toBe(false);
  });
});

describe('the Perfect file (flatten mode)', () => {
  test("the kit's logo object over the sheet raster carries the svgBlip; a block raster is the sheet's alone", async () => {
    const built = await build(
      [
        scene(
          [
            raster({ id: 'title-logo:2', blockId: 'title-logo', kind: 'mark', svg }),
            raster({ id: 'p1:1', blockId: 'p1', svg, box: [300, 100, 40, 20] }),
          ],
          'flatten',
        ),
      ],
      { mode: 'flatten' },
    );
    expect(built.validation.issues).toEqual([]);
    expect(built.counts?.svgBlips).toBe(1);
    const logo = await readPic(built.bytes, 'ts:s1#title-logo:2');
    expect(countSvgBlips(logo.pic)).toBe(1);
    expect(logo.svgPart).toMatch(/\.svg$/);
    // the block picture is in the sheet raster and has no object of its own
    expect(logo.xml).not.toContain('name="ts:s1#p1:1"');
    expect(countSvgBlips(logo.xml)).toBe(1);
    expect(logo.xml).toContain('name="ts:s1#sheet"');
  });
});
