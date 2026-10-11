// Which op ids the deck holds (RELIABILITY-6, hardening HR-RT#14; write.ts `heldOf`, the server half
// of the recovered writes plate): the ones a record's origin names and, on the do tier, the ones the
// object's log holds that no checkpoint committed yet; a read that fails throws, never "none held".
import { describe, expect, it } from 'vitest';

import type { VersionRecord } from '@turboslide/store/store';

import { heldOf } from './write';

type DeckRoom = Parameters<typeof heldOf>[0];

const record = (opIds: string[]): VersionRecord =>
  ({ origin: { clientId: 'c1', opIds } }) as unknown as VersionRecord;

function roomOf(options: { records: VersionRecord[] | Error; object?: string[] | Error }): {
  room: DeckRoom;
  asked: string[][];
} {
  const asked: string[][] = [];
  const store = {
    records: async () => {
      if (options.records instanceof Error) throw options.records;
      return options.records;
    },
  };
  const channel =
    options.object === undefined
      ? { tier: 'memory' }
      : {
          tier: 'do',
          document: async () => null,
          flush: async () => ({}),
          held: async (_deckId: string, opIds: readonly string[]) => {
            asked.push([...opIds]);
            if (options.object instanceof Error) throw options.object;
            return (options.object as string[]).filter((id) => opIds.includes(id));
          },
        };
  return { room: { deckId: 'held', store, channel } as unknown as DeckRoom, asked };
}

describe('heldOf', () => {
  it('answers the op ids a record names and, on the do tier, the ones the object holds uncommitted', async () => {
    const { room, asked } = roomOf({ records: [record(['c1:1', 'c1:2'])], object: ['c1:3'] });
    expect(await heldOf(room, ['c1:1', 'c1:3', 'c1:4'])).toEqual(['c1:1', 'c1:3']);
    // the object is asked only for the ids no record names
    expect(asked).toEqual([['c1:3', 'c1:4']]);
  });

  it('reads the records alone off the do tier', async () => {
    const { room } = roomOf({ records: [record(['c1:2'])] });
    expect(await heldOf(room, ['c1:1', 'c1:2'])).toEqual(['c1:2']);
  });

  it('throws when the records or the object do not answer, instead of answering none held', async () => {
    await expect(
      heldOf(roomOf({ records: new Error('the store did not answer') }).room, ['c1:1']),
    ).rejects.toThrow(/did not answer/);
    await expect(
      heldOf(roomOf({ records: [], object: new Error('the held route answered 503') }).room, [
        'c1:1',
      ]),
    ).rejects.toThrow(/503/);
  });
});
