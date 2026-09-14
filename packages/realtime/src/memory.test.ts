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
