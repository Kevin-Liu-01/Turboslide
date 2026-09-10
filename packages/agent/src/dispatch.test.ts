import { NotImplementedError } from '@turboslide/schema/errors';
import { describe, expect, it } from 'vitest';
import { createDispatcher } from './dispatch.ts';

const context = { author: { kind: 'agent' as const, name: 'agent', runId: 'test' } };

describe('the dispatcher', () => {
  it('rejects an unknown action with RangeError and malformed input with TypeError', async () => {
    const dispatcher = createDispatcher();
    await expect(dispatcher.dispatch('deck.explode', {}, context)).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(
      dispatcher.dispatch('slide.get', { slideId: 'Not A Slug' }, context),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      dispatcher.dispatch('slide.get', { slideId: 'ok', extra: 1 }, context),
    ).rejects.toThrow(/extra/);
  });

  it('answers NotImplementedError for a declared action with no handler', async () => {
    const dispatcher = createDispatcher();
    const error = await dispatcher
      .dispatch('export.run', { format: 'pptx' }, context)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotImplementedError);
    expect((error as NotImplementedError).milestone).toBe('M2');
    expect(dispatcher.implemented()).toEqual([]);
  });

  it('runs a registered handler and validates its output', async () => {
    const dispatcher = createDispatcher();
    dispatcher.register('version.list', () => []);
    expect(await dispatcher.dispatch('version.list', {}, context)).toEqual([]);
    dispatcher.register('slide.list', () => [
      {
        id: 'thesis',
        n: 1,
        section: 'brand',
        title: 'Thesis',
        kind: 'statement',
        lint: { s3: 0, s2: 0 },
      },
    ]);
    expect(await dispatcher.dispatch('slide.list', {}, context)).toHaveLength(1);
    dispatcher.register('deck.info', () => ({ wrong: true }));
    await expect(dispatcher.dispatch('deck.info', {}, context)).rejects.toThrow(/invalid result/);
    expect(dispatcher.implemented()).toEqual(['deck.info', 'slide.list', 'version.list']);
  });
});
