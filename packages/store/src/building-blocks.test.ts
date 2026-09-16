// The committed building blocks and their index (gslides-parity SPEC-5 0.25, 4.5; MILESTONES-5
// B3 day 7): about thirty records in nine categories, every one inside the 1326 by 642 box under
// one group tag, the index equal to the files, and the placement scaling with the page.
import { join } from 'node:path';

import {
  BUILDING_BLOCK_BOX,
  BUILDING_BLOCK_CATEGORIES,
  placeBuildingBlock,
} from '@turboslide/schema/building-blocks';
import type { Position } from '@turboslide/schema/position';
import { describe, expect, it } from 'vitest';

import {
  buildBuildingBlockIndex,
  listBuildingBlocks,
  readBuildingBlock,
  readBuildingBlockIndex,
} from './building-blocks.ts';

const decksDir = join(import.meta.dirname, '..', '..', '..', 'decks');

describe('the committed building blocks (SPEC-5 0.25)', () => {
  const blocks = listBuildingBlocks(decksDir);

  it('holds about thirty records across the nine categories, each inside the box under one tag', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(27);
    const categories = new Set(blocks.map((block) => block.category));
    for (const category of BUILDING_BLOCK_CATEGORIES) expect(categories.has(category)).toBe(true);
    for (const block of blocks) {
      expect(block.id.startsWith(`${block.category}/`)).toBe(true);
      const ids = new Set<string>();
      for (const member of block.blocks) {
        expect(ids.has(member.id)).toBe(false);
        ids.add(member.id);
        const pos = member.pos as Position;
        expect(pos.group).toBe('block');
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.x + pos.w).toBeLessThanOrEqual(BUILDING_BLOCK_BOX[0] + 0.5);
        expect(pos.y + pos.h).toBeLessThanOrEqual(BUILDING_BLOCK_BOX[1] + 0.5);
      }
      expect(block.box[0]).toBeLessThanOrEqual(BUILDING_BLOCK_BOX[0]);
      expect(block.box[1]).toBeLessThanOrEqual(BUILDING_BLOCK_BOX[1]);
    }
  });

  it('the index equals the files and filters by category', () => {
    expect(readBuildingBlockIndex(decksDir)).toEqual(buildBuildingBlockIndex(decksDir));
    const quotes = readBuildingBlockIndex(decksDir, 'quotes');
    expect(quotes.length).toBeGreaterThanOrEqual(3);
    expect(quotes.every((row) => row.category === 'quotes')).toBe(true);
    expect(listBuildingBlocks(decksDir, 'agendas').map((b) => b.id)).toContain(
      'agendas/five-items',
    );
  });

  it('reads one record by id and refuses a path that is not an id', () => {
    const record = readBuildingBlock(decksDir, 'agendas/five-items');
    expect(record.label).toBe('Five item agenda');
    expect(() => readBuildingBlock(decksDir, '../deck')).toThrow(TypeError);
    expect(() => readBuildingBlock(decksDir, 'agendas/none')).toThrow(RangeError);
  });

  it('places a record at the content box on the GT sheet at scale one, and scaled on a narrower page', () => {
    const record = readBuildingBlock(decksDir, 'key-statistics/three-numbers');
    const sheet = placeBuildingBlock(record, {
      page: { width: 1600, height: 900 },
      takenIds: new Set(['one-value']),
      takenGroups: new Set(['three-numbers']),
    });
    expect(sheet.scale).toBe(1);
    expect(sheet.group).toBe('three-numbers-2');
    const first = sheet.blocks[0]!;
    expect(first.id).toBe('one-value-2');
    expect(first.pos).toMatchObject({ x: 137, y: 129, z: 0, group: 'three-numbers-2' });
    const narrow = placeBuildingBlock(record, {
      page: { width: 1200, height: 675 },
      at: [100, 100],
      z: 5,
    });
    expect(narrow.scale).toBeLessThan(1);
    expect(narrow.blocks[0]!.pos).toMatchObject({ x: 100, y: 100, z: 5 });
    const source = record.blocks[1]!.pos as Position;
    const placed = narrow.blocks[1]!.pos as Position;
    expect(placed.w).toBeCloseTo(source.w * narrow.scale, 1);
    expect(placed.z).toBe(6);
  });
});
