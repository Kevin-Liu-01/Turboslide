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
import { listShapes } from './groups.ts';
import { countKernZero, stripKern } from './kern.ts';
import {
  countAltTexts,
  countConnectors,
  toConnector,
  writeAdjustValues,
  writeAltText,
  writeColumns,
} from './shapes.ts';
import { entryMethods, openPackage, readPart, writePackage } from './zip.ts';

const RUN =
  '<a:r><a:rPr lang="en-US" sz="2640" spc="-66" kern="0" dirty="0"><a:solidFill><a:srgbClr val="070707"/></a:solidFill><a:latin typeface="GT Inter Display"/></a:rPr><a:t>Export fidelity</a:t></a:r>';

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

describe('page bounds (gslides-parity SPEC-2 0.96)', () => {
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

describe('the shape rewrites of gslides-parity SPEC-2 2.2.10, 2.3.2, 2.4.7', () => {
  const geom = (prst: string, avLst = '<a:avLst/>'): string =>
    `<a:prstGeom prst="${prst}">${avLst}</a:prstGeom>`;
  const shape = (id: number, name: string, body: string, text = ''): string =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm>${body}</p:spPr>${text}</p:sp>`;
  const textBody =
    '<p:txBody><a:bodyPr wrap="square" lIns="0" rtlCol="0" anchor="t"><a:normAutofit/></a:bodyPr><a:p><a:r><a:t>x</a:t></a:r></a:p></p:txBody>';

  test('writes the adjust values of a preset into its avLst', () => {
    const part = `<p:spTree>${shape(2, 'ts:s#callout', geom('wedgeRectCallout'))}${shape(3, 'ts:s#other', geom('rect'))}</p:spTree>`;
    const { xml, written } = writeAdjustValues(
      part,
      'ts:s#callout',
      ['adj1', 'adj2'],
      [-30000, 70000],
    );
    expect(written).toBe(true);
    expect(xml).toContain(
      '<a:prstGeom prst="wedgeRectCallout"><a:avLst><a:gd name="adj1" fmla="val -30000"/><a:gd name="adj2" fmla="val 70000"/></a:avLst></a:prstGeom>',
    );
    expect(xml).toContain('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>');
    expect(writeAdjustValues(part, 'ts:s#missing', ['adj1'], [1]).written).toBe(false);
    // a rounded rectangle's own adj is replaced, not doubled
    const rounded = `<p:spTree>${shape(2, 'ts:s#r', geom('roundRect', '<a:avLst><a:gd name="adj" fmla="val 16667"/></a:avLst>'))}</p:spTree>`;
    expect(writeAdjustValues(rounded, 'ts:s#r', ['adj'], [50000]).xml).toContain(
      '<a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst>',
    );
  });

  test('writes numCol and spcCol on the text box body', () => {
    const part = `<p:spTree>${shape(2, 'ts:s#p1/text', geom('rect'), textBody)}</p:spTree>`;
    const { xml, written } = writeColumns(part, 'ts:s#p1/text', 2, 304_800);
    expect(written).toBe(true);
    expect(xml).toContain(
      '<a:bodyPr wrap="square" lIns="0" rtlCol="0" anchor="t" numCol="2" spcCol="304800">',
    );
    expect(writeColumns(part, 'ts:s#p1/text', 1, 304_800).written).toBe(false);
  });

  test('rewrites an attached line as a connector with stCxn and endCxn on its targets', () => {
    const part =
      '<p:spTree>' +
      shape(2, 'ts:s#a', geom('rect'), textBody) +
      shape(3, 'ts:s#b@g:four', geom('rect')) +
      shape(4, 'ts:s#elbow', geom('bentConnector3'), textBody) +
      '</p:spTree>';
    const { xml, written } = toConnector(part, 'ts:s#elbow', {
      start: { name: 'ts:s#a', site: 3 },
      end: { name: 'ts:s#b', site: 1 },
    });
    expect(written).toBe(true);
    expect(xml).toContain(
      '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="4" name="ts:s#elbow"/><p:cNvCxnSpPr><a:stCxn id="2" idx="3"/><a:endCxn id="3" idx="1"/></p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>',
    );
    expect(xml).toContain('</p:cxnSp>');
    // the connector carries no text body; the targets keep theirs
    expect((xml.match(/<p:txBody>/g) ?? []).length).toBe(1);
    expect(countConnectors(xml)).toBe(1);
    expect(listShapes(xml).map((s) => s.id)).toEqual([2, 3, 4]);
    // a target the part does not hold leaves the shape as it was
    expect(toConnector(part, 'ts:s#elbow', { end: { name: 'ts:s#nope', site: 0 } }).written).toBe(
      false,
    );
  });

  test('writes a block alt text as descr on a shape or text box (2.5.6)', () => {
    const part = `<p:spTree>${shape(2, 'ts:s#padded', geom('roundRect'), textBody)}${shape(3, 'ts:s#other', geom('rect'))}</p:spTree>`;
    const { xml, written } = writeAltText(
      part,
      'ts:s#padded',
      'A rounded rectangle holding a "label" & more',
    );
    expect(written).toBe(true);
    expect(xml).toContain(
      '<p:cNvPr id="2" name="ts:s#padded" descr="A rounded rectangle holding a &quot;label&quot; &amp; more"/>',
    );
    expect(xml).toContain('<p:cNvPr id="3" name="ts:s#other"/>');
    expect(countAltTexts(xml)).toBe(1);
    // an existing descr is replaced, an empty alt writes nothing, a missing shape changes nothing
    expect(writeAltText(xml, 'ts:s#padded', 'Second').xml).toContain('descr="Second"/>');
    expect(writeAltText(part, 'ts:s#padded', '').written).toBe(false);
    expect(writeAltText(part, 'ts:s#missing', 'x').written).toBe(false);
    // the connector rewrite keeps a descr written before it
    const attached = toConnector(
      `<p:spTree>${shape(2, 'ts:s#a', geom('rect'))}${writeAltText(shape(4, 'ts:s#elbow', geom('bentConnector3')), 'ts:s#elbow', 'An elbow').xml}</p:spTree>`,
      'ts:s#elbow',
      { start: { name: 'ts:s#a', site: 3 } },
    );
    expect(attached.xml).toContain('<p:cNvPr id="4" name="ts:s#elbow" descr="An elbow"/>');
  });
});
