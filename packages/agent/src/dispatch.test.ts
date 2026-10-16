import { NotImplementedError } from '@turboslide/schema/errors';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
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

  // the wave 3b verify's finding 2 (RELIABILITY-19): a deck a newer minor wrote keeps that minor's
  // fields in its files, so the answer of an action over it carries them; the check keeps them in
  // place instead of answering 500 after the store committed the write
  it("keeps a newer minor's fields in a deck action's answer, and every other fault stands", async () => {
    const dispatcher = createDispatcher();
    const sections = structuredClone(WORKED_DECK.sections).map((section, index) =>
      index === 0 ? { ...section, futureSection: 'kept' } : section,
    );
    dispatcher.register('slide.move', () => ({ sections, revision: 413 }));
    const moved = await dispatcher.dispatch(
      'slide.move',
      { slideId: 'content-rule', sectionId: 'brand', baseRevision: 412 },
      context,
    );
    expect(moved).toEqual({ sections, revision: 413 });
    expect(Object.keys((moved as { sections: object[] }).sections[0] ?? {})).toEqual(
      Object.keys(sections[0] ?? {}),
    );
    const plain = WORKED_SLIDES.find((slide) => slide.id === 'content-rule');
    if (plain === undefined) throw new Error('fixture');
    const slide = structuredClone(plain) as unknown as {
      slots: { left: Record<string, unknown>[] };
    } & Record<string, unknown>;
    slide.schemaMinor = 2;
    slide.slots.left[0] = { ...slide.slots.left[0], futureShadow: 'soft' };
    dispatcher.register('block.set', () => ({ slide, revision: 414, findings: [] }));
    const set = await dispatcher.dispatch(
      'block.set',
      { slideId: 'content-rule', blockId: 'p1', path: '/text', value: 'x', baseRevision: 413 },
      context,
    );
    expect((set as { slide: typeof slide }).slide.slots.left[0]).toMatchObject({
      futureShadow: 'soft',
    });
    // a fault that is not an unknown field is refused as before
    dispatcher.register('slide.move', () => ({ sections, revision: 'four' }));
    await expect(
      dispatcher.dispatch(
        'slide.move',
        { slideId: 'content-rule', sectionId: 'brand', baseRevision: 412 },
        context,
      ),
    ).rejects.toThrow(/invalid result/);
    // an answer about people and access holds no document, so a field it should not carry is refused
    dispatcher.register('account.tokens.list', () => ({ tokens: [], secret: 'x' }));
    await expect(dispatcher.dispatch('account.tokens.list', {}, context)).rejects.toThrow(
      /invalid result/,
    );
  });
});
