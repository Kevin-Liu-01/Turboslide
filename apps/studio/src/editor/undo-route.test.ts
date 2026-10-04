import { OPS_POST_MAX_BYTES } from '@turboslide/realtime/protocol';
import type { Mutation } from '@turboslide/schema/mutations';
import { describe, expect, it } from 'vitest';

import { stepBytes, stepTravelsServerFirst } from './undo-route';

/** A slide.insert whose slide carries `chars` characters of text, the shape of a restore's undo. */
const insertOf = (id: string, chars: number): Mutation =>
  ({
    op: 'slide.insert',
    sectionId: 'main',
    slide: {
      id,
      kind: 'content',
      slots: { main: [{ id: `${id}-text`, type: 'text', text: 'x'.repeat(chars) }] },
    },
  }) as unknown as Mutation;

describe('stepTravelsServerFirst', () => {
  it('sends the undo and the redo of a version restore through the server function', () => {
    const forward: Mutation[] = [{ op: 'version.restore', n: 54 }];
    expect(stepTravelsServerFirst(forward, [insertOf('a', 10)])).toBe(true);
    expect(stepTravelsServerFirst(forward, forward)).toBe(true);
  });

  it('keeps a small step of an ordinary edit in the room', () => {
    const forward: Mutation[] = [{ op: 'slide.remove', slideId: 'a' }];
    expect(stepTravelsServerFirst(forward, [insertOf('a', 2000)])).toBe(false);
  });

  it('sends a step larger than one ops post through the server function', () => {
    const forward: Mutation[] = [
      { op: 'slide.remove', slideId: 'a' },
      { op: 'slide.remove', slideId: 'b' },
    ];
    /* the undo of a delete of two slides of 200,000 characters each, over the 256 kB post */
    const step = [insertOf('a', 200_000), insertOf('b', 200_000)];
    expect(stepBytes(step)).toBeGreaterThan(OPS_POST_MAX_BYTES);
    expect(stepTravelsServerFirst(forward, step)).toBe(true);
  });

  it('counts bytes as the room client does, so a step just under its limit stays in the room', () => {
    const forward: Mutation[] = [{ op: 'slide.remove', slideId: 'a' }];
    const overhead = stepBytes([insertOf('a', 0)]);
    const limit = OPS_POST_MAX_BYTES - 1024;
    expect(stepTravelsServerFirst(forward, [insertOf('a', limit - overhead)])).toBe(false);
    expect(stepTravelsServerFirst(forward, [insertOf('a', limit - overhead + 1)])).toBe(true);
  });
});
