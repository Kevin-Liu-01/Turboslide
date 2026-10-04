import { describe, expect, it } from 'vitest';

import { createAnswerScope } from './commit-answer';

describe('createAnswerScope', () => {
  it('answers acknowledged outside a chrome dispatch', () => {
    const scope = createAnswerScope();
    expect(scope.answer()).toBe('acknowledged');
  });

  it('answers admitted for a commit in the synchronous part of the dispatch, acknowledged after its first await', async () => {
    const scope = createAnswerScope();
    const read: string[] = [];
    const handler = async (): Promise<void> => {
      read.push(scope.answer());
      await Promise.resolve();
      read.push(scope.answer());
    };
    await scope.during(() => handler());
    expect(read).toEqual(['admitted', 'acknowledged']);
    expect(scope.answer()).toBe('acknowledged');
  });

  it('hands back what the run returns and leaves the scope when it throws', () => {
    const scope = createAnswerScope();
    expect(scope.during(() => 7)).toBe(7);
    expect(() =>
      scope.during(() => {
        throw new RangeError('refused');
      }),
    ).toThrow('refused');
    expect(scope.answer()).toBe('acknowledged');
  });

  it('keeps the admission answer through a nested dispatch and leaves it once both end', () => {
    const scope = createAnswerScope();
    const read: string[] = [];
    scope.during(() => {
      scope.during(() => read.push(scope.answer()));
      read.push(scope.answer());
    });
    read.push(scope.answer());
    expect(read).toEqual(['admitted', 'admitted', 'acknowledged']);
  });
});
