// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolButton } from '../ToolButton';
import {
  TIP_DELAY_MS,
  TIP_ID,
  Tooltip,
  hideTooltip,
  isKeyLike,
  shownTooltipAnchor,
  tipOf,
  tipProps,
} from '../Tooltip';

// The Tooltip primitive (Kevin, 2026-09-11: "have good tooltips in all control surfaces"): the
// name, the sentence and the key from a title-like string; shown after 350 ms of hover and at
// once on keyboard focus; one layer at a time; hidden on Escape and when the pointer leaves.
function layer(): HTMLElement | null {
  return document.getElementById(TIP_ID);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  hideTooltip();
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
    fireEvent.focus(button);
    expect(layer()?.hidden).toBe(false);
    expect(shownTooltipAnchor()).toBe(button);
    fireEvent.blur(button);
    expect(layer()?.hidden).toBe(true);
    /* a press hides what is up and the focus that follows shows nothing */
    fireEvent.mouseDown(button);
    fireEvent.focus(button);
    expect(layer()?.hidden).toBe(true);
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
    fireEvent.mouseEnter(first);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS);
    });
    expect(shownTooltipAnchor()).toBe(first);
    /* while one is up the next shows at once */
    fireEvent.mouseEnter(second);
    expect(shownTooltipAnchor()).toBe(second);
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(layer()?.querySelector('.pt-tip-name')?.textContent).toBe('Second');
    expect(first.hasAttribute('aria-describedby')).toBe(false);
    expect(second.getAttribute('aria-describedby')).toBe(TIP_ID);
  });

  it('hides on Escape', () => {
    render(<ToolButton title="Help (?)" onClick={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Help' });
    fireEvent.focus(button);
    expect(layer()?.hidden).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(layer()?.hidden).toBe(true);
  });

  it('cancels a pending hover when the pointer leaves before the delay', () => {
    render(<ToolButton title="Copy link" onClick={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Copy link' });
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
      fireEvent.focus(screen.getByRole('button', { name: 'Theme' }));
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
