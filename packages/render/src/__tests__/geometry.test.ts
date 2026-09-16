// The page geometry (gslides-parity SPEC-5 6.1; R08 3c): `geometry(SHEET)` states the round one
// constants, `geometry({ 1200, 900 })` derives Standard (4:3), the stage root carries the page as
// its two custom properties, and the print stylesheet of the default page is byte identical.
import { describe, expect, it } from 'vitest';

import { CHIPS, CONTENT, SHEET, chipsOf, colsWidths, geometry, slotBoxes } from '../geometry.ts';
import { PRINT_CSS, PRINT_PAGE_PT, printCss, printPagePt } from '../print.ts';
import { pageAttr, renderStage, sheetSizeStyle } from '../stage.ts';
import { DEFAULT_PAGE, PAGE_PRESET_SIZES, contentBox } from '@turboslide/schema/render';
import { layoutSlotBoxes } from '@turboslide/schema/freeform';
import { grid } from '@turboslide/theme/tokens';

describe('geometry(page)', () => {
  it('states the default page as the constants do', () => {
    const g = geometry(DEFAULT_PAGE);
    expect(g.sheet).toEqual({ width: SHEET.width, height: SHEET.height });
    expect(g.content).toEqual(CONTENT);
    expect(g.content).toEqual(contentBox(DEFAULT_PAGE));
    expect(g.chips).toEqual([{ ...CHIPS[0] }, { ...CHIPS[1] }]);
    expect(g.colsWidths('5/7')).toEqual(colsWidths('5/7'));
    expect(g.slotBoxes({ type: 'cols', ratio: '4/8' })).toEqual(
      slotBoxes({ type: 'cols', ratio: '4/8' }),
    );
    const bare = geometry();
    expect(bare.sheet).toEqual(g.sheet);
    expect(bare.content).toEqual(g.content);
    expect(bare.chips).toEqual(g.chips);
  });

  it('derives Standard (4:3): a 926 by 642 content box, the chips at 66, 858 and 1074, 856', () => {
    const page = PAGE_PRESET_SIZES['standard-4-3'];
    const g = geometry(page);
    expect(g.content).toEqual([137, 129, 926, 642]);
    expect(g.chips).toEqual([
      { x: 66, y: 858, w: 40, h: 30 },
      { x: 1074, y: 856, w: 60, h: 28 },
    ]);
    expect(chipsOf(page)).toEqual(g.chips);
    const [left, right] = g.colsWidths('1/1');
    expect([left, right]).toEqual([427, 427]);
    expect(g.slotBoxes({ type: 'cols', ratio: '1/1' })).toEqual({
      left: [137, 129, 427, 642],
      right: [137 + 427 + 72, 129, 427, 642],
    });
    expect(g.slotBoxes({ type: 'stack', gap: 22 })).toEqual({ main: [137, 129, 926, 642] });
  });

  it('agrees with the schema and the theme on every page', () => {
    for (const page of [
      DEFAULT_PAGE,
      PAGE_PRESET_SIZES['standard-4-3'],
      PAGE_PRESET_SIZES['widescreen-16-10'],
      { width: 2400, height: 1350 },
    ]) {
      const g = geometry(page);
      expect(g.content).toEqual([...grid(page).contentBox]);
      expect(g.chips).toEqual(grid(page).chips);
      for (const layout of [
        { type: 'cols', ratio: '5/7' } as const,
        { type: 'split', head: { cols: '4/8' } } as const,
        { type: 'stack', gap: 22 } as const,
      ]) {
        expect(g.slotBoxes(layout)).toEqual(layoutSlotBoxes(layout, page));
      }
    }
  });
});

describe('the stage root carries the page', () => {
  it('writes the two custom properties and data-page for the default page', () => {
    const html = renderStage('<section class="slide is-on"></section>', {
      theme: 'light',
      present: true,
    });
    expect(html).toContain('data-page="1600x900"');
    expect(html).toContain('style="--ts-sheet-w:1600px;--ts-sheet-h:900px"');
    expect(sheetSizeStyle(DEFAULT_PAGE)).toBe('--ts-sheet-w:1600px;--ts-sheet-h:900px');
    expect(pageAttr({ width: 1200, height: 900 })).toBe('1200x900');
  });

  it('writes another page when given one', () => {
    const html = renderStage('', {
      theme: 'dark',
      page: PAGE_PRESET_SIZES['standard-4-3'],
    });
    expect(html).toContain('data-page="1200x900"');
    expect(html).toContain('--ts-sheet-w:1200px;--ts-sheet-h:900px');
  });
});

describe('the print page follows the deck page', () => {
  it('keeps the default print stylesheet byte identical', () => {
    expect(printCss(DEFAULT_PAGE)).toBe(PRINT_CSS);
    expect(printCss()).toBe(PRINT_CSS);
    expect(printPagePt(DEFAULT_PAGE)).toEqual({
      width: PRINT_PAGE_PT.width,
      height: PRINT_PAGE_PT.height,
    });
    expect(PRINT_CSS).toContain('@page { size: 960pt 540pt; margin: 0; }');
    expect(PRINT_CSS).toContain('width: 1600px; height: 900px;');
  });

  it('derives 720 by 540 pt for Standard (4:3)', () => {
    const page = PAGE_PRESET_SIZES['standard-4-3'];
    expect(printPagePt(page)).toEqual({ width: 720, height: 540 });
    const css = printCss(page);
    expect(css).toContain('@page { size: 720pt 540pt; margin: 0; }');
    expect(css).toContain('.ts-page { position: relative; width: 1200px; height: 900px;');
    expect(css).toContain(
      '.ts-page > .ts-sheet { position: absolute; left: 0; top: 0; width: 1200px; height: 900px;',
    );
  });
});
