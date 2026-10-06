/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PHONE_WIDTH,
  SUBMENU_INDENT,
  VIEWPORT_MARGIN,
  fallbacksOf,
  phoneSubmenu,
  place,
  placeOnce,
  placementOf,
  pointAnchor,
} from '../place';

// place() on @floating-ui/dom (docs/DESIGN.md 2.4): the rules of the three functions it replaces
// (placeMenu, the tooltip's place, anchoredAt), read in jsdom with the window, the anchor's box and
// the plate's size stood in, since jsdom lays nothing out.

type Rect = { x: number; y: number; width: number; height: number };

function setViewport(width: number, height: number): void {
  for (const [key, value] of [
    ['clientWidth', width],
    ['clientHeight', height],
  ] as const)
    Object.defineProperty(document.documentElement, key, { configurable: true, value });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function anchorAt(rect: Rect): HTMLElement {
  const el = document.createElement('button');
  document.body.append(el);
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => rect,
    }) as DOMRect;
  return el;
}

function plateOf(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height });
  document.body.append(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  setViewport(1440, 900);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the placement rules', () => {
  it('maps the sides and alignments of the old functions to placements and their fallbacks', () => {
    expect(placementOf('below')).toBe('bottom-start');
    expect(placementOf('below', 'end')).toBe('bottom-end');
    expect(placementOf('below', 'center')).toBe('bottom');
    expect(placementOf('right')).toBe('right-start');
    expect(placementOf('point')).toBe('bottom-start');
    expect(fallbacksOf('below')).toEqual(['top-start']);
    expect(fallbacksOf('below', 'center')).toEqual(['top']);
    expect(fallbacksOf('right')).toEqual(['left-start']);
    expect(fallbacksOf('point')).toEqual(['bottom-end', 'top-start', 'top-end']);
  });

  it('drops a submenu under its row on a phone when neither side has room, and only then', () => {
    const row = { x: 20, y: 300, width: 340, height: 28 };
    expect(phoneSubmenu(row, { width: 300 }, 390)).toEqual({
      x: 20 + SUBMENU_INDENT,
      y: 328,
    });
    expect(phoneSubmenu(row, { width: 300 }, PHONE_WIDTH)).toBeNull();
    expect(phoneSubmenu({ ...row, x: 330, width: 50 }, { width: 300 }, 390)).toBeNull();
  });
});

describe('placeOnce', () => {
  it('puts a menu under its anchor, left aligned, 2 px below', async () => {
    const placed = await placeOnce(
      anchorAt({ x: 100, y: 40, width: 80, height: 28 }),
      plateOf(200, 300),
    );
    expect(placed).toMatchObject({ left: 100, top: 70, side: 'below', placement: 'bottom-start' });
  });

  it('moves it above when the window ends first', async () => {
    const placed = await placeOnce(
      anchorAt({ x: 100, y: 800, width: 80, height: 28 }),
      plateOf(200, 300),
    );
    expect(placed).toMatchObject({ left: 100, top: 800 - 2 - 300, side: 'above' });
  });

  it('centres the tooltip under its control with its 6 px gap', async () => {
    const placed = await placeOnce(
      anchorAt({ x: 600, y: 4, width: 32, height: 32 }),
      plateOf(120, 40),
      {
        align: 'center',
        gap: 6,
      },
    );
    expect(placed).toMatchObject({ left: 616 - 60, top: 42, side: 'below' });
  });

  it('keeps every plate 8 px inside the right edge', async () => {
    const placed = await placeOnce(
      anchorAt({ x: 1400, y: 40, width: 32, height: 28 }),
      plateOf(200, 100),
    );
    expect(placed.left).toBe(1440 - VIEWPORT_MARGIN - 200);
  });

  it('opens a submenu to the right of its row, overlapping by 4 px, and flips it left at the edge', async () => {
    const right = await placeOnce(
      anchorAt({ x: 300, y: 100, width: 220, height: 28 }),
      plateOf(200, 150),
      {
        side: 'right',
      },
    );
    expect(right).toMatchObject({ left: 516, top: 96, side: 'right' });
    const left = await placeOnce(
      anchorAt({ x: 1200, y: 100, width: 220, height: 28 }),
      plateOf(200, 150),
      {
        side: 'right',
      },
    );
    expect(left).toMatchObject({ left: 1004, side: 'left' });
  });

  it('drops a submenu under its row at 390 when neither side has room', async () => {
    setViewport(390, 844);
    const placed = await placeOnce(
      anchorAt({ x: 20, y: 300, width: 340, height: 28 }),
      plateOf(300, 150),
      {
        side: 'right',
      },
    );
    expect(placed).toMatchObject({ left: 36, top: 328, side: 'under-row' });
  });

  it('opens a context menu at the pointer, flipped left and up near the corner', async () => {
    const plate = plateOf(200, 300);
    expect(await placeOnce(pointAnchor(400, 300), plate, { side: 'point' })).toMatchObject({
      left: 400,
      top: 300,
    });
    expect(await placeOnce(pointAnchor(1400, 850), plate, { side: 'point' })).toMatchObject({
      left: 1200,
      top: 550,
    });
  });

  it('fits a tall menu inside the window with 8 px to spare and writes its max-height', async () => {
    setViewport(900, 360);
    const plate = plateOf(240, 600);
    const placed = await placeOnce(anchorAt({ x: 100, y: 40, width: 80, height: 28 }), plate, {
      fit: true,
    });
    expect(placed.maxHeight).not.toBeNull();
    expect(placed.maxHeight ?? 0).toBeLessThanOrEqual(360 - 2 * VIEWPORT_MARGIN);
    expect(placed.maxHeight ?? 0).toBeGreaterThanOrEqual(56);
    expect(placed.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
    expect(placed.top + (placed.maxHeight ?? 0)).toBeLessThanOrEqual(360 - VIEWPORT_MARGIN);
  });

  it('keeps a fitted plate taller than the room under its anchor under the anchor, scrolling inside', async () => {
    setViewport(900, 360);
    /* a plate whose box follows the max-height `fit` writes, as a browser's does */
    const plate = plateOf(240, 600);
    Object.defineProperty(plate, 'offsetHeight', {
      configurable: true,
      get: () => Math.min(600, parseFloat(plate.style.maxHeight) || 600),
    });
    const placed = await placeOnce(anchorAt({ x: 100, y: 40, width: 80, height: 28 }), plate, {
      fit: true,
    });
    /* the room under the anchor: 360 less the anchor's bottom (68), the 2 px gap and the margin */
    expect(placed).toMatchObject({ top: 70, side: 'below', maxHeight: 360 - 70 - VIEWPORT_MARGIN });
  });
});

describe('place', () => {
  it('writes the fixed position and data-place, follows the anchor, and stops on cleanup', async () => {
    let rect = { x: 100, y: 40, width: 80, height: 28 };
    const anchor = anchorAt(rect);
    anchor.getBoundingClientRect = () =>
      ({
        ...rect,
        left: rect.x,
        top: rect.y,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
      }) as DOMRect;
    const plate = plateOf(200, 100);
    const seen: number[] = [];
    const stop = place(anchor, plate, { onPlace: (placed) => seen.push(placed.top) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(plate.style.position).toBe('fixed');
    expect(plate.style.left).toBe('100px');
    expect(plate.style.top).toBe('70px');
    expect(plate.dataset.place).toBe('below');
    /* the panel scrolls by 120 px: the anchor moves up and the plate follows on the scroll event */
    rect = { ...rect, y: rect.y + 120 };
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(plate.style.top).toBe('190px');
    stop();
    rect = { ...rect, y: 400 };
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(plate.style.top).toBe('190px');
    expect(seen).toEqual([70, 190]);
  });
});
