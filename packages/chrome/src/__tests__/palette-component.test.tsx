// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import type { EditorDispatch } from '../dispatch';
import { Palette } from '../Palette';
import type { PaletteContext } from '../palette-data';
import { buildPaletteEntries } from '../palette-data';

// The palette (SPEC 6.3): the filter with its prefixes, keyboard first, Enter runs the action
// through the dispatcher.
const document = workedDocument();
const noop = () => undefined;

function entries() {
  const ctx: PaletteContext = {
    deck: document.deck,
    slides: document.slides,
    slideId: 'content-rule',
    revision: 412,
    versions: [],
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
  return buildPaletteEntries(ctx);
}

const QUERY = 'Search slides, actions, blocks and views';

afterEach(cleanup);

describe('Palette', () => {
  it('restricts to the actions with > and runs the first on Enter through the dispatcher', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => []);
    const onClose = vi.fn();
    render(<Palette open entries={entries()} dispatch={dispatch} onClose={onClose} />);
    const input = screen.getByLabelText(QUERY);
    fireEvent.change(input, { target: { value: '>lint' } });
    expect(screen.getByText('Actions')).toBeTruthy();
    expect(screen.queryByText('Go to slide')).toBeNull();
    expect(screen.queryByText('Insert')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('lint.run', { slideIds: 'all', layers: 'static' });
    expect(onClose).toHaveBeenCalled();
  });

  it('restricts to slides with # and carries data-preview on every slide row', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(<Palette open entries={entries()} dispatch={dispatch} onClose={noop} />);
    fireEvent.change(screen.getByLabelText(QUERY), { target: { value: '#' } });
    expect(screen.getByText('Go to slide')).toBeTruthy();
    expect(screen.queryByText('Actions')).toBeNull();
    const rows = screen.getAllByRole('option');
    expect(rows).toHaveLength(7);
    for (const row of rows) expect(row.getAttribute('data-preview')).toBeTruthy();
  });

  it('moves the active row with the arrows and goes to the chosen slide', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(<Palette open entries={entries()} dispatch={dispatch} onClose={noop} />);
    const input = screen.getByLabelText(QUERY);
    fireEvent.change(input, { target: { value: '#' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const rows = screen.getAllByRole('option');
    expect(rows[1]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith('view.goto', {
      slideId: rows[1]?.getAttribute('data-preview'),
    });
  });

  it('asks for the one field a prompt entry needs and then dispatches', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(<Palette open entries={entries()} dispatch={dispatch} onClose={noop} />);
    const input = screen.getByLabelText(QUERY);
    fireEvent.change(input, { target: { value: '>save version' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(dispatch).not.toHaveBeenCalled();
    const note = screen.getByLabelText('Save version: Version note');
    fireEvent.change(note, { target: { value: 'Before the copy pass' } });
    fireEvent.keyDown(note, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith('version.save', { note: 'Before the copy pass' });
  });

  it('reports what an entry still needs instead of dispatching', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const onNotice = vi.fn();
    render(
      <Palette open entries={entries()} dispatch={dispatch} onClose={noop} onNotice={onNotice} />,
    );
    const input = screen.getByLabelText(QUERY);
    fireEvent.change(input, { target: { value: '>add asset' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('Add asset'));
  });

  it('closes on Escape and draws nothing while closed', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Palette open entries={entries()} dispatch={vi.fn<EditorDispatch>()} onClose={onClose} />,
    );
    fireEvent.keyDown(screen.getByLabelText(QUERY), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    cleanup();
    const closed = render(
      <Palette
        open={false}
        entries={entries()}
        dispatch={vi.fn<EditorDispatch>()}
        onClose={onClose}
      />,
    );
    expect(closed.container.innerHTML).toBe('');
    expect(container).toBeTruthy();
  });
});
