// The pure rules of stage-rules.ts (the return round, docs/RETURN.md section 6, B3 objects): the
// guide a press at a crossing drags, who owns a Tab, and the draw readout.
import { describe, expect, it } from 'vitest';

import {
  GUIDE_HIT_PX,
  GUIDE_PICK_PX,
  READOUT_GAP,
  READOUT_H,
  crossingGuide,
  drawReadout,
  drawReadoutStyle,
  guideForTravel,
  sizeLabel,
  stageOwnsTab,
} from '../stage-rules';

const GUIDES = { x: [400, 800], y: [450] };
/** The half hit strip in sheet px at the 1440 by 900 stage's scale (k 0.705). */
const HIT = GUIDE_HIT_PX / 2 / 0.705;

describe('crossingGuide (arrange.guides.drag: the press at the sheet centre)', () => {
  it('finds the horizontal guide under a press at the vertical guide’s centre', () => {
    expect(crossingGuide({ axis: 'x', at: 800 }, { x: 800, y: 450 }, GUIDES, HIT)).toEqual({
      axis: 'y',
      at: 450,
    });
  });
  it('finds the vertical guide under a press on the horizontal one at the crossing', () => {
    expect(crossingGuide({ axis: 'y', at: 450 }, { x: 801, y: 450 }, GUIDES, HIT)).toEqual({
      axis: 'x',
      at: 800,
    });
  });
  it('answers null away from the crossing and with no guide on the other axis', () => {
    expect(crossingGuide({ axis: 'x', at: 800 }, { x: 800, y: 200 }, GUIDES, HIT)).toBeNull();
    expect(
      crossingGuide({ axis: 'x', at: 800 }, { x: 800, y: 450 }, { x: [800], y: [] }, HIT),
    ).toBeNull();
  });
  it('takes the nearer of two guides inside the strip', () => {
    const guides = { x: [800], y: [448, 453] };
    expect(crossingGuide({ axis: 'x', at: 800 }, { x: 800, y: 452 }, guides, HIT)).toEqual({
      axis: 'y',
      at: 453,
    });
  });
});

describe('guideForTravel', () => {
  const pressed = { axis: 'y' as const, at: 450 };
  const crossing = { axis: 'x' as const, at: 800 };
  it('drags nothing under the pick threshold, so a click at a crossing writes nothing', () => {
    expect(guideForTravel(pressed, crossing, 1, 2)).toBeNull();
    expect(guideForTravel(pressed, crossing, GUIDE_PICK_PX - 0.5, 0)).toBeNull();
  });
  it('a horizontal travel moves the vertical guide, whichever was pressed', () => {
    expect(guideForTravel(pressed, crossing, -40, 3)).toEqual(crossing);
    expect(guideForTravel(crossing, pressed, 40, -3)).toEqual(crossing);
  });
  it('a vertical travel moves the horizontal guide', () => {
    expect(guideForTravel(pressed, crossing, 2, 30)).toEqual(pressed);
    expect(guideForTravel(crossing, pressed, -2, -30)).toEqual(pressed);
  });
  it('a diagonal travel goes to the larger delta, ties to the vertical guide', () => {
    expect(guideForTravel(pressed, crossing, 10, 10)).toEqual(crossing);
    expect(guideForTravel(pressed, crossing, 10, 11)).toEqual(pressed);
  });
});

describe('stageOwnsTab (chrome.split.tab-order)', () => {
  const base = {
    selected: true,
    fromControl: false,
    fromOverlay: false,
    inside: true,
    fromPage: false,
  };
  it('leaves a Tab from a chrome control to the browser with and without a selection', () => {
    expect(stageOwnsTab({ ...base, fromControl: true, inside: false })).toBe(false);
    expect(stageOwnsTab({ ...base, selected: false, fromControl: true, inside: false })).toBe(
      false,
    );
  });
  it('walks the objects from the stage and from the body', () => {
    expect(stageOwnsTab(base)).toBe(true);
    expect(stageOwnsTab({ ...base, inside: false, fromPage: true })).toBe(true);
    expect(stageOwnsTab({ ...base, selected: false })).toBe(true);
    expect(stageOwnsTab({ ...base, selected: false, inside: false, fromPage: true })).toBe(true);
  });
  it('keeps the walk from an overlay handle, which is a control outside the stage root', () => {
    expect(stageOwnsTab({ ...base, fromControl: true, fromOverlay: true, inside: false })).toBe(
      true,
    );
  });
  it('with nothing selected, a Tab from elsewhere in the page is the browser’s', () => {
    expect(stageOwnsTab({ ...base, selected: false, inside: false })).toBe(false);
  });
});

describe('drawReadout and its placement (the drawing by drag with the readout)', () => {
  it('shows nothing before the drag, then the stored size, on the grid under Snap to Grid', () => {
    expect(drawReadout([300, 300, 3, 2], false, false)).toBeNull();
    expect(drawReadout([300, 300, 321.6, 199.2], true, false)).toEqual({ w: 322, h: 199 });
    expect(drawReadout([300, 300, 321.6, 199.2], true, true)).toEqual({ w: 320, h: 200 });
  });
  it('reads as the resize readout does', () => {
    expect(sizeLabel(320, 200)).toBe('320 × 200');
  });
  it('sits above the top right of the box, or under it when the box touches the top', () => {
    const k = 0.5;
    expect(drawReadoutStyle([300, 300, 320, 200], k)).toEqual({
      left: 310,
      top: 150 - READOUT_H - READOUT_GAP,
      transform: 'translateX(-100%)',
    });
    expect(drawReadoutStyle([300, 0, 320, 200], k).top).toBe(100 + READOUT_GAP);
  });
});
