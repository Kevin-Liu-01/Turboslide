// The ODF check's readers without a writer (gslides-parity SPEC-5 6.3): the first zip entry's
// facts, the length conversions, the manifest paths and the attribute name verdicts over a hand
// written content.xml; the writer's own files are checked end to end in odp/build.test.ts.
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { checkOdf, firstEntryFacts, manifestPaths, odfLengthEmu } from './odf.ts';

describe('the ODF check', () => {
  it('reads the first entry of a zip and refuses a deflated or misplaced mimetype', async () => {
    const stored = new JSZip();
    stored.file('mimetype', 'application/vnd.oasis.opendocument.presentation', {
      compression: 'STORE',
    });
    stored.file('content.xml', '<a/>');
    const bytes = await stored.generateAsync({ type: 'uint8array' });
    expect(firstEntryFacts(bytes)).toEqual({ name: 'mimetype', method: 0, extraLength: 0 });
    const deflated = new JSZip();
    deflated.file('content.xml', '<a/>', { compression: 'DEFLATE' });
    deflated.file('mimetype', 'application/vnd.oasis.opendocument.presentation', {
      compression: 'DEFLATE',
    });
    const other = await deflated.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const first = firstEntryFacts(other);
    expect(first?.name).toBe('content.xml');
    expect(firstEntryFacts(new Uint8Array(4))).toBeNull();
  });

  it('converts ODF lengths to EMU and reads manifest paths', () => {
    expect(odfLengthEmu('33.867cm')).toBe(Math.round(33.867 * 360000));
    expect(odfLengthEmu('10in')).toBe(9144000);
    expect(odfLengthEmu('72pt')).toBe(914400);
    expect(odfLengthEmu('1600px')).toBe(1600 * 7620);
    expect(odfLengthEmu('12mm')).toBe(432000);
    expect(odfLengthEmu('wide')).toBeNull();
    expect(
      manifestPaths(
        '<manifest:manifest><manifest:file-entry manifest:full-path="/"/><manifest:file-entry manifest:full-path="content.xml"/><manifest:file-entry manifest:full-path="Pictures/a.png"/></manifest:manifest>',
      ),
    ).toEqual(['content.xml', 'Pictures/a.png']);
  });

  it('names an unknown transition, an unknown node type, a plugin without a mime type and a preset without a path', async () => {
    const zip = new JSZip();
    zip.file(
      'content.xml',
      '<office:document-content><style:style><style:drawing-page-properties smil:type="spiral" presentation:transition-speed="quick"/></style:style><draw:page draw:name="a"><anim:par presentation:node-type="sideways"/><draw:plugin xlink:href="Media/a.mp4"/><draw:custom-shape><draw:enhanced-geometry draw:type="ooxml-hexagon"/></draw:custom-shape></draw:page></office:document-content>',
    );
    zip.file('styles.xml', '<office:document-styles/>');
    const odf = await checkOdf(zip);
    expect(odf.ok).toBe(false);
    expect(odf.lines).toEqual(
      expect.arrayContaining([
        'odf: unknown transition smil:type spiral',
        'odf: unknown transition speed quick',
        'odf: unknown animation node type sideways',
        'odf: a draw:plugin carries no draw:mime-type',
        'odf: the ooxml-hexagon shape carries no draw:enhanced-path',
        'odf: the default style names no fo:language and fo:country',
        'odf: the page layout names no fo:page-width and fo:page-height',
      ]),
    );
    expect(odf.counts?.pages).toBe(1);
  });
});
