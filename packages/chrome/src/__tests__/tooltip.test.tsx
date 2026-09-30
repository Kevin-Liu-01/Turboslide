// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolButton } from '../ToolButton';
import {
  TIP_DELAY_MS,
  TIP_ID,
  Tooltip,
  hideTooltip,
  hideTooltipUntilInput,
  resetTooltipTiming,
  isKeyLike,
  shownTooltipAnchor,
  tipOf,
  tipProps,
} from '../Tooltip';

// The Tooltip primitive (Kevin, 2026-09-11: "have good tooltips in all control surfaces"): the
// name, the sentence and the key from a title-like string; shown after 350 ms of hover and at
// once on keyboard focus; one layer at a time; hidden on Escape and when the pointer leaves. Since
// the polish round (docs/POLISH.md 2.6 item 61) a tooltip shows only where a person asked: a
// mouseenter counts when the pointer's own movement is the newest input, a focus when a
// navigation key is.
function layer(): HTMLElement | null {
  return document.getElementById(TIP_ID);
}

/* the pointer moves to a new point: the document listener records it */
function moveTo(x: number, y: number, target: Element = document.body): void {
  fireEvent.mouseMove(target, { clientX: x, clientY: y });
}

/* the focus a Tab gives: the key first, then the focus, as the browser does */
function tabTo(el: HTMLElement): void {
  fireEvent.keyDown(document.body, { key: 'Tab' });
  fireEvent.focus(el);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  hideTooltip();
  resetTooltipTiming();
  cleanup();
  vi.useRealTimers();
});

describe('tipOf', () => {
  it('reads the name and the key from a title-like string', () => {
    expect(tipOf('Dark or light (D)')).toEqual({ name: 'Dark or light', key: 'D' });
    expect(tipOf('Show or hide the list ([)')).toEqual({ name: 'Show or hide the list', key: '[' });
    expect(tipOf('Search (Cmd K or Ctrl K)')).toEqual({ name: 'Search', key: 'Cmd K or Ctrl K' });
  });

  it('keeps a parenthetical that is not a key as part of the sentence', () => {
    expect(isKeyLike('click, type it, press Enter')).toBe(false);
    expect(isKeyLike('asset.dither')).toBe(false);
    expect(isKeyLike('left arrow')).toBe(true);
    expect(tipOf('Go to a slide by number (click, type it, press Enter)')).toEqual({
      name: 'Go to a slide by number (click, type it, press Enter)',
    });
  });

  it('uses the label as the name and the title as the sentence', () => {
    expect(tipOf('Light and dark side by side (Shift D)', 'Twin')).toEqual({
      name: 'Twin',
      doc: 'Light and dark side by side.',
      key: 'Shift D',
    });
    /* a title that repeats the label adds no sentence */
    expect(tipOf('Previous (left arrow)', 'Previous')).toEqual({
      name: 'Previous',
      key: 'left arrow',
    });
  });
});

describe('Tooltip', () => {
  it('shows after the hover delay with the name, the sentence and the key, and hides on leave', () => {
    render(
      <ToolButton
        label="Twin"
        title="Light and dark side by side (Shift D)"
        onClick={() => undefined}
      />,
    );
    const button = screen.getByRole('button', { name: 'Twin' });
    expect(button.getAttribute('data-tip')).toBe('Twin');
    expect(button.hasAttribute('title')).toBe(false);
    moveTo(10, 10);
    fireEvent.mouseEnter(button);
    expect(layer()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS - 1);
    });
    expect(layer()?.hidden ?? true).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const tip = layer();
    expect(tip).not.toBeNull();
    expect(tip?.hidden).toBe(false);
    expect(tip?.getAttribute('role')).toBe('tooltip');
    expect(tip?.querySelector('.pt-tip-name')?.textContent).toBe('Twin');
    expect(tip?.querySelector('.pt-tip-doc')?.textContent).toBe('Light and dark side by side.');
    expect(tip?.querySelector('kbd')?.textContent).toBe('Shift D');
    expect(button.getAttribute('aria-describedby')).toBe(TIP_ID);
    fireEvent.mouseLeave(button);
    expect(layer()?.hidden).toBe(true);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows at once on keyboard focus and not on the focus a press gives', () => {
    render(<ToolButton title="Keyboard shortcuts (?)" onClick={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    tabTo(button);
    expect(layer()?.hidden).toBe(false);
    expect(shownTooltipAnchor()).toBe(button);
    fireEvent.blur(button);
    expect(layer()?.hidden).toBe(true);
    /* a press hides what is up and the focus that follows shows nothing */
    fireEvent.mouseDown(button);
    fireEvent.focus(button);
    expect(layer()?.hidden).toBe(true);
    /* a focus a script gives long after the press, with no key since, shows nothing either */
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.focus(button);
    expect(layer()?.hidden).toBe(true);
    /* a Tab after the press is the person's again */
    tabTo(button);
    expect(layer()?.hidden).toBe(false);
  });

  it('keeps one tooltip at a time: a second anchor replaces the first', () => {
    render(
      <>
        <ToolButton title="First (A)" onClick={() => undefined} />
        <ToolButton title="Second (B)" onClick={() => undefined} />
      </>,
    );
    const first = screen.getByRole('button', { name: 'First' });
    const second = screen.getByRole('button', { name: 'Second' });
    moveTo(10, 10);
    fireEvent.mouseEnter(first);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS);
    });
    expect(shownTooltipAnchor()).toBe(first);
    /* while one is up the next shows at once */
    moveTo(60, 10);
    fireEvent.mouseEnter(second);
    expect(shownTooltipAnchor()).toBe(second);
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(layer()?.querySelector('.pt-tip-name')?.textContent).toBe('Second');
    expect(first.hasAttribute('aria-describedby')).toBe(false);
    expect(second.getAttribute('aria-describedby')).toBe(TIP_ID);
  });

  it('shows no tip for a control that moved under a resting pointer until the pointer moves, and none on a focus returned right after Escape (docs/POLISH.md 2.6 item 61)', () => {
    render(
      <Tooltip content="Insert image">
        <button type="button">Image</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button');
    /* no movement for a while: the enter is a control moving under the pointer */
    moveTo(10, 10);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS + 50);
    });
    expect(shownTooltipAnchor()).toBeNull();
    /* the pointer's own movement over the control schedules it */
    moveTo(12, 12, button);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS + 50);
    });
    expect(shownTooltipAnchor()).toBe(button);
    hideTooltip();
    /* a focus that follows Escape (a palette closing) shows nothing; one after a Tab shows */
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.focus(button);
    expect(shownTooltipAnchor()).toBeNull();
    tabTo(button);
    expect(shownTooltipAnchor()).toBe(button);
  });

  it('shows no tip for a control that lands under the pointer after a click, until the pointer moves to a new point (item 61: the edge "+" moves a seam under the pointer)', () => {
    render(
      <>
        <button type="button">Add column</button>
        <Tooltip content={{ name: 'Row seam 2', doc: 'Drag to resize the row.' }}>
          <button type="button">Seam</button>
        </Tooltip>
      </>,
    );
    const plus = screen.getByRole('button', { name: 'Add column' });
    const seam = screen.getByRole('button', { name: 'Seam' });
    /* the pointer arrives on the "+" and clicks it; the seam re-renders under the pointer */
    moveTo(40, 40, plus);
    fireEvent.mouseDown(plus);
    fireEvent.mouseUp(plus);
    fireEvent.mouseEnter(seam);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS + 50);
    });
    expect(shownTooltipAnchor()).toBeNull();
    /* the browser's own mousemove at the same point after the layout change is not a movement */
    moveTo(40, 40, seam);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS + 50);
    });
    expect(shownTooltipAnchor()).toBeNull();
    /* the person moves the pointer: the seam's plate draws */
    moveTo(41, 46, seam);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS + 50);
    });
    expect(shownTooltipAnchor()).toBe(seam);
    expect(layer()?.textContent).toBe('Row seam 2 Drag to resize the row.');
  });

  it('hides until the next input when a menu opens or a dialog closes, and shows nothing on the focus the close returns (item 61: the menubar plate after a dialog closed on a click)', () => {
    render(
      <>
        <ToolButton title="Format menu (Ctrl Option O)" onClick={() => undefined} />
        <button type="button">Done</button>
      </>,
    );
    const format = screen.getByRole('button', { name: 'Format menu' });
    const done = screen.getByRole('button', { name: 'Done' });
    moveTo(20, 20, format);
    fireEvent.mouseEnter(format);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS);
    });
    expect(shownTooltipAnchor()).toBe(format);
    /* a menu opens: the plate hides and the focus the menu returns later shows nothing */
    hideTooltipUntilInput();
    expect(layer()?.hidden).toBe(true);
    fireEvent.focus(format);
    expect(shownTooltipAnchor()).toBeNull();
    /* a Tab after it is the person's: the plate shows */
    tabTo(format);
    expect(shownTooltipAnchor()).toBe(format);
    hideTooltip();
    /* a dialog closed by a click on Done returns the focus to the menubar button a while later
       (the close may wait on a write): the press is the newest input, so no plate */
    fireEvent.mouseDown(done);
    fireEvent.mouseUp(done);
    act(() => {
      vi.advanceTimersByTime(1_200);
    });
    fireEvent.focus(format);
    expect(shownTooltipAnchor()).toBeNull();
    /* the control under the resting pointer after the close shows nothing either */
    fireEvent.mouseEnter(format);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS + 50);
    });
    expect(shownTooltipAnchor()).toBeNull();
  });

  it('hides on Escape', () => {
    render(<ToolButton title="Help (?)" onClick={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Help' });
    tabTo(button);
    expect(layer()?.hidden).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(layer()?.hidden).toBe(true);
  });

  it('cancels a pending hover when the pointer leaves before the delay', () => {
    render(<ToolButton title="Copy link" onClick={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Copy link' });
    moveTo(10, 10);
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS * 2);
    });
    expect(shownTooltipAnchor()).toBeNull();
    expect(layer()?.hidden ?? true).toBe(true);
  });

  it('respects reduced motion by writing no fade', () => {
    const original = window.matchMedia;
    window.matchMedia = (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    });
    try {
      render(<ToolButton title="Theme (D)" onClick={() => undefined} />);
      tabTo(screen.getByRole('button', { name: 'Theme' }));
      expect(layer()?.dataset.motion).toBe('none');
    } finally {
      window.matchMedia = original;
    }
  });

  it('wraps a DOM child with merged handlers and a component child with a display contents span', () => {
    const onKeyDown = vi.fn();
    render(
      <>
        <Tooltip content={{ name: 'Field', doc: 'A field.' }}>
          <input aria-label="Field" onKeyDown={onKeyDown} />
        </Tooltip>
        <Tooltip content="Wrapped (W)">
          <ToolButton title="Inner" onClick={() => undefined} />
        </Tooltip>
      </>,
    );
    const field = screen.getByLabelText('Field');
    expect(field.getAttribute('data-tip')).toBe('Field');
    fireEvent.keyDown(field, { key: 'a' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    const wrapper = document.querySelector('.pt-tip-anchor');
    expect(wrapper?.getAttribute('data-tip')).toBe('Wrapped');
  });

  it('spreads onto any element through tipProps', () => {
    render(<span {...tipProps({ name: 'Mark', doc: 'A mark.' })}>x</span>);
    expect(document.querySelector('[data-tip="Mark"]')).not.toBeNull();
  });
});
