// The six guards (gslides-parity SPEC-5 5.2, 5.4; R04 9, 10 test 6): a small archive whose entries
// claim a gigabyte is refused before any inflation, a part with a DOCTYPE is refused, a
// `javascript:` link is dropped with a row, a macro enabled package is refused by content type, a
// 21 column table truncates with its row (fixture 03), and a media part cut short lands as its
// poster with a row. Every package here is built in memory with the store's `writeZip`.
import { describe, expect, it } from 'vitest';

import { readZip, writeZip } from '@turboslide/store/zip';
import type { ZipEntry } from '@turboslide/store/zip';

import { fixtureBytes } from './__tests__/unzip.ts';
import { importPptx } from './import-pptx.ts';
import { CONTENT_TYPES, PackageRefusal, openPackage } from './package.ts';
import { PPTX_INFLATE_MAX_BYTES } from './package.ts';
import { importPptxBytes, pptxEntries, readPptxSource } from './read.ts';
import { ROW_CODES } from './report.ts';

const encoder = new TextEncoder();
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

function text(name: string, body: string): ZipEntry {
  return { name, data: encoder.encode(body) };
}

/** A one slide package with one text box carrying a link to `href`, the minimum the reader walks. */
function packageWithLink(
  href: string,
  options: { doctype?: boolean; main?: string } = {},
): ZipEntry[] {
  const main = options.main ?? CONTENT_TYPES.presentation;
  const doctype = options.doctype === true ? '<!DOCTYPE x [<!ENTITY e "boom">]>' : '';
  return [
    text(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="${main}"/><Override PartName="/ppt/slides/slide1.xml" ContentType="${CONTENT_TYPES.slide}"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CONTENT_TYPES.slideLayout}"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CONTENT_TYPES.slideMaster}"/><Override PartName="/ppt/theme/theme1.xml" ContentType="${CONTENT_TYPES.theme}"/></Types>`,
    ),
    text(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    ),
    text(
      'ppt/presentation.xml',
      `<p:presentation xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    ),
    text(
      'ppt/_rels/presentation.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${R}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`,
    ),
    text(
      'ppt/slides/slide1.xml',
      `${doctype}<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld name="Guards"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Linked box"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="4572000" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1800"><a:hlinkClick r:id="rId2"/></a:rPr><a:t>A link</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    ),
    text(
      'ppt/slides/_rels/slide1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${R}/hyperlink" Target="${href}" TargetMode="External"/></Relationships>`,
    ),
    text(
      'ppt/slideLayouts/slideLayout1.xml',
      `<p:sldLayout xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>`,
    ),
    text(
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    ),
    text(
      'ppt/slideMasters/slideMaster1.xml',
      `<p:sldMaster xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
    ),
    text(
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${R}/theme" Target="../theme/theme1.xml"/></Relationships>`,
    ),
    text(
      'ppt/theme/theme1.xml',
      `<a:theme xmlns:a="${A}" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
    ),
  ];
}

describe('the guards', () => {
  it('refuses a small archive whose entries claim a gigabyte before any inflation', () => {
    const zip = writeZip([{ name: 'ppt/big.bin', data: new Uint8Array(2048) }], { level: 9 });
    // the central directory's uncompressed size claims 1 GiB (the zip bomb shape)
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let patched = 0;
    for (let i = 0; i + 30 <= zip.byteLength; i += 1) {
      const signature = view.getUint32(i, true);
      if (signature === 0x02014b50) {
        view.setUint32(i + 24, 0x40000000, true);
        patched += 1;
      } else if (signature === 0x04034b50) {
        view.setUint32(i + 22, 0x40000000, true);
        patched += 1;
      }
    }
    expect(patched).toBe(2);
    expect(zip.byteLength).toBeLessThan(2048);
    expect(() => readZip(zip, { maxTotalBytes: PPTX_INFLATE_MAX_BYTES })).toThrow(TypeError);
    expect(() => pptxEntries(zip, 'bomb.pptx')).toThrow(PackageRefusal);
  });

  it('refuses a part with a DOCTYPE before the parser runs', async () => {
    const entries = packageWithLink('https://example.com', { doctype: true });
    await expect(importPptx(entries, { fileName: 'doctype.pptx' })).rejects.toThrow(/DOCTYPE/);
  });

  it('drops a javascript: link with a row and keeps the text', async () => {
    const document = await importPptx(packageWithLink('javascript:alert(1)'), {
      fileName: 'link.pptx',
      now: () => 'x',
    });
    const slide = document.slides[0];
    const block = slide?.kind === 'content' ? slide.slots.main?.[0] : undefined;
    expect(block?.type).toBe('text');
    if (block?.type === 'text') {
      expect(block.text).toBe('A link');
      expect(block.text).not.toContain('javascript');
    }
    const row = document.report.rows.find((r) => r.code === ROW_CODES.textLink);
    expect(row?.status).toBe('dropped');
    expect(row?.message).toContain('javascript:alert(1)');
    const https = await importPptx(packageWithLink('https://turboslide.vercel.app'), {
      fileName: 'link.pptx',
      now: () => 'x',
    });
    const kept = https.slides[0]?.kind === 'content' ? https.slides[0].slots.main?.[0] : undefined;
    expect(kept?.type === 'text' ? kept.text : '').toBe('[A link](https://turboslide.vercel.app)');
  });

  it('refuses a macro enabled package by its content type', () => {
    const entries = packageWithLink('https://example.com', {
      main: 'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml',
    });
    expect(() => openPackage(entries, { fileName: 'macros.pptm' })).toThrow(PackageRefusal);
    try {
      openPackage(entries, { fileName: 'macros.pptm' });
    } catch (error) {
      expect((error as PackageRefusal).code).toBe('macro');
    }
  });

  it('truncates a 21 column table to 20 with its row (fixture 03)', async () => {
    const document = await importPptxBytes(fixtureBytes('03-pictures-tables.pptx'), {
      fileName: '03.pptx',
      now: () => 'x',
    });
    const slide = document.slides[1];
    const wide =
      slide?.kind === 'content'
        ? (slide.slots.main ?? []).find((block) => block.id === 'wide-table')
        : undefined;
    expect(wide?.type === 'table' ? wide.columns.length : 0).toBe(20);
    expect(wide?.type === 'table' ? wide.rows.every((row) => row.cells.length === 20) : false).toBe(
      true,
    );
    const row = document.report.rows.find((r) => r.code === ROW_CODES.tableColumns);
    expect(row?.status).toBe('substituted');
    expect(row?.message).toContain('21 by 2');
    const dropped = await importPptxBytes(fixtureBytes('03-pictures-tables.pptx'), {
      fileName: '03.pptx',
      now: () => 'x',
      truncateTables: false,
    });
    const gone =
      dropped.slides[1]?.kind === 'content'
        ? (dropped.slides[1].slots.main ?? []).find((block) => block.id === 'wide-table')
        : undefined;
    expect(gone).toBeUndefined();
    expect(dropped.report.rows.find((r) => r.code === ROW_CODES.tableColumns)?.status).toBe(
      'dropped',
    );
  });

  it('shows a media file cut short as its poster with a row (fixture 04)', async () => {
    const entries = pptxEntries(fixtureBytes('04-charts-motion-media.pptx'), '04.pptx');
    const cut = entries.map((entry) =>
      entry.name.startsWith('ppt/media/media1')
        ? { ...entry, data: entry.data.subarray(0, 64) }
        : entry,
    );
    const document = await importPptx(cut, { fileName: 'cut.pptx', now: () => 'x' });
    const media = document.slides[3];
    const blocks = media?.kind === 'content' ? (media.slots.main ?? []) : [];
    const poster = blocks.find((block) => block.ext?.pptxMediaPoster === true);
    expect(poster?.type).toBe('picture');
    const row = document.report.rows.find(
      (r) => r.code === ROW_CODES.mediaFormat && r.status === 'substituted',
    );
    expect(row).toBeDefined();
    expect(Object.keys(document.deck.media ?? {})).toHaveLength(1);
  });

  it('refuses a binary .ppt and a file that is not a zip by signature, and a data: URL over the cap', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(() => pptxEntries(ole, 'old.ppt')).toThrow(PackageRefusal);
    expect(() => pptxEntries(encoder.encode('not a zip at all'), 'text.pptx')).toThrow(
      PackageRefusal,
    );
    expect(() =>
      readPptxSource('data:application/octet-stream;base64,AAAA', { allowPaths: false }),
    ).not.toThrow();
    expect(() => readPptxSource('/etc/hosts', { allowPaths: false })).toThrow(TypeError);
  });
});
