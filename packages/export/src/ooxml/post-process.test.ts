// The perfect-PPTX post-process without a browser (docs/pptx.md): the repair-risk strip, the
// content types clean, the app.xml titles, the slide name and the hidden title placeholder, and
// the package validation that catches a dangling relationship, an undeclared part and an override
// for a missing part.
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';

import { cleanContentTypes, setAppTitles, stripEmptyExtLst, stripRepairRisks } from './clean.ts';
import { listShapes } from './groups.ts';
import { inPage } from './geometry.ts';
import {
  addHiddenTitle,
  hasTitlePlaceholder,
  readSlideName,
  readTitlePlaceholder,
  setSlideName,
} from './titles.ts';
import { resolveTarget, sourceOfRels, validatePackage } from './validate.ts';
import { openPackage, readPart } from './zip.ts';

const SLIDE =
  '<p:sld xmlns:a="a" xmlns:p="p"><p:cSld name="Slide 3"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="ts:s#h/text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1043940" y="1043940"/><a:ext cx="3000000" cy="400000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:extLst></a:extLst></p:spPr>' +
  '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2640" spc="-66" kern="0"/><a:t>Audience</a:t></a:r></a:p></p:txBody></p:sp>' +
  '</p:spTree></p:cSld></p:sld>';

describe('the repair-risk strip', () => {
  test('removes kern="0" and empty ext lists, counts custGeom', () => {
    const xml = `${SLIDE.replace('<a:extLst></a:extLst>', '<a:extLst></a:extLst><a:extLst/>')}`;
    const out = stripRepairRisks(xml);
    expect(out.kern).toBe(1);
    expect(out.extLst).toBe(2);
    expect(out.custGeom).toBe(0);
    expect(out.xml).not.toContain('kern="0"');
    expect(out.xml).not.toContain('extLst');
    expect(out.xml).toContain('spc="-66"');
    // a populated ext list stays
    const kept = '<a:extLst><a:ext uri="{x}"><y/></a:ext></a:extLst>';
    expect(stripEmptyExtLst(kept)).toBe(kept);
  });
});

describe('slide names and the hidden title', () => {
  test('setSlideName writes the title into cSld and readSlideName reads it back', () => {
    const named = setSlideName(SLIDE, 'Audience & "buyers"');
    expect(named).toContain('<p:cSld name="Audience &amp; &quot;buyers&quot;">');
    expect(readSlideName(named)).toBe('Audience & "buyers"');
    const bare = setSlideName(SLIDE.replace(' name="Slide 3"', ''), 'Plain');
    expect(readSlideName(bare)).toBe('Plain');
  });

  test('addHiddenTitle inserts one hidden title placeholder as the first shape, once', () => {
    const spec = {
      title: 'Audience',
      name: 'ts:s#title',
      off: [1043940, 1043940] as [number, number],
      ext: [3000000, 400000] as [number, number],
      sz: 2640,
      family: 'GT Inter Display',
      colorHex: '070707',
    };
    expect(hasTitlePlaceholder(SLIDE)).toBe(false);
    const out = addHiddenTitle(SLIDE, spec);
    expect(hasTitlePlaceholder(out)).toBe(true);
    expect(readTitlePlaceholder(out)).toBe('Audience');
    expect(out).toContain('name="ts:s#title" hidden="1"');
    expect(out).toContain('<p:ph type="title"/>');
    expect(out).toContain('<a:alpha val="0"/>');
    expect(out).not.toContain('normAutofit');
    const shapes = listShapes(out);
    expect(shapes.map((s) => s.name)).toEqual(['ts:s#title', 'ts:s#h/text']);
    expect(shapes[0]?.id).toBe(3);
    expect(inPage(shapes[0]?.off ?? [0, 0], shapes[0]?.ext ?? [0, 0])).toBe(true);
    // a second call changes nothing
    expect(addHiddenTitle(out, spec)).toBe(out);
  });
});

async function samplePackage(): Promise<JSZip> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="jpg" ContentType="image/jpg"/><Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
  );
  zip.file('ppt/presentation.xml', '<p:presentation/>');
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    '<Relationships><Relationship Id="rId1" Type="x/slide" Target="slides/slide1.xml"/></Relationships>',
  );
  zip.file('ppt/slides/slide1.xml', SLIDE);
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    '<Relationships><Relationship Id="rId1" Type="x/image" Target="../media/image1.png"/><Relationship Id="rId2" Type="x/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>',
  );
  zip.file('ppt/media/image1.png', new Uint8Array([137, 80, 78, 71]));
  zip.file(
    'docProps/app.xml',
    '<Properties><TitlesOfParts><vt:vector size="3" baseType="lpstr"><vt:lpstr>Arial</vt:lpstr><vt:lpstr>Slide 1</vt:lpstr><vt:lpstr>Slide 2</vt:lpstr></vt:vector></TitlesOfParts></Properties>',
  );
  return openPackage(await zip.generateAsync({ type: 'uint8array' }));
}

describe('package validation and the content types clean', () => {
  test('resolves relationship targets against the source part', () => {
    expect(sourceOfRels('_rels/.rels')).toBe('');
    expect(sourceOfRels('ppt/slides/_rels/slide1.xml.rels')).toBe('ppt/slides/slide1.xml');
    expect(resolveTarget('ppt/slides/slide1.xml', '../media/image1.png')).toBe(
      'ppt/media/image1.png',
    );
    expect(resolveTarget('ppt/presentation.xml', 'fonts/font1.fntdata')).toBe(
      'ppt/fonts/font1.fntdata',
    );
    expect(resolveTarget('', 'ppt/presentation.xml')).toBe('ppt/presentation.xml');
    expect(resolveTarget('ppt/slides/slide1.xml', '/ppt/media/x.png')).toBe('ppt/media/x.png');
  });

  test('a clean package validates; the pptxgenjs override for a missing master is removed', async () => {
    const zip = await samplePackage();
    const before = await validatePackage(zip);
    expect(before.valid).toBe(false);
    expect(before.missingOverrides).toEqual(['/ppt/slideMasters/slideMaster2.xml']);
    expect(before.relationships).toBe(4);
    expect(before.invalidRelationships).toEqual([]);
    const cleaned = await cleanContentTypes(zip);
    expect(cleaned.removedOverrides).toEqual(['/ppt/slideMasters/slideMaster2.xml']);
    expect(cleaned.fixedTypes).toEqual(['image/jpg']);
    expect(await readPart(zip, '[Content_Types].xml')).toContain(
      'Extension="jpg" ContentType="image/jpeg"',
    );
    const after = await validatePackage(zip);
    expect(after.valid, after.issues.join('; ')).toBe(true);
  });

  test('a dangling relationship and an undeclared part are issues', async () => {
    const zip = await samplePackage();
    await cleanContentTypes(zip);
    zip.file('ppt/media/image2.webp', new Uint8Array([1]));
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      '<Relationships><Relationship Id="rId1" Type="x/image" Target="../media/missing.png"/><Relationship Id="rId1" Type="x/image" Target="../media/image1.png"/></Relationships>',
    );
    const result = await validatePackage(zip);
    expect(result.valid).toBe(false);
    expect(result.undeclaredParts).toEqual(['ppt/media/image2.webp']);
    expect(result.invalidRelationships).toEqual([
      'ppt/slides/_rels/slide1.xml.rels: rId1 -> ../media/missing.png',
    ]);
    expect(result.issues.some((i) => i.includes('repeats'))).toBe(true);
  });

  test('setAppTitles replaces the Slide N entries in order', async () => {
    const zip = await samplePackage();
    expect(await setAppTitles(zip, ['Audience', 'Voice & tone'])).toBe(2);
    const app = await readPart(zip, 'docProps/app.xml');
    expect(app).toContain('<vt:lpstr>Audience</vt:lpstr><vt:lpstr>Voice &amp; tone</vt:lpstr>');
    expect(app).toContain('<vt:lpstr>Arial</vt:lpstr>');
  });
});
