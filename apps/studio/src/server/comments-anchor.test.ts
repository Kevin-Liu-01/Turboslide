// Where a new comment lands (docs/FOCUS.md rank 19; audit-present row 35): the selection of a
// layout placeholder names a block id the slide does not carry (the title slide's heading is a
// slide field), and the comment anchors on the slide instead of being refused; an anchor whose
// slide is gone, or whose cell or range is not there, is refused with the anchor named.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import { validateDocument } from '@turboslide/schema/validate';

import { placeAnchorOn } from './comments';

function document(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

describe('placeAnchorOn', () => {
  it('keeps an anchor the document holds', () => {
    const doc = document();
    expect(placeAnchorOn(doc, { kind: 'slide', slideId: 'title' })).toEqual({
      ok: true,
      anchor: { kind: 'slide', slideId: 'title' },
    });
    expect(placeAnchorOn(doc, { kind: 'block', slideId: 'content-rule', blockId: 'list' })).toEqual(
      { ok: true, anchor: { kind: 'block', slideId: 'content-rule', blockId: 'list' } },
    );
    expect(placeAnchorOn(doc, { kind: 'deck' })).toEqual({ ok: true, anchor: { kind: 'deck' } });
  });

  it('anchors a comment on a title placeholder to its slide (the block id names no block there)', () => {
    const doc = document();
    expect(placeAnchorOn(doc, { kind: 'block', slideId: 'title', blockId: 'heading' })).toEqual({
      ok: true,
      anchor: { kind: 'slide', slideId: 'title' },
    });
    expect(
      placeAnchorOn(doc, {
        kind: 'text',
        slideId: 'thesis',
        blockId: 'big',
        path: '/text',
        range: [0, 5],
        quoted: 'Every',
      }),
    ).toEqual({ ok: true, anchor: { kind: 'slide', slideId: 'thesis' } });
  });

  it('refuses an anchor whose slide is gone, naming the slide', () => {
    const doc = document();
    const refused = placeAnchorOn(doc, { kind: 'block', slideId: 'gone', blockId: 'heading' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.message).toBe(
        'This comment could not be placed: the object it named is not on the slide (the block anchor names block "heading" on slide "gone"; slide removed)',
      );
    }
    const cell = placeAnchorOn(doc, {
      kind: 'cell',
      slideId: 'content-rule',
      blockId: 'list',
      cell: [0, 0],
    });
    expect(cell.ok).toBe(false);
    if (!cell.ok)
      expect(cell.message).toContain('cell 0,0 of block "list" on slide "content-rule"');
  });
});
