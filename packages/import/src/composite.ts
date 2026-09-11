// The composite mapping of the importer (SPEC 9; MILESTONES M5 item 4): the four slides the M1
// grammar escaped (25 diagrams, 67 presenter-compare, 83 fixed-points, 84 goals) are figure grids
// and ruled plates the slide styles with its own scoped rules. This module reads those rules for
// the element they match (a small selector matcher over the scoped sheet), turns a grid rule into a
// `composite` block with the tracks, the gap, the justification and the alignment consumed, and
// maps what sits inside a cell with the grammar's blocks: a figure without an image becomes a
// composite with a caption, a bare image a shot, a text div a heading or a paragraph, an h3 a
// heading carrying its rule inline, a standalone icon a one-icon declared diagram. What the
// grammar has no property for (the plate's border and padding, a 30 px name) stays a residual
// rule under `ext.import.css`, targeted through the source classes the blocks keep, so the render
// is the deck's to the pixel and the report lists every rule that survived (SPEC 9: the count of
// residual rules is the honest scope of the grammar).
import { consumeKnown, take } from './css.ts';
import type { Declaration, Rule, StyleSheet } from './css.ts';
import {
  attr,
  children,
  classList,
  contentChildren,
  hasClass,
  isElement,
  isText,
  parseStyle,
  pxNumber,
  removeAttr,
} from './dom.ts';
import type { ChildNode, Element } from './dom.ts';
import { addResidualStyle, newBlock, pxIn, Unmapped } from './map-context.ts';
import type { MapContext } from './map-context.ts';
import { isInlineOnly, textOfElement } from './text.ts';
import type { TextOptions } from './text.ts';
import type { Block, BlockOf, Icon } from '@turboslide/schema/blocks';
import { cellWidths } from '@turboslide/schema/blocks/composite';
import { isIconName } from '@turboslide/schema/icons';
import type { IconColor } from '@turboslide/schema/icons';

// ---------------------------------------------------------------------------------------------
// A selector matcher over the scoped sheet

type Compound = { tag?: string; classes: string[]; pseudos: string[]; unsupported: boolean };
type Step = { combinator: ' ' | '>'; compound: Compound };

function parseCompound(token: string): Compound {
  const out: Compound = { classes: [], pseudos: [], unsupported: false };
  let rest = token;
  const tag = /^[a-zA-Z][\w-]*/.exec(rest);
  if (tag) {
    out.tag = tag[0].toLowerCase();
    rest = rest.slice(tag[0].length);
  } else if (rest.startsWith('*')) {
    rest = rest.slice(1);
  }
  while (rest.length > 0) {
    const cls = /^\.([\w-]+)/.exec(rest);
    if (cls) {
      out.classes.push(cls[1] ?? '');
      rest = rest.slice(cls[0].length);
      continue;
    }
    const pseudo = /^::?([\w-]+)(\([^)]*\))?/.exec(rest);
    if (pseudo) {
      const name = pseudo[1] ?? '';
      if (pseudo[0].startsWith('::') || pseudo[2] !== undefined) out.unsupported = true;
      else if (name !== 'first-child' && name !== 'last-child') out.unsupported = true;
      out.pseudos.push(name);
      rest = rest.slice(pseudo[0].length);
      continue;
    }
    out.unsupported = true;
    break;
  }
  return out;
}

/** `SCOPE .a .b > c` as steps after the scope; null for a key without the scope or the scope alone. */
export function parseKey(key: string): Step[] | null {
  const trimmed = key.trim();
  if (!trimmed.startsWith('SCOPE')) return null;
  const rest = trimmed.slice('SCOPE'.length).trim();
  if (rest === '') return null;
  const tokens = rest.split(/\s+/).filter(Boolean);
  const steps: Step[] = [];
  let combinator: ' ' | '>' = ' ';
  for (const token of tokens) {
    if (token === '>') {
      combinator = '>';
      continue;
    }
    steps.push({ combinator, compound: parseCompound(token) });
    combinator = ' ';
  }
  return steps;
}

function elementParent(el: Element): Element | null {
  const parent = el.parentNode;
  return parent && isElement(parent) ? parent : null;
}

function matchesCompound(el: Element, compound: Compound): boolean {
  if (compound.unsupported) return false;
  if (compound.tag && el.tagName.toLowerCase() !== compound.tag) return false;
  const classes = classList(el);
  if (!compound.classes.every((c) => classes.includes(c))) return false;
  for (const pseudo of compound.pseudos) {
    const parent = elementParent(el);
    const siblings = parent ? children(parent) : [el];
    if (pseudo === 'first-child' && siblings[0] !== el) return false;
    if (pseudo === 'last-child' && siblings[siblings.length - 1] !== el) return false;
  }
  return true;
}

function matchesSteps(el: Element, steps: Step[], index: number): boolean {
  const step = steps[index];
  if (!step) return true;
  if (!matchesCompound(el, step.compound)) return false;
  if (index === 0) return true;
  const previous = steps[index - 1];
  const parent = elementParent(el);
  if (!parent) return false;
  if (step.combinator === '>') return matchesSteps(parent, steps, index - 1);
  let ancestor: Element | null = parent;
  while (ancestor) {
    if (matchesSteps(ancestor, steps, index - 1)) return true;
    ancestor = elementParent(ancestor);
  }
  return previous === undefined;
}

/** True when a scoped rule key selects the element (the scope itself is any ancestor). */
export function keyMatches(key: string, el: Element): boolean {
  const steps = parseKey(key);
  if (steps === null || steps.length === 0) return false;
  return matchesSteps(el, steps, steps.length - 1);
}

/** The rules of the sheet that select the element, in sheet order. */
export function rulesMatching(sheet: StyleSheet, el: Element): Rule[] {
  return sheet.rules.filter((rule) => keyMatches(rule.key, el));
}

/** The last matching declaration of a property, unconsumed or not, without consuming it. */
export function valueFor(sheet: StyleSheet, el: Element, prop: string): string | undefined {
  let found: Declaration | undefined;
  for (const rule of rulesMatching(sheet, el))
    for (const d of rule.declarations) if (d.prop === prop) found = d;
  return found?.value;
}

/** Takes a property from every rule that selects the element; returns the last value. */
export function takeFor(sheet: StyleSheet, el: Element, prop: string): string | undefined {
  let value: string | undefined;
  for (const rule of rulesMatching(sheet, el)) value = take(sheet, rule.key, prop) ?? value;
  return value;
}

/** Consumes the declarations of the element's rules that equal the renderer's own values. */
export function consumeKnownFor(
  sheet: StyleSheet,
  el: Element,
  expected: Record<string, string>,
): void {
  for (const rule of rulesMatching(sheet, el)) {
    const own = rule.declarations.filter((d) => expected[d.prop] !== undefined);
    if (own.length === 0) continue;
    const partial: Record<string, string> = {};
    for (const d of own) partial[d.prop] = expected[d.prop] ?? '';
    // consumeKnown marks the whole rule when every declaration matches; a rule that also carries
    // other declarations is consumed declaration by declaration
    if (!consumeKnown(sheet, rule.key, expected)) {
      for (const d of own) {
        if (normalize(expected[d.prop] ?? '') === normalize(d.value)) d.consumed = true;
      }
      if (rule.declarations.every((d) => d.consumed)) rule.consumed = true;
    }
  }
}

function normalize(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*([,()/])\s*/g, '$1')
    .trim()
    .toLowerCase();
}

/** Text options that read nowrap from the scoped sheet as well as from inline styles. */
export function textOptions(ctx: MapContext): TextOptions {
  return {
    unhandled: ctx.unhandled,
    nowrap: (el) => takeFor(ctx.sheet, el, 'white-space') === 'nowrap',
  };
}

// ---------------------------------------------------------------------------------------------
// Grid composites

const JUSTIFY = ['start', 'space-between'] as const;
const ALIGN = ['start', 'center', 'end', 'stretch'] as const;

type GridSpec = {
  tracks: string;
  gap?: number;
  justify?: (typeof JUSTIFY)[number];
  align?: (typeof ALIGN)[number];
};

/**
 * Reads a grid from the rules that select the element and consumes what became properties:
 * `display: grid`, the column template, the gap, `justify-content` and `align-items`. Null when
 * no matching rule makes the element a grid.
 */
export function gridFromRules(ctx: MapContext, el: Element): GridSpec | null {
  const display = valueFor(ctx.sheet, el, 'display');
  if (display !== 'grid') return null;
  takeFor(ctx.sheet, el, 'display');
  const tracks = (takeFor(ctx.sheet, el, 'grid-template-columns') ?? '1fr').trim();
  const spec: GridSpec = { tracks: tracks.replace(/\s+/g, ' ') };
  const gapRaw = takeFor(ctx.sheet, el, 'gap');
  const columnGap = takeFor(ctx.sheet, el, 'column-gap');
  const rowGap = takeFor(ctx.sheet, el, 'row-gap');
  const gap = pxNumber(gapRaw?.split(/\s+/)[0]) ?? pxNumber(columnGap) ?? pxNumber(rowGap);
  if (gap !== undefined) spec.gap = gap;
  else if (gapRaw !== undefined) ctx.unhandled.push(`${describe(el)} gap ${gapRaw}`);
  const justify = takeFor(ctx.sheet, el, 'justify-content');
  if (justify !== undefined) {
    const known = JUSTIFY.find((j) => j === justify.trim());
    if (known && known !== 'start') spec.justify = known;
    else if (justify.trim() !== 'start' && justify.trim() !== 'normal')
      ctx.unhandled.push(`${describe(el)} justify-content ${justify}`);
  }
  const align = takeFor(ctx.sheet, el, 'align-items');
  if (align !== undefined) {
    const known = ALIGN.find((a) => a === align.trim());
    if (known && known !== 'stretch') spec.align = known;
    else if (align.trim() !== 'stretch' && align.trim() !== 'normal')
      ctx.unhandled.push(`${describe(el)} align-items ${align}`);
  }
  return spec;
}

function describe(el: Element): string {
  const cls = classList(el);
  return `<${el.tagName}${cls.length ? ` class="${cls.join(' ')}"` : ''}>`;
}

/**
 * Builds a composite from a grid spec and the element's content children: each child is one cell
 * whose blocks are mapped with the cell's width (the track arithmetic of the schema), so a slot-fit
 * diagram or a nested grid sizes itself the way it did in the column.
 */
function compositeOf(
  ctx: MapContext,
  path: string,
  spec: GridSpec,
  nodes: ChildNode[],
  mapChild: (ctx: MapContext, node: ChildNode, path: string) => Block[],
  extra: { caption?: string; captionSize?: 16 | 15 } = {},
): Block {
  const items = nodes.filter((node) => isElement(node) || (isText(node) && node.value.trim()));
  const shape = {
    tracks: spec.tracks,
    ...(spec.gap !== undefined ? { gap: spec.gap } : {}),
    cells: items.map(() => ({ blocks: [] as Block[] })),
  };
  const widths = cellWidths(shape, ctx.slotWidth);
  const cells = items.map((node, index) => {
    const width = widths[index];
    const inner: MapContext = { ...ctx, slotWidth: width };
    return { blocks: mapChild(inner, node, `${path}/cells/${index}/blocks`) };
  });
  const body: Omit<BlockOf<'composite'>, 'id' | 'type'> = {
    tracks: spec.tracks,
    ...(spec.gap !== undefined ? { gap: spec.gap } : {}),
    ...(spec.justify !== undefined ? { justify: spec.justify } : {}),
    ...(spec.align !== undefined ? { align: spec.align } : {}),
    ...(extra.caption !== undefined ? { caption: extra.caption } : {}),
    ...(extra.captionSize !== undefined ? { captionSize: extra.captionSize } : {}),
    cells,
  };
  return newBlock(ctx, 'composite', path, body);
}

// ---------------------------------------------------------------------------------------------
// The candidates

/** The values the renderer writes for a shot image (head:88; sheet.css .shot). */
const SHOT_IMAGE_RULES: Record<string, string> = {
  display: 'block',
  width: '100%',
  height: 'auto',
  border: '1px solid var(--hair)',
  background: 'var(--plate)',
};

/** Consumes the shot image declarations a slide restates for its images (s67:7, s84:15). */
export function consumeShotImageRules(ctx: MapContext, img: Element): void {
  consumeKnownFor(ctx.sheet, img, SHOT_IMAGE_RULES);
  for (const rule of rulesMatching(ctx.sheet, img)) {
    for (const d of rule.declarations) {
      if (d.consumed || SHOT_IMAGE_RULES[d.prop] === undefined) continue;
      ctx.unhandled.push(`${rule.selector} ${d.prop} ${d.value}`);
    }
  }
}

/** A bare `<img>` in a figure grid: a shot at the column width (s67:15-17, s84:31). */
export function bareImage(ctx: MapContext, img: Element, path: string): Block {
  const src = attr(img, 'src') ?? '';
  const dark = attr(img, 'data-dark');
  const alt = attr(img, 'alt') ?? '';
  const asset = ctx.assets.register({ src, dark, alt });
  consumeShotImageRules(ctx, img);
  const block = newBlock(ctx, 'shot', path, { asset, fit: 'width' });
  addResidualStyle(ctx, block, parseStyle(attr(img, 'style')));
  return block;
}

/** The figure rules a composite figure consumes (s67:5, s84:14): margin, display, gap. */
function consumeFigureGrid(ctx: MapContext, figure: Element): number | undefined {
  takeFor(ctx.sheet, figure, 'margin');
  const display = takeFor(ctx.sheet, figure, 'display');
  if (display !== undefined && display !== 'grid')
    ctx.unhandled.push(`${describe(figure)} display ${display}`);
  return pxNumber(takeFor(ctx.sheet, figure, 'gap'));
}

/** A figcaption's size from its rules (16 or 15); line-height and color are the renderer's. */
function captionSizeOf(ctx: MapContext, caption: Element): 16 | 15 | undefined {
  const size = pxIn(takeFor(ctx.sheet, caption, 'font-size'), [16, 15] as const);
  takeFor(ctx.sheet, caption, 'line-height');
  takeFor(ctx.sheet, caption, 'color');
  return size ?? (hasClass(caption, 'cap') ? 15 : undefined);
}

/**
 * A figure whose content is not one image: a composite with a caption (s67:14-22 the compare rig,
 * s84:26-35 the mark bench). The cells are the children before the figcaption, one per child.
 */
export function compositeFigure(
  ctx: MapContext,
  figure: Element,
  path: string,
  mapChild: (ctx: MapContext, node: ChildNode, path: string) => Block[],
): Block {
  const caption = children(figure).find((c) => c.tagName === 'figcaption');
  const nodes = contentChildren(figure).filter((node) => node !== caption);
  const gap = consumeFigureGrid(ctx, figure);
  const spec: GridSpec = { tracks: '1fr', gap: gap ?? 12 };
  const captionSize = caption ? captionSizeOf(ctx, caption) : undefined;
  const block = compositeOf(ctx, path, spec, nodes, mapChild, {
    ...(caption ? { caption: textOfElement(caption, textOptions(ctx)) } : {}),
    ...(captionSize !== undefined ? { captionSize } : {}),
  });
  addResidualStyle(ctx, block, parseStyle(attr(figure, 'style')));
  return block;
}

/**
 * `h3` to `h6`: the grammar has h1, h2, big and title (head:57-61), so a lower heading becomes an
 * h2 whose slide rule travels inline on the block (font size, line height, tracking, margins) and
 * the rule is consumed (s83:6: a 26 px display label over a plate).
 */
export function lowerHeading(ctx: MapContext, el: Element, path: string): Block {
  const inline = parseStyle(attr(el, 'style'));
  const declarations = new Map<string, string>();
  for (const rule of rulesMatching(ctx.sheet, el)) {
    for (const d of rule.declarations) {
      declarations.set(d.prop, d.value);
      d.consumed = true;
    }
    rule.consumed = true;
  }
  for (const [prop, value] of inline) declarations.set(prop, value);
  const block = newBlock(ctx, 'heading', path, {
    level: 'h2',
    text: textOfElement(el, textOptions(ctx)),
  });
  if (declarations.size > 0) addResidualStyle(ctx, block, declarations);
  ctx.unhandled.push(`<${el.tagName}> mapped to an h2 heading with its rule inline`);
  return block;
}

/** A text div a rule sizes at or above the lead size reads as a display heading. */
const DISPLAY_FLOOR = 26;

/**
 * A div or span with inline content only: an h2 when a rule sizes it at 26 px or more (s83:10
 * `.name` at 44 px, `.names` at 30 px), a paragraph otherwise. Its rules stay residual and reach
 * the block through the class it keeps. The block records inline what the source div did not have
 * and the element it maps to does: an h2 carries `text-wrap: balance` (head:57) and an 18 px
 * bottom margin, a p the slide's own `p` rules (s83:16 `.fixed p { margin-top: 8px }`); measured
 * in the first re-import, the balance rewrapped the names line and the p margin moved the row by
 * 8 px.
 */
export function textElement(
  ctx: MapContext,
  el: Element,
  path: string,
  keepClasses: (block: Block, el: Element) => void,
): Block {
  const size = pxNumber(valueFor(ctx.sheet, el, 'font-size'));
  const text = textOfElement(el, textOptions(ctx));
  const inline = parseStyle(attr(el, 'style'));
  let block: Block;
  if (size !== undefined && size >= DISPLAY_FLOOR) {
    block = newBlock(ctx, 'heading', path, { level: 'h2', text, marginBottom: 0 });
    // The h2 keeps the display features (cv11, ss01) the source div lacked: the export's Display
    // face has them frozen in, so a heading without them cannot travel (M5 round three measured
    // fixed-points#h3 dw +7 with them neutralized), and the web render differs from the source
    // by the alternates' advances only, inside the 0.5 percent pixel budget.
    if (!inline.has('text-wrap') && valueFor(ctx.sheet, el, 'text-wrap') === undefined)
      inline.set('text-wrap', 'wrap');
  } else {
    block = newBlock(ctx, 'paragraph', path, { text, marginTop: 0 });
  }
  keepClasses(block, el);
  addResidualStyle(ctx, block, inline);
  return block;
}

/** The icon of a standalone `<svg class="ic info"><use href="#i-lock-closed"/></svg>`. */
function standaloneIcon(svg: Element): Icon {
  const use = children(svg).find((c) => c.tagName === 'use');
  const href = use ? (attr(use, 'href') ?? attr(use, 'xlink:href') ?? '') : '';
  const name = href.replace(/^#i-/, '').replace(/^#/, '');
  if (!isIconName(name)) throw new Unmapped(`icon "${name}" is not in the sprite`, svg);
  const color = (['ok', 'warn', 'no', 'info'] as IconColor[]).find((c) => hasClass(svg, c));
  return color ? { name, color } : { name };
}

/**
 * A standalone icon in a grid cell (s83:10-11: the closed lock beside each fixed point). The
 * grammar seats icons in rows keys, plain rows, board states and diagrams (DECK-GRAMMAR.md:40),
 * so the cell holds a one-icon declared diagram: a 24 unit viewBox with the icon at 24, drawn at
 * the cell's width. The block keeps the `ic` and tone classes so the slide's `.ic` rule (width,
 * height, margin) still sizes it, and the icon's color is the tone's.
 */
export function iconDiagram(
  ctx: MapContext,
  svg: Element,
  path: string,
  keepClasses: (block: Block, classes: string[]) => void,
): Block {
  const icon = standaloneIcon(svg);
  const style = parseStyle(attr(svg, 'style'));
  removeAttr(svg, 'style');
  const block = newBlock(ctx, 'dia', path, {
    fit: { viewBox: [0, 0, 24, 24] },
    data: {
      w: 24,
      h: 24,
      lines: [],
      rects: [],
      markers: [],
      texts: [],
      icons: [
        { name: icon.name, x: 0, y: 0, size: 24, ...(icon.color ? { color: icon.color } : {}) },
      ],
      marks: [],
    },
    alt: attr(svg, 'aria-label') ?? '',
  });
  keepClasses(block, classList(svg));
  addResidualStyle(ctx, block, style);
  return block;
}

/**
 * The composite candidate for an element the grammar names no block for: a grid by its rules, a
 * flex column or a plain block flow of blocks as a one-track composite, an inline-only element as
 * text. Throws Unmapped when the element mixes loose text with blocks.
 */
export function compositeCandidate(
  ctx: MapContext,
  el: Element,
  path: string,
  mapChild: (ctx: MapContext, node: ChildNode, path: string) => Block[],
  keepClasses: (block: Block, el: Element) => void,
): Block {
  const grid = gridFromRules(ctx, el);
  const nodes = contentChildren(el);
  const looseText = nodes.some((node) => isText(node) && node.value.trim().length > 0);
  if (grid) {
    if (looseText) throw new Unmapped(`loose text inside the grid ${describe(el)}`, el);
    const block = compositeOf(ctx, path, grid, nodes, mapChild);
    keepClasses(block, el);
    addResidualStyle(ctx, block, parseStyle(attr(el, 'style')));
    return block;
  }
  if (isInlineOnly(el) && nodes.length > 0 && (looseText || nodes.every(isText))) {
    return textElement(ctx, el, path, keepClasses);
  }
  if (looseText) throw new Unmapped(`loose text inside ${describe(el)}`, el);
  // A flex column with a gap is the deck's .stack; a block flow keeps the children's own margins.
  const display = valueFor(ctx.sheet, el, 'display');
  let gap = 0;
  if (display === 'flex') {
    const direction = valueFor(ctx.sheet, el, 'flex-direction');
    if (direction !== 'column') throw new Unmapped(`a flex row ${describe(el)}`, el);
    takeFor(ctx.sheet, el, 'display');
    takeFor(ctx.sheet, el, 'flex-direction');
    gap = pxNumber(takeFor(ctx.sheet, el, 'gap')) ?? 0;
  } else if (display !== undefined && display !== 'block') {
    throw new Unmapped(`${describe(el)} with display ${display}`, el);
  }
  if (nodes.length === 0) throw new Unmapped(`an empty ${describe(el)}`, el);
  const block = compositeOf(ctx, path, { tracks: '1fr', gap }, nodes, mapChild);
  keepClasses(block, el);
  addResidualStyle(ctx, block, parseStyle(attr(el, 'style')));
  return block;
}

/** True when a figure has no image of its own at the top level (a rig, a bench). */
export function isCompositeFigure(figure: Element): boolean {
  return !children(figure).some((c) => c.tagName === 'img');
}

/** True for a standalone `svg.ic` (not inside a rows key or a plain row, which their mappers read). */
export function isStandaloneIcon(el: Element): boolean {
  return el.tagName === 'svg' && hasClass(el, 'ic');
}

/** The block-css values of the 20 px plain list (s84:8-11), consumed when the slide restates them. */
export const PLAIN_20_RULES: Record<string, Record<string, string>> = {
  'SCOPE .plain > span': { padding: '8px 0' },
  'SCOPE .plain > span > .ic': {
    width: '20px',
    height: '20px',
    'vertical-align': '-4px',
    'margin-right': '10px',
  },
  'SCOPE .plain > span:has(> .ic)': { 'padding-left': '30px', 'text-indent': '-30px' },
};

export function consumePlain20Rules(ctx: MapContext): void {
  for (const [key, expected] of Object.entries(PLAIN_20_RULES))
    consumeKnown(ctx.sheet, key, expected);
}

/** The row `min-height` of a ruled table from the rules that select its rows (s25:7). */
export function rowMinHeight(ctx: MapContext, rowsEl: Element): number | undefined {
  const first = children(rowsEl)[0];
  if (!first) return undefined;
  return pxNumber(takeFor(ctx.sheet, first, 'min-height'));
}

/** A diagram's fixed width rule (s25:9 `.ex svg.dia { width: 300px }`), consumed when it is the cell's width. */
export function consumeDiaWidth(ctx: MapContext, svg: Element): void {
  const width = pxNumber(valueFor(ctx.sheet, svg, 'width'));
  if (width === undefined) return;
  if (ctx.slotWidth !== undefined && Math.abs(width - ctx.slotWidth) < 0.01)
    takeFor(ctx.sheet, svg, 'width');
}
