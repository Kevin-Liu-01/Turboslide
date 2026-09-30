// A plain block carries its own typography record (the polish round's fix round 3, B5's R20):
// Bulleted list on a title keeps the heading's look through it (apps/cli store-actions.ts
// listTypographyOf carries the level's size, weight, tracking and leading) and the render's list
// root applies it (packages/render blocks/lists.ts), so the 88 px title never becomes a 20 px list.
import { describe, expect, it } from 'vitest';

import { plainBlockSchema } from './blocks.ts';

describe('the plain block typography', () => {
  const cover = { size: 88, weight: 500, tracking: -0.025, leading: 1.02 };

  it('admits the record a heading carries into a bulleted list', () => {
    const parsed = plainBlockSchema.safeParse({
      id: 'list',
      type: 'plain',
      marker: 'bullet',
      items: [{ text: 'Plan' }],
      typography: cover,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.typography).toEqual(cover);
  });

  it('keeps the record optional and reads it through the typography schema', () => {
    expect(
      plainBlockSchema.safeParse({ id: 'l', type: 'plain', items: [{ text: 'a' }] }).success,
    ).toBe(true);
    expect(
      plainBlockSchema.safeParse({
        id: 'l',
        type: 'plain',
        items: [{ text: 'a' }],
        typography: { size: 'big' },
      }).success,
    ).toBe(false);
  });
});
