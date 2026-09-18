import { describe, expect, it } from 'vitest';

import { keepsPlace } from './select-after-write';

describe('keepsPlace (the late selection after a write, C2-F21 slides.duplicate.two-selected-menu)', () => {
  it('lets the copy take the selection while the active slide is the one the write was made on', () => {
    expect(keepsPlace('title', 'title', 'title-2')).toBe(true);
  });
  it('lets it stand when the copy is already active', () => {
    expect(keepsPlace('title-2', 'title', 'title-2')).toBe(true);
  });
  it('yields to a card the person picked since the write', () => {
    expect(keepsPlace('split-1', 'title', 'title-2')).toBe(false);
    expect(keepsPlace(null, 'title', 'title-2')).toBe(false);
  });
  it('selects unconditionally when no origin is known (a removed current slide)', () => {
    expect(keepsPlace('anything', null, 'split-3')).toBe(true);
    expect(keepsPlace('anything', undefined, 'split-3')).toBe(true);
  });
});
