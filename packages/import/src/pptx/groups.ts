// Groups (gslides-parity SPEC-5 0.48, 5.1; R04 4, 5.9): one `p:grpSp` read into its members'
// blocks with `pos.group` set to a path. Every member's box goes through the group's child
// transform (`a:chOff`, `a:chExt` onto `a:off`, `a:ext`), then the group's rotation and flips
// compose into the member's `pos` (its centre turns about the group's centre, the angle adds,
// the flips toggle). A nested group writes the path `outer/inner` on its leaves (the path
// spelling of 0.48), so the group tree round trips; the source path is kept as
// `ext.pptxGroupPath` on every leaf. A group of one member is the member alone.
import type { Element } from '@xmldom/xmldom';

import type { Block } from '@turboslide/schema/blocks';
import { slugify } from '@turboslide/schema/ids';
import type { Flip, Position } from '@turboslide/schema/position';
import { normalizeRotation, toggleFlip } from '@turboslide/schema/position';

import type { SlideContext } from './context.ts';
import { px2, rowOn, shapeFacts } from './context.ts';
import { ownXfrm } from './inherit.ts';
import type { Xfrm } from './inherit.ts';
import { ROW_CODES } from './report.ts';
import type { SheetMapping } from './units.ts';
import { angleOf } from './units.ts';
import { effectiveChildren } from './xml.ts';

/** The child space of a group: the affine map from a child's `a:off` into the parent's space. */
export type ChildSpace = {
  /** the group's own box in the parent's space (EMU) */
  off: [number, number];
  ext: [number, number];
  chOff: [number, number];
  chExt: [number, number];
  /** degrees clockwise about the group's centre */
  rotate: number;
  flipH: boolean;
  flipV: boolean;
};

/** The child space of a group transform; the identity for a group without one. */
export function childSpace(xfrm: Xfrm | undefined): ChildSpace | undefined {
  if (xfrm === undefined) return undefined;
  const chOff = xfrm.chOff ?? xfrm.off;
  const chExt = xfrm.chExt ?? xfrm.ext;
  return {
    off: xfrm.off,
    ext: xfrm.ext,
    chOff,
    chExt: [chExt[0] || 1, chExt[1] || 1],
    rotate: angleOf(xfrm.rot),
    flipH: xfrm.flipH,
    flipV: xfrm.flipV,
  };
}

/** A child transform mapped into the parent's space: the box scaled and offset, before the group's rotation. */
export function mapChildXfrm(child: Xfrm, space: ChildSpace): Xfrm {
  const kx = space.ext[0] / space.chExt[0];
  const ky = space.ext[1] / space.chExt[1];
  return {
    ...child,
    off: [
      space.off[0] + (child.off[0] - space.chOff[0]) * kx,
      space.off[1] + (child.off[1] - space.chOff[1]) * ky,
    ],
    ext: [child.ext[0] * kx, child.ext[1] * ky],
  };
}

/**
 * Composes a group's rotation and flips into a member's position (R04 5.9): the member's centre
 * is mirrored and rotated about the group's centre, its own angle gains the group's, its flips
 * toggle. Positions are in sheet px; the group's centre is given in sheet px.
 */
export function composeGroup(
  pos: Position,
  group: { cx: number; cy: number; rotate: number; flipH: boolean; flipV: boolean },
): Position {
  const next: Position = { ...pos };
  let cx = pos.x + pos.w / 2;
  let cy = pos.y + pos.h / 2;
  let rotate = pos.rotate ?? 0;
  let flip: Flip | undefined = pos.flip;
  if (group.flipH) {
    cx = 2 * group.cx - cx;
    rotate = normalizeRotation(360 - rotate);
    flip = toggleFlip(flip, 'h');
  }
  if (group.flipV) {
    cy = 2 * group.cy - cy;
    rotate = normalizeRotation(360 - rotate);
    flip = toggleFlip(flip, 'v');
  }
  if (group.rotate !== 0) {
    const rad = (group.rotate * Math.PI) / 180;
    const dx = cx - group.cx;
    const dy = cy - group.cy;
    cx = group.cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    cy = group.cy + dx * Math.sin(rad) + dy * Math.cos(rad);
    rotate = normalizeRotation(rotate + group.rotate);
  }
  next.x = px2(cx - pos.w / 2);
  next.y = px2(cy - pos.h / 2);
  if (rotate === 0) delete next.rotate;
  else next.rotate = rotate;
  if (flip === undefined) delete next.flip;
  else next.flip = flip;
  return next;
}

/** The group's centre in sheet px from its box in the parent's space. */
export function groupCentre(space: ChildSpace, mapping: SheetMapping): { cx: number; cy: number } {
  const x = mapping.offset[0] + space.off[0] * mapping.scale;
  const y = mapping.offset[1] + space.off[1] * mapping.scale;
  return { cx: x + (space.ext[0] * mapping.scale) / 2, cy: y + (space.ext[1] * mapping.scale) / 2 };
}

/** The `p:grpSpPr` transform of a group. */
export function groupXfrm(grpSp: Element): Xfrm | undefined {
  const grpSpPr = effectiveChildren(grpSp).find((node) => node.localName === 'grpSpPr');
  return grpSpPr === undefined ? undefined : ownXfrm(grpSpPr);
}

/** The group tag a `p:grpSp` writes: the slug of its name, unique per slide (`group`, `group-2`). */
export function groupTag(grpSp: Element, taken: Set<string>): string {
  const facts = shapeFacts(grpSp);
  const base = slugify(facts.name.replace(/^(Group|Grupo|Gruppe)\s*\d*$/i, '')) || 'group';
  let tag = base;
  let n = 2;
  while (taken.has(tag)) {
    tag = `${base}-${n}`;
    n += 1;
  }
  taken.add(tag);
  return tag;
}

export type GroupFrame = {
  /** the group path the members of this group carry */
  path: string;
  /** the source path (the `cNvPr` names joined) for `ext.pptxGroupPath` */
  sourcePath: string;
  space: ChildSpace | undefined;
};

/**
 * A member's position read in a group's child space, mapped into the parent's space (R04 4): the
 * box scales by the group's `ext / chExt` about `chOff` and lands at `off`; the position stays in
 * the mapping's sheet px convention, so the same mapping reads every level.
 */
export function mapThroughSpace(pos: Position, space: ChildSpace, mapping: SheetMapping): Position {
  const kx = space.ext[0] / space.chExt[0];
  const ky = space.ext[1] / space.chExt[1];
  const [ox, oy] = mapping.offset;
  const rawX = (pos.x - ox) / mapping.scale;
  const rawY = (pos.y - oy) / mapping.scale;
  const x = space.off[0] + (rawX - space.chOff[0]) * kx;
  const y = space.off[1] + (rawY - space.chOff[1]) * ky;
  return {
    ...pos,
    x: px2(ox + x * mapping.scale),
    y: px2(oy + y * mapping.scale),
    w: Math.max(1, px2(pos.w * kx)),
    h: Math.max(1, px2(pos.h * ky)),
  };
}

/**
 * Applies a stack of enclosing groups to a member's blocks, the innermost frame last in the
 * list: each frame maps the box through its child space, then composes its rotation and flips
 * about its centre in the parent's space; the innermost group's path lands on every block and the
 * source path on `ext.pptxGroupPath`.
 */
export function applyGroups(
  blocks: Block[],
  frames: readonly GroupFrame[],
  ctx: SlideContext,
): Block[] {
  if (frames.length === 0) return blocks;
  const inner = frames[frames.length - 1] as GroupFrame;
  return blocks.map((block) => {
    if (block.pos === undefined) return block;
    let pos = block.pos;
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      const frame = frames[i] as GroupFrame;
      if (frame.space === undefined) continue;
      pos = mapThroughSpace(pos, frame.space, ctx.mapping);
      if (frame.space.rotate === 0 && !frame.space.flipH && !frame.space.flipV) continue;
      const centre = groupCentre(frame.space, ctx.mapping);
      pos = composeGroup(pos, {
        ...centre,
        rotate: frame.space.rotate,
        flipH: frame.space.flipH,
        flipV: frame.space.flipV,
      });
    }
    const next: Block = { ...block, pos: { ...pos, group: inner.path } };
    next.ext = { ...(block.ext ?? {}), pptxGroupPath: inner.sourcePath };
    return next;
  });
}

/** Reports a nested group once per inner group, so the reader of the report sees the tree kept as a path (SPEC-5 0.48). */
export function noteNested(ctx: SlideContext, grpSp: Element, path: string): void {
  if (!path.includes('/')) return;
  ctx.report.row('kept', {
    ...rowOn(ctx, shapeFacts(grpSp).name),
    code: ROW_CODES.groupNested,
    message: `A nested group kept its tree as the path ${path}`,
  });
}
