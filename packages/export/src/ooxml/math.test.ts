import JSZip from 'jszip';
import { beforeAll, describe, expect, test } from 'vitest';

import { equationMathml, loadEquationEngine } from '@turboslide/render/theme-node';

import { checkEquations } from '../check/equations.ts';
import type { Scene, SceneEquation } from '../scene/types.ts';
import { listShapes } from './groups.ts';
import {
  MATH_TYPEFACE,
  NS_A14,
  NS_M,
  NS_MC,
  OMML_OBJECTS,
  alternateContentXml,
  decodeXml,
  mathmlToOmml,
  mathmlToOmmlDetailed,
  parseXml,
  rewriteEquationsSync,
} from './math.ts';
import { validatePackage } from './validate.ts';

// The MathML Core to OMML transform and the wrapper (gslides-parity SPEC-5 8.3; R06 5.2, 8.2):
// the OMML per built up object against a fixture written by hand from Murray Sargent's table and
// Microsoft's `a14:m` example, the wrapper's two shapes sharing one name (one id as written; the
// post process's renumber may give them two, which the check admits), the Fallback
// picture keeping its relationship, the check section reading them back.

beforeAll(async () => {
  await loadEquationEngine();
});

/**
 * The structure of an OMML string with every run reduced to `[text]` (`[p:text]` for an upright
 * run, `[b:text]` for a bold one), so a hand written expectation names the objects and their
 * arguments and not the run properties, which `run properties` below pins once.
 */
function bare(omml: string): string {
  return omml
    .replace(/<m:oMathPara[^>]*><m:oMathParaPr>[\s\S]*?<\/m:oMathParaPr>/, '')
    .replace(/<\/m:oMathPara>$/, '')
    .replace(
      /<m:r>(?:<m:rPr><m:sty m:val="(p|b|bi)"\/><\/m:rPr>)?<a:rPr[\s\S]*?<\/a:rPr><m:t xml:space="preserve">([^<]*)<\/m:t><\/m:r>/g,
      (_m, sty: string | undefined, text: string) =>
        sty === undefined || sty === 'bi' ? `[${decodeXml(text)}]` : `[${sty}:${decodeXml(text)}]`,
    );
}

function omml(tex: string, display: 'block' | 'inline' = 'block'): string {
  const { mathml, error } = equationMathml(tex, display);
  expect(error, tex).toBeUndefined();
  const out = mathmlToOmmlDetailed(mathml, { sizePx: 44, colorHex: '3A3D44' });
  expect(out.reason, tex).toBeUndefined();
  return bare(out.omml ?? '');
}

/** The hand written fixture: Murray Sargent's objects with Temml's source on the left. */
const FIXTURE: ReadonlyArray<
  [object: (typeof OMML_OBJECTS)[number], tex: string, expected: string]
> = [
  ['r', '\\pi', '<m:oMath>[π]</m:oMath>'],
  [
    'f',
    '\\frac{a}{b}',
    '<m:oMath><m:f><m:fPr><m:type m:val="bar"/></m:fPr><m:num>[a]</m:num><m:den>[b]</m:den></m:f></m:oMath>',
  ],
  [
    'sSup',
    'x^2',
    '<m:oMath><m:sSup><m:sSupPr/><m:e>[x]</m:e><m:sup>[2]</m:sup></m:sSup></m:oMath>',
  ],
  [
    'sSub',
    'x_i',
    '<m:oMath><m:sSub><m:sSubPr/><m:e>[x]</m:e><m:sub>[i]</m:sub></m:sSub></m:oMath>',
  ],
  [
    'sSubSup',
    'x_i^2',
    '<m:oMath><m:sSubSup><m:sSubSupPr/><m:e>[x]</m:e><m:sub>[i]</m:sub><m:sup>[2]</m:sup></m:sSubSup></m:oMath>',
  ],
  [
    'rad',
    '\\sqrt{x}',
    '<m:oMath><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>[x]</m:e></m:rad></m:oMath>',
  ],
  [
    'rad',
    '\\sqrt[3]{x}',
    '<m:oMath><m:rad><m:radPr/><m:deg>[3]</m:deg><m:e>[x]</m:e></m:rad></m:oMath>',
  ],
  [
    'nary',
    '\\sum_{i=0}^{n} i',
    '<m:oMath><m:nary><m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr><m:sub>[i][=][0]</m:sub><m:sup>[n]</m:sup><m:e>[i]</m:e></m:nary></m:oMath>',
  ],
  [
    'nary',
    '\\int_a^b f',
    '<m:oMath><m:nary><m:naryPr><m:chr m:val="∫"/><m:limLoc m:val="subSup"/></m:naryPr><m:sub>[a]</m:sub><m:sup>[b]</m:sup><m:e>[f]</m:e></m:nary></m:oMath>',
  ],
  [
    'd',
    '\\left( x \\right)',
    '<m:oMath><m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e>[x]</m:e></m:d></m:oMath>',
  ],
  [
    'd',
    '\\abs{x}',
    '<m:oMath><m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr><m:e>[x]</m:e></m:d></m:oMath>',
  ],
  [
    'func',
    '\\sin x',
    '<m:oMath><m:func><m:funcPr/><m:fName>[p:sin]</m:fName><m:e>[x]</m:e></m:func></m:oMath>',
  ],
  [
    'acc',
    '\\hat{a}',
    '<m:oMath><m:acc><m:accPr><m:chr m:val="̂"/></m:accPr><m:e>[a]</m:e></m:acc></m:oMath>',
  ],
  [
    'acc',
    '\\vec{v}',
    '<m:oMath><m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>[v]</m:e></m:acc></m:oMath>',
  ],
  [
    'bar',
    '\\overline{b}',
    '<m:oMath><m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>[b]</m:e></m:bar></m:oMath>',
  ],
  [
    'bar',
    '\\underline{b}',
    '<m:oMath><m:bar><m:barPr><m:pos m:val="bot"/></m:barPr><m:e>[b]</m:e></m:bar></m:oMath>',
  ],
  [
    'borderBox',
    '\\boxed{x}',
    '<m:oMath><m:borderBox><m:borderBoxPr/><m:e>[x]</m:e></m:borderBox></m:oMath>',
  ],
  ['box', '\\raisebox{2pt}{x}', '<m:oMath><m:box><m:boxPr/><m:e>[p:x]</m:e></m:box></m:oMath>'],
  [
    'groupChr',
    '\\overbrace{x+y}',
    '<m:oMath><m:groupChr><m:groupChrPr><m:chr m:val="⏞"/><m:pos m:val="top"/></m:groupChrPr><m:e>[x][+][y]</m:e></m:groupChr></m:oMath>',
  ],
  [
    'limLow',
    '\\lim_{x \\to 0} f',
    '<m:oMath><m:limLow><m:limLowPr/><m:e>[p:lim]</m:e><m:lim>[x][→][0]</m:lim></m:limLow>[f]</m:oMath>',
  ],
  [
    'limUpp',
    '\\overset{*}{=}',
    '<m:oMath><m:limUpp><m:limUppPr/><m:e>[=]</m:e><m:lim>[∗]</m:lim></m:limUpp></m:oMath>',
  ],
  [
    'm',
    '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
    '<m:oMath><m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e><m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="2"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr><m:mr><m:e>[a]</m:e><m:e>[b]</m:e></m:mr><m:mr><m:e>[c]</m:e><m:e>[d]</m:e></m:mr></m:m></m:e></m:d></m:oMath>',
  ],
  [
    'eqArr',
    '\\begin{cases} x & y \\\\ z & w \\end{cases}',
    '<m:oMath><m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr><m:eqArrPr><m:baseJc m:val="center"/></m:eqArrPr><m:e>[x][&][y]</m:e><m:e>[z][&][w]</m:e></m:eqArr></m:e></m:d></m:oMath>',
  ],
  [
    'eqArr',
    '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}',
    '<m:oMath><m:eqArr><m:eqArrPr><m:baseJc m:val="center"/></m:eqArrPr><m:e>[a][&][=][b]</m:e><m:e>[c][&][=][d]</m:e></m:eqArr></m:oMath>',
  ],
  ['phant', '\\phantom{x}', '<m:oMath><m:phant><m:phantPr/><m:e>[x]</m:e></m:phant></m:oMath>'],
  [
    'd',
    '\\binom{n}{k}',
    '<m:oMath><m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e><m:f><m:fPr><m:type m:val="noBar"/></m:fPr><m:num>[n]</m:num><m:den>[k]</m:den></m:f></m:e></m:d></m:oMath>',
  ],
];

describe('mathmlToOmml over the nineteen objects', () => {
  test.each(FIXTURE)('%s: %s', (_object, tex, expected) => {
    expect(omml(tex)).toBe(expected);
  });

  test('covers every object of the table', () => {
    const covered = new Set(FIXTURE.map(([object]) => object));
    for (const object of OMML_OBJECTS) {
      if (object === 'sPre') continue;
      expect(covered.has(object), object).toBe(true);
    }
  });

  test('sPre from prescripts (a PowerPoint import; Temml writes msubsup for {}_1^2 x)', () => {
    const out = mathmlToOmml(
      '<math><mmultiscripts><mi>x</mi><mprescripts/><mn>1</mn><mn>2</mn></mmultiscripts></math>',
    );
    expect(bare(out ?? '')).toBe(
      '<m:oMath><m:sPre><m:sPrePr/><m:sub>[1]</m:sub><m:sup>[2]</m:sup><m:e>[x]</m:e></m:sPre></m:oMath>',
    );
  });

  test('run properties: Cambria Math, the size in hundredths of a point, the colour, the styles', () => {
    const { mathml } = equationMathml('\\mathrm{a} \\text{hi} 2 \\color{#2f5ce0}{x}');
    const out = mathmlToOmml(mathml, { sizePx: 44, colorHex: '3A3D44' }) ?? '';
    expect(
      out.startsWith(
        `<m:oMathPara xmlns:m="${NS_M}"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath>`,
      ),
    ).toBe(true);
    expect(out).toContain(`<a:latin typeface="${MATH_TYPEFACE}"/>`);
    // 44 px is 26.4 pt, written as 2640
    expect(out).toContain('<a:rPr lang="en-US" sz="2640">');
    expect(out).toContain('<a:srgbClr val="3A3D44"/>');
    expect(out).toContain('<a:srgbClr val="2F5CE0"/>');
    expect(out).toContain('<m:rPr><m:sty m:val="p"/></m:rPr>');
    expect(bare(out)).toBe('<m:oMath>[p:a][p:hi][2][x]</m:oMath>');
    expect(out).not.toContain('w:rPr');
  });

  test("Microsoft's example: one run of 𝜋 in Cambria Math inside oMathPara and oMath", () => {
    const out = mathmlToOmml('<math><mi>𝜋</mi></math>', { sizePx: 22, colorHex: '070707' }) ?? '';
    expect(out).toMatch(
      /^<m:oMathPara xmlns:m="[^"]+"><m:oMathParaPr><m:jc m:val="center"\/><\/m:oMathParaPr><m:oMath><m:r><a:rPr lang="en-US" sz="1320"><a:solidFill><a:srgbClr val="070707"\/><\/a:solidFill><a:latin typeface="Cambria Math"\/><\/a:rPr><m:t xml:space="preserve">𝜋<\/m:t><\/m:r><\/m:oMath><\/m:oMathPara>$/,
    );
  });

  test('a construct outside the table answers the reason and no OMML', () => {
    const strike = equationMathml('\\cancel{x}').mathml;
    expect(mathmlToOmmlDetailed(strike)).toEqual({
      reason: 'menclose notation="updiagonalstrike"',
    });
    const failed = equationMathml('\\frac{a}{').mathml;
    expect(mathmlToOmmlDetailed(failed).reason).toMatch(/temml-error/);
    expect(mathmlToOmmlDetailed('<mi>x</mi>').reason).toBe('the root is <mi>, not <math>');
    expect(mathmlToOmmlDetailed('<math><mi>x</mrow></math>').reason).toMatch(/closes/);
    expect(mathmlToOmml('<math><mtwo/></math>')).toBeUndefined();
  });

  test('the placeholder source of a new block and every symbol group transform', () => {
    for (const tex of [
      'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
      '\\alpha \\beta \\Omega',
      '\\times \\oplus \\forall \\exists',
      '\\leq \\approx \\subseteq \\notin',
      '\\leftarrow \\Rightarrow \\updownarrow',
      '\\rootof{3}{x} \\superscript{a}{b} \\bracelr{y} \\limab{x}{0} \\prod_{i=1}^{n} i',
    ]) {
      const { mathml, error } = equationMathml(tex);
      expect(error, tex).toBeUndefined();
      expect(mathmlToOmmlDetailed(mathml).omml, tex).toBeDefined();
    }
  });
});

describe('parseXml', () => {
  test('reads elements, attributes, text and entities', () => {
    const root = parseXml(
      '<math display="block"><mo lspace=\'0em\'>&lt;</mo><mi>x&#x1D465;</mi></math>',
    );
    expect(root.name).toBe('math');
    expect(root.attrs.display).toBe('block');
    const [mo, mi] = root.children;
    expect(mo?.kind === 'element' && mo.attrs.lspace).toBe('0em');
    expect(mo?.kind === 'element' && mo.children[0]?.kind === 'text' && mo.children[0].text).toBe(
      '<',
    );
    expect(mi?.kind === 'element' && mi.children[0]?.kind === 'text' && mi.children[0].text).toBe(
      'x𝑥',
    );
    expect(() => parseXml('<a><b></a>')).toThrow(/closes/);
  });
});

// ---------------------------------------------------------------------------------------------
// The wrapper in a slide part

const PIC =
  '<p:pic><p:nvPicPr><p:cNvPr id="4" name="ts:eq#e1:1" descr="a over b"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
  '<p:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
  '<p:spPr><a:xfrm><a:off x="1524000" y="1524000"/><a:ext cx="3048000" cy="1524000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';

const SLIDE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>' +
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="ts:eq#h"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>' +
  PIC +
  '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';

function sceneWith(equations: SceneEquation[]): Scene {
  return { slideId: 'eq', theme: 'light', equations } as unknown as Scene;
}

function equationRecord(tex: string, extra: Partial<SceneEquation> = {}): SceneEquation {
  const { mathml } = equationMathml(tex);
  const record: SceneEquation = {
    blockId: 'e1',
    box: [200, 200, 400, 200],
    tex,
    mathml,
    raster: 'e1:1',
    ...extra,
  };
  const out = mathmlToOmml(mathml, { sizePx: 44, colorHex: '070707' });
  if (out !== undefined && extra.omml === undefined) record.omml = out;
  return record;
}

describe('rewriteEquations', () => {
  test('replaces the raster picture by the wrapper: the Choice a math shape at the same box and id, the Fallback the picture itself', () => {
    const scene = sceneWith([equationRecord('\\frac{a}{b}')]);
    const out = rewriteEquationsSync(SLIDE, scene);
    expect(out.native).toBe(1);
    expect(out.raster).toEqual([]);
    expect(out.xml).not.toContain(`</p:spTree>${PIC}`);
    const wrapper = /<mc:AlternateContent[\s\S]*<\/mc:AlternateContent>/.exec(out.xml)?.[0] ?? '';
    expect(
      wrapper.startsWith(
        `<mc:AlternateContent xmlns:mc="${NS_MC}"><mc:Choice xmlns:a14="${NS_A14}" Requires="a14"><p:sp>`,
      ),
    ).toBe(true);
    expect(wrapper).toContain(`<mc:Fallback>${PIC}</mc:Fallback>`);
    expect(wrapper).toContain('<p:cNvPr id="4" name="ts:eq#e1:1" descr="a over b"/>');
    expect(wrapper).toContain(
      '<a:xfrm><a:off x="1524000" y="1524000"/><a:ext cx="3048000" cy="1524000"/></a:xfrm>',
    );
    expect(wrapper).toContain('<a:p><a:pPr algn="ctr"/><a14:m><m:oMathPara');
    expect(wrapper).toContain('<a:endParaRPr lang="en-US" sz="1320"/>');
    expect((wrapper.match(/<a14:m>/g) ?? []).length).toBe(1);
    // the two shapes read as one to the grouping (B3's listShapes)
    const shapes = listShapes(out.xml);
    expect(shapes.map((s) => s.kind)).toEqual(['sp', 'alternateContent']);
    expect(shapes[1]?.id).toBe(4);
    expect(shapes[1]?.name).toBe('ts:eq#e1:1');
    // the title shape is untouched
    expect(out.xml).toContain('<p:cNvPr id="2" name="ts:eq#h"/>');
  });

  test('keeps the picture and names the block when the transform gave no OMML', () => {
    const record = equationRecord('\\cancel{x}');
    delete record.omml;
    const out = rewriteEquationsSync(SLIDE, sceneWith([record]));
    expect(out.native).toBe(0);
    expect(out.raster).toEqual([{ blockId: 'e1', reason: 'no OMML for the construct' }]);
    expect(out.xml).toBe(SLIDE);
  });

  test('adds a wrapper with a source text fallback when no raster was shot for the block', () => {
    const record = equationRecord('x^2', { raster: undefined, alt: undefined });
    delete record.raster;
    const withoutPic = SLIDE.replace(PIC, '');
    const out = rewriteEquationsSync(withoutPic, sceneWith([record]));
    expect(out.native).toBe(1);
    const shapes = listShapes(out.xml);
    expect(shapes.map((s) => s.kind)).toEqual(['sp', 'alternateContent']);
    expect(shapes[1]?.id).toBe(3);
    expect(shapes[1]?.name).toBe('ts:eq#e1');
    // the box in EMU: 200 px is 1,524,000 EMU, 400 px 3,048,000
    expect(out.xml).toContain('<a:off x="1524000" y="1524000"/><a:ext cx="3048000" cy="1524000"/>');
    expect(out.xml).toContain('<mc:Fallback><p:sp>');
    expect(out.xml).toContain('<a:t>x^2</a:t>');
    expect(out.xml.indexOf('<mc:AlternateContent')).toBeLessThan(out.xml.indexOf('</p:spTree>'));
  });

  test('alternateContentXml is the wrapper of R06 5.2', () => {
    expect(alternateContentXml('<p:sp>c</p:sp>', '<p:pic>f</p:pic>')).toBe(
      `<mc:AlternateContent xmlns:mc="${NS_MC}"><mc:Choice xmlns:a14="${NS_A14}" Requires="a14"><p:sp>c</p:sp></mc:Choice><mc:Fallback><p:pic>f</p:pic></mc:Fallback></mc:AlternateContent>`,
    );
  });
});

describe('checkEquations and the validator', () => {
  const RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/eq1.png"/>' +
    '</Relationships>';

  async function packageWith(slideXml: string, options: { media?: boolean } = {}): Promise<JSZip> {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
    );
    zip.file(
      '_rels/.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
    );
    zip.file('ppt/presentation.xml', '<p:presentation/>');
    zip.file('ppt/slideLayouts/slideLayout1.xml', '<p:sldLayout/>');
    zip.file('ppt/slides/slide1.xml', slideXml);
    zip.file('ppt/slides/_rels/slide1.xml.rels', RELS);
    if (options.media !== false) zip.file('ppt/media/eq1.png', new Uint8Array([137, 80, 78, 71]));
    return zip;
  }

  test('reads the wrapper back: one a14:m, one wrapper, one picture fallback resolving to its part', async () => {
    const rewritten = rewriteEquationsSync(SLIDE, sceneWith([equationRecord('\\frac{a}{b}')])).xml;
    const section = await checkEquations(await packageWith(rewritten));
    expect(section).toEqual({
      ok: true,
      lines: [],
      counts: { a14m: 1, wrappers: 1, pictureFallbacks: 1, sourceFallbacks: 0 },
    });
    const validation = await validatePackage(await packageWith(rewritten));
    expect(validation.issues).toEqual([]);
  });

  test('names a Fallback picture whose part is missing and an a14:m outside a Choice', async () => {
    const rewritten = rewriteEquationsSync(SLIDE, sceneWith([equationRecord('\\frac{a}{b}')])).xml;
    const missing = await checkEquations(await packageWith(rewritten, { media: false }));
    expect(missing.ok).toBe(false);
    expect(missing.lines[0]).toMatch(
      /r:embed rId3 resolves to ppt\/media\/eq1\.png, which is not in the package/,
    );
    const bare = SLIDE.replace('<a:t>Title</a:t></a:r>', '<a:t>Title</a:t></a:r><a14:m/>');
    const loose = await checkEquations(await packageWith(bare));
    expect(loose.ok).toBe(false);
    expect(loose.lines).toEqual([
      'ppt/slides/slide1.xml: 1 a14:m element(s) but 0 inside an mc:Choice Requires="a14"',
    ]);
    const validation = await validatePackage(await packageWith(bare));
    expect(validation.issues).toContain(
      'ppt/slides/slide1.xml: 1 a14:m element(s), 0 inside an mc:Choice Requires="a14"',
    );
  });

  test('the validator names an r:embed no relationship answers', async () => {
    const dangling = SLIDE.replace('r:embed="rId3"', 'r:embed="rId9"');
    const validation = await validatePackage(await packageWith(dangling));
    expect(validation.invalidRelationships).toContain(
      'ppt/slides/slide1.xml: r:embed rId9 names no relationship of the part',
    );
    expect(validation.valid).toBe(false);
  });

  test('a package without an equation passes with zero counts', async () => {
    expect(await checkEquations(await packageWith(SLIDE))).toEqual({
      ok: true,
      lines: [],
      counts: { a14m: 0, wrappers: 0, pictureFallbacks: 0, sourceFallbacks: 0 },
    });
  });
});
