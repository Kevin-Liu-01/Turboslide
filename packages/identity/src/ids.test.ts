import { describe, expect, test } from 'vitest';

import {
  accountPrincipalId,
  agentPrincipalId,
  anonymousPrincipalId,
  isPrincipalId,
  parsePrincipalId,
  principalKind,
} from './ids.ts';

const UUID = '9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';

describe('principal ids', () => {
  test('the three formats round trip', () => {
    expect(anonymousPrincipalId(UUID)).toBe(`anon_${UUID}`);
    expect(anonymousPrincipalId(UUID.toUpperCase())).toBe(`anon_${UUID}`);
    expect(accountPrincipalId('01JABCDEF')).toBe('usr_01JABCDEF');
    expect(agentPrincipalId('key_7x')).toBe('agent:key_7x');
    expect(parsePrincipalId(`anon_${UUID}`)).toEqual({
      kind: 'anonymous',
      id: `anon_${UUID}`,
      uuid: UUID,
    });
    expect(parsePrincipalId('usr_01JABCDEF')).toEqual({
      kind: 'account',
      id: 'usr_01JABCDEF',
      userId: '01JABCDEF',
    });
    expect(parsePrincipalId('agent:key_7x')).toEqual({
      kind: 'agent',
      id: 'agent:key_7x',
      tokenId: 'key_7x',
    });
    expect(principalKind('agent:key_7x')).toBe('agent');
  });

  test('refuses anything else', () => {
    expect(parsePrincipalId('anon_not-a-uuid')).toBeNull();
    expect(parsePrincipalId(`anon_${UUID.replace('-4e6f', '-1e6f')}`)).toBeNull();
    expect(parsePrincipalId('usr_')).toBeNull();
    expect(parsePrincipalId('usr_has space')).toBeNull();
    expect(parsePrincipalId('agent:')).toBeNull();
    expect(parsePrincipalId('kevin')).toBeNull();
    expect(parsePrincipalId('studio')).toBeNull();
    expect(isPrincipalId('presenter')).toBe(false);
    expect(() => anonymousPrincipalId('nope')).toThrow(RangeError);
    expect(() => accountPrincipalId('a/b')).toThrow(RangeError);
    expect(() => agentPrincipalId('')).toThrow(RangeError);
    expect(() => principalKind('kevin')).toThrow(RangeError);
  });
});
