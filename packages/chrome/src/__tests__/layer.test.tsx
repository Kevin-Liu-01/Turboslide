/**
 * @vitest-environment jsdom
 */
import { createElement, useRef } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LAYERS } from '@turboslide/theme/scale';
import type { LayerName } from '@turboslide/theme/scale';
import { EXIT_COPY_ATTRIBUTE, REDUCE_MOTION_ATTRIBUTE } from '@turboslide/viewer/reduce-motion';

import {
  EXIT_COPY_MS,
  closeLayer,
  openLayer,
  openLayers,
  resetLayersForTests,
  topLayerSupported,
  useLayer,
} from '../Layer';

// The Layer primitive (docs/DESIGN.md 2.3): jsdom has no Popover API, so one test runs the
// fallback (the scale's z-index in the DOM place) and the others install a top layer that keeps
// the browser's rule, newest shown on top, so the manager's reorder is read from it.

type Proto = { showPopover?: () => void; hidePopover?: () => void };
const proto = HTMLElement.prototype as unknown as Proto;
/** The browser's top layer as the stand-in keeps it: bottom first. */
let topLayer: HTMLElement[] = [];
let calls: string[] = [];

function installTopLayer(): void {
  proto.showPopover = function showPopover(this: HTMLElement) {
    if (!this.isConnected) throw new DOMException('not connected', 'InvalidStateError');
    if (this.getAttribute('popover') === null)
      throw new DOMException('no popover attribute', 'NotSupportedError');
    if (topLayer.includes(this)) return;
    topLayer.push(this);
    calls.push(`show ${this.id}`);
  };
  proto.hidePopover = function hidePopover(this: HTMLElement) {
    topLayer = topLayer.filter((each) => each !== this);
    calls.push(`hide ${this.id}`);
  };
}

function removeTopLayer(): void {
  delete proto.showPopover;
  delete proto.hidePopover;
}

function surface(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  document.body.append(el);
  return el;
}

beforeEach(() => {
  resetLayersForTests();
  topLayer = [];
  calls = [];
  document.body.innerHTML = '';
});

afterEach(() => {
  removeTopLayer();
});

describe('the fallback without the Popover API', () => {
  it('writes the scale z-index and data-layer and leaves the element in its DOM place', () => {
    removeTopLayer();
    expect(topLayerSupported()).toBe(false);
    const menu = surface('menu');
    openLayer(menu, 'popover');
    expect(menu.style.zIndex).toBe(String(LAYERS.popover));
    expect(menu.dataset.layer).toBe('popover');
    expect(menu.hasAttribute('popover')).toBe(false);
    expect(openLayers().map((entry) => entry.element.id)).toEqual(['menu']);
    closeLayer(menu);
    expect(openLayers()).toEqual([]);
  });
});

describe('the top layer in the scale order', () => {
  beforeEach(installTopLayer);

  it('puts a surface in the top layer as a manual popover, and takes it out on close', () => {
    expect(topLayerSupported()).toBe(true);
    const tip = surface('tip');
    openLayer(tip, 'tooltip');
    expect(tip.getAttribute('popover')).toBe('manual');
    expect(tip.dataset.layer).toBe('tooltip');
    expect(tip.style.zIndex).toBe('70');
    expect(topLayer).toEqual([tip]);
    closeLayer(tip);
    expect(topLayer).toEqual([]);
    expect(tip.hasAttribute('popover')).toBe(false);
    /* the order stays on the element, so a plate that fades out keeps it */
    expect(tip.style.zIndex).toBe('70');
  });

  it('keeps a surface opened later at a lower layer under every open higher one (Kevin’s screenshot: the tooltip over the bar)', () => {
    const tip = surface('tip');
    const bar = surface('bar');
    openLayer(tip, 'tooltip');
    openLayer(bar, 'bar');
    expect(topLayer.map((el) => el.id)).toEqual(['bar', 'tip']);
    expect(openLayers().map((entry) => entry.layer)).toEqual(['bar', 'tooltip']);
  });

  it('draws a toast over a dialog, a menu over the dialog, and the tooltip over all three, in any opening order', () => {
    const orders: LayerName[][] = [
      ['dialog', 'popover', 'toast', 'tooltip'],
      ['tooltip', 'toast', 'popover', 'dialog'],
      ['toast', 'dialog', 'tooltip', 'popover'],
    ];
    for (const order of orders) {
      resetLayersForTests();
      topLayer = [];
      document.body.innerHTML = '';
      for (const layer of order) openLayer(surface(layer), layer);
      expect(
        topLayer.map((el) => el.id),
        order.join(' then '),
      ).toEqual(['dialog', 'popover', 'toast', 'tooltip']);
    }
  });

  it('puts the newest surface of one layer on top, so a submenu sits over its menu with no level', () => {
    const menu = surface('menu');
    const sub = surface('sub');
    const tip = surface('tip');
    openLayer(tip, 'tooltip');
    openLayer(menu, 'popover');
    openLayer(sub, 'popover');
    expect(topLayer.map((el) => el.id)).toEqual(['menu', 'sub', 'tip']);
    expect(sub.style.zIndex).toBe(menu.style.zIndex);
    /* opening the parent again moves it to the top of its layer */
    openLayer(menu, 'popover');
    expect(topLayer.map((el) => el.id)).toEqual(['sub', 'menu', 'tip']);
  });

  it('reshows only the surfaces above the new one, in ascending order, in the same task', () => {
    const dialog = surface('dialog');
    const toast = surface('toast');
    const tip = surface('tip');
    openLayer(dialog, 'dialog');
    openLayer(toast, 'toast');
    openLayer(tip, 'tooltip');
    calls = [];
    const menu = surface('menu');
    openLayer(menu, 'popover');
    expect(calls).toEqual(['hide tip', 'hide toast', 'show menu', 'show toast', 'show tip']);
  });

  it('keeps focus on the element that held it while the surfaces above are shown again', () => {
    const dialog = surface('dialog');
    const field = document.createElement('input');
    dialog.append(field);
    const tip = surface('tip');
    openLayer(dialog, 'dialog');
    openLayer(tip, 'tooltip');
    field.focus();
    /* a browser that moves focus on hide: the stand-in blurs the field */
    const hide = proto.hidePopover;
    proto.hidePopover = function hidePopover(this: HTMLElement) {
      (document.activeElement as HTMLElement | null)?.blur();
      hide?.call(this);
    };
    openLayer(surface('menu'), 'popover');
    expect(document.activeElement).toBe(field);
  });

  it('shows the open surfaces again in their order over an element that enters full screen', () => {
    const bar = surface('bar');
    const show = surface('show');
    const menu = surface('menu');
    openLayer(bar, 'bar');
    openLayer(show, 'show');
    openLayer(menu, 'popover');
    /* the document's root enters full screen: the browser puts it on top of the top layer */
    const root = surface('root');
    topLayer.push(root);
    calls = [];
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(calls).toEqual([
      'hide menu',
      'hide show',
      'hide bar',
      'show bar',
      'show show',
      'show menu',
    ]);
    expect(topLayer.map((el) => el.id)).toEqual(['root', 'bar', 'show', 'menu']);
  });

  it('drops a surface whose element left the document', () => {
    const menu = surface('menu');
    openLayer(menu, 'popover');
    menu.remove();
    expect(openLayers()).toEqual([]);
    /* a later surface at a lower layer does not try to hide or reshow it */
    calls = [];
    openLayer(surface('dialog'), 'dialog');
    expect(calls).toEqual(['show dialog']);
  });
});

describe('useLayer', () => {
  beforeEach(installTopLayer);

  function Plate({ open, layer }: { open: boolean; layer: LayerName }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayer(ref, { layer, open });
    return createElement('div', { ref, id: 'plate' });
  }

  it('opens the surface while open is true and closes it on false and on unmount', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    act(() => root.render(createElement(Plate, { open: true, layer: 'popover' })));
    const plate = document.getElementById('plate') as HTMLElement;
    expect(topLayer).toEqual([plate]);
    expect(plate.dataset.layer).toBe('popover');
    act(() => root.render(createElement(Plate, { open: false, layer: 'popover' })));
    expect(topLayer).toEqual([]);
    act(() => root.render(createElement(Plate, { open: true, layer: 'toast' })));
    expect(plate.dataset.layer).toBe('toast');
    expect(topLayer).toEqual([plate]);
    act(() => root.unmount());
    expect(topLayer).toEqual([]);
    expect(openLayers()).toEqual([]);
  });
});

// Exit motion (the Glyphfield port, PLAN.md wave 2 item 7, from Glyphfield's useExitGhost.test.tsx):
// a surface that asks for `exit` closes at once and leaves an inert copy in the top layer while
// the copy's exit animation plays. jsdom has no Web Animations, so the stand-in below answers
// `getAnimations()` with one animation for an exit copy (the sheets' `[data-exiting]` rules) and
// none for anything else.
describe('the exit copy of a closed surface', () => {
  type AnimatedProto = { getAnimations?: () => unknown[] };
  const animated = HTMLElement.prototype as unknown as AnimatedProto;
  let root: Root;
  let host: HTMLElement;

  function installAnimations(): void {
    animated.getAnimations = function getAnimations(this: HTMLElement) {
      return this.hasAttribute(EXIT_COPY_ATTRIBUTE) ? [{}] : [];
    };
  }

  /** A menu that unmounts as it closes, with ids, roles and control ids inside it. */
  function Menu({
    open,
    exit = true,
    id = 'menu',
  }: {
    open: boolean;
    exit?: boolean;
    id?: string;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayer(ref, { layer: 'popover', open, exit });
    return open
      ? createElement(
          'div',
          {
            ref,
            id,
            role: 'menu',
            className: 'ts-menu pt-float',
            'data-control': `menu.${id}`,
            'aria-label': 'File',
          },
          createElement(
            'button',
            {
              id: `${id}-open`,
              role: 'menuitem',
              'data-control': `menu.${id}.open`,
              'data-menu-item': `${id}.open`,
              type: 'button',
            },
            'Open',
          ),
          createElement('div', { className: 'ts-menu-list', 'data-list': '' }, 'rows'),
        )
      : null;
  }

  function render(node: ReturnType<typeof createElement>): void {
    act(() => root.render(node));
  }

  /** The microtask the hook makes the copy in, after the commit. */
  async function afterCommit(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
    });
  }

  const copies = (): HTMLElement[] => [
    ...document.querySelectorAll<HTMLElement>(`[${EXIT_COPY_ATTRIBUTE}]`),
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    installTopLayer();
    installAnimations();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    delete animated.getAnimations;
    document.documentElement.removeAttribute(REDUCE_MOTION_ATTRIBUTE);
    vi.useRealTimers();
  });

  it('closes the surface at once and leaves a copy with no id, role or control id, inert and hidden from the accessibility tree', async () => {
    render(createElement(Menu, { open: true }));
    const row = document.getElementById('menu-open') as HTMLElement;
    row.focus();
    expect(document.activeElement).toBe(row);
    render(createElement(Menu, { open: false }));
    /* focus, the open list and the document see the closed state at once */
    expect(document.getElementById('menu')).toBeNull();
    expect(openLayers()).toEqual([]);
    expect(document.activeElement).toBe(document.body);
    await afterCommit();
    const [copy, ...more] = copies();
    expect(more).toEqual([]);
    expect(copy?.className).toBe('ts-menu pt-float');
    expect(copy?.textContent).toBe('Openrows');
    expect(copy?.getAttribute('aria-hidden')).toBe('true');
    expect(copy?.hasAttribute('inert')).toBe(true);
    expect(
      document.querySelector(
        '[id], [role], [data-control], [data-menu-item], [aria-label], [tabindex]',
      ),
    ).toBeNull();
    /* in the top layer at the menu's layer, and not one of the open surfaces */
    expect(topLayer).toEqual([copy]);
    expect(copy?.getAttribute('popover')).toBe('manual');
    expect(copy?.dataset.layer).toBe('popover');
    expect(copy?.style.zIndex).toBe(String(LAYERS.popover));
    expect(openLayers()).toEqual([]);
    /* the focus stays where the close left it (jsdom does not apply inert to focus; the browser does) */
    expect(document.activeElement).toBe(document.body);
  });

  it("removes the copy after EXIT_COPY_MS, or on its own animationend and not a child's", async () => {
    render(createElement(Menu, { open: true }));
    render(createElement(Menu, { open: false }));
    await afterCommit();
    expect(copies()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(EXIT_COPY_MS - 1));
    expect(copies()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(copies()).toEqual([]);
    expect(topLayer).toEqual([]);

    render(createElement(Menu, { open: true }));
    render(createElement(Menu, { open: false }));
    await afterCommit();
    const [copy] = copies();
    copy
      ?.querySelector('.ts-menu-list')
      ?.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(copies()).toEqual([copy]);
    copy?.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(copies()).toEqual([]);
    expect(topLayer).toEqual([]);
  });

  it('goes into the body when the parent left with the surface (a menu portal root)', async () => {
    function Portal({ open }: { open: boolean }) {
      return open
        ? createElement('div', { className: 'ts-menu-root' }, createElement(Menu, { open }))
        : null;
    }
    render(createElement(Portal, { open: true }));
    render(createElement(Portal, { open: false }));
    await afterCommit();
    expect(document.querySelector('.ts-menu-root')).toBeNull();
    expect(copies()[0]?.parentElement).toBe(document.body);
  });

  it('leaves no copy under reduced motion, without Web Animations, without exit, or for a surface that stays mounted while closed', async () => {
    document.documentElement.setAttribute(REDUCE_MOTION_ATTRIBUTE, '');
    render(createElement(Menu, { open: true }));
    render(createElement(Menu, { open: false }));
    await afterCommit();
    expect(copies()).toEqual([]);
    document.documentElement.removeAttribute(REDUCE_MOTION_ATTRIBUTE);

    delete animated.getAnimations;
    render(createElement(Menu, { open: true }));
    render(createElement(Menu, { open: false }));
    await afterCommit();
    expect(copies()).toEqual([]);
    installAnimations();

    render(createElement(Menu, { open: true, exit: false }));
    render(createElement(Menu, { open: false, exit: false }));
    await afterCommit();
    expect(copies()).toEqual([]);

    function Kept({ open }: { open: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      useLayer(ref, { layer: 'popover', open, exit: true });
      return createElement('div', { ref, className: 'ts-dropdown-list', hidden: !open });
    }
    render(createElement(Kept, { open: true }));
    render(createElement(Kept, { open: false }));
    await afterCommit();
    expect(copies()).toEqual([]);
    expect(topLayer).toEqual([]);
  });

  it('leaves no copy for a sheet that gives it no animation', async () => {
    animated.getAnimations = () => [];
    render(createElement(Menu, { open: true }));
    render(createElement(Menu, { open: false }));
    await afterCommit();
    expect(copies()).toEqual([]);
    expect(topLayer).toEqual([]);
  });

  it('sits under a surface of its layer opened since and over a lower layer opened later', async () => {
    function Switch({ which }: { which: 'file' | 'edit' }) {
      return createElement(
        'div',
        null,
        createElement(Menu, { open: which === 'file', id: 'file' }),
        createElement(Menu, { open: which === 'edit', id: 'edit' }),
      );
    }
    /* the menu bar moves from File to Edit in one commit, as a hover over the next title does */
    render(createElement(Switch, { which: 'file' }));
    render(createElement(Switch, { which: 'edit' }));
    await afterCommit();
    const edit = document.getElementById('edit') as HTMLElement;
    const [copy] = copies();
    expect(topLayer).toEqual([copy, edit]);
    const dialog = surface('dialog');
    openLayer(dialog, 'dialog');
    expect(topLayer).toEqual([dialog, copy, edit]);
    expect(openLayers().map((entry) => entry.element)).toEqual([dialog, edit]);
  });

  it('keeps the scroll offsets the surface showed', async () => {
    const offsets = new WeakMap<Element, number>();
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get(this: Element) {
        return offsets.get(this) ?? 0;
      },
      set(this: Element, value: number) {
        offsets.set(this, value);
      },
    });
    try {
      render(createElement(Menu, { open: true }));
      const list = document.querySelector('.ts-menu-list') as HTMLElement;
      list.scrollTop = 120;
      list.dispatchEvent(new Event('scroll'));
      render(createElement(Menu, { open: false }));
      await afterCommit();
      expect(copies()[0]?.querySelector('.ts-menu-list')?.scrollTop).toBe(120);
      expect(copies()[0]?.scrollTop).toBe(0);
    } finally {
      if (descriptor) Object.defineProperty(Element.prototype, 'scrollTop', descriptor);
    }
  });
});
