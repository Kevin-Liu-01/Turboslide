// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import type { EditorDispatch } from '../dispatch';
import { InsertMenu } from '../InsertMenu';
import { hideTooltip } from '../Tooltip';
import type { PaletteContext } from '../palette-data';
import {
  PRIMITIVE_ORDER,
  buildPaletteEntries,
  defaultPosition,
  insertLabel,
} from '../palette-data';

// The primitives palette (Kevin, 2026-09-11: "reuse primitives and icons like boxes and
// shapes"): the Insert group of palette-data.ts leads with Box, the five shapes, Rule, Text,
// Icon, Image and Material, the Insert menu draws the same entries in three groups, and an entry
// runs as one block.insert through the dispatcher.
const document = workedDocument();
const noop = () => undefined;

/**
 * The palette context with Tools > Advanced tools on: the primitives palette lists every block
 * only behind the switch (docs/FOCUS.md 3.1; the default view keeps the entries whose menu row is
 * core, asserted in its own test below).
 */
function context(slideId: string, slides = document.slides): PaletteContext {
  return {
    deck: document.deck,
    slides,
    slideId,
    revision: 412,
    versions: [],
    advancedTools: true,
    view: {
      mode: 'slide',
      theme: 'dark',
      present: false,
      edit: true,
      twin: false,
      lint: false,
      source: false,
    },
    toggles: { edit: noop, twin: noop, lint: noop, source: noop },
    apple: true,
  };
}

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('the primitives in the Insert group', () => {
  const entries = buildPaletteEntries(context('content-rule'));
  const inserts = entries.filter((entry) => entry.group === 'insert');

  it('leads with the primitives in order, then the blocks, then the slide templates', () => {
    const families = inserts.map((entry) => entry.insert);
    const firstBlock = families.indexOf('block');
    const firstSlide = families.indexOf('slide');
    expect(families.slice(0, firstBlock).every((family) => family === 'primitive')).toBe(true);
    expect(firstSlide).toBeGreaterThan(firstBlock);
    expect(PRIMITIVE_ORDER).toEqual(['box', 'shape', 'rule', 'text', 'icon', 'shot', 'material']);
    const primitives = inserts.filter((entry) => entry.insert === 'primitive');
    expect(primitives.map((entry) => entry.title)).toEqual([
      'Box',
      'Rectangle shape',
      'Rounded rectangle shape',
      'Ellipse shape',
      'Line shape',
      'Arrow shape',
      'Rule',
      'Text box',
      'Icon',
      'Image',
      'Shader',
    ]);
    expect(insertLabel('shot')).toBe('Image');
  });

  it('keeps the entries whose menu row is core in the default view and parks the rest (docs/FOCUS.md 3.1; docs/RETURN.md 2)', () => {
    const plain = buildPaletteEntries({ ...context('content-rule'), advancedTools: false }).filter(
      (entry) => entry.group === 'insert',
    );
    /* the return round (docs/RETURN.md 2.2 to 2.6) brought the shapes, the lines, the table, the
       chart and the diagram back with their rows, and the features round's ship two brought the
       Shader (docs/FEATURES.md 5.4); the Box (no row, question 5 of RETURN.md section 9), Rule and
       Icon stay behind the switch */
    expect(
      plain.filter((entry) => entry.insert === 'primitive').map((entry) => entry.title),
    ).toEqual([
      'Rectangle shape',
      'Rounded rectangle shape',
      'Ellipse shape',
      'Line shape',
      'Arrow shape',
      'Text box',
      'Image',
      'Shader',
    ]);
    for (const id of [
      'insert:block:shape:rectangle',
      'insert:block:shape:rounded',
      'insert:block:shape:ellipse',
      'insert:block:shape:line',
      'insert:block:shape:arrow',
    ]) {
      const entry = inserts.find((each) => each.id === id);
      expect(entry?.advanced, id).toBeUndefined();
      expect(entry?.row, id).toMatch(/^insert\.(shape\.shapes|line)\./);
    }
    const plainIds = plain.map((entry) => entry.id);
    for (const id of [
      'insert:block:table',
      'insert:block:chart',
      'insert:block:dia',
      'insert:block:material',
    ])
      expect(plainIds, id).toContain(id);
    for (const id of ['insert:block:box', 'insert:block:rule', 'insert:block:icon'])
      expect(plainIds, id).not.toContain(id);
    expect(plain.map((entry) => entry.row)).toContain('insert.textBox');
    expect(plain.map((entry) => entry.row)).toContain('insert.image.upload');
    expect(plain.some((entry) => entry.insert === 'slide')).toBe(true);
    expect(plain.every((entry) => entry.advanced !== true)).toBe(true);
    /* the entries name their rows and keep their runs; a parked one carries the flag */
    const chart = inserts.find((entry) => entry.id === 'insert:block:chart');
    expect(chart?.row).toBe('insert.chart');
    expect(chart?.advanced).toBeUndefined();
    expect(chart?.run.kind).toBe('dispatch');
    expect(inserts.find((entry) => entry.id === 'insert:block:box')?.advanced).toBe(true);
    const icon = inserts.find((entry) => entry.id === 'insert:block:icon');
    expect(icon?.row).toBe('insert.icon');
    expect(icon?.advanced).toBe(true);
  });

  it('inserts a shape variant as one block.insert with the shape set', () => {
    const ellipse = inserts.find((entry) => entry.id === 'insert:block:shape:ellipse');
    expect(ellipse?.variant).toBe('ellipse');
    expect(ellipse?.run).toEqual({
      kind: 'dispatch',
      action: 'block.insert',
      input: {
        slideId: 'content-rule',
        slot: 'left',
        block: { id: 'shape', type: 'shape', shape: 'ellipse', stroke: 'hair' },
        baseRevision: 412,
      },
    });
  });

  it('routes the Icon primitive through the sprite picker', () => {
    const icon = inserts.find((entry) => entry.id === 'insert:block:icon');
    expect(icon?.run.kind).toBe('icon');
    if (icon?.run.kind !== 'icon') throw new Error('icon run');
    expect(icon.run.path).toBe('/block/name');
    expect(icon.run.action).toBe('block.insert');
  });

  it('gives every inserted block a position box on a freeform slide, under the selected block', () => {
    const free: Slide = {
      schemaVersion: 1,
      id: 'free',
      kind: 'content',
      layout: { type: 'freeform' },
      slots: {
        main: [
          {
            id: 'h',
            type: 'heading',
            level: 'h2',
            text: 'Head',
            pos: { x: 137, y: 129, w: 800, h: 56 },
          },
        ],
      },
    };
    const slides = { ...document.slides, free };
    const ctx = { ...context('free', slides), blockId: 'h' };
    const box = buildPaletteEntries(ctx).find((entry) => entry.id === 'insert:block:box');
    if (box?.run.kind !== 'dispatch') throw new Error('box run');
    const input = box.run.input as { block: { pos?: { x: number; y: number } } };
    expect(input.block.pos).toEqual(defaultPosition(free, 'box', 'h'));
    expect(input.block.pos?.x).toBe(137);
    /* 129 + 56 + 16 = 201, snapped to the 8 px grid */
    expect(input.block.pos?.y).toBe(200);
  });
});

describe('InsertMenu', () => {
  it('opens under its button with the three groups and runs an entry through the dispatcher', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const onNotice = vi.fn();
    const entries = buildPaletteEntries(context('content-rule'));
    render(<InsertMenu entries={entries} dispatch={dispatch} onNotice={onNotice} />);
    const button = screen.getByRole('button', { name: 'Insert' });
    expect(button.getAttribute('data-tip')).toBe('Insert');
    fireEvent.click(button);
    const menu = screen.getByRole('menu', { name: 'Insert' });
    expect(menu.textContent).toContain('Primitives');
    expect(menu.textContent).toContain('Blocks');
    expect(menu.textContent).toContain('Slides');
    /* the five shape variants as glyph buttons, each with its tooltip */
    const variants = menu.querySelectorAll('.ts-insert-variant');
    expect(variants).toHaveLength(5);
    expect(variants[2]?.getAttribute('data-tip')).toBe('Ellipse shape');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Box' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [action, input] = dispatch.mock.calls[0] as [string, { block: { type: string } }];
    expect(action).toBe('block.insert');
    expect(input.block.type).toBe('box');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  /* the module's `document` is the worked deck; the page is globalThis.document */
  const dom = globalThis.document;

  it('focuses the first row on a keyboard open, walks the rows with the arrows and returns focus on Escape', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const entries = buildPaletteEntries(context('content-rule'));
    render(<InsertMenu entries={entries} dispatch={dispatch} />);
    const button = screen.getByRole('button', { name: 'Insert' });
    button.focus();
    /* a keyboard press on the button, then the click the browser makes of it */
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    const menu = screen.getByRole('menu', { name: 'Insert' });
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.length).toBeGreaterThan(6);
    expect(dom.activeElement).toBe(items[0]);
    expect(items[0]?.textContent).toBe('Box');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(dom.activeElement).toBe(items[1]);
    /* the shape variants are rows too */
    expect(items[1]?.getAttribute('data-control')).toBe('insert.block.shape.rectangle');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(dom.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(dom.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(dom.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(dom.activeElement).toBe(items[0]);
    fireEvent.keyDown(dom, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(dom.activeElement).toBe(button);
  });

  it('takes focus itself on a pointer open, so no row shows its tooltip, and returns it after a run', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const entries = buildPaletteEntries(context('content-rule'));
    render(<InsertMenu entries={entries} dispatch={dispatch} />);
    const button = screen.getByRole('button', { name: 'Insert' });
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    const menu = screen.getByRole('menu', { name: 'Insert' });
    expect(dom.activeElement).toBe(menu);
    expect(dom.getElementById('pt-tip')?.hidden ?? true).toBe(true);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(dom.activeElement?.textContent).toBe('Box');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Box' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(dom.activeElement).toBe(button);
  });

  it('opens the sprite picker for the Icon primitive and inserts the picked symbol', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const entries = buildPaletteEntries(context('content-rule'));
    render(<InsertMenu entries={entries} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Icon' }));
    const cell = screen.getByRole('option', { name: 'Insert icon bolt' });
    fireEvent.click(cell);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [, input] = dispatch.mock.calls[0] as [string, { block: { type: string; name: string } }];
    expect(input.block.type).toBe('icon');
    expect(input.block.name).toBe('bolt');
  });
});
