import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toJsonSchema, typeLabel } from './json-schema.ts';

// A field's type in the reference names each member of a union (the post-deploy review: the
// fields slide, layout and mutations read "object | object | object"), and an array of a union
// keeps the union inside its brackets.

const label = (schema: z.ZodType): string => typeLabel(toJsonSchema(schema));

describe('a type label', () => {
  it('names the members of a discriminated union by their value of the discriminator', () => {
    const layout = z.discriminatedUnion('type', [
      z.object({ type: z.literal('cols'), ratio: z.number() }),
      z.object({ type: z.literal('center') }),
    ]);
    expect(label(layout)).toBe('{ type: "cols" | "center" }');
    expect(label(z.array(layout))).toBe('{ type: "cols" | "center" }[]');
    expect(label(layout.nullable())).toBe('{ type: "cols" | "center" } | null');
  });

  it('names other object members by their title, else their required keys', () => {
    expect(
      label(z.union([z.object({ principalId: z.string() }), z.object({ email: z.string() })])),
    ).toBe('{ principalId } | { email }');
    expect(
      label(
        z.union([
          z.object({ a: z.string() }).meta({ title: 'By id' }),
          z.object({ b: z.string() }).meta({ title: 'By email' }),
        ]),
      ),
    ).toBe('By id | By email');
    expect(label(z.union([z.string(), z.object({ slide: z.string() })]))).toBe(
      'string | { slide }',
    );
  });

  it('keeps an array of values in parentheses', () => {
    expect(label(z.array(z.enum(['read', 'write'])))).toBe('("read" | "write")[]');
    expect(label(z.array(z.string()))).toBe('string[]');
  });
});
