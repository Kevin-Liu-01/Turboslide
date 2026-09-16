// The inheritance walk over fixture 01-text (R04 3 and the probe of R04 10): the title takes its
// box from the layout, the body placeholder its bullet from the master's bodyStyle, the sizes
// from the master's text styles, and a text box its own transform.
import { describe, expect, it } from 'vitest';

import { fixtureEntries } from './__tests__/unzip.ts';
import {
  DROPPED_PLACEHOLDER_TYPES,
  bodyProps,
  cNvPrOf,
  familyOf,
  inheritedXfrm,
  layoutPlaceholder,
  levelStyle,
  masterPlaceholder,
  ownXfrm,
  paragraphLevel,
  paragraphStyle,
  placeholderOf,
  placeholdersOf,
  slideChain,
  textStyleSources,
} from './inherit.ts';
import { openPackage, readPresentation, shapeTree } from './package.ts';
import { resolveColor } from './theme.ts';
import { sheetMapping, boxToPx, szToPx } from './units.ts';
import { attr, children, effectiveChildren, elementChildren, is } from './xml.ts';
import type { Element } from '@xmldom/xmldom';

const pkg = openPackage(fixtureEntries('01-text.pptx'));
const presentation = readPresentation(pkg);

function shapesOf(chain: ReturnType<typeof slideChain>): Element[] {
  const tree = shapeTree(chain.slide);
  if (tree === undefined) throw new Error('no tree');
  return effectiveChildren(tree).filter(
    (el) => !is(el, 'p', 'nvGrpSpPr') && !is(el, 'p', 'grpSpPr'),
  );
}

function named(chain: ReturnType<typeof slideChain>, name: string): Element {
  const shape = shapesOf(chain).find((el) => attr(cNvPrOf(el) as never, 'name') === name);
  if (shape === undefined) throw new Error(`no shape ${name}`);
  return shape;
}

describe('the chain of slide 1', () => {
  const chain = slideChain(pkg, 'ppt/slides/slide1.xml', presentation);

  it('names the layout, the master, the theme and the notes parts', () => {
    expect(chain.parts).toEqual({
      slide: 'ppt/slides/slide1.xml',
      layout: 'ppt/slideLayouts/slideLayout1.xml',
      master: 'ppt/slideMasters/slideMaster1.xml',
      theme: 'ppt/theme/theme1.xml',
      notes: 'ppt/notesSlides/notesSlide1.xml',
    });
    expect(chain.defaultTextStyle).toBe(presentation.defaultTextStyle);
    expect(chain.colors.scheme.fonts.minor).toBe('Calibri');
    expect(chain.colors.clrMap.tx1).toBe('dk1');
  });

  it('reads the placeholders: the title without idx, the subtitle with idx 1, the layout footer trio', () => {
    const title = named(chain, 'Title 1');
    expect(placeholderOf(title)).toEqual({
      type: 'ctrTitle',
      idx: 0,
      hasIdx: false,
      hasType: true,
    });
    const subtitle = named(chain, 'Subtitle 2');
    expect(placeholderOf(subtitle)).toEqual({
      type: 'subTitle',
      idx: 1,
      hasIdx: true,
      hasType: true,
    });
    expect(familyOf('ctrTitle')).toBe('title');
    expect(familyOf('subTitle')).toBe('body');
    expect(familyOf('sldNum')).toBe('sldNum');
    expect(familyOf('nosuch')).toBe('other');
    const layoutPhs = placeholdersOf(chain.layout as Element).map((p) => p.placeholder);
    expect(layoutPhs.map((p) => [p.type, p.idx])).toEqual([
      ['ctrTitle', 0],
      ['subTitle', 1],
      ['dt', 10],
      ['ftr', 11],
      ['sldNum', 12],
    ]);
    expect([...DROPPED_PLACEHOLDER_TYPES]).toEqual(['dt', 'ftr', 'sldNum', 'hdr', 'sldImg']);
  });

  it('takes the title box from the layout ctrTitle because the slide writes an empty spPr (R04 3)', () => {
    const title = named(chain, 'Title 1');
    expect(ownXfrm(title)).toBeUndefined();
    const inherited = inheritedXfrm(title, chain);
    expect(inherited?.from).toBe('layout');
    // the 4:3 template's box widened by four thirds by the fixture script: x 685800 to 914400, cx 7772400 to 10363200
    expect(inherited?.xfrm.off).toEqual([914_400, 2_130_425]);
    expect(inherited?.xfrm.ext).toEqual([10_363_200, 1_470_025]);
    expect(inherited?.xfrm.rot).toBe(0);
    const mapping = sheetMapping(presentation.size, 'match');
    expect(boxToPx(inherited?.xfrm.off as never, inherited?.xfrm.ext as never, mapping)).toEqual({
      x: 120,
      y: 279.58,
      w: 1360,
      h: 192.92,
    });
    const subtitle = named(chain, 'Subtitle 2');
    const sub = inheritedXfrm(subtitle, chain);
    expect(sub?.from).toBe('layout');
    expect(sub?.xfrm.off).toEqual([1_828_800, 3_886_200]);
  });

  it('matches the layout placeholder by idx then type and the master by family', () => {
    const layout = chain.layout as Element;
    const master = chain.master as Element;
    const title = placeholderOf(named(chain, 'Title 1')) as never;
    const fromLayout = layoutPlaceholder(layout, title);
    expect(fromLayout && attr(cNvPrOf(fromLayout) as never, 'name')).toBe('Title 1');
    const fromMaster = masterPlaceholder(master, title);
    expect(fromMaster && placeholderOf(fromMaster)?.type).toBe('title');
    const subtitle = placeholderOf(named(chain, 'Subtitle 2')) as never;
    const subFromMaster = masterPlaceholder(master, subtitle);
    expect(subFromMaster && placeholderOf(subFromMaster)?.type).toBe('body');
    // an unknown idx with a body type falls back to the family
    const orphan = layoutPlaceholder(layout, { type: 'body', idx: 7, hasIdx: true, hasType: true });
    expect(orphan && placeholderOf(orphan)?.type).toBe('subTitle');
    // a footer type with no layout counterpart of that idx matches by type
    const footer = layoutPlaceholder(layout, { type: 'ftr', idx: 0, hasIdx: false, hasType: true });
    expect(footer && placeholderOf(footer)?.idx).toBe(11);
    expect(
      masterPlaceholder(master, { type: 'nosuch', idx: 0, hasIdx: false, hasType: true }),
    ).toBeUndefined();
  });

  it('walks the title style: defaultTextStyle, titleStyle, the master and layout placeholders', () => {
    const title = named(chain, 'Title 1');
    const sources = textStyleSources(title, chain);
    // the presentation default, the master titleStyle, the master title's lstStyle, the layout title's lstStyle, the shape's own
    expect(sources.length).toBe(5);
    expect(is(sources[0], 'p', 'defaultTextStyle')).toBe(true);
    expect(is(sources[1], 'p', 'titleStyle')).toBe(true);
    const style = levelStyle(title, chain, 0);
    // the master's titleStyle: 44 pt centred, the theme's major face, tx1
    expect(style.run.sz).toBe('4400');
    expect(style.attrs.algn).toBe('ctr');
    expect(style.runElements.latin && attr(style.runElements.latin, 'typeface')).toBe('+mj-lt');
    const fill = style.runElements.solidFill;
    const colour = fill && elementChildren(fill)[0];
    expect(colour && resolveColor(colour, chain.colors)).toEqual({ hex: '#000000', alpha: 1 });
    expect(style.bullet).toEqual({ kind: 'none' });
    const mapping = sheetMapping(presentation.size, 'match');
    expect(szToPx(Number(style.run.sz), mapping)).toBe(73.5);
  });

  it('merges the subtitle style: the layout cancels the master bodyStyle bullet, centres and tints the colour', () => {
    const subtitle = named(chain, 'Subtitle 2');
    const style = levelStyle(subtitle, chain, 0);
    // the layout's subTitle lstStyle writes buNone, algn ctr, marL 0 and a tinted tx1; the size stays the master bodyStyle's 32 pt
    expect(style.bullet).toEqual({ kind: 'none' });
    expect(style.attrs.algn).toBe('ctr');
    expect(style.attrs.marL).toBe('0');
    expect(style.attrs.indent).toBe('0');
    expect(style.run.sz).toBe('3200');
    const fill = style.runElements.solidFill;
    const colour = fill && elementChildren(fill)[0];
    expect(colour && resolveColor(colour, chain.colors)).toEqual({ hex: '#404040', alpha: 1 });
  });
});

describe('the chain of slide 2', () => {
  const chain = slideChain(pkg, 'ppt/slides/slide2.xml', presentation);

  it('has no notes and reads a body placeholder with no type as obj', () => {
    expect(chain.parts.notes).toBeUndefined();
    const body = named(chain, 'Content Placeholder 2');
    expect(placeholderOf(body)).toEqual({ type: 'obj', idx: 1, hasIdx: true, hasType: false });
    // the Title and Content layout's placeholder writes an empty spPr too, so the box comes from the master
    const inherited = inheritedXfrm(body, chain);
    expect(inherited?.from).toBe('master');
    expect(inherited?.xfrm.off).toEqual([609_600, 1_600_200]);
    expect(inherited?.xfrm.ext).toEqual([10_972_800, 4_525_963]);
  });

  it('bullets the body from the master bodyStyle although the slide writes no buChar (the R04 10 probe)', () => {
    const body = named(chain, 'Content Placeholder 2');
    const paragraphs = children(children(body, 'p', 'txBody')[0] as Element, 'a', 'p');
    expect(paragraphs.map(paragraphLevel)).toEqual([0, 1, 2, 0]);
    const first = paragraphStyle(body, chain, paragraphs[0] as Element);
    expect(first.bullet).toEqual({ kind: 'char', char: '•' });
    expect(first.attrs.marL).toBe('342900');
    expect(first.attrs.indent).toBe('-342900');
    expect(first.run.sz).toBe('3200');
    expect(first.elements.buFont && attr(first.elements.buFont, 'typeface')).toBe('Arial');
    expect(first.elements.spcBef).toBeDefined();
    const second = paragraphStyle(body, chain, paragraphs[1] as Element);
    expect(second.bullet).toEqual({ kind: 'char', char: '–' });
    expect(second.run.sz).toBe('2800');
    expect(second.attrs.lvl).toBe('1');
    const third = paragraphStyle(body, chain, paragraphs[2] as Element);
    expect(third.bullet).toEqual({ kind: 'char', char: '•' });
    expect(third.run.sz).toBe('2400');
  });

  it('reads a text box with its own transform, the otherStyle walk and the autofit', () => {
    const box = named(chain, 'TextBox 3');
    expect(placeholderOf(box)).toBeUndefined();
    const own = inheritedXfrm(box, chain);
    expect(own?.from).toBe('shape');
    expect(own?.xfrm).toEqual({
      off: [685_800, 4_572_000],
      ext: [6_400_800, 1_371_600],
      rot: 0,
      flipH: false,
      flipV: false,
    });
    const sources = textStyleSources(box, chain);
    expect(sources.length).toBe(3);
    expect(is(sources[1], 'p', 'otherStyle')).toBe(true);
    const style = levelStyle(box, chain, 0);
    expect(style.bullet).toBeUndefined();
    expect(style.run.sz).toBe('1800');
    const body = bodyProps(box, chain);
    expect(body.attrs.anchor).toBe('ctr');
    expect(body.attrs.wrap).toBe('square');
    expect(body.autofit).toEqual({ kind: 'norm', fontScale: 1, lnSpcReduction: 0 });
    const numbered = named(chain, 'TextBox 4');
    expect(bodyProps(numbered, chain).autofit).toEqual({
      kind: 'shape',
      fontScale: 1,
      lnSpcReduction: 0,
    });
    const paragraphs = children(children(numbered, 'p', 'txBody')[0] as Element, 'a', 'p');
    const first = paragraphStyle(numbered, chain, paragraphs[0] as Element);
    expect(first.bullet).toEqual({ kind: 'autonum', scheme: 'arabicPeriod', startAt: 4 });
  });

  it('merges the body properties of a placeholder from the master and layout', () => {
    const body = named(chain, 'Content Placeholder 2');
    const props = bodyProps(body, chain);
    // the master body placeholder writes vert="horz", the four insets and normAutofit; the layout adds nothing
    expect(props.attrs.vert).toBe('horz');
    expect(props.attrs.lIns).toBe('91440');
    expect(props.attrs.anchor).toBeUndefined();
    expect(props.autofit).toEqual({ kind: 'norm', fontScale: 1, lnSpcReduction: 0 });
  });
});

describe('the chain of slide 3', () => {
  it('reads the Title Only layout with a title placeholder and a plain text box', () => {
    const chain = slideChain(pkg, 'ppt/slides/slide3.xml', presentation);
    expect(chain.parts.layout).toBe('ppt/slideLayouts/slideLayout6.xml');
    const title = named(chain, 'Title 1');
    expect(placeholderOf(title)?.type).toBe('title');
    // the Title Only layout's title writes an empty spPr, so the box is the master title's
    expect(inheritedXfrm(title, chain)?.from).toBe('master');
    expect(inheritedXfrm(title, chain)?.xfrm.off).toEqual([609_600, 274_638]);
    const box = named(chain, 'TextBox 2');
    expect(inheritedXfrm(box, chain)?.from).toBe('shape');
  });
});
