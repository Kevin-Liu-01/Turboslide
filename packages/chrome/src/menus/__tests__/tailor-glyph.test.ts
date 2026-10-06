import { describe, expect, it } from 'vitest';

import { itemById } from '../model';

// Tools > Tailor for a customer draws the pencil (docs/DESIGN.md 8.13, question 24; the design
// round's pass 2, finding 7), so it no longer shares Insert > Comment's chat glyph. The landing's
// features row reads the same glyph from this model at build (scripts/build-home-assets.ts).
describe('the Tailor row glyph', () => {
  it('draws the pencil, apart from Comment', () => {
    expect(itemById('tools.tailor').icon).toBe('pencil');
    expect(itemById('insert.comment').icon).toBe('chat');
  });
});
