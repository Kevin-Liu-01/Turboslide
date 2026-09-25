import { describe, expect, it } from 'vitest';

import { bundledLogoIndex, bundledLogoIndexBytes } from './logo-index-snapshot';

// The snapshot bundled with the deployment (docs/FEATURES.md 4.2; build/hotfix.md section 9):
// the committed file parses as a real build the picker can serve, weighs under the plain file's
// line, names no failure, and every caller gets its own copy.

describe('the bundled logo index snapshot (build/hotfix.md 9)', () => {
  it('parses as a complete build of thousands of marks under 4 MB, with its builtAt and no lastError', () => {
    const index = bundledLogoIndex();
    expect(index).not.toBeNull();
    expect(index!.icons.length).toBeGreaterThan(1000);
    expect(index!.icons.filter((row) => row.readsOnPaper !== undefined).length).toBeGreaterThan(
      1000,
    );
    expect(typeof index!.builtAt).toBe('string');
    expect(typeof index!.updatedAt).toBe('string');
    expect(index!.progress).toBeUndefined();
    expect(index!.lastError).toBeUndefined();
    expect(bundledLogoIndexBytes()).toBeLessThanOrEqual(4 * 1024 * 1024);
    /* the rows the picker's rows search for are there */
    expect(index!.icons.some((row) => row.slug === 'vercel')).toBe(true);
    expect(index!.icons.some((row) => row.slug === 'figma')).toBe(true);
  });

  it('answers a fresh copy on every call, so a holder’s discoveries never reach the module’s', () => {
    const first = bundledLogoIndex()!;
    first.cached['vercel/dark'] = { at: '2026-09-24T00:00:00.000Z', digest: 'x', bytes: 1 };
    const second = bundledLogoIndex()!;
    expect(second.cached['vercel/dark']).toBeUndefined();
    expect(second).not.toBe(first);
  });
});
