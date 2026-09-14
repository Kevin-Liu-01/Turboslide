import { describe, expect, it } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import {
  anchorAtSelection,
  bodyPlain,
  bodySegments,
  canvasOrder,
  draftBody,
  filterThreads,
  isEmailToken,
  markerPlace,
  mentionCandidates,
  mentionQuery,
  mentionToken,
  openCounts,
  shortTime,
  sortThreads,
  stepThread,
} from '../comments/comments-model';
import { markerGroups } from '../comments/CommentMarkers';
import type { CommentThreadView, IdentityView } from '../editor-shell';
import { inboxSentence, sortInbox } from '../inbox/inbox-model';

// The comment rules (gslides-parity SPEC-3 5.3, 5.4; research 08 sections 4, 9): the anchor a
// card takes from the selection, the panel's two orders and its filters, the canvas order the
// chords walk, the body's text and mention segments, the reply box's tokens into the stored form
// and the autocomplete, the marker groups and the count per slide, the inbox sentences.

const doc = workedDocument();
const [s1, s2] = doc.deck.sections.flatMap((section) => section.slideIds) as [string, string];

const maya: IdentityView = {
  principalId: 'anon_m',
  label: 'Titanium 471',
  name: 'Maya',
  trust: 'guest',
  kind: 'anonymous',
};
const kai: IdentityView = {
  principalId: 'usr_k',
  label: 'Cobalt 212',
  name: 'Kai Ito',
  trust: 'verified',
  kind: 'account',
  email: 'kai@example.test',
};

function thread(id: string, over: Partial<CommentThreadView> = {}): CommentThreadView {
  return {
    id,
    anchor: { kind: 'block', slideId: s1, blockId: 'b1' },
    comment: {
      id: `${id}-c`,
      author: maya,
      createdAt: '2026-09-13T10:00:00Z',
      text: `Look at {@0}`,
      mentions: [kai],
    },
    replies: [],
    createdAt: '2026-09-13T10:00:00Z',
    updatedAt: '2026-09-13T10:00:00Z',
    ...over,
  };
}

describe('the anchor at the selection (5.3)', () => {
  it('takes the block, the text range, the cell, else the slide', () => {
    expect(anchorAtSelection(s1, null)).toEqual({ kind: 'slide', slideId: s1 });
    expect(anchorAtSelection(s1, { blockId: 'b' })).toEqual({
      kind: 'block',
      slideId: s1,
      blockId: 'b',
    });
    expect(anchorAtSelection(s1, { blockId: 'b', text: true, range: [7, 3] }, 'quoted')).toEqual({
      kind: 'text',
      slideId: s1,
      blockId: 'b',
      path: '/text',
      range: [3, 7],
      quote: 'quoted',
    });
    expect(anchorAtSelection(s1, { blockId: 't', cell: { row: 1, column: 2 } })).toEqual({
      kind: 'cell',
      slideId: s1,
      blockId: 't',
      cell: { row: 1, column: 2 },
    });
    /* a collapsed range is a block anchor */
    expect(anchorAtSelection(s1, { blockId: 'b', text: true, range: [4, 4] }).kind).toBe('block');
  });
});

describe('the panel order and filters (08 9)', () => {
  const open1 = thread('t1', { updatedAt: '2026-09-13T10:00:00Z' });
  const open2 = thread('t2', {
    updatedAt: '2026-09-13T11:00:00Z',
    anchor: { kind: 'block', slideId: s2, blockId: 'x' },
  });
  const done = thread('t3', { resolved: true, updatedAt: '2026-09-13T12:00:00Z' });
  it('lists open threads by last activity newest first and resolved after them', () => {
    expect(sortThreads([open1, done, open2], 'activity', doc).map((t) => t.id)).toEqual([
      't2',
      't1',
      't3',
    ]);
  });
  it('sorts open threads by slide in Slide order', () => {
    expect(sortThreads([open2, open1, done], 'slide', doc).map((t) => t.id)).toEqual([
      't1',
      't2',
      't3',
    ]);
    expect(canvasOrder([open2, done, open1], doc).map((t) => t.id)).toEqual(['t1', 't2']);
  });
  it('filters by state, search and For you', () => {
    expect(filterThreads([open1, done], { filter: 'open' }).map((t) => t.id)).toEqual(['t1']);
    expect(filterThreads([open1, done], { filter: 'resolved' }).map((t) => t.id)).toEqual(['t3']);
    expect(filterThreads([open1], { search: 'kai' })).toHaveLength(1);
    expect(filterThreads([open1], { search: 'nothing here' })).toHaveLength(0);
    expect(filterThreads([open1], { forMe: true, me: kai.principalId })).toHaveLength(1);
    expect(filterThreads([open1], { forMe: true, me: 'anon_other' })).toHaveLength(0);
    expect(
      filterThreads([{ ...open1, assignee: { ...maya, principalId: 'anon_other' } }], {
        forMe: true,
        me: 'anon_other',
      }),
    ).toHaveLength(1);
  });
  it('steps to the next and previous thread, wrapping', () => {
    const order = canvasOrder([open1, open2], doc);
    expect(stepThread(order, null, 1)?.id).toBe('t1');
    expect(stepThread(order, 't1', 1)?.id).toBe('t2');
    expect(stepThread(order, 't2', 1)?.id).toBe('t1');
    expect(stepThread(order, 't1', -1)?.id).toBe('t2');
    expect(stepThread([], null, 1)).toBeNull();
  });
  it('counts open threads per slide and groups markers per block', () => {
    const counts = openCounts([open1, open2, done, thread('t4')]);
    expect(counts.get(s1)).toBe(2);
    expect(counts.get(s2)).toBe(1);
    const groups = markerGroups([open1, thread('t4'), open2, done], s1);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.threads.map((t) => t.id)).toEqual(['t1', 't4']);
    const orphan = thread('t5', {
      anchor: { kind: 'block', slideId: s1, blockId: 'gone', orphaned: true },
    });
    expect(markerGroups([orphan], s1)[0]!.key).toBe('slide');
  });
  it('places the marker outside the anchored box and at the slide corner without one', () => {
    expect(
      markerPlace({ kind: 'block', slideId: s1, blockId: 'b' }, { b: [100, 200, 50, 40] }, 20, 0.5),
    ).toEqual({ left: 77, top: 78 });
    expect(markerPlace({ kind: 'slide', slideId: s1 }, {}, 20, 0.5)).toEqual({ left: 4, top: 4 });
  });
});

describe('bodies and mentions (5.1, 5.4)', () => {
  it('splits a body into text and mention segments and never emits markup', () => {
    const segments = bodySegments({ text: 'Look at {@0} and {@1} {@9}', mentions: [kai, maya] });
    expect(segments.map((s) => s.kind)).toEqual([
      'text',
      'mention',
      'text',
      'mention',
      'text',
      'text',
    ]);
    expect(bodyPlain({ text: 'Look at {@0}', mentions: [kai] })).toBe('Look at @Kai Ito');
  });
  it('turns the field tokens into {@n} and the ids, in token order, dropping edited away tokens', () => {
    const drafts = [
      { token: '@Kai Ito', principalId: kai.principalId, identity: kai },
      { token: '@Maya', principalId: maya.principalId, identity: maya },
    ];
    expect(draftBody('Hey @Kai Ito and @Maya, see @Kai Ito', drafts)).toEqual({
      text: 'Hey {@0} and {@1}, see {@0}',
      mentions: [kai.principalId, maya.principalId],
    });
    expect(draftBody('Plain words { braces }', [])).toEqual({ text: 'Plain words {  braces  }' });
    expect(draftBody('Only @Maya', drafts)).toEqual({
      text: 'Only {@0}',
      mentions: [maya.principalId],
    });
  });
  it('finds the @ query under the caret and the candidates that start with it', () => {
    expect(mentionQuery('Hello @ka', 9)).toEqual({ start: 6, query: 'ka' });
    expect(mentionQuery('Hello @ka x', 11)).toBeNull();
    expect(mentionQuery('mail@host', 9)).toBeNull();
    expect(mentionCandidates([kai, maya], 'ka').map((c) => c.principalId)).toEqual([
      kai.principalId,
    ]);
    expect(mentionCandidates([kai, maya], 'ito').map((c) => c.principalId)).toEqual([
      kai.principalId,
    ]);
    expect(mentionCandidates([kai, maya], '')).toHaveLength(2);
    expect(mentionToken(kai)).toBe('@Kai Ito');
    expect(isEmailToken('a@b.co')).toBe(true);
    expect(isEmailToken('maya')).toBe(false);
  });
  it('prints tabular short times', () => {
    const now = new Date('2026-09-13T12:00:00Z').getTime();
    expect(shortTime('2026-09-13T11:59:30Z', now)).toBe('now');
    expect(shortTime('2026-09-13T11:57:00Z', now)).toBe('3m');
    expect(shortTime('2026-09-13T09:00:00Z', now)).toBe('3h');
    expect(shortTime('2026-09-11T12:00:00Z', now)).toBe('2d');
  });
});

describe('the inbox sentences (5.5)', () => {
  it('words each kind with the actors and the slide, newest first', () => {
    const base = {
      deckId: doc.deck.id,
      count: 1,
      createdAt: '2026-09-13T10:00:00Z',
      updatedAt: '2026-09-13T10:00:00Z',
      actors: [maya],
    } as const;
    expect(inboxSentence({ ...base, id: '1', kind: 'reply', slideId: s2 }, doc)).toBe(
      'Maya replied on slide 2',
    );
    expect(
      inboxSentence({ ...base, id: '2', kind: 'mention', slideId: s1, actors: [maya, kai] }, doc),
    ).toBe('Maya and Kai Ito mentioned you on slide 1');
    expect(inboxSentence({ ...base, id: '3', kind: 'accessRequest', actors: [kai] }, doc)).toBe(
      'Kai Ito asked for access',
    );
    expect(
      inboxSentence({ ...base, id: '4', kind: 'granted', actors: [kai, maya, kai] }, doc),
    ).toBe('Kai Ito and 2 others gave you access');
    const sorted = sortInbox([
      { ...base, id: 'old', kind: 'reply' },
      { ...base, id: 'new', kind: 'reply', updatedAt: '2026-09-13T11:00:00Z' },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['new', 'old']);
  });
});
