import { describe, expect, it } from 'vitest';

import { isPrincipalId } from '@turboslide/identity/ids';
import { standInKey, standInOf } from '@turboslide/identity/stand-in';
import type { AccessRecord } from '@turboslide/schema/access';
import { newDeckRecord } from '@turboslide/schema/access';
import type { Version } from '@turboslide/schema/mutations';

import { recordForReader, shapeRecordFor } from './access';
import { isStandIn, standInFor, standInsFor } from './stand-ins';
import { versionsWithStandIns, withStandIns } from './write';
import type { EditorDeck, EditorIdentity } from './write';

// Hardening HR-SD#1 (docs/hardening/HARDENING.md 4.4; DATA-V2): an answer to a reader without
// the share capability carries no other person's principal id, because a principal id names the
// person's deck index on the store and so the whole library behind one deck. The owner, the
// version authors and the lease holders become stand-ins, the people map is keyed by them, and
// the reader's own ids stay. A share holder's answers are unchanged.

const OWNER = 'anon_11111111-1111-4111-8111-111111111111';
const EDITOR = 'usr_editor01';
const VIEWER = 'anon_22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-08T00:00:00.000Z';
const DECK = 'q4-review';

function sharedRecord(): AccessRecord {
  return {
    ...newDeckRecord(DECK, OWNER, 'AbCdEfGhIjKlMnOpQrStUv', NOW),
    links: [
      {
        id: 'lnk_view01',
        hash: `sha256:${'a'.repeat(64)}`,
        role: 'viewer',
        createdAt: NOW,
        createdBy: OWNER,
        revokedAt: null,
        expiresAt: null,
      },
    ],
    publish: {
      hash: `sha256:${'b'.repeat(64)}`,
      publishedAt: NOW,
      publishedBy: OWNER,
      revokedAt: null,
    },
    pendingOwner: { principalId: EDITOR, email: null, askedAt: NOW, askedBy: OWNER },
    grants: [
      {
        principalId: EDITOR,
        email: null,
        role: 'editor',
        invitedBy: OWNER,
        invitedAt: NOW,
        acceptedAt: NOW,
        expiresAt: null,
      },
      {
        principalId: VIEWER,
        email: null,
        role: 'viewer',
        invitedBy: OWNER,
        invitedAt: NOW,
        acceptedAt: NOW,
        expiresAt: null,
      },
      {
        principalId: null,
        email: 'lee@example.test',
        role: 'commenter',
        invitedBy: EDITOR,
        invitedAt: NOW,
        acceptedAt: null,
        expiresAt: null,
      },
    ],
    requests: [
      {
        id: 'req_ask001',
        principalId: 'anon_33333333-3333-4333-8333-333333333333',
        email: 'sam@example.test',
        role: 'editor',
        askedAt: NOW,
        respondedAt: null,
      },
    ],
  };
}

/** Every principal id an answer carries, read from its JSON text. */
function principalIdsIn(value: unknown): string[] {
  const text = JSON.stringify(value);
  return [...text.matchAll(/(?:anon_|usr_|agent:)[A-Za-z0-9_-]+/g)].map((match) => match[0]);
}

describe('the stand-ins (stand-ins.ts)', () => {
  it('are stable for one person on one deck, differ between decks and people, and are no principal id', () => {
    const a = standInFor(DECK, OWNER);
    expect(a).toBe(standInFor(DECK, OWNER));
    expect(a).not.toBe(standInFor('other-deck', OWNER));
    expect(a).not.toBe(standInFor(DECK, EDITOR));
    expect(isStandIn(a)).toBe(true);
    expect(isPrincipalId(a)).toBe(false);
    expect(a).toMatch(/^ref_[A-Za-z0-9_-]{22}$/);
  });

  it("pass the reader's own ids and every string that is no principal id", () => {
    const people = standInsFor(DECK, [VIEWER, null]);
    expect(people(VIEWER)).toBe(VIEWER);
    expect(people(OWNER)).toBe(standInFor(DECK, OWNER));
    for (const word of ['seed', 'legacy', 'local:studio']) expect(people(word)).toBe(word);
    // an agent's id is a principal id as well (packages/identity ids.ts)
    expect(people('agent:tok_1')).toBe(standInFor(DECK, 'agent:tok_1'));
  });
});

describe('the record a reader without share reads (access.ts)', () => {
  it('names no other principal and keeps only the own grant, for the route and the loader', () => {
    const record = sharedRecord();
    const routed = shapeRecordFor(record, 'viewer', VIEWER);
    expect(routed.owner).toBe(standInFor(DECK, OWNER));
    expect(routed.grants).toEqual([{ ...record.grants[1], invitedBy: standInFor(DECK, OWNER) }]);
    expect(principalIdsIn(routed)).toEqual([VIEWER]);

    const loaded = recordForReader(record, new Set([VIEWER]), standInsFor(DECK, [VIEWER]));
    expect(loaded.owner).toBe(standInFor(DECK, OWNER));
    expect(loaded.createdBy).toBe(standInFor(DECK, OWNER));
    expect(loaded.pendingOwner).toBeNull();
    expect(loaded.links).toEqual([]);
    expect(loaded.requests).toEqual([]);
    expect(loaded.publish?.publishedBy).toBe(standInFor(DECK, OWNER));
    expect(loaded.grants.map((grant) => grant.principalId)).toEqual([VIEWER]);
    expect(principalIdsIn(loaded)).toEqual([VIEWER]);
  });

  it('answers the whole record to the owner and to an editor while editors may share', () => {
    const record = sharedRecord();
    expect(shapeRecordFor(record, 'owner', OWNER)).toBe(record);
    expect(shapeRecordFor(record, 'editor', EDITOR)).toBe(record);
    const closed = { ...record, settings: { ...record.settings, editorsCanShare: false } };
    const shaped = shapeRecordFor(closed, 'editor', EDITOR);
    expect(shaped.owner).toBe(standInFor(DECK, OWNER));
    expect(principalIdsIn(shaped)).toEqual([EDITOR]);
  });
});

describe("the stand-ins' key (verifier pass 2, F2)", () => {
  it("is the room secret's when it is set, so the Worker's deck room makes the same stand-in", () => {
    const before = {
      room: process.env.TURBOSLIDE_ROOM_SECRET,
      download: process.env.TURBOSLIDE_DOWNLOAD_SECRET,
    };
    try {
      process.env.TURBOSLIDE_DOWNLOAD_SECRET = 'a-download-secret-for-tests-only-0123456789';
      process.env.TURBOSLIDE_ROOM_SECRET = 'a-room-secret-for-tests-only-0123456789abcdef';
      // the Worker computes standInOf(standInKey(TURBOSLIDE_ROOM_SECRET), deck, principal)
      expect(standInFor(DECK, OWNER)).toBe(
        standInOf(standInKey('a-room-secret-for-tests-only-0123456789abcdef'), DECK, OWNER),
      );
      // without a room secret (a deployment with no do tier) the download secret keys them
      delete process.env.TURBOSLIDE_ROOM_SECRET;
      expect(standInFor(DECK, OWNER)).toBe(
        standInOf(standInKey('a-download-secret-for-tests-only-0123456789'), DECK, OWNER),
      );
    } finally {
      if (before.room === undefined) delete process.env.TURBOSLIDE_ROOM_SECRET;
      else process.env.TURBOSLIDE_ROOM_SECRET = before.room;
      if (before.download === undefined) delete process.env.TURBOSLIDE_DOWNLOAD_SECRET;
      else process.env.TURBOSLIDE_DOWNLOAD_SECRET = before.download;
    }
  });
});

describe("the editor loader's people for a reader without share (write.ts)", () => {
  const authored = (principalId: string, n: number): Version => ({
    n,
    revision: n,
    author: { kind: 'human', name: `Person ${n}`, principalId },
    note: `write ${n}`,
    createdAt: NOW,
    mutations: [],
  });
  const view = (principalId: string, name: string): EditorIdentity => ({
    principalId,
    label: name,
    name,
    trust: principalId.startsWith('usr_') ? 'verified' : 'label',
    kind: principalId.startsWith('usr_') ? 'account' : 'anonymous',
    ...(principalId.startsWith('usr_') ? { accountId: principalId } : {}),
  });

  it('carries stand-ins for the version authors, the lease holders, the owner and the people map', () => {
    const record = sharedRecord();
    const people = standInsFor(DECK, [VIEWER]);
    const payload = {
      deckId: DECK,
      versions: [authored(OWNER, 1), authored(EDITOR, 2), authored(VIEWER, 3)],
      leases: [
        {
          slideId: 'title',
          holder: { kind: 'human', name: 'Ed', principalId: EDITOR },
          until: NOW,
        },
      ],
      access: record,
    } as unknown as EditorDeck;
    const identities = {
      [OWNER]: view(OWNER, 'Olive'),
      [EDITOR]: view(EDITOR, 'Ed'),
      [VIEWER]: view(VIEWER, 'Vi'),
    };
    const answer = withStandIns(payload, identities, people, {
      readerRecord: recordForReader(record, new Set([VIEWER]), people),
    });
    expect(principalIdsIn(answer)).toEqual(expect.arrayContaining([VIEWER]));
    expect(new Set(principalIdsIn(answer))).toEqual(new Set([VIEWER]));
    const owner = answer.payload.access?.owner ?? '';
    expect(answer.identities[owner]?.name).toBe('Olive');
    expect(answer.identities[owner]?.principalId).toBe(owner);
    const editor = answer.payload.versions[1]?.author.principalId ?? '';
    expect(answer.identities[editor]?.name).toBe('Ed');
    expect(answer.identities[editor]).not.toHaveProperty('accountId');
    expect(answer.payload.leases[0]?.holder.principalId).toBe(editor);
    // the reader is still themself: the page tells "You" by the own id
    expect(answer.payload.versions[2]?.author.principalId).toBe(VIEWER);
    expect(answer.identities[VIEWER]?.name).toBe('Vi');
  });

  it('keys a comment author by the stand-in alone, as comment.list names it (verifier pass 2, F2)', () => {
    const people = standInsFor(DECK, [VIEWER]);
    const answer = withStandIns(
      { deckId: DECK, versions: [authored(EDITOR, 1)], leases: [] } as unknown as EditorDeck,
      { [EDITOR]: view(EDITOR, 'Ed') },
      people,
      { readerRecord: undefined },
    );
    expect(Object.keys(answer.identities)).toEqual([people(EDITOR)]);
    expect(principalIdsIn(answer)).toEqual([]);
  });

  it('maps the version list a reader without share reads', () => {
    const people = standInsFor(DECK, [VIEWER]);
    const mapped = versionsWithStandIns([authored(OWNER, 1), authored(VIEWER, 2)], people);
    expect(mapped.map((version) => version.author.principalId)).toEqual([
      standInFor(DECK, OWNER),
      VIEWER,
    ]);
    expect(mapped.map((version) => version.author.name)).toEqual(['Person 1', 'Person 2']);
  });
});
