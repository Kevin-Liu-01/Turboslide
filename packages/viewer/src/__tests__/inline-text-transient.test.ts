// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { blurVerdictOf } from '../InlineText';

// The menu bar and the menu plates as transient surfaces (docs/RETURN.md 2.14 item 2): a blur
// into a menu bar title or a menu row parks the session and leaves the focus with the menu for
// the keyboard's walk; a field anywhere and the page outside the chrome still end it.
describe('blurVerdictOf on the menu bar and a menu plate', () => {
  it('parks a session for a menu bar title and a menu row without taking the focus back (the keyboard walks the menu)', () => {
    const bar = document.createElement('nav');
    bar.className = 'ts-menubar';
    const titles = document.createElement('div');
    titles.setAttribute('role', 'menubar');
    const title = document.createElement('button');
    titles.appendChild(title);
    bar.appendChild(titles);
    const menu = document.createElement('div');
    menu.className = 'ts-menu';
    menu.setAttribute('role', 'menu');
    const row = document.createElement('div');
    row.setAttribute('role', 'menuitem');
    menu.appendChild(row);
    document.body.append(bar, menu);
    try {
      expect(blurVerdictOf(title)).toBe('park');
      expect(blurVerdictOf(row)).toBe('park');
      const field = document.createElement('input');
      menu.appendChild(field);
      expect(blurVerdictOf(field)).toBe('end');
      expect(blurVerdictOf(document.body)).toBe('end');
    } finally {
      bar.remove();
      menu.remove();
    }
  });
});
