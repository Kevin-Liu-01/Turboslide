import { describe, expect, it } from 'vitest';

import type { Thread } from '@turboslide/schema/comments';

import { foldListedThreads, withAnsweredThread } from './comments-fold';

function thread(id: string, revision: number, resolved = false): Thread {
  const at = '2026-10-01T00:00:00.000Z';
  return {
    id,
    deckId: 'deck',
    anchor: { kind: 'slide', slideId: 'title' },
    comment: {
      id,
      author: { principalId: 'anon_a', label: 'A', kind: 'human' },
      createdAt: at,
      body: { text: 'A thread.', mentions: [] },
    },
    replies: [],
    ...(resolved ? { resolved: { at, by: 'anon_a' } } : {}),
    createdAt: at,
    updatedAt: at,
    revision,
  };
}

describe('withAnsweredThread (a comment action answered)', () => {
  it('replaces the older copy with the answered thread', () => {
    const out = withAnsweredThread([thread('t1', 4), thread('t2', 3)], thread('t1', 5, true));
    expect(out.map((row) => [row.id, row.revision, row.resolved !== undefined])).toEqual([
      ['t1', 5, true],
      ['t2', 3, false],
    ]);
  });

  it('adds a thread the tab did not hold and keeps a newer copy over an older answer', () => {
    expect(withAnsweredThread([], thread('t1', 1)).map((row) => row.id)).toEqual(['t1']);
    const kept = withAnsweredThread([thread('t1', 6, true)], thread('t1', 5));
    expect(kept[0]?.revision).toBe(6);
    expect(kept[0]?.resolved).toBeDefined();
  });
});

describe('foldListedThreads (a comment.list answered)', () => {
  it('keeps the tab’s resolved copy when the listed copy is below it, and reports the answer behind', () => {
    const fold = foldListedThreads([thread('t1', 5, true), thread('t2', 3)], {
      threads: [thread('t1', 4), thread('t2', 3)],
      commentsRevision: 4,
    });
    expect(fold.behind).toBe(true);
    expect(fold.revision).toBe(5);
    expect(fold.threads.find((row) => row.id === 't1')?.resolved).toBeDefined();
    expect(fold.threads.find((row) => row.id === 't1')?.revision).toBe(5);
  });

  it('takes the answer as it is when it is at or past the tab, and lets a thread below the answer leave', () => {
    const fold = foldListedThreads([thread('t1', 4), thread('t3', 2)], {
      threads: [thread('t1', 5, true), thread('t2', 6)],
      commentsRevision: 6,
    });
    expect(fold.behind).toBe(false);
    expect(fold.revision).toBe(6);
    expect(fold.threads.map((row) => row.id)).toEqual(['t1', 't2']);
    expect(fold.threads[0]?.resolved).toBeDefined();
  });

  it('keeps a thread the answer lacks while the tab holds it above the answer’s revision (an instance that has not read it)', () => {
    const fold = foldListedThreads([thread('t1', 3), thread('t9', 7)], {
      threads: [thread('t1', 3)],
      commentsRevision: 6,
    });
    expect(fold.behind).toBe(true);
    expect(fold.threads.map((row) => row.id)).toEqual(['t1', 't9']);
    expect(fold.revision).toBe(7);
  });
});
