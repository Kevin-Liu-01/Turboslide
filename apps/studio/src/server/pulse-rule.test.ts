import { afterEach, describe, expect, it } from 'vitest';

import { pulseWanted } from '@turboslide/store/pulse';

import { pulseWantedOnTier } from './room';

// The room module sets the store's pulse rule from the tier the instance serves (hardening PS#3,
// PERF-3 item 1): the blob tier's poll reads the pulse, the do tier's object makes it unread.
// Before the room state exists the rule reads the environment, which is all these tests set.

const NAMES = [
  'TURBOSLIDE_REALTIME',
  'TURBOSLIDE_ROOM_HOST',
  'TURBOSLIDE_ROOM_SECRET',
  'TURBOSLIDE_ROOM_BEARER',
  'REDIS_URL',
] as const;
const before = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of NAMES) {
    const value = before[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function tier(values: Partial<Record<(typeof NAMES)[number], string>>): void {
  for (const name of NAMES) delete process.env[name];
  Object.assign(process.env, values);
}

describe('hardening PS#3: the pulse rule follows the tier', () => {
  it('an instance on the do tier writes no pulse', () => {
    tier({
      TURBOSLIDE_REALTIME: 'do',
      TURBOSLIDE_ROOM_HOST: 'rooms.example.test',
      TURBOSLIDE_ROOM_SECRET: 'a-room-secret-for-the-pulse-rule-test-0123',
      TURBOSLIDE_ROOM_BEARER: 'a-room-bearer-for-the-pulse-rule-test-0123',
    });
    expect(pulseWantedOnTier()).toBe(false);
    // the store reads the rule the module registered at import
    expect(pulseWanted()).toBe(false);
  });

  it('an instance on the blob or memory tier writes the pulse', () => {
    tier({ TURBOSLIDE_REALTIME: 'blob' });
    expect(pulseWanted()).toBe(true);
    tier({ TURBOSLIDE_REALTIME: 'memory' });
    expect(pulseWanted()).toBe(true);
  });

  it('a tier the environment cannot name counts as a pulse written', () => {
    tier({ TURBOSLIDE_REALTIME: 'do' });
    expect(() => pulseWantedOnTier()).toThrow(/TURBOSLIDE_REALTIME=do needs/);
    expect(pulseWanted()).toBe(true);
  });
});
