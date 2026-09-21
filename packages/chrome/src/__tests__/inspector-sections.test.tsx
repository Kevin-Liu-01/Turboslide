// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RowsBlock } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { WORKED_DECK } from '@turboslide/schema/fixtures';
import { snapPosition } from '@turboslide/schema/freeform';

import type { EditorDispatch } from '../dispatch';
import { Inspector, layoutForType } from '../Inspector';
import { blockControls } from '../inspector/generate';
import {
  SECTIONS,
  SECTIONS_STORAGE_KEY,
  controlIcon,
  readClosedSections,
  sectionOfBlockControl,
  sectionOfSlideControl,
  writeClosedSections,
} from '../inspector/sections';

// The inspector of the chrome round (Kevin, 2026-09-11): sections with an icon and a title
// each, the Text, Color and Position and size sections generated from the color, typography and
// position annotations (schema/color.ts, typography.ts, position.ts), the lint marks for the
// weight cap and an off-palette color, the block head with its rename field, and the folds
// remembered per browser.
const freeform: Slide = {
  schemaVersion: 1,
  id: 'free-demo',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 't',
        type: 'text',
        text: 'Hello',
        typography: { size: 22, weight: 600 },
        color: '#123456',
        pos: { x: 137, y: 129, w: 480, h: 64 },
      },
    ],
  },
};

const flow: Slide = {
  schemaVersion: 1,
  id: 'flow-demo',
  kind: 'content',
  layout: { type: 'cols', ratio: '5/7' },
  slots: {
    left: [{ id: 'h', type: 'heading', level: 'h2', text: 'Heading' }],
    right: [{ id: 'b', type: 'box', stroke: 'hair', padding: 16, text: 'A box.' }],
  },
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe('sections', () => {
  it('names every section with an icon and a sentence', () => {
    expect(SECTIONS.map((section) => section.id)).toEqual([
      'slide',
      'layout',
      'block',
      'text',
      'color',
      'position',
      'asset',
      'material',
      'dither',
      'lint',
      'versions',
      'history',
      'tokens',
    ]);
    for (const section of SECTIONS) {
      expect(section.icon).toBeTruthy();
      expect(section.doc.endsWith('.')).toBe(true);
    }
  });

  it('routes a text block’s controls to Text, Color and Position and size', () => {
    const block = freeform.slots.main?.[0];
    if (block === undefined) throw new Error('fixture');
    const controls = blockControls(block, { freeform: true }).controls;
    const byPath = new Map(controls.map((spec) => [spec.path, spec]));
    expect(byPath.get('/typography')?.kind).toBe('typography');
    expect(byPath.get('/color')?.kind).toBe('color');
    expect(byPath.get('/pos')?.kind).toBe('position');
    expect(sectionOfBlockControl(byPath.get('/text')!)).toBe('text');
    expect(sectionOfBlockControl(byPath.get('/typography')!)).toBe('text');
    expect(sectionOfBlockControl(byPath.get('/color')!)).toBe('color');
    expect(sectionOfBlockControl(byPath.get('/pos')!)).toBe('position');
    expect(controlIcon(byPath.get('/color')!)).toBe('swatch');
    expect(controlIcon(byPath.get('/pos')!)).toBe('move');
    /* off a freeform slide the position box is not offered */
    expect(blockControls(block).controls.some((spec) => spec.path === '/pos')).toBe(false);
  });

  it('keeps an array item’s text with its item under Block', () => {
    const rows: RowsBlock = {
      id: 'list',
      type: 'rows',
      key: 240,
      items: [{ key: 'Deck', value: 'One file per slide' }],
    };
    const controls = blockControls(rows).controls;
    const key = controls.find((spec) => spec.path === '/items/0/key');
    expect(key?.text).toBe(true);
    expect(sectionOfBlockControl(key!)).toBe('block');
  });

  it('routes a slide’s picture to Asset and its layout fields to Layout', () => {
    const asset = { group: 'Asset' } as Parameters<typeof sectionOfSlideControl>[0];
    const layout = { group: 'Layout' } as Parameters<typeof sectionOfSlideControl>[0];
    const notes = { group: 'Slide' } as Parameters<typeof sectionOfSlideControl>[0];
    expect(sectionOfSlideControl(asset)).toBe('asset');
    expect(sectionOfSlideControl(layout)).toBe('layout');
    expect(sectionOfSlideControl(notes)).toBe('slide');
  });

  it('reads and writes the folds, falling back to the defaults on a bad value', () => {
    expect([...readClosedSections(null)]).toEqual(['history', 'tokens']);
    expect([...readClosedSections('not json')]).toEqual(['history', 'tokens']);
    expect([...readClosedSections('{"lint":true,"nope":true,"slide":false}')]).toEqual(['lint']);
    expect(writeClosedSections(new Set(['lint', 'asset']))).toBe('{"lint":true,"asset":true}');
  });
});

describe('Inspector sections', () => {
  it('draws the sections with their icons and the block head with the type and the rename field', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={freeform}
        blockId="t"
        revision={7}
        dispatch={dispatch}
      />,
    );
    for (const id of ['slide', 'layout', 'block', 'text', 'color', 'position', 'asset', 'lint']) {
      const head = document.querySelector(`[data-section="${id}"] .ts-insp-head`);
      expect(head, id).not.toBeNull();
      expect(head?.querySelector('.ts-insp-head-icon svg'), id).not.toBeNull();
      expect(head?.getAttribute('data-tip'), id).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Block · Text box' })).toBeTruthy();
    expect(document.querySelector('.ts-insp-blocktype b')?.textContent).toBe('Text box');
    expect(screen.getByLabelText<HTMLInputElement>('t: Id').value).toBe('t');
    /* every control row carries its glyph and its tooltip */
    const rows = document.querySelectorAll('.ts-insp-row:not(.is-plain) .ts-insp-label-icon');
    expect(rows.length).toBeGreaterThan(3);
    expect(
      document.querySelector('.ts-insp-row .ts-insp-label')?.getAttribute('data-tip'),
    ).toBeTruthy();
  });

  it('generates the typography sub-controls and marks the weight over the cap', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={freeform}
        blockId="t"
        revision={7}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByLabelText('t: Size')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('t: Weight').value).toBe('600');
    expect(screen.getByLabelText('t: Align options')).toBeTruthy();
    expect(screen.getByLabelText('t: Tracking (em)')).toBeTruthy();
    /* Google's word since SPEC-2 0.20 (the typography label of B1's schema) */
    expect(screen.getByLabelText('t: Line spacing')).toBeTruthy();
    expect(document.querySelector('[data-rule="type/weight-cap"]')).not.toBeNull();
    /* stepping the weight writes the whole typography object in one block.set */
    fireEvent.click(screen.getByLabelText('t: Weight up'));
    expect(dispatch).toHaveBeenCalledWith('block.set', {
      slideId: 'free-demo',
      blockId: 't',
      path: '/typography',
      value: { size: 22, weight: 700 },
      baseRevision: 7,
    });
  });

  it('draws the palette swatches, the hex field and the off-palette mark, and writes a token on click', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={freeform}
        blockId="t"
        revision={7}
        dispatch={dispatch}
      />,
    );
    const swatches = document.querySelectorAll('[data-section="color"] .ts-ctl-swatch[data-token]');
    /* twelve tokens plus the brand kit's accent (docs/PRODUCT.md 4.1; schema color.ts) */
    expect(swatches).toHaveLength(13);
    expect(swatches[0]?.getAttribute('data-tip')).toBe('Ink');
    expect(swatches[11]?.getAttribute('data-tip')).toBe('GT blue');
    expect(swatches[12]?.getAttribute('data-tip')).toBe('Accent');
    expect(screen.getByLabelText<HTMLInputElement>('t: Color hex').value).toBe('#123456');
    expect(document.querySelector('[data-rule="color/off-palette"]')).not.toBeNull();
    expect(document.querySelector('.ts-ctl-contrast')?.textContent).toMatch(/:1$/);
    fireEvent.click(screen.getByLabelText('t: Color plate'));
    expect(dispatch).toHaveBeenCalledWith('block.set', {
      slideId: 'free-demo',
      blockId: 't',
      path: '/color',
      value: 'plate',
      baseRevision: 7,
    });
    /* the hidden native mirror takes the window API's value */
    fireEvent.change(screen.getByLabelText('t: Color'), { target: { value: 'ink-2' } });
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'free-demo',
      blockId: 't',
      path: '/color',
      value: 'ink-2',
      baseRevision: 7,
    });
  });

  it('steps the position box by the grid and snaps the whole box in one block.set', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={freeform}
        blockId="t"
        revision={7}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByLabelText<HTMLInputElement>('t: Position X').value).toBe('137');
    fireEvent.click(screen.getByLabelText('t: Position X up'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [action, input] = dispatch.mock.calls[0] as [string, { path: string; value: unknown }];
    expect(action).toBe('block.set');
    expect(input.path).toBe('/pos');
    /* x moves by the grid to 145 and snaps to 144; the right edge at 625 takes the 4/8 column
       seam at 627 within the snap distance, so the width follows (freeform.ts snapPosition) */
    expect(input.value).toEqual(snapPosition({ x: 145, y: 129, w: 480, h: 64 }));
    expect((input.value as { x: number }).x).toBe(144);
  });

  it('renames a block through one slide.update carrying block.remove and block.insert', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const onSelectBlock = vi.fn();
    render(
      <Inspector
        deck={WORKED_DECK}
        slide={flow}
        blockId="b"
        revision={7}
        dispatch={dispatch}
        onSelectBlock={onSelectBlock}
      />,
    );
    const field = screen.getByLabelText('b: Id');
    fireEvent.change(field, { target: { value: 'callout' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith('slide.update', {
      slideId: 'flow-demo',
      baseRevision: 7,
      mutations: [
        { op: 'block.remove', slideId: 'flow-demo', blockId: 'b' },
        {
          op: 'block.insert',
          slideId: 'flow-demo',
          slot: 'right',
          block: { id: 'callout', type: 'box', stroke: 'hair', padding: 16, text: 'A box.' },
        },
      ],
    });
  });

  it('turns a layout type change into slide.setLayout', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(<Inspector deck={WORKED_DECK} slide={flow} revision={7} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText('slide: Type'), { target: { value: 'freeform' } });
    expect(dispatch).toHaveBeenCalledWith('slide.setLayout', {
      slideId: 'flow-demo',
      layout: { type: 'freeform' },
      baseRevision: 7,
    });
    expect(layoutForType('cols')).toEqual({ type: 'cols', ratio: '5/7' });
  });

  it('remembers a collapsed section in the browser', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(<Inspector deck={WORKED_DECK} slide={flow} revision={7} dispatch={dispatch} />);
    const lint = document.querySelector<HTMLElement>('[data-control="inspector.lint"]');
    if (!lint) throw new Error('no lint head');
    expect(lint.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(lint);
    expect(lint.getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem(SECTIONS_STORAGE_KEY)).toBe(
      writeClosedSections(new Set(['history', 'tokens', 'lint'])),
    );
  });
});
