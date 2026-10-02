// The follow's end rules and the agent banner's gate (docs/REALTIME.md 2 rows
// realtime.follow.for-everyone and realtime.agent.write-announced; 3.3; audit-people.md 1.5 and
// defect 7): the six Google triggers as the controller reads them, and the entries the banner
// admits under the realtime round's author shape (a bearer's write with `kind: 'agent'`, the
// token's label and the run id, under the room's `agent:<principalId>` client id or the blob
// tier's `store`).
import { describe, expect, it } from 'vitest';

import type { Entry } from '@turboslide/realtime/channel';

import {
  FOLLOW_ENDING_COMMENT_ACTIONS,
  agentEntriesOf,
  endsFollowOnAction,
  endsFollowOnPanel,
  endsFollowOnSlide,
  endsFollowOnView,
} from './follow-rules';

const B = 'b'.repeat(32);

describe('the follow ends on the follower’s own move', () => {
  it('keeps the follow on the followed person\u2019s slide and ends it on any other slide', () => {
    expect(endsFollowOnSlide({ following: B, followedSlide: 's3', slideId: 's3' })).toBe(false);
    expect(endsFollowOnSlide({ following: B, followedSlide: 's3', slideId: 's1' })).toBe(true);
    /* the followed person has no slide open: any own move ends it */
    expect(endsFollowOnSlide({ following: B, followedSlide: null, slideId: 's2' })).toBe(true);
  });

  it('ends nothing while nobody is followed', () => {
    expect(endsFollowOnSlide({ following: null, followedSlide: null, slideId: 's2' })).toBe(false);
    expect(endsFollowOnSlide({ following: null, followedSlide: 's3', slideId: 's1' })).toBe(false);
  });
});

describe('the follow ends on a comment write, the show and Version history', () => {
  it('names every comment write and no read', () => {
    for (const action of [
      'comment.add',
      'comment.reply',
      'comment.edit',
      'comment.delete',
      'comment.resolve',
      'comment.reopen',
      'comment.assign',
      'comment.done',
      'comment.react',
    ]) {
      expect(endsFollowOnAction(action), action).toBe(true);
      expect(FOLLOW_ENDING_COMMENT_ACTIONS.has(action)).toBe(true);
    }
    for (const action of [
      'comment.list',
      'comment.get',
      'comment.link',
      'notification.markRead',
      'notification.list',
      'sync.status',
      'presence.follow',
    ]) {
      expect(endsFollowOnAction(action), action).toBe(false);
    }
  });

  it('ends when the show starts and not when it ends or stays', () => {
    expect(endsFollowOnView({ present: false }, { present: true })).toBe(true);
    expect(endsFollowOnView({ present: true }, { present: false })).toBe(false);
    expect(endsFollowOnView({ present: true }, { present: true })).toBe(false);
    expect(endsFollowOnView({ present: false }, { present: false })).toBe(false);
  });

  it('ends when Version history opens and not while it stays open, closes or another panel opens', () => {
    expect(endsFollowOnPanel(null, 'versionHistory')).toBe(true);
    expect(endsFollowOnPanel('comments', 'versionHistory')).toBe(true);
    expect(endsFollowOnPanel(undefined, 'versionHistory')).toBe(true);
    expect(endsFollowOnPanel('versionHistory', 'versionHistory')).toBe(false);
    expect(endsFollowOnPanel('versionHistory', null)).toBe(false);
    expect(endsFollowOnPanel(null, 'comments')).toBe(false);
    expect(endsFollowOnPanel(null, null)).toBe(false);
  });
});

function entry(over: Partial<Entry> & Pick<Entry, 'clientId' | 'author'>): Entry {
  return {
    seq: 7,
    rev: 6,
    kind: 'edit',
    opId: `${over.clientId}:1`,
    at: '2026-10-01T12:00:00.000Z',
    mutations: [
      {
        op: 'block.set',
        slideId: 'title',
        blockId: 'heading',
        path: '/text',
        value: 'Agent wrote',
      },
    ],
    ...over,
  } as Entry;
}

const OWN = 'a'.repeat(32);
const EARLIER = 'c'.repeat(32);

describe('the agent banner’s gate', () => {
  it('admits a bearer’s write under the realtime round’s author on the room tiers and the blob tier', () => {
    const bearer = entry({
      clientId: 'agent:agent:key_12',
      author: { kind: 'agent', name: 'cli', runId: 'ci-42', principalId: 'agent:key_12' },
    });
    const blob = entry({
      clientId: 'store',
      author: { kind: 'agent', name: 'cli', principalId: 'agent:key_12' },
    });
    const out = agentEntriesOf([bearer, blob], {
      clientId: OWN,
      earlierIds: [EARLIER],
      assistNotes: new Set(),
    });
    expect(out).toEqual([bearer, blob]);
  });

  it('skips a human author, the tab’s own ids and an entry without mutations', () => {
    const human = entry({ clientId: 'store', author: { kind: 'human', name: 'Titanium 7' } });
    const own = entry({
      clientId: OWN,
      author: { kind: 'agent', name: 'Assistant', runId: 'assist-1' },
    });
    const earlier = entry({
      clientId: EARLIER,
      author: { kind: 'agent', name: 'Assistant', runId: 'assist-1' },
    });
    const empty = entry({
      clientId: 'agent:agent:key_12',
      author: { kind: 'agent', name: 'cli' },
      mutations: [],
    });
    const comment = entry({
      clientId: 'agent:agent:key_12',
      author: { kind: 'agent', name: 'cli' },
      kind: 'comment',
    });
    delete (comment as { mutations?: unknown }).mutations;
    expect(
      agentEntriesOf([human, own, earlier, empty, comment], {
        clientId: OWN,
        earlierIds: [EARLIER],
        assistNotes: new Set(),
      }),
    ).toEqual([]);
  });

  it('consumes the note of the tab’s own assist accept once', () => {
    const accepted = entry({
      clientId: 'agent:agent:assist',
      author: { kind: 'agent', name: 'Assistant', runId: 'assist-9' },
      note: 'Assist: shorter',
    });
    const notes = new Set(['Assist: shorter']);
    expect(
      agentEntriesOf([accepted], { clientId: OWN, earlierIds: [], assistNotes: notes }),
    ).toEqual([]);
    expect(notes.size).toBe(0);
    /* the same note again is another tab's accept and is announced */
    expect(
      agentEntriesOf([accepted], { clientId: OWN, earlierIds: [], assistNotes: notes }),
    ).toEqual([accepted]);
  });
});
