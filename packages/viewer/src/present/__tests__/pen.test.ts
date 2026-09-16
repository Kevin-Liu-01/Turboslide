import { describe, expect, it } from 'vitest';

import type { PresentStroke } from '../presentSync';
import {
  appendPoint,
  drawStrokes,
  mergeStroke,
  newStrokeId,
  PEN_WIDTH_PX,
  toSheetPoint,
} from '../pen';
import type { PenContext } from '../pen';

// The pen's geometry (gslides-parity SPEC-5 0.15): client points to sheet pixels, the stroke's
// points, the merge of a partial stroke, and the drawing on a fake canvas context.
describe('the pen', () => {
  it('maps a client point into sheet pixels against the sheet box', () => {
    expect(toSheetPoint(110, 60, { left: 100, top: 50, width: 800 }, 1600)).toEqual([20, 20]);
    expect(toSheetPoint(900, 50, { left: 100, top: 50, width: 800 }, 1600)).toEqual([1600, 0]);
    // a 4:3 page of 1200 px
    expect(toSheetPoint(400, 50, { left: 100, top: 50, width: 600 }, 1200)).toEqual([600, 0]);
  });

  it('appends points, skipping a point under half a pixel from the last', () => {
    let stroke: PresentStroke = { id: 's', slideId: 'a', done: false, points: [] };
    stroke = appendPoint(stroke, [10, 10]);
    stroke = appendPoint(stroke, [10.2, 10.1]);
    stroke = appendPoint(stroke, [12, 10]);
    expect(stroke.points).toEqual([10, 10, 12, 10]);
  });

  it('merges a partial stroke by id and appends a new one', () => {
    const a: PresentStroke = { id: 'a', slideId: 's', done: false, points: [1, 1] };
    const b: PresentStroke = { id: 'b', slideId: 's', done: true, points: [2, 2, 3, 3] };
    const merged = mergeStroke([a], b);
    expect(merged).toHaveLength(2);
    const grown = mergeStroke(merged, { ...a, done: true, points: [1, 1, 5, 5] });
    expect(grown).toHaveLength(2);
    expect(grown[0]?.points).toEqual([1, 1, 5, 5]);
    expect(newStrokeId()).not.toBe(newStrokeId());
  });

  it('draws every stroke at the sheet scale in the ink handed in', () => {
    const calls: string[] = [];
    const ctx: PenContext = {
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      strokeStyle: '',
      clearRect: (...args) => calls.push(`clear ${args.join(',')}`),
      beginPath: () => calls.push('begin'),
      moveTo: (x, y) => calls.push(`move ${x},${y}`),
      lineTo: (x, y) => calls.push(`line ${x},${y}`),
      stroke: () => calls.push('stroke'),
    };
    drawStrokes(
      ctx,
      { width: 1000, height: 600 },
      [
        { id: 'a', slideId: 's', done: true, points: [0, 0, 100, 50] },
        { id: 'dot', slideId: 's', done: true, points: [10, 10] },
        { id: 'empty', slideId: 's', done: true, points: [] },
      ],
      { left: 100, top: 50, scale: 0.5 },
      '#101010',
    );
    expect(ctx.lineWidth).toBe(PEN_WIDTH_PX * 0.5);
    expect(ctx.strokeStyle).toBe('#101010');
    expect(calls).toEqual([
      'clear 0,0,1000,600',
      'begin',
      'move 100,50',
      'line 150,75',
      'stroke',
      'begin',
      'move 105,55',
      'line 105,55',
      'stroke',
    ]);
  });
});
