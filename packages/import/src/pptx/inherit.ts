// The inheritance walk of the PPTX reader (gslides-parity SPEC-5 5.1; R04 section 3, the probe of
// section 10): a placeholder on a slide inherits everything it does not set. The chain of a slide
// is its layout (the `slideLayout` relationship), the layout's master and the master's theme, and
// the resolution order for a box is the shape's own `a:xfrm`, then the layout placeholder with the
// same `idx` (then the same type), then the master placeholder of the same family; for a text
// style it is the presentation's `p:defaultTextStyle`, the master's `p:txStyles` (`titleStyle`
// for the title family, `bodyStyle` for the body family, `otherStyle` for everything else), the
// master placeholder's `a:lstStyle`, the layout placeholder's, the shape's own, then the
// paragraph's `a:pPr` and the run's `a:rPr`, each source overriding what it sets. The probe of R04
// 10 is the test: the title on slide 1 has `<p:spPr/>` and takes its box from the layout's
// `ctrTitle`; the master's `p:bodyStyle` carries `a:buChar` on level one, so a body placeholder is
// bulleted although the slide writes no bullet.
import type { Document, Element } from '@xmldom/xmldom';
import type { PptxPackage, PresentationInfo } from './package.ts';
import { REL, shapeTree } from './package.ts';
import type { ColorContext } from './theme.ts';
import { clrMapOverride, readClrMap, readScheme } from './theme.ts';
import { percentOf } from './units.ts';
import { attr, boolAttr, child, elementChildren, intAttr, is, parseXml, path } from './xml.ts';

/** A `p:ph` as read: `type` defaults to `obj` and `idx` to 0 (ECMA 376 19.3.1.36). */
export type Placeholder = {
  type: string;
  idx: number;
  /** the `idx` attribute was written (a title usually carries none) */
  hasIdx: boolean;
  /** the `type` attribute was written */
  hasType: boolean;
  orient?: string;
  sz?: string;
};

/** The master placeholder family a type resolves to (python-pptx's base placeholder rule; R04 3). */
export const PLACEHOLDER_FAMILY: Readonly<Record<string, string>> = {
  body: 'body',
  chart: 'body',
  bitClip: 'body',
  clipArt: 'body',
  dgm: 'body',
  media: 'body',
  obj: 'body',
  pic: 'body',
  tbl: 'body',
  subTitle: 'body',
  ctrTitle: 'title',
  title: 'title',
  dt: 'dt',
  ftr: 'ftr',
  sldNum: 'sldNum',
  hdr: 'hdr',
  sldImg: 'sldImg',
};

/** The placeholder families the frame draws itself and the reader drops (R04 5.2). */
export const DROPPED_PLACEHOLDER_TYPES: ReadonlySet<string> = new Set([
  'dt',
  'ftr',
  'sldNum',
  'hdr',
  'sldImg',
]);

export function familyOf(type: string): string {
  return PLACEHOLDER_FAMILY[type] ?? 'other';
}

/** The `p:nvPr` of a shape, picture, graphic frame, connector or group (`p:nv*Pr/p:nvPr`). */
export function nvPrOf(shape: Element): Element | undefined {
  for (const node of elementChildren(shape)) {
    const local = node.localName ?? '';
    if (
      node.namespaceURI === 'http://schemas.openxmlformats.org/presentationml/2006/main' &&
      local.startsWith('nv') &&
      local.endsWith('Pr')
    ) {
      return child(node, 'p', 'nvPr');
    }
  }
  return undefined;
}

/** The `p:cNvPr` of a shape: its `id`, `name`, `descr` and `hidden`. */
export function cNvPrOf(shape: Element): Element | undefined {
  for (const node of elementChildren(shape)) {
    const local = node.localName ?? '';
    if (
      node.namespaceURI === 'http://schemas.openxmlformats.org/presentationml/2006/main' &&
      local.startsWith('nv') &&
      local.endsWith('Pr')
    ) {
      return child(node, 'p', 'cNvPr');
    }
  }
  return undefined;
}

/** The placeholder record of a shape, or undefined for a plain shape. */
export function placeholderOf(shape: Element): Placeholder | undefined {
  const nvPr = nvPrOf(shape);
  const ph = nvPr && child(nvPr, 'p', 'ph');
  if (ph === undefined) return undefined;
  const type = attr(ph, 'type');
  const idx = intAttr(ph, 'idx');
  const out: Placeholder = {
    type: type ?? 'obj',
    idx: idx ?? 0,
    hasIdx: idx !== undefined,
    hasType: type !== undefined,
  };
  const orient = attr(ph, 'orient');
  const sz = attr(ph, 'sz');
  if (orient !== undefined) out.orient = orient;
  if (sz !== undefined) out.sz = sz;
  return out;
}

export type PlaceholderShape = { element: Element; placeholder: Placeholder };

/** Every placeholder shape of a layout or master part's tree (shapes, pictures and graphic frames). */
export function placeholdersOf(partRoot: Element): PlaceholderShape[] {
  const tree = shapeTree(partRoot);
  if (tree === undefined) return [];
  const out: PlaceholderShape[] = [];
  for (const node of elementChildren(tree)) {
    const placeholder = placeholderOf(node);
    if (placeholder !== undefined) out.push({ element: node, placeholder });
  }
  return out;
}

/**
 * The layout placeholder a slide placeholder inherits from (R04 3): the one with the same `idx`
 * (a title's absent `idx` is 0 on both sides), else the first of the same type, else the first of
 * the same family when the type is a title or a body kind.
 */
export function layoutPlaceholder(layoutRoot: Element, ph: Placeholder): Element | undefined {
  const candidates = placeholdersOf(layoutRoot);
  const byIdx = candidates.find((c) => c.placeholder.idx === ph.idx);
  if (byIdx !== undefined && (ph.hasIdx || ph.idx === 0)) {
    // an idx match with an incompatible family is a coincidence of numbering, not inheritance
    if (
      !byIdx.placeholder.hasType ||
      !ph.hasType ||
      familyOf(byIdx.placeholder.type) === familyOf(ph.type)
    ) {
      return byIdx.element;
    }
  }
  const byType = candidates.find((c) => c.placeholder.type === ph.type);
  if (byType !== undefined) return byType.element;
  const family = familyOf(ph.type);
  if (family === 'title' || family === 'body') {
    const byFamily = candidates.find((c) => familyOf(c.placeholder.type) === family);
    if (byFamily !== undefined) return byFamily.element;
  }
  return undefined;
}

/** The master placeholder of the same family (`title`, `body`, `dt`, `ftr`, `sldNum`). */
export function masterPlaceholder(masterRoot: Element, ph: Placeholder): Element | undefined {
  const family = familyOf(ph.type);
  if (family === 'other') return undefined;
  return placeholdersOf(masterRoot).find((c) => familyOf(c.placeholder.type) === family)?.element;
}

export type Xfrm = {
  off: [number, number];
  ext: [number, number];
  /** `rot` in 60,000ths of a degree as written; 0 when absent */
  rot: number;
  flipH: boolean;
  flipV: boolean;
  /** a group's child space (`a:chOff`, `a:chExt`), on `p:grpSpPr` transforms */
  chOff?: [number, number];
  chExt?: [number, number];
};

function readXfrm(xfrm: Element): Xfrm | undefined {
  const off = child(xfrm, 'a', 'off');
  const ext = child(xfrm, 'a', 'ext');
  if (off === undefined || ext === undefined) return undefined;
  const x = intAttr(off, 'x');
  const y = intAttr(off, 'y');
  const cx = intAttr(ext, 'cx');
  const cy = intAttr(ext, 'cy');
  if (x === undefined || y === undefined || cx === undefined || cy === undefined) return undefined;
  const out: Xfrm = {
    off: [x, y],
    ext: [cx, cy],
    rot: intAttr(xfrm, 'rot') ?? 0,
    flipH: boolAttr(xfrm, 'flipH') === true,
    flipV: boolAttr(xfrm, 'flipV') === true,
  };
  const chOff = child(xfrm, 'a', 'chOff');
  const chExt = child(xfrm, 'a', 'chExt');
  if (chOff !== undefined && chExt !== undefined) {
    const cox = intAttr(chOff, 'x');
    const coy = intAttr(chOff, 'y');
    const cex = intAttr(chExt, 'cx');
    const cey = intAttr(chExt, 'cy');
    if (cox !== undefined && coy !== undefined && cex !== undefined && cey !== undefined) {
      out.chOff = [cox, coy];
      out.chExt = [cex, cey];
    }
  }
  return out;
}

/**
 * A shape's own transform: `p:spPr/a:xfrm` on shapes, pictures and connectors, `p:xfrm` on a
 * graphic frame, `p:grpSpPr/a:xfrm` on a group; undefined when the shape writes none (a
 * placeholder inheriting its box, or a producer's omission).
 */
export function ownXfrm(shape: Element): Xfrm | undefined {
  // `p:spPr` and `p:grpSpPr` by namespace; a diagram drawing's `dsp:spPr` (R04 5.10) by local name
  const spPr =
    child(shape, 'p', 'spPr') ??
    child(shape, 'p', 'grpSpPr') ??
    elementChildren(shape).find(
      (node) => node.localName === 'spPr' || node.localName === 'grpSpPr',
    );
  const xfrm =
    (spPr && child(spPr, 'a', 'xfrm')) ??
    child(shape, 'p', 'xfrm') ??
    elementChildren(shape).find((node) => node.localName === 'xfrm');
  return xfrm === undefined ? undefined : readXfrm(xfrm);
}

export type SlideChain = {
  parts: { slide: string; layout?: string; master?: string; theme?: string; notes?: string };
  /** the `p:sld` root */
  slide: Element;
  /** the `p:sldLayout` root */
  layout?: Element;
  /** the `p:sldMaster` root */
  master?: Element;
  theme?: Document;
  /** the `p:notes` root */
  notes?: Element;
  /** `p:defaultTextStyle` of the presentation part */
  defaultTextStyle?: Element;
  /** the theme's scheme and the colour map after the layout's and the slide's overrides */
  colors: ColorContext;
};

/** The chain of one slide part (R04 3): layout, master, theme and notes through the relationships. */
export function slideChain(
  pkg: PptxPackage,
  slidePart: string,
  presentation?: Pick<PresentationInfo, 'defaultTextStyle'>,
): SlideChain {
  const slide = pkg.root(slidePart);
  const layoutPart = pkg.firstRelated(slidePart, REL.slideLayout);
  const masterPart =
    layoutPart === undefined ? undefined : pkg.firstRelated(layoutPart, REL.slideMaster);
  const themePart = masterPart === undefined ? undefined : pkg.firstRelated(masterPart, REL.theme);
  const notesPart = pkg.firstRelated(slidePart, REL.notesSlide);
  const layout = layoutPart === undefined ? undefined : pkg.root(layoutPart);
  const master = masterPart === undefined ? undefined : pkg.root(masterPart);
  const theme = themePart === undefined ? undefined : pkg.xml(themePart);
  const notes = notesPart === undefined ? undefined : pkg.root(notesPart);
  const scheme = readScheme(theme ?? emptyTheme());
  let clrMap = master === undefined ? readClrMap(emptyTheme()) : readClrMap(master);
  if (layout !== undefined) clrMap = clrMapOverride(layout, clrMap);
  clrMap = clrMapOverride(slide, clrMap);
  const chain: SlideChain = {
    parts: { slide: slidePart },
    slide,
    colors: { scheme, clrMap },
  };
  if (layoutPart !== undefined && layout !== undefined) {
    chain.parts.layout = layoutPart;
    chain.layout = layout;
  }
  if (masterPart !== undefined && master !== undefined) {
    chain.parts.master = masterPart;
    chain.master = master;
  }
  if (themePart !== undefined && theme !== undefined) {
    chain.parts.theme = themePart;
    chain.theme = theme;
  }
  if (notesPart !== undefined && notes !== undefined) {
    chain.parts.notes = notesPart;
    chain.notes = notes;
  }
  if (presentation?.defaultTextStyle !== undefined)
    chain.defaultTextStyle = presentation.defaultTextStyle;
  return chain;
}

let emptyThemeDocument: Document | undefined;

/** A theme document with no scheme, so a package without a theme part still resolves colours to the Office defaults. */
function emptyTheme(): Document {
  if (emptyThemeDocument === undefined) {
    emptyThemeDocument = parseXml(
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name=""><a:themeElements/></a:theme>',
      'empty theme',
    ).document;
  }
  return emptyThemeDocument;
}

/** The layout placeholder of a slide shape, when the chain has a layout. */
export function layoutPlaceholderOf(shape: Element, chain: SlideChain): Element | undefined {
  const ph = placeholderOf(shape);
  if (ph === undefined || chain.layout === undefined) return undefined;
  return layoutPlaceholder(chain.layout, ph);
}

/** The master placeholder of a slide shape, when the chain has a master. */
export function masterPlaceholderOf(shape: Element, chain: SlideChain): Element | undefined {
  const ph = placeholderOf(shape);
  if (ph === undefined || chain.master === undefined) return undefined;
  return masterPlaceholder(chain.master, ph);
}

/** The shape's box after the placeholder walk (R04 3): its own, the layout placeholder's, the master placeholder's. */
export function inheritedXfrm(
  shape: Element,
  chain: SlideChain,
): { xfrm: Xfrm; from: 'shape' | 'layout' | 'master' } | undefined {
  const own = ownXfrm(shape);
  if (own !== undefined) return { xfrm: own, from: 'shape' };
  const fromLayout = layoutPlaceholderOf(shape, chain);
  const layoutXfrm = fromLayout && ownXfrm(fromLayout);
  if (layoutXfrm !== undefined) return { xfrm: layoutXfrm, from: 'layout' };
  const fromMaster = masterPlaceholderOf(shape, chain);
  const masterXfrm = fromMaster && ownXfrm(fromMaster);
  if (masterXfrm !== undefined) return { xfrm: masterXfrm, from: 'master' };
  return undefined;
}

export type BulletStyle =
  | { kind: 'none' }
  | { kind: 'char'; char: string }
  | { kind: 'autonum'; scheme: string; startAt: number }
  | { kind: 'blip' };

/** The merged paragraph and run defaults for one list level after the style walk. */
export type LevelStyle = {
  /** `a:pPr` attributes: `marL`, `indent`, `algn`, `defTabSz`, `rtl`, `lvl`, ... */
  attrs: Record<string, string>;
  /** `a:pPr` children by local name (`lnSpc`, `spcBef`, `spcAft`, `buFont`, `buFontTx`, `buSzPct`, `buClr`, `tabLst`), the bullet kind excluded */
  elements: Record<string, Element>;
  bullet?: BulletStyle;
  /** `a:defRPr` attributes: `sz`, `b`, `i`, `u`, `strike`, `cap`, `spc`, `baseline`, `kern`, `lang` */
  run: Record<string, string>;
  /** `a:defRPr` children by local name (`solidFill`, `latin`, `highlight`, `ln`, `effectLst`, ...) */
  runElements: Record<string, Element>;
};

export function emptyLevelStyle(): LevelStyle {
  return { attrs: {}, elements: {}, run: {}, runElements: {} };
}

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

function copyAttributes(el: Element, into: Record<string, string>): void {
  const attributes = el.attributes;
  for (let i = 0; i < attributes.length; i += 1) {
    const attribute = attributes[i];
    if (attribute === undefined || attribute === null) continue;
    // namespaced attributes (xmlns declarations) are not style
    if (attribute.namespaceURI !== null && attribute.namespaceURI !== '') continue;
    into[attribute.name] = attribute.value;
  }
}

/** Merges the run properties of an `a:defRPr`, `a:rPr` or `a:endParaRPr` into the style's run defaults. */
export function mergeRunProps(style: LevelStyle, rPr: Element | undefined): LevelStyle {
  if (rPr === undefined) return style;
  copyAttributes(rPr, style.run);
  for (const node of elementChildren(rPr)) {
    if (node.namespaceURI !== A_NS) continue;
    const local = node.localName ?? '';
    // one fill at a time: a later solid fill replaces an earlier gradient and the reverse
    if (local.endsWith('Fill')) {
      for (const key of Object.keys(style.runElements)) {
        if (key.endsWith('Fill')) delete style.runElements[key];
      }
    }
    style.runElements[local] = node;
  }
  return style;
}

/** Merges one `a:pPr`, `a:lvlNpPr` or `a:defPPr` into the style (the higher priority source last). */
export function mergeParagraphProps(style: LevelStyle, pPr: Element | undefined): LevelStyle {
  if (pPr === undefined) return style;
  copyAttributes(pPr, style.attrs);
  for (const node of elementChildren(pPr)) {
    if (node.namespaceURI !== A_NS) continue;
    switch (node.localName) {
      case 'buNone':
        style.bullet = { kind: 'none' };
        break;
      case 'buChar':
        style.bullet = { kind: 'char', char: attr(node, 'char') ?? '•' };
        break;
      case 'buAutoNum':
        style.bullet = {
          kind: 'autonum',
          scheme: attr(node, 'type') ?? 'arabicPeriod',
          startAt: intAttr(node, 'startAt') ?? 1,
        };
        break;
      case 'buBlip':
        style.bullet = { kind: 'blip' };
        break;
      case 'defRPr':
        mergeRunProps(style, node);
        break;
      case 'buFont':
        delete style.elements.buFontTx;
        style.elements.buFont = node;
        break;
      case 'buFontTx':
        delete style.elements.buFont;
        style.elements.buFontTx = node;
        break;
      case 'buSzPct':
      case 'buSzPts':
      case 'buSzTx':
        delete style.elements.buSzPct;
        delete style.elements.buSzPts;
        delete style.elements.buSzTx;
        style.elements[node.localName] = node;
        break;
      case 'buClr':
      case 'buClrTx':
        delete style.elements.buClr;
        delete style.elements.buClrTx;
        style.elements[node.localName] = node;
        break;
      case 'extLst':
        break;
      default:
        style.elements[node.localName ?? ''] = node;
    }
  }
  return style;
}

/** The `a:lvlNpPr` of a list style like element (`a:lstStyle`, `p:bodyStyle`, `p:defaultTextStyle`) for a zero based level. */
export function levelElement(listStyle: Element, level: number): Element | undefined {
  return child(listStyle, 'a', `lvl${Math.min(9, Math.max(1, level + 1))}pPr`);
}

/** The `a:lstStyle` of a shape's `p:txBody`, when it has one. */
export function listStyleOf(shape: Element): Element | undefined {
  return path(shape, ['p', 'txBody'], ['a', 'lstStyle']);
}

/**
 * The text style sources of a shape in priority order, the lowest first (R04 3): the
 * presentation's default style, the master's `titleStyle`, `bodyStyle` or `otherStyle`, the
 * master placeholder's list style, the layout placeholder's, the shape's own.
 */
export function textStyleSources(shape: Element, chain: SlideChain): Element[] {
  const sources: Element[] = [];
  if (chain.defaultTextStyle !== undefined) sources.push(chain.defaultTextStyle);
  const ph = placeholderOf(shape);
  const family = ph === undefined ? 'other' : familyOf(ph.type);
  if (chain.master !== undefined) {
    const txStyles = child(chain.master, 'p', 'txStyles');
    if (txStyles !== undefined) {
      const name =
        family === 'title' ? 'titleStyle' : family === 'body' ? 'bodyStyle' : 'otherStyle';
      const style = child(txStyles, 'p', name);
      if (style !== undefined) sources.push(style);
    }
    if (ph !== undefined) {
      const masterPh = masterPlaceholder(chain.master, ph);
      const masterList = masterPh && listStyleOf(masterPh);
      if (masterList !== undefined) sources.push(masterList);
    }
  }
  if (ph !== undefined && chain.layout !== undefined) {
    const layoutPh = layoutPlaceholder(chain.layout, ph);
    const layoutList = layoutPh && listStyleOf(layoutPh);
    if (layoutList !== undefined) sources.push(layoutList);
  }
  const own = listStyleOf(shape);
  if (own !== undefined) sources.push(own);
  return sources;
}

/** The merged style of one level for a shape, before the paragraph's own `a:pPr` (R04 3). */
export function levelStyle(shape: Element, chain: SlideChain, level: number): LevelStyle {
  const style = emptyLevelStyle();
  for (const source of textStyleSources(shape, chain)) {
    // a:defPPr applies to every level before the level's own properties
    mergeParagraphProps(style, child(source, 'a', 'defPPr'));
    mergeParagraphProps(style, levelElement(source, level));
  }
  return style;
}

/** The zero based level of a paragraph (`a:pPr lvl`, default 0). */
export function paragraphLevel(paragraph: Element): number {
  const pPr = child(paragraph, 'a', 'pPr');
  return pPr === undefined ? 0 : Math.min(8, Math.max(0, intAttr(pPr, 'lvl') ?? 0));
}

/** The level style with the paragraph's own `a:pPr` merged: what its runs inherit. */
export function paragraphStyle(shape: Element, chain: SlideChain, paragraph: Element): LevelStyle {
  const style = levelStyle(shape, chain, paragraphLevel(paragraph));
  return mergeParagraphProps(style, child(paragraph, 'a', 'pPr'));
}

/** A copy of a style so a run's properties merge without changing the paragraph's. */
export function cloneStyle(style: LevelStyle): LevelStyle {
  return {
    attrs: { ...style.attrs },
    elements: { ...style.elements },
    ...(style.bullet ? { bullet: style.bullet } : {}),
    run: { ...style.run },
    runElements: { ...style.runElements },
  };
}

export type AutofitReading = {
  kind: 'norm' | 'shape' | 'none';
  /** `a:normAutofit fontScale`, a fraction; 1 when absent */
  fontScale: number;
  /** `a:normAutofit lnSpcReduction`, a fraction; 0 when absent */
  lnSpcReduction: number;
};

export type BodyProps = {
  /** `a:bodyPr` attributes merged master, layout, shape: `anchor`, `wrap`, `lIns`, `tIns`, `rIns`, `bIns`, `numCol`, `spcCol`, `vert`, `anchorCtr`, `upright` */
  attrs: Record<string, string>;
  /** the most specific autofit child, when any source writes one */
  autofit?: AutofitReading;
};

function bodyPrOf(shape: Element): Element | undefined {
  return path(shape, ['p', 'txBody'], ['a', 'bodyPr']);
}

/** The merged `a:bodyPr` of a shape (R04 5.2): the master placeholder's, the layout placeholder's, then the shape's. */
export function bodyProps(shape: Element, chain: SlideChain): BodyProps {
  const sources: Element[] = [];
  const masterPh = masterPlaceholderOf(shape, chain);
  const layoutPh = layoutPlaceholderOf(shape, chain);
  for (const owner of [masterPh, layoutPh, shape]) {
    const bodyPr = owner && bodyPrOf(owner);
    if (bodyPr !== undefined) sources.push(bodyPr);
  }
  const out: BodyProps = { attrs: {} };
  for (const bodyPr of sources) {
    copyAttributes(bodyPr, out.attrs);
    for (const node of elementChildren(bodyPr)) {
      if (is(node, 'a', 'normAutofit')) {
        const scale = node.getAttribute('fontScale');
        const reduction = node.getAttribute('lnSpcReduction');
        out.autofit = {
          kind: 'norm',
          fontScale: percentOf(scale ?? undefined) ?? 1,
          lnSpcReduction: percentOf(reduction ?? undefined) ?? 0,
        };
      } else if (is(node, 'a', 'spAutoFit')) {
        out.autofit = { kind: 'shape', fontScale: 1, lnSpcReduction: 0 };
      } else if (is(node, 'a', 'noAutofit')) {
        out.autofit = { kind: 'none', fontScale: 1, lnSpcReduction: 0 };
      }
    }
  }
  return out;
}
