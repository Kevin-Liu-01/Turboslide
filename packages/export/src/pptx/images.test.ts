// The picture effects in the Editable text file (gslides-parity SPEC-5 0.47, 11; MILESTONES-5 B2
// day 6): Grayscale and the duotones as native blip elements with the theme's colours resolved
// to hex, the rewrite over the named pictures, the presets that bake answering no element, and
// the residual lines for a reflection, Sepia and Negative.
import { describe, expect, it } from 'vitest';

import {
  pictureEffectResiduals,
  recolorBlipXml,
  recolorResolverFor,
  rewriteRecolorBlips,
} from './images.ts';

const resolve = recolorResolverFor({
  ink: '#101010',
  paper: '#f4f1ea',
  'ink-2': '#5a5a5a',
  titanium: '#8a8f98',
});

function pic(name: string, id: number, blip = '<a:blip r:embed="rId2"/>'): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}" descr="A photo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill>${blip}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

const slide = (body: string): string =>
  '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="gallery"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  body +
  '</p:spTree></p:cSld></p:sld>';

describe('recolorBlipXml', () => {
  it('writes a:grayscl for Grayscale and a:duotone with the shadow then the highlight colour for a duotone', () => {
    expect(recolorBlipXml('grayscale', resolve)).toBe('<a:grayscl/>');
    expect(recolorBlipXml('ink-light', resolve)).toBe(
      '<a:duotone><a:srgbClr val="101010"/><a:srgbClr val="F4F1EA"/></a:duotone>',
    );
    expect(recolorBlipXml('green-dark', resolve)).toBe(
      '<a:duotone><a:srgbClr val="101010"/><a:srgbClr val="12A37A"/></a:duotone>',
    );
    expect(recolorBlipXml('ink-dark', resolve)).toBe(
      '<a:duotone><a:srgbClr val="101010"/><a:srgbClr val="8A8F98"/></a:duotone>',
    );
  });

  it('answers null for none and for the presets that bake into the raster', () => {
    expect(recolorBlipXml(undefined, resolve)).toBeNull();
    expect(recolorBlipXml('none', resolve)).toBeNull();
    expect(recolorBlipXml('sepia', resolve)).toBeNull();
    expect(recolorBlipXml('negative', resolve)).toBeNull();
  });

  it('resolves a hex as it is and a token the theme spells oddly to a neutral grey', () => {
    expect(resolve('#AbCdEf')).toBe('ABCDEF');
    expect(recolorResolverFor({ ink: 'rgb(0 0 0)' })('ink')).toBe('808080');
  });
});

describe('rewriteRecolorBlips', () => {
  it('inserts the element into the named picture blip, self closing or not, once, and leaves the rest alone', () => {
    const xml = slide(
      pic('ts:gallery#pic', 4) +
        pic('ts:gallery#other', 5) +
        pic('ts:gallery#open', 6, '<a:blip r:embed="rId3"><a:extLst/></a:blip>'),
    );
    const first = rewriteRecolorBlips(
      xml,
      [
        { name: 'ts:gallery#pic', preset: 'grayscale' },
        { name: 'ts:gallery#open', preset: 'amber-light' },
        { name: 'ts:gallery#missing', preset: 'grayscale' },
        { name: 'ts:gallery#other', preset: 'sepia' },
      ],
      resolve,
    );
    expect(first.written).toBe(2);
    expect(first.xml).toContain('<p:cNvPr id="4" name="ts:gallery#pic" descr="A photo"/>');
    expect(first.xml).toContain('<a:blip r:embed="rId2"><a:grayscl/></a:blip>');
    expect(first.xml).toContain(
      '<a:blip r:embed="rId3"><a:duotone><a:srgbClr val="F0A020"/><a:srgbClr val="F4F1EA"/></a:duotone><a:extLst/></a:blip>',
    );
    // the sepia picture keeps its plain blip
    expect(first.xml.match(/<a:blip r:embed="rId2"\/>/g)).toHaveLength(1);
    // a second pass writes nothing more
    const second = rewriteRecolorBlips(
      first.xml,
      [{ name: 'ts:gallery#pic', preset: 'grayscale' }],
      resolve,
    );
    expect(second.written).toBe(0);
    expect(second.xml).toBe(first.xml);
  });

  it('finds a picture pptxgenjs suffixed with @n', () => {
    const out = rewriteRecolorBlips(
      slide(pic('ts:gallery#pic@2', 4)),
      [{ name: 'ts:gallery#pic', preset: 'grayscale' }],
      resolve,
    );
    expect(out.written).toBe(1);
  });
});

describe('pictureEffectResiduals', () => {
  it('names a baked reflection and a baked recolor and stays silent for a native preset', () => {
    const lines = pictureEffectResiduals([
      {
        slideId: 'gallery',
        blockId: 'pic',
        reflection: { transparency: 0.4, distance: 12, size: 0.5 },
        recolor: 'sepia',
      },
      { slideId: 'gallery', blockId: 'other', recolor: 'grayscale' },
      { slideId: 'gallery', blockId: 'third', recolor: 'none' },
    ]);
    expect(lines).toEqual([
      "gallery#pic: the reflection (transparency 0.4, distance 12 px, size 0.5) is baked into the picture raster; PowerPoint's own reflection curve is not written",
      'gallery#pic: the sepia recolor is baked into the picture raster; the OOXML schema has no per pixel element for it',
    ]);
  });
});
