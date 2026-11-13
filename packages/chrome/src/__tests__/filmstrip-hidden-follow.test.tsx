// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';
import { createClipboardStore } from '@turboslide/viewer/clipboard';

import type { EditorDispatch } from '../dispatch';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import type { ShellSection } from '../shell-data';
import { Sidebar } from '../Sidebar';
import type { SidebarEdit } from '../Sidebar';
import { hideTooltip } from '../Tooltip';

// The editor's filmstrip during a show (the slide motion round): the strip is hidden, and every
// move of the show measured the current card and scrolled the hidden strip (15 ms of forced
// layout per move at 4x CPU on /edit/<id>, and its scroll brought new cards near, which mounted
// their clones), and reset the selection to the current card, which rendered the whole editor a
// second time. A hidden strip follows and resets nothing; both happen when it shows again.

const worked = workedDocument();
const IDS = ['opener-brand', 'title', 'thesis', 'content-rule'];
const SECTIONS: ShellSection[] = [
  {
    id: 'brand',
    label: 'Brand',
    items: IDS.map((id, i) => ({
      id,
      n: String(i + 1),
      title: id,
      kind: worked.slides[id]?.kind ?? 'content',
      html: `<section class="slide is-on" data-slide="${id}"></section>`,
    })),
  },
];
const ITEMS = SECTIONS.flatMap((section) => section.items);
const HANDLERS = {
  setMode: vi.fn(),
  setDensity: vi.fn(),
  setSidebar: vi.fn(),
  setPanel: vi.fn(),
  setHelp: vi.fn(),
  setPresent: vi.fn(),
  select: vi.fn(),
  step: vi.fn(),
  say: vi.fn(),
};

function shellState(active: string, present: boolean): ShellState {
  return {
    id: 'edit:hidden',
    modes: ['slide', 'grid'],
    keys: 'paged',
    noun: 'slide',
    items: ITEMS,
    paged: ITEMS,
    mode: 'slide',
    density: 'thumbs',
    sidebarOpen: true,
    sidebarShown: !present,
    panelOpen: false,
    helpOpen: false,
    present,
    narrow: false,
    active,
    index: IDS.indexOf(active),
    total: IDS.length,
    ready: true,
    ...HANDLERS,
  };
}

const dispatch: EditorDispatch = () => Promise.resolve({});
const selections: string[][] = [];
const EDIT: SidebarEdit = {
  revision: 1,
  dispatch,
  document: worked,
  deck: worked.deck,
  clipboard: createClipboardStore(null),
  onSelectionChange: (ids) => selections.push([...ids]),
};

function strip(active: string, present: boolean) {
  return (
    <ShellContext value={shellState(active, present)}>
      <Sidebar
        title="Hidden"
        count="4 slides"
        sections={SECTIONS}
        thumb="shot"
        hrefFor={(item) => `#s/${item.id}`}
        edit={EDIT}
      />
    </ShellContext>
  );
}

let frames: FrameRequestCallback[] = [];

async function flushFrames(): Promise<void> {
  const run = frames;
  frames = [];
  await act(async () => {
    for (const frame of run) frame(0);
  });
}

beforeEach(() => {
  frames = [];
  selections.length = 0;
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
  vi.restoreAllMocks();
});

describe('the filmstrip during a show', () => {
  it('measures no card while the show hides it, and follows when it shows again', async () => {
    const view = render(strip('title', true));
    await flushFrames();
    const measured = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    view.rerender(strip('thesis', true));
    await flushFrames();
    view.rerender(strip('content-rule', true));
    await flushFrames();
    expect(measured).not.toHaveBeenCalled();
    view.rerender(strip('content-rule', false));
    await flushFrames();
    expect(measured).toHaveBeenCalled();
  });

  it('reports no selection while the show hides it, and the current card when it shows', async () => {
    const view = render(strip('title', true));
    await flushFrames();
    selections.length = 0;
    view.rerender(strip('thesis', true));
    view.rerender(strip('content-rule', true));
    await flushFrames();
    /* each report reached the editor's state and rendered the whole editor again */
    expect(selections).toEqual([]);
    view.rerender(strip('content-rule', false));
    await flushFrames();
    expect(selections).toEqual([['content-rule']]);
  });
});
