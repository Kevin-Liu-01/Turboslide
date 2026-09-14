// The access record a new deck gets (gslides-parity SPEC-3 6.1; VERIFICATION-3 finding 4): the
// studio writes it at creation (the draft's first save, deck.create, deck.copy) with the creator
// as owner and general access restricted, keeps a record that exists, and writes none for a
// caller with no identity.
import { describe, expect, it } from 'vitest';

import { memoryAccessStore } from '@turboslide/store/access-store';

import { creatorOf, recordNewDeck } from './access';
import type { AuthContext } from './authorize';
import { anonymousContext, bootstrapAgentContext, contextForIdentity } from './authorize';

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
  it('writes a restricted record owned by the creator at revision 0', async () => {
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
      links: [],
      grants: [],
      revision: 0,
    });
    expect(stored?.record.assetKey).toHaveLength(22);
    expect((await store.read('q4-review'))?.record).toEqual(stored?.record);
  });

  it('keeps a record that exists already and answers it', async () => {
    const store = memoryAccessStore();
    const first = await recordNewDeck('q4-review', contextForIdentity('usr_first'), {
      now: NOW,
      store,
    });
    const again = await recordNewDeck('q4-review', contextForIdentity('usr_second'), {
      now: '2026-09-14T00:01:00.000Z',
      store,
    });
    expect(again?.record.owner).toBe('usr_first');
    expect(again?.etag).toBe(first?.etag);
    expect(store.records.size).toBe(1);
  });

  it('writes nothing for a caller with no identity', async () => {
    const store = memoryAccessStore();
    expect(await recordNewDeck('q4-review', anonymousContext(), { now: NOW, store })).toBeNull();
    expect(await store.read('q4-review')).toBeNull();
  });
});
