// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeckGuides, GUIDE_HIT_PX } from '../DeckGuides';
import { hideTooltip } from '../Tooltip';

// The deck's guide lines (gslides-parity SPEC-2 6.1 row 30): drawn across the sheet in the
// overlay, dragged with the inch readout, opened for their menu on a right-click.

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('DeckGuides', () => {
  it('draws one titanium line per guide at the stage scale, named and focusable, with the tooltip primitive', () => {
    const onGuideDown = vi.fn();
    const onGuideContextMenu = vi.fn();
    const { container } = render(
      <DeckGuides
        guides={{ x: [400, 800], y: [450] }}
        k={0.5}
        dragging={null}
        onGuideDown={onGuideDown}
        onGuideContextMenu={onGuideContextMenu}
      />,
    );
    const lines = container.querySelectorAll<HTMLElement>('.ts-deck-guide');
    expect(lines).toHaveLength(3);
    const vertical = container.querySelector<HTMLElement>('[data-control="guide.x.800"]');
    if (!vertical) throw new Error('no guide');
    expect(vertical.style.left).toBe(`${400 - Math.floor(GUIDE_HIT_PX / 2)}px`);
    expect(vertical.getAttribute('role')).toBe('separator');
    expect(vertical.getAttribute('aria-label')).toBe('Vertical guide at 6.67 in');
    expect(vertical.getAttribute('data-tip')).toBe('Vertical guide');
    expect(vertical.hasAttribute('title')).toBe(false);
    const horizontal = container.querySelector<HTMLElement>('[data-control="guide.y.450"]');
    expect(horizontal?.style.top).toBe(`${225 - Math.floor(GUIDE_HIT_PX / 2)}px`);
    fireEvent.pointerDown(vertical, { button: 0 });
    expect(onGuideDown).toHaveBeenCalledWith('x', 800, expect.anything());
    fireEvent.contextMenu(vertical);
    expect(onGuideContextMenu).toHaveBeenCalledWith('x', 800, expect.anything());
  });

  it('draws a dragged guide at its live position with the inch readout, and a new one from a ruler', () => {
    const { container } = render(
      <DeckGuides
        guides={{ x: [800], y: [] }}
        k={0.5}
        dragging={{ axis: 'x', at: 960, label: '8.00 in', from: 800 }}
        onGuideDown={vi.fn()}
        onGuideContextMenu={vi.fn()}
      />,
    );
    const line = container.querySelector<HTMLElement>('[data-control="guide.x.800"]');
    expect(line?.style.left).toBe(`${480 - Math.floor(GUIDE_HIT_PX / 2)}px`);
    expect(container.querySelector('.ts-guide-readout')?.textContent).toBe('8.00 in');
    expect(container.querySelector('.ts-deck-guide.is-new')).toBeNull();
    cleanup();
    const fresh = render(
      <DeckGuides
        guides={{ x: [], y: [] }}
        k={0.5}
        dragging={{ axis: 'y', at: 300, label: '2.50 in' }}
        onGuideDown={vi.fn()}
        onGuideContextMenu={vi.fn()}
      />,
    );
    expect(fresh.container.querySelector('.ts-deck-guide.is-new')).not.toBeNull();
    expect(fresh.container.querySelector('.ts-guide-readout')?.textContent).toBe('2.50 in');
  });
});
