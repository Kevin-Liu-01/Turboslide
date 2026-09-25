// The adjust values through the PowerPoint builder without a browser (SPEC-2 2.3.2; the vector
// round's fix round, VERIFICATION.md "Vector round, pass 1" finding 1), over scenes built by hand
// the way the extractor records them: a rounded rectangle preset travels as `shape: 'roundRect'`
// without `preset` and without `radius` (it is drawn as a path, so no `rx` reaches the measure),
// and its adjust reaches the file as `<a:gd name="adj">` the way a star's or a callout's does; a
// rounded rectangle at the default keeps the empty list PowerPoint reads as its own default; a
// legacy one carrying a corner radius keeps the `adj` pptxgenjs writes from it.
import { describe, expect, test } from 'vitest';

import { openPackage, readPart } from '../ooxml/zip.ts';
import type { Scene, SceneRect } from '../scene/types.ts';
import { buildPptx } from './build.ts';
import type { BuildResult } from './build.ts';
import { loadFontsCatalog } from './fonts-map.ts';

const FILL = 'rgb(170, 51, 102)';

function rect(extra: Partial<SceneRect> & { blockId: string; box: SceneRect['box'] }): SceneRect {
  return { fill: FILL, role: 'shape', ...extra };
}

function scene(rects: SceneRect[]): Scene {
  return {
    slideId: 's1',
    n: 1,
    total: 1,
    theme: 'light',
    kind: 'content',
    title: 'The adjust slide',
    sheet: [0, 0, 1600, 900],
    paper: 'rgb(255, 255, 255)',
    ink: 'rgb(7, 7, 7)',
    frame: { rules: [], crosses: [], crossColor: 'rgb(0, 0, 0)' },
    plates: [],
    chips: [],
    texts: [],
    rules: [],
    rects,
    rasters: [],
    blocks: rects.map((r) => ({
      blockId: r.blockId ?? '',
      type: 'shape',
      box: r.box,
      native: true,
    })),
    fonts: [],
    warnings: [],
  };
}

const catalog = loadFontsCatalog();

function build(scenes: Scene[]): Promise<BuildResult> {
  return buildPptx(scenes, {
    deckId: 'fixture',
    deckTitle: 'The fixture',
    revision: 1,
    theme: 'light',
    mode: 'native',
    fontSet: 'exact',
    fontsCatalog: catalog,
  });
}

/** The `a:prstGeom` element of the shape named `name` in the slide part. */
function geometryOf(xml: string, name: string): string | undefined {
  const at = xml.indexOf(`name="${name}"`);
  if (at < 0) return undefined;
  const end = xml.indexOf('</p:sp>', at);
  const sp = xml.slice(at, end < 0 ? undefined : end);
  return /<a:prstGeom prst="[^"]*">[\s\S]*?<\/a:prstGeom>/.exec(sp)?.[0];
}

describe('the adjust values of the Editable text file (SPEC-2 2.3.2)', () => {
  test('a rounded rectangle preset with an adjust and no preset field carries adj; the default keeps an empty list; a star travels as before', async () => {
    const built = await build([
      scene([
        rect({
          blockId: 'rounded',
          box: [100, 100, 240, 160],
          shape: 'roundRect',
          adjust: [50000],
        }),
        rect({ blockId: 'plain', box: [400, 100, 240, 160], shape: 'roundRect' }),
        rect({ blockId: 'star', box: [700, 100, 240, 160], preset: 'star5', adjust: [30000] }),
        rect({ blockId: 'box', box: [1000, 100, 240, 160], adjust: [1] }),
      ]),
    ]);
    expect(built.validation.issues).toEqual([]);
    expect(built.counts?.avLst).toBe(2);
    const zip = await openPackage(built.bytes);
    const xml = await readPart(zip, 'ppt/slides/slide1.xml');
    expect(geometryOf(xml, 'ts:s1#rounded')).toBe(
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>',
    );
    expect(geometryOf(xml, 'ts:s1#plain')).toMatch(
      /^<a:prstGeom prst="roundRect"><a:avLst\s*(\/>|><\/a:avLst>)<\/a:prstGeom>$/,
    );
    expect(geometryOf(xml, 'ts:s1#star')).toMatch(
      /^<a:prstGeom prst="star5"><a:avLst><a:gd name="adj" fmla="val 30000"\/>/,
    );
    // a plain rectangle has no guides and carries no list entry whatever its adjust holds
    expect(geometryOf(xml, 'ts:s1#box')).toMatch(
      /^<a:prstGeom prst="rect"><a:avLst\s*(\/>|><\/a:avLst>)<\/a:prstGeom>$/,
    );
  });

  test('a legacy rounded rectangle with a corner radius keeps the adj pptxgenjs writes from it, and an adjust beside it wins', async () => {
    const built = await build([
      scene([
        rect({ blockId: 'legacy', box: [100, 100, 240, 160], shape: 'roundRect', radius: 24 }),
        rect({
          blockId: 'both',
          box: [400, 100, 240, 160],
          shape: 'roundRect',
          radius: 24,
          adjust: [40000],
        }),
      ]),
    ]);
    expect(built.validation.issues).toEqual([]);
    expect(built.counts?.avLst).toBe(1);
    const zip = await openPackage(built.bytes);
    const xml = await readPart(zip, 'ppt/slides/slide1.xml');
    // 24 px over the shorter side of 160 px is 15000 of 100000
    expect(geometryOf(xml, 'ts:s1#legacy')).toBe(
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 15000"/></a:avLst></a:prstGeom>',
    );
    expect(geometryOf(xml, 'ts:s1#both')).toBe(
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 40000"/></a:avLst></a:prstGeom>',
    );
  });
});
