// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, DeckDocument, Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { FormatOptions } from '../FormatOptions';
import { scaleMembers } from '../inspector/geometry';
import { lineSpacingOption } from '../inspector/text-marks';
import { hideTooltip } from '../Tooltip';

// Format options in round two (gslides-parity SPEC-2 section 5, 6.1 row 24): Size & rotation and
// Position on every object with the flips and the dial, Text fitting with Google's three radios
// (Resize shape to fit text disabled without a position with its note), the Line and Shape
// sections for the line kinds and the presets, Drop shadow, Adjustments, Alt text on every block,
// a group's union with a member scale, and the section a menu row opens the panel at. Every write
// is one action call through the dispatcher; no native title anywhere.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const base = workedDocument();
const canvas: Slide = {
  schemaVersion: 1,
  id: 'cv',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 't',
        type: 'text',
        text: 'Hello',
        autofit: 'shrink',
        pos: { x: 100, y: 100, w: 480, h: 64, z: 0, rotate: 30, flip: 'h' },
      } as Block,
      {
        id: 's',
        type: 'shape',
        shape: 'roundRect',
        pos: { x: 700, y: 100, w: 240, h: 160, z: 1, group: 'g1' },
      } as Block,
      {
        id: 'u',
        type: 'shape',
        shape: 'ellipse',
        pos: { x: 700, y: 400, w: 240, h: 160, z: 2, group: 'g1' },
      } as Block,
      {
        id: 'ln',
        type: 'shape',
        shape: 'elbow',
        connect: { end: { block: 's', site: 1 } },
        pos: { x: 100, y: 400, w: 320, h: 200, z: 3 },
      } as Block,
      {
        id: 'pic',
        type: 'picture',
        asset: Object.keys(base.deck.assets)[0] ?? 'a',
        pos: { x: 0, y: 0, w: 1600, h: 900, z: -1 },
      } as Block,
    ],
  },
};
const doc: DeckDocument = { deck: base.deck, slides: { ...base.slides, cv: canvas } };
const dispatch = vi.fn(() => Promise.resolve({}));

function panel(
  blockId: string | undefined,
  extra: Partial<Parameters<typeof FormatOptions>[0]> = {},
) {
  return render(
    <FormatOptions
      deck={doc.deck}
      slide={canvas}
      blockId={blockId}
      selection={blockId === undefined ? null : { blockId }}
      revision={7}
      dispatch={dispatch}
      onClose={() => undefined}
      {...extra}
    />,
  );
}

function control(id: string): HTMLElement {
  const el = document.querySelector(`[data-control="${id}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`no control ${id}`);
  return el;
}

function commitField(id: string, value: string): void {
  const field = control(id);
  fireEvent.change(field, { target: { value } });
  fireEvent.keyDown(field, { key: 'Enter' });
}

describe('Size & rotation and Position', () => {
  it('show the object’s box, write one block.set /pos per field, rotate and flip through their actions', () => {
    dispatch.mockClear();
    panel('t');
    expect((control('formatOptions.size.width') as HTMLInputElement).value).toBe('480');
    expect((control('formatOptions.size.rotate') as HTMLInputElement).value).toBe('30');
    expect(control('formatOptions.size.flip.h').getAttribute('aria-pressed')).toBe('true');
    expect(control('formatOptions.size.flip.v').getAttribute('aria-pressed')).toBe('false');
    commitField('formatOptions.size.width', '600');
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 't',
      path: '/pos',
      value: { x: 100, y: 100, w: 600, h: 64, z: 0, rotate: 30, flip: 'h' },
      baseRevision: 7,
    });
    commitField('formatOptions.size.rotate', '45');
    expect(dispatch).toHaveBeenLastCalledWith('block.rotate', {
      slideId: 'cv',
      blockIds: ['t'],
      to: 45,
      baseRevision: 7,
    });
    fireEvent.click(control('formatOptions.size.flip.v'));
    expect(dispatch).toHaveBeenLastCalledWith('block.flip', {
      slideId: 'cv',
      blockIds: ['t'],
      axis: 'v',
      baseRevision: 7,
    });
    /* Position from the centre */
    expect((control('formatOptions.position.x') as HTMLInputElement).value).toBe('100');
    fireEvent.click(control('formatOptions.position.from.center'));
    expect((control('formatOptions.position.x') as HTMLInputElement).value).toBe('340');
    commitField('formatOptions.position.y', '232');
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 't',
      path: '/pos',
      value: { x: 100, y: 200, w: 480, h: 64, z: 0, rotate: 30, flip: 'h' },
      baseRevision: 7,
    });
    for (const el of document.querySelectorAll('[title]'))
      expect(el, 'no native titles').toBeNull();
  });

  it('lock aspect ratio scales the other side; a group shows its union and a Width edit scales every member (0.102)', () => {
    dispatch.mockClear();
    panel('t');
    fireEvent.click(control('formatOptions.size.lock.lock'));
    commitField('formatOptions.size.width', '960');
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.set',
      expect.objectContaining({ value: expect.objectContaining({ w: 960, h: 128 }) }),
    );
    cleanup();
    dispatch.mockClear();
    panel('s', { selection: { blockId: 's', blockIds: ['s', 'u'], group: 'g1' } });
    expect((control('formatOptions.size.width') as HTMLInputElement).value).toBe('240');
    expect((control('formatOptions.size.height') as HTMLInputElement).value).toBe('460');
    expect(document.querySelector('[data-control="formatOptions.count"]')?.textContent).toBe(
      'Group',
    );
    commitField('formatOptions.size.width', '480');
    const [action, written] = dispatch.mock.calls[0] as unknown as [
      string,
      { mutations: Array<{ blockId: string; value: { w: number; x: number } }> },
    ];
    expect(action).toBe('slide.update');
    expect(written.mutations.map((m) => m.blockId)).toEqual(['s', 'u']);
    expect(written.mutations.every((m) => m.value.w === 480 && m.value.x === 700)).toBe(true);
    const scaled = scaleMembers(
      [canvas.slots.main?.[1] as Block, canvas.slots.main?.[2] as Block],
      undefined,
      { x: 700, y: 100, w: 240, h: 460 },
      { w: 240, h: 920 },
    );
    expect(scaled.map((m) => [m.pos.y, m.pos.h])).toEqual([
      [100, 320],
      [700, 320],
    ]);
  });
});

describe('Text fitting, Text, Line, Shape, Drop shadow, Adjustments, Alt text', () => {
  it('Text fitting offers the three radios and writes block.autofit with apply; Resize shape to fit text needs a position', () => {
    dispatch.mockClear();
    panel('t');
    expect(control('formatOptions.textFitting.autofit.shrink')).toHaveProperty('checked', true);
    expect((control('formatOptions.textFitting.autofit.grow') as HTMLInputElement).disabled).toBe(
      false,
    );
    fireEvent.click(control('formatOptions.textFitting.autofit.grow'));
    expect(dispatch).toHaveBeenLastCalledWith('block.autofit', {
      slideId: 'cv',
      blockId: 't',
      autofit: 'grow',
      apply: true,
      baseRevision: 7,
    });
    commitField('formatOptions.padding.left', '24');
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.set',
      expect.objectContaining({
        path: '/padding',
        value: { top: 0, right: 0, bottom: 0, left: 24 },
      }),
    );
    fireEvent.click(control('formatOptions.textFitting.valign.middle'));
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.set',
      expect.objectContaining({ path: '/valign', value: 'middle' }),
    );
    cleanup();
    /* a grammar slide's heading has no position: the third radio is disabled with its note */
    const rule = base.slides['content-rule'] as Slide;
    const heading =
      rule.kind === 'content'
        ? Object.values(rule.slots)
            .flatMap((b) => b ?? [])
            .find((b) => b.type === 'heading')
        : undefined;
    render(
      <FormatOptions
        deck={base.deck}
        slide={rule}
        blockId={heading?.id}
        selection={{ blockId: heading?.id }}
        revision={1}
        dispatch={dispatch}
        onClose={() => undefined}
      />,
    );
    expect((control('formatOptions.textFitting.autofit.grow') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(document.body.textContent).toContain('Available on a text box placed on the slide');
  });

  it('the Text section writes spacing, columns and a mark; lineSpacingOption reads the presets', () => {
    dispatch.mockClear();
    panel('t');
    fireEvent.change(control('formatOptions.text.lineSpacing'), { target: { value: 'double' } });
    expect(dispatch).toHaveBeenLastCalledWith('text.spacing', {
      slideId: 'cv',
      blockIds: ['t'],
      line: 2,
      baseRevision: 7,
    });
    fireEvent.change(control('formatOptions.text.columns'), { target: { value: '2' } });
    expect(dispatch).toHaveBeenLastCalledWith('text.columns', {
      slideId: 'cv',
      blockIds: ['t'],
      columns: 2,
      baseRevision: 7,
    });
    fireEvent.click(control('formatOptions.text.marks.i'));
    expect(dispatch).toHaveBeenLastCalledWith('text.style', {
      slideId: 'cv',
      blockId: 't',
      path: '/text',
      range: [0, 5],
      marks: { i: true },
      baseRevision: 7,
    });
    expect(lineSpacingOption(undefined)).toBe('single');
    expect(lineSpacingOption(1.15)).toBe('1.15');
    expect(lineSpacingOption(2)).toBe('double');
    expect(lineSpacingOption(1.33)).toBe('custom');
  });

  it('the Line section writes line.set and offers Detach for an attached end; the Shape section changes the shape behind Tools > Advanced tools', () => {
    dispatch.mockClear();
    /* the Shape section is parked (docs/FOCUS.md 3.2 Format: Change shape), so the panel draws it
       with the switch on; the Line section is core and draws either way */
    panel('ln', { advancedTools: true });
    expect(screen.getByRole('button', { name: 'Line' })).toBeTruthy();
    fireEvent.change(control('formatOptions.line.end'), { target: { value: 'fillCircle' } });
    expect(dispatch).toHaveBeenLastCalledWith('line.set', {
      slideId: 'cv',
      blockIds: ['ln'],
      end: 'fillCircle',
      baseRevision: 7,
    });
    fireEvent.click(control('formatOptions.line.detach.end'));
    expect(dispatch).toHaveBeenLastCalledWith('line.set', {
      slideId: 'cv',
      blockIds: ['ln'],
      connect: { end: null },
      baseRevision: 7,
    });
    expect(document.querySelector('[data-section="shape"]')).toBeNull();
    cleanup();
    dispatch.mockClear();
    panel('s', { advancedTools: true });
    expect(document.querySelector('[data-section="line"]')).toBeNull();
    fireEvent.click(control('formatOptions.shape.change'));
    fireEvent.click(control('formatOptions.shape.change.pick.hexagon'));
    expect(dispatch).toHaveBeenLastCalledWith('shape.set', {
      slideId: 'cv',
      blockIds: ['s'],
      kind: 'hexagon',
      adjust: null,
      baseRevision: 7,
    });
  });

  it('Drop shadow enables with the defaults, Adjustments write block.adjust, Alt text writes block.setAlt on every block, behind Tools > Advanced tools', () => {
    dispatch.mockClear();
    /* Drop shadow is a parked section (docs/FOCUS.md 3.2 Format), drawn with the switch on; Alt text is in the default view since the product round */
    panel('s', { advancedTools: true });
    fireEvent.click(control('formatOptions.shadow.enable'));
    expect(dispatch).toHaveBeenLastCalledWith('block.shadow', {
      slideId: 'cv',
      blockIds: ['s'],
      shadow: { color: 'ink', opacity: 0.3, angle: 45, distance: 8, blur: 12 },
      baseRevision: 7,
    });
    const alt = control('formatOptions.altText.description');
    fireEvent.change(alt, { target: { value: 'A rounded box' } });
    fireEvent.blur(alt);
    expect(dispatch).toHaveBeenLastCalledWith('block.setAlt', {
      slideId: 'cv',
      blockId: 's',
      alt: 'A rounded box',
      baseRevision: 7,
    });
    cleanup();
    dispatch.mockClear();
    panel('pic');
    commitField('formatOptions.adjustments.brightness', '20');
    expect(dispatch).toHaveBeenLastCalledWith('block.adjust', {
      slideId: 'cv',
      blockId: 'pic',
      brightness: 0.2,
      baseRevision: 7,
    });
    fireEvent.click(control('formatOptions.picture.reset'));
    expect(dispatch).not.toHaveBeenLastCalledWith('block.resetImage', expect.anything());
    expect(control('formatOptions.picture.reset').getAttribute('aria-disabled')).toBe('true');
  });

  it('draws no parked section with the switch off: Drop shadow and Dither leave; Shape returned with the shapes and Alt text in the product round (docs/FOCUS.md 3.2; docs/RETURN.md 2.2, 2.15; PRODUCT.md section 5)', () => {
    panel('s');
    const sections = [...document.querySelectorAll('[data-section]')].map((el) =>
      el.getAttribute('data-section'),
    );
    for (const parked of ['shadow', 'dither']) expect(sections, parked).not.toContain(parked);
    /* Alt text returned to the default view (PRODUCT.md section 5; RETURN.md question 6) */
    expect(sections).toContain('altText');
    expect(sections).toContain('size');
    expect(sections).toContain('position');
    /* the Shape section returned with Insert > Shape (RETURN.md 2.2); Table and Chart data return
       with their blocks (2.4, 2.5) and are drawn for a table and a chart alone */
    expect(sections).toContain('shape');
    expect(document.querySelector('[data-control="formatOptions.shadow.enable"]')).toBeNull();
  });

  it('opens at the section a menu row names and puts the sections in Google’s order', () => {
    panel('s', { openSection: 'shadow', advancedTools: true });
    const sections = [...document.querySelectorAll('[data-section]')].map((el) =>
      el.getAttribute('data-section'),
    );
    expect(sections.indexOf('size')).toBeLessThan(sections.indexOf('position'));
    expect(sections.indexOf('textFitting')).toBeLessThan(sections.indexOf('text'));
    expect(sections.indexOf('shadow')).toBeLessThan(sections.indexOf('shape'));
    expect(sections.indexOf('shape')).toBeLessThan(sections.indexOf('altText'));
    expect(document.activeElement).toBe(
      document.querySelector('[data-section="shadow"] .ts-panel-section-head'),
    );
  });
});

describe('the chart and the table sections (docs/FEATURES.md 2.2 ranks 11 and 13)', () => {
  const chartSlide: ContentSlide = {
    ...canvas,
    id: 'charts',
    slots: {
      main: [
        {
          id: 'chart',
          type: 'chart',
          kind: 'column',
          categories: ['Q1', 'Q2'],
          series: [{ name: 'Docs', values: [1, 2] }],
          legend: 'none',
          pos: { x: 100, y: 100, w: 800, h: 400, z: 0 },
        } as Block,
        {
          id: 'tbl',
          type: 'table',
          columns: [{}, {}],
          rows: [{ cells: ['a', 'b'], header: true }, { cells: ['c', 'd'] }],
          pos: { x: 100, y: 520, w: 800, h: 200, z: 1 },
        } as Block,
      ],
    },
  };
  const chartDoc: DeckDocument = {
    deck: doc.deck,
    slides: { ...doc.slides, charts: chartSlide },
  };
  const chartPanel = (blockId: string, extra: Partial<Parameters<typeof FormatOptions>[0]> = {}) =>
    render(
      <FormatOptions
        deck={chartDoc.deck}
        slide={chartSlide}
        blockId={blockId}
        selection={{ blockId }}
        revision={7}
        dispatch={dispatch}
        onClose={() => undefined}
        slots={{
          chart: () => <div data-testid="chart-slot" />,
          table: () => <div data-testid="table-slot" />,
        }}
        {...extra}
      />,
    );
  const sections = () =>
    [...document.querySelectorAll('[data-section]')].map((el) => el.getAttribute('data-section'));
  const generated = (path: string) =>
    document.querySelector(`.ts-insp-array[data-path="${path}"], [data-path="${path}"]`);

  it('draws the Chart data section first and none of the chart’s generated fields beside it; the JSON view returns behind Tools > Advanced tools', () => {
    chartPanel('chart');
    expect(sections()[0]).toBe('chart');
    expect(document.querySelector('[data-testid="chart-slot"]')).not.toBeNull();
    /* no second Chart type, Categories or Series rows under the section: the slot alone */
    const body = '[data-section="chart"] .ts-panel-section-body';
    expect(document.querySelectorAll(`${body} [data-control]`)).toHaveLength(0);
    expect(document.querySelectorAll(`${body} textarea`)).toHaveLength(0);
    expect(generated('/series')).toBeNull();
    cleanup();
    chartPanel('chart', { advancedTools: true });
    expect(document.querySelectorAll(`${body} [data-control]`).length).toBeGreaterThan(0);
  });

  it('draws the Table section first for a table and none of its generated fields beside it', () => {
    chartPanel('tbl');
    expect(sections()[0]).toBe('table');
    expect(document.querySelector('[data-testid="table-slot"]')).not.toBeNull();
    const body = '[data-section="table"] .ts-panel-section-body';
    expect(document.querySelectorAll(`${body} [data-control]`)).toHaveLength(0);
    cleanup();
    chartPanel('tbl', { advancedTools: true });
    expect(document.querySelectorAll(`${body} [data-control]`).length).toBeGreaterThan(0);
  });
});
