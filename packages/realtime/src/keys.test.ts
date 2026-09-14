// The key builder refuses every id outside its grammar (report 10 F34) and builds the names of
// SPEC-3 3.2 from the slug validated deck id and a fixed suffix list.
import { describe, expect, it } from 'vitest';

import {
  FLAG_NAMES,
  accessKey,
  budgetKey,
  checkIdentity,
  deckKeys,
  downloadSpentKey,
  flagKey,
  headKey,
  inboxKey,
  principalKey,
} from './keys.ts';

const CLIENT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const ANON = 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';

describe('deckKeys', () => {
  it('builds every per deck key from the slug and a fixed suffix', () => {
    const keys = deckKeys('gt-brand');
    expect(keys.ops).toBe('deck:gt-brand:ops');
    expect(keys.head).toBe('deck:gt-brand:head');
    expect(keys.ckpt).toBe('deck:gt-brand:ckpt');
    expect(keys.append).toBe('deck:gt-brand:append');
    expect(keys.presence).toBe('deck:gt-brand:presence');
    expect(keys.roster).toBe('deck:gt-brand:roster');
    expect(keys.events).toBe('deck:gt-brand:events');
    expect(keys.client(CLIENT)).toBe(`deck:gt-brand:client:${CLIENT}`);
    expect(keys.streams(ANON)).toBe(`deck:gt-brand:streams:${ANON}`);
    expect(keys.streams('agent:tok_01J')).toBe('deck:gt-brand:streams:agent:tok_01J');
    expect(keys.streams('ip:0123456789abcdef')).toBe('deck:gt-brand:streams:ip:0123456789abcdef');
  });

  it('refuses a deck id that is not a slug', () => {
    for (const bad of [
      'Gt-Brand',
      'gt brand',
      'gt/brand',
      '',
      'gt-brand:ops',
      '../x',
      'gt--brand',
      '-gt',
    ]) {
      expect(() => deckKeys(bad), bad).toThrow(TypeError);
    }
  });

  it('refuses a client id that is not 32 hex characters and an identity outside the grammar', () => {
    const keys = deckKeys('gt-brand');
    expect(() => keys.client('abc')).toThrow(TypeError);
    expect(() => keys.client(CLIENT.toUpperCase())).toThrow(TypeError);
    expect(() => keys.client(`${CLIENT}:x`)).toThrow(TypeError);
    for (const bad of ['kevin', 'anon_x', 'usr_', 'agent:', 'ip:xyz', `${ANON} `, 'usr_a:b']) {
      expect(() => keys.streams(bad), bad).toThrow(TypeError);
    }
    expect(checkIdentity('usr_01JABCDEF')).toBe('usr_01JABCDEF');
  });
});

describe('the other keys', () => {
  it('build budgets, caches, principals, inboxes, flags and spent tokens', () => {
    expect(budgetKey('usr_a', 'ops', 123)).toBe('q:usr_a:ops:123');
    expect(budgetKey(ANON, 'redisCmds', '2026-09-13')).toBe(`q:${ANON}:redisCmds:2026-09-13`);
    expect(() => budgetKey('usr_a', 'Ops', 1)).toThrow(TypeError);
    expect(() => budgetKey('usr_a', 'ops', 'a b')).toThrow(TypeError);
    expect(() => budgetKey('kevin', 'ops', 1)).toThrow(TypeError);
    expect(accessKey('q4-review')).toBe('access:q4-review');
    expect(headKey('q4-review')).toBe('head:q4-review');
    expect(() => accessKey('Q4')).toThrow(TypeError);
    expect(principalKey(ANON)).toBe(`principal:${ANON}`);
    expect(inboxKey('usr_01J')).toBe('inbox:usr_01J');
    // an address is an identity for counters, never a principal
    expect(() => principalKey('ip:0123456789abcdef')).toThrow(TypeError);
    expect(() => inboxKey('ip:0123456789abcdef')).toThrow(TypeError);
    for (const name of FLAG_NAMES) expect(flagKey(name)).toBe(`flag:${name}`);
    expect(FLAG_NAMES).toHaveLength(12);
    expect(() => flagKey('foo')).toThrow(TypeError);
    expect(downloadSpentKey('AbC_dEf-0123456789xyz')).toBe('dl:spent:AbC_dEf-0123456789xyz');
    expect(() => downloadSpentKey('short')).toThrow(TypeError);
    expect(() => downloadSpentKey('with/slash/inside/0123')).toThrow(TypeError);
  });
});
