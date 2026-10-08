import { describe, expect, it } from 'vitest';

import { DEFAULT_MENU_TITLES } from '../default-titles';
import { DEFAULT_MENU_CONTEXT, visibleMenus } from '../model';

describe('the default view menu titles', () => {
  it('are the titles the menu model shows in the default context, in order', () => {
    expect(visibleMenus(DEFAULT_MENU_CONTEXT).map((menu) => menu.label)).toEqual([
      ...DEFAULT_MENU_TITLES,
    ]);
  });
});
