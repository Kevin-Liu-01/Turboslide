import { describe, expect, it } from 'vitest';

import { serialChain } from './serial-chain';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('serialChain', () => {
  it('runs two tasks queued in one synchronous loop one after the other, in order', async () => {
    const chain = serialChain();
    const log: string[] = [];
    let release: () => void = () => undefined;
    const first = chain(async () => {
      log.push('first start');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      log.push('first end');
    });
    const second = chain(async () => {
      log.push('second start');
      log.push('second end');
    });
    await tick();
    expect(log).toEqual(['first start']);
    release();
    await Promise.all([first, second]);
    expect(log).toEqual(['first start', 'first end', 'second start', 'second end']);
  });

  it('hands each task its own answer and its own rejection, and a rejection never holds the chain', async () => {
    const chain = serialChain();
    const a = chain(async () => 1);
    const b = chain(async () => {
      throw new Error('refused');
    });
    const c = chain(async () => 3);
    await expect(a).resolves.toBe(1);
    await expect(b).rejects.toThrow('refused');
    await expect(c).resolves.toBe(3);
  });

  it('a task queued after the chain drained starts at once', async () => {
    const chain = serialChain();
    await chain(async () => undefined);
    let started = false;
    const p = chain(async () => {
      started = true;
    });
    await p;
    expect(started).toBe(true);
  });
});
