import { describe, expect, it } from 'vitest';

import { ICON_NAMES, iconPaths } from '../../packages/chrome/src/icons.tsx';

import { glyphBody, iconMaskRules, iconTable, maskUri, spriteSvg } from './icons.ts';

// The landing's glyphs are the editor's (docs/DESIGN.md 8.0 "Icons"; DR-D4#1): the build reads
// packages/chrome/src/icons.tsx's table from its source text (scripts/home/icons.ts), and this
// pins what it reads against the module itself, name by name and path by path, so a change to the
// table's shape fails here before the page draws another glyph.

describe('the landing reads the editor icon table', () => {
  it('reads every name of icons.tsx with the same paths', () => {
    const table = iconTable();
    expect(Object.keys(table).sort()).toEqual([...ICON_NAMES].sort());
    for (const name of ICON_NAMES) expect(table[name], name).toEqual(iconPaths(name));
  });

  it('draws a mask with every path opaque and a drawn glyph stroked at its width', () => {
    expect(glyphBody('pause', '#000')).toContain('fill="#000"');
    const drawn = glyphBody('line-line', '#000');
    expect(drawn).toContain('fill="none"');
    expect(drawn).toContain('stroke="#000"');
    expect(maskUri('play').startsWith('data:image/svg+xml,')).toBe(true);
    expect(maskUri('play')).not.toMatch(/[<>#"]/);
    expect(iconMaskRules(['pause'])[0]).toMatch(/^\.ts-icon\[data-icon='pause'\] \{/);
  });

  it('writes the sprite as one symbol per name that inherits the text colour', () => {
    const sprite = spriteSvg(['play', 'command-line']);
    expect(sprite.match(/<symbol /g)).toHaveLength(2);
    expect(sprite).toContain('<symbol id="play" viewBox="0 0 20 20">');
    expect(sprite).not.toContain('fill="#');
  });

  it('refuses a name the editor does not draw', () => {
    expect(() => glyphBody('presentation-chart-bar', null)).toThrow(/no glyph named/);
  });
});
