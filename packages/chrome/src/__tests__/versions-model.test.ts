import { describe, expect, it } from 'vitest';

import type { Version } from '@turboslide/schema/mutations';

import type { IdentityView } from '../editor-shell';
import { PANELS } from '../menus/strings';
import { textEditsOf } from '../ShowChanges';
import {
  diffBlocksOnSlide,
  groupVersions,
  hatchAngle,
  identityOfAuthor,
  isLegacyAuthor,
  namedCap,
  previousOf,
} from '../versions-model';

// Version history by author (gslides-parity SPEC-3 0.45, 5.7; research 08 6.1): the day and the
// 15 minute windows, named records alone, up to four marks per window, attribution per principal
// with the round one `studio` author as Earlier edits, the 40 named cap, the diff's blocks per
// slide and the hatch angles.

const NOW = new Date('2026-09-13T12:00:00Z');

function version(
  n: number,
  minutesAgo: number,
  author: Version['author'],
  note = '',
  changes = 1,
): Version {
  return {
    n,
    revision: n,
    author,
    note,
    createdAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    mutations: Array.from({ length: changes }, () => ({
      op: 'slide.set',
      slideId: 's',
      path: '/x',
      value: 1,
    })) as Version['mutations'],
  };
}

const maya: IdentityView = {
  principalId: 'anon_m',
  label: 'Titanium 471',
  name: 'Maya',
  trust: 'guest',
  kind: 'anonymous',
};
const identities = { anon_m: maya };

describe('groupVersions', () => {
  it('groups records within 15 minutes into one window with the distinct authors and the change count', () => {
    const versions = [
      version(1, 40, { kind: 'human', name: 'Titanium 471', principalId: 'anon_m' }, '', 2),
      version(2, 30, { kind: 'human', name: 'Kai', principalId: 'anon_k' }, '', 3),
      version(3, 5, { kind: 'human', name: 'Titanium 471', principalId: 'anon_m' }, '', 1),
    ];
    const days = groupVersions(versions, identities, false, NOW);
    expect(days).toHaveLength(1);
    expect(days[0]!.day).toBe('Today');
    const windows = days[0]!.windows;
    /* newest first: the 5 minute record alone (25 minutes from the next), then a window of two */
    expect(windows.map((w) => w.versions.map((v) => v.n))).toEqual([[3], [2, 1]]);
    expect(windows[1]!.changes).toBe(5);
    expect(windows[1]!.authors.map((a) => a.name ?? a.label)).toEqual(['Kai', 'Maya']);
  });

  it('keeps a named record alone and filters to named only', () => {
    const versions = [
      version(1, 12, { kind: 'human', name: 'x', principalId: 'anon_m' }),
      version(2, 10, { kind: 'human', name: 'x', principalId: 'anon_m' }, 'Sent to Acme'),
      version(3, 8, { kind: 'human', name: 'x', principalId: 'anon_m' }),
    ];
    const windows = groupVersions(versions, identities, false, NOW)[0]!.windows;
    expect(windows.map((w) => ({ named: w.named, n: w.versions.map((v) => v.n) }))).toEqual([
      { named: false, n: [3] },
      { named: true, n: [2] },
      { named: false, n: [1] },
    ]);
    expect(groupVersions(versions, identities, true, NOW)[0]!.windows).toHaveLength(1);
  });

  it('attributes per principal and collapses the round one studio author into Earlier edits', () => {
    expect(
      identityOfAuthor({ kind: 'human', name: 'Titanium 471', principalId: 'anon_m' }, identities),
    ).toBe(maya);
    const legacy = identityOfAuthor({ kind: 'human', name: 'studio' }, identities);
    expect(isLegacyAuthor(legacy)).toBe(true);
    expect(legacy.label).toBe(PANELS.versionHistory.earlierEdits);
    const typed = identityOfAuthor({ kind: 'human', name: 'Kevin' }, identities);
    expect(typed.trust).toBe('guest');
    expect(typed.name).toBe('Kevin');
    const agent = identityOfAuthor({ kind: 'agent', name: 'ci', runId: 'run-9' }, identities);
    expect(agent.trust).toBe('agent');
    expect(agent.runId).toBe('run-9');
  });

  it('knows the 40 named cap and the record before a version', () => {
    const many = Array.from({ length: 41 }, (_, i) =>
      version(i + 1, 100 - i, { kind: 'human', name: 'x' }, `v${i}`),
    );
    expect(namedCap(many)).toEqual({ count: 41, oldest: 'v0', full: true });
    expect(namedCap(many.slice(0, 3)).full).toBe(false);
    expect(previousOf(many, many[2]!)?.n).toBe(2);
    expect(previousOf(many, many[0]!)).toBeNull();
  });
});

describe('Show changes (0.44)', () => {
  it('lists the touched blocks of one slide per author and hatches at four angles then a field', () => {
    const diff = {
      from: 3,
      to: 4,
      byAuthor: [
        {
          author: { kind: 'human' as const, name: 'a' },
          blocks: [
            { slideId: 's', blockId: 'h', ops: ['block.set'] },
            { slideId: 'other', blockId: 'q', ops: ['block.set'] },
          ],
        },
        {
          author: { kind: 'human' as const, name: 'b' },
          blocks: [{ slideId: 's', blockId: 'p', ops: ['block.remove'] }],
        },
      ],
    };
    expect(diffBlocksOnSlide(diff, 's').map((b) => `${b.index}:${b.blockId}`)).toEqual([
      '0:h',
      '1:p',
    ]);
    expect([0, 1, 2, 3, 4].map(hatchAngle)).toEqual([45, 135, 0, 90, 'bayer']);
    expect(
      textEditsOf(
        [
          {
            op: 'text.splice',
            slideId: 's',
            blockId: 'h',
            path: '/text',
            at: 0,
            remove: 0,
            insert: 'x',
          },
          {
            op: 'text.splice',
            slideId: 's',
            blockId: 'h',
            path: '/text',
            at: 0,
            remove: 2,
            insert: '',
          },
          {
            op: 'text.replace',
            slideId: 'other',
            blockId: 'h',
            path: '/text',
            range: [0, 1],
            text: 'y',
          } as never,
        ],
        's',
      ),
    ).toEqual([
      { key: 'h/text', kind: 'insert' },
      { key: 'h/text', kind: 'delete' },
    ]);
  });
});
