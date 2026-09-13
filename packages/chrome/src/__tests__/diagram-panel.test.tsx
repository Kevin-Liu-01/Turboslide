// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DIAGRAM_KINDS, DIAGRAM_STYLES, DIAGRAM_TEMPLATES } from '@turboslide/schema/diagrams';

import { DiagramPanel } from '../DiagramPanel';
import { forbiddenWordsIn } from '../menus/strings';
import { DiagramPreview, DiagramStylePicker, DiagramTypePicker } from '../pickers/DiagramPicker';

// The Diagram panel (gslides-parity SPEC-2 section 5 "Diagram panel", 2.8.3, section 10, 11.5
// diagram-panel.test): the six type tiles as one radio group moving with the arrows, Home and
// End; the count control named for the type with its range; the three style tiles; the live
// preview drawn from the templates; Insert running one diagram.insert with the kind, count and
// style; the panel staying open with a notice; no engineering word; the pickers on their own.

afterEach(cleanup);

function mount() {
  const dispatch = vi.fn(() => Promise.resolve({ blockIds: [], group: 'g' }));
  const onNotice = vi.fn();
  const onClose = vi.fn();
  render(
    <DiagramPanel
      slideId="s"
      revision={4}
      dispatch={dispatch}
      onClose={onClose}
      onNotice={onNotice}
    />,
  );
  return { dispatch, onNotice, onClose };
}

function control(id: string): HTMLElement {
  return document.querySelector(`[data-control="${id}"]`) as HTMLElement;
}

describe('DiagramPanel', () => {
  it('shows the six types as tiles with Google labels, Process chosen, the count named Steps', () => {
    mount();
    expect(document.querySelector('[data-control="panel.diagram"]')).not.toBeNull();
    expect(document.querySelector('.ts-panel-title')?.textContent).toBe('Diagram');
    const tiles = document.querySelectorAll('[data-control="insert.diagram.type"] [role="radio"]');
    expect(Array.from(tiles).map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Grid',
      'Hierarchy',
      'Timeline',
      'Process',
      'Relationship',
      'Cycle',
    ]);
    expect(control('insert.diagram.type.process').getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain('Steps');
    expect((control('insert.diagram.count') as HTMLInputElement).value).toBe('4');
    /* every tile draws a picture from the template: shapes in an svg */
    for (const tile of tiles)
      expect(tile.querySelectorAll('svg rect, svg ellipse, svg line').length).toBeGreaterThan(0);
    for (const el of document.querySelectorAll('*')) expect(el.hasAttribute('title')).toBe(false);
  });

  it('renames the count for the type and clamps it to the type’s range', () => {
    mount();
    fireEvent.click(control('insert.diagram.type.hierarchy'));
    expect(document.body.textContent).toContain('Levels');
    expect((control('insert.diagram.count') as HTMLInputElement).value).toBe('3');
    fireEvent.click(control('insert.diagram.count.more'));
    fireEvent.click(control('insert.diagram.count.more'));
    fireEvent.click(control('insert.diagram.count.more'));
    expect((control('insert.diagram.count') as HTMLInputElement).value).toBe('5');
    expect((control('insert.diagram.count.more') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(control('insert.diagram.count'), { target: { value: '1' } });
    expect((control('insert.diagram.count') as HTMLInputElement).value).toBe('2');
    expect((control('insert.diagram.count.less') as HTMLButtonElement).disabled).toBe(true);
    /* each type remembers its own count */
    fireEvent.click(control('insert.diagram.type.timeline'));
    expect(document.body.textContent).toContain('Dates');
    expect((control('insert.diagram.count') as HTMLInputElement).value).toBe('4');
    fireEvent.click(control('insert.diagram.type.hierarchy'));
    expect((control('insert.diagram.count') as HTMLInputElement).value).toBe('2');
  });

  it('moves the type and style tiles with the arrows, Home and End', () => {
    mount();
    const types = control('insert.diagram.type');
    fireEvent.keyDown(types, { key: 'ArrowRight' });
    expect(control('insert.diagram.type.relationship').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(control('insert.diagram.type.relationship'));
    fireEvent.keyDown(types, { key: 'End' });
    expect(control('insert.diagram.type.cycle').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(types, { key: 'ArrowRight' });
    expect(control('insert.diagram.type.grid').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(types, { key: 'Home' });
    expect(control('insert.diagram.type.grid').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(types, { key: 'ArrowLeft' });
    expect(control('insert.diagram.type.cycle').getAttribute('aria-checked')).toBe('true');
    const styles = control('insert.diagram.style');
    expect(control('insert.diagram.style.outline').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(styles, { key: 'ArrowRight' });
    expect(control('insert.diagram.style.plate').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(control('insert.diagram.style.ink'));
    expect(control('insert.diagram.style.ink').getAttribute('aria-checked')).toBe('true');
    /* one tile of each group is in the tab order */
    expect(
      document.querySelectorAll('[data-control="insert.diagram.type"] [tabindex="0"]'),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-control="insert.diagram.style"] [tabindex="0"]'),
    ).toHaveLength(1);
  });

  it('inserts one diagram.insert with the kind, count and style, keeps the panel open and says so', async () => {
    const { dispatch, onNotice, onClose } = mount();
    fireEvent.click(control('insert.diagram.type.cycle'));
    fireEvent.click(control('insert.diagram.count.more'));
    fireEvent.click(control('insert.diagram.style.plate'));
    fireEvent.click(control('insert.diagram.insert'));
    expect(dispatch).toHaveBeenCalledWith('diagram.insert', {
      slideId: 's',
      kind: 'cycle',
      count: 5,
      style: 'plate',
      baseRevision: 4,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(onNotice).toHaveBeenCalledWith('Cycle diagram added');
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[data-control="panel.diagram"]')).not.toBeNull();
  });

  it('reports a refused insert in the snackbar', async () => {
    const dispatch = vi.fn(() =>
      Promise.reject(new Error('This slide could not take the diagram')),
    );
    const onNotice = vi.fn();
    render(
      <DiagramPanel
        slideId="s"
        revision={4}
        dispatch={dispatch}
        onClose={() => undefined}
        onNotice={onNotice}
      />,
    );
    fireEvent.click(control('insert.diagram.insert'));
    await Promise.resolve();
    await Promise.resolve();
    expect(onNotice).toHaveBeenCalledWith('This slide could not take the diagram');
  });

  it('draws the live preview from the template at the chosen count and style', () => {
    mount();
    const preview = control('insert.diagram.preview');
    const svg = preview.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Process with 4 steps');
    /* four steps as rounded rectangles and three arrows */
    expect(svg.querySelectorAll('rect')).toHaveLength(4);
    expect(svg.querySelectorAll('line')).toHaveLength(3);
    expect(svg.querySelectorAll('polygon')).toHaveLength(3);
    fireEvent.click(control('insert.diagram.type.relationship'));
    expect(svg.querySelectorAll('ellipse').length).toBeGreaterThan(0);
  });

  it('uses no engineering word in its text or tooltips', () => {
    mount();
    const root = document.querySelector('[data-control="panel.diagram"]') as HTMLElement;
    const texts = [root.textContent ?? ''];
    for (const el of root.querySelectorAll('[data-tip], [aria-label]')) {
      texts.push(el.getAttribute('data-tip') ?? '', el.getAttribute('aria-label') ?? '');
    }
    for (const text of texts) expect(forbiddenWordsIn(text)).toEqual([]);
  });
});

describe('the diagram pickers on their own', () => {
  it('the type picker lists every kind and calls back with the pick', () => {
    const onChange = vi.fn();
    render(<DiagramTypePicker value="grid" onChange={onChange} />);
    expect(document.querySelectorAll('[role="radio"]')).toHaveLength(DIAGRAM_KINDS.length);
    fireEvent.click(control('insert.diagram.type.timeline'));
    expect(onChange).toHaveBeenCalledWith('timeline');
  });

  it('the style picker lists the three styles for a kind and count', () => {
    const onChange = vi.fn();
    render(<DiagramStylePicker kind="grid" count={4} value="ink" onChange={onChange} />);
    expect(document.querySelectorAll('[role="radio"]')).toHaveLength(DIAGRAM_STYLES.length);
    expect(control('insert.diagram.style.ink').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(control('insert.diagram.style.outline'));
    expect(onChange).toHaveBeenCalledWith('outline');
  });

  it('the preview draws rectangles, ellipses and lines from any block list and hides from readers without a label', () => {
    const blocks = DIAGRAM_TEMPLATES.timeline.make(3, 'plate', { x: 0, y: 0, w: 320, h: 180 }, 'p');
    const { container } = render(
      <DiagramPreview blocks={blocks} box={{ x: 0, y: 0, w: 320, h: 180 }} />,
    );
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('ellipse')).toHaveLength(3);
    expect(svg.querySelectorAll('line')).toHaveLength(1);
  });
});
