// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { CONTENT_RULE } from '@turboslide/schema/fixtures';
import { validateSlide } from '@turboslide/schema/validate';

import type { EditorDispatch } from '../dispatch';
import { SourceDrawer } from '../SourceDrawer';
import type { SourceEditorOptions } from '../source/editor';

// The source drawer's Apply path (SPEC 6.6) with the CodeMirror editor replaced by a fake: the
// drawer commits one slide.replace through the dispatcher, lists the mutation log, marks the
// issues, and keeps a dirty draft when the slide moves under it.
const fake = vi.hoisted(() => ({
  text: '',
  onChange: (_text: string): void => undefined,
  issues: [] as unknown[],
}));

vi.mock('../source/editor', () => ({
  createSourceEditor: (_parent: HTMLElement, options: SourceEditorOptions) => {
    fake.text = options.text;
    fake.onChange = options.onChange;
    return {
      getText: () => fake.text,
      setText: (text: string) => {
        fake.text = text;
      },
      setIssues: (issues: unknown[]) => {
        fake.issues = [...issues];
      },
      setReadOnly: () => undefined,
      focus: () => undefined,
      destroy: () => undefined,
    };
  },
}));

function normalized(slide: Slide): Slide {
  const validation = validateSlide(slide);
  if (validation.slide === null) throw new Error('the fixture does not validate');
  return validation.slide;
}

const before = normalized(CONTENT_RULE);

function edited(): Slide {
  const next = JSON.parse(JSON.stringify(before)) as Slide;
  if (next.kind !== 'content') throw new Error('content slide expected');
  const list = next.slots.right?.[0];
  if (list?.type !== 'plain') throw new Error('plain list expected');
  list.size = 22;
  return next;
}

function typeInEditor(text: string) {
  act(() => {
    fake.text = text;
    fake.onChange(text);
  });
}

afterEach(cleanup);

describe('SourceDrawer', () => {
  it('applies the draft as one slide.replace and lists the mutation log', async () => {
    const calls: { action: string; input: unknown }[] = [];
    const dispatch: EditorDispatch = async (action, input) => {
      calls.push({ action, input });
      const { slide } = input as { slide: Slide };
      return { slide: normalized(slide), revision: 413, findings: [] };
    };
    const view = render(
      <SourceDrawer
        open
        slide={before}
        revision={412}
        dispatch={dispatch}
        onClose={() => undefined}
        deckId="gt-brand"
      />,
    );
    expect(fake.text).toBe(`${JSON.stringify(before, null, 2)}\n`);
    typeInEditor(JSON.stringify(edited(), null, 2));
    expect(screen.getByText('edited')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Apply source'));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.action).toBe('slide.replace');
    expect((calls[0]?.input as { baseRevision: number }).baseRevision).toBe(412);
    await waitFor(() =>
      expect(screen.getByText('slide content-rule: block list /size changed')).toBeTruthy(),
    );
    expect(screen.queryByText('edited')).toBeNull();
    /* the revision shown follows the document the editor passes after the write */
    expect(screen.getByText('r412')).toBeTruthy();
    view.rerender(
      <SourceDrawer
        open
        slide={edited()}
        revision={413}
        dispatch={dispatch}
        onClose={() => undefined}
        deckId="gt-brand"
      />,
    );
    expect(screen.getByText('r413')).toBeTruthy();
    expect(screen.queryByText(/changed this slide/)).toBeNull();
  });

  it('marks issues and dispatches nothing for text that does not validate', async () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <SourceDrawer
        open
        slide={before}
        revision={412}
        dispatch={dispatch}
        onClose={() => undefined}
        deckId="gt-brand"
      />,
    );
    typeInEditor('{ "id": "content-rule", ');
    fireEvent.click(screen.getByLabelText('Apply source'));
    await waitFor(() => expect(screen.getByText('Issues')).toBeTruthy());
    expect(dispatch).not.toHaveBeenCalled();
    expect(fake.issues).toHaveLength(1);
    expect(screen.getByText(/Invalid JSON/)).toBeTruthy();
  });

  it('keeps a dirty draft and shows the banner when the slide moves, and reloads on request', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const view = render(
      <SourceDrawer
        open
        slide={before}
        revision={412}
        dispatch={dispatch}
        onClose={() => undefined}
        deckId="gt-brand"
      />,
    );
    const draft = JSON.stringify({ ...before, notes: 'mine' }, null, 2);
    typeInEditor(draft);
    const theirs = normalized({ ...before, notes: 'theirs' });
    view.rerender(
      <SourceDrawer
        open
        slide={theirs}
        revision={413}
        dispatch={dispatch}
        onClose={() => undefined}
        deckId="gt-brand"
        external={{ revision: 413, author: 'agent:run-7' }}
      />,
    );
    expect(fake.text).toBe(draft);
    expect(screen.getByText(/agent:run-7 changed this slide at r413/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Reload the source'));
    expect(fake.text).toBe(`${JSON.stringify(theirs, null, 2)}\n`);
    expect(screen.queryByText(/changed this slide/)).toBeNull();
  });

  it('follows the document while the draft is clean', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const view = render(
      <SourceDrawer
        open
        slide={before}
        revision={412}
        dispatch={dispatch}
        onClose={() => undefined}
        deckId="gt-brand"
      />,
    );
    const theirs = normalized({ ...before, notes: 'theirs' });
    view.rerender(
      <SourceDrawer
        open
        slide={theirs}
        revision={413}
        dispatch={dispatch}
        onClose={() => undefined}
        deckId="gt-brand"
      />,
    );
    expect(fake.text).toBe(`${JSON.stringify(theirs, null, 2)}\n`);
    expect(screen.queryByText(/changed this slide/)).toBeNull();
  });

  it('registers itself as a delegating owner whose applySource is the Apply path', async () => {
    const calls: string[] = [];
    const dispatch: EditorDispatch = async (action, input) => {
      calls.push(action);
      const { slide } = input as { slide: Slide };
      return { slide: normalized(slide), revision: 413, findings: [] };
    };
    type Owner = {
      getSource: () => string;
      applySource: (source: string | object) => Promise<void>;
    };
    const registerOwner = vi.fn((_owner: HTMLElement, _api: Owner) => () => undefined);
    render(
      <SourceDrawer
        open
        slide={before}
        revision={412}
        dispatch={dispatch}
        onClose={() => undefined}
        deckId="gt-brand"
        registerOwner={registerOwner}
      />,
    );
    expect(registerOwner).toHaveBeenCalledTimes(1);
    const owner = registerOwner.mock.calls[0]?.[1];
    if (owner === undefined) throw new Error('the drawer did not register');
    expect(owner.getSource()).toBe(`${JSON.stringify(before, null, 2)}\n`);
    await act(() => owner.applySource(edited()));
    expect(calls).toEqual(['slide.replace']);
    await waitFor(() =>
      expect(screen.getByText('slide content-rule: block list /size changed')).toBeTruthy(),
    );
  });

  it('rejects an owner applySource the drawer refuses and dispatches nothing', async () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    type Owner = { slideId: string; applySource: (source: string | object) => Promise<void> };
    const registerOwner = vi.fn((_owner: HTMLElement, _api: Owner) => () => undefined);
    render(
      <SourceDrawer
        open
        slide={before}
        revision={412}
        dispatch={dispatch}
        onClose={() => undefined}
        deckId="gt-brand"
        registerOwner={registerOwner}
      />,
    );
    const owner = registerOwner.mock.calls[0]?.[1];
    if (owner === undefined) throw new Error('the drawer did not register');
    expect(owner.slideId).toBe('content-rule');
    /* a valid slide with another id: the drawer replaces content-rule only, so the call rejects
       instead of resolving with nothing written */
    const outcome = owner.applySource({ ...before, id: 'other' }).then(
      () => 'resolved',
      (error: unknown) => (error instanceof TypeError ? error.message : String(error)),
    );
    await act(async () => {
      await outcome;
    });
    expect(await outcome).toMatch(/^\/id: The drawer replaces slide "content-rule"/);
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByText('Issues')).toBeTruthy();
  });
});
