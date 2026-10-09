// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RowsBlock } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { LIQUID_METAL_DIAMOND, WORKED_DECK } from '@turboslide/schema/fixtures';
import { snapPosition } from '@turboslide/schema/freeform';

import type { EditorDispatch } from '../dispatch';
import { Inspector, layoutForType } from '../Inspector';
import { DitherSection } from '../inspector/dither';
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
import { chooseOption } from './choose-option';

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
    /* an optional short field is the dropdown with its None row (docs/DROPDOWNS.md 4.1) */
    expect(screen.getByLabelText('t: Align').getAttribute('role')).toBe('combobox');
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

  it('clears the typography Align and Columns through their None row, as set() does', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const slide: Slide = {
      ...freeform,
      slots: {
        main: [
          {
            id: 't',
            type: 'text',
            text: 'Hello',
            typography: { size: 22, align: 'center', columns: 2 },
            pos: { x: 137, y: 129, w: 480, h: 64 },
          },
        ],
      },
    };
    render(
      <Inspector deck={WORKED_DECK} slide={slide} blockId="t" revision={7} dispatch={dispatch} />,
    );
    const set = (labelText: string, value: string) => {
      /* the window API's set() on a dropdown (controls.ts setCombobox): a click on the row whose
         data-value is the value, in the listbox the trigger's aria-controls names */
      const trigger = screen.getByLabelText(labelText);
      const list = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
      const row = list?.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`);
      expect(row, `${labelText} ${value}`).toBeTruthy();
      row?.click();
    };
    expect(screen.getByLabelText('t: Align').getAttribute('value')).toBe('center');
    expect(screen.getByLabelText('t: Columns').getAttribute('value')).toBe('2');
    set('t: Align', '');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'free-demo',
      blockId: 't',
      path: '/typography',
      value: { size: 22, columns: 2 },
      baseRevision: 7,
    });
    /* a person's choice of None on Columns writes the same way */
    chooseOption('block.t.typography.columns', { label: 'None' });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'free-demo',
      blockId: 't',
      path: '/typography',
      value: { size: 22, align: 'center' },
      baseRevision: 7,
    });
    /* a value still sets: Justify through the same row click */
    set('t: Align', 'justify');
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'free-demo',
      blockId: 't',
      path: '/typography',
      value: { size: 22, align: 'justify', columns: 2 },
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
    /* twelve tokens plus the brand kit's accent (docs/archive/rounds/PRODUCT.md 4.1; schema color.ts) */
    expect(swatches).toHaveLength(13);
    expect(swatches[0]?.getAttribute('data-tip')).toBe('Ink');
    expect(swatches[11]?.getAttribute('data-tip')).toBe('Primary');
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
    /* the swatch group is the field the window API sets (docs/DROPDOWNS.md 4.3): named with the
       label, its id on the group and `<id>.<token>` on each swatch, so set() by label or by id
       clicks the swatch; no native mirror is left */
    const field = screen.getByLabelText('t: Color');
    expect(field.getAttribute('role')).toBe('group');
    expect(field.getAttribute('data-control')).toBe('block.t.color');
    expect(document.querySelector('[data-section="color"] select')).toBeNull();
    const writes = dispatch.mock.calls.length;
    field.querySelector<HTMLElement>('[data-control="block.t.color.ink-2"]')?.click();
    expect(dispatch).toHaveBeenCalledTimes(writes + 1);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'free-demo',
      blockId: 't',
      path: '/color',
      value: 'ink-2',
      baseRevision: 7,
    });
    /* a complete six digit hex commits as it is typed, so set() on `<id>.hex` writes once */
    fireEvent.change(screen.getByLabelText('t: Color hex'), { target: { value: '#abcdef' } });
    expect(dispatch).toHaveBeenCalledTimes(writes + 2);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'free-demo',
      blockId: 't',
      path: '/color',
      value: '#abcdef',
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
    chooseOption('slide.layout.type', 'freeform');
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

/**
 * The group a field is set through since its native mirror left (docs/DROPDOWNS.md 4): the
 * window API's group path finds `[role="group"]` by its label or by its data-control (or an
 * option's id less the value) and clicks the option whose id ends in the value. Each case pins
 * that shape and that the click writes once.
 */
function fieldGroup(label: string, id: string): HTMLElement {
  const group = screen.getByLabelText(label);
  expect(group.getAttribute('role')).toBe('group');
  const option = group.querySelector(`[data-control^="${id}."]`);
  expect(option, `${label} has an option ${id}.<value>`).not.toBeNull();
  return group;
}

function optionOf(group: HTMLElement, id: string): HTMLElement {
  const option = group.querySelector<HTMLElement>(`[data-control="${id}"]`);
  if (option === null) throw new Error(`no option ${id}`);
  return option;
}

describe('the fields set without a native mirror', () => {
  const rows: Slide = {
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
          items: [
            { key: 'Deck', icon: { name: 'check-circle', color: 'ok' }, value: 'One file' },
            { key: 'CLI', value: 'turboslide render all' },
          ],
        } satisfies RowsBlock,
      ],
    },
  };

  it('sets a Seg field through its group: the label and the id name the Seg itself', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector deck={WORKED_DECK} slide={rows} blockId="h" revision={7} dispatch={dispatch} />,
    );
    const group = fieldGroup('h: Level', 'block.h.level');
    expect(document.querySelector('[data-section] select')).toBeNull();
    expect(optionOf(group, 'block.h.level.h2').getAttribute('aria-pressed')).toBe('true');
    optionOf(group, 'block.h.level.h1').click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('block.set', {
      slideId: 'rows-demo',
      blockId: 'h',
      path: '/level',
      value: 'h1',
      baseRevision: 7,
    });
  });

  it('sets an icon through the picker tiles, mounted and hidden while the card is closed', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector deck={WORKED_DECK} slide={rows} blockId="list" revision={7} dispatch={dispatch} />,
    );
    const group = fieldGroup('list: Icon 1', 'block.list.items.0.icon');
    expect(group.getAttribute('data-control')).toBe('block.list.items.0.icon');
    const tile = optionOf(group, 'block.list.items.0.icon.x-circle');
    expect(tile.closest('[hidden]')).not.toBeNull();
    expect(optionOf(group, 'block.list.items.0.icon.check-circle').classList).toContain('is-on');
    tile.click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'rows-demo',
      blockId: 'list',
      path: '/items/0/icon',
      value: { name: 'x-circle', color: 'ok' },
      baseRevision: 7,
    });
    /* the optional field's None tile removes the icon */
    optionOf(group, 'block.list.items.0.icon.none').click();
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'rows-demo',
      blockId: 'list',
      path: '/items/0/icon',
      baseRevision: 7,
    });
    /* the open card draws the same tiles and the None tile, the hidden grid gone */
    fireEvent.click(screen.getByLabelText('list: Icon 1 picker'));
    expect(
      document.querySelectorAll('[data-control="block.list.items.0.icon.x-circle"]'),
    ).toHaveLength(1);
    expect(optionOf(group, 'block.list.items.0.icon.x-circle').closest('[hidden]')).toBeNull();
    expect(optionOf(group, 'block.list.items.0.icon.none').getAttribute('data-tip')).toBe('None');
  });

  it('sets the dither plate through its Seg, None included', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const id = LIQUID_METAL_DIAMOND.id;
    render(<DitherSection asset={LIQUID_METAL_DIAMOND} revision={13} dispatch={dispatch} />);
    const group = fieldGroup(`${id}: Plate`, `asset.${id}.plate`);
    expect(document.querySelector('select')).toBeNull();
    fireEvent.click(optionOf(group, `asset.${id}.plate.none`));
    expect(optionOf(group, `asset.${id}.plate.none`).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(optionOf(group, `asset.${id}.plate.upper-left`));
    expect(optionOf(group, `asset.${id}.plate.upper-left`).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
