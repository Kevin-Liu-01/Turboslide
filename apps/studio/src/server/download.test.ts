import { describe, expect, it, vi } from 'vitest';

import { STORE_RETRY_MS, putWithOneRetry } from './export-sync';

// A refused download retries once (docs/POLISH.md item 82; the row export.refusal.sentence-and-retry):
// the store's 429 is tried again after the seconds it names, capped, and a second refusal is the
// caller's to word; any other error is thrown at once.

function busy(retryAfter?: number): Error {
  const error = new Error(
    'Vercel Blob: Too many requests please lower the number of concurrent requests',
  );
  if (retryAfter !== undefined) Object.assign(error, { retryAfter });
  return error;
}

describe('the export store put', () => {
  it('tries once more on a 429, after the wait the refusal names', async () => {
    const put = vi
      .fn<(pathname: string, bytes: Uint8Array, options: unknown) => Promise<{ url: string }>>()
      .mockRejectedValueOnce(busy(2))
      .mockResolvedValueOnce({ url: 'https://store.test/exports/a.pptx' });
    const waits: number[] = [];
    const sleep = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };
    const entry = await putWithOneRetry({ put }, 'exports/a.pptx', new Uint8Array(3), 'x/y', sleep);
    expect(entry.url).toBe('https://store.test/exports/a.pptx');
    expect(put).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([2000]);
  });

  it('waits the default when the refusal names no seconds, and gives up after the second refusal', async () => {
    const put = vi
      .fn<(pathname: string, bytes: Uint8Array, options: unknown) => Promise<{ url: string }>>()
      .mockRejectedValueOnce(busy())
      .mockRejectedValueOnce(busy());
    const waits: number[] = [];
    await expect(
      putWithOneRetry({ put }, 'exports/a.pptx', new Uint8Array(3), 'x/y', (ms) => {
        waits.push(ms);
        return Promise.resolve();
      }),
    ).rejects.toThrow(/Too many requests/);
    expect(put).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([STORE_RETRY_MS]);
  });

  it('throws any other refusal at once', async () => {
    const put = vi
      .fn<(pathname: string, bytes: Uint8Array, options: unknown) => Promise<{ url: string }>>()
      .mockRejectedValueOnce(new Error('the token is not valid'));
    await expect(
      putWithOneRetry({ put }, 'exports/a.pptx', new Uint8Array(3), 'x/y', () => Promise.resolve()),
    ).rejects.toThrow('the token is not valid');
    expect(put).toHaveBeenCalledTimes(1);
  });
});
