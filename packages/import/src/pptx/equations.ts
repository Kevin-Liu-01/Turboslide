// Equations (gslides-parity SPEC-5 5.1; R06 8.5): a shape whose `mc:AlternateContent` Choice
// requires `a14` and holds `a14:m/m:oMathPara` becomes an `equation` block with `mathml` set and
// `tex` empty; the renderer draws the MathML until the first edit of the source replaces it. The
// transform is the nineteen OMML objects onto MathML Core: `m:r` runs (with `m:sty` for the
// variant), `m:f` fractions (`m:type` bar, noBar, skw, lin), `m:rad` radicals (with `m:degHide`),
// `m:sSup`, `m:sSub`, `m:sSubSup`, `m:sPre`, `m:d` delimiters (`m:begChr`, `m:endChr`, `m:sepChr`),
// `m:nary` operators with `m:limLoc`, `m:func`, `m:bar`, `m:acc`, `m:groupChr`, `m:limLow`,
// `m:limUpp`, `m:box`, `m:borderBox`, `m:m` matrices and `m:eqArr` equation arrays, `m:phant`.
// A node the transform does not know contributes its text as an `mtext` and the block's row
// says so.
import type { Element } from '@xmldom/xmldom';

import type { Block, EquationBlock } from '@turboslide/schema/blocks';
import type { Position } from '@turboslide/schema/position';

import type { SlideContext } from './context.ts';
import { altOf, placed, rowOn } from './context.ts';
import type { ShapeFacts } from './context.ts';
import { inheritedXfrm } from './inherit.ts';
import { ROW_CODES } from './report.ts';
import { positionOf } from './shapes.ts';
import { attr, children, elementChildren, is } from './xml.ts';

const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

function isM(el: Element | undefined, local: string): boolean {
  return el !== undefined && el.namespaceURI === M_NS && el.localName === local;
}

function mChild(el: Element, local: string): Element | undefined {
  return elementChildren(el).find((node) => isM(node, local));
}

function mChildren(el: Element, local: string): Element[] {
  return elementChildren(el).filter((node) => isM(node, local));
}

/** The `m:val` of a property child (`m:type`, `m:begChr`, ...), or the default. */
function prop(pr: Element | undefined, local: string, fallback: string): string {
  if (pr === undefined) return fallback;
  const el = mChild(pr, local);
  if (el === undefined) return fallback;
  return el.getAttributeNS(M_NS, 'val') ?? attr(el, 'val') ?? attr(el, 'm:val') ?? fallback;
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const OPERATORS = /^[+\-−=<>≤≥≠±×÷∓·∘∗∙∑∏∫∮∂∇∈∉⊂⊃⊆⊇∪∩∧∨¬∀∃∅∞→←↔⇒⇐⇔≈≡≅∼∝⋅,;:!?()[\]{}|]$/u;

/** One `m:r` run: numbers as `mn`, operators as `mo`, the rest as `mi` (one element per token). */
function runToMathml(r: Element, notes: string[]): string {
  const texts = elementChildren(r)
    .filter((node) => isM(node, 't'))
    .map((t) => t.textContent ?? '');
  const text = texts.join('');
  if (text.trim() === '') return text === '' ? '' : `<mtext>${escape(text)}</mtext>`;
  const rPr = mChild(r, 'rPr');
  const sty = prop(rPr, 'sty', 'i');
  const nor = rPr !== undefined && mChild(rPr, 'nor') !== undefined;
  if (nor) return `<mtext>${escape(text)}</mtext>`;
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9.,]/.test(text[j] as string)) j += 1;
      parts.push(`<mn>${escape(text.slice(i, j))}</mn>`);
      i = j;
      continue;
    }
    if (OPERATORS.test(ch)) {
      parts.push(`<mo>${escape(ch)}</mo>`);
      i += 1;
      continue;
    }
    const variant =
      sty === 'p'
        ? ' mathvariant="normal"'
        : sty === 'b'
          ? ' mathvariant="bold"'
          : sty === 'bi'
            ? ' mathvariant="bold-italic"'
            : '';
    // a run of letters is one identifier per letter (the italic single letter convention), a word when styled plain
    if (sty === 'p' && /[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z]/.test(text[j] as string)) j += 1;
      parts.push(`<mi mathvariant="normal">${escape(text.slice(i, j))}</mi>`);
      i = j;
      continue;
    }
    parts.push(`<mi${variant}>${escape(ch)}</mi>`);
    i += 1;
  }
  void notes;
  return parts.join('');
}

/** The children of an argument element (`m:e`, `m:num`, `m:den`, `m:sup`, ...) as one row. */
function argToMathml(arg: Element | undefined, notes: string[]): string {
  if (arg === undefined) return '<mrow></mrow>';
  const inner = elementChildren(arg)
    .filter((node) => !(node.localName ?? '').endsWith('Pr'))
    .map((node) => nodeToMathml(node, notes))
    .join('');
  return `<mrow>${inner}</mrow>`;
}

function nodeToMathml(node: Element, notes: string[]): string {
  if (node.namespaceURI !== M_NS) {
    // a DrawingML run inside math (`a:r`) carries plain text
    const text = node.textContent ?? '';
    return text === '' ? '' : `<mtext>${escape(text)}</mtext>`;
  }
  switch (node.localName) {
    case 'r':
      return runToMathml(node, notes);
    case 'f': {
      const pr = mChild(node, 'fPr');
      const type = prop(pr, 'type', 'bar');
      const num = argToMathml(mChild(node, 'num'), notes);
      const den = argToMathml(mChild(node, 'den'), notes);
      if (type === 'lin') return `<mrow>${num}<mo>/</mo>${den}</mrow>`;
      if (type === 'skw') return `<mfrac bevelled="true">${num}${den}</mfrac>`;
      return `<mfrac${type === 'noBar' ? ' linethickness="0"' : ''}>${num}${den}</mfrac>`;
    }
    case 'rad': {
      const pr = mChild(node, 'radPr');
      const degHide = prop(pr, 'degHide', 'off');
      const base = argToMathml(mChild(node, 'e'), notes);
      const deg = mChild(node, 'deg');
      if (
        degHide === 'on' ||
        degHide === '1' ||
        deg === undefined ||
        elementChildren(deg).length === 0
      )
        return `<msqrt>${base}</msqrt>`;
      return `<mroot>${base}${argToMathml(deg, notes)}</mroot>`;
    }
    case 'sSup':
      return `<msup>${argToMathml(mChild(node, 'e'), notes)}${argToMathml(mChild(node, 'sup'), notes)}</msup>`;
    case 'sSub':
      return `<msub>${argToMathml(mChild(node, 'e'), notes)}${argToMathml(mChild(node, 'sub'), notes)}</msub>`;
    case 'sSubSup':
      return `<msubsup>${argToMathml(mChild(node, 'e'), notes)}${argToMathml(mChild(node, 'sub'), notes)}${argToMathml(mChild(node, 'sup'), notes)}</msubsup>`;
    case 'sPre':
      return `<mmultiscripts>${argToMathml(mChild(node, 'e'), notes)}<mprescripts/>${argToMathml(mChild(node, 'sub'), notes)}${argToMathml(mChild(node, 'sup'), notes)}</mmultiscripts>`;
    case 'd': {
      const pr = mChild(node, 'dPr');
      const beg = prop(pr, 'begChr', '(');
      const end = prop(pr, 'endChr', ')');
      const sep = prop(pr, 'sepChr', '|');
      const args = mChildren(node, 'e').map((e) => argToMathml(e, notes));
      const open = beg === '' ? '' : `<mo fence="true" stretchy="true">${escape(beg)}</mo>`;
      const close = end === '' ? '' : `<mo fence="true" stretchy="true">${escape(end)}</mo>`;
      const body = args.join(sep === '' ? '' : `<mo separator="true">${escape(sep)}</mo>`);
      return `<mrow>${open}${body}${close}</mrow>`;
    }
    case 'nary': {
      const pr = mChild(node, 'naryPr');
      const chr = prop(pr, 'chr', '∫');
      const limLoc = prop(pr, 'limLoc', 'undOvr');
      const subHide = prop(pr, 'subHide', 'off') === 'on';
      const supHide = prop(pr, 'supHide', 'off') === 'on';
      const sub = subHide ? undefined : mChild(node, 'sub');
      const sup = supHide ? undefined : mChild(node, 'sup');
      const op = `<mo largeop="true" stretchy="true">${escape(chr)}</mo>`;
      let head = op;
      if (sub !== undefined && sup !== undefined)
        head =
          limLoc === 'subSup'
            ? `<msubsup>${op}${argToMathml(sub, notes)}${argToMathml(sup, notes)}</msubsup>`
            : `<munderover>${op}${argToMathml(sub, notes)}${argToMathml(sup, notes)}</munderover>`;
      else if (sub !== undefined)
        head =
          limLoc === 'subSup'
            ? `<msub>${op}${argToMathml(sub, notes)}</msub>`
            : `<munder>${op}${argToMathml(sub, notes)}</munder>`;
      else if (sup !== undefined)
        head =
          limLoc === 'subSup'
            ? `<msup>${op}${argToMathml(sup, notes)}</msup>`
            : `<mover>${op}${argToMathml(sup, notes)}</mover>`;
      return `<mrow>${head}${argToMathml(mChild(node, 'e'), notes)}</mrow>`;
    }
    case 'func':
      return `<mrow>${argToMathml(mChild(node, 'fName'), notes)}<mo>&#x2061;</mo>${argToMathml(mChild(node, 'e'), notes)}</mrow>`;
    case 'bar': {
      const pr = mChild(node, 'barPr');
      const pos = prop(pr, 'pos', 'bot');
      const base = argToMathml(mChild(node, 'e'), notes);
      return pos === 'top'
        ? `<mover accent="false">${base}<mo>&#x00AF;</mo></mover>`
        : `<munder accentunder="false">${base}<mo>&#x0332;</mo></munder>`;
    }
    case 'acc': {
      const pr = mChild(node, 'accPr');
      const chr = prop(pr, 'chr', '̂');
      return `<mover accent="true">${argToMathml(mChild(node, 'e'), notes)}<mo>${escape(chr)}</mo></mover>`;
    }
    case 'groupChr': {
      const pr = mChild(node, 'groupChrPr');
      const chr = prop(pr, 'chr', '⏟');
      const pos = prop(pr, 'pos', 'bot');
      const base = argToMathml(mChild(node, 'e'), notes);
      return pos === 'top'
        ? `<mover>${base}<mo stretchy="true">${escape(chr)}</mo></mover>`
        : `<munder>${base}<mo stretchy="true">${escape(chr)}</mo></munder>`;
    }
    case 'limLow':
      return `<munder>${argToMathml(mChild(node, 'e'), notes)}${argToMathml(mChild(node, 'lim'), notes)}</munder>`;
    case 'limUpp':
      return `<mover>${argToMathml(mChild(node, 'e'), notes)}${argToMathml(mChild(node, 'lim'), notes)}</mover>`;
    case 'box':
    case 'phant':
      return argToMathml(mChild(node, 'e'), notes);
    case 'borderBox':
      return `<menclose notation="box">${argToMathml(mChild(node, 'e'), notes)}</menclose>`;
    case 'm': {
      const rows = mChildren(node, 'mr').map(
        (mr) =>
          `<mtr>${mChildren(mr, 'e')
            .map((e) => `<mtd>${argToMathml(e, notes)}</mtd>`)
            .join('')}</mtr>`,
      );
      return `<mtable>${rows.join('')}</mtable>`;
    }
    case 'eqArr': {
      const rows = mChildren(node, 'e').map(
        (e) => `<mtr><mtd>${argToMathml(e, notes)}</mtd></mtr>`,
      );
      return `<mtable>${rows.join('')}</mtable>`;
    }
    case 'oMath':
      return `<mrow>${elementChildren(node)
        .filter((n) => !(n.localName ?? '').endsWith('Pr'))
        .map((n) => nodeToMathml(n, notes))
        .join('')}</mrow>`;
    case 'oMathParaPr':
    case 'ctrlPr':
      return '';
    default: {
      notes.push(node.localName ?? 'node');
      const text = node.textContent ?? '';
      return text.trim() === '' ? '' : `<mtext>${escape(text)}</mtext>`;
    }
  }
}

export type MathmlReading = { mathml: string; display: 'block' | 'inline'; unknown: string[] };

/** One `m:oMathPara` or `m:oMath` as a MathML Core fragment. */
export function ommlToMathml(math: Element): MathmlReading {
  const notes: string[] = [];
  const paras = isM(math, 'oMathPara') ? mChildren(math, 'oMath') : [math];
  const body = paras.map((oMath) => nodeToMathml(oMath, notes)).join('');
  const justify = isM(math, 'oMathPara')
    ? prop(mChild(math, 'oMathParaPr'), 'jc', 'centerGroup')
    : 'inline';
  const display: 'block' | 'inline' = justify === 'inline' ? 'inline' : 'block';
  return {
    mathml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display}">${body}</math>`,
    display,
    unknown: [...new Set(notes)],
  };
}

/** The `m:oMathPara` or `m:oMath` inside an `a14:m` of a shape's text body, or undefined. */
export function mathOf(shape: Element): Element | undefined {
  const txBody = elementChildren(shape).find((node) => node.localName === 'txBody');
  if (txBody === undefined) return undefined;
  for (const p of children(txBody, 'a', 'p')) {
    for (const node of elementChildren(p)) {
      const a14m = is(node, 'a14', 'm') ? node : undefined;
      const holder = a14m ?? node;
      const math = mChild(holder, 'oMathPara') ?? mChild(holder, 'oMath');
      if (math !== undefined) return math;
    }
  }
  return undefined;
}

/** Reads a math shape (the Choice branch of an `mc:AlternateContent` that requires `a14`) into an equation block. */
export function readEquation(shape: Element, math: Element, ctx: SlideContext): Block[] {
  const facts: ShapeFacts = (() => {
    const cNvPr = elementChildren(shape)
      .flatMap((n) => elementChildren(n))
      .find((n) => n.localName === 'cNvPr');
    return {
      id: Number(cNvPr?.getAttribute('id') ?? '0'),
      name: cNvPr?.getAttribute('name') ?? '',
      hidden: false,
      ...(cNvPr?.getAttribute('descr') ? { descr: cNvPr.getAttribute('descr') as string } : {}),
    };
  })();
  const inherited = inheritedXfrm(shape, ctx.chain);
  if (inherited === undefined) {
    ctx.report.drop({
      ...rowOn(ctx, facts.name),
      code: 'shape.noBox',
      message: 'An equation without a box was dropped',
    });
    return [];
  }
  const pos: Position = positionOf(inherited.xfrm, ctx);
  const reading = ommlToMathml(math);
  const block: EquationBlock = {
    id: ctx.ids.take(facts.name, 'equation'),
    type: 'equation',
    tex: '',
    mathml: reading.mathml,
    pos,
  };
  if (reading.display === 'inline') block.display = 'inline';
  const alt = altOf(facts);
  if (alt !== undefined) block.alt = alt;
  block.ext = { pptxName: facts.name };
  ctx.report.row('kept', {
    ...rowOn(ctx, facts.name),
    code: ROW_CODES.equationImported,
    message:
      reading.unknown.length === 0
        ? 'An equation was kept as MathML, editable in LaTeX after retyping'
        : `An equation was kept as MathML; ${reading.unknown.join(', ')} had no transform and kept their text`,
  });
  ctx.report.keep();
  return [placed(ctx, block)];
}
