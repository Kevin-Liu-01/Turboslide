// The pure half of Accept (docs/PRODUCT.md 6.1, 6.2): the re base, the marks and the clearing of
// a mark by the seller's next edit, shared by the page's commit and the server's write.
import { describe, expect, it } from 'vitest';

import type { AssistCard } from '@turboslide/schema/actions';
import { assistMark } from '@turboslide/schema/ext';
import { workedDocument } from '@turboslide/schema/fixtures';
import { applyMutations } from '@turboslide/schema/reduce';

import {
  ASSIST_STALE_SENTENCE,
  assistTargets,
  planAcceptedCard,
  withAssistClear,
} from './assist-accept';

const NOW = new Date('2026-09-19T20:00:00.000Z');

function card(document: ReturnType<typeof workedDocument>): AssistCard {
  const rule = document.slides['content-rule'];
  const target =
    rule === undefined ? undefined : assistTargets(rule).find((t) => t.key === 'p1|/text');
  if (target === undefined) throw new Error('no target');
  return {
    id: 'card-test',
    intent: 'shorter',
    sentence: 'Slide 5: the text is 12 words shorter',
    rows: [
      {
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        before: target.text,
        after: 'Every post states what was built.',
      },
    ],
    mutations: [target.write('Every post states what was built.')],
    deckId: document.deck.id,
    baseRevision: document.deck.revision,
    expiresAt: '2026-09-19T20:10:00.000Z',
    signature: '0'.repeat(64),
  };
}

describe('planAcceptedCard', () => {
  it('writes the row and the mark as one list, under the assistant’s author', () => {
    const document = workedDocument();
    const plan = planAcceptedCard(document, card(document), { now: NOW, runId: 'run-1' });
    expect(plan.mutations).toHaveLength(2);
    expect(plan.mutations[1]).toMatchObject({ op: 'block.set', blockId: 'p1', path: '/ext' });
    expect(plan.author).toMatchObject({ kind: 'agent', name: 'Assistant', runId: 'run-1' });
    const { document: after } = applyMutations(document, plan.mutations);
    const rule = after.slides['content-rule'];
    const p1 = rule?.kind === 'content' ? rule.slots.left?.[1] : undefined;
    expect(p1?.type === 'paragraph' ? p1.text : '').toBe('Every post states what was built.');
    expect(p1 !== undefined && assistMark(p1.ext)).toEqual({
      at: NOW.toISOString(),
      runId: 'run-1',
      card: 'card-test',
    });
  });

  it('re bases a card when the revision moved and the text stands, and drops it when the text moved', () => {
    const document = workedDocument();
    const made = card(document);
    const moved = workedDocument();
    moved.deck.revision += 4;
    expect(planAcceptedCard(moved, made, { now: NOW }).mutations).toHaveLength(2);
    const rule = moved.slides['content-rule'];
    const p1 = rule?.kind === 'content' ? rule.slots.left?.[1] : undefined;
    if (p1?.type === 'paragraph') p1.text = 'The seller typed something else';
    expect(() => planAcceptedCard(moved, made, { now: NOW })).toThrow(ASSIST_STALE_SENTENCE);
    expect(() => planAcceptedCard(document, { ...made, rows: [] }, { now: NOW })).toThrow(
      ASSIST_STALE_SENTENCE,
    );
    expect(() => planAcceptedCard(document, { nope: true }, { now: NOW })).toThrow(TypeError);
  });
});

describe('withAssistClear', () => {
  it('clears the mark of a block the seller edits, once, and leaves an /ext write alone', () => {
    const document = workedDocument();
    const { document: marked } = applyMutations(
      document,
      planAcceptedCard(document, card(document), { now: NOW }).mutations,
    );
    const edit = withAssistClear(marked, [
      {
        op: 'text.replace',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        range: [0, 5],
        text: 'Each',
      },
      { op: 'block.set', slideId: 'content-rule', blockId: 'p1', path: '/measure', value: 40 },
    ]);
    expect(edit).toHaveLength(3);
    expect(edit[2]).toEqual({
      op: 'block.set',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/ext',
    });
    const { document: after } = applyMutations(marked, edit);
    const rule = after.slides['content-rule'];
    const p1 = rule?.kind === 'content' ? rule.slots.left?.[1] : undefined;
    expect(p1 !== undefined && assistMark(p1.ext)).toBeUndefined();
    /* another block, no mark: nothing appended; the accept's own /ext write: nothing appended */
    expect(
      withAssistClear(marked, [
        { op: 'block.set', slideId: 'content-rule', blockId: 'h', path: '/text', value: 'x' },
      ]),
    ).toHaveLength(1);
    expect(
      withAssistClear(marked, [
        { op: 'block.set', slideId: 'content-rule', blockId: 'p1', path: '/ext', value: {} },
      ]),
    ).toHaveLength(1);
  });
});
