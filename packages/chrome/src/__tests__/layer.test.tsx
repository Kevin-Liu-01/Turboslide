/**
 * @vitest-environment jsdom
 */
import { createElement, useRef } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LAYERS } from '@turboslide/theme/scale';
import type { LayerName } from '@turboslide/theme/scale';

import {
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
