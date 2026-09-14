import { describe, expect, test } from 'vitest';

import { labelFor } from './labels.ts';
import { newPrincipalRecord } from './principal.ts';
import type { AccountProfile, ResolveLookup } from './resolve.ts';
import {
  DELETED_ACCOUNT,
  displayWithTrust,
  resolvePrincipal,
  sanitizeRunId,
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
      label: labelFor(ANON),
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
    expect(blankName.displayName).toBe('kevin@example.com');
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
