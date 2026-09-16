// The SVG check over hand written files (gslides-parity SPEC-5 0.33, 6.4): the root and viewBox
// readers, the embed mode's one style rule, the outline and link mode rules; the writer's own
// files are checked end to end in svg/write.test.ts.
import { describe, expect, it } from 'vitest';

import { checkSvg, svgRoot, svgViewBox } from './svg.ts';

const OK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" data-ts-text="link"><title>t</title><desc>d</desc><rect width="1" height="1"/></svg>';

describe('the SVG check', () => {
  it('reads the root and the viewBox', () => {
    expect(svgRoot(OK)).toContain('viewBox="0 0 1600 900"');
    expect(svgViewBox(OK)).toEqual([0, 0, 1600, 900]);
    expect(svgViewBox('<svg xmlns="x"></svg>')).toBeNull();
    expect(svgRoot('<div/>')).toBeNull();
    expect(checkSvg('<div/>').lines).toEqual(['svg: no root svg element']);
  });

  it('passes a plain link mode file and names the missing parts', () => {
    const check = checkSvg(OK);
    expect(check.ok).toBe(true);
    expect(check.lines[0]).toMatch(/^svg: ok, link text, viewBox 0 0 1600 900/);
    const missing = checkSvg('<svg viewBox="0 0 10 0"><rect/></svg>');
    expect(missing.lines).toEqual(
      expect.arrayContaining([
        'svg: the root is not in the SVG namespace',
        'svg: the viewBox has no area',
        'svg: 0 title element(s), expected one',
        'svg: 0 desc element(s), expected one',
      ]),
    );
  });

  it('holds embed mode to one style element whose only rule is the @font-face', () => {
    const good =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" data-ts-text="embed"><title>t</title><desc>d</desc><style>@font-face { font-family: Inter; src: url(data:font/woff2;base64,AA==) format("woff2"); }</style></svg>';
    expect(checkSvg(good).ok).toBe(true);
    const extraRule = good.replace('</style>', 'text { fill: red }</style>');
    expect(checkSvg(extraRule).lines).toContain(
      'svg: the style element carries a rule beyond the @font-face',
    );
    const external = good.replace(
      'url(data:font/woff2;base64,AA==)',
      'url(https://fonts.example/inter.woff2)',
    );
    expect(checkSvg(external).lines).toContain('svg: the @font-face does not inline its file');
    const twoStyles = good.replace('</style>', '</style><style></style>');
    expect(checkSvg(twoStyles).lines).toContain(
      'svg: 2 style element(s), expected one in embed mode',
    );
  });

  it('refuses text in outline mode and a font face in link mode', () => {
    const outline =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" data-ts-text="outline"><title>t</title><desc>d</desc><text>x</text></svg>';
    expect(checkSvg(outline).lines).toContain('svg: outline mode carries a text element');
    const link =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" data-ts-text="link"><title>t</title><desc>d</desc><style>@font-face {}</style></svg>';
    expect(checkSvg(link).lines).toContain('svg: link mode carries an @font-face');
  });
});
