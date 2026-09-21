// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { FormatOptions } from '../FormatOptions';
import { hideTooltip } from '../Tooltip';

// The caption field of a shot in Image options (docs/PRODUCT.md section 2 rank 10): the prompt
// as its placeholder, one block.set /caption for Enter followed by the blur it causes, the caption
// removed when the field is emptied. The section list for a picture: no text section.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const base = workedDocument();
const assetId = Object.keys(base.deck.assets)[0] ?? 'a';
const canvas: Slide = {
  schemaVersion: 1,
  id: 'cv',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 'shot',
        type: 'shot',
        asset: assetId,
        pos: { x: 100, y: 100, w: 480, h: 300, z: 0 },
      } as Block,
      {
        id: 'cap',
        type: 'shot',
        asset: assetId,
        caption: 'Team photo',
        pos: { x: 700, y: 100, w: 480, h: 300, z: 1 },
      } as Block,
    ],
  },
};
const dispatch = vi.fn(() => Promise.resolve({}));

function panel(blockId: string) {
  return render(
    <FormatOptions
      deck={base.deck}
      slide={canvas}
      blockId={blockId}
      selection={{ blockId }}
      revision={7}
      dispatch={dispatch}
      onClose={() => undefined}
    />,
  );
}

function control(id: string): HTMLElement {
  const el = document.querySelector(`[data-control="${id}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`no control ${id}`);
  return el;
}

describe('the caption field', () => {
  it('prompts Add a caption and writes the caption once for Enter and the blur it causes', () => {
    dispatch.mockClear();
    panel('shot');
    const field = control('formatOptions.picture.caption') as HTMLInputElement;
    expect(field.placeholder).toBe('Add a caption');
    expect(field.value).toBe('');
    fireEvent.change(field, { target: { value: 'Team photo, Q3' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'shot',
      path: '/caption',
      value: 'Team photo, Q3',
      baseRevision: 7,
    });
  });

  it('shows the stored caption and removes it when the field is emptied', () => {
    dispatch.mockClear();
    panel('cap');
    const field = control('formatOptions.picture.caption') as HTMLInputElement;
    expect(field.value).toBe('Team photo');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'cap',
      path: '/caption',
      baseRevision: 7,
    });
  });

  it('lists Image options and no text section for a picture', () => {
    panel('shot');
    const sections = [...document.querySelectorAll('[data-section]')].map((el) =>
      el.getAttribute('data-section'),
    );
    expect(sections).toContain('picture');
    expect(sections).not.toContain('text');
    expect(sections).not.toContain('textFitting');
    expect(
      document.querySelector('[data-section="picture"] .ts-panel-section-head span')?.textContent,
    ).toBe('Image options');
  });
});
