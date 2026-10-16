// The memory channel: the contract over one process, plus the flags a checkout sets.
import { describe, expect, it } from 'vitest';

import { channelContract } from './channel-contract.ts';
import { memoryChannel } from './memory.ts';

channelContract('memory', async () => {
  let clock = 1_700_000_000_000;
  const channel = memoryChannel({ now: () => clock });
  return {
    channel,
    peer: channel,
    advance: (ms) => {
      clock += ms;
    },
  };
});

describe('memoryChannel flags', () => {
  it('reads the flags it was given and the ones the CLI sets', async () => {
    const channel = memoryChannel({ flags: { realtime: false } });
    expect(await channel.flag('realtime')).toBe(false);
    expect(await channel.flag('presence')).toBe(true);
    channel.setFlag('presence', false);
    expect(await channel.flag('presence')).toBe(false);
    channel.setFlag('realtime', true);
    expect(await channel.flag('realtime')).toBe(true);
    expect(channel.rooms()).toEqual([]);
    await channel.head('gt-brand');
    expect(channel.rooms()).toEqual(['gt-brand']);
  });
});

// the wave 3b verify's finding 6: a new process's stream numbers above what the records cover
describe('memoryChannel floor', () => {
  it('raises an empty stream to the covered seq, never lowers it, and numbers above it', async () => {
    const channel = memoryChannel();
    await channel.floor?.('gt-brand', 9);
    expect(await channel.head('gt-brand')).toBe(9);
    await channel.floor?.('gt-brand', 4);
    expect(await channel.head('gt-brand')).toBe(9);
    const appended = await channel.append('gt-brand', 9, [
      {
        rev: 1,
        kind: 'edit',
        author: { kind: 'human', name: 'A' },
        clientId: 'c'.repeat(32),
        opId: `${'c'.repeat(32)}:1`,
        mutations: [],
        at: '2026-10-12T00:00:00.000Z',
      },
    ]);
    expect(appended.ok && appended.entries.map((entry) => entry.seq)).toEqual([10]);
    expect((await channel.since('gt-brand', 9, 10)).map((entry) => entry.seq)).toEqual([10]);
  });
});
