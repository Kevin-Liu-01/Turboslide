// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePtShell } from '../shell-context';
import type { ShellState } from '../shell-context';
import type { ShellSection } from '../shell-data';
import { hideTooltip } from '../Tooltip';
import { ViewerShell } from '../ViewerShell';

// A show starts and ends as one cut (the slide motion round): the sidebar column of the viewer
// and the editor animated its width for 220 ms as the show opened and closed, and the stage refit
// and rasterized the slide again on every frame of it, while the toolbar left at once. Presenting
// now changes the columns without their transition (data-present-shift, ViewerShell.css) and runs
// no sidebar motion; the shift clears once a frame has drawn the new columns.

const SECTIONS: ShellSection[] = [
  {
    id: 'one',
    label: 'One',
    items: ['a', 'b'].map((id, i) => ({
      id,
      n: String(i + 1),
      title: id,
      kind: 'content',
      html: `<section class="slide" data-slide="${id}"></section>`,
    })),
  },
];

let frames: FrameRequestCallback[] = [];
let shell: ShellState | null = null;

function Grab() {
  shell = usePtShell();
  return null;
}

async function flushFrames(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    const run = frames;
    frames = [];
    await act(async () => {
      for (const frame of run) frame(0);
    });
  }
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.push(frame);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  hideTooltip();
  cleanup();
  vi.unstubAllGlobals();
  shell = null;
});

describe('presenting', () => {
  it('opens and closes the show without the column transition or the list motion', async () => {
    const view = render(
      <ViewerShell
        id="deck:present"
        title="Present"
        count="2 slides"
        sections={SECTIONS}
        modes={['slide', 'grid']}
        thumb="row"
        hash={false}
        keys="paged"
      >
        <Grab />
      </ViewerShell>,
    );
    await flushFrames();
    const root = view.container.querySelector<HTMLElement>('.pt-viewer');
    expect(root?.hasAttribute('data-settled')).toBe(true);

    await act(async () => shell?.setPresent(true));
    expect(root?.classList.contains('is-present')).toBe(true);
    expect(root?.hasAttribute('data-present-shift')).toBe(true);
    expect(root?.hasAttribute('data-sb-moving')).toBe(false);
    await flushFrames();
    expect(root?.hasAttribute('data-present-shift')).toBe(false);

    await act(async () => shell?.setPresent(false));
    expect(root?.classList.contains('is-present')).toBe(false);
    /* the frame the show ends on: is-present is gone, the shift keeps the columns from animating */
    expect(root?.hasAttribute('data-present-shift')).toBe(true);
    expect(root?.hasAttribute('data-sb-moving')).toBe(false);
    await flushFrames();
    expect(root?.hasAttribute('data-present-shift')).toBe(false);
  });
});
