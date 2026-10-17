import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_ACCESS_SETTINGS, ROLES, roleAllows } from '@turboslide/identity/access';
import { standInKey, standInOf } from '@turboslide/identity/stand-in';
import type { CommentOp } from '@turboslide/schema/comments';
import type { Mutation } from '@turboslide/schema/mutations';

import type { Entry, RoomEvent, RosterEntry } from './channel.ts';
import {
  BETWEEN_MAX_ENTRIES,
  betweenEntries,
  editingCount,
  filterEventForReader,
  landedOwn,
  overEditingCeiling,
  replayFloorFor,
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

  it('names every other principal by its stand-in to a reader who may not share (HR-SD#1; verifier pass 2, F2)', () => {
    const OWNER = 'usr_owner01';
    const READER = 'anon_22222222-2222-4222-8222-222222222222';
    const key = standInKey('a-room-secret-for-tests-only-0123456789');
    const deps = {
      rememberedEmail: () => 'olive@example.test',
      standIn: (deckId: string, principalId: string) => standInOf(key, deckId, principalId),
    };
    const ref = standInOf(key, 'q4-review', OWNER);
    const viewer: ViewerFacts = {
      role: 'viewer',
      via: 'link',
      showNames: true,
      readComments: true,
      principalId: READER,
      share: false,
      deckId: 'q4-review',
    };
    const sharer: ViewerFacts = { ...viewer, role: 'owner', via: 'owner', share: true };
    // a ticket an older app minted carries no `share`: ids pass as before
    const { share: _share, ...older } = viewer;
    const idsIn = (value: unknown) =>
      [...JSON.stringify(value).matchAll(/(?:anon_|usr_|agent:)[A-Za-z0-9_-]+/g)]
        .map((match) => match[0])
        .filter((id) => id !== READER);

    // a client id is a MAC the room minted and names nobody; the helper's names the principal
    const row: RosterEntry = { ...roster('owner', OWNER), clientId: 'c'.repeat(32) };
    expect(rosterEntryForReader(row, viewer, deps).principalId).toBe(ref);
    expect(rosterEntryForReader(roster('viewer', READER), viewer, deps).principalId).toBe(READER);
    expect(rosterEntryForReader(row, sharer, deps).principalId).toBe(OWNER);
    expect(rosterEntryForReader(row, older, deps).principalId).toBe(OWNER);

    const author = { kind: 'human' as const, name: 'Olive', principalId: OWNER };
    const typed: Mutation = {
      op: 'text.splice',
      slideId: 's1',
      blockId: 'b1',
      path: '/text',
      at: 0,
      remove: 0,
      insert: 'a',
    };
    const edit: Entry = { ...entry(1, [typed]), author };
    const add: CommentOp = {
      op: 'add',
      thread: {
        id: '01m3shbftjv64ww028yyhs386t',
        deckId: 'q4-review',
        anchor: { kind: 'slide', slideId: 'title' },
        comment: {
          id: '01m3shbftjv64ww028yyhs386t',
          author: { principalId: OWNER, label: 'Olive', kind: 'human' },
          createdAt: '2026-10-10T00:00:00.000Z',
          body: { text: 'For {@0}', mentions: [{ kind: 'principal', principalId: READER }] },
        },
        replies: [],
        assignee: {
          to: { kind: 'principal', principalId: READER },
          by: OWNER,
          at: '2026-10-10T00:00:00.000Z',
        },
        createdAt: '2026-10-10T00:00:00.000Z',
        updatedAt: '2026-10-10T00:00:00.000Z',
        revision: 1,
      },
    };
    const comment: Entry = { ...entry(2), kind: 'comment', author, comment: add };
    const events: RoomEvent[] = [
      { type: 'presence', clientId: row.clientId, clock: 1, state: row },
      { type: 'op', entry: edit },
      { type: 'op', entry: comment },
      { type: 'ops', entries: [edit, comment] },
      {
        type: 'checkpoint',
        revision: 2,
        fromSeq: 1,
        toSeq: 2,
        author,
        note: '',
      },
      { type: 'reject', opId: 'comment:1', reason: 'invalid', comment: add },
    ];
    for (const event of events) {
      const seen = filterEventForReader(event, viewer, deps);
      expect(seen, event.type).not.toBeNull();
      expect(idsIn(seen), event.type).toEqual([]);
      expect(JSON.stringify(seen), event.type).toContain(ref);
      expect(idsIn(filterEventForReader(event, sharer, deps)), event.type).toContain(OWNER);
      expect(idsIn(filterEventForReader(event, older, deps)), event.type).toContain(OWNER);
    }
  });

  it('puts a reader without history on its signed floor, else on the head (HR-SD#1e)', () => {
    const facts = (role: ViewerFacts['role'], floor?: number | null): ViewerFacts => ({
      role,
      via: 'link',
      showNames: false,
      readComments: true,
      ...(floor === undefined ? {} : { floor }),
    });
    // the signed position decides whatever the role
    expect(replayFloorFor(facts('viewer', 12), 40)).toBe(12);
    expect(replayFloorFor(facts('commenter', 0), 40)).toBe(0);
    expect(replayFloorFor(facts('viewer', null), 40)).toBeNull();
    // nothing signed (a ticket an older app minted): a role with history keeps no floor, every
    // other replays nothing below the head at the open
    expect(replayFloorFor(facts('owner'), 40)).toBeNull();
    expect(replayFloorFor(facts('editor'), 40)).toBeNull();
    expect(replayFloorFor(facts('commenter'), 40)).toBe(40);
    expect(replayFloorFor(facts('viewer'), 40)).toBe(40);
    // the role rule is the capability matrix's `history` cell, whatever the settings say: a
    // change to who holds history that this rule does not follow fails here
    for (const role of ROLES)
      for (const settings of [
        DEFAULT_ACCESS_SETTINGS,
        { ...DEFAULT_ACCESS_SETTINGS, editorsCanShare: false, viewersCanSeeComments: true },
      ])
        expect(replayFloorFor(facts(role), 40) === null, role).toBe(
          roleAllows(role, 'history', settings),
        );
  });

  it('counts the editing connections and the ceiling', () => {
    const rows = [roster('owner', 'a'), roster('editor', 'b'), roster('viewer', 'c')];
    expect(editingCount(rows)).toBe(2);
    expect(overEditingCeiling(rows, 'editor')).toBe(false);
    expect(overEditingCeiling(rows, 'viewer')).toBe(false);
  });
});
