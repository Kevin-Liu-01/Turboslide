import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MINI_SOURCES } from './menus.generated';

// The landing's miniature menus (menus.generated.ts, menu-docs.generated.ts and
// menu-glyphs.generated.ts, and the glyph sprite they draw from) are derived from the editor's
// menu model and keys by `node scripts/build-home-assets.ts --slides`, which records the two
// files' hashes. A change to a menu row, its sentence or its glyph fails here, in the unit suite,
// until the landing is derived again; `build-home-assets.ts --check` then holds the sprite to its
// budget. GF-1.7's Preferences rows had failed only that check.

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const sha256 = (path: string): string =>
  createHash('sha256')
    .update(readFileSync(join(ROOT, path)))
    .digest('hex');

describe('the miniature menus', () => {
  it('were derived from the menu model and keys on disk', () => {
    expect(MINI_SOURCES).toEqual({
      model: sha256('packages/chrome/src/menus/model.ts'),
      keys: sha256('packages/chrome/src/menus/keys.ts'),
    });
  });
});
