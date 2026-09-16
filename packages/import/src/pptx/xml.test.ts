// The XML layer: namespace aware parsing, the DOCTYPE refusal, the attribute helpers and the
// mc:AlternateContent branch rule (R04 3, 8).
import { describe, expect, it } from 'vitest';

import {
  NS,
  alternateBranch,
  attr,
  attrNS,
  boolAttr,
  child,
  children,
  descendants,
  effectiveChildren,
  intAttr,
  is,
  ownText,
  parseXml,
  path,
  qualifiedName,
} from './xml.ts';

const SLIDE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}" xmlns:mc="${NS.mc}">
  <p:cSld name="One">
    <p:spTree>
      <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:p><a:r><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp>
      <mc:AlternateContent xmlns:p14="${NS.p14}">
        <mc:Choice Requires="p14"><p:sp><p:nvSpPr><p:cNvPr id="3" name="Choice"/></p:nvSpPr></p:sp></mc:Choice>
        <mc:Fallback><p:sp><p:nvSpPr><p:cNvPr id="3" name="Fallback"/></p:nvSpPr></p:sp></mc:Fallback>
      </mc:AlternateContent>
      <mc:AlternateContent xmlns:z9="urn:unknown">
        <mc:Choice Requires="z9"><p:sp><p:nvSpPr><p:cNvPr id="4" name="Unknown choice"/></p:nvSpPr></p:sp></mc:Choice>
        <mc:Fallback><p:pic><p:nvPicPr><p:cNvPr id="4" name="Unknown fallback"/></p:nvPicPr></p:pic></mc:Fallback>
      </mc:AlternateContent>
      <p:pic><p:nvPicPr><p:cNvPr id="5" name="Picture" hidden="1"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`;

describe('parseXml', () => {
  it('parses a part namespace aware and walks by namespace and local name', () => {
    const { root } = parseXml(SLIDE, 'slide1.xml');
    expect(is(root, 'p', 'sld')).toBe(true);
    const cSld = child(root, 'p', 'cSld');
    expect(cSld && attr(cSld, 'name')).toBe('One');
    const tree = path(root, ['p', 'cSld'], ['p', 'spTree']);
    expect(tree).toBeDefined();
    expect(
      children(tree as never, 'p', 'sp').map((sp) =>
        attr(child(child(sp, 'p', 'nvSpPr') as never, 'p', 'cNvPr') as never, 'name'),
      ),
    ).toEqual(['Title 1']);
    const blip = descendants(root, 'a', 'blip')[0];
    expect(blip && attrNS(blip, 'r', 'embed')).toBe('rId2');
    const title = descendants(root, 'a', 't')[0];
    expect(title && ownText(title)).toBe('Hello');
    const cNvPr = descendants(root, 'p', 'cNvPr').find((el) => attr(el, 'name') === 'Picture');
    expect(cNvPr && intAttr(cNvPr, 'id')).toBe(5);
    expect(cNvPr && boolAttr(cNvPr, 'hidden')).toBe(true);
    expect(cNvPr && qualifiedName(cNvPr)).toBe('p:cNvPr');
  });

  it('refuses a DOCTYPE and an entity declaration before parsing (SPEC-5 1.1 rule 6)', () => {
    expect(() =>
      parseXml('<!DOCTYPE p:sld SYSTEM "x.dtd"><p:sld xmlns:p="urn:p"/>', 'slide1.xml'),
    ).toThrow(/DOCTYPE/);
    expect(() =>
      parseXml(
        '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>',
        'part',
      ),
    ).toThrow(/DOCTYPE/);
  });

  it('refuses a part that is not well formed with the part name', () => {
    expect(() =>
      parseXml('<p:sld xmlns:p="urn:p"><p:cSld></p:sld>', 'ppt/slides/slide9.xml'),
    ).toThrow(/slide9\.xml is not well formed/);
    expect(() => parseXml('<p:sld>', 'unbound.xml')).toThrow(/unbound\.xml/);
  });

  it('takes the Choice whose Requires names an understood namespace, else the Fallback', () => {
    const { root } = parseXml(SLIDE, 'slide1.xml');
    const tree = path(root, ['p', 'cSld'], ['p', 'spTree']);
    if (tree === undefined) throw new Error('no tree');
    const alternates = children(tree, 'mc', 'AlternateContent');
    expect(alternates).toHaveLength(2);
    const first = alternateBranch(alternates[0] as never);
    expect(first && is(first, 'mc', 'Choice')).toBe(true);
    const second = alternateBranch(alternates[1] as never);
    expect(second && is(second, 'mc', 'Fallback')).toBe(true);
    const names = effectiveChildren(tree).map((el) => {
      const nv = children(el, 'p', el.localName === 'pic' ? 'nvPicPr' : 'nvSpPr')[0];
      return nv && attr(child(nv, 'p', 'cNvPr') as never, 'name');
    });
    expect(names).toEqual(['Title 1', 'Choice', 'Unknown fallback', 'Picture']);
  });
});
