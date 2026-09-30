import { describe, expect, test } from 'vitest';

import { ACCESS_REFRESH_RETRIES, readAccessWithRetries } from './access-refresh';

describe('readAccessWithRetries (the editor reads the standing again before believing a null)', () => {
  test('a value on the first read is answered without a wait', async () => {
    const waits: number[] = [];
    const answer = await readAccessWithRetries(async () => ({ role: 'owner' }), {
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(answer).toEqual({ role: 'owner' });
    expect(waits).toEqual([]);
  });

  test('a null read is tried again after the wait and the later value is answered', async () => {
    const answers: Array<{ role: string } | null> = [null, null, { role: 'editor' }];
    const waits: number[] = [];
    const answer = await readAccessWithRetries(async () => answers.shift() ?? null, {
      waitMs: 7,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(answer).toEqual({ role: 'editor' });
    expect(waits).toEqual([7, 7]);
  });

  test('null after every retry is answered as null, the retries counted', async () => {
    let reads = 0;
    const answer = await readAccessWithRetries(
      async () => {
        reads += 1;
        return null;
      },
      { sleep: async () => undefined },
    );
    expect(answer).toBeNull();
    expect(reads).toBe(1 + ACCESS_REFRESH_RETRIES);
  });

  test('a throw ends the reads and reaches the caller', async () => {
    await expect(
      readAccessWithRetries(
        async () => {
          throw new Error('the store is busy');
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toThrow('the store is busy');
  });
});
