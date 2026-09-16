// SmartArt (gslides-parity SPEC-5 5.1; R04 5.10): a `p:graphicFrame` whose graphic data is a
// diagram (`dgm:relIds`) is read from its drawing part, the last laid out output PowerPoint
// wrote (`dsp:drawing/dsp:spTree/dsp:sp`), each shape mapped as a slide shape inside the frame's
// box under one group tag, so the text stays editable; a file without the drawing part gets a
// labelled box and a row, because the data model alone cannot be laid out here.
import type { Element } from '@xmldom/xmldom';

import type { Block } from '@turboslide/schema/blocks';
import type { Position } from '@turboslide/schema/position';

import type { SlideContext } from './context.ts';
import { altOf, px2, rowOn } from './context.ts';
import type { ShapeFacts } from './context.ts';
import { ownXfrm } from './inherit.ts';
import { REL } from './package.ts';
import { placeholderBox } from './pictures.ts';
import { ROW_CODES } from './report.ts';
import { readShape } from './shapes.ts';
import { attrNS, child, elementChildren, is } from './xml.ts';

/** The drawing part of a diagram frame: through the data part's relationships (`r:dm`), else the slide's own. */
export function diagramDrawingPart(
  frame: Element,
  relIds: Element,
  ctx: SlideContext,
): string | undefined {
  const dm = attrNS(relIds, 'r', 'dm');
  const dataPart = dm === undefined ? undefined : ctx.pkg.relationship(ctx.slide.part, dm)?.part;
  if (dataPart !== undefined) {
    const drawing = ctx.pkg.firstRelated(dataPart, REL.diagramDrawing);
    if (drawing !== undefined) return drawing;
  }
  const own = ctx.pkg.firstRelated(ctx.slide.part, REL.diagramDrawing);
  void frame;
  return own;
}

/**
 * Reads a diagram frame: every `dsp:sp` of the drawing part as a shape positioned inside the
 * frame's box (the drawing's coordinates are in the frame's own space at the frame's size), under
 * the group tag of the frame's name.
 */
export function readDiagram(
  frame: Element,
  relIds: Element,
  pos: Position,
  facts: ShapeFacts,
  ctx: SlideContext,
): Block[] {
  const object = facts.name;
  const drawingPart = diagramDrawingPart(frame, relIds, ctx);
  if (drawingPart === undefined || !ctx.pkg.has(drawingPart)) {
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.smartart,
      message: 'SmartArt without a layout part was dropped; a labelled box stands in its place',
    });
    return [
      placeholderBox(ctx.ids.take(facts.name, 'diagram'), pos, altOf(facts) ?? 'SmartArt', ctx),
    ];
  }
  const root = ctx.pkg.root(drawingPart);
  const spTree =
    child(root, 'dsp', 'spTree') ?? elementChildren(root).find((el) => el.localName === 'spTree');
  if (spTree === undefined) {
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.smartart,
      message: 'SmartArt with an empty layout part was dropped; a labelled box stands in its place',
    });
    return [
      placeholderBox(ctx.ids.take(facts.name, 'diagram'), pos, altOf(facts) ?? 'SmartArt', ctx),
    ];
  }
  const tag = ctx.ids.take(facts.name, 'smartart');
  const group = ctx.group === undefined ? tag : `${ctx.group}/${tag}`;
  const inner: SlideContext = { ...ctx, group };
  const blocks: Block[] = [];
  // the drawing's shapes are laid out in EMU inside the frame's own box, offset by the frame's origin
  const frameXfrm = ownXfrm(frame);
  for (const node of elementChildren(spTree)) {
    if (!is(node, 'dsp', 'sp')) continue;
    const shape = node;
    // `dsp:sp` carries `dsp:spPr` and `dsp:txBody` in the same DrawingML as a slide shape; the
    // shape reader looks for `spPr` and `txBody` by local name so it reads them as they are
    const before = blocks.length;
    const result = readShape(shape, inner);
    for (const block of result.blocks) {
      if (block.pos !== undefined && frameXfrm !== undefined) {
        const originX = px2(ctx.mapping.offset[0] + frameXfrm.off[0] * ctx.mapping.scale);
        const originY = px2(ctx.mapping.offset[1] + frameXfrm.off[1] * ctx.mapping.scale);
        blocks.push({
          ...block,
          pos: {
            ...block.pos,
            x: px2(block.pos.x + originX - ctx.mapping.offset[0]),
            y: px2(block.pos.y + originY - ctx.mapping.offset[1]),
          },
        });
      } else blocks.push(block);
    }
    void before;
  }
  if (blocks.length === 0) {
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.smartart,
      message:
        'SmartArt whose layout part holds no shape was dropped; a labelled box stands in its place',
    });
    return [
      placeholderBox(ctx.ids.take(facts.name, 'diagram'), pos, altOf(facts) ?? 'SmartArt', ctx),
    ];
  }
  ctx.report.substitute({
    ...rowOn(ctx, object),
    code: ROW_CODES.smartart,
    message: `SmartArt was imported as its ${blocks.length} laid out shapes; the diagram cannot be relaid`,
  });
  return blocks.map((block) =>
    block.pos === undefined ? block : { ...block, pos: { ...block.pos, group } },
  );
}
