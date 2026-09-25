// The svgBlip of the OOXML post-process (docs/VECTOR.md 4.6, 6.3): over a package in the shape
// probe (b) read from pptxgenjs, `writeSvgBlip` adds the ext with the svgBlip inside the pic's
// blip, the image relationship, the media part and the content type default once, the package
// validates, a second call on the same pic changes nothing, a pic the part does not hold or a
// shape changes nothing, and a blip that already holds an ext list gains the ext inside it. The
// last test builds one real pptxgenjs package in Node so the blip form the writer matches is the
// generator's own.
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';
import { beforeAll, describe, expect, test } from 'vitest';

import { cleanContentTypes, stripRepairRisks } from './clean.ts';
import { listShapes } from './groups.ts';
import {
  SVG_BLIP_EXT_URI,
  SVG_BLIP_NS,
  addSvgDefault,
  countSvgBlips,
  looksLikeSvg,
  mediaNameFor,
  nextRelationshipId,
  relsPartOf,
  writeSvgBlip,
} from './svg.ts';
import { validatePackage } from './validate.ts';
import { listParts, openPackage, readPart, readPartBytes, writePackage, writePart } from './zip.ts';
import type { Package } from './zip.ts';

const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="#070707"/><circle cx="20" cy="10" r="6" fill="#fff"/></svg>',
);

let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({ create: { width: 120, height: 60, channels: 4, background: '#ffffff' } })
    .png()
    .toBuffer();
});

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

/** A pic in the form pptxgenjs 4.0.1 writes for a PNG (probe (b), slide 2). */
function pic(id: number, name: string, embed: string, blipInner = ''): string {
  return (
    `<p:pic>  <p:nvPicPr><p:cNvPr id="${id}" name="${name}" descr="${name}">    </p:cNvPr>    <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>    <p:nvPr></p:nvPr>  </p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${embed}">${blipInner}</a:blip>  <a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    '<p:spPr> <a:xfrm>  <a:off x="914400" y="914400"/>  <a:ext cx="3657600" cy="1828800"/> </a:xfrm> <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
  );
}

function slideXml(shapes: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld name="Slide 1"><p:spTree>` +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    shapes +
    '</p:spTree></p:cSld></p:sld>'
  );
}

const SP =
  '<p:sp><p:nvSpPr><p:cNvPr id="4" name="ts:s#box"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp>';

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image-1-1.png"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image-1-2.png"/>' +
  '</Relationships>';

const TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
  '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
  '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
  '</Types>';

/** A minimal package holding one slide with two PNG pictures and a shape, valid as it stands. */
async function fixture(slide = slideXml(pic(2, 'ts:s#pic:1', 'rId1') + pic(3, 'ts:s#other:2', 'rId3') + SP)): Promise<{ zip: Package; xml: string }> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', TYPES);
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
  );
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS}/>`);
  zip.file('ppt/slides/slide1.xml', slide);
  zip.file('ppt/slides/_rels/slide1.xml.rels', RELS);
  zip.file('ppt/media/image-1-1.png', PNG);
  zip.file('ppt/media/image-1-2.png', PNG);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const pkg = await openPackage(bytes);
  return { zip: pkg, xml: await readPart(pkg, 'ppt/slides/slide1.xml') };
}

const PART = 'ppt/slides/slide1.xml';

describe('the helpers', () => {
  test('looksLikeSvg reads an svg root after a BOM, a prolog, comments and a doctype, and nothing else', () => {
    const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
    expect(looksLikeSvg(SVG)).toBe(true);
    expect(looksLikeSvg(enc('<?xml version="1.0"?>\n<!-- Figma -->\n<svg xmlns="x"/>'))).toBe(true);
    expect(looksLikeSvg(enc('﻿  <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x"><svg>'))).toBe(true);
    expect(looksLikeSvg(enc('<SVG xmlns="x"/>'))).toBe(true);
    expect(looksLikeSvg(enc('<svgx/>'))).toBe(false);
    expect(looksLikeSvg(enc('hello <svg/>'))).toBe(false);
    expect(looksLikeSvg(enc('<html><svg/></html>'))).toBe(false);
    expect(looksLikeSvg(PNG)).toBe(false);
    expect(looksLikeSvg(new Uint8Array())).toBe(false);
  });

  test('relsPartOf, nextRelationshipId and mediaNameFor', () => {
    expect(relsPartOf('ppt/slides/slide1.xml')).toBe('ppt/slides/_rels/slide1.xml.rels');
    expect(relsPartOf('ppt/slides/slide12.xml')).toBe('ppt/slides/_rels/slide12.xml.rels');
    expect(nextRelationshipId(RELS)).toBe('rId4');
    expect(nextRelationshipId('<Relationships/>')).toBe('rId1');
    expect(mediaNameFor('ts:s1#pic:1')).toBe('ts-s1-pic-1');
    expect(mediaNameFor('ts:title#title-logo:2@g:four')).toBe('ts-title-title-logo-2-g-four');
    expect(mediaNameFor('###')).toBe('vector');
  });

  test('addSvgDefault writes the default after the last one, once, and before </Types> without one', () => {
    const once = addSvgDefault(TYPES);
    expect(once.added).toBe(true);
    expect(once.xml).toContain(
      '<Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Override',
    );
    const twice = addSvgDefault(once.xml);
    expect(twice.added).toBe(false);
    expect((twice.xml.match(/Extension="svg"/g) ?? []).length).toBe(1);
    const bare = addSvgDefault('<Types xmlns="x"></Types>');
    expect(bare.added).toBe(true);
    expect(bare.xml).toBe('<Types xmlns="x"><Default Extension="svg" ContentType="image/svg+xml"/></Types>');
    expect(addSvgDefault('<Types xmlns="x"><Default Extension="SVG" ContentType="image/svg+xml"/></Types>').added).toBe(false);
  });
});

describe('writeSvgBlip (VECTOR.md 4.6, 6.3)', () => {
  test('writes the ext, the rel, the media part and the content type once; the package validates', async () => {
    const { zip, xml } = await fixture();
    const out = await writeSvgBlip(zip, PART, xml, 'ts:s#pic:1', SVG);
    expect(out.written).toBe(true);
    expect(out.media).toBe('ppt/media/ts-s-pic-1.svg');
    // the shape probe (b) read, on the PNG's own blip, the rel id the slide had free
    expect(out.xml).toContain(
      `<a:blip r:embed="rId1"><a:extLst><a:ext uri="${SVG_BLIP_EXT_URI}"><asvg:svgBlip xmlns:asvg="${SVG_BLIP_NS}" r:embed="rId4"/></a:ext></a:extLst></a:blip>`,
    );
    // the other picture and the shape stay as they were
    expect(out.xml).toContain('<a:blip r:embed="rId3"></a:blip>');
    expect(out.xml).toContain(SP);
    expect(countSvgBlips(out.xml)).toBe(1);
    expect(listShapes(out.xml).map((s) => s.name)).toEqual(['ts:s#pic:1', 'ts:s#other:2', 'ts:s#box']);
    const rels = await readPart(zip, 'ppt/slides/_rels/slide1.xml.rels');
    expect(rels).toContain(
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/ts-s-pic-1.svg"/></Relationships>',
    );
    expect(await readPartBytes(zip, 'ppt/media/ts-s-pic-1.svg')).toEqual(SVG);
    const types = await readPart(zip, '[Content_Types].xml');
    expect((types.match(/<Default Extension="svg" ContentType="image\/svg\+xml"\/>/g) ?? []).length).toBe(1);
    writePart(zip, PART, out.xml);
    // the content types clean of the post-process keeps a used default
    await cleanContentTypes(zip);
    expect(await readPart(zip, '[Content_Types].xml')).toContain('Extension="svg"');
    const validation = await validatePackage(zip);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
    // the written package reopens with the svg part stored beside the PNGs
    const reopened = await openPackage(await writePackage(zip));
    expect(listParts(reopened)).toContain('ppt/media/ts-s-pic-1.svg');
  });

  test('a second call on the same pic is idempotent', async () => {
    const { zip, xml } = await fixture();
    const first = await writeSvgBlip(zip, PART, xml, 'ts:s#pic:1', SVG);
    const second = await writeSvgBlip(zip, PART, first.xml, 'ts:s#pic:1', SVG);
    expect(second.written).toBe(false);
    expect(second.media).toBeUndefined();
    expect(second.xml).toBe(first.xml);
    expect(countSvgBlips(second.xml)).toBe(1);
    const rels = await readPart(zip, 'ppt/slides/_rels/slide1.xml.rels');
    expect((rels.match(/\.svg"/g) ?? []).length).toBe(1);
    expect(listParts(zip).filter((p) => p.endsWith('.svg'))).toEqual(['ppt/media/ts-s-pic-1.svg']);
    const types = await readPart(zip, '[Content_Types].xml');
    expect((types.match(/Extension="svg"/g) ?? []).length).toBe(1);
  });

  test('two pictures on one slide take two rels and two media parts', async () => {
    const { zip, xml } = await fixture();
    const first = await writeSvgBlip(zip, PART, xml, 'ts:s#pic:1', SVG);
    const second = await writeSvgBlip(zip, PART, first.xml, 'ts:s#other:2', SVG);
    expect(second.written).toBe(true);
    expect(second.xml).toContain('<a:blip r:embed="rId3"><a:extLst><a:ext uri=');
    expect(second.xml).toContain('r:embed="rId5"/>');
    expect(countSvgBlips(second.xml)).toBe(2);
    expect(listParts(zip).filter((p) => p.endsWith('.svg')).sort()).toEqual([
      'ppt/media/ts-s-other-2.svg',
      'ppt/media/ts-s-pic-1.svg',
    ]);
    writePart(zip, PART, second.xml);
    expect((await validatePackage(zip)).valid).toBe(true);
  });

  test('a pic the part does not hold, a shape, or a slide without a rels part changes nothing', async () => {
    const { zip, xml } = await fixture();
    expect((await writeSvgBlip(zip, PART, xml, 'ts:s#missing', SVG)).written).toBe(false);
    expect((await writeSvgBlip(zip, PART, xml, 'ts:s#box', SVG)).written).toBe(false);
    expect((await writeSvgBlip(zip, 'ppt/slides/slide9.xml', xml, 'ts:s#pic:1', SVG)).written).toBe(false);
    expect(listParts(zip).filter((p) => p.endsWith('.svg'))).toEqual([]);
    expect(await readPart(zip, '[Content_Types].xml')).not.toContain('Extension="svg"');
  });

  test('a blip that already holds an ext list gains the ext inside it', async () => {
    const inner = '<a:extLst><a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi xmlns:a14="x" val="0"/></a:ext></a:extLst>';
    const { zip, xml } = await fixture(slideXml(pic(2, 'ts:s#pic:1', 'rId1', inner)));
    const out = await writeSvgBlip(zip, PART, xml, 'ts:s#pic:1', SVG);
    expect(out.written).toBe(true);
    expect(out.xml).toContain(
      `<a:blip r:embed="rId1"><a:extLst><a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi xmlns:a14="x" val="0"/></a:ext><a:ext uri="${SVG_BLIP_EXT_URI}"><asvg:svgBlip xmlns:asvg="${SVG_BLIP_NS}" r:embed="rId4"/></a:ext></a:extLst></a:blip>`,
    );
    expect((out.xml.match(/<a:extLst>/g) ?? []).length).toBe(1);
  });

  test('over the package pptxgenjs writes for a PNG picture (the generator form of probe (b))', async () => {
    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();
    slide.addImage({
      data: `image/png;base64,${PNG.toString('base64')}`,
      x: 1,
      y: 1,
      w: 2,
      h: 1,
      objectName: 'ts:s1#logo:3',
      altText: 'The mark',
    });
    const raw = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await openPackage(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
    const part = 'ppt/slides/slide1.xml';
    const strip = stripRepairRisks(await readPart(zip, part));
    const out = await writeSvgBlip(zip, part, strip.xml, 'ts:s1#logo:3', SVG);
    expect(out.written).toBe(true);
    expect(out.xml).toMatch(
      /<a:blip r:embed="rId1"><a:extLst><a:ext uri="\{96DAC541-7B7A-43D3-8B79-37D633B846F1\}"><asvg:svgBlip xmlns:asvg="http:\/\/schemas\.microsoft\.com\/office\/drawing\/2016\/SVG\/main" r:embed="rId\d+"\/><\/a:ext><\/a:extLst><\/a:blip>/,
    );
    writePart(zip, part, out.xml);
    await cleanContentTypes(zip);
    const validation = await validatePackage(zip);
    expect(validation.issues).toEqual([]);
    const media = listParts(zip).filter((p) => /^ppt\/media\//.test(p));
    expect(media).toContain('ppt/media/ts-s1-logo-3.svg');
    // the PNG fallback stays the PNG pptxgenjs wrote, never the svg's bytes under a png name
    const png = media.find((p) => p.endsWith('.png'));
    expect(png).toBeDefined();
    const bytes = await readPartBytes(zip, png ?? '');
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
