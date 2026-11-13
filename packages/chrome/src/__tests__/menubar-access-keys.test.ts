import { describe, expect, it } from 'vitest';

import { menusWithAccessKeys } from '../MenuBar';
import { assignAccessKeys } from '../menus/keys';
import { MENUS } from '../menus/model';

// The menus with their access keys (the slide motion round): the table is static, and the menu
// bar and the menus key asked for it on every render of the editor, 21 ms of every move of a show
// at 4x CPU. It is built once and kept, with the keys it always had.

describe('menusWithAccessKeys', () => {
  it('builds the access keys once and answers the same table after', () => {
    const first = menusWithAccessKeys();
    expect(menusWithAccessKeys()).toBe(first);
    expect(first.map((menu) => menu.id)).toEqual(MENUS.map((menu) => menu.id));
    MENUS.forEach((menu, i) => {
      expect(first[i]?.items).toEqual(assignAccessKeys(menu.items));
    });
  });
});
