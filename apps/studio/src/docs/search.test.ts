import { describe, expect, it } from 'vitest';

import { excerptOf, rank } from './search';
import type { SearchIndex } from './search';

const INDEX: SearchIndex = {
  rows: [
    {
      u: '/docs/editor',
      t: 'The editor',
      h: 'The editor',
      a: '',
      x: 'The menus and the theme button.',
    },
    {
      u: '/docs/editor',
      t: 'The editor',
      h: 'Modes',
      a: 'modes',
      x: 'Editing, commenting, viewing.',
    },
    {
      u: '/docs/themes',
      t: 'Themes and brand kits',
      h: 'Themes and brand kits',
      a: '',
      x: 'Pick one of nine themes.',
    },
    {
      u: '/docs/themes',
      t: 'Themes and brand kits',
      h: 'Pick a theme',
      a: 'pick-a-theme',
      x: 'Choose Slide > Change theme.',
    },
  ],
};

describe('docs search', () => {
  it('ranks the page whose title matches first, its opening section before its others', () => {
    const hits = rank(INDEX, 'theme');
    expect(hits.map((hit) => `${hit.row.u}#${hit.row.a}`)).toEqual([
      '/docs/themes#',
      '/docs/themes#pick-a-theme',
      '/docs/editor#',
    ]);
  });

  it('needs every word of the query', () => {
    expect(rank(INDEX, 'theme modes')).toEqual([]);
    expect(rank(INDEX, 'editing modes').map((hit) => hit.row.a)).toEqual(['modes']);
  });

  it('answers nothing for an empty query and keeps excerpts short', () => {
    expect(rank(INDEX, '  ')).toEqual([]);
    const long = `${'word '.repeat(40)}target ${'tail '.repeat(40)}`;
    const excerpt = excerptOf(long, ['target']);
    expect(excerpt.length).toBeLessThanOrEqual(121);
    expect(excerpt).toContain('target');
  });
});
