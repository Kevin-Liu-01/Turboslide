// The package layer over fixture 01-text (R04 3, 9, 10): the parts, the content types, the
// relationships, the validation, the presentation walk and the refusals.
import { describe, expect, it } from 'vitest';

import { fixtureBytes, fixtureEntries } from './__tests__/unzip.ts';
import {
  CONTENT_TYPES,
  MACRO_CONTENT_TYPES,
  PackageRefusal,
  PPTX_MAX_BYTES,
  REL,
  openPackage,
  readPresentation,
  refuseBySignature,
  relsPathOf,
  resolveTarget,
  shapeTree,
  sniffPackage,
  sourceOfRels,
  validatePackage,
} from './package.ts';
import type { PackageEntry } from './package.ts';
import { attr, child, descendants } from './xml.ts';

const encoder = new TextEncoder();

function entry(name: string, text: string): PackageEntry {
  return { name, data: encoder.encode(text) };
}

const CONTENT_TYPES_XML = (main: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="${main}"/></Types>`;
const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>';
const PRESENTATION =
  '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst/><p:sldSz cx="9144000" cy="6858000"/></p:presentation>';

function minimalPackage(main: string = CONTENT_TYPES.presentation): PackageEntry[] {
  return [
    entry('[Content_Types].xml', CONTENT_TYPES_XML(main)),
    entry('_rels/.rels', ROOT_RELS),
    entry('ppt/presentation.xml', PRESENTATION),
  ];
}

describe('fixture 01-text', () => {
  const pkg = openPackage(fixtureEntries('01-text.pptx'), { fileName: '01-text.pptx' });

  it('lists the parts with their content types and follows the relationships by name', () => {
    expect(pkg.parts()).toContain('ppt/presentation.xml');
    expect(pkg.contentTypeOf('ppt/presentation.xml')).toBe(CONTENT_TYPES.presentation);
    expect(pkg.contentTypeOf('ppt/slides/slide1.xml')).toBe(CONTENT_TYPES.slide);
    expect(pkg.contentTypeOf('ppt/slides/_rels/slide1.xml.rels')).toBe(
      'application/vnd.openxmlformats-package.relationships+xml',
    );
    expect(pkg.partsOfType(CONTENT_TYPES.slide)).toEqual([
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
      'ppt/slides/slide3.xml',
    ]);
    expect(pkg.partsOfType(CONTENT_TYPES.theme)).toEqual([
      'ppt/theme/theme1.xml',
      'ppt/theme/theme2.xml',
    ]);
    expect(pkg.presentationPart()).toBe('ppt/presentation.xml');
    // slide 1 to its layout and its notes; slide 2 to its layout, the URL and the jump target
    expect(pkg.firstRelated('ppt/slides/slide1.xml', REL.slideLayout)).toBe(
      'ppt/slideLayouts/slideLayout1.xml',
    );
    expect(pkg.firstRelated('ppt/slides/slide1.xml', REL.notesSlide)).toBe(
      'ppt/notesSlides/notesSlide1.xml',
    );
    expect(pkg.firstRelated('ppt/slideLayouts/slideLayout1.xml', REL.slideMaster)).toBe(
      'ppt/slideMasters/slideMaster1.xml',
    );
    expect(pkg.firstRelated('ppt/slideMasters/slideMaster1.xml', REL.theme)).toBe(
      'ppt/theme/theme1.xml',
    );
    const rels = pkg.relationships('ppt/slides/slide2.xml');
    const link = rels.find((rel) => rel.type === REL.hyperlink);
    expect(link).toMatchObject({ mode: 'External', target: 'https://turboslide.vercel.app' });
    expect(link?.part).toBeUndefined();
    const jump = rels.find((rel) => rel.type === REL.slide);
    expect(jump).toMatchObject({ mode: 'Internal', part: 'ppt/slides/slide3.xml' });
    expect(pkg.target('ppt/slides/slide2.xml', jump?.id ?? '')).toBe('ppt/slides/slide3.xml');
    expect(pkg.target('ppt/slides/slide2.xml', 'rId99')).toBeUndefined();
  });

  it('passes the Open Packaging Conventions validation', () => {
    const validation = validatePackage(pkg);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
    expect(validation.parts).toBe(pkg.parts().length);
    expect(validation.relationships).toBeGreaterThan(20);
  });

  it('reads the presentation part: the slide order, the hidden slide, the size, the sections, the producer', () => {
    const info = readPresentation(pkg);
    expect(info.part).toBe('ppt/presentation.xml');
    expect(info.slides.map((s) => [s.index, s.part, s.hidden])).toEqual([
      [1, 'ppt/slides/slide1.xml', false],
      [2, 'ppt/slides/slide2.xml', false],
      [3, 'ppt/slides/slide3.xml', true],
    ]);
    expect(info.slides.map((s) => s.id)).toEqual([256, 257, 258]);
    expect(info.size).toEqual({ cx: 12_192_000, cy: 6_858_000 });
    expect(info.notesSize).toEqual({ cx: 6_858_000, cy: 9_144_000 });
    expect(info.sections).toEqual([
      { id: '{4A3B2C1D-0001-4000-8000-000000000001}', name: 'Opening', slideIds: [256] },
      { id: '{4A3B2C1D-0002-4000-8000-000000000002}', name: 'Body', slideIds: [257, 258] },
    ]);
    expect(info.masters).toEqual(['ppt/slideMasters/slideMaster1.xml']);
    // theme2.xml is the notes master's theme, a part the notes slide brought in; every part lists (SPEC-5 0.28)
    expect(info.themes).toEqual(['ppt/theme/theme1.xml', 'ppt/theme/theme2.xml']);
    expect(info.defaultTextStyle).toBeDefined();
    expect(info.embeddedFonts).toEqual([]);
    expect(info.modifyVerifier).toBe(false);
    expect(info.producer.application).toBe('python-pptx');
    expect(info.title).toBe('Import fixture 01 text');
  });

  it('parses every part once and caches the document', () => {
    const first = pkg.xml('ppt/slides/slide2.xml');
    expect(pkg.xml('ppt/slides/slide2.xml')).toBe(first);
    const root = pkg.root('ppt/slides/slide2.xml');
    const cSld = child(root, 'p', 'cSld');
    expect(cSld && attr(cSld, 'name')).toBe('Runs and lists');
    const tree = shapeTree(root);
    expect(tree).toBeDefined();
    expect(descendants(root, 'a', 'buAutoNum')).toHaveLength(3);
  });

  it('refuses nothing by signature for the fixture', () => {
    const bytes = fixtureBytes('01-text.pptx');
    expect(sniffPackage(bytes)).toBe('zip');
    expect(() => refuseBySignature(bytes, '01-text.pptx')).not.toThrow();
  });
});

describe('the refusals (R04 9)', () => {
  it('refuses the OLE signature (a .ppt or an encrypted package) and a file that is not a zip', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(sniffPackage(ole)).toBe('ole');
    expect(() => refuseBySignature(ole, 'old.ppt')).toThrow(PackageRefusal);
    try {
      refuseBySignature(ole, 'old.ppt');
    } catch (error) {
      expect((error as PackageRefusal).code).toBe('binary');
      expect((error as Error).message).toMatch(/binary PowerPoint file .* or an encrypted package/);
    }
    const text = new TextEncoder().encode('hello world');
    expect(sniffPackage(text)).toBe('unknown');
    expect(() => refuseBySignature(text, 'notes.txt')).toThrow(/not a PowerPoint file/);
  });

  it('refuses a file over the cap', () => {
    const big = { byteLength: PPTX_MAX_BYTES + 1 } as unknown as Uint8Array;
    expect(() => refuseBySignature(big, 'huge.pptx')).toThrow(/imported up to/);
  });

  it('refuses a macro enabled main part by content type', () => {
    for (const type of MACRO_CONTENT_TYPES) {
      expect(() => openPackage(minimalPackage(type), { fileName: 'macros.pptm' })).toThrow(
        /macro enabled/,
      );
    }
  });

  it('refuses an .odp by its mimetype entry', () => {
    const entries = [
      entry('mimetype', 'application/vnd.oasis.opendocument.presentation'),
      entry('content.xml', '<x/>'),
    ];
    expect(() => openPackage(entries, { fileName: 'deck.odp' })).toThrow(/OpenDocument/);
  });

  it('refuses an encrypted package and a package without ppt/presentation.xml', () => {
    expect(() =>
      openPackage(
        [entry('EncryptionInfo', 'x'), entry('EncryptedPackage', 'y'), ...minimalPackage()],
        { fileName: 'locked.pptx' },
      ),
    ).toThrow(/encrypted/);
    expect(() => openPackage(minimalPackage().slice(0, 2), { fileName: 'empty.pptx' })).toThrow(
      /no ppt\/presentation\.xml/,
    );
  });

  it('reads a package that fails the validation and names the issues', () => {
    const entries = [
      ...minimalPackage(),
      entry(
        'ppt/slides/slide1.xml',
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
      ),
      entry(
        'ppt/slides/_rels/slide1.xml.rels',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.bin"/></Relationships>',
      ),
    ];
    const pkg = openPackage(entries);
    const validation = validatePackage(pkg);
    expect(validation.valid).toBe(false);
    expect(validation.invalidRelationships).toEqual([
      'ppt/slides/_rels/slide1.xml.rels: rId1 -> ../slideLayouts/slideLayout1.xml',
      'ppt/slides/_rels/slide1.xml.rels: rId1 -> ../media/image1.bin',
    ]);
    expect(validation.undeclaredParts).toEqual([]);
    expect(validation.issues.some((line) => line.includes('relationship id rId1 repeats'))).toBe(
      true,
    );
    expect(readPresentation(pkg).slides).toEqual([]);
  });

  it('refuses a part with a DOCTYPE when it is read', () => {
    const entries = minimalPackage();
    entries[2] = entry(
      'ppt/presentation.xml',
      '<!DOCTYPE p:presentation><p:presentation xmlns:p="urn:p"/>',
    );
    const pkg = openPackage(entries);
    expect(() => readPresentation(pkg)).toThrow(/DOCTYPE/);
  });
});

describe('the part name arithmetic', () => {
  it('resolves relationship targets against the source folder and never past the root', () => {
    expect(resolveTarget('ppt/slides/slide1.xml', '../slideLayouts/slideLayout1.xml')).toBe(
      'ppt/slideLayouts/slideLayout1.xml',
    );
    expect(resolveTarget('ppt/slides/slide1.xml', 'slide3.xml')).toBe('ppt/slides/slide3.xml');
    expect(resolveTarget('', 'ppt/presentation.xml')).toBe('ppt/presentation.xml');
    expect(resolveTarget('ppt/presentation.xml', '/ppt/slides/slide1.xml')).toBe(
      'ppt/slides/slide1.xml',
    );
    expect(resolveTarget('ppt/slides/slide1.xml', '../../../../etc/passwd')).toBe('etc/passwd');
    expect(resolveTarget('ppt/slides/slide1.xml', '../media/image%201.png')).toBe(
      'ppt/media/image 1.png',
    );
  });

  it('pairs a part with its .rels part in both directions', () => {
    expect(relsPathOf('ppt/slides/slide1.xml')).toBe('ppt/slides/_rels/slide1.xml.rels');
    expect(relsPathOf('')).toBe('_rels/.rels');
    expect(sourceOfRels('ppt/slides/_rels/slide1.xml.rels')).toBe('ppt/slides/slide1.xml');
    expect(sourceOfRels('_rels/.rels')).toBe('');
    expect(sourceOfRels('ppt/presentation.xml')).toBe('');
  });
});
