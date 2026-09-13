import { describe, expect, it } from 'vitest';

import { fitSheetAt } from '../Sheet';
import {
  centerForScroll,
  centerKeepingPoint,
  clampZoom,
  formatZoom,
  parseZoomInput,
  scrollForCenter,
  stepZoom,
  ZOOM_LADDER,
  ZOOM_MAX,
  zoomFromWheel,
} from '../zoom';

// Zoom and pan (gslides-parity SPEC-2 6.1 rows 27 and 28, 0.81, 0.101): the ladder, the clamp at
// 1600 percent, the Zoom box's text, the centre math of view.zoom and of a pinch.

describe('the ladder', () => {
  it('steps to the neighbouring rung from any effective zoom and holds at the ends', () => {
    expect(ZOOM_LADDER).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8, 16]);
    expect(stepZoom(0.865, 1)).toBe(1);
    expect(stepZoom(0.865, -1)).toBe(0.75);
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(16, 1)).toBe(16);
    expect(stepZoom(0.25, -1)).toBe(0.25);
    expect(stepZoom(8, 1)).toBe(16);
  });

  it('clamps to 25 and 1600 percent', () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(40)).toBe(ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(zoomFromWheel(1, -400)).toBeCloseTo(Math.E, 6);
    expect(zoomFromWheel(1, 100000)).toBe(0.25);
  });

  it('reads the Zoom box: Fit, a percent, a bare number', () => {
    expect(parseZoomInput('Fit')).toBe('fit');
    expect(parseZoomInput(' fit ')).toBe('fit');
    expect(parseZoomInput('150%')).toBe(1.5);
    expect(parseZoomInput('150')).toBe(1.5);
    expect(parseZoomInput('1600')).toBe(16);
    expect(parseZoomInput('5000')).toBe(16);
    expect(parseZoomInput('abc')).toBeNull();
    expect(parseZoomInput('')).toBeNull();
    expect(formatZoom('fit')).toBe('Fit');
    expect(formatZoom(1.5)).toBe('150%');
    expect(formatZoom(16)).toBe('1600%');
  });
});

describe('the centre math', () => {
  const viewport = { width: 1440, height: 848 };

  it('scrolls the named sheet point under the stage centre and reads it back', () => {
    const fit = fitSheetAt({ aw: 1440, ah: 848, pad: 28, zoom: 2 });
    expect(fit.width).toBe(3200);
    const scroll = scrollForCenter({ x: 800, y: 450 }, fit, viewport);
    /* the sheet's centre sits at fit.left + 1 + 1600 inside the scrolled surface */
    expect(scroll.left).toBe(fit.left + 1 + 1600 - 720);
    expect(scroll.top).toBe(fit.top + 1 + 900 - 424);
    const back = centerForScroll(scroll, fit, viewport);
    expect(back.x).toBeCloseTo(800, 6);
    expect(back.y).toBeCloseTo(450, 6);
    expect(scrollForCenter({ x: 0, y: 0 }, fit, viewport)).toEqual({ left: 0, top: 0 });
  });

  it('keeps the point under the pointer through a pinch', () => {
    /* the pointer sits 320 px right of the stage centre; after the zoom to 2 the sheet point under
       it stays there, so the centre point is 160 sheet px left of it */
    const under = { x: 1000, y: 500 };
    const centre = centerKeepingPoint(under, { x: 1040, y: 424 }, viewport, 2);
    expect(centre).toEqual({ x: 1000 + (720 - 1040) / 2, y: 500 });
  });

  it('scales the sheet to 25600 px at 1600 percent, which the stage scrolls (0.101)', () => {
    const fit = fitSheetAt({ aw: 1440, ah: 848, pad: 28, zoom: 16 });
    expect(fit.width).toBe(25600);
    expect(fit.height).toBe(14400);
  });
});
