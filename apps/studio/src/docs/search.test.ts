import { describe, expect, it } from 'vitest';

import { clean, excerptOf, rank } from './search';
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

  // post-deploy review (looks.md): a search for "slide" put "Objects on a slide" and its block.*
  // sections above the Slides page, and snippets read as raw Markdown table text
  it('ranks a page whose title is the word above a longer title and above sections', () => {
    const reference: SearchIndex = {
      rows: [
        { u: '/docs/editor', t: 'The editor', h: 'The editor', a: '', x: 'Add a slide.' },
        {
          u: '/docs/reference/block',
          t: 'Objects on a slide',
          h: 'Objects on a slide',
          a: '',
          x: 'Every block action.',
        },
        {
          u: '/docs/reference/block',
          t: 'Objects on a slide',
          h: 'block.add',
          a: 'block-add',
          x: 'Add a block to a slide.',
        },
        { u: '/docs/reference/slide', t: 'Slides', h: 'Slides', a: '', x: 'Every slide action.' },
        {
          u: '/docs/reference/slide',
          t: 'Slides',
          h: 'slide.new',
          a: 'slide-new',
          x: 'Add a slide.',
        },
      ],
    };
    expect(rank(reference, 'slide').map((hit) => `${hit.row.u}#${hit.row.a}`)).toEqual([
      '/docs/reference/slide#',
      '/docs/reference/block#',
      '/docs/reference/slide#slide-new',
      '/docs/editor#',
      '/docs/reference/block#block-add',
    ]);
  });

  it('reads a section as text: no backticks, column pipes or escapes', () => {
    expect(
      clean('Field Type Required Description `slideId` string yes `layout` object \\| null no'),
    ).toBe('Field Type Required Description slideId string yes layout object | null no');
    expect(clean('Run `turboslide slide transition <slideId> <kind>|none` now.')).toBe(
      'Run turboslide slide transition <slideId> <kind>|none now.',
    );
    expect(clean('| a | b |  <Callout type="note">**Bold** text</Callout> Cmd \\[')).toBe(
      'a b Bold text Cmd [',
    );
  });
});
