import { describe, expect, it } from 'vitest';

import { canonical, slidesApart } from './share.mjs';

describe('the restore rows read the deck as a document, not as a string', () => {
  it('reads two slides whose keys come in another order as one', () => {
    /* the tab's own edit kept the order it was written in; the room's normalized copy after a
       restore and its undo carries the schema's (walk A of R3 fix round 3) */
    const tab = { id: 's', blocks: [{ typography: { weight: 700, size: 32 }, autofit: 'grow' }] };
    const room = { blocks: [{ autofit: 'grow', typography: { size: 32, weight: 700 } }], id: 's' };
    expect(JSON.stringify(tab)).not.toBe(JSON.stringify(room));
    expect(canonical(tab)).toBe(canonical(room));
  });

  it('keeps the order of arrays and tells a changed value apart', () => {
    expect(canonical({ ids: ['a', 'b'] })).not.toBe(canonical({ ids: ['b', 'a'] }));
    expect(canonical({ pos: { w: 475 } })).not.toBe(canonical({ pos: { w: 280 } }));
  });

  it('names the slides that differ and the ones only one read has', () => {
    const before = { ids: ['a', 'b', 'c'], slides: { a: '1', b: '2', c: '3' } };
    const after = { ids: ['a', 'b', 'd'], slides: { a: '1', b: '9', d: '4' } };
    expect(slidesApart(before, after)).toEqual(['b', 'c', 'd']);
  });
});
