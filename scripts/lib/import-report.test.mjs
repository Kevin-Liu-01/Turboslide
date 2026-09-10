import { describe, expect, it } from 'vitest';

import { escapeSlideIds, isEscapeRow, rowsOf, slideIdOf } from './import-report.mjs';

describe('import-report reader', () => {
  it('finds rows at the top level, under slides and under rows', () => {
    expect(rowsOf([{ id: 'a' }])).toEqual([{ id: 'a' }]);
    expect(rowsOf({ slides: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(rowsOf({ rows: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(rowsOf({ nothing: 1 })).toEqual([]);
    expect(rowsOf(null)).toEqual([]);
  });

  it('reads the slide id from id or slideId', () => {
    expect(slideIdOf({ id: 'why' })).toBe('why');
    expect(slideIdOf({ slideId: 'why' })).toBe('why');
    expect(slideIdOf({})).toBeNull();
  });

  it('recognizes every accepted escape marker', () => {
    expect(isEscapeRow({ id: 'a', html: { reason: 'composite grid' } })).toBe(true);
    expect(isEscapeRow({ id: 'a', html: true })).toBe(true);
    expect(isEscapeRow({ id: 'a', html: 'two tables beside diagrams' })).toBe(true);
    expect(isEscapeRow({ id: 'a', htmlBlocks: 1 })).toBe(true);
    expect(isEscapeRow({ id: 'a', escape: true })).toBe(true);
    expect(isEscapeRow({ id: 'a', blocks: [{ type: 'heading' }, { type: 'html' }] })).toBe(true);
    expect(isEscapeRow({ id: 'a', blocks: ['heading', 'html'] })).toBe(true);
  });

  it('treats a clean row as not an escape', () => {
    expect(isEscapeRow({ id: 'a', html: null })).toBe(false);
    expect(isEscapeRow({ id: 'a', html: '' })).toBe(false);
    expect(isEscapeRow({ id: 'a', htmlBlocks: 0 })).toBe(false);
    expect(isEscapeRow({ id: 'a', blocks: [{ type: 'rows' }] })).toBe(false);
    expect(isEscapeRow({ id: 'a' })).toBe(false);
    expect(isEscapeRow(null)).toBe(false);
  });

  it('collects the escape slide ids of a report', () => {
    const report = {
      slides: [
        { n: 1, id: 'opener-brand', html: null },
        { n: 67, id: 'tools', html: { reason: 'composite figure grid' } },
        { n: 84, id: 'proof', htmlBlocks: 1 },
      ],
      htmlBlocks: 2,
    };
    expect([...escapeSlideIds(report)]).toEqual(['tools', 'proof']);
  });
});
