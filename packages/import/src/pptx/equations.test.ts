// The OMML to MathML transform (gslides-parity SPEC-5 5.1; R06 8.5): the objects the reader maps,
// the tokens of a run, the delimiters, the n ary operators with their limits, the matrices, and a
// node with no transform keeping its text with a note.
import { describe, expect, it } from 'vitest';

import { ommlToMathml } from './equations.ts';
import { parseXml } from './xml.ts';

const M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

function math(inner: string, para = true): ReturnType<typeof ommlToMathml> {
  const body = para
    ? `<m:oMathPara xmlns:m="${M}"><m:oMath>${inner}</m:oMath></m:oMathPara>`
    : `<m:oMath xmlns:m="${M}">${inner}</m:oMath>`;
  const { root } = parseXml(body, 'math');
  return ommlToMathml(root);
}

const r = (text: string, sty?: string): string =>
  `<m:r>${sty === undefined ? '' : `<m:rPr><m:sty m:val="${sty}"/></m:rPr>`}<m:t>${text}</m:t></m:r>`;

describe('ommlToMathml', () => {
  it('writes a fraction, a superscript, a subscript and a radical', () => {
    const out = math(
      `<m:f><m:num>${r('a')}</m:num><m:den>${r('b')}</m:den></m:f><m:sSup><m:e>${r('x')}</m:e><m:sup>${r('2')}</m:sup></m:sSup><m:sSub><m:e>${r('y')}</m:e><m:sub>${r('i')}</m:sub></m:sSub><m:rad><m:radPr><m:degHide m:val="on"/></m:radPr><m:deg/><m:e>${r('z')}</m:e></m:rad>`,
    );
    expect(out.display).toBe('block');
    expect(out.mathml).toContain('<mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac>');
    expect(out.mathml).toContain('<msup><mrow><mi>x</mi></mrow><mrow><mn>2</mn></mrow></msup>');
    expect(out.mathml).toContain('<msub>');
    expect(out.mathml).toContain('<msqrt><mrow><mi>z</mi></mrow></msqrt>');
    expect(
      out.mathml.startsWith('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">'),
    ).toBe(true);
    expect(out.unknown).toEqual([]);
  });

  it('tokenises a run into numbers, operators and identifiers', () => {
    const out = math(r('2x+10=y'));
    expect(out.mathml).toContain('<mn>2</mn><mi>x</mi><mo>+</mo><mn>10</mn><mo>=</mo><mi>y</mi>');
  });

  it('keeps a plain styled word as one identifier and a nor run as text', () => {
    expect(math(r('sin', 'p')).mathml).toContain('<mi mathvariant="normal">sin</mi>');
    expect(math(`<m:r><m:rPr><m:nor/></m:rPr><m:t>if and only if</m:t></m:r>`).mathml).toContain(
      '<mtext>if and only if</mtext>',
    );
  });

  it('writes delimiters with their separators, an n ary with under and over limits, and a matrix', () => {
    const out = math(
      `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e>${r('a')}</m:e><m:e>${r('b')}</m:e></m:d><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${r('i=1')}</m:sub><m:sup>${r('n')}</m:sup><m:e>${r('i')}</m:e></m:nary><m:m><m:mr><m:e>${r('1')}</m:e><m:e>${r('0')}</m:e></m:mr><m:mr><m:e>${r('0')}</m:e><m:e>${r('1')}</m:e></m:mr></m:m>`,
    );
    expect(out.mathml).toContain('<mo fence="true" stretchy="true">[</mo>');
    expect(out.mathml).toContain('<mo separator="true">|</mo>');
    expect(out.mathml).toContain('<munderover><mo largeop="true" stretchy="true">∑</mo>');
    expect(out.mathml).toContain(
      '<mtable><mtr><mtd><mrow><mn>1</mn></mrow></mtd><mtd><mrow><mn>0</mn></mrow></mtd></mtr>',
    );
  });

  it('writes a subSup limit location as scripts, a function with the invisible apply, a bar and an accent', () => {
    const out = math(
      `<m:nary><m:naryPr><m:chr m:val="∫"/><m:limLoc m:val="subSup"/></m:naryPr><m:sub>${r('0')}</m:sub><m:sup>${r('1')}</m:sup><m:e>${r('x')}</m:e></m:nary><m:func><m:fName>${r('sin', 'p')}</m:fName><m:e>${r('x')}</m:e></m:func><m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${r('v')}</m:e></m:bar><m:acc><m:accPr><m:chr m:val="^"/></m:accPr><m:e>${r('a')}</m:e></m:acc>`,
    );
    expect(out.mathml).toContain('<msubsup><mo largeop="true" stretchy="true">∫</mo>');
    expect(out.mathml).toContain('<mo>&#x2061;</mo>');
    expect(out.mathml).toContain('<mover accent="false">');
    expect(out.mathml).toContain('<mover accent="true"><mrow><mi>a</mi></mrow><mo>^</mo></mover>');
  });

  it('reads an inline oMath as inline and names a node it does not know', () => {
    const out = math(`${r('a')}<m:unknownThing>${r('b')}</m:unknownThing>`, false);
    expect(out.display).toBe('inline');
    expect(out.unknown).toEqual(['unknownThing']);
    expect(out.mathml).toContain('<mtext>b</mtext>');
  });

  it('escapes the markup characters of a run', () => {
    const out = math(r('a&lt;b&amp;c')).mathml;
    expect(out).toContain('<mo>&lt;</mo>');
    expect(out).toContain('<mi>c</mi>');
    expect(out).not.toContain('<b&');
  });
});
