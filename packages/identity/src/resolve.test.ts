import { describe, expect, test } from 'vitest';

import { labelFor } from './labels.ts';
import { newPrincipalRecord } from './principal.ts';
import type { AccountProfile, ResolveLookup } from './resolve.ts';
import {
  DELETED_ACCOUNT,
  TRUST_WORDS,
  displayWithTrust,
  resolvePrincipal,
  sanitizeRunId,
  toIdentityView,
  trustTooltip,
} from './resolve.ts';

const ANON = 'anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const ANON2 = 'anon_1f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const KEVIN: AccountProfile = {
  userId: '01JKEVIN',
  name: 'Kevin Liu',
  email: 'kevin@example.com',
  emailVerified: true,
  admin: true,
};

function lookup(overrides: Partial<ResolveLookup> = {}): ResolveLookup {
  return {
    record: () => null,
    alias: () => null,
    account: () => null,
    ...overrides,
  };
}

describe('resolvePrincipal', () => {
  test('an anonymous id without a record is its label', () => {
    const r = resolvePrincipal(ANON, lookup());
    expect(r).toMatchObject({
      principalId: ANON,
      kind: 'anonymous',
      displayName: labelFor(ANON),
      label: labelFor(ANON),
      trust: 'label',
      deleted: false,
      admin: false,
    });
    expect(r.email).toBeUndefined();
    expect(displayWithTrust(r)).toBe(labelFor(ANON));
    expect(trustTooltip(r.trust)).toBe('Not signed in. A generated label for this browser.');
  });

  test('a typed name makes a guest', () => {
    const record = newPrincipalRecord(ANON);
    record.name = 'Maya Chen';
    record.avatar = { variant: 'glyph', salt: 3 };
    const r = resolvePrincipal(ANON, lookup({ record: (id) => (id === ANON ? record : null) }));
    expect(r).toMatchObject({
      displayName: 'Maya Chen',
      trust: 'guest',
      avatar: { variant: 'glyph', salt: 3 },
    });
    expect(displayWithTrust(r)).toBe('Maya Chen · guest');
    expect(trustTooltip('guest')).toBe('Not signed in. This name was typed, not verified.');
  });

  test('an aliased anonymous id renders as the account with the check badge', () => {
    const record = newPrincipalRecord(ANON);
    record.name = 'Titanium Kevin';
    const r = resolvePrincipal(
      ANON,
      lookup({
        record: () => record,
        alias: (id) => (id === ANON ? 'usr_01JKEVIN' : null),
        account: (userId) => (userId === '01JKEVIN' ? KEVIN : null),
      }),
    );
    expect(r).toMatchObject({
      kind: 'anonymous',
      displayName: 'Kevin Liu',
      trust: 'verified',
      email: 'kevin@example.com',
      accountId: '01JKEVIN',
      admin: true,
      // the account's own label, so one account is one word on every id that renders as it
      // (docs/PEOPLE.md 3.18)
      label: labelFor('usr_01JKEVIN'),
    });
    expect(trustTooltip(r.trust, r.email)).toBe('Signed in as kevin@example.com');
    // An alias to a missing account falls back to the record.
    const dangling = resolvePrincipal(
      ANON,
      lookup({ record: () => record, alias: () => 'usr_gone' }),
    );
    expect(dangling).toMatchObject({ displayName: 'Titanium Kevin', trust: 'guest' });
  });

  test('an account id renders its profile, and a missing or deleted one as Deleted account', () => {
    const r = resolvePrincipal('usr_01JKEVIN', lookup({ account: () => KEVIN }));
    expect(r).toMatchObject({
      kind: 'account',
      displayName: 'Kevin Liu',
      trust: 'verified',
      deleted: false,
    });
    const gone = resolvePrincipal('usr_01JGONE', lookup());
    expect(gone).toMatchObject({
      kind: 'account',
      displayName: DELETED_ACCOUNT,
      deleted: true,
      trust: 'verified',
    });
    expect(gone.email).toBeUndefined();
    const deleted = resolvePrincipal(
      'usr_01JKEVIN',
      lookup({ account: () => ({ ...KEVIN, deleted: true }) }),
    );
    expect(deleted).toMatchObject({ displayName: DELETED_ACCOUNT, deleted: true, admin: false });
    expect(deleted.email).toBeUndefined();
    const blankName = resolvePrincipal(
      'usr_01JKEVIN',
      lookup({ account: () => ({ ...KEVIN, name: '  ' }) }),
    );
    // the label, never the address (docs/PEOPLE.md 3.18; AUDIT.md defect 21)
    expect(blankName.displayName).toBe(labelFor('usr_01JKEVIN'));
    expect(blankName.email).toBe('kevin@example.com');
  });

  test('an agent renders the token name and a sanitized run id, never a header name', () => {
    const r = resolvePrincipal(
      'agent:key_7',
      lookup({ token: () => ({ tokenId: 'key_7', ownerId: 'usr_x', name: 'Deck bot' }) }),
      {
        agent: { name: 'Deck bot', runId: 'Kevin Liu' },
      },
    );
    expect(r).toMatchObject({
      kind: 'agent',
      displayName: 'Deck bot',
      trust: 'agent',
      label: 'Agent',
      accountId: 'usr_x',
    });
    expect(r.runId).toBeUndefined();
    expect(displayWithTrust(r)).toBe('Agent · Deck bot');
    const withRun = resolvePrincipal('agent:key_7', lookup(), {
      agent: { name: 'Deck bot', runId: 'judge-loop.12' },
    });
    expect(withRun.runId).toBe('judge-loop.12');
    expect(displayWithTrust(withRun)).toBe('Agent · judge-loop.12');
    expect(resolvePrincipal('agent:key_9', lookup()).displayName).toBe('Agent');
    expect(sanitizeRunId('a'.repeat(33))).toBeUndefined();
    expect(sanitizeRunId('run_1.2-3')).toBe('run_1.2-3');
    expect(sanitizeRunId(undefined)).toBeUndefined();
    expect(trustTooltip('agent')).toBe('An agent run. Its writes are checkpointed at once.');
  });

  test('a round one author name that is not an id reads as an untrusted guest', () => {
    const r = resolvePrincipal('studio', lookup());
    expect(r).toMatchObject({ kind: 'anonymous', displayName: 'studio', trust: 'guest' });
    expect(resolvePrincipal(ANON2, lookup()).label).not.toBe(
      resolvePrincipal(ANON, lookup()).label,
    );
  });
});

// The people round (docs/PEOPLE.md 3.7, 3.18, 4.4; 6.5): the account without a typed name, the
// picture URL on the resolved identity, the word beside the badge, the deleted flag on the view.
describe('the people round', () => {
  const USR = `usr_${KEVIN.userId}`;
  const DIGEST = 'b'.repeat(64);
  const PICTURE = {
    variant: 'picture' as const,
    picture: {
      avatarKey: 'AbCdEfGhIjKlMnOpQrStUv',
      digest: DIGEST,
      sizes: [32, 64, 128, 256],
      base: 'https://store.example.test/u/AbCdEfGhIjKlMnOpQrStUv',
    },
  };

  test('an account without a typed name resolves to its label, never its address', () => {
    const r = resolvePrincipal(USR, lookup({ account: () => ({ ...KEVIN, name: '   ' }) }));
    expect(r.displayName).toBe(labelFor(USR));
    expect(r.trust).toBe('verified');
    expect(r.email).toBe('kevin@example.com');
    const view = toIdentityView(r);
    expect(view.name).toBeUndefined();
    expect(view.label).toBe(labelFor(USR));
    expect(view.email).toBeUndefined();
    expect(toIdentityView(r, { showEmail: true }).email).toBe('kevin@example.com');
    expect(displayWithTrust(r)).toBe(labelFor(USR));
  });

  test('a typed account name still wins', () => {
    expect(resolvePrincipal(USR, lookup({ account: () => KEVIN })).displayName).toBe('Kevin Liu');
  });

  test('pictureUrl is the 64 px file of a picture choice and absent otherwise', () => {
    const account = resolvePrincipal(USR, lookup({ account: () => ({ ...KEVIN, avatar: PICTURE }) }));
    expect(account.pictureUrl).toBe(`${PICTURE.picture.base}/${DIGEST}-64.webp`);
    const record = { ...newPrincipalRecord(ANON), avatar: PICTURE };
    const anonymous = resolvePrincipal(ANON, lookup({ record: () => record }));
    expect(anonymous.pictureUrl).toBe(`${PICTURE.picture.base}/${DIGEST}-64.webp`);
    expect(resolvePrincipal(USR, lookup({ account: () => KEVIN })).pictureUrl).toBeUndefined();
    expect(resolvePrincipal(ANON, lookup()).pictureUrl).toBeUndefined();
    const deleted = resolvePrincipal(
      USR,
      lookup({ account: () => ({ ...KEVIN, avatar: PICTURE, deleted: true }) }),
    );
    expect(deleted.pictureUrl).toBeUndefined();
    expect(deleted.displayName).toBe(DELETED_ACCOUNT);
  });

  test('the word beside the verified badge is "signed in"', () => {
    expect(TRUST_WORDS.verified).toBe('signed in');
    expect(TRUST_WORDS.guest).toBe('guest');
    expect(TRUST_WORDS.label).toBe('');
    expect(trustTooltip('verified', 'kevin@example.com')).toBe('Signed in as kevin@example.com');
    expect(trustTooltip('verified')).toBe('Signed in');
  });

  test('the view names the account behind an aliased anonymous id, and nothing else', () => {
    const aliased = resolvePrincipal(
      ANON,
      lookup({
        alias: (id) => (id === ANON ? 'usr_01JKEVIN' : null),
        account: (userId) => (userId === '01JKEVIN' ? KEVIN : null),
      }),
    );
    expect(toIdentityView(aliased).accountId).toBe('usr_01JKEVIN');
    expect(toIdentityView(resolvePrincipal(USR, lookup({ account: () => KEVIN }))).accountId).toBeUndefined();
    expect(toIdentityView(resolvePrincipal(ANON, lookup())).accountId).toBeUndefined();
    const deleted = resolvePrincipal(
      ANON,
      lookup({
        alias: () => 'usr_01JKEVIN',
        account: () => ({ ...KEVIN, deleted: true }),
      }),
    );
    expect(toIdentityView(deleted).accountId).toBeUndefined();
  });

  test('the view carries deleted for a deleted account only', () => {
    const gone = resolvePrincipal(USR, lookup());
    expect(toIdentityView(gone).deleted).toBe(true);
    expect(toIdentityView(gone, { showEmail: true }).email).toBeUndefined();
    expect(toIdentityView(resolvePrincipal(USR, lookup({ account: () => KEVIN }))).deleted).toBeUndefined();
    expect(toIdentityView(resolvePrincipal(ANON, lookup())).deleted).toBeUndefined();
  });
});
