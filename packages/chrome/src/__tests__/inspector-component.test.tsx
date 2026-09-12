// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { inspectorsOf } from '@turboslide/schema/annotate';
import { rowItemSchema, rowsBlockSchema } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { WORKED_DECK } from '@turboslide/schema/fixtures';
import { validateSlide } from '@turboslide/schema/validate';

import type { EditorDispatch } from '../dispatch';
import { Inspector } from '../Inspector';

// The inspector generated from the Zod annotations (SPEC 6.5): every annotated field of a rows
// block gets a labelled control, and a change is one block.set (or one slide.update carrying one
// slide.set) through the dispatcher with the revision as baseRevision (SPEC 7.1).
const raw: Slide = {
  schemaVersion: 1,
  id: 'rows-demo',
  kind: 'content',
  layout: { type: 'cols', ratio: '5/7' },
  slots: {
    left: [{ id: 'h', type: 'heading', level: 'h2', text: 'What ships' }],
    right: [
      {
        id: 'list',
        type: 'rows',
        key: 240,
        tight: true,
        items: [
          {
            key: 'Deck',
            icon: { name: 'check-circle', color: 'ok' },
            value: 'One JSON file per slide',
            ext: true,
          },
          { key: 'CLI', value: 'turboslide render all' },
        ],
      },
    ],
  },
};

function slide(): Slide {
  const validation = validateSlide(raw);
  if (validation.slide === null) throw new Error('the fixture does not validate');
  return validation.slide;
}

afterEach(cleanup);

describe('Inspector', () => {
  it('gives every annotated field of the selected rows block a control with its label', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={slide()}
        blockId="list"
        revision={5}
        dispatch={dispatch}
      />,
    );
    /* the position box (pos) is offered on a freeform slide only */
    const fields = Object.keys(inspectorsOf(rowsBlockSchema)).filter(
      (key) => key !== 'id' && key !== 'pos',
    );
    for (const key of fields) {
      const label = inspectorsOf(rowsBlockSchema)[key]?.label ?? key;
      expect(screen.getByLabelText(`list: ${label}`)).toBeTruthy();
    }
    for (const index of [1, 2]) {
      for (const key of Object.keys(inspectorsOf(rowItemSchema))) {
        const label = inspectorsOf(rowItemSchema)[key]?.label ?? key;
        expect(screen.getByLabelText(`list: ${label} ${index}`)).toBeTruthy();
      }
      expect(screen.getByLabelText(`list: Icon ${index}`)).toBeTruthy();
    }
    /* the data-control ids the window API matches */
    expect(screen.getByLabelText('list: Key width').getAttribute('data-control')).toBe(
      'block.list.key',
    );
    expect(screen.getByLabelText('list: Key 1').getAttribute('data-control')).toBe(
      'block.list.items.0.key',
    );
  });

  it('turns a stepper change (the key width set) into one block.set with the baseRevision', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={slide()}
        blockId="list"
        revision={5}
        dispatch={dispatch}
      />,
    );
    fireEvent.change(screen.getByLabelText('list: Key width'), { target: { value: '180' } });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('block.set', {
      slideId: 'rows-demo',
      blockId: 'list',
      path: '/key',
      value: 180,
      baseRevision: 5,
    });
  });

  it('removes an optional boolean on uncheck instead of writing false', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={slide()}
        blockId="list"
        revision={5}
        dispatch={dispatch}
      />,
    );
    const tight = screen.getByLabelText('list: Tight');
    expect((tight as HTMLInputElement).checked).toBe(true);
    fireEvent.click(tight);
    expect(dispatch).toHaveBeenCalledWith('block.set', {
      slideId: 'rows-demo',
      blockId: 'list',
      path: '/tight',
      baseRevision: 5,
    });
  });

  it('writes a Text item field on blur through the same path', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={slide()}
        blockId="list"
        revision={5}
        dispatch={dispatch}
      />,
    );
    const value = screen.getByLabelText('list: Value 2');
    fireEvent.change(value, { target: { value: 'turboslide render all --theme light,dark' } });
    fireEvent.blur(value);
    expect(dispatch).toHaveBeenCalledWith('block.set', {
      slideId: 'rows-demo',
      blockId: 'list',
      path: '/items/1/value',
      value: 'turboslide render all --theme light,dark',
      baseRevision: 5,
    });
  });

  it('turns a slide field into one slide.update carrying one slide.set', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(<Inspector deck={WORKED_DECK} slide={slide()} revision={5} dispatch={dispatch} />);
    const notes = screen.getByLabelText('slide: Notes');
    fireEvent.change(notes, { target: { value: 'Say the numbers slowly.' } });
    fireEvent.blur(notes);
    expect(dispatch).toHaveBeenCalledWith('slide.update', {
      slideId: 'rows-demo',
      baseRevision: 5,
      mutations: [
        { op: 'slide.set', slideId: 'rows-demo', path: '/notes', value: 'Say the numbers slowly.' },
      ],
    });
    /* the layout branch and its discriminator are generated too */
    expect(screen.getByLabelText('slide: Type').getAttribute('data-control')).toBe(
      'slide.layout.type',
    );
    expect(screen.getByLabelText('slide: Ratio')).toBeTruthy();
  });

  it('lists the blocks when none is selected and selects one on click', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const onSelectBlock = vi.fn();
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={slide()}
        revision={5}
        dispatch={dispatch}
        onSelectBlock={onSelectBlock}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select rows list' }));
    expect(onSelectBlock).toHaveBeenCalledWith('list');
  });

  it('applies a finding fix through slide.update with the finding mutations', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={slide()}
        blockId="list"
        revision={5}
        dispatch={dispatch}
        findings={[
          {
            id: 'rows/key-snap|rows-demo|list|/key|',
            rule: 'rows/key-snap',
            severity: 1,
            kind: 'polish',
            slideId: 'rows-demo',
            blockId: 'list',
            path: '/key',
            evidence: {},
            proposal: 'Snap the key width to 240',
            fix: [
              { op: 'block.set', slideId: 'rows-demo', blockId: 'list', path: '/key', value: 240 },
            ],
            source: 'lint',
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Fix rows/key-snap on list'));
    expect(dispatch).toHaveBeenCalledWith('slide.update', {
      slideId: 'rows-demo',
      baseRevision: 5,
      mutations: [
        { op: 'block.set', slideId: 'rows-demo', blockId: 'list', path: '/key', value: 240 },
      ],
    });
  });
});
