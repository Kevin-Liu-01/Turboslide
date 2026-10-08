// The access record a new deck gets (gslides-parity SPEC-3 6.1; VERIFICATION-3 finding 4; the
// product round's default, docs/archive/rounds/PRODUCT.md question 10): the studio writes it at creation (the
// draft's first save, deck.create, deck.copy) with the creator as owner and the deployment's
// default general access (Restricted, Viewer for the link, on every deployment since the polish
// round's item 78; before it Anyone with the link, Editor, with the general link minted, for an
// anonymous creator; restricted for a signed in account), keeps the creator's own record, and
// since security hotfix H3 (DATA-V3) refuses a caller with no identity, refuses an id another
// principal's record holds, writes the record before the deck, and gives a deck without a record
// the seed, creator or closed record (`missingRecordRule`).
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fileAccessStore, memoryAccessStore } from '@turboslide/store/access-store';
import { createDeck } from '@turboslide/store/templates';
import type { VersionRecord } from '@turboslide/store/store';

import {
  DeckIdTakenError,
  FRESH_ID_ATTEMPTS,
  HELD_LINK_READS,
  createWithFreshId,
  createWithRecord,
  creatorFromRecords,
  creatorOf,
  missingRecordRule,
  recordNewDeck,
  settleHeldLinks,
} from './access';
import type { MissingRecordDeps } from './access';
import type { AuthContext } from './authorize';
import {
  DeniedError,
  anonymousContext,
  bootstrapAgentContext,
  contextForIdentity,
} from './authorize';

const NOW = '2026-09-14T00:00:00.000Z';

describe('creatorOf', () => {
  it('names the session principal, else the agent owner, else nobody', () => {
    expect(creatorOf(contextForIdentity('anon_7e2f0000-0000-4000-8000-000000000000'))).toBe(
      'anon_7e2f0000-0000-4000-8000-000000000000',
    );
    expect(creatorOf(contextForIdentity('usr_01J'))).toBe('usr_01J');
    expect(creatorOf(bootstrapAgentContext('token'))).toBe('usr_admin');
    expect(creatorOf(bootstrapAgentContext('localhost'))).toBe('usr_checkout');
    expect(creatorOf(contextForIdentity('agent:k1'))).toBe('agent:k1');
    expect(creatorOf(anonymousContext())).toBeNull();
  });
});

describe('recordNewDeck', () => {
  it('writes a record owned by the creator at revision 0, Restricted with Viewer for the link, for an anonymous creator (docs/archive/rounds/POLISH.md item 78)', async () => {
    const store = memoryAccessStore();
    const ctx: AuthContext = contextForIdentity('anon_7e2f0000-0000-4000-8000-000000000000');
    const stored = await recordNewDeck('q4-review', ctx, { now: NOW, store });
    expect(stored).not.toBeNull();
    expect(stored?.record).toMatchObject({
      schemaVersion: 1,
      deckId: 'q4-review',
      owner: 'anon_7e2f0000-0000-4000-8000-000000000000',
      createdBy: 'anon_7e2f0000-0000-4000-8000-000000000000',
      createdAt: NOW,
      generalAccess: { mode: 'restricted', role: 'viewer' },
      grants: [],
      revision: 0,
    });
    // no link is minted with the record (item 78): Anyone with the link, picked in the dialog,
    // mints the first one; the answer carries no token
    expect(stored?.record.links).toEqual([]);
    expect(stored && 'general' in stored ? stored.general : undefined).toBeUndefined();
    expect(stored?.record.assetKey).toHaveLength(22);
    expect((await store.read('q4-review'))?.record).toEqual(stored?.record);
  });

  it("keeps the creator's own record (a retried first save) and answers it", async () => {
    const store = memoryAccessStore();
    const first = await recordNewDeck('q4-review', contextForIdentity('usr_first'), {
      now: NOW,
      store,
    });
    expect(first.written).toBe(true);
    const again = await recordNewDeck('q4-review', contextForIdentity('usr_first'), {
      now: '2026-09-14T00:01:00.000Z',
      store,
    });
    expect(again.written).toBe(false);
    expect(again.record.owner).toBe('usr_first');
    expect(again.etag).toBe(first.etag);
    expect(store.records.size).toBe(1);
  });

  it("refuses an id another principal's record holds, and keeps that record (H3)", async () => {
    const store = memoryAccessStore();
    await recordNewDeck('q4-review', contextForIdentity('usr_first'), { now: NOW, store });
    await expect(
      recordNewDeck('q4-review', contextForIdentity('usr_second'), { now: NOW, store }),
    ).rejects.toBeInstanceOf(DeckIdTakenError);
    expect((await store.read('q4-review'))?.record.owner).toBe('usr_first');
  });

  it('refuses a caller with no identity with 401 and writes nothing (H3)', async () => {
    const store = memoryAccessStore();
    const refused = recordNewDeck('q4-review', anonymousContext(), { now: NOW, store });
    await expect(refused).rejects.toBeInstanceOf(DeniedError);
    await expect(refused).rejects.toMatchObject({ status: 401 });
    expect(await store.read('q4-review')).toBeNull();
  });
});

describe('createWithRecord (H3, DATA-V3)', () => {
  const OWNER = contextForIdentity('anon_7e2f0000-0000-4000-8000-000000000000');

  function world(held: string[] = []) {
    const decks = new Set(held);
    const store = memoryAccessStore();
    return {
      decks,
      store,
      deps: { has: async (id: string) => decks.has(id), store: async () => store, now: NOW },
    };
  }

  it('writes the record before the deck, the creator its owner', async () => {
    const w = world();
    const order: string[] = [];
    const { made, recorded } = await createWithRecord(
      'q4-review',
      OWNER,
      async () => {
        order.push(`record ${(await w.store.read('q4-review')) !== null}`);
        w.decks.add('q4-review');
        return { deckId: 'q4-review' };
      },
      w.deps,
    );
    expect(order).toEqual(['record true']);
    expect(made).toEqual({ deckId: 'q4-review' });
    expect(recorded.record.owner).toBe(OWNER.principal!.id);
  });

  it('makes no deck when the record write fails', async () => {
    const w = world();
    let made = false;
    const failing = {
      ...w.deps,
      store: async () => ({
        write: async () => {
          throw new Error('Blob 503');
        },
        remove: async () => undefined,
      }),
    };
    await expect(
      createWithRecord(
        'q4-review',
        OWNER,
        async () => {
          made = true;
        },
        failing,
      ),
    ).rejects.toThrow('Blob 503');
    expect(made).toBe(false);
  });

  it('takes the record away again when the deck is not made', async () => {
    const w = world();
    await expect(
      createWithRecord(
        'q4-review',
        OWNER,
        async () => {
          throw new Error('ENOSPC');
        },
        w.deps,
      ),
    ).rejects.toThrow('ENOSPC');
    expect(await w.store.read('q4-review')).toBeNull();
  });

  it('keeps the record when a failed create left the deck in the store', async () => {
    const w = world();
    await expect(
      createWithRecord(
        'q4-review',
        OWNER,
        async () => {
          w.decks.add('q4-review');
          throw new Error('the upload of slides/3.json failed');
        },
        w.deps,
      ),
    ).rejects.toThrow('upload');
    expect((await w.store.read('q4-review'))?.record.owner).toBe(OWNER.principal!.id);
  });

  it("never writes a record over a deck the store holds (a legacy deck stays nobody's)", async () => {
    const w = world(['gt-brand']);
    await expect(
      createWithRecord('gt-brand', OWNER, async () => ({ deckId: 'gt-brand' }), w.deps),
    ).rejects.toBeInstanceOf(DeckIdTakenError);
    expect(await w.store.read('gt-brand')).toBeNull();
  });

  it("makes the deck on a file store, where the record lives in the deck's own folder", async () => {
    // the tmp and file stores keep `<id>/.turboslide/access.json`, so the record written first
    // makes the folder the deck is then created in (the first walk of H3 on a tmp server read
    // "exists already" here before templates.ts learned a record-only folder is free)
    const root = mkdtempSync(join(tmpdir(), 'turboslide-record-first-'));
    try {
      const decksDir = join(root, 'decks');
      const store = fileAccessStore(decksDir);
      const has = async (id: string) => existsSync(join(decksDir, id, 'deck.json'));
      const { made, recorded } = await createWithRecord(
        'untitled-20261008-aaaaaaaaaaaaaaaaaaaaaaaaaa',
        OWNER,
        async () =>
          createDeck(decksDir, {
            name: 'Untitled presentation',
            from: 'blank',
            id: 'untitled-20261008-aaaaaaaaaaaaaaaaaaaaaaaaaa',
          }),
        { has, store: async () => store, now: NOW },
      );
      expect(made.deckId).toBe('untitled-20261008-aaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect(recorded.written).toBe(true);
      expect((await store.read(made.deckId))?.record.owner).toBe(OWNER.principal!.id);
      expect(await has(made.deckId)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a caller with no identity before anything is written', async () => {
    const w = world();
    await expect(
      createWithRecord('q4-review', anonymousContext(), async () => ({}), w.deps),
    ).rejects.toMatchObject({ status: 401 });
    expect(w.store.records.size).toBe(0);
  });
});

describe('createWithFreshId (H3, DATA-V1)', () => {
  const OWNER = contextForIdentity('anon_7e2f0000-0000-4000-8000-000000000000');

  it('passes over an id the store holds for a fresh one, and never names the deck it passed', async () => {
    const decks = new Set(['taken-one']);
    const store = memoryAccessStore();
    const ids = ['taken-one', 'fresh-two'];
    const made: string[] = [];
    const out = await createWithFreshId(
      OWNER,
      async (deckId) => {
        made.push(deckId);
        decks.add(deckId);
        return { deckId };
      },
      {
        newId: () => ids.shift() ?? 'never',
        deps: { has: async (id) => decks.has(id), store: async () => store, now: NOW },
      },
    );
    expect(out.deckId).toBe('fresh-two');
    expect(made).toEqual(['fresh-two']);
    expect(store.records.has('taken-one')).toBe(false);
  });

  it('gives up after a few taken ids rather than looping', async () => {
    const store = memoryAccessStore();
    let asked = 0;
    await expect(
      createWithFreshId(OWNER, async () => ({}), {
        newId: () => {
          asked += 1;
          return 'always-taken';
        },
        deps: { has: async () => true, store: async () => store, now: NOW },
      }),
    ).rejects.toBeInstanceOf(DeckIdTakenError);
    expect(asked).toBe(FRESH_ID_ATTEMPTS);
  });
});

describe('missingRecordRule (H3, DATA-V3)', () => {
  function author(principalId: string | undefined, revision: number): VersionRecord {
    return {
      n: revision,
      revision,
      baseRevision: revision - 1,
      author: { kind: 'human', name: 'someone', ...(principalId ? { principalId } : {}) },
      note: '',
      createdAt: NOW,
      mutations: [],
      inverse: [],
    } as VersionRecord;
  }

  function deps(over: Partial<MissingRecordDeps> & { held?: string[] } = {}) {
    const store = memoryAccessStore();
    const held = new Set(over.held ?? []);
    const d: MissingRecordDeps = {
      kind: () => 'blob',
      isSeed: (id) => id === 'gt-brand',
      has: async (id) => held.has(id),
      records: async () => [],
      store: async () => store,
      checkoutMode: () => 'open',
      now: () => NOW,
      ...over,
    };
    return { d, store };
  }

  it('reads the seed deck as open to everyone as a viewer, owned by nobody, and writes nothing', async () => {
    const { d, store } = deps();
    const got = await missingRecordRule('gt-brand', d);
    expect(got?.rule).toBe('seed');
    expect(got?.record).toMatchObject({
      owner: null,
      generalAccess: { mode: 'open', role: 'viewer' },
    });
    expect(store.records.size).toBe(0);
  });

  it('answers null for a deck the store does not hold', async () => {
    const { d } = deps();
    expect(await missingRecordRule('does-not-exist', d)).toBeNull();
  });

  it('gives a deck whose first version names a person to that person, restricted, and writes it', async () => {
    const { d, store } = deps({
      held: ['q4-review'],
      records: async () => [
        author('usr_later', 2),
        author('anon_7e2f0000-0000-4000-8000-000000000000', 1),
      ],
    });
    const got = await missingRecordRule('q4-review', d);
    expect(got?.rule).toBe('creator');
    expect(got?.record).toMatchObject({
      owner: 'anon_7e2f0000-0000-4000-8000-000000000000',
      generalAccess: { mode: 'restricted' },
    });
    expect((await store.read('q4-review'))?.record.owner).toBe(
      'anon_7e2f0000-0000-4000-8000-000000000000',
    );
  });

  it('closes a deck nobody can be shown to have made, and writes it', async () => {
    for (const records of [[], [author(undefined, 1)], [author('agent:bootstrap', 1)]]) {
      const { d, store } = deps({ held: ['old-deck'], records: async () => records });
      const got = await missingRecordRule('old-deck', d);
      expect(got?.rule).toBe('closed');
      expect(got?.record).toMatchObject({
        owner: null,
        generalAccess: { mode: 'restricted' },
      });
      expect((await store.read('old-deck'))?.record.owner).toBeNull();
    }
  });

  it('reads closed and writes nothing when the versions cannot be read', async () => {
    const { d, store } = deps({
      held: ['q4-review'],
      records: async () => {
        throw new Error('Blob 429');
      },
    });
    expect((await missingRecordRule('q4-review', d))?.rule).toBe('closed');
    expect(store.records.size).toBe(0);
  });

  it('answers the record another request wrote first', async () => {
    const { d, store } = deps({ held: ['q4-review'], records: async () => [] });
    await recordNewDeck('q4-review', contextForIdentity('usr_first'), { now: NOW, store });
    expect((await missingRecordRule('q4-review', d))?.record.owner).toBe('usr_first');
  });

  it("keeps a checkout's folder holder rule on the file store", async () => {
    const open = deps({ kind: () => 'file', held: ['fixture'] });
    expect((await missingRecordRule('fixture', open.d))?.record.generalAccess).toEqual({
      mode: 'open',
      role: 'editor',
    });
    expect(await missingRecordRule('missing', open.d)).toBeNull();
    const closed = deps({ kind: () => 'file', held: ['fixture'], checkoutMode: () => 'notFound' });
    expect(await missingRecordRule('fixture', closed.d)).toBeNull();
  });

  it('names the creator from the oldest record only', () => {
    expect(creatorFromRecords([author('usr_b', 3), author('usr_a', 1)])).toBe('usr_a');
    expect(creatorFromRecords([])).toBeNull();
  });
});

describe('settleHeldLinks', () => {
  const grant = { linkId: 'lnk_edit01', deckId: 'q4-review', role: 'editor' as const };
  const withLinks = (ids: string[]) => ({ links: ids.map((id) => ({ id })) }) as never;

  it('reads past the cache until the record lists the link', async () => {
    const fresh = [withLinks([]), withLinks(['lnk_edit01'])];
    let freshReads = 0;
    await settleHeldLinks([grant], {
      read: async () => withLinks([]),
      readFresh: async () => fresh[freshReads++] ?? null,
      sleep: async () => undefined,
    });
    expect(freshReads).toBe(2);
  });

  it('reads nothing more when the cached record lists the link', async () => {
    let freshReads = 0;
    await settleHeldLinks([grant], {
      read: async () => withLinks(['lnk_edit01']),
      readFresh: async () => {
        freshReads += 1;
        return null;
      },
    });
    expect(freshReads).toBe(0);
  });

  it('stops after three fresh reads of a record that never lists it (a revoked link)', async () => {
    let freshReads = 0;
    await settleHeldLinks([grant], {
      read: async () => null,
      readFresh: async () => {
        freshReads += 1;
        return withLinks(['lnk_other']);
      },
      sleep: async () => undefined,
    });
    expect(freshReads).toBe(HELD_LINK_READS);
  });
});
