// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PANEL_BROKEN, PanelBoundary, RELOAD_PANEL } from './PanelBoundary';
import { hideTooltip } from './Tooltip';

// The panel boundary (hardening HR-O#7, RELIABILITY-23): a render error inside it draws the
// sentence in place, reports once, leaves what sits beside it standing, and Reload Panel mounts
// the children again.

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('PanelBoundary', () => {
  it('draws the sentence in place, reports the error and reloads the panel', () => {
    let fail = true;
    const Panel = () => {
      if (fail) throw new Error('panel render failed');
      return createElement('p', null, 'Panel body');
    };
    const onError = vi.fn();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      createElement(
        'div',
        null,
        createElement('p', null, 'The stage'),
        createElement(
          PanelBoundary,
          { place: 'panel', control: 'panel.broken', onError },
          createElement(Panel),
        ),
      ),
    );
    quiet.mockRestore();
    expect(screen.getByText(PANEL_BROKEN)).toBeTruthy();
    expect(screen.getByText('The stage')).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('panel render failed');
    fail = false;
    fireEvent.click(screen.getByText(RELOAD_PANEL));
    expect(screen.getByText('Panel body')).toBeTruthy();
    expect(screen.queryByText(PANEL_BROKEN)).toBeNull();
  });
});
