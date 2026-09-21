// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportMenu } from '../ExportMenu';
import type { ExportMenuProps } from '../ExportMenu';
import { TIP_DELAY_MS, TIP_ID, hideTooltip } from '../Tooltip';

// The Export menu's focus (this round): opened from the keyboard the dialog focuses its first
// control, opened with the pointer it takes focus itself so Tab walks its controls next; Escape
// closes it and returns focus to the Export button; every control, the bundle download included,
// carries the chrome's tooltip and no native title. Measured on the editor depth preview before
// the fix: Enter on export.open left focus on the button and the next Tab landed on view.mode.slide.

function Harness(props: Partial<ExportMenuProps>) {
  return (
    <ExportMenu
      open={props.open ?? false}
      onOpenChange={props.onOpenChange ?? (() => undefined)}
      capabilities={{ downloads: true, worker: 'local' }}
      progress={null}
      onExport={props.onExport ?? (() => undefined)}
      onBuild={props.onBuild ?? (() => undefined)}
      onDownloadBundle={props.onDownloadBundle ?? (() => undefined)}
    />
  );
}

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('ExportMenu focus', () => {
  it('focuses the first control on a keyboard open and returns focus to the button on Escape', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<Harness open={false} onOpenChange={onOpenChange} />);
    const button = screen.getByRole('button', { name: 'Export' });
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    rerender(<Harness open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole('dialog', { name: 'Export' });
    const first = dialog.querySelector<HTMLElement>('[data-control="export.mode.flatten"]');
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(document.activeElement).toBe(button);
  });

  it('takes focus itself on a pointer open, so Tab goes into the dialog and no tooltip shows', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<Harness open={false} onOpenChange={onOpenChange} />);
    const button = screen.getByRole('button', { name: 'Export' });
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    rerender(<Harness open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole('dialog', { name: 'Export' });
    expect(document.activeElement).toBe(dialog);
    expect(dialog.tabIndex).toBe(-1);
    expect(document.getElementById(TIP_ID)?.hidden ?? true).toBe(true);
  });

  it('carries the tooltip on the bundle download and every other control, with no native title', () => {
    render(<Harness open />);
    const dialog = screen.getByRole('dialog', { name: 'Export' });
    const bundle = dialog.querySelector<HTMLElement>('[data-control="export.bundle"]');
    if (!bundle) throw new Error('no bundle button');
    expect(bundle.getAttribute('data-tip')).toBe('Download deck bundle');
    expect(bundle.hasAttribute('title')).toBe(false);
    /* inside a dialog a tooltip shows on hover alone, never on keyboard focus (docs/PRODUCT.md
       3.1.1; audit-interface 4): the focus shows nothing, the pointer shows the sentence */
    hideTooltip();
    fireEvent.focus(bundle);
    expect(document.getElementById(TIP_ID)?.hidden ?? true).toBe(true);
    vi.useFakeTimers();
    fireEvent.mouseEnter(bundle);
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS);
    });
    vi.useRealTimers();
    expect(document.getElementById(TIP_ID)?.querySelector('.pt-tip-doc')?.textContent).toMatch(
      /^Runs deck\.pack/,
    );
    for (const control of dialog.querySelectorAll<HTMLElement>('button, input')) {
      expect(control.closest('[data-tip]')).not.toBeNull();
      expect(control.hasAttribute('title')).toBe(false);
    }
  });
});
