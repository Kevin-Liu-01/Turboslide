import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Mutation } from '@turboslide/schema/mutations';

import type { Entry, RosterEntry } from './channel.ts';
import {
  BETWEEN_MAX_ENTRIES,
  betweenEntries,
  editingCount,
  filterEventForReader,
  landedOwn,
  overEditingCeiling,
  rosterEntryForReader,
  yieldConcurrentConversion,
} from './room-core.ts';
import type { ViewerFacts } from './room-core.ts';

// The pure admission's own rows (docs/CLOUDFLARE.md 3.3, 3.6.1; the integrator's seam commit of
// the realtime round). The behaviour rows of the transform, the placement and the refusal live in
// apps/studio (blob-admission.test.ts, concurrent-conversion.test.ts, reanchor.test.ts,
// refusal-issue.test.ts, room.test.ts) through room.ts's re-exports; this file pins what the
// Worker relies on: the module imports no node: module, the reader projection takes its host's
// memory as an argument, and the bounds hold.

const here = dirname(fileURLToPath(import.meta.url));

function entry(seq: number, mutations: Mutation[] = []): Entry {
  return {
    seq,
    rev: seq,
    kind: 'edit',
    clientId: `c${seq}`,
    opId: `op${seq}`,
    author: { kind: 'human', name: 'Someone' },
    mutations,
    at: '2026-10-01T00:00:00.000Z',
  } as Entry;
}

function roster(role: RosterEntry['role'], principalId = 'anon_1'): RosterEntry {
  return {
    clientId: `tab-${principalId}-${role}`,
    clock: 1,
    principalId,
    label: 'Someone',
    trust: 'verified',
    mark: {},
    hueSlot: 0,
    kind: 'human',
    role,
  } as RosterEntry;
}

describe('room-core', () => {
  it('imports no node: module, so the Worker can bundle it', () => {
    const source = readFileSync(join(here, 'room-core.ts'), 'utf8');
    const imports = source.split('\n').filter((line) => /^import\b/.test(line));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((line) => /from 'node:/.test(line))).toEqual([]);
    expect(imports.filter((line) => /ioredis/.test(line))).toEqual([]);
  });

  it('bounds the answer between a base and the admitted seq', () => {
    const entries = Array.from({ length: BETWEEN_MAX_ENTRIES + 2 }, (_, i) => entry(i + 1));
    expect(betweenEntries(entries, 3, 6)?.map((row) => row.seq)).toEqual([4, 5]);
    expect(betweenEntries(entries, 5, 6)).toBeUndefined();
    expect(betweenEntries(entries, 0, BETWEEN_MAX_ENTRIES + 2)).toBeUndefined();
  });

  it('yields the later conversion of a slide another conversion replaced when the entry also types on it', () => {
    const slide = { id: 's1' } as unknown as Extract<Mutation, { op: 'slide.replace' }>['slide'];
    const replace: Mutation = { op: 'slide.replace', slideId: 's1', slide };
    const splice: Mutation = {
      op: 'text.splice',
      slideId: 's1',
      blockId: 'b1',
      path: '/text',
      at: 0,
      remove: 0,
      insert: 'a',
    };
    expect(yieldConcurrentConversion([replace, splice], landedOwn([replace]))).toEqual([splice]);
    expect(yieldConcurrentConversion([replace], landedOwn([replace]))).toEqual([replace]);
    expect(yieldConcurrentConversion([replace, splice], [])).toEqual([replace, splice]);
  });

  it('reads the verified address from the host it is given and from nowhere else', () => {
    const owner: ViewerFacts = {
      role: 'owner',
      via: 'owner',
      showNames: false,
      readComments: true,
    };
    const link: ViewerFacts = { role: 'editor', via: 'link', showNames: false, readComments: true };
    const row = roster('editor');
    expect(rosterEntryForReader(row, owner).email).toBeUndefined();
    expect(
      rosterEntryForReader(row, owner, { rememberedEmail: () => 'maya@example.com' }).email,
    ).toBe('maya@example.com');
    const byLink = rosterEntryForReader(row, link, {
      rememberedEmail: () => 'maya@example.com',
    });
    expect(byLink.email).toBeUndefined();
    expect(byLink.label).toBe('An editor');
    expect(byLink.trust).toBe('label');
    const presence = filterEventForReader(
      { type: 'presence', clientId: row.clientId, clock: 1, state: row },
      owner,
      { rememberedEmail: () => 'maya@example.com' },
    );
    expect(presence?.type === 'presence' ? presence.state.email : undefined).toBe(
      'maya@example.com',
    );
  });

  it('counts the editing connections and the ceiling', () => {
    const rows = [roster('owner', 'a'), roster('editor', 'b'), roster('viewer', 'c')];
    expect(editingCount(rows)).toBe(2);
    expect(overEditingCeiling(rows, 'editor')).toBe(false);
    expect(overEditingCeiling(rows, 'viewer')).toBe(false);
  });
});
