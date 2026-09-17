import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';

import { growMutation, sessionReconcile } from '../text-fit';

// The session's two fits with the document (docs/FOCUS.md section 5 ranks 10, 11 and 13): what an
// open session does when the document moved under it, and the autofit grow after a burst.

describe('sessionReconcile', () => {
  it('does nothing while the document holds what the session last wrote', () => {
    expect(sessionReconcile('Renewal terms apply', 'Renewal terms apply')).toBe('none');
  });

  it('absorbs a mark write from outside the session: the same letters, other marks', () => {
    expect(sessionReconcile('Renewal terms apply', 'Renewal [terms]{i} apply')).toBe('absorb');
    expect(sessionReconcile('Renewal [terms]{i} apply', 'Renewal terms apply')).toBe('absorb');
    expect(sessionReconcile('See the proposal', 'See the [proposal](https://example.com)')).toBe(
      'absorb',
    );
  });

  it('re-sends when the document fell behind the session: a refused burst folded back', () => {
    expect(sessionReconcile('Onboarding', 'Onboard')).toBe('resend');
    expect(sessionReconcile('Onboarding', '')).toBe('resend');
  });

  it("re-sends when a collaborator's letters landed, so the local keystrokes go once from the document", () => {
    expect(sessionReconcile('Renewal terms', 'Renewal terms apply')).toBe('resend');
  });

  it('reads a paragraph break as one character, as the splices do', () => {
    expect(sessionReconcile('one\ntwo', 'one\n[two]{u}')).toBe('absorb');
    expect(sessionReconcile('one\ntwo', 'one two')).toBe('resend');
  });
});

describe('growMutation', () => {
  const box: Block = {
    id: 'text',
    type: 'text',
    text: 'A long caption',
    autofit: 'grow',
    pos: { x: 100, y: 100, w: 600, h: 140 },
  } as Block;

  it('writes pos.h to the content height when the text needs more than the box', () => {
    expect(growMutation('s1', box, 212.4)).toEqual({
      op: 'block.set',
      slideId: 's1',
      blockId: 'text',
      path: '/pos/h',
      value: 213,
    });
  });

  it('leaves a box alone that holds its text, within the one pixel of withAutofit', () => {
    expect(growMutation('s1', box, 140)).toBeNull();
    expect(growMutation('s1', box, 141)).toBeNull();
    expect(growMutation('s1', box, 120)).toBeNull();
    expect(growMutation('s1', box, null)).toBeNull();
  });

  it('never grows a box without a position or with another autofit', () => {
    const { pos: _pos, ...noPos } = box as Block & { pos: unknown };
    expect(growMutation('s1', noPos as Block, 300)).toBeNull();
    expect(growMutation('s1', { ...box, autofit: 'shrink' } as Block, 300)).toBeNull();
    expect(growMutation('s1', { ...box, autofit: 'none' } as Block, 300)).toBeNull();
  });
});
