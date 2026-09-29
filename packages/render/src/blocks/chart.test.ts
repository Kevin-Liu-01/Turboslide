// The chart block's type scale and label fit (the polish round, docs/POLISH.md item 31;
// audit-objects item 14: at 240 by 140 the category labels read "CateCategory 3" on the sheet,
// in the thumbnail and in the PDF), and the svg's refusal of the browser's text selection (item
// 29). The full size markup is pinned by the render snapshots; these tests read the small box.
import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';

import type { BlockContext } from './context.ts';
import { chartTypeScale, fitCategoryLabels } from './chart.ts';
import { renderBlock } from './render-block.ts';

function context(): BlockContext {
  return {
    slideId: 'charts',
    theme: 'light',
    blockAttrs: true,
    gtWord: true,
    image: () => undefined,
    assetUrl: (path) => path,
    slotWidth: 731.5,
    rasters: [],
    warnings: [],
    rasterCount: 0,
  };
}

const chart = (fields: Record<string, unknown>): Block =>
  ({
    id: 'c',
    type: 'chart',
    kind: 'column',
    categories: ['Category 1', 'Category 2', 'Category 3', 'Category 4'],
    series: [{ name: 'Series 1', values: [40, 460, 20, 0] }],
    pos: { x: 0, y: 0, w: 640, h: 360, z: 0 },
    ...fields,
  }) as Block;

/** The category label texts with their x, y and the width the renderer's own measure gives them. */
function labelBoxes(html: string, size: number): { text: string; x: number; y: number; w: number }[] {
  const group = html.match(/<g class="categories"[^>]*>([\s\S]*?)<\/g>/)?.[1] ?? '';
  return Array.from(group.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>([^<]*)<\/text>/g)).map(
    (match) => ({
      text: match[3] ?? '',
      x: Number(match[1]),
      y: Number(match[2]),
      w: (match[3] ?? '').length * 0.55 * size,
    }),
  );
}

describe('the type scale', () => {
  it('is 1 at and above 640 by 360 and falls with the shorter side to a floor of 0.6', () => {
    expect(chartTypeScale(640, 360)).toBe(1);
    expect(chartTypeScale(1326, 480)).toBe(1);
    expect(chartTypeScale(320, 360)).toBe(0.5 < 0.6 ? 0.6 : 0.5);
    expect(chartTypeScale(480, 270)).toBe(0.75);
    expect(chartTypeScale(240, 140)).toBe(0.6);
  });

  it('writes no inline sizes at full size and inline sizes in a small box', () => {
    const full = renderBlock(chart({ title: 'Words', labels: true }), context());
    expect(full).not.toContain('font-size:');
    const small = renderBlock(
      chart({ title: 'Words', labels: true, pos: { x: 0, y: 0, w: 240, h: 140, z: 0 } }),
      context(),
    );
    /* 18 by 0.6 is 11 for the labels, 20 by 0.6 is 12 for the title, 15 by 0.6 is 9 for the values */
    expect(small).toContain('class="title" data-run="c/title" x="4.8" y="16.8" style="font-size:12px"');
    expect(small).toMatch(/<g class="categories"[^>]*><text [^>]*style="font-size:11px"/);
    expect(small).toMatch(/class="value" [^>]*style="font-size:9px"/);
  });
});

describe('the category labels fitted to their slots (item 31)', () => {
  it('keeps every label that fits and skips every other one when a label needs two slots', () => {
    const fits = fitCategoryLabels(['Jan', 'Feb', 'Mar'], 18, 200, 'width');
    expect(fits).toEqual({ labels: ['Jan', 'Feb', 'Mar'], fit: undefined });
    const two = fitCategoryLabels(['Category 1', 'Category 2', 'Category 3', 'Category 4'], 11, 40, 'width');
    expect(two.labels).toEqual(['Category 1', null, 'Category 3', null]);
    expect(two.fit).toBe('skip');
  });

  it('cuts a label that is still wider than the room it has with an ellipsis', () => {
    const cut = fitCategoryLabels(['A very long category name', 'B'], 18, 100, 'width');
    expect(cut.labels[1]).toBeNull();
    expect(cut.labels[0]).toMatch(/…$/);
    expect(cut.labels[0]?.length ?? 0).toBeLessThan('A very long category name'.length);
    expect(cut.fit).toBe('skip ellipsis');
  });

  it('reads the slot as a height beside a bar chart, one line per label', () => {
    const rows = fitCategoryLabels(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'], 18, 12, 'height');
    /* 18 px lines of 21.6 need two 12 px slots each: every other label */
    expect(rows.labels).toEqual(['Q1', null, 'Q3', null, 'Q5', null]);
    expect(rows.fit).toBe('skip');
  });

  it('draws no two category label boxes that intersect on a column chart at 240 by 140, and every one at 640 by 360', () => {
    const small = renderBlock(chart({ pos: { x: 0, y: 0, w: 240, h: 140, z: 0 } }), context());
    expect(small).toContain('<g class="categories" data-fit="skip">');
    const boxes = labelBoxes(small, 11);
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.length).toBeLessThan(4);
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1)) {
        const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2;
        expect(apart, `${a.text} against ${b.text}`).toBe(true);
      }
    const full = renderBlock(chart({}), context());
    expect(full).toContain('<g class="categories">');
    expect(labelBoxes(full, 18).map((box) => box.text)).toEqual([
      'Category 1',
      'Category 2',
      'Category 3',
      'Category 4',
    ]);
  });

  it('cuts a bar chart’s category label to its gutter', () => {
    const bar = renderBlock(
      chart({
        kind: 'bar',
        categories: ['A very long category name indeed', 'Short'],
        pos: { x: 0, y: 0, w: 300, h: 200, z: 0 },
      }),
      context(),
    );
    const boxes = labelBoxes(bar, Math.round(18 * chartTypeScale(300, 200)));
    expect(boxes[0]?.text).toMatch(/…$/);
    expect(boxes[1]?.text).toBe('Short');
  });
});

describe('the svg and the browser’s selection (item 29)', () => {
  it('takes no text selection over its legend and labels', () => {
    const html = renderBlock(chart({}), context());
    expect(html).toMatch(/<svg [^>]*style="user-select:none"/);
    const shadowed = renderBlock(
      chart({ shadow: { color: 'ink', angle: 45, distance: 4, blur: 8, opacity: 0.3 } }),
      context(),
    );
    expect(shadowed).toMatch(/style="user-select:none;filter:drop-shadow/);
  });
});
