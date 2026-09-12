import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  DERIVED_GRACE_MS,
  DERIVED_KEEP_MS,
  DiskFullError,
  isDiskFull,
  retryWhenDiskFull,
  sweepDerived,
  treeBytes,
} from './root';
import type { DerivedTarget } from './root';

// The sweep of the derived files under a hosted overlay and the ENOSPC retry (gslides-parity
// verification finding 20), driven on a temp tree with the folder layout the worker clients,
// tokens.ts and thumbs.ts write: <state>/worker/{jobs,cache,builds} and <state>/thumbs. Nothing
// here opens a store or selects a backend; sweepDerived and retryWhenDiskFull are pure over their
// arguments. Run with a vitest config whose root is apps/studio (docs/gslides-parity/build/b5.md,
// the fix round names the command).

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-root-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const MINUTE = 60_000;

/** A file of `bytes` bytes at `path`, its folders made, its mtime set to `at`. */
function file(path: string, bytes: number, at: number): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, Buffer.alloc(bytes, 1));
  utimesSync(path, at / 1000, at / 1000);
}

/** Sets a folder's own mtime (a rename or a removal inside it would move it). */
function touchDir(path: string, at: number): void {
  mkdirSync(path, { recursive: true });
  utimesSync(path, at / 1000, at / 1000);
}

function target(name: string): DerivedTarget {
  const stateDir = join(tmp, name, '.turboslide');
  return { stateDir, workerDir: join(stateDir, 'worker') };
}

/** A render cache or thumbs revision folder with one theme folder and two files, every mtime at `at`. */
function revision(base: string, deck: string, rev: string, at: number, bytes = 1000): string {
  const dir = join(base, deck, rev);
  const theme = join(dir, 'light@1x');
  file(join(theme, 'a.png'), bytes, at);
  file(join(theme, 'a.json'), 10, at);
  touchDir(theme, at);
  touchDir(dir, at);
  return dir;
}

/** A job folder; finished when `finishedAt` is given (job.json is written last by the queue). */
function job(workerDir: string, id: string, at: number, finishedAt: number | null): string {
  const dir = join(workerDir, 'jobs', id);
  file(join(dir, 'render-light', 'a.png'), 5000, at);
  if (finishedAt !== null) file(join(dir, 'job.json'), 100, finishedAt);
  touchDir(dir, at);
  return dir;
}

describe('sweepDerived (finding 20)', () => {
  it('removes what nothing can ask for again and keeps the rest', () => {
    const t = target('rules');
    const now = Date.parse('2026-09-12T12:00:00Z');
    const old = now - 3 * DERIVED_KEEP_MS;
    const recent = now - 2 * MINUTE;
    const justNow = now - 5_000;
    // jobs: finished long ago, finished a moment ago, still running (no job.json)
    const doneOld = job(t.workerDir, 'done-old', old, old);
    const doneRecent = job(t.workerDir, 'done-recent', recent, recent);
    const running = job(t.workerDir, 'running', old, null);
    // the render cache: revisions 3 (old), 4 (older than 5 but written a moment ago) and 5 (newest)
    const cache = join(t.workerDir, 'cache');
    const rev3 = revision(cache, 'demo', '3', old);
    const rev4 = revision(cache, 'demo', '4', justNow);
    const rev5 = revision(cache, 'demo', '5', old);
    // another deck whose only revision is old: the newest of its deck, so it stays
    const otherOnly = revision(cache, 'other', '9', old);
    // thumbnails follow the same rule
    const thumbs = join(t.stateDir, 'thumbs');
    const thumb7 = revision(thumbs, 'demo', '7', old, 300);
    const thumb8 = revision(thumbs, 'demo', '8', recent, 300);
    // builds live for the download window
    const buildOld = join(t.workerDir, 'builds', 'demo', 'demo.html');
    const buildRecent = join(t.workerDir, 'builds', 'other', 'other.html');
    file(buildOld, 2000, old);
    file(buildRecent, 2000, recent);

    const report = sweepDerived(t, { now });

    expect(existsSync(doneOld)).toBe(false);
    expect(existsSync(doneRecent)).toBe(true);
    expect(existsSync(running)).toBe(true);
    expect(existsSync(rev3)).toBe(false);
    expect(existsSync(rev4)).toBe(true);
    expect(existsSync(rev5)).toBe(true);
    expect(existsSync(otherOnly)).toBe(true);
    expect(existsSync(thumb7)).toBe(false);
    expect(existsSync(thumb8)).toBe(true);
    expect(existsSync(buildOld)).toBe(false);
    expect(existsSync(buildRecent)).toBe(true);
    // the emptied deck folder of the build goes, the cache deck folder that still has revisions stays
    expect(existsSync(join(t.workerDir, 'builds', 'demo'))).toBe(false);
    expect(existsSync(join(cache, 'demo'))).toBe(true);
    expect(report.removed).toBe(4);
    expect(report.by).toEqual({
      jobs: { removed: 1, bytes: 5100 },
      cache: { removed: 1, bytes: 1010 },
      thumbs: { removed: 1, bytes: 310 },
      builds: { removed: 1, bytes: 2000 },
    });
    expect(report.removedBytes).toBe(5100 + 1010 + 310 + 2000);
    // kept: done-recent, rev4, rev5, other/9, thumb8, other.html; the running job is not an
    // entry at all (it is never weighed against the budget either)
    expect(report.kept).toBe(6);
    expect(report.keptBytes).toBe(5100 + 1010 + 1010 + 1010 + 310 + 2000);
  });

  it('evicts oldest first down to the budget, never under the grace, never a running job', () => {
    const t = target('budget');
    const now = Date.parse('2026-09-12T12:00:00Z');
    const cache = join(t.workerDir, 'cache');
    const oldest = revision(cache, 'a', '1', now - 10 * MINUTE, 4000);
    const middle = revision(cache, 'b', '1', now - 5 * MINUTE, 4000);
    const fresh = revision(cache, 'c', '1', now - DERIVED_GRACE_MS / 2, 4000);
    const running = job(t.workerDir, 'running', now - 10 * MINUTE, null);
    const doneRecent = job(t.workerDir, 'done', now - 3 * MINUTE, now - 3 * MINUTE);

    // the three revisions are the newest of their decks and the job is inside its window, so
    // the age rules keep everything; the budget then takes the oldest until the rest fits
    const report = sweepDerived(t, { now, budgetBytes: 6000 });

    expect(existsSync(oldest)).toBe(false);
    expect(existsSync(middle)).toBe(false);
    expect(existsSync(doneRecent)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(running)).toBe(true);
    expect(report.removed).toBe(3);
    // the fresh revision is the one entry left; the running job is not counted
    expect(report.kept).toBe(1);
    expect(report.keptBytes).toBe(4010);

    // a budget of zero with the grace clears everything old enough; the fresh revision survives
    const pressure = sweepDerived(t, { now, budgetBytes: 0 });
    expect(pressure.removed).toBe(0);
    expect(existsSync(fresh)).toBe(true);
    // and with no grace it goes too, while the running job is still not touched
    const bare = sweepDerived(t, { now, budgetBytes: 0, graceMs: 0 });
    expect(bare.removed).toBe(1);
    expect(existsSync(fresh)).toBe(false);
    expect(existsSync(running)).toBe(true);
  });

  it('answers an empty report over folders that are not there', () => {
    const t = target('empty');
    const report = sweepDerived(t, { now: Date.now() });
    expect(report).toEqual({
      removed: 0,
      removedBytes: 0,
      kept: 0,
      keptBytes: 0,
      by: {
        jobs: { removed: 0, bytes: 0 },
        cache: { removed: 0, bytes: 0 },
        thumbs: { removed: 0, bytes: 0 },
        builds: { removed: 0, bytes: 0 },
      },
    });
    expect(treeBytes(join(t.stateDir, 'nothing'))).toBe(0);
  });
});

function enospc(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error('ENOSPC: no space left on device, write');
  error.code = 'ENOSPC';
  return error;
}

describe('retryWhenDiskFull (finding 20)', () => {
  it('sweeps once and runs again after an ENOSPC', async () => {
    let calls = 0;
    let sweeps = 0;
    const result = await retryWhenDiskFull(
      'listing the decks',
      async () => {
        calls += 1;
        if (calls === 1) throw enospc();
        return 'listed';
      },
      async () => {
        sweeps += 1;
      },
    );
    expect(result).toBe('listed');
    expect(calls).toBe(2);
    expect(sweeps).toBe(1);
  });

  it('turns a second ENOSPC into a DiskFullError that transports can answer as 503', async () => {
    let sweeps = 0;
    const attempt = retryWhenDiskFull(
      'writing the twins of demo',
      async () => {
        throw enospc();
      },
      async () => {
        sweeps += 1;
      },
    );
    await expect(attempt).rejects.toBeInstanceOf(DiskFullError);
    const error = (await attempt.catch((e: unknown) => e)) as DiskFullError;
    expect(error.status).toBe(503);
    expect(error.code).toBe('disk_full');
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
    expect(error.message).toContain('writing the twins of demo');
    expect(error.message).toContain('Retry in a few seconds');
    expect((error.cause as NodeJS.ErrnoException).code).toBe('ENOSPC');
    expect(sweeps).toBe(1);
    // a handled error is not mistaken for a fresh ENOSPC by an outer retry
    expect(isDiskFull(error)).toBe(false);
    expect(isDiskFull(enospc())).toBe(true);
    expect(isDiskFull(new Error('boom'))).toBe(false);
  });

  it('does not run a write twice when told so, and leaves other errors alone', async () => {
    let calls = 0;
    let sweeps = 0;
    const create = retryWhenDiskFull(
      'creating the deck',
      async () => {
        calls += 1;
        throw enospc();
      },
      async () => {
        sweeps += 1;
      },
      { retry: false },
    );
    await expect(create).rejects.toBeInstanceOf(DiskFullError);
    expect(calls).toBe(1);
    expect(sweeps).toBe(1);

    const other = retryWhenDiskFull(
      'opening demo',
      async () => {
        throw new RangeError('No deck demo under decks/');
      },
      async () => {
        sweeps += 1;
      },
    );
    await expect(other).rejects.toThrow(RangeError);
    expect(sweeps).toBe(1);
  });
});
