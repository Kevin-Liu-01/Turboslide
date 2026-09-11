import { describe, expect, it, vi } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { CONTENT_RULE } from '@turboslide/schema/fixtures';
import { validateSlide } from '@turboslide/schema/validate';

import type { EditorDispatch } from '../dispatch';
import { applySourceText, diffSlides, slidePutCommand, slideSource } from '../source/apply';

// The source drawer's Apply path (SPEC 6.6): one slide.replace through the dispatcher with the
// current baseRevision, issues at their pointers otherwise, and the mutation log of the change.
function normalized(slide: Slide): Slide {
  const validation = validateSlide(slide);
  if (validation.slide === null) throw new Error('the fixture does not validate');
  return validation.slide;
}

const before = normalized(CONTENT_RULE);

/** The worked slide with the plain list at 22 px. */
function edited(): Slide {
  const next = JSON.parse(JSON.stringify(before)) as Slide;
  if (next.kind !== 'content') throw new Error('content slide expected');
  const list = next.slots.right?.[0];
  if (list?.type !== 'plain') throw new Error('plain list expected');
  list.size = 22;
  return next;
}

/** A dispatcher that answers slide.replace the way the store does: the normalized slide, revision plus one. */
function fakeDispatch(): { dispatch: EditorDispatch; calls: { action: string; input: unknown }[] } {
  const calls: { action: string; input: unknown }[] = [];
  const dispatch: EditorDispatch = async (action, input) => {
    calls.push({ action, input });
    const { slide, baseRevision } = input as { slide: Slide; baseRevision: number };
    return { slide: normalized(slide), revision: baseRevision + 1, findings: [] };
  };
  return { dispatch, calls };
}

describe('applySourceText', () => {
  it('dispatches one slide.replace with the baseRevision and returns the mutation log', async () => {
    const { dispatch, calls } = fakeDispatch();
    const result = await applySourceText({
      source: slideSource(edited()),
      slideId: 'content-rule',
      before,
      revision: 412,
      dispatch,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.action).toBe('slide.replace');
    expect((calls[0]?.input as { baseRevision: number }).baseRevision).toBe(412);
    expect((calls[0]?.input as { slideId: string }).slideId).toBe('content-rule');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revision).toBe(413);
    expect(result.mutations).toEqual([
      { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 22 },
    ]);
    expect(result.log).toEqual(['slide content-rule: block list /size changed']);
  });

  it('produces the same log for the string and the object form of the same edit', async () => {
    const asText = await applySourceText({
      source: slideSource(edited()),
      slideId: 'content-rule',
      before,
      revision: 412,
      dispatch: fakeDispatch().dispatch,
    });
    const asObject = await applySourceText({
      source: edited(),
      slideId: 'content-rule',
      before,
      revision: 412,
      dispatch: fakeDispatch().dispatch,
    });
    expect(asText.ok && asObject.ok).toBe(true);
    if (asText.ok && asObject.ok) expect(asText.log).toEqual(asObject.log);
  });

  it('reports a syntax error at the root pointer and dispatches nothing', async () => {
    const dispatch = vi.fn<EditorDispatch>();
    const result = await applySourceText({
      source: '{ "kind": ',
      slideId: 'content-rule',
      before,
      revision: 412,
      dispatch,
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.pointer).toBe('');
    expect(result.issues[0]?.message).toMatch(/Invalid JSON/);
  });

  it('reports validation issues with their pointers', async () => {
    const dispatch = vi.fn<EditorDispatch>();
    const broken = { ...edited(), layout: { type: 'cols', ratio: '9/9' } };
    const result = await applySourceText({
      source: JSON.stringify(broken),
      slideId: 'content-rule',
      before,
      revision: 412,
      dispatch,
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => issue.severity === 3)).toBe(true);
    expect(result.issues.some((issue) => issue.pointer.startsWith('/layout'))).toBe(true);
  });

  it('refuses a document whose id is not the drawer slide', async () => {
    const dispatch = vi.fn<EditorDispatch>();
    const result = await applySourceText({
      source: { ...edited(), id: 'another' },
      slideId: 'content-rule',
      before,
      revision: 412,
      dispatch,
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.pointer).toBe('/id');
  });
});

describe('diffSlides and slidePutCommand', () => {
  it('describes an unchanged slide as no mutations', () => {
    expect(diffSlides(before, before)).toEqual([]);
  });

  it('writes one pasteable command carrying the JSON', () => {
    const command = slidePutCommand('gt-brand', 'content-rule', 412, '{"a":1}');
    expect(command).toBe(
      'turboslide slide put content-rule --deck decks/gt-brand --base-revision 412 <<\'JSON\'\n{"a":1}\nJSON\n',
    );
  });
});
