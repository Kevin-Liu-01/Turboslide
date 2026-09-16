// The theme layer over fixture 01-text and hand written colour elements (R04 6; R03 4.2).
import { THEME_COLOR_SLOTS } from '@turboslide/schema/validate/theme';
import { describe, expect, it } from 'vitest';

import { fixtureEntries } from './__tests__/unzip.ts';
import { openPackage } from './package.ts';
import {
  DEFAULT_CLR_MAP,
  SCHEME_RECORD_KEYS,
  SCHEME_SLOTS,
  channelDistance,
  clrMapOverride,
  compositeOn,
  hexToRgb,
  normalizeHex,
  readClrMap,
  readFill,
  readScheme,
  resolveColor,
  resolveTypeface,
  rgbToHex,
  snapColor,
  themeRecordColors,
} from './theme.ts';
import type { ColorContext } from './theme.ts';
import { NS, parseXml } from './xml.ts';

const A = NS.a;
const P = NS.p;

function colorElement(xml: string) {
  return parseXml(`<a:wrap xmlns:a="${A}">${xml}</a:wrap>`, 'colour').root.firstChild as never;
}

describe('readScheme over fixture 01', () => {
  const pkg = openPackage(fixtureEntries('01-text.pptx'));
  const scheme = readScheme(pkg.xml('ppt/theme/theme1.xml'));

  it('reads the twelve slots with sysClr lastClr and the two font faces', () => {
    expect(scheme.name).toBe('Office Theme');
    expect(scheme.schemeName).toBe('Office');
    expect(scheme.colors.dk1).toBe('#000000');
    expect(scheme.colors.lt1).toBe('#ffffff');
    expect(scheme.colors.dk2).toBe('#1f497d');
    expect(scheme.colors.accent1).toBe('#4f81bd');
    expect(scheme.colors.hlink).toBe('#0000ff');
    expect(scheme.colors.folHlink).toBe('#800080');
    expect(Object.keys(scheme.colors)).toEqual([...SCHEME_SLOTS]);
    expect(scheme.fonts).toEqual({ major: 'Calibri', minor: 'Calibri' });
    expect(resolveTypeface('+mn-lt', scheme)).toBe('Calibri');
    expect(resolveTypeface('+mj-lt', scheme)).toBe('Calibri');
    expect(resolveTypeface('Georgia', scheme)).toBe('Georgia');
  });

  it('reads the master colour map and a slide override', () => {
    const map = readClrMap(pkg.xml('ppt/slideMasters/slideMaster1.xml'));
    expect(map).toEqual(DEFAULT_CLR_MAP);
    const ctx: ColorContext = { scheme, clrMap: map };
    expect(resolveColor(colorElement('<a:schemeClr val="tx1"/>'), ctx)).toEqual({
      hex: '#000000',
      alpha: 1,
    });
    expect(resolveColor(colorElement('<a:schemeClr val="bg1"/>'), ctx)).toEqual({
      hex: '#ffffff',
      alpha: 1,
    });
    const swapped = clrMapOverride(
      parseXml(
        `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:clrMapOvr><a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`,
        'slide',
      ).document,
      map,
    );
    expect(swapped.tx1).toBe('lt1');
    expect(swapped.bg1).toBe('dk1');
    const kept = clrMapOverride(
      parseXml(
        `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
        'slide',
      ).document,
      map,
    );
    expect(kept).toBe(map);
  });

  it('maps eleven slots onto the record keys the theme validator admits (R03 4.2; SPEC-5 5.3)', () => {
    const colors = themeRecordColors(scheme);
    expect(Object.keys(colors)).toEqual(
      SCHEME_SLOTS.filter((slot) => slot !== 'folHlink').map((slot) => SCHEME_RECORD_KEYS[slot]),
    );
    expect(Object.keys(colors)).toEqual(THEME_COLOR_SLOTS.map((slot) => slot.key));
    expect(colors.ink).toBe('#000000');
    expect(colors.paper).toBe('#ffffff');
    expect(colors['ink-2']).toBe('#1f497d');
    expect(colors.plate).toBe('#eeece1');
    expect(colors.ok).toBe('#4f81bd');
    expect(colors.raised).toBe('#f79646');
    expect(colors.link).toBe('#0000ff');
    expect(colors['link-followed']).toBeUndefined();
  });
});

describe('resolveColor', () => {
  const scheme = readScheme(
    parseXml(
      `<a:theme xmlns:a="${A}" name="T"><a:themeElements><a:clrScheme name="S"><a:dk1><a:srgbClr val="070707"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="3A3D44"/></a:dk2><a:lt2><a:srgbClr val="F6F6F6"/></a:lt2><a:accent1><a:srgbClr val="2F5CE0"/></a:accent1></a:clrScheme></a:themeElements></a:theme>`,
      'theme',
    ).document,
  );
  const ctx: ColorContext = { scheme, clrMap: DEFAULT_CLR_MAP, phClr: '#123456' };

  it('resolves literals, presets, scRGB and HSL', () => {
    expect(resolveColor(colorElement('<a:srgbClr val="2f5ce0"/>'), ctx)).toEqual({
      hex: '#2f5ce0',
      alpha: 1,
    });
    expect(
      resolveColor(colorElement('<a:sysClr val="windowText" lastClr="000000"/>'), ctx)?.hex,
    ).toBe('#000000');
    expect(resolveColor(colorElement('<a:prstClr val="red"/>'), ctx)?.hex).toBe('#ff0000');
    expect(resolveColor(colorElement('<a:prstClr val="nosuch"/>'), ctx)).toBeUndefined();
    expect(resolveColor(colorElement('<a:scrgbClr r="100000" g="0" b="0"/>'), ctx)?.hex).toBe(
      '#ff0000',
    );
    expect(
      resolveColor(colorElement('<a:scrgbClr r="50000" g="50000" b="50000"/>'), ctx)?.hex,
    ).toBe('#bcbcbc');
    expect(
      resolveColor(colorElement('<a:hslClr hue="0" sat="100000" lum="50000"/>'), ctx)?.hex,
    ).toBe('#ff0000');
    expect(
      resolveColor(colorElement('<a:hslClr hue="14400000" sat="100000" lum="50000"/>'), ctx)?.hex,
    ).toBe('#0000ff');
    expect(resolveColor(colorElement('<a:schemeClr val="phClr"/>'), ctx)?.hex).toBe('#123456');
    expect(
      resolveColor(colorElement('<a:schemeClr val="phClr"/>'), { ...ctx, phClr: undefined }),
    ).toBeUndefined();
    // a slot the theme part left out takes the Office value
    expect(resolveColor(colorElement('<a:schemeClr val="accent6"/>'), ctx)?.hex).toBe('#f79646');
  });

  it('applies the modifiers in document order (R04 6)', () => {
    expect(
      resolveColor(colorElement('<a:srgbClr val="4F81BD"><a:alpha val="18000"/></a:srgbClr>'), ctx),
    ).toEqual({
      hex: '#4f81bd',
      alpha: 0.18,
    });
    expect(
      resolveColor(colorElement('<a:srgbClr val="808080"><a:lumMod val="50000"/></a:srgbClr>'), ctx)
        ?.hex,
    ).toBe('#404040');
    expect(
      resolveColor(
        colorElement(
          '<a:srgbClr val="808080"><a:lumMod val="50000"/><a:lumOff val="25000"/></a:srgbClr>',
        ),
        ctx,
      )?.hex,
    ).toBe('#808080');
    // a tint keeps t of the luminance and adds the rest as white; a shade keeps t of it
    expect(
      resolveColor(colorElement('<a:srgbClr val="000000"><a:tint val="50000"/></a:srgbClr>'), ctx)
        ?.hex,
    ).toBe('#808080');
    expect(
      resolveColor(colorElement('<a:srgbClr val="FFFFFF"><a:shade val="50000"/></a:srgbClr>'), ctx)
        ?.hex,
    ).toBe('#808080');
    expect(
      resolveColor(colorElement('<a:srgbClr val="FF0000"><a:satMod val="0"/></a:srgbClr>'), ctx)
        ?.hex,
    ).toBe('#808080');
    expect(
      resolveColor(colorElement('<a:srgbClr val="FF0000"><a:gray/></a:srgbClr>'), ctx)?.hex,
    ).toBe('#4c4c4c');
    expect(
      resolveColor(colorElement('<a:srgbClr val="FF0000"><a:inv/></a:srgbClr>'), ctx)?.hex,
    ).toBe('#00ffff');
    expect(
      resolveColor(colorElement('<a:srgbClr val="FF0000"><a:comp/></a:srgbClr>'), ctx)?.hex,
    ).toBe('#00ffff');
    expect(
      resolveColor(
        colorElement('<a:srgbClr val="FF0000"><a:hueOff val="7200000"/></a:srgbClr>'),
        ctx,
      )?.hex,
    ).toBe('#00ff00');
    expect(
      resolveColor(
        colorElement(
          '<a:schemeClr val="tx1"><a:alpha val="50%"/><a:alphaMod val="50000"/></a:schemeClr>',
        ),
        ctx,
      ),
    ).toEqual({ hex: '#070707', alpha: 0.25 });
  });

  it('reads the fill of a properties element: solid, none, gradient first stop, pattern, picture', () => {
    const props = (inner: string) =>
      parseXml(`<p:spPr xmlns:p="${P}" xmlns:a="${A}">${inner}</p:spPr>`, 'spPr').root;
    expect(readFill(props('<a:solidFill><a:schemeClr val="accent1"/></a:solidFill>'), ctx)).toEqual(
      {
        kind: 'solid',
        color: { hex: '#2f5ce0', alpha: 1 },
      },
    );
    expect(readFill(props('<a:noFill/>'), ctx)).toEqual({ kind: 'none' });
    expect(
      readFill(
        props(
          '<a:gradFill><a:gsLst><a:gs pos="100000"><a:srgbClr val="000000"/></a:gs><a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst></a:gradFill>',
        ),
        ctx,
      ),
    ).toEqual({ kind: 'gradient', color: { hex: '#ffffff', alpha: 1 }, stops: 2 });
    expect(
      readFill(
        props(
          '<a:pattFill prst="pct50"><a:fgClr><a:srgbClr val="FF0000"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>',
        ),
        ctx,
      ),
    ).toEqual({
      kind: 'pattern',
      color: { hex: '#ff0000', alpha: 1 },
      preset: 'pct50',
    });
    expect(readFill(props('<a:blipFill><a:blip/></a:blipFill>'), ctx)).toEqual({ kind: 'picture' });
    expect(readFill(props('<a:grpFill/>'), ctx)).toEqual({ kind: 'group' });
    expect(readFill(props('<a:xfrm/>'), ctx)).toBeUndefined();
  });
});

describe('snapColor (R04 6)', () => {
  it('snaps within twelve of a channel under adopt and keeps every hex under keep', () => {
    expect(snapColor('#000000', 'adopt')).toBe('ink');
    expect(snapColor('#0c0c0c', 'adopt')).toBe('ink');
    expect(snapColor('#0d0d0d', 'adopt')).toBe('ink');
    expect(snapColor('#141414', 'adopt')).toBe('#141414');
    expect(snapColor('#ffffff', 'adopt')).toBe('paper');
    expect(snapColor('#f4f4f4', 'adopt')).toBe('paper');
    expect(snapColor('#3a3d44', 'adopt')).toBe('ink-2');
    expect(snapColor('#8a8f98', 'adopt')).toBe('titanium');
    expect(snapColor('#2f5ce0', 'adopt')).toBe('blue');
    expect(snapColor('#12a37a', 'adopt')).toBe('green');
    expect(snapColor('#f0a020', 'adopt')).toBe('amber');
    expect(snapColor('#e5484d', 'adopt')).toBe('red');
    expect(snapColor('#4f81bd', 'adopt')).toBe('#4f81bd');
    expect(snapColor('#000000', 'keep')).toBe('#000000');
    expect(snapColor('#ffffff', 'keep')).toBe('#ffffff');
  });

  it('measures the channel distance and composites a translucent colour on a ground', () => {
    expect(channelDistance('#000000', '#070707')).toBe(7);
    expect(channelDistance('#ff0000', '#00ff00')).toBe(255);
    expect(compositeOn({ hex: '#070707', alpha: 0.18 }, '#ffffff')).toBe('#d2d2d2');
    expect(compositeOn({ hex: '#000000', alpha: 1 }, '#ffffff')).toBe('#000000');
  });

  it('normalises hex spellings', () => {
    expect(normalizeHex('4F81BD')).toBe('#4f81bd');
    expect(normalizeHex('#4f81bd')).toBe('#4f81bd');
    expect(normalizeHex('4F81B')).toBeUndefined();
    expect(rgbToHex(hexToRgb('#a1b2c3'))).toBe('#a1b2c3');
    expect(rgbToHex([300, -5, 12.6])).toBe('#ff000d');
  });
});
