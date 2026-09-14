// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GROUP_ORDER, ShortcutsDialog, shortcutRows } from '../ShortcutsDialog';
import { hideTooltip } from '../Tooltip';

// The shortcuts dialog (gslides-parity SPEC 2.10, 10.1, 13.10; Cmd+/): Google's groups as
// headings in Google's order, every row real text, the Later rows greyed with their reason, a
// search box that filters, and no native title anywhere.

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('ShortcutsDialog', () => {
  it('lists Google’s groups in order with real rows and greys the Later ones', () => {
    render(<ShortcutsDialog platform="mac" onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const headings = [...dialog.querySelectorAll('h3')].map((h) => h.textContent);
    const order = GROUP_ORDER.filter((group) => headings.includes(group));
    expect(headings).toEqual(order);
    expect(headings[0]).toBe('Common actions');
    expect(headings).toContain('Presenting');
    const rows = dialog.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(40);
    const undo = [...rows].find((row) => row.textContent?.startsWith('Undo'));
    expect(undo?.querySelector('kbd')?.textContent).toBe('Cmd Z');
    /* Italic is bound since SPEC-2 0.1; Insert comment is bound since SPEC-3 14 and the two step
       Next comment chord is listed under Comments; Select none stays a greyed row */
    const italic = dialog.querySelector('tr[data-binding="format.text.italic"]');
    expect(italic?.classList.contains('is-later')).toBe(false);
    expect(italic?.querySelector('kbd')?.textContent).toBe('Cmd I');
    const comment = dialog.querySelector('tr[data-binding="insert.comment"]');
    expect(comment?.classList.contains('is-later')).toBe(false);
    expect(comment?.textContent).not.toContain('Not available in Turboslide yet');
    expect(headings).toContain('Comments');
    const next = dialog.querySelector('tr[data-binding="key.comment.next"]');
    expect(next).not.toBeNull();
    expect(next?.classList.contains('is-later')).toBe(false);
    expect(next?.textContent).toContain('then C');
    /* a Later binding of the table keeps the greyed row with the stub sentence (Open audience tools) */
    const later = dialog.querySelector('tr[data-binding="key.present.audience"]');
    expect(later?.classList.contains('is-later')).toBe(true);
    expect(later?.textContent).toContain('Not available in Turboslide yet');
    for (const el of dialog.querySelectorAll('[title]')) expect(el, 'no native titles').toBeNull();
  });

  it('filters by a word of the action or the key', () => {
    render(<ShortcutsDialog platform="win" onClose={() => undefined} />);
    const search = screen.getByRole('searchbox', { name: 'Search shortcuts' });
    fireEvent.change(search, { target: { value: 'new slide' } });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const rows = [...dialog.querySelectorAll('tbody tr')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => /new slide/i.test(row.textContent ?? ''))).toBe(true);
    expect(rows[0]?.querySelector('kbd')?.textContent).toBe('Ctrl+M');
  });

  it('builds one row per binding with Windows words on Windows', () => {
    const rows = shortcutRows('win');
    const common = rows.get('Common actions') ?? [];
    const find = common.find((row) => row.label === 'Find and replace');
    expect(find?.keys).toEqual(['Ctrl+H']);
    const mac = shortcutRows('mac')
      .get('Common actions')
      ?.find((row) => row.label === 'Find and replace');
    expect(mac?.keys).toEqual(['Cmd Shift H']);
  });
});
