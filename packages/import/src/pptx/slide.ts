// One slide (gslides-parity SPEC-5 5.1; R04 5.1): the shape tree walked in z order and dispatched
// by element (`p:sp` and `p:cxnSp` to `shapes.ts` or `equations.ts`, `p:pic` to `pictures.ts` or
// `media.ts`, `p:graphicFrame` to `tables.ts`, `charts.ts`, `diagrams.ts` or the OLE preview,
// `p:grpSp` recursively through `groups.ts`, `p:contentPart` dropped), the master and layout
// shapes copied first under `pos.group: 'layout'`, the background, the notes, the title, the
// transition and the animations. Every imported slide is a canvas slide (`kind: 'content'`,
// `layout: { type: 'freeform' }`, `template: 'blank'`, every block with `pos`).
import type { Element } from '@xmldom/xmldom';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, SlideBackground } from '@turboslide/schema/deck';

import type { SlideContext } from './context.ts';
import { colorOf, isSlideChrome, parseRoundTripName, rowOn, shapeFacts } from './context.ts';
import { readChart } from './charts.ts';
import { readDiagram } from './diagrams.ts';
import { mathOf, readEquation } from './equations.ts';
import { applyGroups, childSpace, groupTag, groupXfrm, noteNested } from './groups.ts';
import type { GroupFrame } from './groups.ts';
import { ownXfrm, placeholderOf } from './inherit.ts';
import { isMediaPicture, mediaFacts, readMedia } from './media.ts';
import { REL } from './package.ts';
import { backgroundPicture, pictureFillPart, readOleFrame, readPicture } from './pictures.ts';
import { ROW_CODES } from './report.ts';
import { paragraphBuilds, readAnimations, readTransition } from './motion.ts';
import { positionOf, readShape } from './shapes.ts';
import { readTable } from './tables.ts';
import { readTextBody } from './text.ts';
import { readFill } from './theme.ts';
import {
  attr,
  attrNS,
  child,
  children,
  descendants,
  effectiveChildren,
  elementChildren,
  is,
  path,
} from './xml.ts';

/** PowerPoint's default slide names carry no information (`Slide 3`); Google's are `Google Shape;...` on shapes only. */
const DEFAULT_SLIDE_NAME = /^(slide|diapositiva|folie|diapositive)\s*\d*$/i;

export type SlideReading = {
  slide: ContentSlide;
  /** the source slide's shape count the fidelity table sums against (R04 10) */
  shapeCount: number;
};

/** The Turboslide master chrome of a round trip (`ts:master#...`), skipped even with master shapes on (R04 7). */
function isMasterChrome(name: string): boolean {
  return name.startsWith('ts:master#');
}

/** The Perfect file's page raster: a picture named `ts:<slide>#sheet` covering the page (R04 7). */
function isPageRaster(name: string): boolean {
  return /^ts:[a-z0-9-]+#sheet$/.test(name);
}

/** The blocks of a shape tree element list, in z order, with the enclosing group frames applied. */
async function readElements(
  elements: Element[],
  ctx: SlideContext,
  slideRoot: Element,
  frames: GroupFrame[],
  groupTags: Set<string>,
): Promise<Block[]> {
  const out: Block[] = [];
  for (const node of elements) {
    const blocks = await readElement(node, ctx, slideRoot, frames, groupTags);
    out.push(...blocks);
  }
  return out;
}

async function readElement(
  node: Element,
  ctx: SlideContext,
  slideRoot: Element,
  frames: GroupFrame[],
  groupTags: Set<string>,
): Promise<Block[]> {
  if (is(node, 'p', 'nvGrpSpPr') || is(node, 'p', 'grpSpPr') || is(node, 'p', 'extLst')) return [];
  const facts = shapeFacts(node);
  const trip = parseRoundTripName(facts.name);
  if (trip !== undefined && isSlideChrome(trip)) {
    ctx.report.row('kept', {
      ...rowOn(ctx, facts.name),
      code: ROW_CODES.masterChrome,
      message: 'Turboslide slide chrome skipped',
    });
    return [];
  }
  let blocks: Block[] = [];
  if (is(node, 'p', 'grpSp')) {
    const xfrm = groupXfrm(node);
    const space = childSpace(xfrm);
    const members = effectiveChildren(node).filter(
      (el) => !is(el, 'p', 'nvGrpSpPr') && !is(el, 'p', 'grpSpPr') && !is(el, 'p', 'extLst'),
    );
    if (members.length === 1) {
      // a group of one member is the member alone (R04 5.9): its box still maps through the child space
      const only = members[0] as Element;
      const frame: GroupFrame = {
        path: frames[frames.length - 1]?.path ?? '',
        sourcePath: frames[frames.length - 1]?.sourcePath ?? '',
        space,
      };
      const inner = await readElement(
        only,
        ctx,
        slideRoot,
        [
          ...frames.slice(0, -1),
          ...(frames.length > 0 ? [frames[frames.length - 1] as GroupFrame] : []),
          frame,
        ],
        groupTags,
      );
      return inner.map((block) =>
        frames.length === 0 && block.pos !== undefined
          ? { ...block, pos: withoutGroup(block.pos) }
          : block,
      );
    }
    // the exporter names a user group `g:<tag>` and a row group `<block>/row/<i>` (ooxml/groups.ts)
    const exported = /^g:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(facts.name)?.[1];
    const tag =
      exported !== undefined && !groupTags.has(exported)
        ? (groupTags.add(exported), exported)
        : groupTag(node, groupTags);
    const parent = frames[frames.length - 1];
    const framePath = parent === undefined ? tag : `${parent.path}/${tag}`;
    const sourcePath =
      parent === undefined ? facts.name || tag : `${parent.sourcePath}/${facts.name || tag}`;
    const frame: GroupFrame = { path: framePath, sourcePath, space };
    noteNested(ctx, node, framePath);
    const innerCtx: SlideContext = { ...ctx, group: undefined };
    const inner = await readElements(members, innerCtx, slideRoot, [...frames, frame], groupTags);
    return inner;
  }
  if (is(node, 'p', 'sp')) {
    if (facts.name !== '' && isMasterChrome(facts.name)) {
      ctx.report.row('kept', {
        ...rowOn(ctx, facts.name),
        code: ROW_CODES.masterChrome,
        message: 'Turboslide master chrome skipped',
      });
      return [];
    }
    const math = mathOf(node);
    blocks = math !== undefined ? readEquation(node, math, ctx) : readShape(node, ctx).blocks;
  } else if (is(node, 'p', 'cxnSp')) {
    blocks = readShape(node, ctx).blocks;
  } else if (is(node, 'p', 'pic')) {
    if (isPageRaster(facts.name)) {
      if (ctx.options.keepPageRaster) {
        blocks = readPicture(node, ctx);
        ctx.report.row('kept', {
          ...rowOn(ctx, facts.name),
          code: ROW_CODES.perfectRaster,
          message: 'Perfect file: the page raster was kept under the text layer (keepPageRaster)',
        });
      } else {
        ctx.report.row('kept', {
          ...rowOn(ctx, facts.name),
          code: ROW_CODES.perfectRaster,
          message: 'Perfect file: the page raster was dropped, the text layer was imported',
        });
        return [];
      }
    } else if (isMediaPicture(node)) {
      const facts2 = mediaFacts(node);
      blocks =
        facts2 === undefined
          ? readPicture(node, ctx)
          : await readMedia(node, facts2, slideRoot, ctx);
    } else blocks = readPicture(node, ctx);
  } else if (is(node, 'p', 'graphicFrame')) {
    blocks = readFrame(node, ctx);
  } else if (is(node, 'p', 'contentPart')) {
    ctx.report.drop({ ...rowOn(ctx, facts.name), code: ROW_CODES.ink, message: 'Ink was dropped' });
    return [];
  } else if (is(node, 'mc', 'AlternateContent')) {
    // a wrapper `effectiveChildren` could not resolve (neither branch understood): read its fallback
    const fallback = child(node, 'mc', 'Fallback');
    return fallback === undefined
      ? []
      : readElements(elementChildren(fallback), ctx, slideRoot, frames, groupTags);
  } else {
    return [];
  }
  const first = blocks[0];
  if (first !== undefined && facts.id > 0) ctx.shapeIds.set(facts.id, first.id);
  return applyGroups(blocks, frames, ctx);
}

function withoutGroup(pos: NonNullable<Block['pos']>): NonNullable<Block['pos']> {
  const { group: _group, ...rest } = pos;
  return rest;
}

/** A `p:graphicFrame`: a table, a chart, a diagram or an OLE object by its graphic data URI. */
function readFrame(frame: Element, ctx: SlideContext): Block[] {
  const facts = shapeFacts(frame);
  if (facts.hidden) {
    ctx.report.drop({
      ...rowOn(ctx, facts.name),
      code: 'shape.hidden',
      message: 'A hidden object was left out',
    });
    return [];
  }
  const xfrm = ownXfrm(frame);
  if (xfrm === undefined) {
    ctx.report.drop({
      ...rowOn(ctx, facts.name),
      code: 'shape.noBox',
      message: 'An object frame without a box was dropped',
    });
    return [];
  }
  const pos = positionOf(xfrm, ctx);
  const graphic = child(frame, 'a', 'graphic');
  const data = graphic === undefined ? undefined : child(graphic, 'a', 'graphicData');
  if (data === undefined) {
    ctx.report.drop({
      ...rowOn(ctx, facts.name),
      code: 'frame.empty',
      message: 'An object frame without graphic data was dropped',
    });
    return [];
  }
  const uri = attr(data, 'uri') ?? '';
  const tbl = child(data, 'a', 'tbl');
  if (tbl !== undefined) return readTable(frame, tbl, pos, facts, ctx);
  const chart = child(data, 'c', 'chart');
  if (chart !== undefined) {
    const rId = attrNS(chart, 'r', 'id');
    const part = rId === undefined ? undefined : ctx.pkg.relationship(ctx.slide.part, rId)?.part;
    if (part === undefined) {
      ctx.report.drop({
        ...rowOn(ctx, facts.name),
        code: ROW_CODES.chartKind,
        message: 'A chart frame without a chart part was dropped',
      });
      return [];
    }
    return readChart(frame, part, pos, facts, ctx);
  }
  const relIds = child(data, 'dgm', 'relIds');
  if (relIds !== undefined) return readDiagram(frame, relIds, pos, facts, ctx);
  const oleObj = child(data, 'p', 'oleObj') ?? descendants(data, 'p', 'oleObj')[0];
  if (oleObj !== undefined) return readOleFrame(frame, oleObj, pos, facts, ctx);
  if (
    uri.includes('zoom') ||
    descendants(data, 'p14', 'sectionZoom').length > 0 ||
    descendants(data, 'p15', 'prstTrans').length > 0
  ) {
    ctx.report.drop({
      ...rowOn(ctx, facts.name),
      code: ROW_CODES.zoom,
      message: 'A zoom object was dropped',
    });
    return [];
  }
  ctx.report.drop({
    ...rowOn(ctx, facts.name),
    code: 'frame.unknown',
    message: `An object of type ${uri.split('/').pop() ?? uri} has no form in the schema and was dropped`,
  });
  return [];
}

/** The master and layout shapes copied onto the slide (R04 5.1): every non placeholder shape, unless `showMasterSp="0"`. */
async function readMasterShapes(ctx: SlideContext, slideRoot: Element): Promise<Block[]> {
  if (!ctx.options.masterShapes) return [];
  const slideCSld = child(slideRoot, 'p', 'cSld');
  const showOnSlide = slideRoot.getAttribute('showMasterSp');
  if (showOnSlide === '0' || showOnSlide === 'false') return [];
  const out: Block[] = [];
  const layoutShow = ctx.chain.layout?.getAttribute('showMasterSp');
  const sources: Element[] = [];
  if (ctx.chain.master !== undefined && layoutShow !== '0' && layoutShow !== 'false')
    sources.push(ctx.chain.master);
  if (ctx.chain.layout !== undefined) sources.push(ctx.chain.layout);
  void slideCSld;
  for (const source of sources) {
    const tree = path(source, ['p', 'cSld'], ['p', 'spTree']);
    if (tree === undefined) continue;
    const shapes = effectiveChildren(tree).filter(
      (el) =>
        (is(el, 'p', 'sp') || is(el, 'p', 'pic') || is(el, 'p', 'cxnSp') || is(el, 'p', 'grpSp')) &&
        placeholderOf(el) === undefined &&
        !hasPlaceholderInside(el),
    );
    if (shapes.length === 0) continue;
    const layoutCtx: SlideContext = { ...ctx, group: 'layout' };
    const groupTags = new Set<string>(['layout']);
    for (const shape of shapes) {
      const facts = shapeFacts(shape);
      if (isMasterChrome(facts.name)) {
        ctx.report.row('kept', {
          ...rowOn(ctx, facts.name),
          code: ROW_CODES.masterChrome,
          message: 'Turboslide master chrome skipped',
        });
        continue;
      }
      const blocks = await readElement(shape, layoutCtx, slideRoot, [], groupTags);
      for (const block of blocks) {
        if (block.pos === undefined) continue;
        out.push({
          ...block,
          pos: { ...block.pos, group: 'layout' },
          ext: { ...(block.ext ?? {}), pptxLayoutShape: true },
        });
      }
    }
  }
  if (out.length > 0)
    ctx.report.row('kept', {
      ...rowOn(ctx, 'layout'),
      code: 'layout.shapes',
      message: `${out.length} master and layout shape${out.length === 1 ? '' : 's'} were copied onto the slide under the group layout`,
    });
  return out;
}

function hasPlaceholderInside(el: Element): boolean {
  return descendants(el, 'p', 'ph').length > 0;
}

/** The slide background (R04 5.1): a solid colour, a picture at the bottom of the stack, a gradient's first stop, or a theme reference. */
function readBackground(
  slideRoot: Element,
  ctx: SlideContext,
): { background?: SlideBackground; picture?: Block } {
  const bg = path(slideRoot, ['p', 'cSld'], ['p', 'bg']);
  if (bg === undefined) return {};
  const bgPr = child(bg, 'p', 'bgPr');
  if (bgPr !== undefined) {
    const picturePart = pictureFillPart(bgPr, ctx);
    if (picturePart !== undefined) {
      const picture = backgroundPicture(picturePart, ctx);
      return picture === undefined ? {} : { picture };
    }
    const fill = readFill(bgPr, ctx.chain.colors);
    if (fill === undefined || fill.kind === 'none') return {};
    if ('color' in fill && fill.color !== undefined) {
      if (fill.kind !== 'solid')
        ctx.report.substitute({
          ...rowOn(ctx, 'background'),
          code: ROW_CODES.shapeFill,
          message: `A ${fill.kind} background became its first colour`,
        });
      return { background: { color: colorOf(fill.color, ctx) } };
    }
    return {};
  }
  const bgRef = child(bg, 'p', 'bgRef');
  if (bgRef !== undefined) {
    const idx = Number(attr(bgRef, 'idx') ?? '0');
    const colorEl = elementChildren(bgRef)[0];
    if (idx >= 1001 && colorEl !== undefined) {
      const resolved = readFill(bgRef, ctx.chain.colors);
      if (resolved !== undefined && 'color' in resolved && resolved.color !== undefined) {
        ctx.report.substitute({
          ...rowOn(ctx, 'background'),
          code: ROW_CODES.shapeFill,
          message: 'A theme background style became its colour',
        });
        return { background: { color: colorOf(resolved.color, ctx) } };
      }
    }
  }
  return {};
}

/** The speaker notes: the `body` placeholder of the notes slide, paragraphs joined with `\n`. */
function readNotes(ctx: SlideContext): string | undefined {
  const notes = ctx.chain.notes;
  if (notes === undefined) return undefined;
  const tree = path(notes, ['p', 'cSld'], ['p', 'spTree']);
  if (tree === undefined) return undefined;
  for (const sp of children(tree, 'p', 'sp')) {
    const ph = placeholderOf(sp);
    if (ph === undefined || ph.type !== 'body') continue;
    const txBody = child(sp, 'p', 'txBody');
    if (txBody === undefined) continue;
    const paragraphs = children(txBody, 'a', 'p').map((p) =>
      descendants(p, 'a', 't')
        .map((t) => t.textContent ?? '')
        .join(''),
    );
    const text = paragraphs.join('\n').replace(/\n+$/, '');
    return text.trim() === '' ? undefined : text;
  }
  return undefined;
}

/** The slide title: `p:cSld name` when not a default, else the first title placeholder's text. */
function readTitle(slideRoot: Element, blocks: Block[]): string | undefined {
  const cSld = child(slideRoot, 'p', 'cSld');
  const name = cSld === undefined ? undefined : attr(cSld, 'name');
  if (name !== undefined && name.trim() !== '' && !DEFAULT_SLIDE_NAME.test(name.trim()))
    return name.trim();
  const heading = blocks.find(
    (block) => block.type === 'heading' && block.ext?.placeholder !== undefined,
  );
  if (heading !== undefined && heading.type === 'heading') {
    const plain = heading.text
      .replace(/\[([^\]]*)\]\([^)]*\)(\{[^}]*\})?/g, '$1')
      .replace(/[*]/g, '')
      .split('\n')[0]
      ?.trim();
    if (plain !== undefined && plain !== '')
      return plain.length > 120 ? plain.slice(0, 120) : plain;
  }
  return undefined;
}

/** Reads one slide of the presentation into a canvas slide. */
export async function readSlide(ctx: SlideContext): Promise<SlideReading> {
  const slideRoot = ctx.chain.slide;
  const tree = path(slideRoot, ['p', 'cSld'], ['p', 'spTree']);
  const blocks: Block[] = [];
  const { background, picture } = readBackground(slideRoot, ctx);
  if (picture !== undefined) blocks.push(picture);
  blocks.push(...(await readMasterShapes(ctx, slideRoot)));
  let shapeCount = 0;
  if (tree !== undefined) {
    const elements = effectiveChildren(tree).filter(
      (el) => !is(el, 'p', 'nvGrpSpPr') && !is(el, 'p', 'grpSpPr') && !is(el, 'p', 'extLst'),
    );
    shapeCount = countShapes(elements);
    blocks.push(...(await readElements(elements, ctx, slideRoot, [], new Set<string>(['layout']))));
  }
  const slide: ContentSlide = {
    schemaVersion: 1,
    id: ctx.slideId,
    kind: 'content',
    layout: { type: 'freeform' },
    template: 'blank',
    slots: { main: ctx.roundTrip ? foldExporterParts(blocks) : blocks },
  };
  const title = readTitle(slideRoot, blocks);
  if (title !== undefined) slide.title = title;
  const notes = readNotes(ctx);
  if (notes !== undefined) slide.notes = notes;
  if (ctx.slide.hidden) {
    slide.skip = true;
    ctx.report.row('kept', {
      ...rowOn(ctx, undefined),
      code: ROW_CODES.slideHidden,
      message: 'A hidden slide was imported as skipped',
    });
  }
  if (background !== undefined) slide.background = background;
  const transition = readTransition(slideRoot, ctx);
  if (transition !== undefined) slide.transition = transition;
  const builds = paragraphBuilds(slideRoot, ctx);
  const animations = readAnimations(slideRoot, ctx, builds);
  if (animations.length > 0) slide.animations = animations;
  slide.ext = { pptxPart: ctx.slide.part, pptxSlideId: ctx.slide.id };
  void readTextBody;
  void REL;
  return { slide, shapeCount };
}

/**
 * The exporter's decompositions folded back on a round trip (R04 7): a chart's title travels as
 * its own text box (`ts:<slide>#<chart>/title`) beside the chart part's `c:title`, so the chart
 * carries it and the box goes; a shape's text travels as a text box over the shape
 * (`ts:<slide>#<shape>/text`), so the text, its typography and its colour land back on the shape.
 */
function foldExporterParts(blocks: Block[]): Block[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const drop = new Set<string>();
  for (const block of blocks) {
    if (block.type !== 'text') continue;
    const name = typeof block.ext?.pptxName === 'string' ? block.ext.pptxName : '';
    const trip = parseRoundTripName(name);
    if (trip === undefined) continue;
    const owner = byId.get(trip.blockId);
    if (owner === undefined || owner === block) continue;
    if (trip.part === 'title' && owner.type === 'chart' && owner.title !== undefined) {
      drop.add(block.id);
      continue;
    }
    if (
      trip.part === 'text' &&
      (owner.type === 'shape' || owner.type === 'box') &&
      owner.text === undefined
    ) {
      owner.text = block.text;
      if (block.typography !== undefined) owner.typography = block.typography;
      if (block.color !== undefined) owner.color = block.color;
      if (block.valign !== undefined) owner.valign = block.valign;
      if (block.autofit !== undefined) owner.autofit = block.autofit;
      drop.add(block.id);
    }
  }
  return drop.size === 0 ? blocks : blocks.filter((block) => !drop.has(block.id));
}

/**
 * The source shape count of a tree (R04 10; SPEC-5 16.3): every leaf object, groups counted by
 * their members. The exporter's own chrome (`ts:<slide>#counter`, the mark, the frame, the crosses,
 * the chips, the wordmark, the Perfect file's page raster) is the theme's and not a content
 * object, so it is left out of the count as it is left out of the deck; `pptx-oracle.py` applies
 * the same name rule.
 */
export function countShapes(elements: Element[]): number {
  let count = 0;
  for (const el of elements) {
    if (is(el, 'p', 'grpSp'))
      count += countShapes(
        effectiveChildren(el).filter(
          (m) => !is(m, 'p', 'nvGrpSpPr') && !is(m, 'p', 'grpSpPr') && !is(m, 'p', 'extLst'),
        ),
      );
    else if (
      is(el, 'p', 'sp') ||
      is(el, 'p', 'pic') ||
      is(el, 'p', 'cxnSp') ||
      is(el, 'p', 'graphicFrame') ||
      is(el, 'p', 'contentPart')
    ) {
      const trip = parseRoundTripName(shapeFacts(el).name);
      if (trip !== undefined && (isSlideChrome(trip) || trip.blockId === 'sheet')) continue;
      count += 1;
    } else if (is(el, 'mc', 'AlternateContent')) {
      const fallback = child(el, 'mc', 'Fallback');
      if (fallback !== undefined) count += countShapes(elementChildren(fallback));
    }
  }
  return count;
}

/** True when an object name is the exporter's chrome or page raster (the oracle's rule, `pptx-oracle.py`). */
export function isExporterChrome(name: string): boolean {
  const trip = parseRoundTripName(name);
  return trip !== undefined && (isSlideChrome(trip) || trip.blockId === 'sheet');
}
