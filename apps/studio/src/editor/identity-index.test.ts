import { describe, expect, it } from 'vitest';

import { labelFor } from '@turboslide/identity/labels';
import type { RosterEntry } from '@turboslide/realtime/channel';
import type { Thread } from '@turboslide/schema/comments';
import type { Author, Version } from '@turboslide/schema/mutations';

import type { EditorIdentity } from '../server/write';
import {
  identityIndex,
  identityOfPrincipal,
  identityView,
  participantOf,
  replaceRosterRow,
} from './identity-index';

// The people round's index (docs/PEOPLE.md 3.8, 3.9, 3.15, 3.16, 3.17; 6.5): the payload's
// resolved people under the roster and the caller, the label suffix in order of first appearance
// across the log, the comments and the roster, the hue slot moved to the chrome's base, the roster
// replaced in place. Pure functions over hand built records.

const A = 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';
const B = 'anon_1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';
const C = 'anon_2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';
const USR = 'usr_01JKEVINLIU';
const author: Author = { kind: 'human', name: 'studio' };

function entry(principalId: string, clientId: string, label: string, hueSlot: number): RosterEntry {
  return {
    clientId,
    clock: 1,
    pointerOn: false,
    presenting: false,
    principalId,
    label,
    trust: 'label',
    mark: { variant: 'initials', initials: label[0], hue: { slot: hueSlot + 1 } },
    hueSlot,
    kind: 'human',
    role: 'editor',
  };
}

function version(n: number, principalId: string, name: string): Version {
  return {
    n,
    revision: n,
    author: { kind: 'human', name, principalId },
    note: `write ${n}`,
    createdAt: new Date(Date.UTC(2026, 8, 29, 0, 0, n)).toISOString(),
    mutations: [],
  };
}

function thread(id: string, principalId: string, label: string): Thread {
  const stamp = '2026-09-29T10:00:00.000Z';
  const comment = {
    id: `${id}-c`,
    author: { principalId, label, kind: 'human' as const },
    body: 'A comment',
    mentions: [],
    createdAt: stamp,
    reactions: [],
  };
  return {
    id,
    anchor: { kind: 'deck' as const },
    comment,
    replies: [],
    resolved: false,
    createdAt: stamp,
    updatedAt: stamp,
  } as unknown as Thread;
}

describe('participantOf', () => {
  it('maps the wire slot 0 to the chrome hue 1 and carries the reader email', () => {
    const now = '2026-09-29T10:00:00.000Z';
    const first = participantOf(entry(A, 'c1', 'Titanium 471', 0), now);
    expect(first.hue).toBe(1);
    expect(first.email).toBeUndefined();
    const sixth = participantOf(entry(B, 'c2', 'Cobalt 512', 5), now);
    expect(sixth.hue).toBe(6);
    const agent = participantOf({ ...entry(C, 'c3', 'Agent', 2), kind: 'agent' }, now);
    expect(agent.hue).toBeUndefined();
    const withEmail = participantOf(
      { ...entry(USR, 'c4', 'Kevin Liu', 1), trust: 'verified', email: 'kevin@example.test' },
      now,
    );
    expect(withEmail).toMatchObject({
      hue: 2,
      email: 'kevin@example.test',
      kind: 'account',
      name: 'Kevin Liu',
    });
  });
});

describe('identityView', () => {
  it('carries the server mark, the address and the deleted flag', () => {
    const identity: EditorIdentity = {
      principalId: USR,
      label: labelFor(USR),
      name: 'Kevin Liu',
      trust: 'verified',
      kind: 'account',
      email: 'kevin@example.test',
      mark: { variant: 'glyph' } as unknown as EditorIdentity['mark'],
      avatar: { variant: 'glyph', salt: 3 },
    };
    const view = identityView(identity, author);
    expect(view).toMatchObject({
      principalId: USR,
      name: 'Kevin Liu',
      email: 'kevin@example.test',
    });
    expect(view.mark).toEqual({ variant: 'glyph' });
    expect(view).not.toHaveProperty('avatar');
    expect(view.deleted).toBeUndefined();
    expect(identityView({ ...identity, deleted: true }, author).deleted).toBe(true);
    expect(identityView(undefined, author)).toEqual({
      principalId: 'studio',
      label: 'studio',
      trust: 'guest',
      kind: 'anonymous',
    });
  });
});

describe('identityIndex', () => {
  it('reads the payload map first, the stored comment author only for an id the payload does not name', () => {
    const resolved: Record<string, EditorIdentity> = {
      [B]: { principalId: B, label: 'Cobalt 512', name: 'Maya', trust: 'guest', kind: 'anonymous' },
    };
    const names = identityIndex({
      roster: [],
      identity: undefined,
      author,
      threads: [thread('t1', B, 'Maya'), thread('t2', C, 'Linen 383')],
      resolved,
    });
    // the departed guest reads her name and the guest word from the payload, not the label snapshot
    expect(names.get(B)).toMatchObject({ name: 'Maya', trust: 'guest' });
    // an author the payload does not name keeps the stored label with the prefix's trust
    expect(names.get(C)).toEqual(identityOfPrincipal(C, 'Linen 383', 'human'));
    expect(names.get(C)?.trust).toBe('label');
    expect(identityOfPrincipal(USR).trust).toBe('verified');
    expect(identityOfPrincipal('agent:tok_1').trust).toBe('agent');
  });

  it('lets the roster row override the payload and the boot identity of the caller by id, the payload supplying what the row lacks', () => {
    const resolved: Record<string, EditorIdentity> = {
      [A]: { principalId: A, label: 'Titanium 471', trust: 'label', kind: 'anonymous' },
    };
    const roster = [{ ...entry(A, 'c1', 'Ada Lovelace', 0), trust: 'guest' as const }];
    /* the boot's reading of the caller, from before the name was typed in this session: the
       room's live row wins over it (the integrator's preview pictures read the version rows with
       the label's plate and no guest word while the boot identity overrode the row) */
    const me: EditorIdentity = {
      principalId: A,
      label: 'Titanium 471',
      trust: 'label',
      kind: 'anonymous',
      runId: 'run-7',
      mark: { variant: 'initials', initials: 'T', self: true } as unknown as EditorIdentity['mark'],
    };
    const names = identityIndex({ roster, identity: me, author, threads: [], resolved });
    const view = names.get(A);
    expect(view).toMatchObject({ name: 'Ada Lovelace', trust: 'guest', clientId: 'c1', hue: 1 });
    expect(view?.mark).toEqual(roster[0]!.mark);
    expect(view?.runId).toBe('run-7');
    /* with no room row yet, the boot identity stands on its own */
    const alone = identityIndex({ roster: [], identity: me, author, threads: [], resolved });
    expect(alone.get(A)?.mark).toEqual({ variant: 'initials', initials: 'T', self: true });
    expect(alone.get(A)?.trust).toBe('label');
  });

  it('tells two people of one text apart by first appearance across the log, the comments and the roster', () => {
    const label = 'Titanium 471';
    const resolved: Record<string, EditorIdentity> = {
      [A]: {
        principalId: A,
        label,
        trust: 'label',
        kind: 'anonymous',
        mark: { initials: 'T' } as never,
      },
      [B]: {
        principalId: B,
        label,
        trust: 'label',
        kind: 'anonymous',
        mark: { initials: 'T' } as never,
      },
      [C]: { principalId: C, label: 'Kevin', name: 'Kevin', trust: 'guest', kind: 'anonymous' },
      [USR]: {
        principalId: USR,
        label: 'Cobalt 512',
        name: 'Kevin',
        trust: 'verified',
        kind: 'account',
      },
    };
    const names = identityIndex({
      roster: [entry(A, 'c1', label, 0)],
      identity: undefined,
      author,
      threads: [thread('t1', C, 'Kevin')],
      resolved,
      // B wrote first, then A: the log is oldest first
      versions: [version(1, B, label), version(2, A, label), version(3, USR, 'Kevin')],
    });
    expect(names.get(B)?.label).toBe(label);
    expect(names.get(A)?.label).toBe(`${label} (2)`);
    // the plate's initial is the mark's and never changes
    expect(names.get(A)?.mark).toEqual({ variant: 'initials', initials: 'T', hue: { slot: 1 } });
    // a typed name and an account name collide too: the version author first, the commenter second
    expect(names.get(USR)?.name).toBe('Kevin');
    expect(names.get(C)?.name).toBe('Kevin (2)');
    expect(names.get(C)?.label).toBe('Kevin');
  });

  it('counts people, never ids: an aliased anonymous id and its account are one person', () => {
    const resolved: Record<string, EditorIdentity> = {
      [A]: {
        principalId: A,
        label: 'Silica 255',
        trust: 'verified',
        kind: 'anonymous',
        accountId: USR,
      },
      [USR]: { principalId: USR, label: 'Silica 255', trust: 'verified', kind: 'account' },
      [B]: { principalId: B, label: 'Silica 255', trust: 'label', kind: 'anonymous' },
    };
    const names = identityIndex({
      roster: [entry(USR, 'c1', 'Silica 255', 0)],
      identity: undefined,
      author,
      threads: [],
      resolved,
      versions: [
        version(1, A, 'Silica 255'),
        version(2, B, 'Silica 255'),
        version(3, USR, 'Silica 255'),
      ],
    });
    expect(names.get(A)?.label).toBe('Silica 255');
    expect(names.get(USR)?.label).toBe('Silica 255');
    expect(names.get(B)?.label).toBe('Silica 255 (2)');
    /* the account id stays on the aliased view (build/b5.md R9): the version panel reads a row
       by the reader's pre sign in id as the reader's own; a plain label carries none */
    expect(names.get(A)?.accountId).toBe(USR);
    expect(names.get(B)).not.toHaveProperty('accountId');
  });

  it('never stores the suffix: a fresh index reads the base text again', () => {
    const label = 'Titanium 471';
    const resolved: Record<string, EditorIdentity> = {
      [A]: { principalId: A, label, trust: 'label', kind: 'anonymous' },
    };
    const names = identityIndex({ roster: [], identity: undefined, author, threads: [], resolved });
    expect(names.get(A)?.label).toBe(label);
    expect(resolved[A]?.label).toBe(label);
  });
});

describe('replaceRosterRow', () => {
  it('replaces the updated client where it stands and appends a new one', () => {
    const roster = [entry(A, 'c1', 'A', 0), entry(B, 'c2', 'B', 1), entry(C, 'c3', 'C', 2)];
    const moved = { ...entry(B, 'c2', 'B', 1), slideId: 's2', clock: 9 };
    const next = replaceRosterRow(roster, moved);
    expect(next.map((row) => row.clientId)).toEqual(['c1', 'c2', 'c3']);
    expect(next[1]).toBe(moved);
    expect(next).not.toBe(roster);
    const joined = replaceRosterRow(next, entry(USR, 'c4', 'K', 3));
    expect(joined.map((row) => row.clientId)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });
});
