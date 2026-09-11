// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Thumb } from '../Thumb';

// Thumb (SPEC 5.5; MILESTONES M3 item 5): the static capture once it has decoded, the live clone
// while it is pending or failed, the blank plate when neither exists.
const HTML =
  '<section class="slide is-on" data-slide="s1"><div class="in"><h2>One</h2></div></section>';
const SHOT = {
  light: '/api/render/s1?theme=light&w=320&r=1',
  dark: '/api/render/s1?theme=dark&w=320&r=1',
};

afterEach(cleanup);

function state(container: HTMLElement): string | null {
  return container.querySelector('.ts-thumb')?.getAttribute('data-thumb') ?? null;
}

describe('Thumb', () => {
  it('shows the clone while the capture loads and the capture once it has decoded', () => {
    const { container } = render(<Thumb shot={SHOT} html={HTML} theme="light" />);
    expect(state(container)).toBe('clone');
    expect(container.querySelector('.ts-sheet.is-clone')).not.toBeNull();
    const img = container.querySelector<HTMLImageElement>('img.ts-thumb-img');
    expect(img?.getAttribute('src')).toBe(SHOT.light);
    fireEvent.load(img!);
    expect(state(container)).toBe('static');
    expect(container.querySelector('.ts-sheet.is-clone')).toBeNull();
    expect(container.querySelector('.ts-thumb')?.classList.contains('is-static')).toBe(true);
  });

  it('goes back to the clone on a theme change until the other twin has decoded, and stays on the clone when the capture fails', () => {
    const { container, rerender } = render(<Thumb shot={SHOT} html={HTML} theme="light" />);
    fireEvent.load(container.querySelector('img.ts-thumb-img')!);
    expect(state(container)).toBe('static');
    rerender(<Thumb shot={SHOT} html={HTML} theme="dark" />);
    expect(state(container)).toBe('clone');
    const dark = container.querySelector<HTMLImageElement>('img.ts-thumb-img');
    expect(dark?.getAttribute('src')).toBe(SHOT.dark);
    fireEvent.error(dark!);
    expect(state(container)).toBe('clone');
    expect(container.querySelector('img.ts-thumb-img')).toBeNull();
  });

  it('falls back to the light twin without a dark one and to the plate without html', () => {
    const { container } = render(
      <Thumb shot={{ light: SHOT.light }} theme="dark" fallbackText="07" />,
    );
    expect(state(container)).toBe('plate');
    expect(container.querySelector('.ts-thumb-plate')?.textContent).toBe('07');
    expect(container.querySelector('img.ts-thumb-img')?.getAttribute('src')).toBe(SHOT.light);
    const plain = render(<Thumb theme="light" fallbackText="08" />);
    expect(state(plain.container)).toBe('plate');
    expect(plain.container.querySelector('img')).toBeNull();
  });
});
