// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SNACKBAR_HOLD_MS, Snackbar, useSnackbar } from '../Snackbar';
import { hideTooltip } from '../Tooltip';

// The snackbar (SPEC 1.1, 11.3): one sentence, at most one action, an X; held 5 s; a new message
// replaces the one on screen; the action runs and dismisses; Esc dismisses while the action or the
// X has focus and does nothing elsewhere; the plate is a status live region that stays mounted.

function Harness({
  onShow,
}: {
  onShow: (show: (text: string, action?: { label: string; run: () => void }) => void) => void;
}) {
  const snack = useSnackbar();
  onShow(snack.show);
  return (
    <>
      <button type="button" id="elsewhere">
        Elsewhere
      </button>
      <Snackbar message={snack.message} onDismiss={snack.dismiss} />
    </>
  );
}

let show: (text: string, action?: { label: string; run: () => void }) => void = () => undefined;

function mount() {
  render(
    <Harness
      onShow={(fn) => {
        show = fn;
      }}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  hideTooltip();
  cleanup();
  vi.useRealTimers();
});

describe('Snackbar', () => {
  it('stays mounted as a status region and shows a message for five seconds', () => {
    mount();
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.classList.contains('is-on')).toBe(false);
    expect(region.textContent).toBe('');
    act(() => show('Slide deleted', { label: 'Undo', run: () => undefined }));
    expect(region.classList.contains('is-on')).toBe(true);
    expect(region.textContent).toContain('Slide deleted');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' }).getAttribute('data-tip')).toBe(
      'Dismiss',
    );
    act(() => {
      vi.advanceTimersByTime(SNACKBAR_HOLD_MS - 1);
    });
    expect(region.classList.contains('is-on')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region.classList.contains('is-on')).toBe(false);
    expect(SNACKBAR_HOLD_MS).toBe(5000);
  });

  it('runs the one action and dismisses; the X dismisses', () => {
    mount();
    const run = vi.fn();
    act(() => show('Moved to trash', { label: 'Undo', run }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').classList.contains('is-on')).toBe(false);
    act(() => show('Link copied'));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByRole('status').classList.contains('is-on')).toBe(false);
  });

  it('dismisses on Esc while its action has focus, not from elsewhere', () => {
    mount();
    act(() => show('Row added', { label: 'Undo', run: () => undefined }));
    const elsewhere = document.getElementById('elsewhere') as HTMLElement;
    elsewhere.focus();
    fireEvent.keyDown(elsewhere, { key: 'Escape' });
    expect(screen.getByRole('status').classList.contains('is-on')).toBe(true);
    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    fireEvent.keyDown(undo, { key: 'Escape' });
    expect(screen.getByRole('status').classList.contains('is-on')).toBe(false);
  });

  it('replaces the message on screen and restarts the hold', () => {
    mount();
    act(() => show('Slide deleted'));
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => show('Deleted 3 slides'));
    const region = screen.getByRole('status');
    expect(region.textContent).toContain('Deleted 3 slides');
    expect(region.textContent).not.toContain('Slide deleted');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(region.classList.contains('is-on')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(region.classList.contains('is-on')).toBe(false);
  });
});
