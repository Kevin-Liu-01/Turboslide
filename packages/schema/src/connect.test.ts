// Connector attachment (gslides-parity SPEC-2 2.4.7, 0.103, 0.107, 11.5 connect.test.ts):
// followConnectors keeps each attached end on its site after the target moves, resizes, rotates
// or flips; removing the target detaches; a duplicate of target and connectors renames the
// references; a reroute (an end moved onto another shape) sets the new attachment and drops the
// old; a rotated and flipped target's sites are rotated and mirrored.
import { describe, expect, it } from 'vitest';

import type { Block, ShapeBlock } from './blocks.ts';
import type { Position } from './position.ts';
import {
  attachConnector,
  attachedEndsOnSites,
  connectorAxis,
  connectorEnds,
  detachConnectors,
  detachMovedConnectors,
  followConnectors,
  renameConnectorRefs,
  siteAngleAt,
  siteAt,
  siteCount,
  targetSites,
} from './connect.ts';
import type { ContentSlide } from './deck.ts';
import type { Mutation } from './mutations.ts';
import { applyMutations } from './reduce.ts';
import { WORKED_DECK } from './fixtures.ts';
import { validateSlide } from './validate.ts';

function box(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Position> = {},
): Block {
  return { id, type: 'box', stroke: 'hair', pos: { x, y, w, h, z: 0, ...extra } };
}

/** A slide with two boxes and a horizontal line attached from a's right site (3) to b's left site (1). */
function slide(): ContentSlide {
  return {
    schemaVersion: 1,
    id: 'wired',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        box('a', 100, 100, 200, 100),
        box('b', 600, 100, 200, 100),
        {
          id: 'link',
          type: 'shape',
          shape: 'line',
          stroke: 'ink',
          orientation: 'horizontal',
          connect: { start: { block: 'a', site: 3 }, end: { block: 'b', site: 1 } },
          pos: { x: 300, y: 146, w: 300, h: 8, z: 1 },
        },
      ],
    },
  };
}

function apply(current: ContentSlide, mutations: Mutation[]): ContentSlide {
  const document = { deck: WORKED_DECK, slides: { wired: current } };
  return applyMutations(document, mutations).document.slides['wired'] as ContentSlide;
}

function connector(current: ContentSlide): ShapeBlock {
  return current.slots.main!.find((block) => block.id === 'link') as ShapeBlock;
}

describe('connection sites', () => {
  it('gives a box the eight sites of a rectangle in sheet pixels: the side midpoints then the corners', () => {
    const target = box('a', 100, 100, 200, 100);
    expect(siteCount(target)).toBe(8);
    expect(targetSites(target).slice(0, 4)).toEqual([
      { x: 200, y: 100 },
      { x: 100, y: 150 },
      { x: 200, y: 200 },
      { x: 300, y: 150 },
    ]);
    expect(siteAt(target, 4)).toEqual({ x: 100, y: 100 });
    expect(siteAt(target, 8)).toBeUndefined();
  });

  it('rotates and mirrors a target’s sites about its centre (0.107)', () => {
    const rotated = box('a', 100, 100, 200, 100, { rotate: 90 });
    // the top midpoint (200, 100) turns 90 degrees clockwise about (200, 150) to the right midpoint
    const top = siteAt(rotated, 0)!;
    expect(top.x).toBeCloseTo(250, 6);
    expect(top.y).toBeCloseTo(150, 6);
    const flipped = box('a', 100, 100, 200, 100, { flip: 'h' });
    // the left midpoint mirrors to the right
    expect(siteAt(flipped, 1)).toEqual({ x: 300, y: 150 });
    // the bottom midpoint mirrors to the top, then the half turn brings it back to the bottom
    const both = box('a', 100, 100, 200, 100, { rotate: 180, flip: 'v' });
    const site = siteAt(both, 2)!;
    expect(site.x).toBeCloseTo(200, 6);
    expect(site.y).toBeCloseTo(200, 6);
  });
});

describe('followConnectors', () => {
  it('leaves an attached connector alone while nothing moved and its ends lie on the sites', () => {
    const current = slide();
    expect(
      attachedEndsOnSites(connector(current), new Map(current.slots.main!.map((b) => [b.id, b]))),
    ).toEqual([]);
    expect(followConnectors(current, ['a'])).toEqual([]);
  });

  it('moves the attached end when the target moves and keeps the other end where it is', () => {
    const moved = apply(slide(), [
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'b',
        path: '/pos',
        value: { x: 600, y: 300, w: 200, h: 100, z: 0 },
      },
    ]);
    const follow = followConnectors(moved, ['b']);
    expect(follow.length).toBeGreaterThan(0);
    const next = apply(moved, follow);
    const ends = connectorEnds(connector(next));
    expect(ends.start).toEqual({ x: 300, y: 150 });
    expect(ends.end).toEqual({ x: 600, y: 350 });
    expect(connector(next).orientation).toBe('diagonal-down');
    expect(connector(next).connect).toEqual({
      start: { block: 'a', site: 3 },
      end: { block: 'b', site: 1 },
    });
    expect(validateSlide(next).issues.filter((issue) => issue.severity >= 2)).toEqual([]);
  });

  it('follows a resize, a rotation and a flip of the target', () => {
    const resized = apply(slide(), [
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'a',
        path: '/pos',
        value: { x: 100, y: 100, w: 100, h: 100, z: 0 },
      },
    ]);
    const afterResize = apply(resized, followConnectors(resized, ['a']));
    expect(connectorEnds(connector(afterResize)).start).toEqual({ x: 200, y: 150 });
    const rotated = apply(slide(), [
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'b',
        path: '/pos',
        value: { x: 600, y: 100, w: 200, h: 100, z: 0, rotate: 180 },
      },
    ]);
    const afterRotate = apply(rotated, followConnectors(rotated, ['b']));
    // b's left site turned to its right side
    expect(connectorEnds(connector(afterRotate)).end.x).toBeCloseTo(800, 6);
    const flipped = apply(slide(), [
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'b',
        path: '/pos',
        value: { x: 600, y: 100, w: 200, h: 100, z: 0, flip: 'h' },
      },
    ]);
    const afterFlip = apply(flipped, followConnectors(flipped, ['b']));
    expect(connectorEnds(connector(afterFlip)).end).toEqual({ x: 800, y: 150 });
  });

  it('exchanges the start and end fields when the target crosses to the other side, so the picture is the same', () => {
    const crossed = apply(slide(), [
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'b',
        path: '/pos',
        value: { x: -300, y: 100, w: 200, h: 100, z: 0 },
      },
    ]);
    const next = apply(crossed, followConnectors(crossed, ['b']));
    const line = connector(next);
    // b's left site is now at x -300, left of a's right site at 300: the geometry runs left to
    // right from b to a, so the attachments are exchanged and the ends still lie on the sites
    expect(line.connect).toEqual({ start: { block: 'b', site: 1 }, end: { block: 'a', site: 3 } });
    expect(connectorEnds(line).start).toEqual({ x: -300, y: 150 });
    expect(connectorEnds(line).end).toEqual({ x: 300, y: 150 });
  });

  it('detaches when the target leaves the slide and renames on a duplicate', () => {
    const current = slide();
    const detach = detachConnectors(current, ['b']);
    expect(detach).toEqual([
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'link',
        path: '/connect',
        value: { start: { block: 'a', site: 3 } },
      },
    ]);
    const both = detachConnectors(current, ['a', 'b']);
    expect(both).toEqual([
      { op: 'block.set', slideId: 'wired', blockId: 'link', path: '/connect' },
    ]);
    expect(
      renameConnectorRefs(
        connector(current).connect,
        new Map([
          ['a', 'a-2'],
          ['b', 'b-2'],
        ]),
      ),
    ).toEqual({
      start: { block: 'a-2', site: 3 },
      end: { block: 'b-2', site: 1 },
    });
    expect(renameConnectorRefs(connector(current).connect, new Map([['a', 'a-2']]))).toEqual({
      start: { block: 'a-2', site: 3 },
    });
    expect(renameConnectorRefs(connector(current).connect, new Map())).toBeUndefined();
  });

  it('reroutes an end onto another shape’s site and drops the old attachment (0.103)', () => {
    const current = slide();
    const withC: ContentSlide = {
      ...current,
      slots: { main: [...current.slots.main!, box('c', 600, 500, 200, 100)] },
    };
    const byId = new Map(withC.slots.main!.map((block) => [block.id, block]));
    const fields = attachConnector(connector(withC), byId, { end: { block: 'c', site: 0 } });
    expect(fields.connect).toEqual({
      start: { block: 'a', site: 3 },
      end: { block: 'c', site: 0 },
    });
    expect(fields.orientation).toBe('diagonal-down');
    const next = apply(withC, [
      ...Object.entries(fields).map(([path, value]): Mutation => ({
        op: 'block.set',
        slideId: 'wired',
        blockId: 'link',
        path: `/${path}`,
        value,
      })),
    ]);
    expect(connectorEnds(connector(next)).end).toEqual({ x: 700, y: 500 });
    // detaching an end keeps it where it is
    const detached = attachConnector(connector(next), byId, { start: null });
    expect(detached.connect).toEqual({ end: { block: 'c', site: 0 } });
    expect(connectorEnds({ ...connector(next), ...detached }).start).toEqual({ x: 300, y: 150 });
    // a line target and an out of range site are refused
    expect(() =>
      attachConnector(connector(withC), byId, { end: { block: 'link', site: 0 } }),
    ).toThrow(/takes no connector/);
    expect(() => attachConnector(connector(withC), byId, { end: { block: 'c', site: 9 } })).toThrow(
      /out of range/,
    );
    expect(() =>
      attachConnector(connector(withC), byId, { end: { block: 'nope', site: 0 } }),
    ).toThrow(/No block/);
  });

  it('is what the validator checks: a missing target, a line target and a site out of range are refused, an end off its site is a severity 2 note', () => {
    const current = slide();
    const bad = JSON.parse(JSON.stringify(current)) as ContentSlide;
    const line = bad.slots.main![2] as ShapeBlock;
    line.connect = { start: { block: 'nope', site: 0 }, end: { block: 'link', site: 0 } };
    const issues = validateSlide(bad).issues.filter((issue) => issue.code === 'connect');
    expect(issues.map((issue) => issue.severity)).toEqual([3, 3]);
    const far = JSON.parse(JSON.stringify(current)) as ContentSlide;
    (far.slots.main![2] as ShapeBlock).pos = { x: 300, y: 200, w: 300, h: 8, z: 1 };
    const off = validateSlide(far).issues.filter((issue) => issue.code === 'connect');
    expect(off.map((issue) => issue.severity)).toEqual([2, 2]);
    const range = JSON.parse(JSON.stringify(current)) as ContentSlide;
    (range.slots.main![2] as ShapeBlock).connect = { start: { block: 'a', site: 12 } };
    expect(
      validateSlide(range).issues.filter((issue) => issue.code === 'connect')[0]?.message,
    ).toMatch(/site 12/);
  });
});

describe('a connector moved by its body (the polish round, docs/POLISH.md item 27)', () => {
  it('detaches from every target that stayed, and the next move of the target leaves it alone', () => {
    const moved = apply(slide(), [
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'link',
        path: '/pos',
        value: { x: 450, y: 246, w: 300, h: 8, z: 1 },
      },
    ]);
    /* followConnectors skips the moved connector: nothing snaps it back in the same write */
    expect(followConnectors(moved, ['link'])).toEqual([]);
    const detach = detachMovedConnectors(moved, ['link']);
    expect(detach).toEqual([
      { op: 'block.set', slideId: 'wired', blockId: 'link', path: '/connect' },
    ]);
    const next = apply(moved, detach);
    expect(connector(next).connect).toBeUndefined();
    /* a moves afterwards: the detached connector keeps its box */
    const later = apply(next, [
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'a',
        path: '/pos',
        value: { x: 100, y: 400, w: 200, h: 100, z: 0 },
      },
    ]);
    expect(followConnectors(later, ['a'])).toEqual([]);
    expect(connector(later).pos).toEqual({ x: 450, y: 246, w: 300, h: 8, z: 1 });
  });

  it('keeps an attachment whose target moved in the same write, and writes nothing for an unattached line', () => {
    const together = detachMovedConnectors(slide(), ['link', 'a']);
    expect(together).toEqual([
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'link',
        path: '/connect',
        value: { start: { block: 'a', site: 3 } },
      },
    ]);
    expect(detachMovedConnectors(slide(), ['link', 'a', 'b'])).toEqual([]);
    const loose = apply(slide(), [
      { op: 'block.set', slideId: 'wired', blockId: 'link', path: '/connect' },
    ]);
    expect(detachMovedConnectors(loose, ['link'])).toEqual([]);
  });
});

describe('the axis of a connector at its sites (the polish round, docs/POLISH.md item 33)', () => {
  /** a and b as the fixture places them, with an elbow between the named sites. */
  function elbowSlide(
    startSite: number,
    endSite: number,
    extra: Partial<ShapeBlock> = {},
  ): ContentSlide {
    const current = slide();
    const a = current.slots.main![0]!;
    const b = current.slots.main![1]!;
    const start = siteAt(a, startSite)!;
    const end = siteAt(b, endSite)!;
    current.slots.main![2] = {
      id: 'link',
      type: 'shape',
      shape: 'elbow',
      stroke: 'ink',
      orientation: 'diagonal-down',
      connect: { start: { block: 'a', site: startSite }, end: { block: 'b', site: endSite } },
      pos: {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x) || 1,
        h: Math.abs(end.y - start.y) || 1,
        z: 1,
      },
      ...extra,
    };
    return current;
  }
  const byIdOf = (current: ContentSlide) =>
    new Map(current.slots.main!.map((block) => [block.id, block]));

  it('reads the angle a site faces, turned by the target\u2019s rotation and mirrored by its flip', () => {
    const a = slide().slots.main![0]!;
    /* a rectangle's eight sites: top, left, bottom, right, then the corners */
    expect([0, 1, 2, 3].map((site) => siteAngleAt(a, site))).toEqual([270, 180, 90, 0]);
    const turned = { ...a, pos: { ...a.pos!, rotate: 90 } };
    expect([0, 1, 2, 3].map((site) => siteAngleAt(turned, site))).toEqual([0, 270, 180, 90]);
    const mirrored = { ...a, pos: { ...a.pos!, flip: 'h' as const } };
    expect([1, 3].map((site) => siteAngleAt(mirrored, site))).toEqual([0, 180]);
    const upended = { ...a, pos: { ...a.pos!, flip: 'v' as const } };
    expect([0, 2].map((site) => siteAngleAt(upended, site))).toEqual([90, 270]);
    expect(siteAngleAt(a, 12)).toBeUndefined();
  });

  it('answers vertical from a bottom or top site, horizontal from a side, and nothing for a loose connector', () => {
    const vertical = elbowSlide(2, 0);
    expect(connectorAxis(connector(vertical).connect, byIdOf(vertical))).toBe('vertical');
    const horizontal = elbowSlide(3, 1);
    expect(connectorAxis(connector(horizontal).connect, byIdOf(horizontal))).toBe('horizontal');
    /* a pair on different axes is the L, named as the leaving axis then the arriving one: a's
       bottom site to b's left site leaves along y and arrives along x, a's right site to b's top
       site the other way round (the fix round) */
    const mixed = elbowSlide(2, 1);
    expect(connectorAxis(connector(mixed).connect, byIdOf(mixed))).toBe('vertical-horizontal');
    const acrossThenDown = elbowSlide(3, 0);
    expect(connectorAxis(connector(acrossThenDown).connect, byIdOf(acrossThenDown))).toBe(
      'horizontal-vertical',
    );
    const endOnly = elbowSlide(2, 0);
    expect(connectorAxis({ end: { block: 'b', site: 0 } }, byIdOf(endOnly))).toBe('vertical');
    expect(connectorAxis(undefined, byIdOf(endOnly))).toBeUndefined();
    expect(connectorAxis({ start: { block: 'gone', site: 0 } }, byIdOf(endOnly))).toBeUndefined();
  });

  it('writes the axis through followConnectors when the target turns, and through a reroute', () => {
    const current = elbowSlide(2, 0);
    /* a turned a quarter: its bottom site faces left while b's top site still faces up, so the
       elbow leaves horizontally and arrives vertically, the L (the verifier's item 27 of the polish
       round: the S arrived sideways at b's top site) */
    const turned = apply(current, [
      {
        op: 'block.set',
        slideId: 'wired',
        blockId: 'a',
        path: '/pos',
        value: { x: 100, y: 100, w: 200, h: 100, z: 0, rotate: 90 },
      },
    ]);
    const follow = followConnectors(turned, ['a']);
    expect(
      follow.some(
        (m) => m.op === 'block.set' && m.path === '/axis' && m.value === 'horizontal-vertical',
      ),
    ).toBe(true);
    const next = apply(turned, follow);
    expect(connector(next).axis).toBe('horizontal-vertical');
    /* rerouted onto b's left site from a's right site: horizontal; onto b's top from a's bottom: vertical */
    const byId = byIdOf(current);
    expect(
      attachConnector(connector(current), byId, {
        start: { block: 'a', site: 3 },
        end: { block: 'b', site: 1 },
      }).axis,
    ).toBe('horizontal');
    expect(attachConnector(connector(current), byId, { end: { block: 'b', site: 0 } }).axis).toBe(
      'vertical',
    );
    /* a straight line takes no axis */
    const line = slide();
    expect(
      attachConnector(connector(line), byIdOf(line), { end: { block: 'b', site: 0 } }).axis,
    ).toBeUndefined();
  });
});
