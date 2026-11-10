import { describe, expect, it } from 'vitest';

import { pinShowToStage, SHOW_BAR_ROW, showStageSize } from './show-stage';
import type { StageWatch } from './show-stage';

// The show's stage box (docs/archive/rounds/POLISH.md item 98; audit-pages item 44): the sheet's bottom edge
// stays clear of the bar's row on a short viewport, and a 16:9 screen keeps the whole box.
describe('showStageSize', () => {
  it('drops the bar row at 1280 by 800, where the letterbox is thinner than the bar', () => {
    const box = showStageSize({ width: 1280, height: 800 });
    expect(box).toEqual({ width: 1280, height: 800 - SHOW_BAR_ROW });
    // the 720 px sheet centred in 744 px ends at 732, above the row at 744
    const sheet = Math.min((box.width * 9) / 16, box.height);
    expect((box.height + sheet) / 2).toBeLessThanOrEqual(800 - SHOW_BAR_ROW);
  });

  it('drops the row at 1440 by 900 too, where the bar touched the sheet', () => {
    expect(showStageSize({ width: 1440, height: 900 })).toEqual({
      width: 1440,
      height: 900 - SHOW_BAR_ROW,
    });
  });

  it('keeps a tall box whole when the letterbox already clears the row', () => {
    expect(showStageSize({ width: 1280, height: 1000 })).toEqual({ width: 1280, height: 1000 });
  });

  it('keeps a 16:9 screen whole so the sheet runs edge to edge', () => {
    // no letterbox to put the bar in: the bar overlays the sheet and fades, as in full screen
    expect(showStageSize({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(showStageSize({ width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 });
  });

  it('passes an unmeasured box through', () => {
    expect(showStageSize({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

// The show is fixed on its stage's box and follows it (the presenter audit of a95d4097d, item 5):
// the window's resize event and the stage's ResizeObserver both report one resize, and the second
// report writes nothing; a move of the box alone is written too.
describe('pinShowToStage', () => {
  type Box = { left: number; top: number; width: number; height: number };

  function setup(start: Box) {
    let box = start;
    const writes: string[] = [];
    const values: Record<string, string> = {};
    const style = new Proxy(values, {
      set(target, key, value: string) {
        writes.push(`${String(key)}=${value}`);
        target[String(key)] = value;
        return true;
      },
    });
    const el = { style } as unknown as HTMLElement;
    const stage = { getBoundingClientRect: () => box } as unknown as Element;
    const reports: { observer: (() => void) | null; resize: (() => void) | null } = {
      observer: null,
      resize: null,
    };
    class FakeObserver {
      constructor(callback: () => void) {
        reports.observer = callback;
      }
      observe(): void {}
      disconnect(): void {
        reports.observer = null;
      }
    }
    const watch: StageWatch = {
      ResizeObserver: FakeObserver,
      onResize: (listener) => {
        reports.resize = listener;
        return () => {
          reports.resize = null;
        };
      },
    };
    const stop = pinShowToStage(el, stage, watch);
    return {
      stop,
      writes,
      values,
      reports,
      move: (next: Box) => {
        box = next;
      },
    };
  }

  it('fixes the show on the box at once', () => {
    const pin = setup({ left: 10, top: 20, width: 1280, height: 800 });
    expect(pin.values).toEqual({
      position: 'fixed',
      inset: 'auto',
      left: '10px',
      top: '20px',
      width: '1280px',
      height: '800px',
    });
  });

  it('writes one resize once, whichever of the two reports comes first', () => {
    const pin = setup({ left: 0, top: 0, width: 1280, height: 800 });
    const first = pin.writes.length;
    pin.move({ left: 0, top: 0, width: 1440, height: 900 });
    pin.reports.resize?.();
    pin.reports.observer?.();
    expect(pin.writes.length - first).toBe(6);
    expect(pin.values.height).toBe('900px');
    pin.reports.observer?.();
    pin.reports.resize?.();
    expect(pin.writes.length - first).toBe(6);
    /* the box moved without a new size: the window's report writes it */
    pin.move({ left: 40, top: 0, width: 1440, height: 900 });
    pin.reports.resize?.();
    expect(pin.values.left).toBe('40px');
  });

  it('stops both reports', () => {
    const pin = setup({ left: 0, top: 0, width: 1280, height: 800 });
    pin.stop();
    expect(pin.reports).toEqual({ observer: null, resize: null });
  });
});
