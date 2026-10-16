import { readFileSync } from 'node:fs';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { DitherWorkerLike } from '../dither';
import { ditherHost, resetDitherHost, setDitherHost, setDitherWorkerFactory } from '../dither';
import { ditherWorkerFactory } from '../dither-factory';

// Hardening HR-PC#2 (PERF-9): the router registers the worker factory through
// `@turboslide/viewer/dither-factory`, a module without imports, so the dither pipeline stays out
// of the chunk every route loads. The pipeline's shared host reads the slot when it draws.

function fakeWorker(made: { count: number }): DitherWorkerLike {
  made.count += 1;
  return {
    postMessage: () => undefined,
    terminate: () => undefined,
    addEventListener: () => undefined,
  } as unknown as DitherWorkerLike;
}

describe('the dither worker factory slot', () => {
  const page = globalThis as { Worker?: unknown };
  const original = page.Worker;
  beforeAll(() => {
    page.Worker = class {};
  });
  afterAll(() => {
    page.Worker = original;
  });
  afterEach(() => {
    setDitherWorkerFactory(null);
    resetDitherHost();
  });

  it('imports nothing at run time', () => {
    const source = readFileSync(new URL('../dither-factory.ts', import.meta.url), 'utf8');
    expect(source.match(/^import (?!type )/gm)).toBeNull();
  });

  it('builds the shared host from the registered factory, once per registration', () => {
    const made = { count: 0 };
    setDitherWorkerFactory(() => fakeWorker(made));
    const first = ditherHost();
    expect(made.count).toBe(1);
    expect(ditherHost()).toBe(first);
    expect(made.count).toBe(1);

    setDitherWorkerFactory(() => fakeWorker(made));
    const second = ditherHost();
    expect(made.count).toBe(2);
    expect(second).not.toBe(first);
    expect(ditherWorkerFactory().make).not.toBeNull();
  });

  it('keeps a host set directly until the next registration', () => {
    const made = { count: 0 };
    setDitherWorkerFactory(() => fakeWorker(made));
    const host = ditherHost();
    setDitherHost(host);
    expect(ditherHost()).toBe(host);
    setDitherWorkerFactory(null);
    expect(ditherHost()).not.toBe(host);
    expect(made.count).toBe(1);
  });

  it('draws on the main thread when no factory is registered', () => {
    setDitherWorkerFactory(null);
    const host = ditherHost();
    expect(ditherHost()).toBe(host);
  });
});
