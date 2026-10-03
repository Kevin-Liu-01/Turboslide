// The deck index as the carrier of a person's facts across instances (b1.md R17; docs/archive/rounds/PEOPLE.md
// 3.13, 6.4; the fix round of the verifier's pass 1 finding 3, people.own-chip-follows-avatar):
// `indexFactsFor` keeps one row per principal for 5 s and the drop bus is process local, so a
// choice written on another instance reaches this one only when the row expires or a caller
// reads the store through `refreshIndexFacts`, which also fills the row for the reads that follow
// in the same request; `recordWithIndexFacts` is the one rule the room applies to its record.
// The index store is the file store under the checkout's state folder, as room.test.ts uses it;
// a write through `indexStore().update` skips the writer's cache drop, the way another instance's
// write reaches this one.
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { newPrincipalRecord } from '@turboslide/identity/principal';
import type { PrincipalRecord } from '@turboslide/identity/principal';
import { indexUpdates, principalFolder } from '@turboslide/store/access-store';

import {
  LINK_GRANT_TTL_MS,
  avatarChoiceFromIndex,
  displayNameFromIndex,
  dropLinkGrantCache,
  indexFactsFor,
  indexStore,
  recordWithIndexFacts,
  refreshIndexFacts,
} from './access';
import { stateDir } from './root';

const NOW = new Date('2026-09-29T12:00:00.000Z');

function anon(): string {
  return `anon_${randomUUID()}`;
}

describe('recordWithIndexFacts (docs/archive/rounds/PEOPLE.md 3.13; b1.md R17)', () => {
  const base = (): PrincipalRecord => newPrincipalRecord(anon(), NOW);

  it('answers the same record when the index carries nothing it applies', () => {
    const record = base();
    expect(recordWithIndexFacts(record, { grants: [] })).toBe(record);
    // the same choice again is no change either, so a caller can tell a change by identity
    const glyph = { ...record, avatar: { variant: 'glyph' as const, salt: 7 } };
    expect(recordWithIndexFacts(glyph, { grants: [], avatar: { variant: 'glyph', salt: 7 } })).toBe(
      glyph,
    );
  });

  it('takes the typed name when the record carries none and keeps the name it carries', () => {
    const record = base();
    expect(recordWithIndexFacts(record, { grants: [], name: 'Noor Haddad' })).toMatchObject({
      name: 'Noor Haddad',
      avatar: { variant: 'initials' },
    });
    const named = { ...record, name: 'Ada Lovelace' };
    expect(recordWithIndexFacts(named, { grants: [], name: 'Noor Haddad' })).toBe(named);
  });

  it('takes the non picture choice whenever the index carries one, unless the record holds a picture', () => {
    const record = base();
    const glyph = recordWithIndexFacts(record, {
      grants: [],
      avatar: { variant: 'glyph', salt: 3 },
    });
    expect(glyph.avatar).toEqual({ variant: 'glyph', salt: 3 });
    // a glyph on the record and initials on the index: the index wins (chosen later elsewhere)
    expect(
      recordWithIndexFacts(glyph, { grants: [], avatar: { variant: 'initials', initials: 'KL' } })
        .avatar,
    ).toEqual({ variant: 'initials', initials: 'KL' });
    // a picture on the record: the index never carries one and a stale glyph must not outlive it
    const picture: PrincipalRecord = {
      ...record,
      avatar: {
        variant: 'picture',
        picture: { avatarKey: 'k'.repeat(22), digest: 'd'.repeat(64), sizes: [32, 64] },
      },
    };
    expect(
      recordWithIndexFacts(picture, { grants: [], avatar: { variant: 'glyph', salt: 3 } }),
    ).toBe(picture);
    // the name and the choice together, the record's other fields kept
    const both = recordWithIndexFacts(record, {
      grants: [],
      name: 'Noor Haddad',
      avatar: { variant: 'dither', salt: 1 },
    });
    expect(both).toMatchObject({
      principalId: record.principalId,
      label: record.label,
      name: 'Noor Haddad',
      avatar: { variant: 'dither', salt: 1 },
      linkGrants: [],
    });
  });
});

describe('refreshIndexFacts (docs/archive/rounds/PEOPLE.md 6.4)', () => {
  it('reads the choice another instance wrote past this instance cache and fills the row for the reads that follow', async () => {
    const id = anon();
    const folder = join(stateDir(), 'users', principalFolder(id));
    try {
      // this instance read the row before the write: the cache holds no choice
      expect(await avatarChoiceFromIndex(id)).toBeUndefined();
      // another instance's write: the store moves, this instance's row does not
      await (await indexStore()).update(id, indexUpdates.avatar({ variant: 'glyph', salt: 7 }));
      await (await indexStore()).update(id, indexUpdates.name('Noor Haddad'));
      expect(await avatarChoiceFromIndex(id)).toBeUndefined();
      expect(await displayNameFromIndex(id)).toBeUndefined();
      // the cached row expires after the TTL on its own
      expect(await avatarChoiceFromIndex(id, Date.now() + LINK_GRANT_TTL_MS + 1)).toEqual({
        variant: 'glyph',
        salt: 7,
      });
      // a second write while the row is fresh again: the plain read keeps the row, the fresh
      // read takes the store and the reads after it take the filled row
      await (await indexStore()).update(id, indexUpdates.avatar({ variant: 'dither', salt: 2 }));
      expect(await avatarChoiceFromIndex(id)).toEqual({ variant: 'glyph', salt: 7 });
      const fresh = await refreshIndexFacts(id);
      expect(fresh).toMatchObject({ name: 'Noor Haddad', avatar: { variant: 'dither', salt: 2 } });
      expect(await avatarChoiceFromIndex(id)).toEqual({ variant: 'dither', salt: 2 });
      expect(await displayNameFromIndex(id)).toBe('Noor Haddad');
      // the option on the read itself is the same path
      await (await indexStore()).update(id, indexUpdates.avatar(null));
      expect((await indexFactsFor(id)).avatar).toEqual({ variant: 'dither', salt: 2 });
      expect((await indexFactsFor(id, Date.now(), { fresh: true })).avatar).toBeUndefined();
    } finally {
      dropLinkGrantCache(id);
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
