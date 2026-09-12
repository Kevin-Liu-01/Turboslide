// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clampNotesHeight, NOTES_BURST_MS, NOTES_DEFAULT_HEIGHT, NotesPane } from '../NotesPane';
import { hideTooltip } from '../Tooltip';

// The speaker notes pane (gslides-parity SPEC 8): the prompt, one write per 400 ms pause, the
// write on blur and on a slide change, the handle's drag and keys, the focus key.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  hideTooltip();
  cleanup();
  vi.useRealTimers();
});

function field(): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>('[data-control="notes.text"]');
  if (!el) throw new Error('no notes field');
  return el;
}

describe('NotesPane', () => {
  it('shows the prompt, spellcheck on, and writes one slide.set per 400 ms pause', () => {
    const onCommit = vi.fn();
    render(
      <NotesPane
        slideId="s1"
        notes=""
        onCommit={onCommit}
        height={NOTES_DEFAULT_HEIGHT}
        onHeightChange={() => undefined}
        windowHeight={900}
      />,
    );
    const area = field();
    expect(area.placeholder).toBe('Click to add speaker notes');
    expect(area.getAttribute('spellcheck')).toBe('true');
    fireEvent.change(area, { target: { value: 'Open with' } });
    fireEvent.change(area, { target: { value: 'Open with the number' } });
    act(() => {
      vi.advanceTimersByTime(NOTES_BURST_MS - 10);
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Open with the number');
    /* a second burst is a second write */
    fireEvent.change(area, { target: { value: 'Open with the number.' } });
    act(() => {
      vi.advanceTimersByTime(NOTES_BURST_MS + 10);
    });
    expect(onCommit).toHaveBeenCalledTimes(2);
    /* nothing new: no write */
    fireEvent.blur(area);
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it("writes on blur and on a slide change, then shows the new slide's notes", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <NotesPane
        slideId="s1"
        notes="One"
        onCommit={onCommit}
        height={NOTES_DEFAULT_HEIGHT}
        onHeightChange={() => undefined}
        windowHeight={900}
      />,
    );
    expect(field().value).toBe('One');
    fireEvent.change(field(), { target: { value: 'One more' } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledWith('One more');
    fireEvent.change(field(), { target: { value: 'One more line' } });
    rerender(
      <NotesPane
        slideId="s2"
        notes="Two"
        onCommit={onCommit}
        height={NOTES_DEFAULT_HEIGHT}
        onHeightChange={() => undefined}
        windowHeight={900}
      />,
    );
    expect(onCommit).toHaveBeenLastCalledWith('One more line');
    expect(field().value).toBe('Two');
  });

  it('clamps the height to 40 percent of the window and hides under 16 px', () => {
    expect(clampNotesHeight(100, 900)).toBe(100);
    expect(clampNotesHeight(500, 900)).toBe(360);
    expect(clampNotesHeight(10, 900)).toBe(0);
  });

  it('the handle drags, double clicks and takes the arrows; hidden it keeps the handle', () => {
    const onHeightChange = vi.fn();
    const { container, rerender } = render(
      <NotesPane
        slideId="s1"
        notes=""
        onCommit={() => undefined}
        height={NOTES_DEFAULT_HEIGHT}
        onHeightChange={onHeightChange}
        windowHeight={900}
      />,
    );
    const handle = container.querySelector<HTMLButtonElement>('[data-control="notes.handle"]');
    if (!handle) throw new Error('no handle');
    expect(handle.getAttribute('data-tip')).toBe('Speaker notes');
    expect(handle.hasAttribute('title')).toBe(false);
    fireEvent.pointerDown(handle, { button: 0, clientY: 800 });
    fireEvent.pointerMove(window, { clientY: 700 });
    expect(onHeightChange).toHaveBeenLastCalledWith(NOTES_DEFAULT_HEIGHT + 100);
    fireEvent.pointerMove(window, { clientY: 100 });
    expect(onHeightChange).toHaveBeenLastCalledWith(360);
    fireEvent.pointerUp(window);
    fireEvent.doubleClick(handle);
    expect(onHeightChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true });
    expect(onHeightChange).toHaveBeenLastCalledWith(NOTES_DEFAULT_HEIGHT + 40);
    rerender(
      <NotesPane
        slideId="s1"
        notes=""
        onCommit={() => undefined}
        height={0}
        onHeightChange={onHeightChange}
        windowHeight={900}
      />,
    );
    expect(container.querySelector('.ts-notes.is-hidden')).not.toBeNull();
    expect(container.querySelector('[data-control="notes.text"]')).toBeNull();
    expect(container.querySelector('[data-control="notes.handle"]')).not.toBeNull();
    fireEvent.keyDown(container.querySelector('[data-control="notes.handle"]')!, { key: 'Enter' });
    expect(onHeightChange).toHaveBeenLastCalledWith(NOTES_DEFAULT_HEIGHT);
  });

  it('the field carries the tooltip with the key, shown on a keyboard focus and gone at the first keystroke', () => {
    render(
      <NotesPane
        slideId="s1"
        notes=""
        onCommit={() => undefined}
        height={NOTES_DEFAULT_HEIGHT}
        onHeightChange={() => undefined}
        windowHeight={900}
      />,
    );
    const area = field();
    expect(area.getAttribute('data-tip')).toBe('Speaker notes');
    expect(area.hasAttribute('title')).toBe(false);
    fireEvent.focus(area);
    const plate = document.getElementById('pt-tip');
    if (!plate) throw new Error('no tooltip layer');
    expect(plate.hidden).toBe(false);
    expect(plate.querySelector('.pt-tip-name')?.textContent).toBe('Speaker notes');
    expect(plate.querySelector('.pt-tip-key')?.textContent).toBe('Cmd Option Shift S');
    expect(area.getAttribute('aria-describedby')).toBe('pt-tip');
    fireEvent.keyDown(area, { key: 'O' });
    expect(plate.hidden).toBe(true);
    expect(area.hasAttribute('aria-describedby')).toBe(false);
    /* the keystroke still reaches the field's own keys: Escape writes and leaves */
    const onCommit = vi.fn();
    cleanup();
    render(
      <NotesPane
        slideId="s1"
        notes=""
        onCommit={onCommit}
        height={NOTES_DEFAULT_HEIGHT}
        onHeightChange={() => undefined}
        windowHeight={900}
      />,
    );
    fireEvent.change(field(), { target: { value: 'One' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(onCommit).toHaveBeenCalledWith('One');
  });

  it('Cmd Option Shift S focuses the field from anywhere and opens a hidden pane', () => {
    const onHeightChange = vi.fn();
    render(
      <NotesPane
        slideId="s1"
        notes=""
        onCommit={() => undefined}
        height={NOTES_DEFAULT_HEIGHT}
        onHeightChange={onHeightChange}
        windowHeight={900}
      />,
    );
    fireEvent.keyDown(window, { key: 's', metaKey: true, altKey: true, shiftKey: true });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.activeElement).toBe(field());
    cleanup();
    render(
      <NotesPane
        slideId="s1"
        notes=""
        onCommit={() => undefined}
        height={0}
        onHeightChange={onHeightChange}
        windowHeight={900}
      />,
    );
    fireEvent.keyDown(window, { key: 'S', metaKey: true, altKey: true, shiftKey: true });
    expect(onHeightChange).toHaveBeenLastCalledWith(NOTES_DEFAULT_HEIGHT);
  });
});
