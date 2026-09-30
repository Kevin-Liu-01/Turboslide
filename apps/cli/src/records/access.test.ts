// The share records' reader and the alias table (docs/PEOPLE.md 3.6; the people round's fix
// round, b1.md R1): an account and the anonymous ids the alias table links to it are one person,
// so a deck made before the sign in stays the account's own at `standing()` and `shareGet()`;
// a caller without the alias is a stranger to it and reads the 404 sentence.
import { describe, expect, test } from 'vitest';

import { newDeckRecord } from '@turboslide/schema/access';

import type { AccessDeps, Caller } from './access.ts';
import { shareGet, standing } from './access.ts';

const NOW = '2026-09-30T09:00:00.000Z';

function depsFor(caller: Caller, record = newDeckRecord('q4', 'anon_x', 'k'.repeat(22), NOW)) {
  const deps: AccessDeps = {
    deckDir: '/nowhere/q4',
    deckId: 'q4',
    stateDir: '/nowhere/.turboslide',
    caller,
    origin: 'http://localhost:4321',
    now: () => NOW,
    load: () => record,
    save: () => undefined,
  };
  return { deps, record };
}

describe('the alias table at the share records', () => {
  test("a record owned by an alias stands as the account's own", async () => {
    const account: Caller = { principalId: 'usr_a', kind: 'account', aliases: ['anon_x'] };
    const { deps, record } = depsFor(account);
    expect(standing(record, account, NOW)).toEqual({ role: 'owner', via: 'owner' });
    const answer = await shareGet(deps);
    expect(answer.role).toBe('owner');
    expect(answer.via).toBe('owner');
    expect(answer.capabilities).toContain('share');
    expect(answer.record.owner).toBe('anon_x');
    expect(answer.record.grants).toEqual([]);
  });

  test("a grant to an alias is the account's grant, at standing and in the partial view", async () => {
    const account: Caller = { principalId: 'usr_b', kind: 'account', aliases: ['anon_y'] };
    const record = newDeckRecord('q4', 'anon_x', 'k'.repeat(22), NOW);
    record.grants.push({
      id: 'grt_1',
      principalId: 'anon_y',
      email: null,
      role: 'commenter',
      invitedBy: 'anon_x',
      invitedAt: NOW,
      acceptedAt: NOW,
      expiresAt: null,
    } as (typeof record.grants)[number]);
    const { deps } = depsFor(account, record);
    expect(standing(record, account, NOW)).toEqual({ role: 'commenter', via: 'grant' });
    const answer = await shareGet(deps);
    expect(answer.role).toBe('commenter');
    expect(answer.record.grants?.map((grant) => grant.principalId)).toEqual(['anon_y']);
  });

  test('a caller without the alias answers null and the 404 sentence', async () => {
    const stranger: Caller = { principalId: 'usr_c', kind: 'account' };
    const { deps, record } = depsFor(stranger);
    expect(standing(record, stranger, NOW)).toBeNull();
    await expect(shareGet(deps)).rejects.toThrow(
      'This presentation is not available to you, or does not exist.',
    );
  });
});
