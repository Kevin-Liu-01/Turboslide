import { describe, expect, it } from 'vitest';

import { DEFAULT_MENU_CONTEXT, presentControls } from '../menus/model';
import type { MenuContext } from '../menus/model';
import { TOOLBAR_TAILS, TOOLBAR_TAIL_END, tailEditable, tailFor } from '../menus/toolbar-tails';

// The tail reads the mode (docs/POLISH.md 2.6 item 58; 5.5 `toolbar-tail.test.ts`): the write
// controls draw for a caller with the write capability in Editing mode alone; a reader on the
// editor route and Commenting or Viewing mode get none.
describe('tailEditable', () => {
  const ctx = (over: Partial<MenuContext>): MenuContext => ({ ...DEFAULT_MENU_CONTEXT, ...over });

  it('is true for the owner of a checkout in Editing mode (no capabilities listed)', () => {
    expect(tailEditable(DEFAULT_MENU_CONTEXT)).toBe(true);
  });

  it('is false without the write capability, whatever the mode', () => {
    expect(tailEditable(ctx({ capabilities: ['comment', 'readComments'] }))).toBe(false);
    expect(tailEditable(ctx({ capabilities: [] }))).toBe(false);
  });

  it('is false in Commenting and Viewing mode even with the write capability', () => {
    const settings = DEFAULT_MENU_CONTEXT.settings;
    expect(
      tailEditable(ctx({ capabilities: ['write', 'comment'], settings: { ...settings, mode: 'commenting' } })),
    ).toBe(false);
    expect(
      tailEditable(ctx({ capabilities: ['write', 'comment'], settings: { ...settings, mode: 'viewing' } })),
    ).toBe(false);
    expect(
      tailEditable(ctx({ capabilities: ['write', 'comment'], settings: { ...settings, mode: 'editing' } })),
    ).toBe(true);
  });
});

// The table tail's Merge and Unmerge draw only with something to merge (docs/POLISH.md 2.6 item
// 74; audit-chrome item 45), and Select draws the plain arrow while the pointer toggle keeps the
// rays (item 72; audit-chrome item 9).
describe('the tail controls of the polish round', () => {
  const table = (over: Partial<MenuContext['selection']>): MenuContext => ({
    ...DEFAULT_MENU_CONTEXT,
    selection: { ...DEFAULT_MENU_CONTEXT.selection, block: 'table', blocks: 1, tableCell: true, ...over },
  });
  const ids = (ctx: MenuContext) => presentControls(tailFor('table'), ctx).map((c) => c.control);

  it('draws no Merge cells or Unmerge cells on the table tail without a cell range or a merged cell', () => {
    const plain = ids(table({}));
    expect(plain).not.toContain('toolbar.mergeCells');
    expect(plain).not.toContain('toolbar.unmergeCells');
  });

  it('draws Merge cells with a cell range and Unmerge cells on a merged cell', () => {
    expect(ids(table({ cells: { r0: 0, c0: 0, r1: 1, c1: 1 } }))).toContain('toolbar.mergeCells');
    expect(ids(table({ merged: true }))).toContain('toolbar.unmergeCells');
  });

  it('draws Select with the plain arrow and the pointer toggle with the rays', () => {
    const select = TOOLBAR_TAILS.default.find((c) => c.control === 'toolbar.select');
    const pointer = TOOLBAR_TAIL_END.find((c) => c.control === 'toolbar.pointer');
    expect(select?.icon).toBe('cursor-arrow');
    expect(pointer?.icon).toBe('cursor-arrow-rays');
  });
});
