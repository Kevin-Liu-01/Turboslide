import { describe, expect, test } from 'vitest';

import { RAW_SVG } from './fixtures.ts';
import { boxToSegment, interWidthEm, parseSvgGeometry } from './svg.ts';

describe('svg geometry', () => {
  test('reads lines, stroked rects, translated groups and text sizes by class', () => {
    const g = parseSvgGeometry(RAW_SVG);
    expect(g.viewBox).toEqual([0, 0, 600, 300]);
    expect(g.segments).toHaveLength(5);
    expect(g.segments[0]).toEqual([100.5, 20, 100.5, 280]);
    expect(g.labels.map((l) => [l.text, l.x, l.y, l.size])).toEqual([
      ['Near', 102, 150, 20],
      ['Far', 310, 150, 20],
      ['Inside', 410, 70, 18],
    ]);
    expect(g.skipped).toBe(0);
  });

  test('follows straight path commands, polylines and anchors; skips rotated subtrees and curves', () => {
    const g = parseSvgGeometry(
      '<svg viewBox="0 0 100 100"><path d="M10 10 H 50 V 40 l 10 10 Z"/><polyline points="0,0 10,0 10,10"/>' +
        '<g transform="rotate(45)"><line x1="0" y1="0" x2="1" y2="1"/><text x="1" y="1">Skip</text></g>' +
        '<path d="M0 0 C 1 1 2 2 30 30"/><rect x="0" y="0" width="10" height="10" fill="var(--plate)"/>' +
        '<text x="50" y="50" text-anchor="middle" font-size="26">Mid</text></svg>',
    );
    expect(g.segments).toHaveLength(4 + 2 + 1);
    expect(g.segments[3]).toEqual([60, 50, 10, 10]);
    expect(g.skipped).toBe(3);
    const mid = g.labels[0];
    expect(mid?.anchor).toBe('middle');
    expect(mid?.box[0]).toBeCloseTo(50 - (interWidthEm('Mid') * 26) / 2, 5);
    expect(interWidthEm('Mid')).toBeCloseTo(1.73, 5);
    expect(interWidthEm('Pull request') * 20).toBeLessThan(120);
    expect(mid?.box[3]).toBe(26);
  });

  test('measures a box to a segment', () => {
    expect(boxToSegment([0, 0, 10, 10], [20, 0, 20, 10])).toBe(10);
    expect(boxToSegment([0, 0, 10, 10], [5, -5, 5, 15])).toBe(0);
  });
});
