// The equation rewrite of the post process (gslides-parity SPEC-5 0.43, 2.4, 8.3; R06 5.2, 8.2):
// for every `SceneEquation` of a slide, `rewriteEquations` replaces the raster picture pptxgenjs
// wrote for the block (the 2x PNG, addressed by its object name) with the `mc:AlternateContent`
// wrapper of Microsoft's own example: the Choice (`Requires="a14"`) holds a text box shape at the
// same box whose one paragraph carries `a14:m` > `m:oMathPara` > `m:oMath` with runs naming
// Cambria Math at the block's size and colour; the Fallback holds the picture pptxgenjs wrote, its
// blip relationship untouched, so a consumer that does not implement `a14` shows the raster
// (python-pptx, LibreOffice until the container probe says otherwise). Both shapes carry one id
// and one name, as Microsoft's example does. Called at the fixed position of SPEC-5 2.4 (after the
// media, before the grouping); `groupShapes` and `listShapes` (B3's groups.ts) read the wrapper as
// one shape.
//
// The OMML is Turboslide's own MathML Core to OMML transform over the nineteen built up objects of
// Murray Sargent's table (R06 5.2): acc, bar, borderBox, box, d, eqArr, f, func, groupChr, limLow,
// limUpp, m, nary, phant, rad, sPre, sSub, sSup, sSubSup, plus r for a run. The input is Temml's
// MathML (a closed set of thirty elements; Temml also writes `menclose` for `\overline`,
// `\underline` and `\boxed`, which map to bar and borderBox). A construct outside the transform
// (a strike, `merror`, an unknown element) answers no OMML, the picture alone travels and the
// residual names the block and the construct. No LGPL converter is used (R06 8.2).
//
// A run's properties are DrawingML (`a:rPr`), not WordprocessingML: `<a:rPr lang="en-US"
// sz="<hundredths of a point>"><a:solidFill><a:srgbClr val="<hex>"/></a:solidFill><a:latin
// typeface="Cambria Math"/></a:rPr>`, with `<m:rPr><m:sty m:val="p"/></m:rPr>` before it for
// upright text (function names, `mtext`, `mathvariant="normal"`) and `b` or `bi` for bold.
import { listShapes } from './groups.ts';
import type { Scene, SceneEquation } from '../scene/types.ts';
import { pxToEmu, szOf } from '../units.ts';
import type { Package } from './zip.ts';

export const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
export const NS_A14 = 'http://schemas.microsoft.com/office/drawing/2010/main';
export const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

/** The face PowerPoint's own editor writes (R06 12.4: Microsoft's example names it). */
export const MATH_TYPEFACE = 'Cambria Math';

/** The nineteen built up objects of Murray Sargent's table plus the run (R06 5.2). */
export const OMML_OBJECTS = [
  'acc',
  'bar',
  'borderBox',
  'box',
  'd',
  'eqArr',
  'f',
  'func',
  'groupChr',
  'limLow',
  'limUpp',
  'm',
  'nary',
  'phant',
  'rad',
  'sPre',
  'sSub',
  'sSup',
  'sSubSup',
  'r',
] as const;

export type EquationRewriteResult = {
  xml: string;
  /** the equations written as native OMML */
  native: number;
  /** the equations that travelled as their raster alone, with the construct the transform lacked */
  raster: { blockId: string; reason: string }[];
};

// ---------------------------------------------------------------------------------------------
// A small XML reader for Temml's output (well formed, no CDATA, no comments, no processing
// instructions past the prolog)

export type XmlNode =
  | { kind: 'element'; name: string; attrs: Record<string, string>; children: XmlNode[] }
  | { kind: 'text'; text: string };

export type XmlElement = Extract<XmlNode, { kind: 'element' }>;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes the five XML entities and numeric references; an unknown named entity stays as written. */
export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return NAMED_ENTITIES[body] ?? whole;
  });
}

export function encodeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const name = match[1];
    if (name === undefined) continue;
    attrs[name] = decodeXml(match[3] ?? match[4] ?? '');
  }
  return attrs;
}

/**
 * Parses one XML fragment into a tree; the root is the first element. Throws on a mismatched
 * close tag, so a malformed input falls back to the raster with the message as its reason.
 */
export function parseXml(source: string): XmlElement {
  const text = source.replace(/^\s*<\?xml[^>]*\?>\s*/, '');
  const root: XmlElement = { kind: 'element', name: '#root', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  const tag =
    /<\/?([A-Za-z_][\w.:-]*)((?:\s+[^\s=>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const match of text.matchAll(tag)) {
    const [whole, name, attrSource, selfClose, textRun] = match;
    const top = stack[stack.length - 1];
    if (top === undefined) throw new Error('xml: empty stack');
    if (textRun !== undefined) {
      if (textRun.trim() !== '' || stack.length > 1)
        top.children.push({ kind: 'text', text: decodeXml(textRun) });
      continue;
    }
    if (name === undefined) throw new Error(`xml: cannot read ${whole}`);
    if (whole.startsWith('</')) {
      if (top.name !== name) throw new Error(`xml: </${name}> closes <${top.name}>`);
      stack.pop();
      continue;
    }
    const element: XmlElement = {
      kind: 'element',
      name,
      attrs: parseAttrs(attrSource ?? ''),
      children: [],
    };
    top.children.push(element);
    if (selfClose !== '/') stack.push(element);
  }
  if (stack.length !== 1) throw new Error(`xml: <${stack[stack.length - 1]?.name}> is not closed`);
  const first = root.children.find((node): node is XmlElement => node.kind === 'element');
  if (first === undefined) throw new Error('xml: no element');
  return first;
}

function textOf(node: XmlNode): string {
  if (node.kind === 'text') return node.text;
  return node.children.map(textOf).join('');
}

function elements(node: XmlElement): XmlElement[] {
  return node.children.filter((child): child is XmlElement => child.kind === 'element');
}

// ---------------------------------------------------------------------------------------------
// The transform

export type OmmlOptions = {
  /** the block's font size in sheet px; 22 (the sheet's body size) when absent */
  sizePx?: number;
  /** the run colour as six hex digits without the hash; the ink when absent */
  colorHex?: string;
};

export type OmmlResult = {
  /** `m:oMathPara` holding one `m:oMath`, or absent when a construct is outside the transform */
  omml?: string;
  /** the construct the transform lacked */
  reason?: string;
};

class Unsupported extends Error {}

type RunStyle = { upright?: boolean; bold?: boolean; color?: string };

type Ctx = { sz: number; color: string };

/** The n-ary operators of `\sum`, `\int` and their kin: U+2140, U+220F to U+2211, U+222B to U+2233, U+22C0 to U+22C3, U+2A00 to U+2A0F. */
function isNary(text: string): boolean {
  if (text.length === 0) return false;
  const code = text.codePointAt(0) ?? 0;
  return (
    code === 0x2140 ||
    (code >= 0x220f && code <= 0x2211) ||
    (code >= 0x222b && code <= 0x2233) ||
    (code >= 0x22c0 && code <= 0x22c3) ||
    (code >= 0x2a00 && code <= 0x2a0f)
  );
}

/** The spacing modifier Temml writes for an accent, as the combining mark OMML's `m:chr` wants. */
const ACCENTS: Readonly<Record<string, string>> = {
  ˆ: '̂',
  '^': '̂',
  ˇ: '̌',
  '˜': '̃',
  '~': '̃',
  '¯': '̄',
  ˉ: '̄',
  '‾': '̅',
  '˙': '̇',
  '¨': '̈',
  '˘': '̆',
  '´': '́',
  '`': '̀',
  '→': '⃗',
  '⃗': '⃗',
  '←': '⃖',
  '⃖': '⃖',
  '↔': '⃡',
  '˚': '̊',
  '̂': '̂',
  '̃': '̃',
  '̄': '̄',
  '̅': '̅',
  '̇': '̇',
  '̈': '̈',
  '̌': '̌',
};

const GROUP_CHARS = new Set(['⏞', '⏟', '⏜', '⏝', '⎴', '⎵', '⏠', '⏡']);

const RELATIONS = new Set([
  '=',
  '≠',
  '<',
  '>',
  '≤',
  '≥',
  '≡',
  '≈',
  '∼',
  '≃',
  '≍',
  '≺',
  '≻',
  '⪯',
  '⪰',
  '≪',
  '≫',
  '⊂',
  '⊃',
  '⊆',
  '⊇',
  '∈',
  '∋',
  '∉',
  '→',
  '⇒',
  '⇔',
  '↔',
  '∝',
  '⊢',
  ':=',
]);

const FUNCTION_APPLICATION = '⁡';
const INVISIBLE = new Set(['⁡', '⁢', '⁣', '⁤']);

function run(text: string, ctx: Ctx, style: RunStyle = {}): string {
  const styled: string[] = [];
  if (style.upright === true && style.bold === true)
    styled.push('<m:rPr><m:sty m:val="b"/></m:rPr>');
  else if (style.upright === true) styled.push('<m:rPr><m:sty m:val="p"/></m:rPr>');
  else if (style.bold === true) styled.push('<m:rPr><m:sty m:val="bi"/></m:rPr>');
  const color = style.color ?? ctx.color;
  return (
    `<m:r>${styled.join('')}<a:rPr lang="en-US" sz="${ctx.sz}"${style.bold === true ? ' b="1"' : ''}>` +
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${MATH_TYPEFACE}"/></a:rPr>` +
    `<m:t xml:space="preserve">${encodeXml(text)}</m:t></m:r>`
  );
}

function e(inner: string): string {
  return `<m:e>${inner}</m:e>`;
}

function styleOf(el: XmlElement, inherited: RunStyle): RunStyle {
  const variant = el.attrs.mathvariant;
  const color = el.attrs.mathcolor ?? colorFromStyle(el.attrs.style);
  const style: RunStyle = { ...inherited };
  if (variant === 'normal') style.upright = true;
  if (variant === 'bold') style.bold = true;
  if (variant === 'bold-italic') style.bold = true;
  if (color !== undefined) style.color = color;
  return style;
}

function colorFromStyle(style: string | undefined): string | undefined {
  if (style === undefined) return undefined;
  const match = /(?:^|;)\s*color\s*:\s*#([0-9a-fA-F]{6})\b/.exec(style);
  return match?.[1]?.toUpperCase();
}

/** A fence `mo`: Temml marks them `fence="true"`, with `form` prefix or postfix on `\left` and `\right` and none on a binomial's parentheses. */
function fenceOf(node: XmlNode | undefined, form: 'prefix' | 'postfix'): string | null {
  if (node === undefined || node.kind !== 'element' || node.name !== 'mo') return null;
  if (node.attrs.fence !== 'true') return null;
  if (node.attrs.form !== undefined && node.attrs.form !== form) return null;
  return textOf(node);
}

function transformChildren(nodes: XmlNode[], ctx: Ctx, style: RunStyle): string {
  const out: string[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node === undefined) continue;
    if (node.kind === 'text') {
      if (node.text.trim() !== '') out.push(run(node.text.trim(), ctx, style));
      continue;
    }
    // a function: `<mrow>[mspace] <mi>sin</mi> <mo>⁡</mo> [mspace]</mrow>` followed by its argument
    const fname = functionNameOf(node);
    if (fname !== null) {
      const next = nodes[i + 1];
      const argument = next === undefined ? '' : transformChildren([next], ctx, style);
      out.push(
        `<m:func><m:funcPr/><m:fName>${run(fname, ctx, { ...style, upright: true })}</m:fName>${e(argument)}</m:func>`,
      );
      if (next !== undefined) i += 1;
      continue;
    }
    // an n-ary operator with limits takes the operands that follow it up to a relation
    const naryScript = naryOf(node);
    if (naryScript !== null) {
      const operands: XmlNode[] = [];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const candidate = nodes[j];
        if (candidate === undefined) break;
        if (
          candidate.kind === 'element' &&
          candidate.name === 'mo' &&
          RELATIONS.has(textOf(candidate))
        )
          break;
        operands.push(candidate);
      }
      out.push(nary(naryScript, transformChildren(operands, ctx, style), ctx, style));
      i += operands.length;
      continue;
    }
    out.push(transform(node, ctx, style));
  }
  return out.join('');
}

/** The name of a function an `mrow` applies: its `mi` before U+2061, else null. */
function functionNameOf(node: XmlElement): string | null {
  if (node.name !== 'mrow') return null;
  const parts = elements(node).filter((child) => child.name !== 'mspace');
  if (parts.length !== 2) return null;
  const [name, apply] = parts;
  if (name?.name !== 'mi' || apply?.name !== 'mo' || textOf(apply) !== FUNCTION_APPLICATION)
    return null;
  return textOf(name);
}

type NaryScript = {
  chr: string;
  sub?: XmlNode;
  sup?: XmlNode;
  limLoc: 'subSup' | 'undOvr';
};

/** An n-ary operator carrying limits: `msub`, `msup`, `msubsup`, `munder`, `mover`, `munderover` over a big operator, or one `mrow` holding that alone. */
function naryOf(node: XmlElement): NaryScript | null {
  if (node.name === 'mrow') {
    const parts = elements(node).filter((child) => child.name !== 'mspace');
    if (
      parts.length !== 1 ||
      parts[0] === undefined ||
      node.children.some((c) => c.kind === 'text')
    )
      return null;
    return naryOf(parts[0]);
  }
  const scripts: Record<string, 'subSup' | 'undOvr'> = {
    msub: 'subSup',
    msup: 'subSup',
    msubsup: 'subSup',
    munder: 'undOvr',
    mover: 'undOvr',
    munderover: 'undOvr',
  };
  const limLoc = scripts[node.name];
  if (limLoc === undefined) return null;
  const [base, first, second] = elements(node);
  if (base?.name !== 'mo' || !isNary(textOf(base))) return null;
  const chr = textOf(base);
  if (node.name === 'msub' || node.name === 'munder') return { chr, sub: first, limLoc };
  if (node.name === 'msup' || node.name === 'mover') return { chr, sup: first, limLoc };
  return { chr, sub: first, sup: second, limLoc };
}

function nary(script: NaryScript, operand: string, ctx: Ctx, style: RunStyle): string {
  const sub =
    script.sub === undefined ? '<m:sub/>' : `<m:sub>${transform(script.sub, ctx, style)}</m:sub>`;
  const sup =
    script.sup === undefined ? '<m:sup/>' : `<m:sup>${transform(script.sup, ctx, style)}</m:sup>`;
  const hides =
    (script.sub === undefined ? '<m:subHide m:val="1"/>' : '') +
    (script.sup === undefined ? '<m:supHide m:val="1"/>' : '');
  return (
    `<m:nary><m:naryPr><m:chr m:val="${encodeXml(script.chr)}"/><m:limLoc m:val="${script.limLoc}"/>${hides}</m:naryPr>` +
    `${sub}${sup}${e(operand)}</m:nary>`
  );
}

function fenced(begin: string, end: string, inner: string): string {
  return (
    `<m:d><m:dPr><m:begChr m:val="${encodeXml(begin)}"/><m:endChr m:val="${encodeXml(end)}"/></m:dPr>` +
    `${e(inner)}</m:d>`
  );
}

function table(node: XmlElement, ctx: Ctx, style: RunStyle, form: 'm' | 'eqArr'): string {
  const rows = elements(node).filter(
    (child) => child.name === 'mtr' || child.name === 'mlabeledtr',
  );
  if (form === 'eqArr') {
    const lines = rows.map((row) => {
      const cells = elements(row).filter((cell) => cell.name === 'mtd');
      // the cells of one row join with the alignment mark PowerPoint reads (`&`)
      return e(
        cells.map((cell) => transformChildren(cell.children, ctx, style)).join(run('&', ctx)),
      );
    });
    return `<m:eqArr><m:eqArrPr><m:baseJc m:val="center"/></m:eqArrPr>${lines.join('')}</m:eqArr>`;
  }
  const columns = Math.max(
    1,
    ...rows.map((row) => elements(row).filter((c) => c.name === 'mtd').length),
  );
  const body = rows
    .map((row) => {
      const cells = elements(row).filter((cell) => cell.name === 'mtd');
      const filled = [...cells.map((cell) => e(transformChildren(cell.children, ctx, style)))];
      while (filled.length < columns) filled.push('<m:e/>');
      return `<m:mr>${filled.join('')}</m:mr>`;
    })
    .join('');
  return (
    `<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${columns}"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>` +
    `${body}</m:m>`
  );
}

function transform(node: XmlNode, ctx: Ctx, inherited: RunStyle): string {
  if (node.kind === 'text')
    return node.text.trim() === '' ? '' : run(node.text.trim(), ctx, inherited);
  const style = styleOf(node, inherited);
  const kids = node.children;
  const parts = elements(node);
  switch (node.name) {
    case 'mpadded': {
      // a padded box with an offset or a size is Murray Sargent's `box` (`\raisebox`); a bare
      // mpadded is transparent
      const inner = transformChildren(kids, ctx, style);
      const sized = ['voffset', 'height', 'depth', 'width', 'lspace'].some(
        (a) => node.attrs[a] !== undefined,
      );
      return sized ? `<m:box><m:boxPr/>${e(inner)}</m:box>` : inner;
    }
    case 'math':
    case 'mrow':
    case 'mstyle':
    case 'semantics': {
      if (node.name === 'mrow') {
        // `\boxed{}`: Temml draws the border on the row's style (MathML Core has no menclose box)
        if (/\bborder\s*:/.test(node.attrs.style ?? ''))
          return `<m:borderBox><m:borderBoxPr/>${e(transformChildren(kids, ctx, style))}</m:borderBox>`;
        // a fenced row: `( … )`, `[ … ]`, `{ … }`, `| … |`, and `{ …` of cases with an empty close
        const begin = fenceOf(kids[0], 'prefix');
        const end = fenceOf(kids[kids.length - 1], 'postfix');
        if (begin !== null && end !== null && kids.length >= 2) {
          const inner = kids.slice(1, -1);
          const only = inner.filter((child) => child.kind === 'element');
          const single = only.length === 1 && inner.length === 1 ? only[0] : undefined;
          if (single !== undefined && single.name === 'mtable') {
            const form = end === '' || begin === '{' ? 'eqArr' : 'm';
            return fenced(begin, end, table(single, ctx, style, form));
          }
          return fenced(begin, end, transformChildren(inner, ctx, style));
        }
      }
      const body =
        node.name === 'semantics'
          ? kids.filter(
              (c) =>
                c.kind !== 'element' || (c.name !== 'annotation' && c.name !== 'annotation-xml'),
            )
          : kids;
      return transformChildren(body, ctx, style);
    }
    case 'annotation':
    case 'annotation-xml':
    case 'mspace':
      return '';
    case 'mi': {
      const text = textOf(node);
      const upright = style.upright === true || [...text].length > 1;
      return run(text, ctx, { ...style, upright });
    }
    case 'mn':
      return run(textOf(node), ctx, style);
    case 'mo': {
      const text = textOf(node);
      if (INVISIBLE.has(text) || text === '') return '';
      return run(text, ctx, style);
    }
    case 'mtext':
    case 'ms':
      return run(textOf(node), ctx, { ...style, upright: true });
    case 'mfrac': {
      const [num, den] = parts;
      if (num === undefined || den === undefined)
        throw new Unsupported('mfrac without two children');
      const thickness = node.attrs.linethickness;
      const type =
        thickness === '0' || thickness === '0px' || thickness === '0pt' ? 'noBar' : 'bar';
      return `<m:f><m:fPr><m:type m:val="${type}"/></m:fPr><m:num>${transform(num, ctx, style)}</m:num><m:den>${transform(den, ctx, style)}</m:den></m:f>`;
    }
    case 'msqrt':
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${e(transformChildren(kids, ctx, style))}</m:rad>`;
    case 'mroot': {
      const [base, degree] = parts;
      if (base === undefined || degree === undefined)
        throw new Unsupported('mroot without two children');
      return `<m:rad><m:radPr/><m:deg>${transform(degree, ctx, style)}</m:deg>${e(transform(base, ctx, style))}</m:rad>`;
    }
    case 'msup':
    case 'msub':
    case 'msubsup': {
      const nary = naryOf(node);
      if (nary !== null) return naryWithoutOperand(nary, ctx, style);
      const [base, first, second] = parts;
      if (base === undefined || first === undefined)
        throw new Unsupported(`${node.name} without its scripts`);
      const baseOmml = e(transform(base, ctx, style));
      if (node.name === 'msup')
        return `<m:sSup><m:sSupPr/>${baseOmml}<m:sup>${transform(first, ctx, style)}</m:sup></m:sSup>`;
      if (node.name === 'msub')
        return `<m:sSub><m:sSubPr/>${baseOmml}<m:sub>${transform(first, ctx, style)}</m:sub></m:sSub>`;
      if (second === undefined) throw new Unsupported('msubsup without three children');
      return `<m:sSubSup><m:sSubSupPr/>${baseOmml}<m:sub>${transform(first, ctx, style)}</m:sub><m:sup>${transform(second, ctx, style)}</m:sup></m:sSubSup>`;
    }
    case 'mover':
    case 'munder':
    case 'munderover': {
      const nary = naryOf(node);
      if (nary !== null) return naryWithoutOperand(nary, ctx, style);
      const [base, first, second] = parts;
      if (base === undefined || first === undefined)
        throw new Unsupported(`${node.name} without its limits`);
      if (node.name === 'mover' || node.name === 'munder') {
        const mark = first.name === 'mo' ? textOf(first) : '';
        const accent = ACCENTS[mark];
        if (node.name === 'mover' && accent !== undefined)
          return `<m:acc><m:accPr><m:chr m:val="${encodeXml(accent)}"/></m:accPr>${e(transform(base, ctx, style))}</m:acc>`;
        if (GROUP_CHARS.has(mark))
          return `<m:groupChr><m:groupChrPr><m:chr m:val="${encodeXml(mark)}"/><m:pos m:val="${node.name === 'mover' ? 'top' : 'bot'}"/></m:groupChrPr>${e(transform(base, ctx, style))}</m:groupChr>`;
        if (
          node.name === 'munder' &&
          (mark === '¯' || mark === '_' || mark === '̲' || mark === '‾' || mark === '̅')
        )
          return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr>${e(transform(base, ctx, style))}</m:bar>`;
        const tag = node.name === 'mover' ? 'limUpp' : 'limLow';
        return `<m:${tag}><m:${tag}Pr/>${e(transform(base, ctx, style))}<m:lim>${transform(first, ctx, style)}</m:lim></m:${tag}>`;
      }
      if (second === undefined) throw new Unsupported('munderover without three children');
      const lower = `<m:limLow><m:limLowPr/>${e(transform(base, ctx, style))}<m:lim>${transform(first, ctx, style)}</m:lim></m:limLow>`;
      return `<m:limUpp><m:limUppPr/>${e(lower)}<m:lim>${transform(second, ctx, style)}</m:lim></m:limUpp>`;
    }
    case 'mtable':
      return table(node, ctx, style, 'eqArr');
    case 'menclose': {
      const notation = (node.attrs.notation ?? 'longdiv').split(/\s+/);
      const inner = e(transformChildren(kids, ctx, style));
      if (notation.length === 1 && notation[0] === 'top')
        return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>${inner}</m:bar>`;
      if (notation.length === 1 && notation[0] === 'bottom')
        return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr>${inner}</m:bar>`;
      if (
        notation.every((n) => ['box', 'left', 'right', 'top', 'bottom', 'roundedbox'].includes(n))
      )
        return `<m:borderBox><m:borderBoxPr/>${inner}</m:borderBox>`;
      throw new Unsupported(`menclose notation="${node.attrs.notation ?? ''}"`);
    }
    case 'mphantom':
      return `<m:phant><m:phantPr/>${e(transformChildren(kids, ctx, style))}</m:phant>`;
    case 'mmultiscripts': {
      const [base, ...rest] = parts;
      if (base === undefined) throw new Unsupported('mmultiscripts without a base');
      const marker = rest.findIndex((child) => child.name === 'mprescripts');
      const post = marker === -1 ? rest : rest.slice(0, marker);
      const pre = marker === -1 ? [] : rest.slice(marker + 1);
      let body = transform(base, ctx, style);
      if (post.length >= 2 && post[0] !== undefined && post[1] !== undefined)
        body = `<m:sSubSup><m:sSubSupPr/>${e(body)}<m:sub>${transform(post[0], ctx, style)}</m:sub><m:sup>${transform(post[1], ctx, style)}</m:sup></m:sSubSup>`;
      if (pre.length >= 2 && pre[0] !== undefined && pre[1] !== undefined)
        body = `<m:sPre><m:sPrePr/><m:sub>${transform(pre[0], ctx, style)}</m:sub><m:sup>${transform(pre[1], ctx, style)}</m:sup>${e(body)}</m:sPre>`;
      return body;
    }
    case 'none':
      return '';
    case 'merror':
      throw new Unsupported('merror (the source did not parse)');
    default:
      throw new Unsupported(`<${node.name}>`);
  }
}

/** An n-ary object whose operand is empty (the script sat alone, or at the end of a row). */
function naryWithoutOperand(script: NaryScript, ctx: Ctx, style: RunStyle): string {
  return nary(script, '', ctx, style);
}

/**
 * MathML Core to OMML (R06 8.2): `m:oMathPara` holding one `m:oMath`, centred, or the reason a
 * construct fell outside the nineteen objects. The runs carry the size in hundredths of a point
 * and the colour as `a:rPr` (SPEC-5 8.3).
 */
export function mathmlToOmmlDetailed(mathml: string, options: OmmlOptions = {}): OmmlResult {
  const ctx: Ctx = {
    sz: szOf(options.sizePx ?? 22),
    color: (options.colorHex ?? '070707').replace(/^#/, '').toUpperCase(),
  };
  let root: XmlElement;
  try {
    root = parseXml(mathml);
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) };
  }
  if (root.name !== 'math') {
    // Temml's error mark for a source that did not parse (`throwOnError: false`), R06 7.1
    if (root.name === 'span' && /\btemml-error\b/.test(root.attrs['class'] ?? ''))
      return { reason: `the source did not parse (temml-error): ${textOf(root).trim()}` };
    return { reason: `the root is <${root.name}>, not <math>` };
  }
  if (mathml.includes('temml-error')) return { reason: 'the source did not parse (temml-error)' };
  try {
    const body = transform(root, ctx, {});
    return {
      omml:
        `<m:oMathPara xmlns:m="${NS_M}"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>` +
        `<m:oMath>${body}</m:oMath></m:oMathPara>`,
    };
  } catch (error) {
    if (error instanceof Unsupported) return { reason: error.message };
    return { reason: error instanceof Error ? error.message : String(error) };
  }
}

/** MathML Core to OMML (R06 8.2): the `m:oMathPara`, or undefined when a construct is outside the transform. */
export function mathmlToOmml(mathml: string, options: OmmlOptions = {}): string | undefined {
  return mathmlToOmmlDetailed(mathml, options).omml;
}

// ---------------------------------------------------------------------------------------------
// The wrapper in the slide part

/** The `a:xfrm` of a shape's `p:spPr`, or one built from a box in sheet px. */
function xfrmOf(shapeXml: string, box: readonly [number, number, number, number]): string {
  const found = /<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/.exec(shapeXml);
  if (found) return found[0];
  const [x, y, w, h] = box;
  return `<a:xfrm><a:off x="${pxToEmu(x)}" y="${pxToEmu(y)}"/><a:ext cx="${pxToEmu(w)}" cy="${pxToEmu(h)}"/></a:xfrm>`;
}

function descrOf(shapeXml: string): string | undefined {
  return /<p:cNvPr\b[^>]*\sdescr="([^"]*)"/.exec(shapeXml)?.[1];
}

/** The Choice's text box: the same id and name as the picture, the math paragraph centred in the box. */
export function mathShapeXml(input: {
  id: number;
  name: string;
  descr?: string;
  xfrm: string;
  omml: string;
  sizePx: number;
}): string {
  const descr =
    input.descr !== undefined && input.descr !== '' ? ` descr="${encodeXml(input.descr)}"` : '';
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${input.id}" name="${encodeXml(input.name)}"${descr}/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${input.xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"/><a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr"/><a14:m>${input.omml}</a14:m><a:endParaRPr lang="en-US" sz="${szOf(input.sizePx)}"/></a:p></p:txBody></p:sp>`
  );
}

/** A text box carrying the source for a consumer without `a14` when no raster was shot. */
function sourceFallbackXml(input: {
  id: number;
  name: string;
  xfrm: string;
  text: string;
  sizePx: number;
}): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${input.id}" name="${encodeXml(input.name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${input.xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"/><a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="${szOf(input.sizePx)}"><a:latin typeface="${MATH_TYPEFACE}"/></a:rPr><a:t>${encodeXml(input.text)}</a:t></a:r></a:p></p:txBody></p:sp>`
  );
}

/** The `mc:AlternateContent` of R06 5.2 around a Choice shape and a Fallback shape. */
export function alternateContentXml(choice: string, fallback: string): string {
  return (
    `<mc:AlternateContent xmlns:mc="${NS_MC}"><mc:Choice xmlns:a14="${NS_A14}" Requires="a14">${choice}</mc:Choice>` +
    `<mc:Fallback>${fallback}</mc:Fallback></mc:AlternateContent>`
  );
}

/** The object name of the equation's raster picture in the part (`ts:<slide>#<rasterId>`), or of the block itself. */
function shapeNamesOf(scene: Scene, equation: SceneEquation): string[] {
  const names = [`ts:${scene.slideId}#${equation.blockId}`];
  if (equation.raster !== undefined) names.unshift(`ts:${scene.slideId}#${equation.raster}`);
  return names;
}

function nextShapeId(xml: string): number {
  let max = 1;
  for (const match of xml.matchAll(/<p:cNvPr id="(\d+)"/g)) max = Math.max(max, Number(match[1]));
  return max + 1;
}

/**
 * The equations of one slide part (SPEC-5 8.3): the raster picture of each `SceneEquation` with
 * OMML becomes the wrapper (the Choice a math shape at the picture's box, the Fallback the picture
 * itself); an equation whose transform gave no OMML keeps its picture and is named in `raster`;
 * an equation with OMML and no picture in the part gains a wrapper at the end of the shape tree
 * whose Fallback is a text box with the source, so the formula is never lost. The zip is not
 * changed: the Fallback reuses the picture's own relationship.
 */
export function rewriteEquations(
  xml: string,
  scene: Scene,
  _zip: Package,
): Promise<EquationRewriteResult> {
  return Promise.resolve(rewriteEquationsSync(xml, scene));
}

export function rewriteEquationsSync(xml: string, scene: Scene): EquationRewriteResult {
  const equations = scene.equations ?? [];
  let out = xml;
  let native = 0;
  const raster: { blockId: string; reason: string }[] = [];
  for (const row of equations) {
    // `sizePx` and `reason` are this lane's request to the integrator on `SceneEquation`
    // (b6.md); until they land the type is widened here and the defaults apply
    const equation = row as SceneEquation & { sizePx?: number; reason?: string };
    const sizePx = equation.sizePx ?? 22;
    if (equation.omml === undefined) {
      raster.push({
        blockId: equation.blockId,
        reason: equation.reason ?? 'no OMML for the construct',
      });
      continue;
    }
    const names = shapeNamesOf(scene, equation);
    const shapes = listShapes(out);
    const picture = shapes.find(
      (s) => names.includes(s.name) && (s.kind === 'pic' || s.kind === 'sp'),
    );
    if (picture !== undefined) {
      const choice = mathShapeXml({
        id: picture.id,
        name: picture.name,
        descr: descrOf(picture.xml) ?? equation.alt,
        xfrm: xfrmOf(picture.xml, equation.box),
        omml: equation.omml,
        sizePx,
      });
      out =
        out.slice(0, picture.start) +
        alternateContentXml(choice, picture.xml) +
        out.slice(picture.end);
      native += 1;
      continue;
    }
    // no picture in the part (no raster was shot): the wrapper joins the tree with a source text fallback
    const id = nextShapeId(out);
    const name = names[names.length - 1] ?? `ts:${scene.slideId}#${equation.blockId}`;
    const xfrm = xfrmOf('', equation.box);
    const choice = mathShapeXml({
      id,
      name,
      descr: equation.alt,
      xfrm,
      omml: equation.omml,
      sizePx,
    });
    const fallback = sourceFallbackXml({
      id,
      name,
      xfrm,
      text: equation.alt ?? equation.tex,
      sizePx,
    });
    const close = out.lastIndexOf('</p:spTree>');
    if (close === -1) {
      raster.push({ blockId: equation.blockId, reason: 'the slide part has no shape tree' });
      continue;
    }
    out = out.slice(0, close) + alternateContentXml(choice, fallback) + out.slice(close);
    native += 1;
  }
  return { xml: out, native, raster };
}
