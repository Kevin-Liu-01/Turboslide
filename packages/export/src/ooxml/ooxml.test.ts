// The OOXML post-process without a browser: kern strip, grpSp grouping by object name, the EOT
// header, the embedded font parts, and stored media in the rewritten package.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';

import {
  EOT_MAGIC,
  EOT_VERSION,
  embedFonts,
  eotWrap,
  listEmbeddedFonts,
  readEotHeader,
  readTtfInfo,
} from './fonts.ts';
import { readAttributes, inPage } from './geometry.ts';
import { countGroups, groupShapes, listShapes } from './groups.ts';
import { countKernZero, stripKern } from './kern.ts';
import { entryMethods, openPackage, readPart, writePackage } from './zip.ts';

const RUN =
  '<a:r><a:rPr lang="en-US" sz="2640" spc="-66" kern="0" dirty="0"><a:solidFill><a:srgbClr val="070707"/></a:solidFill><a:latin typeface="GT Inter Display"/></a:rPr><a:t>Export fidelity</a:t></a:r>';

function sp(
  id: number,
  name: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  body = '',
): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr>${body}</p:sp>`;
}

describe('kern strip (pptx report section 4.5)', () => {
  test('removes kern="0" and nothing else', () => {
    const xml = `<p:txBody><a:p><a:pPr><a:lnSpc><a:spcPts val="2904"/></a:lnSpc></a:pPr>${RUN}</a:p></p:txBody>`;
    expect(countKernZero(xml)).toBe(1);
    const out = stripKern(xml);
    expect(countKernZero(out)).toBe(0);
    expect(out).toContain('spc="-66"');
    expect(out).toContain('<a:spcPts val="2904"/>');
    const attrs = readAttributes(out);
    expect(attrs.sz).toEqual([2640]);
    expect(attrs.spc).toEqual([-66]);
    expect(attrs.spcPts).toEqual([2904]);
  });
});

describe('grpSp grouping (SPEC 8.2)', () => {
  const slide =
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    sp(2, 'ts:s#h', 1000, 1000, 500, 100) +
    sp(3, 'ts:s#rule/0@list/row/0', 1000, 2000, 5000, 0) +
    sp(4, 'ts:s#list/items/0/key@list/row/0', 1000, 1500, 1800, 400) +
    sp(5, 'ts:s#list/items/0/value@list/row/0', 3000, 1500, 3000, 400) +
    sp(6, 'ts:s#rule/1@list/row/1', 1000, 3000, 5000, 0) +
    '</p:spTree>';

  test('lists shapes with ids, names and boxes', () => {
    const shapes = listShapes(slide);
    expect(shapes.map((s) => s.id)).toEqual([2, 3, 4, 5, 6]);
    expect(shapes[1]?.name).toBe('ts:s#rule/0@list/row/0');
    expect(shapes[1]?.ext).toEqual([5000, 0]);
  });

  test('wraps the shapes of a row in one group with the union xfrm; a lone key stays', () => {
    const { xml, groups } = groupShapes(slide);
    expect(groups).toEqual([{ key: 'list/row/0', ids: [3, 4, 5] }]);
    expect(countGroups(xml)).toBe(1);
    expect(xml).toContain('<p:cNvPr id="7" name="list/row/0"/>');
    expect(xml).toContain(
      '<a:off x="1000" y="1500"/><a:ext cx="5000" cy="500"/><a:chOff x="1000" y="1500"/><a:chExt cx="5000" cy="500"/>',
    );
    // the ungrouped shapes keep their order around the group
    expect(xml.indexOf('name="ts:s#h"')).toBeLessThan(xml.indexOf('<p:grpSp>'));
    expect(xml.indexOf('</p:grpSp>')).toBeLessThan(xml.indexOf('name="ts:s#rule/1@list/row/1"'));
    expect(listShapes(xml).length).toBe(5);
  });

  test('page bounds with a one pixel tolerance', () => {
    expect(inPage([0, 0], [12_192_000, 6_858_000])).toBe(true);
    expect(inPage([12_000_000, 0], [200_000, 100])).toBe(false);
    expect(inPage([-7000, 0], [1000, 1000])).toBe(true);
  });
});

/** A static TTF cut from InterVariable by the fonts builder or the test setup, when one exists. */
function anyTtf(): { path: string; bytes: Uint8Array } | undefined {
  const candidates = [
    join(process.cwd(), 'packages/fonts/export'),
    join(process.cwd(), '../fonts/export'),
    process.env.TURBOSLIDE_TEST_TTF_DIR ?? '',
  ].filter(Boolean);
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    const entries = readFileSync(join(dir, 'fonts.json'), 'utf8');
    const first = /"file":\s*"([^"]+\.ttf)"/.exec(entries)?.[1];
    if (first && existsSync(join(dir, first))) {
      const path = join(dir, first);
      return { path, bytes: readFileSync(path) };
    }
  }
  return undefined;
}

describe('EOT wrap and font parts (pptx report section 4.9)', () => {
  const ttf = anyTtf();

  test.skipIf(!ttf)(
    'the EOT header carries the sizes, the version, the magic and the family',
    () => {
      if (!ttf) return;
      const info = readTtfInfo(ttf.bytes);
      expect(info.family.length).toBeGreaterThan(0);
      expect(info.fsType).toBe(0);
      const eot = eotWrap(ttf.bytes, info);
      const header = readEotHeader(eot);
      expect(header.eotSize).toBe(eot.byteLength);
      expect(header.fontDataSize).toBe(ttf.bytes.byteLength);
      expect(header.version).toBe(EOT_VERSION);
      expect(header.magic).toBe(EOT_MAGIC);
      expect(header.family).toBe(info.family);
      expect(Buffer.compare(eot.subarray(eot.byteLength - ttf.bytes.byteLength), ttf.bytes)).toBe(
        0,
      );
    },
  );

  test.skipIf(!ttf)(
    'embedFonts writes the part, the content type, the relationship and the list',
    async () => {
      if (!ttf) return;
      const zip = new JSZip();
      zip.file(
        '[Content_Types].xml',
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
      );
      zip.file(
        'ppt/_rels/presentation.xml.rels',
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="slideMasters/slideMaster1.xml"/></Relationships>',
      );
      zip.file(
        'ppt/presentation.xml',
        '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>',
      );
      const info = readTtfInfo(ttf.bytes);
      const result = await embedFonts(zip, [{ family: info.family, ttf: ttf.bytes }]);
      expect(result.embedded).toEqual([info.family]);
      expect(result.parts).toEqual(['ppt/fonts/font1.fntdata']);
      expect(await readPart(zip, '[Content_Types].xml')).toContain(
        '<Default Extension="fntdata" ContentType="application/x-fontdata"/>',
      );
      expect(await readPart(zip, 'ppt/_rels/presentation.xml.rels')).toContain(
        'relationships/font" Target="fonts/font1.fntdata"',
      );
      const presentation = await readPart(zip, 'ppt/presentation.xml');
      expect(presentation).toMatch(
        /<p:notesSz[^>]*\/><p:embeddedFontLst><p:embeddedFont><p:font typeface="[^"]+" pitchFamily="34" charset="0"\/><p:regular r:id="rIdFont2"\/><\/p:embeddedFont><\/p:embeddedFontLst><p:defaultTextStyle\/>/,
      );
      expect(presentation).toContain('embedTrueTypeFonts="1"');
      expect(await listEmbeddedFonts(zip)).toEqual([info.family]);
      // a second call with the same family adds nothing
      const again = await embedFonts(zip, [{ family: info.family, ttf: ttf.bytes }]);
      expect(again.embedded).toEqual([]);
    },
  );
});

describe('stored media (slides report section 3.3)', () => {
  test('writePackage stores media and font parts and deflates XML', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('ppt/slides/slide1.xml', `<p:sld>${'x'.repeat(2000)}</p:sld>`);
    zip.file(
      'ppt/media/image1.png',
      new Uint8Array(4096).map((_, i) => (i * 7919) % 251),
    );
    zip.file('ppt/fonts/font1.fntdata', new Uint8Array(512));
    const bytes = await writePackage(
      await openPackage(await zip.generateAsync({ type: 'uint8array' })),
    );
    const methods = await entryMethods(bytes);
    expect(methods['ppt/media/image1.png']).toBe('STORE');
    expect(methods['ppt/fonts/font1.fntdata']).toBe('STORE');
    expect(methods['ppt/slides/slide1.xml']).toBe('DEFLATE');
    const back = await openPackage(bytes);
    expect(await readPart(back, 'ppt/slides/slide1.xml')).toContain('x'.repeat(2000));
  });
});
