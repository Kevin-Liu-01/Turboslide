import { describe, expect, it } from 'vitest';

import { SHOW_BAR_ROW, showStageSize } from './show-stage';

// The show's stage box (docs/POLISH.md item 98; audit-pages item 44): the sheet's bottom edge
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
